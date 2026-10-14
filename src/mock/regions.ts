import {
  ApiError,
  type AgentInfo, type Decision, type Hotspot, type PeatRegions, type PowerSupport, type ProvinceCode, type Quality,
  type RatedStatus, type RegionDecisionRequest, type RegionDetail, type RegionSummary, type SatelliteName,
  type SatelliteView, type SlotRecord, type Status, type TransitionRecord, type Verification,
} from '../types';
import { rand } from './rand';

// FICTIONAL region data for a demo without a backend (the top bar says SAMPLE DATA). The region list and the peat
// shapes are the real ones (public/regions.geojson); every number below is generated. Fusion and rules mirror the
// backend engine (asapify_engine/fusion.py and rules.py) so the statuses stay consistent with the inputs.

const LATEST = Date.parse('2026-10-11T18:10:00Z'); // 01:10 UTC+7, a night slot
const NOW = '2026-10-11T18:40:00Z'; // slots reach the backend 20–30 minutes after the scan
const SLOT = 600_000;
const SLOTS = 144; // 24 hours
const GK2A_GAP = 37; // one slot GK2A never published, to show the single-satellite case
const CELL = { lat: 0.5, lon: 0.625 };
const QUOTA = 20;
const SATS: SatelliteName[] = ['himawari9', 'gk2a'];
const THERMAL = 'Himawari-9 AHI B07-B13 and GK2A AMI SW038-IR105 brightness temperatures (NOAA open data on AWS)';

// ---------- rules engine (same breakpoints and weights as the backend RuleConfig) ----------
type Shape = [number, number, number, number];
const trapezoid = (x: number, [a, b, c, d]: Shape) => (x < a || x > d ? 0 : x < b ? (x - a) / (b - a) : x <= c ? 1 : (d - x) / (d - c));
const SHAPES: Record<string, Shape> = {
  delta_t_low: [-Infinity, -Infinity, 1, 3], delta_t_medium: [1, 3, 6, 8], delta_t_high: [6, 8, Infinity, Infinity],
  humidity_high: [40, 60, Infinity, Infinity], humidity_low: [-Infinity, -Infinity, 30, 40],
};
const WEIGHTS: Record<RatedStatus, Record<string, number>> = {
  SAFE: { delta_t_low: 0.6, humidity_high: 0.4 }, WARNING: { delta_t_medium: 1 }, ALERT: { delta_t_high: 0.6, humidity_low: 0.4 },
};
const SUPPORT_WEIGHTS: Record<string, number> = { viirs_support: 0.2, power_support: 0.1 };
const RATED: RatedStatus[] = ['SAFE', 'WARNING', 'ALERT'];
const SEVERITY: Record<RatedStatus, number> = { SAFE: 0, WARNING: 1, ALERT: 2 };

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const utility = (m: Record<string, number>, w: Record<string, number>) =>
  round(Object.entries(w).reduce((a, [k, v]) => a + v * m[k], 0) / Object.values(w).reduce((a, b) => a + b, 0), 4);

function assess(dt: number, rh: number | null, cloud: number, support: Record<string, number>, cap: string | null) {
  if (cloud > 60) return { status: 'NO_OBSERVABLE' as Status, utilities: {}, memberships: {}, reason: `not observable: cloud cover ${cloud.toFixed(0)}% > 60%` };
  const m: Record<string, number> = {};
  for (const k of ['delta_t_low', 'delta_t_medium', 'delta_t_high']) m[k] = trapezoid(dt, SHAPES[k]);
  if (rh != null) for (const k of ['humidity_high', 'humidity_low']) m[k] = trapezoid(rh, SHAPES[k]);
  const weights = Object.fromEntries(RATED.map((s) => [s, Object.fromEntries(Object.entries(WEIGHTS[s]).filter(([k]) => k in m))])) as Record<RatedStatus, Record<string, number>>;
  const utilities = Object.fromEntries(RATED.map((s) => [s, utility(m, weights[s])])) as Record<RatedStatus, number>;
  const extra = Object.entries(support).filter(([k]) => k in SUPPORT_WEIGHTS);
  if (extra.length) { // support only ever raises ALERT
    Object.assign(m, Object.fromEntries(extra));
    utilities.ALERT = Math.max(utilities.ALERT, utility(m, { ...weights.ALERT, ...Object.fromEntries(extra.map(([k]) => [k, SUPPORT_WEIGHTS[k]])) }));
  }
  const [top, next] = [...RATED].sort((a, b) => utilities[b] - utilities[a] || SEVERITY[b] - SEVERITY[a]);
  const gap = round(utilities[top] - utilities[next], 6);
  let pick: RatedStatus = gap <= 0.05 && SEVERITY[next] > SEVERITY[top] ? next : top;
  let reason = pick === top
    ? `${top} has the highest utility (${utilities[top].toFixed(3)})`
    : `${next} chosen over ${top}: utilities within the 0.05 safety margin (${gap.toFixed(3)})`;
  if (rh == null) reason += '; humidity unavailable, thermal input only';
  if (cap && pick === 'ALERT') { pick = 'WARNING'; reason += `; capped at WARNING (${cap})`; }
  return { status: pick as Status, utilities, memberships: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v, 4)])), reason };
}

