import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

// Data shapes follow backend.html sections 03–05. Fields marked "FE" are the FE's
// proposal for the GET /operator/clusters/{id} content that is not detailed there.

export type Status = 'SAFE' | 'NO_OBSERVABLE' | 'WARNING' | 'ALERT';
export type EvidenceResult = 'strong_evidence' | 'inconclusive';
// BPS codes: 10 Sumatra provinces + 5 Kalimantan provinces.
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
  nights: { first: string; last: string }; // FE: archive nights, YYYY-MM-DD (UTC+7 date when the night starts)
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
  /** fanout_pending: the decision is saved, recipients are still being queued (the backend sweep resumes it). */
  notifications?: { state: 'fanout_pending' | 'outbox_saved' | 'no_recipients'; recipients: number; jobs: number } | null;
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
  U: number | null; // FE: null = NO_OBSERVABLE
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
  finding: string;
  observed_at: string | null;
  age_h: number | null;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  duration_ms: number;
  ok: boolean;
}

/** One thermal channel of a crop: brightness temperature per cell (≈ 2 km), top row first, kelvin to 1 decimal; null = cloud. */
export interface ThermalBand {
  sat: 'himawari' | 'gk2a';
  band: string; // 'B07' | 'B14' (Himawari-9 AHI), 'SW038' | 'IR105' (GK2A AMI)
  um: number; // centre wavelength, µm; < 5 = hot channel (3.8–3.9), ≥ 5 = reference channel (10–11)
  values: (number | null)[]; // cols × rows
}

/** The data behind a thermal image so the UI can show per-cell temperatures (FE). */
export interface ThermalCrop {
  bbox: [number, number, number, number]; // [west_lon, south_lat, east_lon, north_lat] exactly like the image
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
  marker_drawn: boolean; // false → the UI draws its own coordinate marker
  bbox?: [number, number, number, number]; // FE: [west_lon, south_lat, east_lon, north_lat]; without it the UI assumes ±0.2° around the cluster
  thermal?: ThermalCrop; // FE: himawari_image only
}

export interface ViirsDetection {
  src: string;
  time_utc: string;
  distance_km: number;
  confidence: string;
  frp: number;
  lat: number; // FE: for the VIIRS map layer
  lon: number;
}

export interface VerificationDetail extends VerificationSummary {
  smoke_visible: boolean | null;
  evidence: Evidence[];
  summary: string;
  tool_trace: ToolCall[]; // FE
  images: EvidenceImg[]; // FE
  viirs: ViirsDetection[]; // FE
}

/** One supporting number of an attribute (e.g. the B07 brightness temperature at the representative pixel). */
export interface AttrPart {
  key: string; // b07 | b14 | sw038 | ir105 | dt | bg_dt | sigma | lst | ts | t2m | night_peak
  value: number | null;
  unit: string; // 'K' | 'U'
  abs?: boolean; // true = absolute temperature (shown as °C + K); otherwise a difference/plain number
  at?: string; // night_peak: night YYYY-MM-DD
}

/** Measured number behind one MAUT attribute u (FE): value is normalised linearly through scale, then clipped to 0–1. */
export interface AttrDetail {
  value: number | null; // null = not available (same as a null attribute)
  unit: string; // 'K' | 'nights' | 'pixels'
  scale: [number, number]; // value for u = 0 and u = 1
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
  caption: string | null;
  reason: string | null;
}

// ---------- compact map format (FE proposal) ----------

/** Static list of peat pixels; its order = the cell index in every compact response. */
export interface PixelIndex {
  version: string;
  origin: LngLat; // top-left corner of the combined Sumatra + Kalimantan grid: [94.9, 6.2]
  step: number; // 0.02
  rows: number[];
  cols: number[];
  province: number[]; // BPS province code per cell, e.g. 16 = South Sumatra
}

/** Compact status codes: S = SAFE, N = NO_OBSERVABLE, W = WARNING, A = ALERT. */
export type StatusCode = 'S' | 'N' | 'W' | 'A';

/** Status of every pixel in one slot. */
export interface GridCompact {
  pixels_version: string;
  slot: string;
  n_sat: 0 | 1 | 2;
  status: string; // one StatusCode per cell
  utility: string; // base64 Uint8 per cell: round(U × 250); 255 = null
  clusters: Record<string, number[]>; // cluster_id → cell indices
}

/** Status per slot for one night (slot player). */
export interface NightCompact {
  pixels_version: string;
  night: string; // UTC+7 date when the night starts, YYYY-MM-DD
  slots: string[]; // 54 UTC slots, 13:00–21:50
  status: (string | null)[]; // per slot; null = not evaluated yet / no data
  n_sat: (0 | 1 | 2 | null)[];
  clusters: Record<string, number[]>; // clusters at ALERT that night → cell indices
}

