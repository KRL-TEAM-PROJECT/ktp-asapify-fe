import {
  AttributionControl, FullscreenControl, Map as MlMap, NavigationControl, ScaleControl, setWorkerUrl,
  type ExpressionSpecification, type LngLatBoundsLike,
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
// brand manual: Canopy Emerald = SAFE, Warning Ochre = WARNING, Thermal Amber = ALERT and heat marks, Peat Charcoal = ink
const PALETTE = {
  light: { SAFE: '#1B4D3E', WARNING: '#D97706', ALERT: '#EA580C', NO_OBSERVABLE: '#94A3B8', none: '#CBD5E1', ink: '#1E293B', halo: '#FFFFFF', hot: '#EA580C' },
  dark: { SAFE: '#5FA88A', WARNING: '#F59E0B', ALERT: '#FB8B55', NO_OBSERVABLE: '#64748B', none: '#334155', ink: '#F8FAFC', halo: '#0F172A', hot: '#FB8B55' },
};

/** A square marker at 2x for crisp edges: satellite pixels are drawn as what they are, square footprints. */
function square(size: number, fill: string | null, stroke: string, width: number): ImageData {
  const px = size * 2, w = width * 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d')!;
  if (fill) { g.fillStyle = fill; g.fillRect(w / 2, w / 2, px - w, px - w); }
  g.strokeStyle = stroke; g.lineWidth = w;
  g.strokeRect(w / 2, w / 2, px - w, px - w);
  return g.getImageData(0, 0, px, px);
}
const S: ExpressionSpecification = ['coalesce', ['get', 'status'], 'none'];

export interface RegionMapOptions {
  dark: boolean;
  lite: boolean;
  onSelect(id: string | null): void;
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

function peatWithStatus(peat: PeatRegions, regions: RegionSummary[]): FeatureCollection<Polygon | MultiPolygon, CellProps> {
  const status = new Map(regions.map((r) => [r.id, r.status]));
  return {
    type: 'FeatureCollection',
    features: peat.features.map((f) => ({ ...f, properties: { id: f.properties.id, status: status.get(f.properties.id) ?? null } })),
  };
}

const SATS: SatelliteName[] = ['himawari9', 'gk2a'];

/** Hot pixels of both satellites in one slot (archive arrays: [lat, lon, ΔBT K]). */
function pixelPoints(hot: Record<string, DayHot>): FeatureCollection<Point, { sat: SatelliteName; k: number }> {
  return {
    type: 'FeatureCollection',
    features: Object.values(hot).flatMap((h) => SATS.flatMap((sat) => h[sat].map(([lat, lon, k]) => ({
      type: 'Feature' as const, properties: { sat, k }, geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    })))),
  };
}

/** VIIRS detections near those pixels (archive arrays: [lat, lon, minutes from the slot]). */
function viirsPoints(hot: Record<string, DayHot>): FeatureCollection<Point, { min: number }> {
  return {
    type: 'FeatureCollection',
    features: Object.values(hot).flatMap((h) => h.viirs.map(([lat, lon, min]) => ({
      type: 'Feature' as const, properties: { min }, geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    }))),
  };
}

export class RegionMapController {
  readonly map: MlMap;
  private dark: boolean;
  private readonly lite: boolean;
  private regions: RegionSummary[] = [];
  private peat: PeatRegions = EMPTY;
  private provinces: ProvinceBoundary = EMPTY;
  private hot: Record<string, DayHot> = {};
  private selected: string | null = null;
  private ready = false;
  // phones: the day player and the sheet's peek cover the bottom of the map, so framing leaves room for them
  private readonly narrow = window.matchMedia('(max-width: 1023px)').matches;
  private readonly inset = this.narrow ? { top: 16, right: 56, bottom: 250, left: 16 } : null;

  constructor(container: HTMLElement, o: RegionMapOptions) {
    this.dark = o.dark;
    this.lite = o.lite;
    this.map = new MlMap({
      container,
      style: styleFor(o.lite ? 'plain' : 'streets', o.dark),
      bounds: REGION as LngLatBoundsLike,
      fitBoundsOptions: { padding: this.inset ?? 24 },
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
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new FullscreenControl(), 'top-right');
    // on phones the bottom of the map sits under the sheet, so the credits and the scale move to the top
    this.map.addControl(new ScaleControl({ unit: 'metric' }), this.narrow ? 'top-left' : 'bottom-left');
    this.map.addControl(new AttributionControl({
      compact: true,
      customAttribution: '© OpenStreetMap contributors · KHG peat units (KLHK) · NASA POWER · Weather data by Open-Meteo.com (CC BY 4.0) · NASA FIRMS · geoBoundaries',
    }), this.narrow ? 'top-left' : 'bottom-right');

    this.map.on('style.load', () => {
      this.install();
      localizeBasemap(this.map);
      this.ready = true;
    });
    this.map.on('click', (e) => {
      if (!this.ready) return;
      const f = this.map.queryRenderedFeatures(e.point, { layers: ['cell-fill'] })[0];
      o.onSelect(f ? String(f.properties?.id) : null);
    });
    this.map.on('mouseenter', 'cell-fill', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'cell-fill', () => { this.map.getCanvas().style.cursor = ''; });
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
    // Himawari-9: a filled heat square; GK2A: an open square around it, so pixels both satellites saw read as one mark
    if (!this.map.hasImage('px-h')) this.map.addImage('px-h', square(10, c.hot, c.ink, 1.5), { pixelRatio: 2 });
    if (!this.map.hasImage('px-g')) this.map.addImage('px-g', square(16, null, c.ink, 1.5), { pixelRatio: 2 });
    this.map.addSource('rg-provinces', { type: 'geojson', data: this.provinces });
    this.map.addSource('rg-cells', { type: 'geojson', data: cells(this.regions) });
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
      id, type: 'symbol', source: 'rg-pixels', filter: ['==', ['get', 'sat'], sat],
      layout: {
        'icon-image': image, 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 10, 1.3],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    });
    marker('px-gk2a', 'gk2a', 'px-g');
    marker('px-himawari9', 'himawari9', 'px-h');
    // VIIRS (375 m) as small heat dots: a different shape from the 2-4 km geostationary squares
    this.map.addLayer({
      id: 'px-viirs', type: 'circle', source: 'rg-viirs',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 4],
        'circle-color': c.hot, 'circle-stroke-color': c.halo, 'circle-stroke-width': 1.2,
      },
    });
    this.map.addLayer({
      id: 'cell-label', type: 'symbol', source: 'rg-cells', minzoom: 7.5,
      layout: { 'text-field': ['get', 'id'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-allow-overlap': false },
      paint: { 'text-color': c.ink, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    });
  }

  setRegions(regions: RegionSummary[]) {
    this.regions = regions;
    if (!this.ready) return;
    updateSource(this.map, 'rg-cells', cells(regions));
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
    this.map.fitBounds(b, { padding: this.inset ?? 48, duration: this.lite ? 0 : 700, maxZoom });
  }

  resize() { this.map.resize(); }
  destroy() { this.map.remove(); }
}