// ---------- fusion of the two satellites (same as the backend fusion.py) ----------
const km = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  Math.hypot((lat2 - lat1) * 111.2, (lon2 - lon1) * 111.2 * Math.cos((lat1 * Math.PI) / 180));

function fuse(views: Record<SatelliteName, SatelliteView | null>, night: boolean, centre: [number, number], viirs: number | null, power: number | null) {
  const seen = SATS.filter((s) => views[s] && views[s]!.max_anomaly_k != null && 1 - views[s]!.cloud_fraction >= 0.4);
  const clouds = SATS.flatMap((s) => (views[s] ? [views[s]!.cloud_fraction] : []));
  const cloud = round(100 * (clouds.length ? Math.min(...clouds) : 1), 1);
  const flags = [...(night ? [] : ['daytime']), ...SATS.filter((s) => !views[s]).map((s) => `no_data:${s}`)];
  if (!seen.length) return { delta: null, cloud, quality: 'REJECTED' as Quality, flags: [...flags, 'no_clear_view'], support: {}, lat: null, lon: null };
  const hot = seen.filter((s) => views[s]!.n_hot > 0);
  let delta: number, agree: boolean;
  if (seen.length === 2) {
    const h = views.himawari9!, g = views.gk2a!;
    if (hot.length === 2 && km(h.hot_lat!, h.hot_lon!, g.hot_lat!, g.hot_lon!) <= 8) { delta = Math.min(h.max_anomaly_k!, g.max_anomaly_k!); agree = true; flags.push('two_satellites_agree'); }
    else if (!hot.length) { delta = Math.min(h.max_anomaly_k!, g.max_anomaly_k!); agree = true; flags.push('two_satellites_quiet'); }
    else { delta = Math.max(h.max_anomaly_k!, g.max_anomaly_k!); agree = false; flags.push('satellites_disagree'); }
  } else {
    delta = views[seen[0]]!.max_anomaly_k!; agree = false; flags.push(`single_satellite:${seen[0]}`);
  }
  const lead = (hot.length ? hot : seen).map((s) => views[s]!).sort((a, b) => b.max_anomaly_k! - a.max_anomaly_k!)[0];
  const [lat, lon] = lead.hot_lat != null ? [lead.hot_lat, lead.hot_lon!] : centre;
  const support: Record<string, number> = hot.length
    ? { ...(viirs ? { viirs_support: viirs } : {}), ...(power ? { power_support: power } : {}) } : {};
  return { delta: round(delta, 3), cloud, quality: (night && agree ? 'ACCEPTED' : 'DEGRADED') as Quality, flags, support, lat, lon };
}

// ---------- regions from the real peat layer ----------
interface Base { id: string; province: ProvinceCode; lat: number; lon: number; bounds: [number, number, number, number]; peat_km2: number; heat: number; seed: number }

function centre(id: string) {
  const m = /^R(\d+\.\d+)([NS])(\d+\.\d+)E$/.exec(id)!;
  return { lat: Number(m[1]) * (m[2] === 'S' ? -1 : 1), lon: Number(m[3]) };
}