/** One night for the calendar: whether there is data, and how many clusters reached ALERT. */
export interface NightSummary {
  night: string; // YYYY-MM-DD
  has_data: boolean;
  alert_clusters: number;
}

export interface Basemap {
  id: string;
  label: string;
  tiles: string[]; // XYZ raster template {z}/{x}/{y}
  tile_size: number;
  maxzoom: number;
  attribution: string;
}

export type ProvinceBoundary = FeatureCollection<MultiPolygon, { code: ProvinceCode; name: string }>;

// ---------- risk engine: peat regions (asapify_engine, docs/ENGINE.md in the backend) ----------

export type RatedStatus = 'SAFE' | 'WARNING' | 'ALERT';
export type Quality = 'ACCEPTED' | 'DEGRADED' | 'REJECTED' | 'MISSING';
export type ValidationStatus = 'CONFIRMED' | 'REJECTED' | 'NEEDS_MANUAL_REVIEW';
export type SatelliteName = 'himawari9' | 'gk2a';

/** What one geostationary satellite saw in a region cell during one 10-minute slot. */
export interface SatelliteView {
  n_pixels: number; // pixels whose centre is in the cell
  n_clear: number;
  cloud_fraction: number; // 0–1 of the cell
  n_peat: number; // pixels whose centre is on KHG peat
  n_peat_clear: number;
  background_k: number | null; // median ΔBT (3.9 − 10.4 µm) of the clear pixels
  background_mad_k: number | null;
  max_anomaly_k: number | null; // strongest fire-like pixel above that background; 0 = none; null = no verdict
  max_z: number | null;
  n_hot: number; // hot pixels: ΔBT ≥ 3 K above the background and the 3.9 µm channel risen too
  n_hot_peat: number;
  hot_on_peat: boolean | null; // the strongest fire-like pixel lies on peat
  hot_lat: number | null;
  hot_lon: number | null;
  mwir_k: number | null; // 3.9 µm brightness temperature at that pixel
  lwir_k: number | null; // 10.4 µm
}

export interface RegionInputs {
  delta_t_k: number | null; // brightness-temperature anomaly the satellites confirm, K; null = not observable
  cloud_cover_pct: number | null; // share of the cell under cloud in the clearest view
  relative_humidity_pct: number | null; // Open-Meteo model value for the slot's hour
  hot_lat: number | null; // where the strongest anomaly is (the cell centre when there is none)
  hot_lon: number | null;
}

export interface SlotQuality { thermal: Quality; relative_humidity: Quality }

/** One 10-minute satellite slot: the audit record the rules engine keeps. */
export interface SlotRecord {
  observed_at: string; // scan start of the slot, UTC
  night: boolean; // sun below −6°: only then can the status reach ALERT
  sun_elevation_deg: number;
  views: Record<SatelliteName, SatelliteView | null>; // null = no data from that satellite
  inputs: RegionInputs;
  support: { viirs_support?: number; power_support?: number }; // only at a possible hotspot, 0–1
  quality: SlotQuality;
  flags: string[]; // e.g. two_satellites_agree, satellites_disagree, single_satellite:gk2a, daytime, no_data:gk2a
  sources: Record<string, string>;
  status: Status;
  utilities: Partial<Record<RatedStatus, number>>; // empty when NO_OBSERVABLE
  memberships: Record<string, number>;
  reason: string;
}

/** Latest NASA POWER hour of a region: supporting data, about 2–3 days behind. */
export interface PowerSupport {
  observed_at: string;
  skin_temperature_k: number | null;
  baseline_k: number | null; // mean skin temperature, same UTC hour ±15 days, 2021–2025
  baseline_std_k: number | null;
  baseline_samples: number;
  baseline: string;
  delta_t_k: number | null; // skin temperature − baseline
  relative_humidity_pct: number | null;
  updated_at: string;
}

/** One NASA POWER hour (support only: no status). */
export interface PowerHour {
  observed_at: string;
  inputs: Omit<PowerSupport, 'observed_at' | 'updated_at'>;
  quality: { skin_temperature: Quality; relative_humidity: Quality };
  flags: string[];
}

export interface TransitionRecord {
  observed_at: string;
  previous: Status | null;
  current: Status;
  utilities: Partial<Record<RatedStatus, number>>;
  reason: string;
}

/** A NASA FIRMS hotspot as the agent saw it. */
export interface Hotspot {
  lat: number;
  lon: number;
  acquired_at: string;
  hours_from_observation: number;
  distance_km: number; // from the region centre
  confidence: string; // VIIRS: l / n / h
  brightness_k: number | null;
  frp_mw: number | null;
  daynight: string | null;
  satellite: string | null;
}

