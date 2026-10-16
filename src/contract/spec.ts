// asapify-api v1 contract used by this UI. Source of truth for types: src/types.ts.
// origin 'backend' = already in backend.html; 'fe' = FE proposal the BE team still has to agree on.

export type Origin = 'backend' | 'fe';

export interface Field {
  name: string;
  type: string;
  req: boolean;
  desc: string;
  origin?: Origin; // default: the schema's origin
}

export interface Schema {
  name: string;
  origin: Origin;
  desc: string;
  fields: Field[];
}

export type ExampleKey =
  | 'health'
  | 'deliveries' | 'joinLinks' | 'tgInviteReq'
  | 'regions' | 'region' | 'agentInfo' | 'regionVerifyRes' | 'regionDecisionReq' | 'regionDecisionRes'
  | 'dayIndex' | 'dayArchive'
  | 'accessList' | 'accessReq' | 'accessRes' | 'activateRes' | 'tgGroups' | 'tgGroupLink'
  | 'signupStatus' | 'signupReq' | 'signupRes';

export interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  auth: 'public' | 'user' | 'operator';
  title: string;
  purpose: string;
  usedBy: string | null; // null = not used by the UI yet
  params?: Field[];
  body?: { schema: string; example: ExampleKey };
  responses: { code: number; schema: string; example?: ExampleKey; note?: string }[];
  errors: string[];
}

export const STATUS_T = "'SAFE' | 'NO_OBSERVABLE' | 'WARNING' | 'ALERT'";
const ISO = 'string · ISO 8601 UTC';
export const PROV_T = "'11' … '19' | '21' | '61' … '65'";

export const CONVENTIONS: { title: string; body: string }[] = [
  {
    title: 'Base URL',
    body: 'Every path below is prefixed with `/api/v1`. Production: Firebase Hosting rewrites `/api/**` to Cloud Run `asapify-api` (same origin, no CORS). In dev, Vite proxies `/api` to `http://localhost:8080`.',
  },
  {
    title: 'Authentication',
    body: '`operator` endpoints require `Authorization: Bearer <Firebase ID token>` with custom claim `role = "operator"`. Missing or invalid token → 401 `UNAUTHENTICATED`; no operator role → 403 `FORBIDDEN`. `public` endpoints need no header.',
  },
  {
    title: 'Time',
    body: 'All times are UTC, ISO 8601 with a `Z` suffix and second precision, e.g. `2023-09-24T15:10:00Z`. The server never sends local time; the UI converts to UTC+7.',
  },
  {
    title: 'Coordinates',
    body: 'GeoJSON is always `[lon, lat]`. Separate numeric fields are explicit (`lat`, `lon`). Province = BPS code (11–19, 21 Sumatra; 61–65 Kalimantan).',
  },
  {
    title: 'Null vs absent',
    body: 'Every schema field is always sent. Unknown values are `null` (the UI shows "not available"), never omitted. Scores 0–1 are sent as-is (≤ 3 decimals); the UI rounds.',
  },
  {
    title: 'Errors',
    body: 'Non-2xx responses use the envelope `{"error": {"code", "message"}}`. `code` is stable (upper case); the UI writes its own message from `code`. `message` shows only when the UI does not know the `code` yet.',
  },
  {
    title: 'Content rules',
    body: 'Status comes only from the rule engine; agent verification has no status or level field. No text may call ALERT a "confirmed fire". The agent writes its analysis and draft alert in English (`analysis`, `draft_operator_alert`); captions are English too.',
  },
];

export const ERRORS: { code: string; http: number; when: string }[] = [
  { code: 'UNAUTHENTICATED', http: 401, when: 'Token missing, expired or invalid' },
  { code: 'FORBIDDEN', http: 403, when: 'User is not an operator, or the Google email is not verified' },
  { code: 'NOT_FOUND', http: 404, when: 'Region or alert does not exist' },
  { code: 'VALIDATION', http: 400, when: 'Malformed parameter/body (e.g. `date` is not YYYY-MM-DD)' },
  { code: 'ALREADY_DECIDED', http: 409, when: 'Verification already published/rejected by another operator' },
  { code: 'REASON_REQUIRED', http: 422, when: 'Reject without `reason`' },
  { code: 'CAPTION_INVALID', http: 422, when: 'Publish with an empty caption or > 1,024 characters' },
  { code: 'TELEGRAM_NOT_CONFIGURED', http: 503, when: 'The Telegram bot is not set up in the backend' },
  { code: 'DATA_NOT_READY', http: 503, when: 'No data yet: storage not configured, or the region has not been assessed' },
  { code: 'INTEGRATION_NOT_READY', http: 503, when: 'The verification agent is not configured (FIRMS key or project missing)' },
  { code: 'AGENT_QUOTA_EXHAUSTED', http: 429, when: 'The daily agent quota is used up; resets at 00:00 UTC' },
  { code: 'VERIFIED_RECENTLY', http: 409, when: 'The region was verified less than 5 minutes ago' },
  { code: 'VERIFICATION_REJECTED', http: 409, when: 'Publish on a verification the agent rejected' },
  { code: 'CANNOT_REMOVE_SELF', http: 409, when: 'An operator tried to remove their own operator access' },
  { code: 'ADMIN_ONLY', http: 403, when: 'A self-registered (judging) operator called an Admin route: operator access or Telegram groups' },
  { code: 'SIGNUP_ENDED', http: 403, when: 'A self-registered operator after the judging window (OPERATOR_SIGNUP_UNTIL) has passed' },
  { code: 'SIGNUP_CLOSED', http: 403, when: 'Self-registration requested while it is closed' },
  { code: 'CAPTCHA_FAILED', http: 403, when: 'The reCAPTCHA Enterprise token is invalid, for another action, or too risky' },
  { code: 'CAPTCHA_UNAVAILABLE', http: 503, when: 'reCAPTCHA Enterprise could not be reached to check the token' },
];