function ringArea(ring: number[][], lat: number) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return Math.abs(a) / 2;
}

let bases: Promise<Base[]> | null = null;
function loadBases(): Promise<Base[]> {
  bases ??= fetch(`${import.meta.env.BASE_URL}regions.geojson`).then((r) => r.json() as Promise<PeatRegions>).then((fc) => fc.features.map((f, i) => {
    const { lat, lon } = centre(f.properties.id);
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const km2 = polys.reduce((a, p) => a + ringArea(p[0], lat), 0);
    // A few fictional fires so every status shows up: South Sumatra and Central Kalimantan burn the most.
    const heat = ['16', '62'].includes(f.properties.province) ? 0.55 + 0.45 * rand(i, 7) : rand(i, 3) * 0.5;
    return {
      id: f.properties.id, province: f.properties.province, lat, lon, peat_km2: round(km2, 1), heat, seed: i,
      bounds: [lon - CELL.lon / 2, lat - CELL.lat / 2, lon + CELL.lon / 2, lat + CELL.lat / 2] as [number, number, number, number],
    };
  }));
  return bases;
}

/** One satellite's view of a region; `anomaly` is the fire signal it would see on a clear cell. */
function view(b: Base, sat: SatelliteName, k: number, cloud: number, anomaly: number): SatelliteView {
  const h = sat === 'himawari9';
  const n = h ? 640 + (b.seed % 7) * 20 : 800 + (b.seed % 5) * 25;
  const nPeat = Math.max(4, Math.round(b.peat_km2 / (h ? 5 : 4)));
  const clear = Math.round(n * (1 - cloud));
  const counts = { n_pixels: n, n_clear: clear, cloud_fraction: round(cloud, 4), n_peat: nPeat, n_peat_clear: Math.round(nPeat * (1 - cloud)) };
  const none = { max_z: null, n_hot: 0, n_hot_peat: 0, hot_on_peat: null, hot_lat: null, hot_lon: null, mwir_k: null, lwir_k: null };
  if (clear < 30) return { ...counts, background_k: null, background_mad_k: null, max_anomaly_k: null, ...none };
  const bg = round(0.5 + 3 * rand(b.seed, k, h ? 31 : 32), 3), mad = round(0.4 + 0.8 * rand(b.seed, k, h ? 33 : 34), 3);
  if (anomaly < 1.5) return { ...counts, background_k: bg, background_mad_k: mad, max_anomaly_k: 0, ...none, max_z: 0 };
  const hot = anomaly >= 3 ? Math.max(1, Math.round(anomaly / 3)) : 0;
  const onPeat = rand(b.seed, 23) < 0.6;
  const shift = h ? 0 : 0.012; // the other viewing angle puts GK2A's hottest pixel 1–2 km away
  return {
    ...counts, background_k: bg, background_mad_k: mad, max_anomaly_k: round(anomaly, 3), max_z: round(anomaly / mad, 2),
    n_hot: hot, n_hot_peat: onPeat ? Math.ceil(hot / 2) : 0, hot_on_peat: onPeat,
    hot_lat: round(b.lat + (rand(b.seed, 21) - 0.5) * 0.3 + shift, 4), hot_lon: round(b.lon + (rand(b.seed, 22) - 0.5) * 0.4 + shift, 4),
    mwir_k: round(296 + bg + anomaly, 2), lwir_k: round(295 + 0.25 * anomaly, 2),
  };
}

function powerOf(b: Base): PowerSupport {
  const dt = round(-1 + 4 * b.heat, 3), base = 299.4;
  return {
    observed_at: '2026-10-09T23:00:00Z', skin_temperature_k: round(base + dt, 2), baseline_k: base, baseline_std_k: 0.9,
    baseline_samples: 155, baseline: 'UTC hour 23, ±15 days of 10-09, years 2021-2025', delta_t_k: dt,
    relative_humidity_pct: round(94 - 20 * b.heat, 2), updated_at: '2026-10-11T18:30:00Z',
  };
}