export interface AgentToolCall {
  hours_window: number | null;
  buffer_km: number | null;
  from: string | null;
  to: string | null;
  hotspot_count: number | null;
  confident_count: number | null;
  highest_brightness_temp_k: number | null;
  error: string | null;
}

export interface Verification {
  id: string; // YYYYMMDDTHHMMSSZ
  region_id: string;
  trigger: 'auto' | 'manual';
  requested_by: string | null;
  at: string;
  observed_at: string; // the slot under review
  region_status: Status;
  validation_status: ValidationStatus; // after the backend checks
  agent_validation_status: ValidationStatus | null; // what the agent answered
  confidence_score: number | null;
  analysis: string;
  supporting_data: { firms_hotspot_count: number; highest_brightness_temp: number | null } | null;
  draft_operator_alert: { title: string; message: string } | null;
  checks: string[]; // why the backend downgraded the agent's answer
  error: string | null;
  tool_calls: AgentToolCall[];
  evidence: Hotspot[];
  model: string;
  usage: { model_calls?: number; prompt_tokens?: number; output_tokens?: number; thought_tokens?: number };
  duration_s: number;
  decision: Decision | null;
}

export interface VerificationBrief {
  id: string;
  validation_status: ValidationStatus;
  confidence_score: number | null;
  trigger: 'auto' | 'manual';
  at: string;
  observed_at: string;
  error: string | null;
  decision: 'publish' | 'reject' | null;
}

export interface RegionSummary {
  id: string; // e.g. R2.50S113.750E: NASA POWER cell centre
  province: ProvinceCode;
  lat: number;
  lon: number;
  bounds: [number, number, number, number]; // west, south, east, north
  peat_km2: number;
  status: Status | null; // null until the first cycle reaches the region
  since: string | null;
  observed_at: string | null;
  utilities: Partial<Record<RatedStatus, number>> | null;
  updated_at: string | null;
  agent_requested_at: string | null;
  last_agent_at: string | null;
  verification: VerificationBrief | null;
  inputs: RegionInputs | null; // from the latest slot
  quality: SlotQuality | null;
  reason: string | null;
  flags: string[] | null;
  night: boolean | null;
}

export interface RegionDetail extends Omit<RegionSummary, 'inputs' | 'quality' | 'reason' | 'flags' | 'night'> {
  last_error: string | null;
  latest?: SlotRecord;
  slots: SlotRecord[]; // oldest first, 6 per hour
  hours: PowerHour[]; // NASA POWER support, oldest first
  power?: PowerSupport | null;
  transitions: TransitionRecord[]; // newest first
  verifications: Verification[]; // newest first
}

export interface AgentInfo {
  configured: boolean;
  model: string;
  daily_quota: number;
  used_today: number;
  remaining: number;
  max_tool_calls: number;
}

export interface RegionDecisionRequest extends DecisionRequest {
  verification_id: string;
}

export type PeatRegions = FeatureCollection<Polygon | MultiPolygon, { id: string; province: ProvinceCode }>;

/** An address with operator access, or one waiting for its first sign-in (backend asapify_api/access_routes.py). */
export interface OperatorAccess {
  email: string;
  state: 'active' | 'pending';
  added_by: string | null; // null = granted by hand with the backend's tools/set_operator.py
  added_at: string | null;
  activated_at: string | null;
}

/** The earlier pixel/cluster design (/pixels, /clusters/:id). */
export interface PixelApi {
  meta(): Promise<Meta>;
  pixels(): Promise<PixelIndex>;
  gridCompact(asOf?: string): Promise<GridCompact>;
  night(night: string): Promise<NightCompact>;
  nights(month: string): Promise<NightSummary[]>; // month = YYYY-MM
  basemaps(): Promise<Basemap[]>;
  clusters(night?: string): Promise<ClusterSummary[]>; // no night = active clusters
  cluster(id: string): Promise<ClusterDetail>;
  decide(id: string, body: DecisionRequest): Promise<void>;
  peatBoundary(): Promise<PeatBoundary>;
  provinces(): Promise<ProvinceBoundary>;
}

export interface Api extends PixelApi {
  regions(): Promise<RegionSummary[]>;
  region(id: string, hours?: number): Promise<RegionDetail>;
  peatRegions(): Promise<PeatRegions>;
  agent(): Promise<AgentInfo>;
  verifyRegion(id: string): Promise<Verification>;
  decideRegion(id: string, body: RegionDecisionRequest): Promise<Decision>;
  operatorAccess(): Promise<OperatorAccess[]>;
  grantOperator(email: string): Promise<OperatorAccess>;
  revokeOperator(email: string): Promise<void>;
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
