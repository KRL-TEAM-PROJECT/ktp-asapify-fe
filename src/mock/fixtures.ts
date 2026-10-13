import {
  ApiError,
  type Api, type AttrDetail, type AttrKey, type Attributes, type Basemap, type ClusterDetail, type ClusterSummary, type Decision, type EvidenceImg, type Grid,
  type GridCompact, type LngLat, type Meta, type Neighbour, type NeighbourDir, type NightCompact, type NightSummary,
  type PeatBoundary, type PixelIndex, type ProvinceBoundary, type ProvinceCode, type SeriesPoint, type Status, type StatusCode,
  type VerificationDetail, type ViirsDetection,
} from '../types';
import { T_ALERT, T_WARNING, utility } from '../lib/maut';
import { bearingDeg, destination } from '../lib/geo';
import { GRID_ORIGIN, GRID_STEP, NIGHT_SLOTS, SLOT_MS, STATUS_CODE, encodeUtility, nightOf } from '../lib/grid';
import { rand } from './rand';
import { ATTR_SCALES, attributeDetails, buildThermal, cropCell, himawariImageUrl, rawFromU } from './thermal';
import { currentScenario, type Scenario } from './scenario';

// FICTIONAL data for a demo without a backend: a 24 Sep 2023 replay over Sumatra + Kalimantan peat
// (15 provinces; Central Kalimantan = BACKTEST_BBOX 113.5,-2.6,114.3,-1.9). Shapes follow backend.html + FE proposals.
// Archive nights 16 Feb–24 Sep 2023 open from the calendar in the slot player.

const AS_OF = '2023-09-24T15:10:00Z'; // 22:10 UTC+7
const ARCHIVE_FIRST = '2023-02-16'; // the GK2A archive on NOAA starts here; ALERT needs both satellites
const OUTAGES = new Set(['2023-04-11', '2023-07-02', '2023-08-19']); // nights without data (fictional outages)
const STEP = GRID_STEP;
const ORIGIN = GRID_ORIGIN; // combined Sumatra + Kalimantan grid