function slots(b: Base): SlotRecord[] {
  const out: SlotRecord[] = [];
  const power = powerOf(b);
  const powerSupport = power.delta_t_k != null && power.delta_t_k > 1 ? round(Math.min(1, (power.delta_t_k - 1) / 2), 3) : null;
  const viirs = b.heat > 0.6 ? 1 : b.heat > 0.45 ? 0.5 : null;
  const loner = b.seed % 17 === 5; // a region only Himawari sees burning, as on 11 October in Riau
  for (let k = SLOTS - 1; k >= 0; k--) {
    const t = LATEST - k * SLOT;
    const d = new Date(t);
    const solar = (((d.getUTCHours() + d.getUTCMinutes() / 60 + b.lon / 15) % 24) + 24) % 24;
    const elevation = round(90 * Math.sin(((solar - 6) / 12) * Math.PI), 1);
    const night = elevation < -6;
    const ramp = 1 - k / SLOTS; // the fire grows towards the latest slot
    const fire = b.heat > 0.6 ? b.heat * (4 + 34 * ramp) : b.heat > 0.3 && night ? 1 + 6 * b.heat * ramp : 0;
    const signal = (night ? 1 : 0.6) * fire; // daylight in the 3.9 um channel hides part of the signal
    const cloudy = rand(b.seed, Math.floor(k / 9), 4) < 0.22 + 0.25 * (1 - b.heat);
    const cloudH = cloudy ? 0.62 + 0.38 * rand(b.seed, k, 5) : 0.35 * rand(b.seed, k, 6);
    const cloudG = Math.min(1, Math.max(0, cloudH + (rand(b.seed, k, 8) - 0.5) * 0.12));
    const views: Record<SatelliteName, SatelliteView | null> = {
      himawari9: view(b, 'himawari9', k, cloudH, loner && night ? 8.9 : signal),
      gk2a: k === GK2A_GAP ? null : view(b, 'gk2a', k, cloudG, loner ? 0 : signal * (0.9 + 0.2 * rand(b.seed, k, 9))),
    };
    const rh = round(Math.min(98, Math.max(18, 92 - Math.max(0, Math.sin(((solar - 6) / 12) * Math.PI)) * (30 + 35 * b.heat * ramp) + 6 * rand(b.seed, Math.floor(k / 6), 2))), 1);
    const f = fuse(views, night, [b.lat, b.lon], viirs, powerSupport);
    const cap = f.quality === 'DEGRADED'
      ? [...(night ? [] : ['daytime']), ...f.flags.filter((x) => x.startsWith('single_satellite') || x === 'satellites_disagree').map((x) => x.replace(/[_:]/g, ' '))].join(', ')
      : null;
    const a = f.delta == null
      ? { status: 'NO_OBSERVABLE' as Status, utilities: {}, memberships: {}, reason: f.cloud > 60 ? `not observable: cloud cover ${f.cloud.toFixed(0)}% > 60%` : 'not observable: too few clear pixels in the region' }
      : assess(f.delta, rh, f.cloud, f.support, cap);
    out.push({
      observed_at: iso(t), night, sun_elevation_deg: elevation, views,
      inputs: { delta_t_k: f.delta, cloud_cover_pct: f.cloud, relative_humidity_pct: rh, hot_lat: f.lat, hot_lon: f.lon },
      support: f.support, quality: { thermal: f.quality, relative_humidity: 'ACCEPTED' }, flags: [...f.flags, 'model_estimate'],
      sources: { thermal: THERMAL, relative_humidity: 'open_meteo', viirs_support: 'nasa_firms', power_support: 'nasa_power' },
      ...a,
    });
  }
  return out;
}

function transitions(ss: SlotRecord[]): TransitionRecord[] {
  const out: TransitionRecord[] = [];
  let prev: Status | null = null;
  for (const s of ss) {
    if (s.status !== prev) out.push({ observed_at: s.observed_at, previous: prev, current: s.status, utilities: s.utilities, reason: s.reason });
    prev = s.status;
  }
  return out.reverse();
}

// ---------- agent (fictional results) ----------
const verifications = new Map<string, Verification[]>();
let used = 0;

