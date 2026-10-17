import {
  AttributionControl, FullscreenControl, Map as MlMap, NavigationControl, Popup, ScaleControl, setWorkerUrl,
  type ExpressionSpecification, type LngLat, type LngLatBoundsLike, type PointLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { DayHot, PeatRegions, ProvinceBoundary, RegionSummary, SatelliteName } from '../types';
import { REGION } from '../lib/provinces';
import { localizeBasemap, styleFor, updateSource } from './layers';

// Peat regions of the risk engine: one NASA POWER cell each (outline), the KHG peat inside it (fill by status),
// the hot pixels both geostationary satellites saw in the open slot and the VIIRS detections beside them.
// Statuses change at most every 15 minutes, so they live in the GeoJSON properties; no feature-state bookkeeping.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

const EMPTY = { type: 'FeatureCollection' as const, features: [] };
// statuses green / yellow / red (styles.css --moss / --amber / --ember)
const PALETTE = {
  light: { SAFE: '#15803D', WARNING: '#CA8A04', ALERT: '#DC2626', NO_OBSERVABLE: '#94A3B8', none: '#CBD5E1', ink: '#1E293B', halo: '#FFFFFF' },
  dark: { SAFE: '#4ADE80', WARNING: '#FACC15', ALERT: '#F87171', NO_OBSERVABLE: '#64748B', none: '#334155', ink: '#F8FAFC', halo: '#0F172A' },
};
// Data marks sit on red, yellow, green and grey fills and on both basemaps, so they use what no fill has: cyan (the
// complement of the Alert red) and the two lightness extremes, each with a rim of the opposite lightness. On every
// status fill and both basemaps one of the two tones reaches at least 4.5:1 (WCAG); the old magenta VIIRS dot had
// 2.1:1 on the dark Alert fill. The same colours in both themes, as styles.css --mk-* for the legend:
// Himawari-9 = cyan square with a dark rim; GK2A = white square ring with dark edges; VIIRS = dark dot with a white ring.
const MARK = { himawari: '#67E8F9', dark: '#0B1220', light: '#FFFFFF' };

/** A square marker at 2x for crisp edges: satellite pixels are drawn as what they are, square footprints. */
function square(size: number, fill: string | null, rings: [string, number][]): ImageData {
  const px = size * 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d')!;
  const outer = Math.max(...rings.map(([, w]) => w)) * 2; // every ring is centred on the same square path
  if (fill) { g.fillStyle = fill; g.fillRect(outer / 2, outer / 2, px - outer, px - outer); }
  for (const [color, width] of rings) { // widest first: a narrower ring on top leaves the wider one as its edges
    g.strokeStyle = color; g.lineWidth = width * 2;
    g.strokeRect(outer / 2, outer / 2, px - outer, px - outer);
  }
  return g.getImageData(0, 0, px, px);
}
const S: ExpressionSpecification = ['coalesce', ['get', 'status'], 'none'];

/** One satellite mark on the map: a hot pixel of a geostationary satellite, or a VIIRS detection near one. */
export interface Mark {
  kind: SatelliteName | 'viirs';
  region: string;
  lat: number;
  lon: number;
  value: number; // pixels: ΔBT above the cell's background, K; VIIRS: minutes from the slot (negative = before)
}

const MARK_LAYERS = ['px-himawari9', 'px-gk2a', 'px-viirs'];
const KIND_ORDER: Record<Mark['kind'], number> = { himawari9: 0, gk2a: 1, viirs: 2 };

export interface RegionMapOptions {
  dark: boolean;
  lite: boolean;
  /** `fromMark`: the click or tap landed on a satellite mark, whose values the tooltip now shows. */
  onSelect(id: string | null, fromMark?: boolean): void;
  /** Tooltip content for a region under the pointer; null = no tooltip. */
  describe(id: string): HTMLElement | null;
  /** Tooltip content for the marks under the pointer or finger (satellites first, strongest first); null = none. */
  describeMarks(marks: Mark[]): HTMLElement | null;
}

type CellProps = { id: string; status: string | null };

function cells(regions: RegionSummary[]): FeatureCollection<Polygon, CellProps> {
  return {
    type: 'FeatureCollection',
    features: regions.map((r) => {
      const [w, s, e, n] = r.bounds;
      return { type: 'Feature', properties: { id: r.id, status: r.status }, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
    }),
  };
}

/** One label point per region, at its cell centre: a polygon label repeats on every tile the cell crosses. */
function labels(regions: RegionSummary[]): FeatureCollection<Point, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: regions.map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })),
  };
}

