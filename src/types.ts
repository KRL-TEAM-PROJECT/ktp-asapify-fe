import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

// Bentuk data mengikuti backend.html bagian 03–05. Field bertanda "FE" adalah
// usulan FE untuk isi GET /operator/clusters/{id} yang belum dirinci di sana.

export type Status = 'SAFE' | 'NO_OBSERVATION' | 'WATCH' | 'AWAS';
export type EvidenceResult = 'strong_evidence' | 'inconclusive';
// Kode BPS: 10 provinsi Sumatra + 5 provinsi Kalimantan.
export type ProvinceCode =
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '21'
  | '61' | '62' | '63' | '64' | '65';
export type LngLat = [number, number]; // GeoJSON: [lon, lat]

export interface SatState {
  last_slot: string | null; // UTC ISO
  delay_min: number | null;
}

export interface Meta {
  as_of: string;
  last_slot: string;
  is_night: boolean;
  replay: boolean;
  n_sat: 0 | 1 | 2;
  sats: { himawari: SatState; gk2a: SatState };
  nights: { first: string; last: string }; // FE: malam arsip, YYYY-MM-DD (tanggal WIB awal malam)
}

export interface PixelProps {
  pixel_id: string;
  status: Status;
  utility: number | null;
  n_sat: 0 | 1 | 2;
  cluster_id: string | null;
  province: ProvinceCode;
}
export type Grid = FeatureCollection<Point, PixelProps>;
export type PeatBoundary = FeatureCollection<Polygon>;

export type AttrKey = 'u_H' | 'u_G' | 'u_LST' | 'u_SAT' | 'u_T' | 'u_N';
export type Attributes = Record<Exclude<AttrKey, 'u_N'>, number | null>;

export interface VerificationSummary {
  result: EvidenceResult;
  viirs_within_2km_48h: number;
  tool_calls: number;
  at: string;
}

export interface Decision {
  notifications?: { state: 'outbox_saved' | 'no_recipients'; recipients: number; jobs: number } | null;
  action: 'publish' | 'reject';
  by: string;
  at: string;
  reason: string | null;
  alert_id: string | null;
  /** Present in live API; absent in older mock fixtures. A saved decision is not proof of delivery. */
  telegram?: { status: 'pending' | 'sent' | 'failed' | 'unknown'; message_id: number | null; error?: string | null } | null;
}

export interface ClusterSummary {
  id: string;
  state: 'active' | 'closed';
  province: ProvinceCode;
  rep_pixel: string;
  centroid: LngLat;
  pixels: string[];
  trigger_slot: string;
  utility_score: number;
  neighbour_support: number;
  n_sat: 0 | 1 | 2;
  verification: VerificationSummary | null;
  decision: Decision | null;
}

export interface SeriesPoint {
  slot: string;
  U: number | null; // FE: null = NO_OBSERVATION
  status: Status;
}

export type NeighbourDir = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
export interface Neighbour {
  dir: NeighbourDir;
  state: 'anomaly' | 'normal' | 'cloud' | 'non_peat';
  u0: number | null;
}

export type EvidenceSource = 'rule_engine' | 'viirs_firms' | 'viirs_image' | 'himawari_image';
export interface Evidence {
  source: EvidenceSource;
  finding: string; // Bahasa Indonesia
  finding_en: string;
  observed_at: string | null;
  age_h: number | null;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  duration_ms: number;
  ok: boolean;
}

/** Satu kanal termal pada crop: suhu kecerahan tiap sel (≈ 2 km), baris atas dulu, kelvin 1 desimal; null = tertutup awan. */
export interface ThermalBand {
  sat: 'himawari' | 'gk2a';
  band: string; // 'B07' | 'B14' (Himawari-9 AHI), 'SW038' | 'IR105' (GK2A AMI)
  um: number; // panjang gelombang tengah, µm; < 5 = kanal panas (3,8–3,9), ≥ 5 = kanal acuan (10–11)
  values: (number | null)[]; // cols × rows
}

/** Data di balik citra termal supaya UI bisa menampilkan angka suhu per sel (FE). */
export interface ThermalCrop {
  bbox: [number, number, number, number]; // [lon_barat, lat_selatan, lon_timur, lat_utara] persis seperti citra
  cols: number;
  rows: number;
  bands: ThermalBand[];
}

export interface EvidenceImg {
  source: 'viirs_image' | 'himawari_image';
  url: string; // signed URL crop
  layer: string;
  observed_at: string;
  age_h: number;
  marker_drawn: boolean; // false → UI menggambar penanda koordinat sendiri
  bbox?: [number, number, number, number]; // FE: [lon_barat, lat_selatan, lon_timur, lat_utara]; tanpa ini UI mengira ±0,2° dari koordinat kelompok
  thermal?: ThermalCrop; // FE: hanya himawari_image
}

