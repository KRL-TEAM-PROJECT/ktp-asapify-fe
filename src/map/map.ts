import {
  AttributionControl, FullscreenControl, GeolocateControl, Map as MlMap, NavigationControl, ScaleControl, setWorkerUrl,
  type ControlPosition, type IControl, type LngLatBoundsLike, type LngLatLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Basemap, ProvinceCode, Status } from '../types';
import { REGION } from '../lib/provinces';
import {
  EMPTY, LAYER_KEYS, applyFilters, applyVisibility, installLayers, localizeBasemap, selectionShape, setStatusPaint, shapes, styleFor,
  updateProvinceFocus, updateSource, type BasemapId, type LayerKey, type MapData,
} from './layers';

// MapLibre 6 looks for its worker next to its module file; after Vite bundles it, that file is gone.
// The maplibreWorker plugin in vite.config.ts serves a raw copy.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

export interface MapOptions {
  dark: boolean;
  lite: boolean;
  basemap: BasemapId;
  basemaps: Basemap[];
  onCell(cell: number, at: LngLatLike): void; // -1 = click outside every peat pixel
}

const ALL: Status[] = ['SAFE', 'NO_OBSERVATION', 'WATCH', 'WARNING'];

/** MapLibre wrapper that keeps all state so it can be reinstalled after setStyle. */
export class MapController {
  readonly map: MlMap;
  private dark: boolean;
  private lite: boolean;
  private basemap: BasemapId;
  private basemaps: Basemap[];
  private data: MapData = EMPTY;
  private status: string | null = null; // slot status currently shown
  private applied: string | null = null; // what is already in feature-state
  private statuses: Status[] = ALL;
  private province: ProvinceCode | '' = '';
  private vis: Record<LayerKey, boolean> = { status: true, clusters: true, peat: true, provinces: true, viirs: true };
  private selectedCluster: string | null = null;
  private selectedCell = -1;
  private ready = false;