export const SCHEMAS: Schema[] = [
  {
    name: 'Health', origin: 'backend',
    desc: 'Liveness check.',
    fields: [
      { name: 'status', type: "'ok'", req: true, desc: 'Always "ok" when the service is up.' },
      { name: 'version', type: 'string', req: true, desc: 'Running image version.' },
      { name: 'time', type: ISO, req: true, desc: 'Server time.' },
    ],
  },
  {
    name: 'ProvinceBoundary', origin: 'backend',
    desc: 'Static file `/provinces.geojson` served with the app (not an API endpoint): the 15 Sumatra + Kalimantan provinces, simplified ≈ 90 KB (≈ 30 KB gzip). Source geoBoundaries IDN ADM1 (ODbL, © OpenStreetMap contributors).',
    fields: [
      { name: 'features[].properties.code', type: PROV_T, req: true, desc: 'BPS province code.' },
      { name: 'features[].properties.name', type: 'string', req: true, desc: 'Province name (map label).' },
      { name: 'features[].geometry', type: 'MultiPolygon', req: true, desc: 'Province boundary.' },
    ],
  },
  {
    name: 'Decision', origin: 'backend',
    desc: 'Operator decision on one verification (once per verification).',
    fields: [
      { name: 'action', type: "'publish' | 'reject'", req: true, desc: 'Publish to the linked Telegram groups, or reject.' },
      { name: 'by', type: 'string (email)', req: true, desc: 'Operator email.' },
      { name: 'at', type: ISO, req: true, desc: 'Decision time.' },
      { name: 'reason', type: 'string | null', req: true, desc: 'Required for reject; null for publish.' },
      { name: 'alert_id', type: 'string | null', req: true, desc: '`A-{MMDD}-{nnn}` when published.' },
    ],
  },
  {
    name: 'DecisionRequest', origin: 'backend',
    desc: 'Operator decision body.',
    fields: [
      { name: 'action', type: "'publish' | 'reject'", req: true, desc: 'Operator choice. There are no levels.' },
      { name: 'caption', type: 'string ≤ 1024 | null', req: true, desc: 'Required for publish: notification text, editable by the operator; legacy markup is stripped for text channels.' },
      { name: 'reason', type: 'string | null', req: true, desc: 'Required for reject.' },
    ],
  },
  {
    name: 'DecisionResponse', origin: 'backend',
    desc: 'Saved decision and outbox summary; provider status is read through the deliveries endpoint.',
    fields: [
      { name: '…Decision', type: '—', req: true, desc: 'All Decision fields.' },
      { name: 'notifications', type: "{state: 'fanout_pending'|'outbox_saved'|'no_groups', groups: number, jobs: number} | null", req: true, desc: 'Saved outbox, not proof of delivery: one job per linked Telegram group. fanout_pending = the decision is saved but the jobs are not all queued yet; the backend sweep resumes it. no_groups = no group is linked.' },
      { name: 'queue', type: "{state: 'accepted'|'awaiting_recovery', count: number}", req: false, desc: 'Enqueue result for publish; Scheduler recovers enqueue failures.' },
    ],
  },
  {
    name: 'Delivery', origin: 'backend',
    desc: 'One send job for one channel and one recipient. No recipient address or chat_id.',
    fields: [
      { name: 'id', type: 'string (64 hex)', req: true, desc: 'Job id, deterministic (deduplication).' },
      { name: 'channel', type: "'telegram_group'", req: true, desc: 'Every job posts in one linked Telegram group.' },
      { name: 'group', type: 'string | null', req: true, desc: 'The group\'s title; null once it was unlinked. Never the chat id.' },
      { name: 'status', type: "'pending' | 'sending' | 'accepted' | 'failed' | 'unknown' | 'blocked' | 'cancelled' | 'simulated'", req: true, desc: 'accepted = the provider took it, not proof it was read. unknown = outcome uncertain, never resent automatically.' },
      { name: 'error', type: 'string | null', req: true, desc: 'Provider error code, if any.' },
      { name: 'attempts', type: 'number', req: true, desc: 'Number of send attempts.' },
      { name: 'created_at · started_at · finished_at', type: `${ISO} | null`, req: true, desc: 'Job timestamps.' },
    ],
  },
  {
    name: 'Error', origin: 'backend',
    desc: 'Envelope for every error response.',
    fields: [
      { name: 'error.code', type: 'string', req: true, desc: 'Stable code, see the error table.' },
      { name: 'error.message', type: 'string', req: true, desc: 'Message for the operator.' },
    ],
  },
  {
    name: 'RegionSummary', origin: 'backend',
    desc: 'One peat region of the risk engine (a NASA POWER cell with mapped peat) and its latest assessed slot (one every 15 minutes).',
    fields: [
      { name: 'id', type: 'string', req: true, desc: 'Cell centre, e.g. `R2.50S113.750E`.' },
      { name: 'province', type: PROV_T, req: true, desc: 'BPS code of the province holding most of its peat.' },
      { name: 'lat, lon', type: 'number', req: true, desc: 'Cell centre.' },
      { name: 'bounds', type: '[west, south, east, north]', req: true, desc: '0.5° × 0.625° NASA POWER cell.' },
      { name: 'peat_km2', type: 'number', req: true, desc: 'KHG peat area inside the cell.' },
      { name: 'status', type: `${STATUS_T} | null`, req: true, desc: 'Current state-machine status; null until the first cycle reaches the region.' },
      { name: 'since, observed_at, updated_at', type: `${ISO} | null`, req: true, desc: 'Status since; latest assessed slot; last write.' },
      { name: 'utilities', type: '{ SAFE?, WARNING?, ALERT?: number } | null', req: true, desc: 'Fuzzy MAUT utilities 0–1; empty when NO_OBSERVABLE.' },
      { name: 'verification', type: 'VerificationBrief | null', req: true, desc: 'Latest agent result: id, validation_status, confidence_score, trigger, at, observed_at, error, decision.' },
      { name: 'inputs, quality, reason, flags, night', type: 'RegionInputs, SlotQuality, string, string[], boolean', req: true, desc: 'From the latest slot; see SlotRecord.' },
    ],
  },
  {
    name: 'RegionDetail', origin: 'backend',
    desc: 'RegionSummary fields (without inputs/quality/reason/flags/night) plus the history of one region.',
    fields: [
      { name: 'latest', type: 'SlotRecord', req: false, desc: 'Latest assessed slot.' },
      { name: 'slots', type: 'SlotRecord[]', req: true, desc: 'Oldest first, 4 per hour (6 before 16 Oct 2026); `hours` query parameter, default 24 (96 slots), or one WIB day with `date`.' },
      { name: 'hours', type: 'object[]', req: true, desc: 'NASA POWER support per hour, oldest first: observed_at, inputs (skin_temperature_k, baseline_k, delta_t_k, relative_humidity_pct, rh_baseline_pct, rh_baseline_std_pct, dry_z, …), quality, flags. No status.' },
      { name: 'power', type: 'PowerSupport | null', req: false, desc: 'Latest POWER hour: observed_at, skin_temperature_k, baseline_k, baseline_std_k, delta_t_k, relative_humidity_pct, rh_baseline_pct, rh_baseline_std_pct, updated_at; dry_z = mean dryness in σ over the last dry_z_hours (24) published hours, each against its own hour\'s 2021–2025 normal; rh_normal = { mean, std }: two lists of 24 (% per UTC hour, null where the normal is too thin), the Open-Meteo fallback\'s normal. About 2–3 days behind.' },
      { name: 'transitions', type: 'object[]', req: true, desc: 'Last 20 status changes, newest first: observed_at, previous, current, utilities, reason.' },
      { name: 'verifications', type: 'Verification[]', req: true, desc: 'Last 10 agent runs, newest first.' },
      { name: 'last_error', type: 'string | null', req: true, desc: 'Error type of the last failed cycle for this region.' },
    ],
  },
  {
    name: 'SlotRecord', origin: 'backend',
    desc: 'Audit record of one satellite slot, rated every 15 minutes (design section 10, audit trail). Firestore keeps it 30 days.',
    fields: [
      { name: 'observed_at', type: ISO, req: true, desc: 'Scan start of the slot (UTC), not the ingestion time.' },
      { name: 'night, sun_elevation_deg', type: 'boolean, number', req: true, desc: 'Night = sun below −6° at the cell centre (informational). The sun elevation sets the sun shift: by day ΔT counts up to 1 K less.' },
      { name: 'views', type: '{ himawari9, gk2a: SatelliteView | null }', req: true, desc: 'Per satellite: n_pixels, n_clear, cloud_fraction, n_peat, n_peat_clear, background_k, background_mad_k, max_anomaly_k (0 = no fire-like pixel, null = too few clear pixels), max_z, n_hot, n_hot_peat, hot_on_peat, hot_lat, hot_lon, mwir_k, lwir_k, hot_pixels (up to 5 `{ lat, lon, anomaly_k }`, strongest first). null = no data for this slot.' },
      { name: 'inputs', type: 'RegionInputs', req: true, desc: 'delta_t_k (mean anomaly of the satellites that see the cell, weighted by clear fraction; null = not observable), cloud_cover_pct (clearest view), relative_humidity_pct (Open-Meteo), dry_z (dryness in σ against the NASA POWER normal), dry_source (`nasa_power`, `open_meteo_fallback` or null), hot_lat, hot_lon.' },
      { name: 'support', type: '{ viirs_support?, power_support?: number }', req: true, desc: 'Only at a possible hotspot; can only raise ALERT.' },
      { name: 'viirs', type: '{ lat, lon, acquired_at, confidence, distance_km }[]', req: false, desc: 'VIIRS detections within 10 km and 12 h of any hot pixel, nearest first, at most 5. Map evidence only; the support value comes from the strongest pixel.' },
      { name: 'quality', type: "{ thermal, relative_humidity: 'ACCEPTED' | 'DEGRADED' | 'REJECTED' | 'MISSING' }", req: true, desc: 'thermal ACCEPTED = both satellites agree; DEGRADED = one satellite or disagreement (informational, no cap); REJECTED = no clear view.' },
      { name: 'flags', type: 'string[]', req: true, desc: 'two_satellites_agree, two_satellites_quiet, satellites_disagree, single_satellite:<name>, no_data:<name>, no_clear_view, daytime, model_estimate, dryness_fallback:open_meteo.' },
      { name: 'status, utilities, memberships, reason', type: 'Status, object, object, string', req: true, desc: 'Rules-engine output for that slot: memberships delta_t_low/medium/high of the counted ΔT (+ support); the reason states the shift.' },
      { name: 'adjust', type: '{ delta_t_k, dry_z, rh_shift_k, sun_shift_k, delta_t_eff_k } | null', req: false, desc: 'ΔT counted = delta_t_k + rh_shift_k − sun_shift_k; rh_shift_k = 1 K · tanh(dry_z / 2), sun_shift_k = 1 K · max(0, sin(sun elevation)). Absent before 16 Oct 2026 and when NO_OBSERVABLE.' },
    ],
  },
  {
    name: 'DayIndex', origin: 'backend',
    desc: 'What the date picker needs for one month. Days are WIB calendar days (UTC+7).',
    fields: [
      { name: 'first, last', type: 'YYYY-MM-DD | null', req: true, desc: 'First and last archived day; null before the first slot is archived.' },
      { name: 'days', type: '{ date, alert, warning }[]', req: true, desc: 'The requested month\'s archived days in date order; `alert` / `warning` = some region reached that status that day.' },
    ],
  },
  {
    name: 'DayArchive', origin: 'backend',
    desc: 'Every archived slot of one WIB day, keyed by the satellites\' 10-minute scan times; one rated every 15 minutes (Firestore `engine_days/{date}`, one read, under 1 MiB, kept without TTL).',
    fields: [
      { name: 'date', type: 'YYYY-MM-DD', req: true, desc: 'The WIB day.' },
      { name: 'regions', type: 'string[]', req: true, desc: 'Region ids; `status` and `delta_t` of each slot follow this order.' },
      { name: 'slots[].key, slots[].at', type: `'HHMM' (UTC+7), ${ISO}`, req: true, desc: 'Slot time; oldest first.' },
      { name: 'slots[].satellites', type: "('himawari9' | 'gk2a')[]", req: true, desc: 'Satellites read in that slot.' },
      { name: 'slots[].status', type: 'string', req: true, desc: 'One code per region: S, W, A, N; `-` = not assessed in that slot.' },
      { name: 'slots[].delta_t', type: '(number | null)[]', req: true, desc: 'ΔT per region, K, one decimal.' },
      { name: 'slots[].hot', type: '{ [region]: { himawari9, gk2a, viirs, view } }', req: true, desc: 'Regions with a hot pixel: pixels `[lat, lon, ΔBT K]` (≤ 5 per satellite), VIIRS `[lat, lon, minutes from the slot]` (≤ 5), the fusion flag.' },
      { name: 'slots[].trimmed', type: 'boolean', req: false, desc: 'True when pixel detail was cut to keep the slot under 7,000 characters; statuses are never cut.' },
    ],
  },
  {
    name: 'Verification', origin: 'backend',
    desc: 'One agent run (design sections 7–9), checked by the backend before it is stored.',
    fields: [
      { name: 'id', type: 'string', req: true, desc: 'YYYYMMDDTHHMMSSZ; used as verification_id for the decision.' },
      { name: 'trigger, requested_by, at', type: "'auto' | 'manual', string | null, ISO", req: true, desc: 'Who started it and when.' },
      { name: 'observed_at, region_status', type: `${ISO}, ${STATUS_T}`, req: true, desc: 'The slot under review.' },
      { name: 'validation_status', type: "'CONFIRMED' | 'REJECTED' | 'NEEDS_MANUAL_REVIEW'", req: true, desc: 'After backend checks; numbers the tool never returned force NEEDS_MANUAL_REVIEW.' },
      { name: 'agent_validation_status', type: 'ValidationStatus | null', req: true, desc: 'What the agent answered.' },
      { name: 'confidence_score, analysis', type: 'number 0–1 | null, string', req: true, desc: 'From the YAML output.' },
      { name: 'supporting_data', type: '{ firms_hotspot_count, highest_brightness_temp } | null', req: true, desc: 'Must match a fetch_firms_data result.' },
      { name: 'draft_operator_alert', type: '{ title, message } | null', req: true, desc: 'Starting caption for Publish.' },
      { name: 'visual_evidence', type: "{ smoke, burn_scar: 'visible' | 'not_visible' | 'obscured' | 'no_image', image_date, notes } | null", req: false, desc: 'What the agent saw in the images. A CONFIRMED with clear images from the last 24 h showing neither smoke nor a burn scar is sent to manual review.' },
      { name: 'imagery', type: '{ date, hours_before_observation, images: { view, url }[], errors: string[] } | null', req: false, desc: 'NASA GIBS WMS images the agent was shown (true_color, false_color_swir, VIIRS thermal anomalies on top) from the last daytime NOAA-20 pass.' },
      { name: 'weather', type: '{ source, at, relative_humidity_pct, wind_speed_ms, wind_from_deg, precipitation_24h_mm } | { source, at: null } | { error } | null', req: false, desc: 'Open-Meteo at the hot pixel: context for the agent, never a rules input. at null = the hour was outside the model run; error = no answer within the time limit.' },
      { name: 'checks, error', type: 'string[], string | null', req: true, desc: 'Why the backend downgraded it; AGENT_TIMEOUT, INVALID_OUTPUT, LLM_CALL_LIMIT or AGENT_ERROR:<type>.' },
      { name: 'tool_calls, evidence', type: 'object[], Hotspot[]', req: true, desc: 'Every FIRMS query and up to 15 hotspots (lat, lon, acquired_at, distance_km, confidence, frp_mw, brightness_k).' },
      { name: 'model, usage, duration_s', type: 'string, object, number', req: true, desc: 'Cost trail.' },
      { name: 'decision', type: 'Decision | null', req: true, desc: 'Operator decision on this verification.' },
    ],
  },
  {
    name: 'AgentInfo', origin: 'backend',
    desc: 'Whether the Re-verify button can run.',
    fields: [
      { name: 'configured', type: 'boolean', req: true, desc: 'FIRMS key and project present.' },
      { name: 'model', type: 'string', req: true, desc: 'Gemini model on Gemini Enterprise.' },
      { name: 'daily_quota, used_today, remaining', type: 'integer', req: true, desc: 'Hard daily quota (UTC day), taken before any model call.' },
      { name: 'max_tool_calls', type: 'integer', req: true, desc: 'FIRMS calls per run.' },
    ],
  },
  {
    name: 'RegionDecisionRequest', origin: 'backend',
    desc: 'DecisionRequest plus the verification it decides on.',
    fields: [
      { name: 'action', type: "'publish' | 'reject'", req: true, desc: 'Publish posts the alert in every linked Telegram group (purpose = emergency).' },
      { name: 'caption', type: 'string | null', req: false, desc: 'Required for publish; ≤ 1,024 characters.' },
      { name: 'reason', type: 'string | null', req: false, desc: 'Required for reject.' },
      { name: 'verification_id', type: 'string', req: true, desc: 'Verification.id; a second decision on it → 409 ALREADY_DECIDED.' },
    ],
  },
  {
    name: 'OperatorAccess', origin: 'backend',
    desc: 'An address with operator access, or one waiting for its first sign-in. Stored in operator_access/{email}.',
    fields: [
      { name: 'email', type: 'string', req: true, desc: 'Lower case; the Google account address.' },
      { name: 'state', type: "'active' | 'pending'", req: true, desc: 'active = the account holds role=operator; pending = no verified account yet, granted at its first sign-in.' },
      { name: 'added_by, added_at', type: `string | null, ${ISO} | null`, req: true, desc: 'Who added the address and when; null when granted by hand with tools/set_operator.py.' },
      { name: 'activated_at', type: `${ISO} | null`, req: true, desc: 'When the account became an operator through this list.' },
    ],
  },
];

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'health', method: 'GET', path: '/health', auth: 'public',
    title: 'Health check',
    purpose: 'For Cloud Run uptime checks and deploy smoke tests.',
    usedBy: null,
    responses: [{ code: 200, schema: 'Health', example: 'health' }],
    errors: [],
  },
  {
    id: 'regions', method: 'GET', path: '/operator/regions', auth: 'operator',
    title: 'Peat regions',
    purpose: 'All 65 regions with their current status and latest inputs. The engine rates one satellite slot every 15 minutes, so the UI refreshes no faster than that.',
    usedBy: 'Regions map (home) → map fill, filters, list.',
    responses: [{ code: 200, schema: 'RegionSummary[]', example: 'regions' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'DATA_NOT_READY'],
  },
  {
    id: 'region', method: 'GET', path: '/operator/regions/{id}', auth: 'operator',
    title: 'Region detail',
    purpose: 'Latest slots (audit records), POWER support, the last 20 status changes and the last 10 verifications of one region. Each hour shown costs about 4 Firestore reads (one per rated slot).',
    usedBy: 'Region detail → timeline, satellites, utilities, status changes, verification card, decision.',
    params: [
      { name: 'id', type: 'path · string', req: true, desc: 'Region id, e.g. R2.50S113.750E.' },
      { name: 'hours', type: 'query · integer 1–72', req: false, desc: 'Default 24 (about 96 slots): the hours up to the latest slot.' },
      { name: 'date', type: 'query · YYYY-MM-DD', req: false, desc: 'One WIB day (00:00–23:50 UTC+7) instead of `hours`, at most 144 reads; slot records are kept 30 days.' },
    ],
    responses: [{ code: 200, schema: 'RegionDetail', example: 'region' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'DATA_NOT_READY'],
  },
  {
    id: 'days', method: 'GET', path: '/operator/days', auth: 'operator',
    title: 'Archived days of a month',
    purpose: 'Calendar marks for the day player: which days have archived slots and whether a region reached ALERT or WARNING. At most 33 reads.',
    usedBy: 'Regions map → day player bounds and its calendar.',
    params: [{ name: 'month', type: 'query · YYYY-MM', req: true, desc: 'Month shown by the calendar.' }],
    responses: [{ code: 200, schema: 'DayIndex', example: 'dayIndex' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'day', method: 'GET', path: '/operator/days/{date}', auth: 'operator',
    title: 'One archived day',
    purpose: 'Every slot of one WIB day in one read: region statuses and ΔT, hot pixels of both satellites and the VIIRS detections beside them.',
    usedBy: 'Regions map → day player ribbon, map colours, hot-pixel and VIIRS markers, list of an earlier slot.',
    params: [{ name: 'date', type: 'path · YYYY-MM-DD', req: true, desc: 'WIB day.' }],
    responses: [{ code: 200, schema: 'DayArchive', example: 'dayArchive' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION'],
  },
  {
    id: 'agent', method: 'GET', path: '/operator/agent', auth: 'operator',
    title: 'Agent status',
    purpose: 'Configuration and today\'s quota, so the Re-verify button can say why it is disabled.',
    usedBy: 'Regions map header, verification card.',
    responses: [{ code: 200, schema: 'AgentInfo', example: 'agentInfo' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'region-verify', method: 'POST', path: '/operator/regions/{id}/verify', auth: 'operator',
    title: 'Re-verify a region',
    purpose: 'One agent run now for the latest assessed slot (Gemini + fetch_firms_data, YAML checked against the tool). Takes 10–20 s; at most one per region per 5 minutes; counts against the daily quota.',
    usedBy: 'Region detail → Re-verify button.',
    params: [{ name: 'id', type: 'path · string', req: true, desc: 'Region id.' }],
    responses: [{ code: 200, schema: 'Verification', example: 'regionVerifyRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'DATA_NOT_READY', 'VERIFIED_RECENTLY', 'AGENT_QUOTA_EXHAUSTED', 'INTEGRATION_NOT_READY'],
  },
  {
    id: 'region-decision', method: 'POST', path: '/operator/regions/{id}/decision', auth: 'operator',
    title: 'Publish / reject a verification',
    purpose: 'Once per verification, audited (audit_log). Publish needs a caption: the decision is saved, then one queued message per linked Telegram group; having no group never fails a decision. Reject needs a reason. A REJECTED verification can only be rejected.',
    usedBy: 'Region detail → DecisionPanel.',
    params: [{ name: 'id', type: 'path · string', req: true, desc: 'Region id.' }],
    body: { schema: 'RegionDecisionRequest', example: 'regionDecisionReq' },
    responses: [{ code: 201, schema: 'DecisionResponse', example: 'regionDecisionRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_DECIDED', 'VERIFICATION_REJECTED', 'REASON_REQUIRED', 'CAPTION_INVALID'],
  },
  {
    id: 'operator-access', method: 'GET', path: '/operator/access', auth: 'operator',
    title: 'Operator access list',
    purpose: 'Every account holding role=operator plus the addresses waiting for their first sign-in. Asks Firebase for all operator accounts, so the UI loads it only when the panel opens.',
    usedBy: 'Regions map → Operator access panel.',
    responses: [{ code: 200, schema: 'OperatorAccess[]', example: 'accessList' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'ADMIN_ONLY'],
  },
  {
    id: 'operator-access-grant', method: 'POST', path: '/operator/access', auth: 'operator',
    title: 'Add an operator',
    purpose: 'Any operator may add an address. An existing, verified Google account becomes an operator at once (it signs in again to refresh its token); any other address waits until its first sign-in. Recorded in audit_log.',
    usedBy: 'Regions map → Operator access panel → Add operator.',
    body: { schema: '{ email: string }', example: 'accessReq' },
    responses: [{ code: 201, schema: 'OperatorAccess', example: 'accessRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION', 'ADMIN_ONLY'],
  },
  {
    id: 'operator-access-revoke', method: 'POST', path: '/operator/access/revoke', auth: 'operator',
    title: 'Remove an operator',
    purpose: 'Drops the claim and revokes the account\'s sessions, so access ends with its next request; deletes the allowlist entry. Nobody can remove their own access. The address travels in the body, never in the URL. Recorded in audit_log.',
    usedBy: 'Regions map → Operator access panel → Remove.',
    body: { schema: '{ email: string }', example: 'accessReq' },
    responses: [{ code: 200, schema: "{ email, state: 'removed' }" }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION', 'NOT_FOUND', 'CANNOT_REMOVE_SELF', 'ADMIN_ONLY'],
  },
  {
    id: 'tg-groups', method: 'GET', path: '/operator/telegram-groups', auth: 'operator',
    title: 'Linked Telegram groups',
    purpose: 'Groups that receive every published alert. The title only; the chat id stays on the server.',
    usedBy: 'Regions map → Telegram groups panel.',
    responses: [{ code: 200, schema: '{ id, title, invite_url, linked_by, linked_at }[]', example: 'tgGroups' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'ADMIN_ONLY'],
  },
  {
    id: 'tg-group-link', method: 'POST', path: '/operator/telegram-groups/link', auth: 'operator',
    title: 'Link a Telegram group',
    purpose: 'A one-time t.me/<bot>?startgroup=<code> link, valid 10 minutes. Telegram asks which group, adds the bot and posts /start@<bot> <code> there; the webhook then links that group.',
    usedBy: 'Regions map → Telegram groups panel → Add the bot to a group.',
    responses: [{ code: 200, schema: '{ url: string, expires_in_seconds: 600 }', example: 'tgGroupLink' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'TELEGRAM_NOT_CONFIGURED', 'ADMIN_ONLY'],
  },
  {
    id: 'tg-group-invite', method: 'PUT', path: '/operator/telegram-groups/{id}', auth: 'operator',
    title: 'Set a group\'s invite link',
    purpose: 'The link the public Get alerts page shows for this group. Only Telegram links: t.me/+code, t.me/joinchat/code or a public t.me/<name>. null removes the group from the page.',
    usedBy: 'Regions map → Telegram groups panel → Save link.',
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Group id from the list (64 hex characters).' }],
    body: { schema: '{ invite_url: string | null }', example: 'tgInviteReq' },
    responses: [{ code: 200, schema: '{ id, title, invite_url, linked_by, linked_at }' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'ADMIN_ONLY'],
  },
  {
    id: 'public-reads', method: 'GET', path: '/public/regions · /public/regions/{id} · /public/days · /public/days/{date}', auth: 'public',
    title: 'Public map, region and day archive',
    purpose: 'The same data as the /operator reads for anyone, read-only: operator emails and decision notes removed, a decision is only its action and time, region detail at most 24 hours. Cached by the Hosting CDN (s-maxage 120 s; past days one day).',
    usedBy: 'Regions map and region pages when no operator is signed in.',
    responses: [{ code: 200, schema: 'RegionSummary[] · RegionDetail · DayIndex · DayArchive' }],
    errors: ['VALIDATION', 'NOT_FOUND', 'DATA_NOT_READY'],
  },
  {
    id: 'join-links', method: 'GET', path: '/telegram/join', auth: 'public',
    title: 'Telegram groups to join',
    purpose: 'Title and invite link of every linked group that has one. Public: no sign-in, nothing else about the group.',
    usedBy: 'Get alerts page (/join).',
    responses: [{ code: 200, schema: '{ title, invite_url }[]', example: 'joinLinks' }],
    errors: [],
  },
  {
    id: 'tg-group-unlink', method: 'DELETE', path: '/operator/telegram-groups/{id}', auth: 'operator',
    title: 'Unlink a Telegram group',
    purpose: 'Stops alerts to the group; queued messages to it are cancelled. The bot stays in the group until someone removes it.',
    usedBy: 'Regions map → Telegram groups panel → Unlink.',
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Group id from the list (64 hex characters).' }],
    responses: [{ code: 200, schema: '{ unlinked: true }' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'ADMIN_ONLY'],
  },
  {
    id: 'access-activate', method: 'POST', path: '/access/activate', auth: 'user',
    title: 'Activate operator access at sign-in',
    purpose: 'Called by the web app after sign-in when the account is not an operator yet. An allowlisted address gets role=operator; the app then refreshes the ID token. Anyone else is unchanged.',
    usedBy: 'Sign-in (auth.ts), once per account and page load.',
    responses: [{ code: 200, schema: "{ role: 'operator' | null, changed: boolean }", example: 'activateRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'access-signup-status', method: 'GET', path: '/access/signup', auth: 'public',
    title: 'Is self-registration open (judging period)',
    purpose: 'Whether a signed-in account can register itself as an operator for the hackathon judging, until which WIB day, and the reCAPTCHA Enterprise site key to show. Closed unless the backend has OPERATOR_SIGNUP_UNTIL (not past) and RECAPTCHA_SITE_KEY.',
    usedBy: 'Sign-in page.',
    responses: [{ code: 200, schema: '{ open: boolean, until: YYYY-MM-DD | null, site_key: string | null }', example: 'signupStatus' }],
    errors: [],
  },
  {
    id: 'access-signup', method: 'POST', path: '/access/signup', auth: 'user',
    title: 'Register as operator with a CAPTCHA (judging period)',
    purpose: 'Sent by itself once the reCAPTCHA checkbox is solved (action operator_signup). The backend checks the token with one assessment and sets role=operator plus signup_until; the app then refreshes the ID token. Such an operator cannot use the Admin routes (ADMIN_ONLY) and loses access after that day (SIGNUP_ENDED). An operator the team added is unchanged.',
    usedBy: 'Sign-in page → Operator access for judging.',
    body: { schema: '{ token: string }', example: 'signupReq' },
    responses: [{ code: 200, schema: "{ role: 'operator', changed: boolean, signup_until: YYYY-MM-DD | null }", example: 'signupRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'SIGNUP_CLOSED', 'CAPTCHA_FAILED', 'CAPTCHA_UNAVAILABLE'],
  },
  {
    id: 'deliveries', method: 'GET', path: '/operator/alerts/{id}/deliveries', auth: 'operator',
    title: 'Delivery status per Telegram group',
    purpose: 'Every send job of one alert: the group\'s title, status and timestamps. Never a chat id.',
    usedBy: 'Region detail → DeliveryStatus under the decision. Polls every 15 s while a job is running, then every 60 s until 1 h after publishing.',
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Alert id, e.g. A-R2.00S113.750E-20230923T165500Z.' }],
    responses: [{ code: 200, schema: 'Delivery', example: 'deliveries', note: 'Delivery[].' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
];

/** Internal endpoints (asapify-agent and asapify-notify) — not for the UI; listed so the BE team knows the boundary. */
export const INTERNAL: { method: string; path: string; desc: string }[] = [
  { method: 'POST', path: '/api/v1/notifications/telegram-webhook', desc: 'Called by Telegram; requires the X-Telegram-Bot-Api-Secret-Token header. Links a group from the one-time /start code an operator created; ignores private chats; never replies.' },
  { method: 'POST', path: '/_internal/notifications/dispatch', desc: 'asapify-notify. OIDC asapify-task from Cloud Tasks. Body {job_id}. Claims one job, then sends it.' },
  { method: 'POST', path: '/_internal/engine/geo-tick', desc: 'asapify-notify. OIDC asapify-task from Cloud Scheduler every 15 minutes (minute 5, 20, 35, 50), ?budget=240. Newest Himawari-9 + GK2A slot for all 65 regions: fusion, rules, state machine, agent requests and waiting agent runs.' },
  { method: 'POST', path: '/_internal/engine/tick', desc: 'asapify-notify. OIDC asapify-task from Cloud Scheduler every 15 minutes, ?batch=20&budget=240. NASA POWER support only: one probe, then new hours per region. Sets no status.' },
  { method: 'POST', path: '/_internal/notifications/sweep', desc: 'asapify-notify. OIDC asapify-task from Cloud Scheduler every minute. Resumes pending fan-outs, queues pending jobs, marks stuck jobs unknown.' },
];

/** One example body per `ExampleKey`; the contract page renders them next to each endpoint. */
export const STATIC_EXAMPLES: Record<ExampleKey, unknown> = {
  // regions / region: the engine run locally on the real 11 Oct 2026 18:10 UTC slot (no humidity source in that run),
  // re-rated with the 16 Oct 2026 rules
  regions: [{
    id: 'R3.50S105.625E', province: '16', lat: -3.5, lon: 105.625, bounds: [105.3125, -3.75, 105.9375, -3.25], peat_km2: 66.7,
    status: 'ALERT', since: '2026-10-11T18:10:00Z', observed_at: '2026-10-11T18:10:00Z', utilities: { SAFE: 0, WARNING: 0, ALERT: 1 },
    updated_at: '2026-10-11T18:40:00Z', agent_requested_at: '2026-10-11T18:40:00Z', last_agent_at: '2026-10-11T18:40:00Z',
    verification: null,
    inputs: { delta_t_k: 39.396, cloud_cover_pct: 0, relative_humidity_pct: null, dry_z: null, dry_source: null, hot_lat: -3.5658, hot_lon: 105.7343 },
    quality: { thermal: 'ACCEPTED', relative_humidity: 'MISSING' },
    reason: 'ALERT has the highest utility (1.000); ΔT 39.40 K counted as 39.40 K (no humidity anomaly)',
    flags: ['two_satellites_agree'], night: true,
  }],
  region: {
    id: 'R3.50S105.625E', province: '16', status: 'ALERT', since: '2026-10-11T18:10:00Z', observed_at: '2026-10-11T18:10:00Z', last_error: null,
    slots: [{
      observed_at: '2026-10-11T18:10:00Z', night: true, sun_elevation_deg: -66.2,
      views: {
        himawari9: { n_pixels: 686, n_clear: 686, cloud_fraction: 0, n_peat: 14, n_peat_clear: 14, background_k: 0.083, background_mad_k: 0.658, max_anomaly_k: 39.396, max_z: 59.92, n_hot: 18, n_hot_peat: 0, hot_on_peat: false, hot_lat: -3.577, hot_lon: 105.723, mwir_k: 342.45, lwir_k: 302.97, hot_pixels: [{ lat: -3.577, lon: 105.723, anomaly_k: 39.4 }, { lat: -3.561, lon: 105.741, anomaly_k: 31.2 }] },
        gk2a: { n_pixels: 825, n_clear: 825, cloud_fraction: 0, n_peat: 12, n_peat_clear: 12, background_k: -0.118, background_mad_k: 0.551, max_anomaly_k: 42.252, max_z: 76.68, n_hot: 19, n_hot_peat: 0, hot_on_peat: false, hot_lat: -3.566, hot_lon: 105.734, mwir_k: 348.04, lwir_k: 305.91, hot_pixels: [{ lat: -3.566, lon: 105.734, anomaly_k: 42.25 }] },
      },
      inputs: { delta_t_k: 39.396, cloud_cover_pct: 0, relative_humidity_pct: null, dry_z: null, dry_source: null, hot_lat: -3.5658, hot_lon: 105.7343 },
      support: { viirs_support: 1 }, viirs: [{ lat: -3.569, lon: 105.729, acquired_at: '2026-10-11T17:46:00Z', confidence: 'n', distance_km: 0.9 }],
      quality: { thermal: 'ACCEPTED', relative_humidity: 'MISSING' }, flags: ['two_satellites_agree'],
      sources: { thermal: 'Himawari-9 AHI B07-B13 and GK2A AMI SW038-IR105 brightness temperatures (NOAA open data on AWS)', relative_humidity: 'open_meteo', dryness: null, viirs_support: 'nasa_firms', power_support: 'nasa_power' },
      status: 'ALERT', utilities: { SAFE: 0, WARNING: 0, ALERT: 1 }, memberships: { delta_t_low: 0, delta_t_medium: 0, delta_t_high: 1, viirs_support: 1 },
      adjust: { delta_t_k: 39.396, dry_z: null, rh_shift_k: 0, sun_shift_k: 0, delta_t_eff_k: 39.396 },
      reason: 'ALERT has the highest utility (1.000); ΔT 39.40 K counted as 39.40 K (no humidity anomaly)',
    }],
    hours: [], power: null,
    transitions: [{ observed_at: '2026-10-11T18:10:00Z', previous: null, current: 'ALERT', utilities: { SAFE: 0, WARNING: 0, ALERT: 1 }, reason: 'ALERT has the highest utility (1.000); ΔT 39.40 K counted as 39.40 K (no humidity anomaly)' }],
    verifications: [],
  },
  dayIndex: {
    first: '2026-10-12', last: '2026-10-14',
    days: [{ date: '2026-10-12', alert: true, warning: true }, { date: '2026-10-13', alert: false, warning: true }, { date: '2026-10-14', alert: false, warning: true }],
  },
  dayArchive: {
    date: '2026-10-12', regions: ['R3.50S105.625E', 'R2.50S113.750E', 'R0.50S101.875E'],
    slots: [{
      key: '0110', at: '2026-10-11T18:10:00Z', satellites: ['himawari9', 'gk2a'], status: 'ASW', delta_t: [39.4, 0.2, 9.1],
      hot: {
        'R3.50S105.625E': {
          himawari9: [[-3.577, 105.723, 39.4], [-3.561, 105.741, 31.2]], gk2a: [[-3.566, 105.734, 42.3]],
          viirs: [[-3.569, 105.729, -24], [-3.574, 105.738, -24]], view: 'two_satellites_agree',
        },
        'R0.50S101.875E': { himawari9: [[-0.412, 101.963, 9.1]], gk2a: [], viirs: [], view: 'satellites_disagree' },
      },
    }],
  },
  agentInfo: { configured: true, model: 'gemini-3.5-flash', daily_quota: 20, used_today: 3, remaining: 17, max_tool_calls: 3 },
  regionVerifyRes: {
    id: '20261013T121908Z', region_id: 'R3.50S105.625E', trigger: 'manual', requested_by: 'operator@example.org', at: '2026-10-13T12:19:08Z',
    observed_at: '2026-10-10T23:00:00Z', region_status: 'NO_OBSERVABLE', validation_status: 'CONFIRMED', agent_validation_status: 'CONFIRMED',
    confidence_score: 0.95, analysis: 'NASA FIRMS VIIRS shows 1,938 hotspots in the buffered region within 24 hours, 1,794 of nominal or high confidence, up to 367 K. This is a thermal indication, not a visual confirmation.',
    supporting_data: { firms_hotspot_count: 1938, highest_brightness_temp: 367 },
    draft_operator_alert: { title: 'Thermal indication in South Sumatra', message: 'NASA FIRMS shows many hotspots near peat region R3.50S105.625E. Verify in the field.' },
    // visual_evidence, imagery, weather: illustrative values in the shape added on 16 Oct 2026, after this run
    visual_evidence: { smoke: 'visible', burn_scar: 'visible', image_date: '2026-10-10', notes: 'Smoke drifts north-west from the hotspot cluster; a dark scar in the false-colour image.' },
    imagery: {
      date: '2026-10-10', hours_before_observation: 16.5, errors: [],
      images: [
        { view: 'true_color', url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor%2CVIIRS_NOAA20_Thermal_Anomalies_375m_All&STYLES=%2C&CRS=EPSG%3A4326&BBOX=-3.8500%2C105.2125%2C-3.1500%2C106.0375&WIDTH=768&HEIGHT=652&FORMAT=image%2Fjpeg&TIME=2026-10-10' },
        { view: 'false_color_swir', url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1%2CVIIRS_NOAA20_Thermal_Anomalies_375m_All&STYLES=%2C&CRS=EPSG%3A4326&BBOX=-3.8500%2C105.2125%2C-3.1500%2C106.0375&WIDTH=768&HEIGHT=652&FORMAT=image%2Fjpeg&TIME=2026-10-10' },
      ],
    },
    weather: { source: 'open_meteo', at: '2026-10-10T23:00Z', relative_humidity_pct: 78, wind_speed_ms: 1.9, wind_from_deg: 135, precipitation_24h_mm: 0 },
    checks: [], error: null,
    tool_calls: [{ hours_window: 24, buffer_km: 10, from: '2026-10-09T23:00:00Z', to: '2026-10-11T23:00:00Z', hotspot_count: 1938, confident_count: 1794, highest_brightness_temp_k: 367, error: null }],
    evidence: [{ lat: -3.42, lon: 105.71, acquired_at: '2026-10-11T06:24:00Z', hours_from_observation: 7.4, distance_km: 13.2, confidence: 'h', brightness_k: 367, frp_mw: 48.1, daynight: 'D', satellite: 'N21' }],
    model: 'gemini-3.5-flash', usage: { model_calls: 2, prompt_tokens: 3499, output_tokens: 353, thought_tokens: 0 }, duration_s: 11.1, decision: null,
  },
  regionDecisionReq: { action: 'publish', caption: 'Thermal indication in South Sumatra\n\nNASA FIRMS shows many hotspots near peat region R3.50S105.625E. Verify in the field.', reason: null, verification_id: '20261013T121908Z' },
  regionDecisionRes: {
    action: 'publish', by: 'operator@example.org', at: '2026-10-13T12:25:00Z', reason: null, alert_id: 'A-R3.50S105.625E-20261013T121908Z',
    notifications: { state: 'outbox_saved', groups: 1, jobs: 1 }, queue: { state: 'accepted', count: 2 },
  },
  accessList: [
    { email: 'judge@example.org', state: 'pending', added_by: 'operator@example.org', added_at: '2026-10-14T09:12:00Z', activated_at: null },
    { email: 'operator@example.org', state: 'active', added_by: null, added_at: null, activated_at: null },
  ],
  accessReq: { email: 'judge@example.org' },
  signupStatus: { open: true, until: '2026-10-31', site_key: '6LcX…aBcD' },
  signupReq: { token: '03AFcWeA…' },
  signupRes: { role: 'operator', changed: true, signup_until: '2026-10-31' },
  accessRes: { email: 'judge@example.org', state: 'pending', added_by: 'operator@example.org', added_at: '2026-10-14T09:12:00Z', activated_at: null },
  activateRes: { role: 'operator', changed: true },
  tgGroups: [{ id: '9c1f…4be2', title: 'ASAPify Notified', invite_url: 'https://t.me/+AbCdEf123456', linked_by: 'operator@example.org', linked_at: '2026-10-15T03:20:00Z' }],
  joinLinks: [{ title: 'ASAPify Notified', invite_url: 'https://t.me/+AbCdEf123456' }],
  tgInviteReq: { invite_url: 'https://t.me/+AbCdEf123456' },
  tgGroupLink: { url: 'https://t.me/asapify_alert_bot?startgroup=Qm9…x7Ze', expires_in_seconds: 600 },
  health: { status: 'ok', version: '0.1.0', time: '2023-09-24T15:10:03Z' },
  deliveries: [{
    id: '7b1d…09cf', channel: 'telegram_group', group: 'ASAPify Notified', status: 'accepted', error: null, attempts: 1,
    created_at: '2023-09-24T15:30:00Z', started_at: '2023-09-24T15:30:02Z', finished_at: '2023-09-24T15:30:03Z',
  }],
};
