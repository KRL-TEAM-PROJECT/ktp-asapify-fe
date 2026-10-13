import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point, Polygon, Position } from 'geojson';
import type { Basemap, PeatBoundary, PixelIndex, ProvinceBoundary, ProvinceCode, Status, ViirsDetection } from '../types';
import { STATUS_CODE, cellCenter, cellsBounds } from '../lib/grid';
import { PROVINCES } from '../lib/provinces';

// Map layers. Cell geometry is built ONCE from the pixel index; per-slot status, the status filter
// and highlights use feature-state + paint expressions, so playing slots never re-tiles.

export type BasemapId = string; // 'streets' | 'plain' | raster basemap id from the API
export type LayerKey = 'status' | 'peat' | 'provinces' | 'clusters' | 'viirs';
export const LAYER_KEYS: LayerKey[] = ['status', 'clusters', 'peat', 'provinces', 'viirs'];

export interface MapData {
  index: PixelIndex | null;
  clusters: Record<string, number[]>;
  peat: PeatBoundary;
  provinces: ProvinceBoundary;
  viirs: ViirsDetection[];
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };
export const EMPTY: MapData = { index: null, clusters: {}, peat: EMPTY_FC, provinces: EMPTY_FC, viirs: [] };

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const VECTOR = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Base style: OpenFreeMap vector, a raster from the API, or plain (no tiles at all). */
export function styleFor(basemap: BasemapId, dark: boolean, list: Basemap[]): string | StyleSpecification {
  if (basemap === 'streets') return VECTOR[dark ? 'dark' : 'light'];
  const raster = list.find((b) => b.id === basemap);
  const style: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#121815' : '#eef1ec' } }],
  };
  if (raster) {
    style.sources.sat = { type: 'raster', tiles: raster.tiles, tileSize: raster.tile_size, maxzoom: raster.maxzoom, attribution: raster.attribution };
    style.layers.push({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } });
  }
  return style;
}

interface Palette { safe: string; safeOp: number; warning: string; alert: string; ink: string; halo: string; sat: string; hatch: string }
const PALETTE: Record<'light' | 'dark', Palette> = {
  light: { safe: '#3c6a4c', safeOp: 0.16, warning: '#f0c46a', alert: '#c2410c', ink: '#1b2520', halo: '#ffffff', sat: '#2c628c', hatch: '#7d887f' },
  dark: { safe: '#7fbf93', safeOp: 0.13, warning: '#e0a93e', alert: '#f26b2f', ink: '#e4ebe5', halo: '#121815', sat: '#7fb3dc', hatch: '#7d8b83' },
};
// Over satellite imagery, Safe needs a little more weight.
const satSafeOp = 0.28;

// ---------- data conversion ----------

function cellPolygons(ix: PixelIndex | null): FeatureCollection<Polygon, { p: string }> {
  if (!ix) return EMPTY_FC as FeatureCollection<Polygon, { p: string }>;
  const h = ix.step / 2;
  const features: Feature<Polygon, { p: string }>[] = new Array(ix.rows.length);
  for (let i = 0; i < ix.rows.length; i++) {
    const [x, y] = cellCenter(ix, i);
    features[i] = {
      type: 'Feature', id: i, properties: { p: String(ix.province[i]) },
      geometry: { type: 'Polygon', coordinates: [[[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]]] },
    };
  }
  return { type: 'FeatureCollection', features };
}

function clusterShapes(ix: PixelIndex | null, clusters: Record<string, number[]>) {
  const outlines: FeatureCollection<Polygon, { id: string; p: string }> = { type: 'FeatureCollection', features: [] };
  const labels: FeatureCollection<Point, { id: string; p: string }> = { type: 'FeatureCollection', features: [] };
  if (!ix) return { outlines, labels };
  const pad = 0.006;
  for (const [id, cells] of Object.entries(clusters)) {
    if (!cells.length) continue;
    const [[w0, s0], [e0, n0]] = cellsBounds(ix, cells);
    const w = w0 - pad, s = s0 - pad, e = e0 + pad, n = n0 + pad;
    const p = String(ix.province[cells[0]]);
    outlines.features.push({ type: 'Feature', properties: { id, p }, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
    labels.features.push({ type: 'Feature', properties: { id, p }, geometry: { type: 'Point', coordinates: [(w + e) / 2, n] } });
  }
  return { outlines, labels };
}

/** One label point per province: the centre of its largest polygon's box. Names come from the BPS code. */
function provinceLabels(fc: ProvinceBoundary): FeatureCollection<Point, { name: string; code: string }> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      let best = f.geometry.coordinates[0]?.[0] ?? [];
      for (const poly of f.geometry.coordinates) if (poly[0].length > best.length) best = poly[0];
      const xs = best.map((c) => c[0]), ys = best.map((c) => c[1]);
      const c: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      const name = PROVINCES[f.properties.code]?.name ?? f.properties.name;
      return { type: 'Feature' as const, properties: { name, code: f.properties.code }, geometry: { type: 'Point' as const, coordinates: c } };
    }),
  };
}