  constructor(container: HTMLElement, o: MapOptions) {
    this.dark = o.dark;
    this.lite = o.lite;
    this.basemap = o.basemap;
    this.basemaps = o.basemaps;
    this.map = new MlMap({
      container,
      style: styleFor(o.basemap, o.dark, o.basemaps),
      bounds: REGION as LngLatBoundsLike,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      pixelRatio: o.lite ? 1 : window.devicePixelRatio,
      fadeDuration: o.lite ? 0 : 200,
      maxTileCacheSize: o.lite ? 40 : null,
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      validateStyle: false,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.mountControls();

    this.map.on('style.load', () => {
      const satellite = this.basemaps.some((b) => b.id === this.basemap);
      installLayers(this.map, { dark: this.dark, satellite, statuses: this.statuses }, this.data, this.selectedCell, this.province);
      localizeBasemap(this.map);
      applyVisibility(this.map, this.vis, this.lite);
      applyFilters(this.map, this.province, this.selectedCluster);
      this.ready = true;
      this.applied = null;
      this.flushStatus();
    });

    this.map.on('click', (e) => {
      if (!this.ready) return;
      const f = this.map.queryRenderedFeatures(e.point, { layers: ['pixel-fill'] })[0];
      o.onCell(f?.id != null ? Number(f.id) : -1, e.lngLat);
    });
    this.map.on('mouseenter', 'pixel-fill', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'pixel-fill', () => { this.map.getCanvas().style.cursor = ''; });
  }

  // ---------- data ----------

  setData(patch: Partial<MapData>) {
    const prev = this.data;
    this.data = { ...prev, ...patch };
    if (!this.ready) return;
    const d = this.data;
    if (patch.index && patch.index !== prev.index) {
      updateSource(this.map, 'pixels', shapes.cellPolygons(d.index));
      this.applied = null;
    }
    if (patch.index || patch.clusters) {
      const { outlines, labels } = shapes.clusterShapes(d.index, d.clusters);
      updateSource(this.map, 'clusters', outlines);
      updateSource(this.map, 'cluster-labels', labels);
    }
    if (patch.peat) updateSource(this.map, 'peat', d.peat);
    if (patch.provinces) {
      updateSource(this.map, 'provinces', d.provinces);
      updateSource(this.map, 'province-labels', shapes.provinceLabels(d.provinces));
      updateProvinceFocus(this.map, d.provinces, this.province);
    }
    if (patch.viirs) updateSource(this.map, 'viirs', shapes.viirsPoints(d.viirs));
    this.flushStatus();
  }

  /** Status of one slot: one StatusCode per cell. Only cells that changed are rewritten. */
  setStatus(status: string | null) {
    this.status = status;
    this.flushStatus();
  }

  private flushStatus() {
    const next = this.status;
    if (!this.ready || !next || !this.data.index || next.length !== this.data.index.rows.length) return;
    const prev = this.applied;
    for (let i = 0; i < next.length; i++) {
      if (prev === null || prev.charCodeAt(i) !== next.charCodeAt(i)) {
        this.map.setFeatureState({ source: 'pixels', id: i }, { s: next[i] });
      }
    }
    this.applied = next;
  }

  // ---------- display ----------

  setStatusFilter(statuses: Status[]) {
    this.statuses = statuses;
    if (this.ready) setStatusPaint(this.map, { dark: this.dark, satellite: this.isSatellite(), statuses });
  }

  setProvince(province: ProvinceCode | '') {
    this.province = province;
    if (!this.ready) return;
    applyFilters(this.map, province, this.selectedCluster);
    updateProvinceFocus(this.map, this.data.provinces, province);
  }

  private mountControls() {
    const add: [IControl, ControlPosition][] = [
      [new NavigationControl({ showCompass: false }), 'top-right'],
      [new GeolocateControl({ positionOptions: { enableHighAccuracy: false, timeout: 10_000 }, fitBoundsOptions: { maxZoom: 11 } }), 'top-right'],
      [new FullscreenControl(), 'top-right'],
      [new ScaleControl({ unit: 'metric' }), 'bottom-left'],
      [new AttributionControl({ compact: true, customAttribution: '© OpenStreetMap contributors · geoBoundaries' }), 'bottom-right'],
    ];
    for (const [c, pos] of add) this.map.addControl(c, pos);
  }

  setSelectedCluster(id: string | null) {
    this.selectedCluster = id;
    if (this.ready) applyFilters(this.map, this.province, id);
  }

  setSelectedCell(cell: number) {
    this.selectedCell = cell;
    if (this.ready) updateSource(this.map, 'selection', selectionShape(this.data.index, cell));
  }

  setLayer(key: LayerKey, on: boolean) {
    this.vis = { ...this.vis, [key]: on };
    if (this.ready) applyVisibility(this.map, this.vis, this.lite);
  }

  layers(): Record<LayerKey, boolean> { return { ...this.vis }; }

  setLite(lite: boolean) {
    if (lite === this.lite) return;
    this.lite = lite;
    this.map.setPixelRatio(lite ? 1 : window.devicePixelRatio);
    if (this.ready) applyVisibility(this.map, this.vis, lite);
  }

  setBasemap(basemap: BasemapId, dark: boolean, basemaps: Basemap[] = this.basemaps) {
    // Reload the style only when what is shown really changes (every setStyle = download + reinstall every layer).
    const key = (b: BasemapId, d: boolean, list: Basemap[]) => JSON.stringify([b, d, list.find((x) => x.id === b) ?? null]);
    const changed = key(basemap, dark, basemaps) !== key(this.basemap, this.dark, this.basemaps);
    this.basemap = basemap;
    this.dark = dark;
    this.basemaps = basemaps;
    if (!changed) return;
    this.ready = false;
    this.map.setStyle(styleFor(basemap, dark, basemaps), { diff: false });
  }

  private isSatellite() { return this.basemaps.some((b) => b.id === this.basemap); }

  // ---------- camera ----------

  fitBounds(b: LngLatBoundsLike) {
    this.map.fitBounds(b, { padding: 32, duration: this.lite ? 0 : 700, maxZoom: 12 });
  }

  flyTo(center: LngLatLike, zoom = 11.5) {
    if (this.lite) this.map.jumpTo({ center, zoom });
    else this.map.flyTo({ center, zoom, duration: 1000, essential: true });
  }

  resize() { this.map.resize(); }
  destroy() { this.map.remove(); }
}

export { LAYER_KEYS };
export type { BasemapId, LayerKey };
