import type { LngLat, PixelIndex, ProvinceCode, Status, StatusCode } from '../types';

export const CODE_STATUS: Record<StatusCode, Status> = { S: 'SAFE', N: 'NO_OBSERVATION', W: 'WATCH', A: 'WARNING' };
export const STATUS_CODE: Record<Status, StatusCode> = { SAFE: 'S', NO_OBSERVATION: 'N', WATCH: 'W', WARNING: 'A' };

/** Combined 0.02° Sumatra + Kalimantan grid; `pixel_id` = p{row}_{col} from this top-left corner (PixelIndex.origin/step). */
export const GRID_ORIGIN: LngLat = [94.9, 6.2];
export const GRID_STEP = 0.02;

/** The grid cell (row, col) holding this coordinate, and its pixel id. */
export function gridCellAt(lon: number, lat: number) {
  const row = Math.floor((GRID_ORIGIN[1] - lat) / GRID_STEP + 1e-9);
  const col = Math.floor((lon - GRID_ORIGIN[0]) / GRID_STEP + 1e-9);
  return { row, col, id: `p${row}_${col}` };
}

/** Pixel centre from id `p{row}_{col}`, or null when the id is invalid. */
export function pixelCenter(id: string): LngLat | null {
  const m = /^p(\d+)_(\d+)$/.exec(id);
  return m ? [GRID_ORIGIN[0] + (Number(m[2]) + 0.5) * GRID_STEP, GRID_ORIGIN[1] - (Number(m[1]) + 0.5) * GRID_STEP] : null;
}

export const NIGHT_SLOTS = 54; // 20:00–04:50 UTC+7 = 13:00–21:50 UTC
export const SLOT_MS = 600_000;

/** Start of the night (13:00 UTC = 20:00 UTC+7) holding this time, in ms. */
export function nightStart(iso: string): number {
  const t = Date.parse(iso);
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13);
  return t >= start ? start : start - 86_400_000;
}

/** UTC+7 date when the night starts, YYYY-MM-DD. */
export const nightOf = (iso: string) => new Date(nightStart(iso)).toISOString().slice(0, 10);

/** Slot index 0–53 within its night; -1 when null. */
export function slotIndex(iso: string | null, start: number): number {
  if (iso == null) return -1;
  return Math.max(-1, Math.min(NIGHT_SLOTS - 1, Math.floor((Date.parse(iso) - start) / SLOT_MS)));
}

export function decodeUtility(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeUtility(values: (number | null)[]): string {
  let bin = '';
  for (const v of values) bin += String.fromCharCode(v == null ? 255 : Math.round(Math.min(1, Math.max(0, v)) * 250));
  return btoa(bin);
}

export const utilityAt = (u: Uint8Array | null, i: number) => (!u || u[i] === 255 ? null : u[i] / 250);

export function cellCenter(ix: PixelIndex, i: number): LngLat {
  return [ix.origin[0] + (ix.cols[i] + 0.5) * ix.step, ix.origin[1] - (ix.rows[i] + 0.5) * ix.step];
}

export const pixelIdOf = (ix: PixelIndex, i: number) => `p${ix.rows[i]}_${ix.cols[i]}`;
export const provinceOf = (ix: PixelIndex, i: number) => String(ix.province[i]) as ProvinceCode;

const lookups = new WeakMap<PixelIndex, Map<number, number>>();
function lookup(ix: PixelIndex) {
  let m = lookups.get(ix);
  if (!m) {
    m = new Map();
    for (let i = 0; i < ix.rows.length; i++) m.set(ix.rows[i] * 100_000 + ix.cols[i], i);
    lookups.set(ix, m);
  }
  return m;
}

/** Index of the peat cell at this coordinate, or -1. */
export function cellAt(ix: PixelIndex, lon: number, lat: number): number {
  const row = Math.floor((ix.origin[1] - lat) / ix.step);
  const col = Math.floor((lon - ix.origin[0]) / ix.step);
  return lookup(ix).get(row * 100_000 + col) ?? -1;
}

export function cellByPixelId(ix: PixelIndex, id: string): number {
  const m = /^p(\d+)_(\d+)$/.exec(id.trim());
  return m ? (lookup(ix).get(Number(m[1]) * 100_000 + Number(m[2])) ?? -1) : -1;
}

/** Bounding box of a set of cells: [[w, s], [e, n]]. */
export function cellsBounds(ix: PixelIndex, cells: number[]): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const i of cells) {
    const [x, y] = cellCenter(ix, i);
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  const h = ix.step / 2;
  return [[w - h, s - h], [e + h, n + h]];
}