// Mask: a box much larger than the monitored region, with the selected province as a hole.
const WORLD: Position[] = [[80, -20], [135, -20], [135, 20], [80, 20], [80, -20]];
const ringArea = (r: Position[]) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + (q[0] - p[0]) * (q[1] + p[1]); }, 0);

/** Outline of the selected province, a dimming mask outside it, and its label point. */
function provinceFocus(fc: ProvinceBoundary, code: ProvinceCode | '') {
  const f = code ? fc.features.find((x) => x.properties.code === code) : undefined;
  if (!f) return { line: EMPTY_FC, mask: EMPTY_FC, label: EMPTY_FC };
  // MapLibre recognises holes by a winding order opposite to the outer ring.
  const outer = Math.sign(ringArea(WORLD));
  const holes = f.geometry.coordinates.map(([r]) => (Math.sign(ringArea(r)) === outer ? [...r].reverse() : r));
  return {
    line: { type: 'FeatureCollection' as const, features: [f] },
    mask: {
      type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [WORLD, ...holes] } }],
    },
    label: provinceLabels({ type: 'FeatureCollection', features: [f] }),
  };
}

function viirsPoints(dets: ViirsDetection[]): FeatureCollection<Point, { label: string }> {
  return {
    type: 'FeatureCollection',
    features: dets.map((d) => ({ type: 'Feature', properties: { label: `${d.distance_km.toFixed(1)} km` }, geometry: { type: 'Point', coordinates: [d.lon, d.lat] } })),
  };
}

export function selectionShape(ix: PixelIndex | null, cell: number): FeatureCollection<Polygon> {
  if (!ix || cell < 0) return EMPTY_FC as FeatureCollection<Polygon>;
  const [[w, s], [e, n]] = cellsBounds(ix, [cell]);
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] };
}

// ---------- images (hatching + status icons) ----------

function canvasImage(size: number, draw: (c: CanvasRenderingContext2D) => void): ImageData {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  return ctx.getImageData(0, 0, size, size);
}