function sampleVerification(b: Base, s: SlotRecord, at: string, trigger: 'auto' | 'manual'): Verification {
  const count = Math.round(b.heat > 0.6 ? 20 + 120 * rand(b.seed, 9) : b.heat > 0.3 ? 3 * rand(b.seed, 8) : 0);
  const evidence: Hotspot[] = Array.from({ length: Math.min(count, 15) }, (_, i) => {
    const lat = b.lat + (rand(b.seed, i, 11) - 0.5) * CELL.lat, lon = b.lon + (rand(b.seed, i, 12) - 0.5) * CELL.lon;
    const dy = (lat - b.lat) * 110.57, dx = (lon - b.lon) * 111.32 * Math.cos((b.lat * Math.PI) / 180);
    return {
      lat: round(lat, 4), lon: round(lon, 4), acquired_at: iso(Date.parse(s.observed_at) + (rand(b.seed, i, 13) - 0.5) * 36e5 * 30),
      hours_from_observation: round((rand(b.seed, i, 13) - 0.5) * 30, 1), distance_km: round(Math.hypot(dx, dy), 1),
      confidence: rand(b.seed, i, 14) < 0.7 ? 'n' : rand(b.seed, i, 15) < 0.5 ? 'h' : 'l',
      brightness_k: round(310 + 50 * rand(b.seed, i, 16), 1), frp_mw: round(1 + 40 * rand(b.seed, i, 17), 1),
      daynight: rand(b.seed, i, 18) < 0.5 ? 'D' : 'N', satellite: rand(b.seed, i, 19) < 0.5 ? 'N20' : 'N21',
    };
  });
  const high = evidence.length ? Math.max(...evidence.map((e) => e.brightness_k ?? 0)) : null;
  const status = count >= 10 ? 'CONFIRMED' : count === 0 ? 'REJECTED' : 'NEEDS_MANUAL_REVIEW';
  const place = `region ${b.id}`;
  return {
    id: at.replace(/[-:]/g, ''), region_id: b.id, trigger, requested_by: trigger === 'manual' ? 'operator@example.org' : null, at,
    observed_at: s.observed_at, region_status: s.status, validation_status: status, agent_validation_status: status,
    confidence_score: status === 'CONFIRMED' ? 0.9 : status === 'REJECTED' ? 0.7 : 0.4,
    analysis: count
      ? `Sample result: ${count} VIIRS hotspots within the search window around ${place}, the nearest ${Math.min(...evidence.map((e) => e.distance_km))} km from the centre. This is a thermal indication, not a visual confirmation of fire or smoke.`
      : `Sample result: no VIIRS hotspots within 48 hours and 25 km of ${place}. Clouds or overpass times can hide a fire, so this is not proof that there is none.`,
    supporting_data: { firms_hotspot_count: count, highest_brightness_temp: high },
    draft_operator_alert: {
      title: `Thermal indication near peat ${b.id}`,
      message: `Himawari-9 and GK2A see a thermal anomaly and NASA FIRMS shows ${count} hotspots near peat region ${b.id}. This is a thermal indication that needs field verification.`,
    },
    checks: [], error: null,
    tool_calls: [{ hours_window: 24, buffer_km: 10, from: iso(Date.parse(s.observed_at) - 864e5), to: iso(Date.parse(s.observed_at) + 864e5), hotspot_count: count, confident_count: evidence.filter((e) => e.confidence !== 'l').length, highest_brightness_temp_k: high, error: null }],
    evidence, model: 'gemini-3.5-flash', usage: { model_calls: 2, prompt_tokens: 3400, output_tokens: 340, thought_tokens: 0 },
    duration_s: 11.4, decision: null,
  };
}

const wait = <T>(v: T, ms = 300): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), ms + Math.random() * 200));

async function find(id: string) {
  const b = (await loadBases()).find((x) => x.id === id);
  if (!b) throw new ApiError(404, 'NOT_FOUND', 'Unknown region.');
  return b;
}

