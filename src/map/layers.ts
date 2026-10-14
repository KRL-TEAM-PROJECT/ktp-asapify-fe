import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';

// Basemap styles and source helpers for the region map (see regionMap.ts).

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const VECTOR = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Base style: OpenFreeMap vector ('streets') or plain (no tiles at all). */
export function styleFor(basemap: 'streets' | 'plain', dark: boolean): string | StyleSpecification {
  if (basemap === 'streets') return VECTOR[dark ? 'dark' : 'light'];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#0F172A' : '#F1F5F9' } }],
  };
}

const OWN_SOURCES = new Set(['rg-provinces', 'rg-cells', 'rg-peat', 'rg-pixels', 'rg-viirs']);

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