function peatWithStatus(peat: PeatRegions, regions: RegionSummary[]): FeatureCollection<Polygon | MultiPolygon, CellProps> {
  const status = new Map(regions.map((r) => [r.id, r.status]));
  return {
    type: 'FeatureCollection',
    features: peat.features.map((f) => ({ ...f, properties: { id: f.properties.id, status: status.get(f.properties.id) ?? null } })),
  };
}

const SATS: SatelliteName[] = ['himawari9', 'gk2a'];

type MarkProps = { kind: Mark['kind']; region: string; lat: number; lon: number; value: number };

/** Hot pixels of both satellites in one slot (archive arrays: [lat, lon, ΔBT K]); `kind` is the satellite. */
function pixelPoints(hot: Record<string, DayHot>): FeatureCollection<Point, MarkProps> {
  return {
    type: 'FeatureCollection',
    features: Object.entries(hot).flatMap(([region, h]) => SATS.flatMap((kind) => h[kind].map(([lat, lon, value]) => ({
      type: 'Feature' as const, properties: { kind, region, lat, lon, value },
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    })))),
  };
}

/** VIIRS detections near those pixels (archive arrays: [lat, lon, minutes from the slot]). */
function viirsPoints(hot: Record<string, DayHot>): FeatureCollection<Point, MarkProps> {
  return {
    type: 'FeatureCollection',
    features: Object.entries(hot).flatMap(([region, h]) => h.viirs.map(([lat, lon, value]) => ({
      type: 'Feature' as const, properties: { kind: 'viirs' as const, region, lat, lon, value },
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    }))),
  };
}

const markKey = (m: Mark) => `${m.kind}:${m.lat}:${m.lon}:${m.value}`;

export class RegionMapController {
  readonly map: MlMap;
  private dark: boolean;
  private readonly lite: boolean;
  private regions: RegionSummary[] = [];
  private peat: PeatRegions = EMPTY;
  private provinces: ProvinceBoundary = EMPTY;
  private hot: Record<string, DayHot> = {};
  private selected: string | null = null;
  private hovered: string | null = null; // what the tooltip shows: `r:<region id>` or `m:<marks>`
  private tipNode: HTMLElement | null = null;
  private readonly tip = new Popup({ closeButton: false, closeOnClick: false, className: 'rg-tip', offset: 14, maxWidth: '280px' });
  // a finger needs a wider target than a mouse pointer to hit a 6-14 px mark
  private readonly hitPx = window.matchMedia('(pointer: coarse)').matches ? 14 : 6;
  // what moved last: a mouse (or pen) gets hover tooltips; a finger only taps, and the mouse events a browser makes up
  // after a tap (a move, then an exit once the finger lifts) must neither show nor hide one
  private pointer = 'mouse';
  private ready = false;
  // Framing leaves room for what floats on the map: the legend (top left), the zoom buttons (top right) and the day
  // player (bottom; on phones also the sheet's peek), so no region starts under them.
  private readonly narrow = window.matchMedia('(max-width: 1023px)').matches;
  private readonly inset = this.narrow ? { top: 124, right: 56, bottom: 250, left: 16 } : { top: 132, right: 64, bottom: 168, left: 32 };