function summary(b: Base): RegionSummary {
  const ss = slots(b);
  const last = ss[ss.length - 1];
  const since = transitions(ss)[0].observed_at;
  const v = verifications.get(b.id)?.[0];
  return {
    id: b.id, province: b.province, lat: b.lat, lon: b.lon, bounds: b.bounds, peat_km2: b.peat_km2,
    status: last.status, since, observed_at: last.observed_at, utilities: last.utilities, updated_at: NOW,
    agent_requested_at: null, last_agent_at: v?.at ?? null,
    verification: v ? { id: v.id, validation_status: v.validation_status, confidence_score: v.confidence_score, trigger: v.trigger, at: v.at, observed_at: v.observed_at, error: v.error, decision: v.decision?.action ?? null } : null,
    inputs: last.inputs, quality: last.quality, reason: last.reason, flags: last.flags, night: last.night,
  };
}

export const mockRegionApi = {
  regions: async () => wait((await loadBases()).map(summary), 250),
  region: async (id: string, hours = 24): Promise<RegionDetail> => {
    const b = await find(id);
    const ss = slots(b);
    const s = summary(b);
    return wait({
      id: s.id, province: s.province, lat: s.lat, lon: s.lon, bounds: s.bounds, peat_km2: s.peat_km2, status: s.status,
      since: s.since, observed_at: s.observed_at, utilities: s.utilities, updated_at: s.updated_at,
      agent_requested_at: null, last_agent_at: s.last_agent_at, verification: s.verification, last_error: null,
      latest: ss[ss.length - 1], slots: ss.slice(-hours * 6), hours: [], power: powerOf(b),
      transitions: transitions(ss).slice(0, 20), verifications: verifications.get(b.id) ?? [],
    }, 300);
  },
  agent: async (): Promise<AgentInfo> => wait({ configured: true, model: 'gemini-3.5-flash', daily_quota: QUOTA, used_today: used, remaining: QUOTA - used, max_tool_calls: 3 }, 120),
  verifyRegion: async (id: string): Promise<Verification> => {
    const b = await find(id);
    if (used >= QUOTA) throw new ApiError(429, 'AGENT_QUOTA_EXHAUSTED', "Today's agent quota is used up.");
    const last = verifications.get(id)?.[0];
    if (last && Date.now() - Date.parse(last.at) < 5 * 60_000) throw new ApiError(409, 'VERIFIED_RECENTLY', 'This region was verified less than 5 minutes ago.');
    used += 1;
    const ss = slots(b);
    const v = sampleVerification(b, ss[ss.length - 1], new Date().toISOString().replace(/\.\d+Z$/, 'Z'), 'manual');
    verifications.set(id, [v, ...(verifications.get(id) ?? [])]);
    return wait(v, 1400);
  },
  decideRegion: async (id: string, body: RegionDecisionRequest): Promise<Decision> => {
    await find(id);
    const v = verifications.get(id)?.find((x) => x.id === body.verification_id);
    if (!v) throw new ApiError(404, 'NOT_FOUND', 'Verification not found.');
    if (v.decision) throw new ApiError(409, 'ALREADY_DECIDED', 'An operator has already decided on this verification.');
    if (body.action === 'publish' && v.validation_status === 'REJECTED') throw new ApiError(409, 'VERIFICATION_REJECTED', 'The agent rejected this indication.');
    if (body.action === 'reject' && !body.reason?.trim()) throw new ApiError(422, 'REASON_REQUIRED', 'A rejection reason is required.');
    if (body.action === 'publish' && (!body.caption?.trim() || body.caption.length > 1024)) throw new ApiError(422, 'CAPTION_INVALID', 'The caption is empty or too long.');
    const publish = body.action === 'publish';
    v.decision = {
      action: body.action, by: 'operator@example.org', at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      reason: publish ? null : body.reason!.trim(), alert_id: publish ? `A-${id}-${v.id}` : null,
      notifications: publish ? { state: 'outbox_saved', recipients: 2, jobs: 2 } : null,
    };
    return wait(v.decision, 500);
  },
};

// One pre-made result so the verification card has something to show before anyone presses Re-verify.
void loadBases().then((all) => {
  const hot = [...all].sort((a, b) => b.heat - a.heat)[0];
  const ss = slots(hot);
  verifications.set(hot.id, [sampleVerification(hot, ss[ss.length - 1], '2026-10-11T18:31:10Z', 'auto')]);
});