/** Roughly irregular polygon around a centre (deterministic). */
function blob([cx, cy]: LngLat, r: number, seed: number): LngLat[] {
  const ring: LngLat[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const rr = r * (0.7 + 0.5 * rand(seed, k, 3));
    ring.push([cx + rr * Math.cos(a), cy + rr * 0.8 * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return ring;
}

// FICTIONAL peat areas, one per province, placed over that province's real peat region
// (e.g. Sebangau, OKI, Kampar Peninsula, Berbak, Rawa Tripa, Kubu Raya, Mahakam lakes).
const AREAS: { code: ProvinceCode; rings: LngLat[][] }[] = [
  { code: '11', rings: [blob([96.62, 3.97], 0.1, 11)] }, // Rawa Tripa, Nagan Raya
  { code: '12', rings: [blob([99.95, 2.45], 0.12, 12)] }, // Labuhanbatu
  { code: '13', rings: [blob([99.78, 0.1], 0.07, 13)] }, // Pasaman Barat
  { code: '14', rings: [blob([102.75, 0.35], 0.3, 14)] }, // Kampar Peninsula
  { code: '15', rings: [blob([104.0, -1.35], 0.2, 15)] }, // Berbak, Tanjung Jabung Timur
  { code: '16', rings: [blob([105.6, -3.35], 0.28, 16)] }, // Ogan Komering Ilir
  { code: '17', rings: [blob([101.2, -2.55], 0.07, 17)] }, // Mukomuko
  { code: '18', rings: [blob([105.55, -4.25], 0.15, 18)] }, // Rawa Pitu, Tulang Bawang
  { code: '19', rings: [blob([106.05, -2.15], 0.08, 19)] }, // Bangka
  { code: '21', rings: [blob([104.6, -0.18], 0.06, 21)] }, // Lingga
  { code: '61', rings: [blob([109.55, -0.35], 0.25, 61)] }, // Kubu Raya
  {
    code: '62', // Sebangau–Kahayan (Central Kalimantan backtest)
    rings: [
      [[113.55, -1.95], [113.80, -1.93], [113.98, -2.05], [114.00, -2.30], [113.88, -2.42],
        [113.70, -2.50], [113.56, -2.35], [113.52, -2.15], [113.55, -1.95]],
      [[114.05, -2.30], [114.25, -2.28], [114.29, -2.45], [114.22, -2.58], [114.06, -2.57],
        [114.02, -2.45], [114.05, -2.30]],
    ],
  },
  { code: '63', rings: [blob([115.18, -2.42], 0.09, 63)] }, // Hulu Sungai swamps
  { code: '64', rings: [blob([116.3, -0.35], 0.15, 64)] }, // Mahakam lakes
  { code: '65', rings: [blob([117.25, 3.3], 0.1, 65)] }, // Tana Tidung
];

// ---------- util ----------

const r2 = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

function inPoly([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Combined 0.02° grid index (origin 94.9° E, 6.2° N). */
function cell([lon, lat]: LngLat) {
  return { row: Math.round((ORIGIN[1] - lat) / STEP - 0.5), col: Math.round((lon - ORIGIN[0]) / STEP - 0.5) };
}
const pixelId = (p: LngLat) => { const { row, col } = cell(p); return `p${row}_${col}`; };

const DIRS: NeighbourDir[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
function gibsUrl([lon, lat]: LngLat, day: string, sat = 'NOAA20'): string {
  const p = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0',
    LAYERS: `VIIRS_${sat}_CorrectedReflectance_TrueColor`, CRS: 'EPSG:4326',
    BBOX: [lat - 0.2, lon - 0.2, lat + 0.2, lon + 0.2].map((v) => v.toFixed(3)).join(','),
    WIDTH: '512', HEIGHT: '512', FORMAT: 'image/jpeg', TIME: day,
  });
  return `${GIBS}?${p}`;
}

// ---------- 3-night utility series ----------

interface Night { date: string; from: number; to: number; end?: number; peakAt?: number; clouds?: [number, number][] }

const SERIES_END = 47; // the detail series stops at 03:50 UTC+7 (see UtilityChart)

function buildSeries(nights: Night[], seed: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  nights.forEach((n, ni) => {
    const end = n.end ?? SERIES_END;
    const peak = n.peakAt ?? end;
    const t0 = Date.parse(`${n.date}T13:00:00Z`); // 20:00 UTC+7
    for (let i = 0; i <= end; i++) {
      const slot = iso(t0 + i * 600_000);
      if (n.clouds?.some(([a, b]) => i >= a && i <= b)) {
        out.push({ slot, U: null, status: 'NO_OBSERVABLE' });
        continue;
      }
      const noise = (rand(ni, i, seed) - 0.5) * 0.05;
      const U = r2(clamp01(i === peak ? n.to : i < peak ? n.from + ((n.to - n.from) * i) / peak + noise : n.to - 0.05 + noise));
      out.push({ slot, U, status: U >= T_ALERT ? 'ALERT' : U >= T_WARNING ? 'WARNING' : 'SAFE' });
    }
  });
  return out;
}

// ---------- clusters ----------

interface ClusterDef {
  id: string;
  heat: number;
  state?: 'closed'; // default active
  province: ProvinceCode;
  pixels: LngLat[];
  attrs: Attributes;
  neighbours: Neighbour['state'][]; // DIRS order
  trigger: string;
  nights: Night[];
  verification: VerificationDetail;
}

/** The agent's first two tool calls (pixel context + VIIRS FIRMS). */
function firstCalls(c: LngLat, asOf: string, ms: number) {
  return [
    { tool: 'get_pixel_context', args: { pixel_id: pixelId(c), as_of: asOf }, duration_ms: 180, ok: true },
    { tool: 'get_latest_viirs', args: { lat: c[1], lon: c[0], as_of: asOf, radius_km: 10, hours: 48 }, duration_ms: ms, ok: true },
  ];
}

const C002: LngLat[] = [[113.91, -2.21], [113.93, -2.21], [113.91, -2.23], [113.93, -2.19]];
const C001: LngLat[] = [[114.13, -2.45], [114.15, -2.45], [114.13, -2.47]];
const C923: LngLat[] = [[113.67, -2.05], [113.69, -2.05], [113.71, -2.05], [113.67, -2.07], [113.69, -2.07], [113.69, -2.03]];
const C003: LngLat[] = [[105.61, -3.35], [105.63, -3.35], [105.65, -3.35], [105.61, -3.37], [105.63, -3.37]]; // OKI, South Sumatra
const C004: LngLat[] = [[102.75, 0.35], [102.77, 0.35], [102.75, 0.33]]; // Kampar, Riau
const C915: LngLat[] = [[109.55, -0.35], [109.57, -0.35], [109.55, -0.37], [109.57, -0.33]]; // Kubu Raya, West Kalimantan (archive)
const T915 = '2023-09-15T16:30:00Z';

const DEFS: ClusterDef[] = [
  {
    id: 'C-0924-002',
    heat: 1, // how wide and strong the hot spot in the thermal image is (0–1)
    province: '62',
    pixels: C002,
    attrs: { u_H: 1.0, u_G: 1.0, u_LST: 0.5, u_SAT: 0.0, u_T: 0.67 },
    neighbours: ['normal', 'anomaly', 'non_peat', 'normal', 'anomaly', 'cloud', 'normal', 'anomaly'],
    trigger: AS_OF,
    nights: [
      { date: '2023-09-22', from: 0.16, to: 0.29, clouds: [[20, 30]] },
      { date: '2023-09-23', from: 0.28, to: 0.48, clouds: [[5, 9]] },
      { date: '2023-09-24', from: 0.45, to: 0.73, end: 13 },
    ],
    verification: {
      result: 'strong_evidence', smoke_visible: true, viirs_within_2km_48h: 1, tool_calls: 5, at: '2023-09-24T15:14:00Z',
      evidence: [
        { source: 'rule_engine', finding: 'U 0.73; 3/8 neighbours U0 ≥ 0.5; Himawari + GK2A agree', observed_at: AS_OF, age_h: 0 },
        { source: 'viirs_firms', finding: '1 NOAA-20 VIIRS detection at 1.4 km (nominal confidence)', observed_at: '2023-09-23T18:42:00Z', age_h: 20.5 },
        { source: 'viirs_image', finding: 'Thin smoke drifting north-west, starting ≤ 5 km from the marker', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7 },
        { source: 'himawari_image', finding: 'Bright B07 spot on the marker', observed_at: AS_OF, age_h: 0 },
      ],
      summary: 'Strong evidence. Thin smoke is visible in the NOAA-20 VIIRS image of 24 Sep, originating within 5 km of the coordinate, and 1 VIIRS detection lies 1.4 km away within 48 hours.',
      tool_trace: [
        ...firstCalls(C002[0], AS_OF, 2310),
        { tool: 'fetch_viirs_image', args: { lat: -2.21, lon: 113.92, as_of: AS_OF }, duration_ms: 3420, ok: true },
        { tool: 'fetch_himawari_image', args: { lat: -2.21, lon: 113.92, as_of: AS_OF, mode: 'thermal' }, duration_ms: 2890, ok: true },
        { tool: 'save_verification', args: { result: 'strong_evidence', viirs_within_2km_48h: 1 }, duration_ms: 95, ok: true },
      ],
      images: [
        { source: 'viirs_image', url: gibsUrl([113.92, -2.21], '2023-09-24'), layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7, marker_drawn: false },
        { source: 'himawari_image', url: '', layer: 'Himawari-9 B07', observed_at: AS_OF, age_h: 0, marker_drawn: false },
      ],
      viirs: [
        { src: 'VIIRS_NOAA20_SP', time_utc: '2023-09-23T18:42:00Z', distance_km: 1.4, confidence: 'n', frp: 3.2, lat: -2.198, lon: 113.932 },
        { src: 'VIIRS_SNPP_SP', time_utc: '2023-09-24T06:05:00Z', distance_km: 6.8, confidence: 'l', frp: 1.9, lat: -2.17, lon: 113.975 },
      ],
    },
  },
  {
    id: 'C-0924-001',
    heat: 0.3, // how wide and strong the hot spot in the thermal image is (0–1)
    province: '62',
    pixels: C001,
    attrs: { u_H: 1.0, u_G: 0.85, u_LST: 0.4, u_SAT: 0.2, u_T: 1.0 },
    neighbours: ['normal', 'normal', 'normal', 'normal', 'anomaly', 'normal', 'anomaly', 'non_peat'],
    trigger: AS_OF,
    nights: [
      { date: '2023-09-22', from: 0.18, to: 0.33, clouds: [[38, 47]] },
      { date: '2023-09-23', from: 0.24, to: 0.42 },
      { date: '2023-09-24', from: 0.4, to: 0.71, end: 13, clouds: [[2, 4]] },
    ],
    verification: {
      result: 'inconclusive', smoke_visible: false, viirs_within_2km_48h: 0, tool_calls: 5, at: '2023-09-24T15:15:00Z',
      evidence: [
        { source: 'rule_engine', finding: 'U 0.71; 2/8 neighbours U0 ≥ 0.5; Himawari + GK2A agree', observed_at: AS_OF, age_h: 0 },
        { source: 'viirs_firms', finding: 'No VIIRS detection within 10 km in 48 h', observed_at: null, age_h: null },
        { source: 'viirs_image', finding: 'Thin cloud over the area; no smoke visible', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7 },
        { source: 'himawari_image', finding: 'Faint warm spot on the marker', observed_at: AS_OF, age_h: 0 },
      ],
      summary: 'Inconclusive. No VIIRS detection within 10 km in 48 hours and the 24 Sep VIIRS image is covered by thin cloud. Absence of visible smoke is not negative evidence.',
      tool_trace: [
        ...firstCalls(C001[0], AS_OF, 2050),
        { tool: 'fetch_viirs_image', args: { lat: -2.46, lon: 114.14, as_of: AS_OF }, duration_ms: 3610, ok: true },
        { tool: 'fetch_himawari_image', args: { lat: -2.46, lon: 114.14, as_of: AS_OF, mode: 'thermal' }, duration_ms: 2740, ok: true },
        { tool: 'save_verification', args: { result: 'inconclusive', viirs_within_2km_48h: 0 }, duration_ms: 88, ok: true },
      ],
      images: [
        { source: 'viirs_image', url: gibsUrl([114.14, -2.46], '2023-09-24'), layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7, marker_drawn: false },
        { source: 'himawari_image', url: '', layer: 'Himawari-9 B07', observed_at: AS_OF, age_h: 0, marker_drawn: false },
      ],
      viirs: [],
    },
  },
  {
    id: 'C-0923-001',
    heat: 0.8, // how wide and strong the hot spot in the thermal image is (0–1)
    province: '62',
    pixels: C923,
    attrs: { u_H: 1.0, u_G: 1.0, u_LST: 0.8, u_SAT: 0.5, u_T: 1.0 },
    neighbours: ['normal', 'anomaly', 'anomaly', 'normal', 'anomaly', 'normal', 'anomaly', 'normal'],
    trigger: '2023-09-23T16:40:00Z',
    nights: [
      { date: '2023-09-22', from: 0.3, to: 0.55 },
      { date: '2023-09-23', from: 0.5, to: 0.86, peakAt: 22, clouds: [[40, 44]] },
      { date: '2023-09-24', from: 0.76, to: 0.82, end: 13 },
    ],
    verification: {
      result: 'strong_evidence', smoke_visible: true, viirs_within_2km_48h: 2, tool_calls: 5, at: '2023-09-23T16:44:00Z',
      evidence: [
        { source: 'rule_engine', finding: 'U 0.86; 4/8 neighbours U0 ≥ 0.5; Himawari + GK2A agree', observed_at: '2023-09-23T16:40:00Z', age_h: 0 },
        { source: 'viirs_firms', finding: '2 VIIRS detections ≤ 2 km (NOAA-20 0.9 km; S-NPP 1.6 km)', observed_at: '2023-09-23T06:12:00Z', age_h: 10.5 },
        { source: 'viirs_image', finding: 'Smoke plume starting near the marker, heading west', observed_at: '2023-09-23T06:30:00Z', age_h: 10.2 },
        { source: 'himawari_image', finding: 'Bright B07 spot on the marker', observed_at: '2023-09-23T16:40:00Z', age_h: 0 },
      ],
      summary: 'Strong evidence. There are 2 VIIRS detections within 2 km in 48 hours and a smoke plume is visible in the 23 Sep VIIRS image.',
      tool_trace: [
        ...firstCalls(C923[0], '2023-09-23T16:40:00Z', 2480),
        { tool: 'fetch_viirs_image', args: { lat: -2.05, lon: 113.69, as_of: '2023-09-23T16:40:00Z' }, duration_ms: 3150, ok: true },
        { tool: 'fetch_himawari_image', args: { lat: -2.05, lon: 113.69, as_of: '2023-09-23T16:40:00Z', mode: 'thermal' }, duration_ms: 2660, ok: true },
        { tool: 'save_verification', args: { result: 'strong_evidence', viirs_within_2km_48h: 2 }, duration_ms: 102, ok: true },
      ],
      images: [
        { source: 'viirs_image', url: gibsUrl([113.69, -2.05], '2023-09-23'), layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', observed_at: '2023-09-23T06:30:00Z', age_h: 10.2, marker_drawn: false },
        { source: 'himawari_image', url: '', layer: 'Himawari-9 B07', observed_at: '2023-09-23T16:40:00Z', age_h: 0, marker_drawn: false },
      ],
      viirs: [
        { src: 'VIIRS_NOAA20_SP', time_utc: '2023-09-23T06:12:00Z', distance_km: 0.9, confidence: 'n', frp: 6.4, lat: -2.046, lon: 113.697 },
        { src: 'VIIRS_SNPP_SP', time_utc: '2023-09-23T05:48:00Z', distance_km: 1.6, confidence: 'n', frp: 4.1, lat: -2.062, lon: 113.678 },
      ],
    },
  },
  {
    id: 'C-0924-003',
    heat: 0.95, // how wide and strong the hot spot in the thermal image is (0–1)
    province: '16',
    pixels: C003,
    attrs: { u_H: 1.0, u_G: 1.0, u_LST: 0.6, u_SAT: 0.4, u_T: 1.0 },
    neighbours: ['anomaly', 'anomaly', 'normal', 'normal', 'anomaly', 'normal', 'anomaly', 'normal'],
    trigger: AS_OF,
    nights: [
      { date: '2023-09-22', from: 0.3, to: 0.45, clouds: [[44, 47]] },
      { date: '2023-09-23', from: 0.45, to: 0.62, peakAt: 30 }, // WARNING; ALERT only on 24 Sep
      { date: '2023-09-24', from: 0.6, to: 0.83, end: 13 },
    ],
    verification: {
      result: 'strong_evidence', smoke_visible: true, viirs_within_2km_48h: 3, tool_calls: 5, at: '2023-09-24T15:16:00Z',
      evidence: [
        { source: 'rule_engine', finding: 'U 0.83; 4/8 neighbours U0 ≥ 0.5; Himawari + GK2A agree', observed_at: AS_OF, age_h: 0 },
        { source: 'viirs_firms', finding: '3 VIIRS detections ≤ 2 km (NOAA-20, S-NPP, NOAA-21) in 48 h', observed_at: '2023-09-24T06:20:00Z', age_h: 8.8 },
        { source: 'viirs_image', finding: 'Thick smoke spreading north-west from around the marker', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7 },
        { source: 'himawari_image', finding: 'Wide bright B07 spot on the marker', observed_at: AS_OF, age_h: 0 },
      ],
      summary: 'Strong evidence. There are 3 VIIRS detections within 2 km in 48 hours and thick smoke is visible in the 24 Sep VIIRS image, spreading north-west.',
      tool_trace: [
        ...firstCalls(C003[0], AS_OF, 2620),
        { tool: 'fetch_viirs_image', args: { lat: -3.36, lon: 105.63, as_of: AS_OF }, duration_ms: 3380, ok: true },
        { tool: 'fetch_himawari_image', args: { lat: -3.36, lon: 105.63, as_of: AS_OF, mode: 'thermal' }, duration_ms: 2810, ok: true },
        { tool: 'save_verification', args: { result: 'strong_evidence', viirs_within_2km_48h: 3 }, duration_ms: 97, ok: true },
      ],
      images: [
        { source: 'viirs_image', url: gibsUrl([105.63, -3.36], '2023-09-24'), layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7, marker_drawn: false },
        { source: 'himawari_image', url: '', layer: 'Himawari-9 B07', observed_at: AS_OF, age_h: 0, marker_drawn: false },
      ],
      viirs: [
        { src: 'VIIRS_NOAA20_SP', time_utc: '2023-09-24T06:20:00Z', distance_km: 0.7, confidence: 'h', frp: 12.3, lat: -3.357, lon: 105.626 },
        { src: 'VIIRS_SNPP_SP', time_utc: '2023-09-24T05:56:00Z', distance_km: 1.2, confidence: 'n', frp: 8.1, lat: -3.364, lon: 105.641 },
        { src: 'VIIRS_NOAA21_NRT', time_utc: '2023-09-23T18:30:00Z', distance_km: 1.9, confidence: 'n', frp: 5.4, lat: -3.348, lon: 105.646 },
      ],
    },
  },
  {
    id: 'C-0924-004',
    heat: 0.4, // how wide and strong the hot spot in the thermal image is (0–1)
    province: '14',
    pixels: C004,
    attrs: { u_H: 0.95, u_G: 0.9, u_LST: 0.3, u_SAT: 0.0, u_T: 1.0 },
    neighbours: ['normal', 'anomaly', 'normal', 'cloud', 'normal', 'normal', 'anomaly', 'normal'],
    trigger: AS_OF,
    nights: [
      { date: '2023-09-22', from: 0.2, to: 0.34, clouds: [[10, 22]] },
      { date: '2023-09-23', from: 0.3, to: 0.5 },
      { date: '2023-09-24', from: 0.48, to: 0.69, end: 13, clouds: [[6, 8]] },
    ],
    verification: {
      result: 'inconclusive', smoke_visible: null, viirs_within_2km_48h: 0, tool_calls: 5, at: '2023-09-24T15:17:00Z',
      evidence: [
        { source: 'rule_engine', finding: 'U 0.69; 2/8 neighbours U0 ≥ 0.5; Himawari + GK2A agree', observed_at: AS_OF, age_h: 0 },
        { source: 'viirs_firms', finding: '1 VIIRS detection at 6.3 km; none ≤ 2 km in 48 h', observed_at: '2023-09-24T06:10:00Z', age_h: 9 },
        { source: 'viirs_image', finding: 'Thick cloud; smoke cannot be assessed', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7 },
        { source: 'himawari_image', finding: 'Warm spot on the marker, partly under cloud', observed_at: AS_OF, age_h: 0 },
      ],
      summary: 'Inconclusive. The nearest VIIRS detection is 6.3 km away and the 24 Sep VIIRS image is under thick cloud, so smoke cannot be assessed.',
      tool_trace: [
        ...firstCalls(C004[0], AS_OF, 2190),
        { tool: 'fetch_viirs_image', args: { lat: 0.34, lon: 102.76, as_of: AS_OF }, duration_ms: 3520, ok: true },
        { tool: 'fetch_himawari_image', args: { lat: 0.34, lon: 102.76, as_of: AS_OF, mode: 'thermal' }, duration_ms: 2950, ok: true },
        { tool: 'save_verification', args: { result: 'inconclusive', viirs_within_2km_48h: 0 }, duration_ms: 91, ok: true },
      ],
      images: [
        { source: 'viirs_image', url: gibsUrl([102.76, 0.34], '2023-09-24'), layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', observed_at: '2023-09-24T06:30:00Z', age_h: 8.7, marker_drawn: false },
        { source: 'himawari_image', url: '', layer: 'Himawari-9 B07', observed_at: AS_OF, age_h: 0, marker_drawn: false },
      ],
      viirs: [
        { src: 'VIIRS_SNPP_SP', time_utc: '2023-09-24T06:10:00Z', distance_km: 6.3, confidence: 'l', frp: 2.2, lat: 0.39, lon: 102.81 },
      ],
    },
  },
  {
    id: 'C-0915-001',
    heat: 0.5, // how wide and strong the hot spot in the thermal image is (0–1)
    state: 'closed',
    province: '61',
    pixels: C915,
    attrs: { u_H: 1.0, u_G: 1.0, u_LST: 0.7, u_SAT: 0.4, u_T: 0.67 }, // U = 0.74 with u_N 2/8
    neighbours: ['normal', 'anomaly', 'normal', 'anomaly', 'normal', 'non_peat', 'normal', 'normal'],
    trigger: T915,
    nights: [
      { date: '2023-09-13', from: 0.14, to: 0.27 },
      { date: '2023-09-14', from: 0.3, to: 0.52, clouds: [[12, 20]] },
      { date: '2023-09-15', from: 0.48, to: 0.74, peakAt: 21 },
    ],
    verification: {
      result: 'inconclusive', smoke_visible: null, viirs_within_2km_48h: 0, tool_calls: 5, at: '2023-09-15T16:34:00Z',
      evidence: [
        { source: 'rule_engine', finding: 'U 0.74; 2/8 neighbours U0 ≥ 0.5; Himawari + GK2A agree', observed_at: T915, age_h: 0 },
        { source: 'viirs_firms', finding: '1 VIIRS detection at 4.8 km; none ≤ 2 km in 48 h', observed_at: '2023-09-15T06:05:00Z', age_h: 10.4 },
        { source: 'viirs_image', finding: 'Regional haze over the area; the smoke source cannot be located', observed_at: '2023-09-15T06:30:00Z', age_h: 10 },
        { source: 'himawari_image', finding: 'Warm spot on the marker', observed_at: T915, age_h: 0 },
      ],
      summary: 'Inconclusive. The nearest VIIRS detection is 4.8 km away and regional haze in the 15 Sep VIIRS image hides the smoke source.',
      tool_trace: [
        ...firstCalls(C915[0], T915, 2240),
        { tool: 'fetch_viirs_image', args: { lat: -0.35, lon: 109.56, as_of: T915 }, duration_ms: 3290, ok: true },
        { tool: 'fetch_himawari_image', args: { lat: -0.35, lon: 109.56, as_of: T915, mode: 'thermal' }, duration_ms: 2710, ok: true },
        { tool: 'save_verification', args: { result: 'inconclusive', viirs_within_2km_48h: 0 }, duration_ms: 90, ok: true },
      ],
      images: [
        { source: 'viirs_image', url: gibsUrl([109.56, -0.35], '2023-09-15'), layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', observed_at: '2023-09-15T06:30:00Z', age_h: 10, marker_drawn: false },
        { source: 'himawari_image', url: '', layer: 'Himawari-9 B07', observed_at: T915, age_h: 0, marker_drawn: false },
      ],
      viirs: [
        { src: 'VIIRS_NOAA20_SP', time_utc: '2023-09-15T06:05:00Z', distance_km: 4.8, confidence: 'n', frp: 3.6, lat: -0.32, lon: 109.59 },
      ],
    },
  },
];

const ACTIVE = DEFS.filter((d) => !d.state);

const decisions = new Map<string, Decision>([
  ['C-0915-001', {
    action: 'reject', by: 'operator@example.org', at: '2023-09-15T17:20:00Z', alert_id: null,
    reason: 'The Kubu Raya Manggala Agni fire brigade reports this land was put out this afternoon; the heat comes from burnt remains.',
  }],
  ['C-0923-001', { action: 'publish', by: 'operator@example.org', at: '2023-09-23T17:02:00Z', reason: null, alert_id: 'A-0923-001' }],
]);

function centroid(px: LngLat[]): LngLat {
  const n = px.length;
  return [r2(px.reduce((s, p) => s + p[0], 0) / n), r2(px.reduce((s, p) => s + p[1], 0) / n)];
}

/** Crop extent from the BBOX parameter (lat_s,lon_w,lat_n,lon_e) of the GIBS WMS URL. */
function viirsBbox(url: string): [number, number, number, number] {
  const [s, w, n, e] = new URL(url).searchParams.get('BBOX')!.split(',').map(Number);
  return [w, s, e, n];
}

interface Extras { images: EvidenceImg[]; details: Record<AttrKey, AttrDetail>; viirs: ViirsDetection[] }
const extrasCache = new Map<string, Extras>();

/** Thermal image + measured number per attribute; built once per cluster from one temperature grid. */
function extrasOf(d: ClusterDef, uN8: number, series: SeriesPoint[]): Extras {
  const hit = extrasCache.get(d.id);
  if (hit) return hit;
  const seed = [...d.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const centre = centroid(d.pixels);
  const crop = buildThermal({
    centre, pixels: d.pixels, rep: d.pixels[0], heat: d.heat, seed, cloudNear: d.id === 'C-0924-004',
    targets: {
      himawari: rawFromU(d.attrs.u_H ?? 0, ATTR_SCALES.u_H, seed, 0.4 + 8 * d.heat),
      gk2a: rawFromU(d.attrs.u_G ?? 0, ATTR_SCALES.u_G, seed + 5, 0.4 + 7 * d.heat),
    },
  });
  const peaks = new Map<string, number>();
  for (const p of series) if (p.U != null) peaks.set(p.slot.slice(0, 10), Math.max(peaks.get(p.slot.slice(0, 10)) ?? 0, p.U));
  // distance_km is the distance to the centroid (contract); place the point at that distance so the image position and the number agree.
  const viirs = d.verification.viirs.map((v) => {
    const [lon, lat] = destination(centre, bearingDeg(centre, [v.lon, v.lat]), v.distance_km);
    return { ...v, lon: Math.round(lon * 1000) / 1000, lat: Math.round(lat * 1000) / 1000 };
  });
  const out: Extras = {
    viirs,
    images: d.verification.images.map((img) => (img.source === 'himawari_image'
      ? { ...img, url: himawariImageUrl(crop, `${img.layer} · mock`, seed), bbox: crop.bbox, thermal: crop }
      : { ...img, bbox: viirsBbox(img.url) })),
    details: attributeDetails({
      attrs: d.attrs, neighbourAnomalies: Math.round(uN8 * 8), crop, rep: cropCell(crop.bbox, d.pixels[0]), seed,
      nightPeaks: [...peaks].map(([night, peak]) => ({ night, peak })),
    }),
  };
  extrasCache.set(d.id, out);
  return out;
}

function toDetail(d: ClusterDef): ClusterDetail {
  const uN = d.neighbours.filter((s) => s === 'anomaly').length / 8;
  const series = buildSeries(d.nights, d.pixels.length);
  const extras = extrasOf(d, uN, series);
  return {
    id: d.id,
    state: d.state ?? 'active',
    province: d.province,
    rep_pixel: pixelId(d.pixels[0]),
    centroid: centroid(d.pixels),
    pixels: d.pixels.map(pixelId),
    trigger_slot: d.trigger,
    utility_score: r2(utility(d.attrs, uN)),
    neighbour_support: uN,
    n_sat: 2,
    attributes: d.attrs,
    attribute_details: extras.details,
    series,
    neighbours: d.neighbours.map((state, i) => ({
      dir: DIRS[i], state,
      u0: state === 'anomaly' ? r2(0.5 + rand(i, 3) * 0.4) : state === 'normal' ? r2(rand(i, 5) * 0.4) : null,
    })),
    verification: { ...d.verification, images: extras.images, viirs: extras.viirs },
    decision: decisions.get(d.id) ?? null,
  };
}

function toSummary(d: ClusterDetail): ClusterSummary {
  const { attributes: _a, attribute_details: _d, series: _s, neighbours: _n, verification: v, ...rest } = d;
  return {
    ...rest,
    verification: v && { result: v.result, viirs_within_2km_48h: v.viirs_within_2km_48h, tool_calls: v.tool_calls, at: v.at },
  };
}

// ---------- grid ----------

const gridCache = new Map<Scenario, Grid>();

/** Deterministic per scenario, so computed once. Callers only read (the api wraps it in structuredClone). */
function buildGrid(sc: Scenario): Grid {
  const hit = gridCache.get(sc);
  if (hit) return hit;
  const clusterPx = new Map<string, { id: string; U: number }>();
  if (sc !== 'empty') {
    for (const d of ACTIVE) {
      const U = toDetail(d).utility_score;
      d.pixels.forEach((p, i) => {
        const { row, col } = cell(p);
        clusterPx.set(`${row}_${col}`, { id: d.id, U: Math.max(T_ALERT + 0.01, r2(U - i * 0.02)) });
      });
    }
  }
  const allPx = ACTIVE.flatMap((d) => d.pixels);
  const near = (p: LngLat, dist: number) => allPx.some((q) => Math.abs(q[0] - p[0]) <= dist && Math.abs(q[1] - p[1]) <= dist);

  const features: Grid['features'] = [];
  for (const { row, col, code } of peatCells()) {
    const p: LngLat = [r2(ORIGIN[0] + (col + 0.5) * STEP), r2(ORIGIN[1] - (row + 0.5) * STEP)];
    const k = rand(row, col);
    const cl = clusterPx.get(`${row}_${col}`);
    const cloudy = sc === 'cloud'
      ? !near(p, 0.05) && rand(row, col, 7) < 0.85
      : ((p[0] - 113.66) / 0.08) ** 2 + ((p[1] + 2.36) / 0.06) ** 2 <= 1 // Central Kalimantan
        || ((p[0] - 104.08) / 0.1) ** 2 + ((p[1] + 1.28) / 0.07) ** 2 <= 1; // Jambi
    let status: Status;
    let U: number | null;
    if (cl) {
      U = cl.U;
      status = sc === 'one_satellite' ? 'WARNING' : 'ALERT'; // one satellite: ALERT is impossible
    } else if (cloudy) {
      status = 'NO_OBSERVABLE'; U = null;
    } else if ((near(p, 0.03) && k < 0.55) || k < 0.025) {
      status = 'WARNING'; U = r2(T_WARNING + k * 0.5);
    } else {
      status = 'SAFE'; U = r2(k * 0.25);
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p },
      properties: {
        pixel_id: `p${row}_${col}`, status, utility: U,
        n_sat: status === 'NO_OBSERVABLE' ? 0 : sc === 'one_satellite' ? 1 : 2,
        cluster_id: cl?.id ?? null, province: code,
      },
    });
  }
  const grid: Grid = { type: 'FeatureCollection', features };
  gridCache.set(sc, grid);
  return grid;
}

let cellsCache: { row: number; col: number; code: ProvinceCode }[] | null = null;

/** Every grid cell whose centre falls inside a fictional peat area, ordered by row then column. */
function peatCells() {
  if (cellsCache) return cellsCache;
  const out: { row: number; col: number; code: ProvinceCode }[] = [];
  for (const { code, rings } of AREAS) {
    const pts = rings.flat();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const c0 = Math.floor((Math.min(...xs) - ORIGIN[0]) / STEP), c1 = Math.ceil((Math.max(...xs) - ORIGIN[0]) / STEP);
    const r0 = Math.floor((ORIGIN[1] - Math.max(...ys)) / STEP), r1 = Math.ceil((ORIGIN[1] - Math.min(...ys)) / STEP);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const p: LngLat = [ORIGIN[0] + (col + 0.5) * STEP, ORIGIN[1] - (row + 0.5) * STEP];
        if (rings.some((ring) => inPoly(p, ring))) out.push({ row, col, code });
      }
    }
  }
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return (cellsCache = out);
}

function buildMeta(sc: Scenario): Meta {
  const late = sc === 'one_satellite';
  return {
    as_of: sc === 'daytime' ? '2023-09-25T03:00:00Z' : AS_OF,
    last_slot: AS_OF,
    is_night: sc !== 'daytime',
    replay: true,
    n_sat: late ? 1 : 2,
    sats: {
      himawari: { last_slot: AS_OF, delay_min: 18 },
      gk2a: late ? { last_slot: '2023-09-24T14:20:00Z', delay_min: 55 } : { last_slot: AS_OF, delay_min: 22 },
    },
    nights: { first: ARCHIVE_FIRST, last: nightOf(AS_OF) },
  };
}

// ---------- compact formats (pixel index, slot, night) ----------

const PIXELS_VERSION = 'mock-2023-09';

function buildPixels(): PixelIndex {
  const grid = buildGrid('normal');
  const rows: number[] = [], cols: number[] = [];
  for (const f of grid.features) {
    const { row, col } = cell(f.geometry.coordinates as LngLat);
    rows.push(row); cols.push(col);
  }
  return { version: PIXELS_VERSION, origin: ORIGIN, step: STEP, rows, cols, province: grid.features.map((f) => Number(f.properties.province)) };
}

function clustersOf(grid: Grid): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  grid.features.forEach((f, i) => {
    const id = f.properties.cluster_id;
    if (id) (out[id] ??= []).push(i);
  });
  return out;
}

function buildCompact(sc: Scenario): GridCompact {
  const grid = buildGrid(sc);
  return {
    pixels_version: PIXELS_VERSION,
    slot: AS_OF,
    n_sat: sc === 'one_satellite' ? 1 : 2,
    status: grid.features.map((f) => STATUS_CODE[f.properties.status]).join(''),
    utility: encodeUtility(grid.features.map((f) => f.properties.utility)),
    clusters: clustersOf(grid),
  };
}

// ---------- night archive ----------

const DAY_MS = 86_400_000;
const nightIdx = (night: string) => Math.round((Date.parse(night) - Date.parse(ARCHIVE_FIRST)) / DAY_MS);
const slotsOf = (night: string) => {
  const t0 = Date.parse(`${night}T13:00:00Z`);
  return Array.from({ length: NIGHT_SLOTS }, (_, k) => iso(t0 + k * SLOT_MS));
};
const AREA_CENTERS: LngLat[] = AREAS.map(({ rings: [r] }) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]);

/** Last evaluated slot of this night; -1 outside the archive or on a night without data. */
function lastSlotOf(night: string): number {
  const asOfNight = nightOf(AS_OF);
  if (night > asOfNight || night < ARCHIVE_FIRST || OUTAGES.has(night)) return -1;
  return night === asOfNight ? Math.round((Date.parse(AS_OF) - Date.parse(`${night}T13:00:00Z`)) / SLOT_MS) : NIGHT_SLOTS - 1;
}

const seriesCache = new Map<string, Map<string, Status>>();
/** Cluster status at slot k of that night; slots after the end of the series (04:00–04:50 UTC+7) carry the last value. */
function seriesStatus(d: ClusterDef, slots: string[], k: number): Status | undefined {
  let m = seriesCache.get(d.id);
  if (!m) seriesCache.set(d.id, (m = new Map(toDetail(d).series.map((p) => [p.slot, p.status]))));
  return m.get(slots[k]) ?? (k > SERIES_END ? m.get(slots[SERIES_END]) : undefined);
}

/** Whether this cluster was at ALERT in any slot of that night (up to the last slot that exists). */
function alertOn(d: ClusterDef, night: string): boolean {
  const slots = slotsOf(night);
  const last = lastSlotOf(night);
  for (let k = 0; k <= last; k++) if (seriesStatus(d, slots, k) === 'ALERT') return true;
  return false;
}

const nightCache = new Map<string, NightCompact>();

/**
 * Status per slot for one night. The replay night evolves towards the last slot's status (exactly
 * like buildCompact); earlier nights have fewer WARNING pixels and two drifting clouds.
 */
function buildNight(sc: Scenario, night: string): NightCompact {
  const key = `${sc}|${night}`;
  const hit = nightCache.get(key);
  if (hit) return hit;
  const grid = buildGrid(sc);
  const latest = grid.features.map((f) => STATUS_CODE[f.properties.status]);
  const slots = slotsOf(night);
  const current = night === nightOf(AS_OF);
  const last = lastSlotOf(night);
  const span = current ? last : NIGHT_SLOTS - 1;
  const ni = nightIdx(night);
  // Towards the peak of the dry season (24 Sep) more pixels reach WARNING.
  const watchShare = current ? 1 : 0.15 + 0.75 * (ni / nightIdx(nightOf(AS_OF)));
  const defs = sc === 'empty' ? [] : DEFS;
  const index = new Map(grid.features.map((f, i) => [f.properties.pixel_id, i]));
  const owner = new Map<number, ClusterDef>();
  for (const d of defs) for (const p of d.pixels) { const i = index.get(pixelId(p)); if (i != null) owner.set(i, d); }
  const rc = grid.features.map((f) => cell(f.geometry.coordinates as LngLat));
  const clouds = current ? [] : [0, 1].map((j) => {
    const [x, y] = AREA_CENTERS[Math.floor(rand(ni, j, 21) * AREA_CENTERS.length)];
    return { x: x + (rand(ni, j, 22) - 0.5) * 0.3, y: y + (rand(ni, j, 23) - 0.5) * 0.2, rx: 0.12 + rand(ni, j, 24) * 0.12, ry: 0.08 + rand(ni, j, 25) * 0.08 };
  });

  const evolve = (k: number): string => {
    let s = '';
    grid.features.forEach((f, i) => {
      const p = f.geometry.coordinates as LngLat;
      const { row, col } = rc[i];
      const d = owner.get(i);
      const st = d && seriesStatus(d, slots, k);
      const cloudy = !current
        ? clouds.some((c) => ((p[0] - (c.x - 0.01 * (span - k))) / c.rx) ** 2 + ((p[1] - c.y) / c.ry) ** 2 <= 1)
        : sc === 'cloud'
          ? f.properties.status === 'NO_OBSERVABLE' && rand(row, col, 13) < 0.3 + 0.7 * (k / Math.max(1, last))
          : ((p[0] - (113.66 - 0.012 * (last - k))) / 0.08) ** 2 + ((p[1] + 2.36) / 0.06) ** 2 <= 1;
      let code: StatusCode;
      if (st) code = STATUS_CODE[st];
      else if (cloudy) code = 'N';
      else if (latest[i] === 'W' && (current || rand(row, col, 40 + ni) < watchShare)) {
        code = k >= Math.floor(rand(row, col, current ? 11 : 11 + ni * 7) * span) ? 'W' : 'S';
      } else code = 'S';
      s += code;
    });
    return s;
  };

  const clusters: Record<string, number[]> = {};
  for (const d of defs) {
    if (!alertOn(d, night)) continue;
    clusters[d.id] = d.pixels.map((p) => index.get(pixelId(p))).filter((i): i is number => i != null).sort((a, b) => a - b);
  }

  const out: NightCompact = {
    pixels_version: PIXELS_VERSION,
    night,
    slots,
    status: slots.map((_, k) => (k > last ? null : k === last && current ? latest.join('') : evolve(k))),
    n_sat: slots.map((_, k) => (k > last ? null : current && sc === 'one_satellite' && k >= last - 4 ? 1 : 2)),
    clusters,
  };
  nightCache.set(key, out);
  return out;
}

/** Summary per night of one month (YYYY-MM) for the calendar; nights outside the archive are not sent. */
function buildNights(sc: Scenario, month: string): NightSummary[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: NightSummary[] = [];
  for (let d = 1; d <= days; d++) {
    const night = `${month}-${String(d).padStart(2, '0')}`;
    if (night < ARCHIVE_FIRST || night > nightOf(AS_OF)) continue;
    const has = lastSlotOf(night) >= 0;
    out.push({ night, has_data: has, alert_clusters: has && sc !== 'empty' ? DEFS.filter((x) => alertOn(x, night)).length : 0 });
  }
  return out;
}

function buildBasemaps(): Basemap[] {
  const day = AS_OF.slice(0, 10);
  return [{
    id: 'viirs',
    label: `VIIRS imagery ${day} (NASA GIBS)`,
    tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],
    tile_size: 256,
    maxzoom: 9,
    attribution: 'NASA GIBS · VIIRS NOAA-20',
  }];
}

// ---------- Api ----------

const wait = <T>(v: T, ms = 300): Promise<T> =>
  new Promise((res) => setTimeout(() => res(structuredClone(v)), ms + Math.random() * 200));

export const mockApi: Api = {
  meta: () => wait(buildMeta(currentScenario()), 150),
  pixels: () => wait(buildPixels(), 200),
  gridCompact: () => wait(buildCompact(currentScenario()), 250),
  night: (night) => wait(buildNight(currentScenario(), night), 300),
  nights: (month) => wait(buildNights(currentScenario(), month), 120),
  basemaps: () => wait(buildBasemaps(), 100),
  provinces: async () => {
    const r = await fetch(`${import.meta.env.BASE_URL}mock/provinces.geojson`);
    return (await r.json()) as ProvinceBoundary;
  },
  clusters: (night) => {
    if (currentScenario() === 'empty') return wait([]);
    const defs = night ? DEFS.filter((d) => alertOn(d, night)) : ACTIVE;
    return wait(defs.map((d) => toSummary(toDetail(d))));
  },
  cluster: async (id) => {
    const sc = currentScenario();
    const d = sc === 'empty' ? undefined : DEFS.find((x) => x.id === id);
    if (!d) { await wait(null); throw new ApiError(404, 'NOT_FOUND', `Cluster ${id} not found.`); }
    return wait(toDetail(d));
  },
  decide: async (id, body) => {
    await wait(null, 500);
    if (!DEFS.some((d) => d.id === id)) throw new ApiError(404, 'NOT_FOUND', `Cluster ${id} not found.`);
    if (decisions.has(id)) throw new ApiError(409, 'ALREADY_DECIDED', 'Another operator has already decided on this cluster.');
    if (body.action === 'reject' && !body.reason?.trim()) throw new ApiError(422, 'REASON_REQUIRED', 'A rejection reason is required.');
    if (body.action === 'publish' && (!body.caption || body.caption.length > 1024)) {
      throw new ApiError(422, 'CAPTION_INVALID', 'The caption is empty or longer than 1,024 characters.');
    }
    const n = [...decisions.values()].filter((x) => x.alert_id).length + 1;
    decisions.set(id, {
      action: body.action, by: 'operator@example.org', at: iso(Date.parse(AS_OF) + 20 * 60_000),
      reason: body.reason, alert_id: body.action === 'publish' ? `A-0924-${String(n).padStart(3, '0')}` : null,
    });
  },
  peatBoundary: () => wait<PeatBoundary>({
    type: 'FeatureCollection',
    features: AREAS.flatMap((a) => a.rings.map((ring) => ({ type: 'Feature' as const, properties: { code: a.code }, geometry: { type: 'Polygon' as const, coordinates: [ring] } }))),
  }, 100),
};

/** Example responses for the API contract tab — from the same data as the UI (normal scenario). */
export function contractExamples() {
  const grid = buildGrid('normal');
  const pick = (s: Status) => grid.features.find((f) => f.properties.status === s)!;
  const detail = (id: string) => toDetail(DEFS.find((d) => d.id === id)!);
  return {
    meta: buildMeta('normal'),
    grid: { type: 'FeatureCollection' as const, features: [pick('ALERT'), pick('NO_OBSERVABLE')] },
    gridCount: grid.features.length,
    pixels: buildPixels(),
    gridCompact: buildCompact('normal'),
    night: buildNight('normal', nightOf(AS_OF)),
    nights: buildNights('normal', nightOf(AS_OF).slice(0, 7)).slice(12),
    basemaps: buildBasemaps(),
    clusters: [toSummary(detail('C-0923-001')), toSummary(detail('C-0924-001'))],
    cluster: detail('C-0924-002'),
    peat: { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [AREAS[0].rings[0]] } }] },
  };
}
