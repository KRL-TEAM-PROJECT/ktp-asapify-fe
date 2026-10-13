import {
  ApiError,
  type AgentInfo, type Decision, type HourRecord, type Hotspot, type PeatRegions, type ProvinceCode, type RatedStatus,
  type RegionDecisionRequest, type RegionDetail, type RegionSummary, type Status, type TransitionRecord, type Verification,
} from '../types';
import { rand } from './rand';

// FICTIONAL region data for a demo without a backend (the top bar says SAMPLE DATA). The region list and the peat
// shapes are the real ones (public/regions.geojson); every number below is generated. The rules mirror the backend
// engine (asapify_engine/rules.py) so the statuses stay consistent with the inputs.

const LATEST = Date.parse('2026-10-11T06:00:00Z'); // 13:00 UTC+7; NASA POWER publishes 2–3 days behind
const NOW = '2026-10-13T06:00:00Z';
const HOURS = 72;
const CELL = { lat: 0.5, lon: 0.625 };
const QUOTA = 20;

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
const SEVERITY: Record<RatedStatus, number> = { SAFE: 0, WARNING: 1, ALERT: 2 };

function assess(dt: number, rh: number, cloud: number) {
  if (cloud > 60) return { status: 'NO_OBSERVABLE' as Status, utilities: {}, memberships: {}, reason: `not observable: cloud cover ${cloud.toFixed(0)}% > 60%` };
  const x: Record<string, number> = { delta_t_low: dt, delta_t_medium: dt, delta_t_high: dt, humidity_high: rh, humidity_low: rh };
  const memberships = Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, round(trapezoid(x[k], s), 4)]));
  const utilities = Object.fromEntries((Object.keys(WEIGHTS) as RatedStatus[]).map((s) => {
    const w = WEIGHTS[s];
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    return [s, round(Object.entries(w).reduce((a, [k, v]) => a + v * memberships[k], 0) / total, 4)];
  })) as Record<RatedStatus, number>;
  const ranked = (Object.keys(utilities) as RatedStatus[]).sort((a, b) => utilities[b] - utilities[a] || SEVERITY[b] - SEVERITY[a]);
  const [top, next] = ranked;
  const gap = round(utilities[top] - utilities[next], 6);
  const pick = gap <= 0.05 && SEVERITY[next] > SEVERITY[top] ? next : top;
  const reason = pick === top
    ? `${top} has the highest utility (${utilities[top].toFixed(3)})`
    : `${next} chosen over ${top}: utilities within the 0.05 safety margin (${gap.toFixed(3)})`;
  return { status: pick as Status, utilities, memberships, reason };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

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
    // A few fictional hot spots so every status shows up: South Sumatra and Central Kalimantan dry out the most.
    const heat = ['16', '62'].includes(f.properties.province) ? 0.55 + 0.45 * rand(i, 7) : rand(i, 3) * 0.5;
    return {
      id: f.properties.id, province: f.properties.province, lat, lon, peat_km2: round(km2, 1), heat, seed: i,
      bounds: [lon - CELL.lon / 2, lat - CELL.lat / 2, lon + CELL.lon / 2, lat + CELL.lat / 2] as [number, number, number, number],
    };
  }));
  return bases;
}

function hours(b: Base): HourRecord[] {
  const out: HourRecord[] = [];
  for (let k = HOURS - 1; k >= 0; k--) {
    const t = LATEST - k * 3_600_000;
    const local = (new Date(t).getUTCHours() + 7) % 24;
    const day = Math.max(0, Math.sin(((local - 6) / 12) * Math.PI)); // 0 at night, 1 at noon UTC+7
    const ramp = 1 - k / HOURS; // the last day is the driest
    const dt = round(-0.8 + 1.4 * rand(b.seed, k, 1) + day * b.heat * (5 + 6 * ramp), 3);
    const rh = round(Math.min(98, Math.max(18, 92 - day * (30 + 35 * b.heat * ramp) + 6 * rand(b.seed, k, 2))), 2);
    const cloudy = rand(b.seed, Math.floor(k / 5), 4) < 0.28 + 0.2 * (1 - b.heat);
    const cloud = round(cloudy ? 65 + 35 * rand(b.seed, k, 5) : 45 * rand(b.seed, k, 6), 0);
    const skin = round(299 + dt + 4 * day, 2);
    const a = assess(dt, rh, cloud);
    out.push({
      observed_at: iso(t),
      inputs: {
        skin_temperature_k: skin, baseline_k: round(skin - dt, 3), baseline_std_k: 1.2, baseline_samples: 155,
        baseline: `UTC hour ${String(new Date(t).getUTCHours()).padStart(2, '0')}, ±15 days of ${iso(t).slice(5, 10)}, years 2021-2025`,
        delta_t_k: dt, relative_humidity_pct: rh, cloud_cover_pct: cloud,
      },
      quality: { skin_temperature: 'ACCEPTED', relative_humidity: 'ACCEPTED', cloud_cover: 'ACCEPTED' },
      flags: ['model_estimate', 'reanalysis_estimate'],
      sources: { skin_temperature: 'nasa_power', relative_humidity: 'nasa_power', cloud_cover: 'open_meteo' },
      ...a,
    });
  }
  return out;
}

