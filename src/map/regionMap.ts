import {
  AttributionControl, FullscreenControl, Map as MlMap, NavigationControl, ScaleControl, setWorkerUrl,
  type ExpressionSpecification, type LngLatBoundsLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { Hotspot, PeatRegions, ProvinceBoundary, RegionSummary } from '../types';
import { REGION } from '../lib/provinces';
import { localizeBasemap, styleFor, updateSource } from './layers';

// Peat regions of the risk engine: one NASA POWER cell each (outline), the KHG peat inside it (fill by status),
// and the FIRMS hotspots of a verification. Statuses change at most every 15 minutes, so they live in the
// GeoJSON properties; no feature-state bookkeeping.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const PALETTE = {
  light: { SAFE: '#3c6a4c', WARNING: '#e0a93e', ALERT: '#c2410c', NO_OBSERVABLE: '#7d887f', none: '#a7b0a9', ink: '#1b2520', halo: '#ffffff', sel: '#2c628c', hot: '#c2410c' },
  dark: { SAFE: '#7fbf93', WARNING: '#f0b23e', ALERT: '#fb8a5c', NO_OBSERVABLE: '#7d8b83', none: '#56625b', ink: '#e4ebe5', halo: '#121815', sel: '#7fb3dc', hot: '#fb8a5c' },
};
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

function hotspotPoints(list: Hotspot[]): FeatureCollection<Point, { frp: number }> {
  return {
    type: 'FeatureCollection',
    features: list.map((h) => ({ type: 'Feature', properties: { frp: h.frp_mw ?? 1 }, geometry: { type: 'Point', coordinates: [h.lon, h.lat] } })),
  };
}

export class RegionMapController {
  readonly map: MlMap;
  private dark: boolean;
  private readonly lite: boolean;
  private regions: RegionSummary[] = [];
  private peat: PeatRegions = EMPTY;
  private provinces: ProvinceBoundary = EMPTY;
  private hotspots: Hotspot[] = [];
  private selected: string | null = null;
  private ready = false;

  constructor(container: HTMLElement, o: RegionMapOptions) {
    this.dark = o.dark;
    this.lite = o.lite;
    this.map = new MlMap({
      container,
      style: styleFor(o.lite ? 'plain' : 'streets', o.dark),
      bounds: REGION as LngLatBoundsLike,
      fitBoundsOptions: { padding: 24 },
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
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.map.addControl(new AttributionControl({
      compact: true,
      customAttribution: '© OpenStreetMap contributors · KHG peat units (KLHK) · NASA POWER · Weather data by Open-Meteo.com (CC BY 4.0) · NASA FIRMS · geoBoundaries',
    }), 'bottom-right');

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
    this.map.addSource('rg-provinces', { type: 'geojson', data: this.provinces });
    this.map.addSource('rg-cells', { type: 'geojson', data: cells(this.regions) });
    this.map.addSource('rg-peat', { type: 'geojson', data: peatWithStatus(this.peat, this.regions) });
    this.map.addSource('rg-hotspots', { type: 'geojson', data: hotspotPoints(this.hotspots) });

    this.map.addLayer({ id: 'rg-provinces', type: 'line', source: 'rg-provinces', paint: { 'line-color': c.ink, 'line-width': 1, 'line-opacity': 0.35 } });
    this.map.addLayer({
      id: 'cell-fill', type: 'fill', source: 'rg-cells',
      paint: { 'fill-color': color, 'fill-opacity': ['match', S, 'ALERT', 0.18, 'WARNING', 0.14, 0.06] },
    });
    this.map.addLayer({
      id: 'peat-fill', type: 'fill', source: 'rg-peat',
      paint: { 'fill-color': color, 'fill-opacity': ['match', S, 'ALERT', 0.88, 'WARNING', 0.8, 'SAFE', 0.5, 'NO_OBSERVABLE', 0.3, 0.25] },
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
      paint: { 'line-color': c.sel, 'line-width': 3.5 },
    });
    this.map.addLayer({
      id: 'rg-hotspots', type: 'circle', source: 'rg-hotspots',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 3, 50, 7],
        'circle-color': c.hot, 'circle-stroke-color': c.halo, 'circle-stroke-width': 1.2, 'circle-opacity': 0.9,
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

  setHotspots(list: Hotspot[]) {
    this.hotspots = list;
    if (this.ready) updateSource(this.map, 'rg-hotspots', hotspotPoints(list));
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
    this.map.fitBounds(b, { padding: 48, duration: this.lite ? 0 : 700, maxZoom });
  }

  resize() { this.map.resize(); }
  destroy() { this.map.remove(); }
}