function addImages(map: MlMap, p: Palette) {
  const put = (name: string, img: ImageData, pixelRatio = 1) => {
    if (map.hasImage(name)) map.removeImage(name);
    map.addImage(name, img, { pixelRatio });
  };
  put('hatch', canvasImage(8, (c) => {
    c.strokeStyle = p.hatch; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-2, 10); c.lineTo(10, -2); c.moveTo(-2, 2); c.lineTo(2, -2); c.moveTo(6, 10); c.lineTo(10, 6); c.stroke();
  }));
  put('ico-alert', canvasImage(40, (c) => {
    c.fillStyle = '#ffffff'; c.strokeStyle = p.alert; c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(20, 4); c.lineTo(37, 34); c.lineTo(3, 34); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = p.alert; c.fillRect(18.5, 14, 3, 11); c.fillRect(18.5, 27.5, 3, 3);
  }), 2);
  put('ico-warning', canvasImage(40, (c) => {
    c.fillStyle = '#ffffff'; c.strokeStyle = '#7a5200'; c.lineWidth = 2.6;
    c.beginPath(); c.arc(20, 20, 15, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(20, 20, 10, 6, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#7a5200'; c.beginPath(); c.arc(20, 20, 3, 0, Math.PI * 2); c.fill();
  }), 2);
}

// ---------- expressions ----------

const S: ExpressionSpecification = ['coalesce', ['feature-state', 's'], 'S'];
const shown = (statuses: Status[]): ExpressionSpecification => ['in', S, ['literal', statuses.map((s) => STATUS_CODE[s])]];

export interface PaintOpts { dark: boolean; satellite: boolean; statuses: Status[] }

function pixelPaint(o: PaintOpts) {
  const p = PALETTE[o.dark ? 'dark' : 'light'];
  const safeOp = o.satellite ? satSafeOp : p.safeOp;
  return {
    fillColor: ['match', S, 'A', p.alert, 'W', p.warning, p.safe] as ExpressionSpecification,
    fillOpacity: ['case', shown(o.statuses), ['match', S, 'A', 0.95, 'W', 0.82, 'N', 0, safeOp], 0] as ExpressionSpecification,
    hatchOpacity: ['case', ['all', ['==', S, 'N'], shown(o.statuses)], 0.75, 0] as ExpressionSpecification,
    alertIcon: ['case', ['all', ['==', S, 'A'], shown(o.statuses)], 1, 0] as ExpressionSpecification,
    warningIcon: ['case', ['all', ['==', S, 'W'], shown(o.statuses)], 1, 0] as ExpressionSpecification,
  };
}

/** Install every source + layer (on each style.load, including basemap/theme changes). */
export function installLayers(map: MlMap, o: PaintOpts, data: MapData, selectedCell: number, province: ProvinceCode | '') {
  const p = PALETTE[o.dark ? 'dark' : 'light'];
  addImages(map, p);
  const { outlines, labels } = clusterShapes(data.index, data.clusters);
  const focus = provinceFocus(data.provinces, province);
  const pp = pixelPaint(o);

  map.addSource('province-mask', { type: 'geojson', data: focus.mask });
  map.addSource('province-focus', { type: 'geojson', data: focus.line });
  map.addSource('province-focus-label', { type: 'geojson', data: focus.label });
  map.addSource('provinces', { type: 'geojson', data: data.provinces });
  map.addSource('province-labels', { type: 'geojson', data: provinceLabels(data.provinces) });
  map.addSource('pixels', { type: 'geojson', data: cellPolygons(data.index), buffer: 0, tolerance: 0 });
  map.addSource('peat', { type: 'geojson', data: data.peat });
  map.addSource('clusters', { type: 'geojson', data: outlines });
  map.addSource('cluster-labels', { type: 'geojson', data: labels });
  map.addSource('selection', { type: 'geojson', data: selectionShape(data.index, selectedCell) });
  map.addSource('viirs', { type: 'geojson', data: viirsPoints(data.viirs) });

  // Shade outside the selected province: inside stays bright, the surroundings dim.
  map.addLayer({ id: 'province-mask', type: 'fill', source: 'province-mask', paint: { 'fill-color': o.dark ? '#000000' : p.ink, 'fill-opacity': o.dark ? 0.45 : 0.16 } });
  map.addLayer({ id: 'provinces-line', type: 'line', source: 'provinces', paint: { 'line-color': p.ink, 'line-width': 1.1, 'line-opacity': 0.45 } });
  map.addLayer({ id: 'pixel-fill', type: 'fill', source: 'pixels', paint: { 'fill-color': pp.fillColor, 'fill-opacity': pp.fillOpacity } });
  map.addLayer({ id: 'pixel-hatch', type: 'fill', source: 'pixels', paint: { 'fill-pattern': 'hatch', 'fill-opacity': pp.hatchOpacity } });
  map.addLayer({
    id: 'pixel-grid', type: 'line', source: 'pixels', minzoom: 9,
    paint: { 'line-color': p.ink, 'line-width': 0.4, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 11, 0.16] },
  });
  map.addLayer({ id: 'peat-boundary', type: 'line', source: 'peat', paint: { 'line-color': p.ink, 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.5 } });
  map.addLayer({
    id: 'province-focus-casing', type: 'line', source: 'province-focus', layout: { 'line-join': 'round' },
    paint: { 'line-color': p.halo, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 7], 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'province-focus', type: 'line', source: 'province-focus', layout: { 'line-join': 'round' },
    paint: { 'line-color': p.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 10, 3] },
  });
  map.addLayer({ id: 'cluster-glow', type: 'line', source: 'clusters', paint: { 'line-color': p.alert, 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.6 } });
  map.addLayer({ id: 'clusters', type: 'line', source: 'clusters', paint: { 'line-color': p.ink, 'line-width': 1.8, 'line-dasharray': [2.5, 1.5] } });
  map.addLayer({ id: 'clusters-selected', type: 'line', source: 'clusters', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': p.sat, 'line-width': 3.5 } });
  const icon = (id: string, image: string, opacity: ExpressionSpecification) => map.addLayer({
    id, type: 'symbol', source: 'pixels', minzoom: 10,
    layout: {
      'icon-image': image, 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 13, 1],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': opacity },
  });
  icon('icon-warning', 'ico-warning', pp.warningIcon);
  icon('icon-alert', 'ico-alert', pp.alertIcon);
  map.addLayer({ id: 'selection', type: 'line', source: 'selection', paint: { 'line-color': p.sat, 'line-width': 3 } });
  map.addLayer({
    id: 'province-label', type: 'symbol', source: 'province-labels', maxzoom: 8,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 },
    paint: { 'text-color': p.ink, 'text-opacity': 0.6, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
  });
  map.addLayer({
    id: 'province-focus-label', type: 'symbol', source: 'province-focus-label', maxzoom: 9,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
    paint: { 'text-color': p.ink, 'text-halo-color': p.halo, 'text-halo-width': 2 },
  });
  map.addLayer({
    id: 'clusters-label', type: 'symbol', source: 'cluster-labels',
    layout: {
      'text-field': ['get', 'id'], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
      'text-anchor': 'bottom', 'text-offset': [0, -0.4], 'text-allow-overlap': true, 'text-letter-spacing': 0.04,
    },
    paint: { 'text-color': p.ink, 'text-halo-color': p.halo, 'text-halo-width': 2 },
  });
  map.addLayer({ id: 'viirs', type: 'circle', source: 'viirs', minzoom: 9, paint: { 'circle-radius': 5, 'circle-color': p.sat, 'circle-stroke-color': p.halo, 'circle-stroke-width': 1.5 } });
  map.addLayer({
    id: 'viirs-label', type: 'symbol', source: 'viirs', minzoom: 10,
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [0.8, 0] },
    paint: { 'text-color': p.sat, 'text-halo-color': p.halo, 'text-halo-width': 1.4 },
  });
}