export interface ViirsDetection {
  src: string;
  time_utc: string;
  distance_km: number;
  confidence: string;
  frp: number;
  lat: number; // FE: untuk layer peta viirs
  lon: number;
}

export interface VerificationDetail extends VerificationSummary {
  smoke_visible: boolean | null;
  evidence: Evidence[];
  summary_id: string;
  summary_en: string;
  tool_trace: ToolCall[]; // FE
  images: EvidenceImg[]; // FE
  viirs: ViirsDetection[]; // FE
}

/** Satu angka pendukung atribut (mis. suhu kecerahan B07 di piksel perwakilan). */
export interface AttrPart {
  key: string; // b07 | b14 | sw038 | ir105 | dt | bg_dt | sigma | lst | ts | t2m | night_peak
  value: number | null;
  unit: string; // 'K' | 'U'
  abs?: boolean; // true = suhu mutlak (tampil °C + K); selain itu selisih/angka biasa
  at?: string; // night_peak: malam YYYY-MM-DD
}

/** Angka terukur di balik satu atribut MAUT u (FE): value dinormalisasi linear lewat scale lalu dipotong ke 0–1. */
export interface AttrDetail {
  value: number | null; // null = tidak tersedia (sama dengan atribut null)
  unit: string; // 'K' | 'malam' | 'piksel'
  scale: [number, number]; // value untuk u = 0 dan u = 1
  parts: AttrPart[];
}

export interface ClusterDetail extends Omit<ClusterSummary, 'verification'> {
  attributes: Attributes;
  attribute_details?: Record<AttrKey, AttrDetail>; // FE
  series: SeriesPoint[];
  neighbours: Neighbour[]; // FE
  verification: VerificationDetail | null;
}

export interface DecisionRequest {
  action: 'publish' | 'reject';
  caption_id: string | null;
  reason: string | null;
}

// ---------- format ringkas peta (usulan FE) ----------

/** Daftar piksel gambut statis; urutannya = indeks sel di semua respons ringkas. */
export interface PixelIndex {
  version: string;
  origin: LngLat; // pojok kiri atas grid gabungan Sumatra + Kalimantan: [94.9, 6.2]
  step: number; // 0.02
  rows: number[];
  cols: number[];
  province: number[]; // kode BPS provinsi per sel, mis. 16 = Sumatera Selatan
}

export type StatusCode = 'S' | 'N' | 'W' | 'A';

/** Status semua piksel pada satu slot. */
export interface GridCompact {
  pixels_version: string;
  slot: string;
  n_sat: 0 | 1 | 2;
  status: string; // satu StatusCode per sel
  utility: string; // base64 Uint8 per sel: round(U × 250); 255 = null
  clusters: Record<string, number[]>; // cluster_id → indeks sel
}

/** Status per slot untuk satu malam (pemutar slot). */
export interface NightCompact {
  pixels_version: string;
  night: string; // tanggal WIB saat malam dimulai, YYYY-MM-DD
  slots: string[]; // 54 slot UTC, 13.00–21.50
  status: (string | null)[]; // per slot; null = belum dievaluasi / tidak ada data
  n_sat: (0 | 1 | 2 | null)[];
  clusters: Record<string, number[]>; // kelompok yang AWAS malam itu → indeks sel
}

/** Ringkasan satu malam untuk kalender: ada data atau tidak, dan berapa kelompok yang AWAS. */
export interface NightSummary {
  night: string; // YYYY-MM-DD
  has_data: boolean;
  awas_clusters: number;
}

export interface Basemap {
  id: string;
  label_id: string;
  label_en: string;
  tiles: string[]; // template XYZ raster {z}/{x}/{y}
  tile_size: number;
  maxzoom: number;
  attribution: string;
}

export type ProvinceBoundary = FeatureCollection<MultiPolygon, { code: ProvinceCode; name: string }>;

export interface Api {
  meta(): Promise<Meta>;
  pixels(): Promise<PixelIndex>;
  gridCompact(asOf?: string): Promise<GridCompact>;
  night(night: string): Promise<NightCompact>;
  nights(month: string): Promise<NightSummary[]>; // month = YYYY-MM
  basemaps(): Promise<Basemap[]>;
  clusters(night?: string): Promise<ClusterSummary[]>; // tanpa night = kelompok aktif
  cluster(id: string): Promise<ClusterDetail>;
  decide(id: string, body: DecisionRequest): Promise<void>;
  peatBoundary(): Promise<PeatBoundary>;
  provinces(): Promise<ProvinceBoundary>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