  constructor(container: HTMLElement, o: RegionMapOptions) {
    this.dark = o.dark;
    this.lite = o.lite;
    this.map = new MlMap({
      container,
      style: styleFor(o.lite ? 'plain' : 'streets', o.dark),
      bounds: REGION as LngLatBoundsLike,
      fitBoundsOptions: { padding: this.inset },
      attributionControl: false,
      pixelRatio: o.lite ? 1 : window.devicePixelRatio,
      fadeDuration: o.lite ? 0 : 200,
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      validateStyle: false,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    // zoom and full screen form one toolbar (styles.css joins the two groups) at the top right; the legend owns the top left
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new FullscreenControl(), 'top-right');
    // on phones the bottom of the map sits under the sheet, so the credits and the scale join the toolbar's column
    this.map.addControl(new ScaleControl({ unit: 'metric', maxWidth: this.narrow ? 80 : 100 }), this.narrow ? 'top-right' : 'bottom-left');
    this.map.addControl(new AttributionControl({
      compact: true,
      customAttribution: '© OpenStreetMap contributors · KHG peat units (KLHK) · NASA POWER · Weather data by Open-Meteo.com (CC BY 4.0) · NASA FIRMS · geoBoundaries',
    }), this.narrow ? 'top-right' : 'bottom-right');

    // MapLibre opens the compact credits on load and folds them at the first drag; folded from the start, they leave
    // the map clear (the (i) button opens them)
    this.map.once('load', () => {
      const credits = this.map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
      if (credits) { credits.setAttribute('open', ''); credits.classList.remove('maplibregl-compact-show'); }
    });
    this.map.on('style.load', () => {
      this.install();
      localizeBasemap(this.map);
      this.ready = true;
    });
    // A click or tap on a satellite mark shows its values (phones have no hover) and selects its region; anywhere
    // else in a cell selects the cell.
    this.map.on('click', (e) => {
      if (!this.ready) return;
      const marks = this.marksAt(e.point);
      if (marks.length) {
        this.show(`m:${marks.map(markKey).join(',')}`, e.lngLat, () => o.describeMarks(marks));
        o.onSelect(marks[0].region, true);
        return;
      }
      if (this.hovered?.startsWith('m:')) this.leave();
      const f = this.map.queryRenderedFeatures(e.point, { layers: ['cell-fill'] })[0];
      o.onSelect(f ? String(f.properties?.id) : null);
    });
    // Hover tooltip (pointer devices): the marks under the cursor with their readings, else the region under it with
    // its status and what the satellites measured. Marks come first: they sit on top of the cells.
    const box = this.map.getContainer();
    const seen = (e: PointerEvent) => { this.pointer = e.pointerType; };
    box.addEventListener('pointerdown', seen, true);
    box.addEventListener('pointermove', seen, true);
    this.map.on('mouseout', () => { if (this.pointer !== 'touch') this.leave(); }); // off the map, or onto a control
    this.map.on('mousemove', (e) => {
      if (!this.ready || this.pointer === 'touch') return;
      const marks = this.marksAt(e.point);
      if (marks.length) {
        this.show(`m:${marks.map(markKey).join(',')}`, e.lngLat, () => o.describeMarks(marks));
        return;
      }
      const id = this.map.queryRenderedFeatures(e.point, { layers: ['cell-fill'] })[0]?.properties?.id;
      if (id == null) { this.leave(); return; }
      this.show(`r:${id}`, e.lngLat, () => o.describe(String(id)));
    });
  }

  /** The satellite marks within reach of a point on the screen, satellites first, strongest first, VIIRS by time. */
  private marksAt(p: { x: number; y: number }): Mark[] {
    const r = this.hitPx;
    const box: [PointLike, PointLike] = [[p.x - r, p.y - r], [p.x + r, p.y + r]];
    const seen = new Map<string, Mark>();
    for (const f of this.map.queryRenderedFeatures(box, { layers: MARK_LAYERS })) {
      const q = f.properties as MarkProps;
      const m: Mark = { kind: q.kind, region: String(q.region), lat: Number(q.lat), lon: Number(q.lon), value: Number(q.value) };
      seen.set(markKey(m), m);
    }
    return [...seen.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      || (a.kind === 'viirs' ? Math.abs(a.value) - Math.abs(b.value) : b.value - a.value));
  }

  /** Show the tooltip for `key` at `at`, building its content only when what it is about changes. */
  private show(key: string, at: LngLat, build: () => HTMLElement | null) {
    this.map.getCanvas().style.cursor = 'pointer';
    if (key !== this.hovered) {
      this.hovered = key;
      this.tipNode = build();
      if (this.tipNode) this.tip.setDOMContent(this.tipNode);
    }
    if (this.tipNode) this.tip.setLngLat(at).addTo(this.map);
    else this.tip.remove();
  }

  private leave() {
    this.map.getCanvas().style.cursor = '';
    this.tip.remove();
    this.hovered = null;
    this.tipNode = null;
  }

  private install() {
    const c = PALETTE[this.dark ? 'dark' : 'light'];
    const color: ExpressionSpecification = ['match', S, 'SAFE', c.SAFE, 'WARNING', c.WARNING, 'ALERT', c.ALERT, 'NO_OBSERVABLE', c.NO_OBSERVABLE, c.none];
    if (!this.map.hasImage('rg-hatch')) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 8;
      const g = cv.getContext('2d')!;
      g.strokeStyle = c.NO_OBSERVABLE; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
      this.map.addImage('rg-hatch', g.getImageData(0, 0, 8, 8));
    }
    // Himawari-9: a filled cyan square; GK2A: a white ring around it, so pixels both satellites saw read as one mark
    if (!this.map.hasImage('px-h')) this.map.addImage('px-h', square(11, MARK.himawari, [[MARK.dark, 1.5]]), { pixelRatio: 2 });
    if (!this.map.hasImage('px-g')) this.map.addImage('px-g', square(20, null, [[MARK.dark, 4.5], [MARK.light, 2.5]]), { pixelRatio: 2 });
    this.map.addSource('rg-provinces', { type: 'geojson', data: this.provinces });
    this.map.addSource('rg-cells', { type: 'geojson', data: cells(this.regions) });
    this.map.addSource('rg-labels', { type: 'geojson', data: labels(this.regions) });
    this.map.addSource('rg-peat', { type: 'geojson', data: peatWithStatus(this.peat, this.regions) });
    this.map.addSource('rg-pixels', { type: 'geojson', data: pixelPoints(this.hot) });
    this.map.addSource('rg-viirs', { type: 'geojson', data: viirsPoints(this.hot) });

    this.map.addLayer({ id: 'rg-provinces', type: 'line', source: 'rg-provinces', paint: { 'line-color': c.ink, 'line-width': 1, 'line-opacity': 0.35 } });
    this.map.addLayer({
      id: 'cell-fill', type: 'fill', source: 'rg-cells',
      paint: { 'fill-color': color, 'fill-opacity': ['match', S, 'ALERT', 0.16, 'WARNING', 0.12, 0.05] },
    });
    // areas are tinted, signals saturated: a quiet (SAFE) region recedes, a hot one stands out
    this.map.addLayer({
      id: 'peat-fill', type: 'fill', source: 'rg-peat',
      paint: { 'fill-color': color, 'fill-opacity': ['match', S, 'ALERT', 0.85, 'WARNING', 0.7, 'SAFE', 0.35, 'NO_OBSERVABLE', 0.25, 0.2] },
    });
    this.map.addLayer({
      id: 'peat-hatch', type: 'fill', source: 'rg-peat', filter: ['==', S, 'NO_OBSERVABLE'],
      paint: { 'fill-pattern': 'rg-hatch', 'fill-opacity': 0.9 },
    });
    this.map.addLayer({
      id: 'cell-line', type: 'line', source: 'rg-cells',
      paint: { 'line-color': color, 'line-width': ['match', S, 'ALERT', 2, 'WARNING', 1.6, 0.8], 'line-opacity': 0.7 },
    });
    this.map.addLayer({
      id: 'cell-selected', type: 'line', source: 'rg-cells', filter: ['==', ['get', 'id'], this.selected ?? ''],
      paint: { 'line-color': c.ink, 'line-width': 3 },
    });
    const marker = (id: string, sat: SatelliteName, image: string) => this.map.addLayer({
      id, type: 'symbol', source: 'rg-pixels', filter: ['==', ['get', 'kind'], sat],
      layout: {
        'icon-image': image, 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 10, 1.3],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    });
    marker('px-gk2a', 'gk2a', 'px-g');
    marker('px-himawari9', 'himawari9', 'px-h');
    // VIIRS (375 m) as small dark dots in a white ring: a different shape and lightness from the 2-4 km squares
    this.map.addLayer({
      id: 'px-viirs', type: 'circle', source: 'rg-viirs',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 10, 4.5],
        'circle-color': MARK.dark, 'circle-stroke-color': MARK.light,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 10, 2],
      },
    });
    this.map.addLayer({
      id: 'cell-label', type: 'symbol', source: 'rg-labels', minzoom: 7.5,
      layout: { 'text-field': ['get', 'id'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': false },
      paint: { 'text-color': c.ink, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    });
  }

  setRegions(regions: RegionSummary[]) {
    this.regions = regions;
    if (this.hovered?.startsWith('r:')) this.hovered = null; // the next pointer move redraws it with the new data
    if (!this.ready) return;
    updateSource(this.map, 'rg-cells', cells(regions));
    updateSource(this.map, 'rg-labels', labels(regions));
    updateSource(this.map, 'rg-peat', peatWithStatus(this.peat, regions));
  }

  setPeat(peat: PeatRegions) {
    this.peat = peat;
    if (this.ready) updateSource(this.map, 'rg-peat', peatWithStatus(peat, this.regions));
  }

  setProvinces(fc: ProvinceBoundary) {
    this.provinces = fc;
    if (this.ready) updateSource(this.map, 'rg-provinces', fc);
  }

  /** Hot pixels and VIIRS of the open slot, per region. */
  setPixels(hot: Record<string, DayHot>) {
    this.hot = hot;
    if (this.hovered?.startsWith('m:')) this.leave(); // those marks may be gone in the new slot
    if (!this.ready) return;
    updateSource(this.map, 'rg-pixels', pixelPoints(hot));
    updateSource(this.map, 'rg-viirs', viirsPoints(hot));
  }

  setSelected(id: string | null) {
    this.selected = id;
    if (this.ready) this.map.setFilter('cell-selected', ['==', ['get', 'id'], id ?? '']);
  }

  setTheme(dark: boolean) {
    if (dark === this.dark) return;
    this.dark = dark;
    this.ready = false;
    this.map.setStyle(styleFor(this.lite ? 'plain' : 'streets', dark), { diff: false });
  }

  fitBounds(b: LngLatBoundsLike, maxZoom = 9) {
    this.map.fitBounds(b, { padding: this.inset, duration: this.lite ? 0 : 700, maxZoom });
  }

  resize() { this.map.resize(); }
  destroy() { this.tip.remove(); this.map.remove(); }
}
