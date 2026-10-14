import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

// Data shapes follow backend.html sections 03–05.

export type Status = 'SAFE' | 'NO_OBSERVABLE' | 'WARNING' | 'ALERT';
// BPS codes: 10 Sumatra provinces + 5 Kalimantan provinces.
export type ProvinceCode =
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '21'
  | '61' | '62' | '63' | '64' | '65';

export interface Decision {
  /** fanout_pending: the decision is saved, recipients are still being queued (the backend sweep resumes it). */
  notifications?: { state: 'fanout_pending' | 'outbox_saved' | 'no_recipients'; recipients: number; jobs: number } | null;
  action: 'publish' | 'reject';
  by: string;
  at: string;
  reason: string | null;
  alert_id: string | null;
  /** Present in live API; absent in mock mode. A saved decision is not proof of delivery. */
  telegram?: { status: 'pending' | 'sent' | 'failed' | 'unknown'; message_id: number | null; error?: string | null } | null;
}

export interface DecisionRequest {
  action: 'publish' | 'reject';
  caption: string | null;
  reason: string | null;
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
  hot_pixels?: HotPixel[]; // up to 5 hot pixels, strongest first (absent in records older than the day archive)
}

export interface HotPixel { lat: number; lon: number; anomaly_k: number }

/** A VIIRS detection within the support's limits (10 km, 12 h) of a hot pixel: map evidence. */
export interface ViirsNear { lat: number; lon: number; acquired_at: string; confidence: string; distance_km: number }

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
  viirs?: ViirsNear[]; // nearest first, at most 5; only at a possible hotspot
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

// ---------- day archive (backend asapify_engine/geo.py, engine_days) ----------

/** Calendar mark of one archived WIB day. */
export interface DayMark { date: string; alert: boolean; warning: boolean }

export interface DayIndex {
  first: string | null; // first and last archived day, YYYY-MM-DD (UTC+7); null = nothing archived yet
  last: string | null;
  days: DayMark[]; // the requested month, in date order
}

/** One region's evidence in one slot, as compact arrays. */
export interface DayHot {
  himawari9: [number, number, number][]; // [lat, lon, ΔBT K], strongest first
  gk2a: [number, number, number][];
  viirs: [number, number, number][]; // [lat, lon, minutes from the slot]
  view: string | null; // fusion flag: two_satellites_agree, satellites_disagree, single_satellite:<name>, …
}

export interface DaySlot {
  key: string; // HHMM, UTC+7
  at: string; // scan start, UTC
  satellites: SatelliteName[]; // read in this slot
  status: string; // one code per region in DayArchive.regions order: S, W, A, N; - = not assessed
  delta_t: (number | null)[]; // same order
  hot: Record<string, DayHot>; // regions where a satellite saw a hot pixel
  trimmed?: boolean; // some detail was left out to keep the day under 1 MiB
}

export interface DayArchive { date: string; regions: string[]; slots: DaySlot[] }

export interface Api {
  provinces(): Promise<ProvinceBoundary>;
  regions(): Promise<RegionSummary[]>;
  region(id: string, hours?: number, date?: string): Promise<RegionDetail>; // date = one WIB day instead of hours
  days(month: string): Promise<DayIndex>; // month = YYYY-MM
  day(date: string): Promise<DayArchive>;
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