export function setStatusPaint(map: MlMap, o: PaintOpts) {
  const pp = pixelPaint(o);
  map.setPaintProperty('pixel-fill', 'fill-opacity', pp.fillOpacity);
  map.setPaintProperty('pixel-hatch', 'fill-opacity', pp.hatchOpacity);
  map.setPaintProperty('icon-alert', 'icon-opacity', pp.alertIcon);
  map.setPaintProperty('icon-warning', 'icon-opacity', pp.warningIcon);
}

const LAYERS_OF: Record<LayerKey, string[]> = {
  status: ['pixel-fill', 'pixel-hatch', 'pixel-grid', 'icon-warning', 'icon-alert'],
  peat: ['peat-boundary'],
  provinces: ['provinces-line', 'province-label'],
  clusters: ['cluster-glow', 'clusters', 'clusters-selected', 'clusters-label'],
  viirs: ['viirs', 'viirs-label'],
};
const LITE_OFF = new Set(['pixel-grid', 'cluster-glow']);

export function applyVisibility(map: MlMap, vis: Record<LayerKey, boolean>, lite: boolean) {
  for (const k of LAYER_KEYS) {
    for (const id of LAYERS_OF[k]) {
      map.setLayoutProperty(id, 'visibility', vis[k] && !(lite && LITE_OFF.has(id)) ? 'visible' : 'none');
    }
  }
}

export function applyFilters(map: MlMap, province: ProvinceCode | '', selectedCluster: string | null) {
  const prov: ExpressionSpecification = province ? ['==', ['get', 'p'], province] : ['boolean', true];
  for (const id of ['pixel-fill', 'pixel-hatch', 'pixel-grid', 'icon-warning', 'icon-alert', 'cluster-glow', 'clusters', 'clusters-label']) {
    map.setFilter(id, prov);
  }
  map.setFilter('clusters-selected', ['==', ['get', 'id'], selectedCluster ?? '']);
  // province-focus-label draws the selected province's label in bold; never draw it twice.
  map.setFilter('province-label', province ? ['!=', ['get', 'code'], province] : null);
}

/** Change the province highlight without reinstalling layers. */
export function updateProvinceFocus(map: MlMap, fc: ProvinceBoundary, province: ProvinceCode | '') {
  const focus = provinceFocus(fc, province);
  updateSource(map, 'province-mask', focus.mask);
  updateSource(map, 'province-focus', focus.line);
  updateSource(map, 'province-focus-label', focus.label);
}

const OWN_SOURCES = new Set(['provinces', 'province-labels', 'province-mask', 'province-focus', 'province-focus-label', 'pixels', 'peat', 'clusters', 'cluster-labels', 'selection', 'viirs']);

/**
 * Vector basemap labels (OpenFreeMap/OpenMapTiles) in English: name:en, falling back to the
 * local OSM name when no translation exists. Road number labels are left alone.
 */
export function localizeBasemap(map: MlMap) {
  const field: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== 'symbol' || OWN_SOURCES.has(l.source)) continue;
    const tf = map.getLayoutProperty(l.id, 'text-field');
    if (tf != null && JSON.stringify(tf).includes('name')) map.setLayoutProperty(l.id, 'text-field', field);
  }
}

export function updateSource(map: MlMap, id: string, data: GeoJSON.GeoJSON) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export const shapes = { cellPolygons, clusterShapes, provinceLabels, viirsPoints };