function transitions(hs: HourRecord[]): TransitionRecord[] {
  const out: TransitionRecord[] = [];
  let prev: Status | null = null;
  for (const h of hs) {
    if (h.status !== prev) out.push({ observed_at: h.observed_at, previous: prev, current: h.status, utilities: h.utilities, reason: h.reason });
    prev = h.status;
  }
  return out.reverse();
}

// ---------- agent (fictional results) ----------
const verifications = new Map<string, Verification[]>();
let used = 0;

function sampleVerification(b: Base, h: HourRecord, at: string, trigger: 'auto' | 'manual'): Verification {
  const count = Math.round(b.heat > 0.6 ? 20 + 120 * rand(b.seed, 9) : b.heat > 0.3 ? 3 * rand(b.seed, 8) : 0);
  const evidence: Hotspot[] = Array.from({ length: Math.min(count, 15) }, (_, i) => {
    const lat = b.lat + (rand(b.seed, i, 11) - 0.5) * CELL.lat, lon = b.lon + (rand(b.seed, i, 12) - 0.5) * CELL.lon;
    const dy = (lat - b.lat) * 110.57, dx = (lon - b.lon) * 111.32 * Math.cos((b.lat * Math.PI) / 180);
    return {
      lat: round(lat, 4), lon: round(lon, 4), acquired_at: iso(Date.parse(h.observed_at) + (rand(b.seed, i, 13) - 0.5) * 36e5 * 30),
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
    observed_at: h.observed_at, region_status: h.status, validation_status: status, agent_validation_status: status,
    confidence_score: status === 'CONFIRMED' ? 0.9 : status === 'REJECTED' ? 0.7 : 0.4,
    analysis: count
      ? `Sample result: ${count} VIIRS hotspots within the search window around ${place}, the nearest ${Math.min(...evidence.map((e) => e.distance_km))} km from the centre. This is a thermal indication, not a visual confirmation of fire or smoke.`
      : `Sample result: no VIIRS hotspots within 48 hours and 25 km of ${place}. Clouds or overpass times can hide a fire, so this is not proof that there is none.`,
    supporting_data: { firms_hotspot_count: count, highest_brightness_temp: high },
    draft_operator_alert: {
      title: `Thermal indication near peat ${b.id}`,
      message: `NASA FIRMS shows ${count} hotspots near peat region ${b.id}. This is a thermal indication that needs field verification.`,
    },
    checks: [], error: null,
    tool_calls: [{ hours_window: 24, buffer_km: 10, from: iso(Date.parse(h.observed_at) - 864e5), to: iso(Date.parse(h.observed_at) + 864e5), hotspot_count: count, confident_count: evidence.filter((e) => e.confidence !== 'l').length, highest_brightness_temp_k: high, error: null }],
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
  const hs = hours(b);
  const last = hs[hs.length - 1];
  const since = transitions(hs)[0].observed_at;
  const v = verifications.get(b.id)?.[0];
  return {
    id: b.id, province: b.province, lat: b.lat, lon: b.lon, bounds: b.bounds, peat_km2: b.peat_km2,
    status: last.status, since, observed_at: last.observed_at, utilities: last.utilities, updated_at: NOW,
    agent_requested_at: null, last_agent_at: v?.at ?? null,
    verification: v ? { id: v.id, validation_status: v.validation_status, confidence_score: v.confidence_score, trigger: v.trigger, at: v.at, observed_at: v.observed_at, error: v.error, decision: v.decision?.action ?? null } : null,
    inputs: last.inputs, quality: last.quality, reason: last.reason,
  };
}

export const mockRegionApi = {
  regions: async () => wait((await loadBases()).map(summary), 250),
  region: async (id: string, n = HOURS): Promise<RegionDetail> => {
    const b = await find(id);
    const hs = hours(b);
    const s = summary(b);
    return wait({
      id: s.id, province: s.province, lat: s.lat, lon: s.lon, bounds: s.bounds, peat_km2: s.peat_km2, status: s.status,
      since: s.since, observed_at: s.observed_at, utilities: s.utilities, updated_at: s.updated_at,
      agent_requested_at: null, last_agent_at: s.last_agent_at, verification: s.verification, last_error: null,
      latest: hs[hs.length - 1], hours: hs.slice(-n), transitions: transitions(hs).slice(0, 20),
      verifications: verifications.get(b.id) ?? [],
    }, 300);
  },
  agent: async (): Promise<AgentInfo> => wait({ configured: true, model: 'gemini-3.5-flash', daily_quota: QUOTA, used_today: used, remaining: QUOTA - used, max_tool_calls: 3 }, 120),
  verifyRegion: async (id: string): Promise<Verification> => {
    const b = await find(id);
    if (used >= QUOTA) throw new ApiError(429, 'AGENT_QUOTA_EXHAUSTED', "Today's agent quota is used up.");
    const last = verifications.get(id)?.[0];
    if (last && Date.now() - Date.parse(last.at) < 5 * 60_000) throw new ApiError(409, 'VERIFIED_RECENTLY', 'This region was verified less than 5 minutes ago.');
    used += 1;
    const hs = hours(b);
    const v = sampleVerification(b, hs[hs.length - 1], new Date().toISOString().replace(/\.\d+Z$/, 'Z'), 'manual');
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
  const hs = hours(hot);
  verifications.set(hot.id, [sampleVerification(hot, hs[hs.length - 1], '2026-10-13T05:42:10Z', 'auto')]);
});
