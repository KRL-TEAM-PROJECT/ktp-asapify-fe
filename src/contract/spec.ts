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
  | 'health' | 'meta' | 'grid' | 'clusters' | 'cluster' | 'verifyReq' | 'verifyRes' | 'decisionReq'
  | 'decisionRes' | 'decisionErr' | 'alerts' | 'closeReq' | 'closeRes' | 'peat'
  | 'pixels' | 'gridCompact' | 'night' | 'nights' | 'basemaps'
  | 'notifSettings' | 'preferences' | 'deviceReq' | 'telegramLink' | 'inbox' | 'ack' | 'deliveries'
  | 'regions' | 'region' | 'agentInfo' | 'regionVerifyRes' | 'regionDecisionReq' | 'regionDecisionRes';

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
    body: '`operator` endpoints require `Authorization: Bearer <Firebase ID token>` with custom claim `role = "operator"`. Missing or invalid token → 401 `UNAUTHENTICATED`; no operator role → 403 `FORBIDDEN`. `public` endpoints need no header. (The mock-mode UI still uses a demo login.)',
  },
  {
    title: 'Time',
    body: 'All times are UTC, ISO 8601 with a `Z` suffix and second precision, e.g. `2023-09-24T15:10:00Z`. The server never sends local time; the UI converts to UTC+7.',
  },
  {
    title: 'Reference time `as_of`',
    body: 'Every operator GET accepts an optional `as_of` (UTC); omitted = now. Backtest replay and production run the same code (WORKLOG §10 rule 7).',
  },
  {
    title: 'Coordinates',
    body: 'GeoJSON is always `[lon, lat]`. Separate numeric fields are explicit (`lat`, `lon`). One 0.02° grid for Sumatra + Kalimantan; `pixel_id` = `p{row}_{col}` from origin 94.9° E / 6.2° N. Province = BPS code (11–19, 21 Sumatra; 61–65 Kalimantan).',
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
    body: 'Status comes only from the rule engine; agent verification has no status or level field. No text may call ALERT a "confirmed fire". The agent writes findings and summaries in English (`finding`, `summary`); captions are English too.',
  },
];

export const ERRORS: { code: string; http: number; when: string }[] = [
  { code: 'UNAUTHENTICATED', http: 401, when: 'Token missing, expired or invalid' },
  { code: 'FORBIDDEN', http: 403, when: 'User is not an operator, or the Google email is not verified' },
  { code: 'NOT_FOUND', http: 404, when: 'Cluster or alert does not exist' },
  { code: 'VALIDATION', http: 400, when: 'Malformed parameter/body (e.g. `as_of` is not ISO UTC)' },
  { code: 'ALREADY_DECIDED', http: 409, when: 'Cluster already published/rejected by another operator' },
  { code: 'COOLDOWN_ACTIVE', http: 409, when: 'Last verification < 6 h ago and `force` is false' },
  { code: 'ALREADY_CLOSED', http: 409, when: 'Alert already closed' },
  { code: 'REASON_REQUIRED', http: 422, when: 'Reject without `reason`' },
  { code: 'CAPTION_INVALID', http: 422, when: 'Publish with an empty caption or > 1,024 characters' },
  { code: 'DEVICE_ALREADY_LINKED', http: 409, when: 'The push token is already registered to another account' },
  { code: 'TELEGRAM_NOT_CONFIGURED', http: 503, when: 'The Telegram bot is not set up in the backend' },
  { code: 'DATA_NOT_READY', http: 503, when: 'No data yet: storage not configured, or the region has not been assessed' },
  { code: 'INTEGRATION_NOT_READY', http: 503, when: 'The verification agent is not configured (FIRMS key or project missing)' },
  { code: 'AGENT_QUOTA_EXHAUSTED', http: 429, when: 'The daily agent quota is used up; resets at 00:00 UTC' },
  { code: 'VERIFIED_RECENTLY', http: 409, when: 'The region was verified less than 5 minutes ago' },
  { code: 'VERIFICATION_REJECTED', http: 409, when: 'Publish on a verification the agent rejected' },
];

const AS_OF_PARAM: Field = {
  name: 'as_of', type: `query · ${ISO}`, req: false, origin: 'backend',
  desc: 'Reference time; omitted = now.',
};

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
    name: 'Meta', origin: 'backend',
    desc: 'Latest data state; fills the banner and night ribbon on the map.',
    fields: [
      { name: 'as_of', type: ISO, req: true, desc: 'Reference time. Production = now; replay = replayed time.' },
      { name: 'last_slot', type: ISO, req: true, desc: 'Latest night slot evaluated by the rule engine (≤ as_of).' },
      { name: 'is_night', type: 'boolean', req: true, desc: 'true when as_of is within 20:00–04:00 UTC+7. false → UI shows "daytime".' },
      { name: 'replay', type: 'boolean', req: true, desc: 'true when data is a backtest replay (blue banner).' },
      { name: 'n_sat', type: '0 | 1 | 2', req: true, desc: 'Number of satellites available at last_slot.' },
      { name: 'sats.himawari', type: 'SatState', req: true, desc: 'Himawari-9 state.' },
      { name: 'sats.gk2a', type: 'SatState', req: true, desc: 'GK2A state.' },
      { name: 'nights', type: '{ first: YYYY-MM-DD, last: YYYY-MM-DD }', req: true, desc: 'Range of archive nights that can be opened; bounds the calendar in the slot player. `first` is 2023-02-16 at the earliest (start of the GK2A archive on NOAA; ALERT needs both satellites); `last` = the night of last_slot.' },
    ],
  },
  {
    name: 'SatState', origin: 'backend',
    desc: 'Availability of one satellite.',
    fields: [
      { name: 'last_slot', type: `${ISO} | null`, req: true, desc: 'Latest slot whose file is in the bucket. null = none tonight.' },
      { name: 'delay_min', type: 'number | null', req: true, desc: 'File delay in minutes. UI marks "late" when > 40.' },
    ],
  },
  {
    name: 'GridFeature', origin: 'backend',
    desc: 'One peat pixel inside a FeatureCollection<Point>. The UI turns the point into a 0.02° square.',
    fields: [
      { name: 'geometry.coordinates', type: '[lon, lat]', req: true, desc: 'Pixel centre.' },
      { name: 'properties.pixel_id', type: 'string', req: true, desc: '`p{row}_{col}`.' },
      { name: 'properties.status', type: STATUS_T, req: true, desc: 'Rule-engine status at last_slot.' },
      { name: 'properties.utility', type: 'number 0–1 | null', req: true, desc: 'U; null when NO_OBSERVABLE.' },
      { name: 'properties.n_sat', type: '0 | 1 | 2', req: true, desc: 'Clear-sky satellites for this pixel.' },
      { name: 'properties.cluster_id', type: 'string | null', req: true, desc: 'Active ALERT cluster id if the pixel is a member; the UI draws cluster outlines from it.' },
      { name: 'properties.province', type: PROV_T, req: true, desc: 'BPS province code; used by the province filter.' },
    ],
  },
  {
    name: 'PixelIndex', origin: 'backend',
    desc: 'Static peat pixel list, downloaded once per version (cache via ETag). Its order = the cell index in GridCompact and NightCompact. Per 10k cells ≈ 120 KB raw, far smaller once gzipped.',
    fields: [
      { name: 'version', type: 'string', req: true, desc: 'Changes only when the peat mask is rebuilt (asapify-build).' },
      { name: 'origin', type: '[lon, lat]', req: true, desc: 'Top-left corner of the combined grid: [94.9, 6.2].' },
      { name: 'step', type: 'number', req: true, desc: 'Cell size in degrees: 0.02.' },
      { name: 'rows', type: 'integer[]', req: true, desc: 'Row of each cell (from the north).' },
      { name: 'cols', type: 'integer[]', req: true, desc: 'Column of each cell (from the west).' },
      { name: 'province', type: 'integer[]', req: true, desc: 'BPS province code per cell, e.g. 16 = South Sumatra, 62 = Central Kalimantan.' },
    ],
  },
  {
    name: 'GridCompact', origin: 'backend',
    desc: 'Status of every cell at one slot, compact; used by the map. Measured for 10k cells: ≈ 23 KB raw / 11 KB gzip, vs GeoJSON ≈ 1.9 MB raw / 83 KB gzip, and far lighter to parse on phones.',
    fields: [
      { name: 'pixels_version', type: 'string', req: true, desc: 'Must equal PixelIndex.version; if not, the UI re-downloads the index.' },
      { name: 'slot', type: ISO, req: true, desc: 'Slot shown (≤ as_of).' },
      { name: 'n_sat', type: '0 | 1 | 2', req: true, desc: 'Satellites available at this slot.' },
      { name: 'status', type: 'string', req: true, desc: 'One letter per cell: `S` SAFE, `N` NO_OBSERVABLE, `W` WARNING, `A` ALERT.' },
      { name: 'utility', type: 'string (base64)', req: true, desc: 'Uint8 per cell: round(U × 250); 255 = null.' },
      { name: 'clusters', type: 'Record<cluster_id, integer[]>', req: true, desc: 'Member cell indices of each active ALERT cluster; the UI draws cluster outlines from it.' },
    ],
  },
  {
    name: 'NightCompact', origin: 'backend',
    desc: 'Status per slot for one night; one request for the slot player (54 status strings, ≈ 530 KB raw for 10k cells). Gzip is very effective because status rarely changes between slots.',
    fields: [
      { name: 'pixels_version', type: 'string', req: true, desc: 'Same as GridCompact.' },
      { name: 'night', type: 'string · YYYY-MM-DD', req: true, desc: 'UTC+7 date the night starts (night_id).' },
      { name: 'slots', type: `${ISO}[54]`, req: true, desc: '13:00–21:50 UTC, every 10 minutes.' },
      { name: 'status', type: '(string | null)[54]', req: true, desc: 'Same format as GridCompact.status; null = slot not evaluated yet or no data.' },
      { name: 'n_sat', type: '(0 | 1 | 2 | null)[54]', req: true, desc: 'Satellites per slot.' },
      { name: 'clusters', type: 'Record<cluster_id, integer[]>', req: true, desc: 'Clusters that were at ALERT in any slot that night (active or closed) → cell indices. Cluster outlines on archive nights come from here.' },
    ],
  },
  {
    name: 'NightSummary', origin: 'backend',
    desc: 'Summary of one night for the calendar in the slot player.',
    fields: [
      { name: 'night', type: 'string · YYYY-MM-DD', req: true, desc: 'night_id.' },
      { name: 'has_data', type: 'boolean', req: true, desc: 'false when no slot was evaluated (e.g. satellite data never arrived). The UI disables this date.' },
      { name: 'alert_clusters', type: 'integer ≥ 0', req: true, desc: 'Number of clusters that were at ALERT in any slot that night; the UI marks the date with a dot.' },
    ],
  },
  {
    name: 'Basemap', origin: 'backend',
    desc: 'One raster basemap option from the BE (e.g. satellite imagery). Street and plain maps are provided by the FE.',
    fields: [
      { name: 'id', type: 'string', req: true, desc: 'Unique id, e.g. `viirs`.' },
      { name: 'label', type: 'string', req: true, desc: 'Label in the layer control.' },
      { name: 'tiles', type: 'string[]', req: true, desc: 'XYZ URL templates with {z}/{x}/{y}; may be signed URLs.' },
      { name: 'tile_size', type: '256 | 512', req: true, desc: 'Tile size in pixels.' },
      { name: 'maxzoom', type: 'integer', req: true, desc: 'Highest available zoom; tiles are upscaled beyond it.' },
      { name: 'attribution', type: 'string', req: true, desc: 'Required imagery attribution.' },
    ],
  },
  {
    name: 'ProvinceBoundary', origin: 'backend',
    desc: 'Static file `layers/provinces.geojson` in the public bucket (not an API endpoint): the 15 Sumatra + Kalimantan provinces, simplified ≈ 90 KB (≈ 30 KB gzip). Source geoBoundaries IDN ADM1 (ODbL, © OpenStreetMap contributors).',
    fields: [
      { name: 'features[].properties.code', type: PROV_T, req: true, desc: 'BPS province code.' },
      { name: 'features[].properties.name', type: 'string', req: true, desc: 'Province name (map label).' },
      { name: 'features[].geometry', type: 'MultiPolygon', req: true, desc: 'Province boundary.' },
    ],
  },
  {
    name: 'ClusterSummary', origin: 'backend',
    desc: 'One row in the ALERT cluster list.',
    fields: [
      { name: 'id', type: 'string', req: true, desc: '`C-{MMDD}-{nnn}`; kept while it overlaps an active cluster.' },
      { name: 'state', type: "'active' | 'closed'", req: true, desc: 'Closed after 3 valid nights without ALERT pixels.' },
      { name: 'province', type: PROV_T, req: true, desc: 'Province of the representative pixel; decides which subscribers receive the alert.' },
      { name: 'rep_pixel', type: 'string', req: true, desc: 'pixel_id with the highest U.' },
      { name: 'centroid', type: '[lon, lat]', req: true, desc: 'Cluster centre; map zoom target and caption.' },
      { name: 'pixels', type: 'string[]', req: true, desc: 'All member pixel_ids.' },
      { name: 'trigger_slot', type: ISO, req: true, desc: 'Slot that triggered the latest verification.' },
      { name: 'utility_score', type: 'number 0–1', req: true, desc: 'U of the representative pixel at trigger_slot.' },
      { name: 'neighbour_support', type: 'number 0–1', req: true, desc: 'u_N = k/8 neighbours with U0 ≥ 0.5.' },
      { name: 'n_sat', type: '0 | 1 | 2', req: true, desc: 'Satellites at trigger_slot (always 2 for ALERT).' },
      { name: 'verification', type: 'VerificationSummary | null', req: true, desc: 'Latest agent verification; null if none yet.' },
      { name: 'decision', type: 'Decision | null', req: true, desc: 'Operator decision; null = undecided (still monitored).' },
    ],
  },
  {
    name: 'VerificationSummary', origin: 'backend',
    desc: 'Compact agent result for the list.',
    fields: [
      { name: 'result', type: "'strong_evidence' | 'inconclusive'", req: true, desc: 'There is no negative value: no visible smoke = inconclusive.' },
      { name: 'viirs_within_2km_48h', type: 'integer ≥ 0', req: true, desc: '> 0 forces strong_evidence.' },
      { name: 'tool_calls', type: 'integer ≤ 8', req: true, desc: 'Number of agent tool calls.' },
      { name: 'at', type: ISO, req: true, desc: 'When the verification was saved.' },
    ],
  },
  {
    name: 'Decision', origin: 'backend',
    desc: 'Operator decision on one cluster (once per cluster).',
    fields: [
      { name: 'action', type: "'publish' | 'reject'", req: true, desc: 'Publish to that province\'s subscribers or reject.' },
      { name: 'by', type: 'string (email)', req: true, desc: 'Operator email.' },
      { name: 'at', type: ISO, req: true, desc: 'Decision time.' },
      { name: 'reason', type: 'string | null', req: true, desc: 'Required for reject; null for publish.' },
      { name: 'alert_id', type: 'string | null', req: true, desc: '`A-{MMDD}-{nnn}` when published.' },
    ],
  },
  {
    name: 'ClusterDetail', origin: 'backend',
    desc: 'ClusterSummary + detail page content. `verification` here is a VerificationDetail.',
    fields: [
      { name: '…ClusterSummary', type: '—', req: true, desc: 'All ClusterSummary fields.' },
      { name: 'attributes', type: 'Record<u_H|u_G|u_LST|u_SAT|u_T, number | null>', req: true, desc: 'MAUT attributes at trigger_slot; null = not available (e.g. cloudy satellite). u_N = neighbour_support.' },
      { name: 'attribute_details', type: 'Record<u_H|u_G|u_LST|u_SAT|u_T|u_N, AttrDetail>', req: false, desc: 'Measured numbers behind each u (e.g. the B07−B14 anomaly in K) for the attribute table. Without it the table shows only u and the weight.' },
      { name: 'series', type: 'SeriesPoint[]', req: true, desc: 'Every slot of the last 3 valid nights for rep_pixel, in time order.' },
      { name: 'neighbours', type: 'Neighbour[8]', req: true, desc: 'The 8 neighbours of rep_pixel for the 3 × 3 mini grid.' },
      { name: 'verification', type: 'VerificationDetail | null', req: true, desc: 'Full agent result.' },
    ],
  },
  {
    name: 'SeriesPoint', origin: 'backend',
    desc: 'One slot on the utility chart.',
    fields: [
      { name: 'slot', type: ISO, req: true, desc: '10-minute slot, 13:00–20:50 UTC.' },
      { name: 'U', type: 'number 0–1 | null', req: true, desc: 'null = NO_OBSERVABLE (hatched on the chart).' },
      { name: 'status', type: STATUS_T, req: true, desc: 'Status at that slot.' },
    ],
  },
  {
    name: 'AttrDetail', origin: 'backend',
    desc: 'The measured number behind one attribute u. u = clamp((value − scale[0]) ÷ (scale[1] − scale[0]), 0, 1); the backend owns the scale.',
    fields: [
      { name: 'value', type: 'number | null', req: true, desc: 'The normalised number. null = attribute unavailable. u_H/u_G: anomaly (hot − reference) of the representative pixel against the crop median, K. u_LST/u_SAT: satellite LST minus the NASA POWER TS/T2M reference, K. u_T: number of anomalous nights (peak U of that night ≥ 0.30, the Watch threshold). u_N: number of neighbours with U0 ≥ 0.5.' },
      { name: 'unit', type: "'K' | 'nights' | 'pixels'", req: true, desc: 'Unit of value.' },
      { name: 'scale', type: '[number, number]', req: true, desc: 'value for u = 0 and u = 1.' },
      { name: 'parts', type: 'AttrPart[]', req: true, desc: 'Supporting numbers used in the calculation; may be empty.' },
    ],
  },
  {
    name: 'AttrPart', origin: 'backend',
    desc: 'One supporting number in an AttrDetail.',
    fields: [
      { name: 'key', type: 'string', req: true, desc: 'b07 | b14 | sw038 | ir105 (brightness temperature at the representative pixel), dt (hot − reference), bg_dt and sigma (crop background median and spread), lst, ts, t2m, night_peak (peak U of one night). Unknown keys are ignored.' },
      { name: 'value', type: 'number | null', req: true, desc: 'The number.' },
      { name: 'unit', type: "'K' | 'U'", req: true, desc: 'K = kelvin or a kelvin difference, U = a 0–1 utility value.' },
      { name: 'abs', type: 'boolean', req: false, desc: 'true = absolute temperature (the UI shows °C and K); otherwise a difference or plain number.' },
      { name: 'at', type: 'YYYY-MM-DD', req: false, desc: 'night_peak only: the night concerned.' },
    ],
  },
  {
    name: 'Neighbour', origin: 'backend',
    desc: 'One neighbour cell.',
    fields: [
      { name: 'dir', type: "'nw'|'n'|'ne'|'w'|'e'|'sw'|'s'|'se'", req: true, desc: 'Direction from rep_pixel.' },
      { name: 'state', type: "'anomaly'|'normal'|'cloud'|'non_peat'", req: true, desc: 'anomaly = U0 ≥ 0.5 (counts toward u_N).' },
      { name: 'u0', type: 'number 0–1 | null', req: true, desc: 'null for cloud and non_peat.' },
    ],
  },
  {
    name: 'VerificationDetail', origin: 'backend',
    desc: 'VerificationSummary + verification card content (agent/schema.py).',
    fields: [
      { name: '…VerificationSummary', type: '—', req: true, desc: 'All VerificationSummary fields.' },
      { name: 'smoke_visible', type: 'boolean | null', req: true, desc: 'null = imagery could not be assessed.' },
      { name: 'evidence', type: 'Evidence[] (≥ 1)', req: true, desc: 'Evidence with time and age.' },
      { name: 'summary', type: 'string ≤ 500', req: true, desc: 'Summary of the verification.' },
      { name: 'tool_trace', type: 'ToolCall[]', req: true, desc: 'Agent tool sequence; shown in ToolTrace and the video.' },
      { name: 'images', type: 'EvidenceImg[]', req: true, desc: 'VIIRS + Himawari images side by side.' },
      { name: 'viirs', type: 'ViirsDetection[]', req: true, desc: 'VIIRS detections ≤ 10 km, 48 h, by distance.' },
    ],
  },
  {
    name: 'Evidence', origin: 'backend',
    desc: 'One piece of agent evidence.',
    fields: [
      { name: 'source', type: "'rule_engine'|'viirs_firms'|'viirs_image'|'himawari_image'", req: true, desc: 'Evidence source.' },
      { name: 'finding', type: 'string ≤ 200', req: true, desc: 'Finding. Every number must exist in a tool result.' },
      { name: 'observed_at', type: `${ISO} | null`, req: true, desc: 'When the evidence was observed.' },
      { name: 'age_h', type: 'number | null', req: true, desc: 'Evidence age relative to trigger_slot (hours).' },
    ],
  },
  {
    name: 'ToolCall', origin: 'backend',
    desc: 'One agent tool call.',
    fields: [
      { name: 'tool', type: 'string', req: true, desc: 'get_pixel_context, get_latest_viirs, fetch_viirs_image, fetch_himawari_image, save_verification.' },
      { name: 'args', type: 'object', req: true, desc: 'Tool arguments (no secrets).' },
      { name: 'duration_ms', type: 'integer', req: true, desc: 'Call duration.' },
      { name: 'ok', type: 'boolean', req: true, desc: 'false when the tool errored.' },
    ],
  },
  {
    name: 'EvidenceImg', origin: 'backend',
    desc: '±0.2° crop around the centroid.',
    fields: [
      { name: 'source', type: "'viirs_image' | 'himawari_image'", req: true, desc: 'Image kind.' },
      { name: 'url', type: 'string (URL)', req: true, desc: 'Signed URL to crops/…, valid ≥ 1 h.' },
      { name: 'layer', type: 'string', req: true, desc: 'GIBS layer or Himawari channel name.' },
      { name: 'observed_at', type: ISO, req: true, desc: 'Image time.' },
      { name: 'age_h', type: 'number', req: true, desc: 'Image age (hours).' },
      { name: 'marker_drawn', type: 'boolean', req: true, desc: 'true when the 5 km marker is drawn on the PNG; false → the UI draws it.' },
      { name: 'bbox', type: '[lon_w, lat_s, lon_e, lat_n]', req: false, desc: 'Exact extent of the crop (linear lon/lat axes). The UI uses it for tooltip coordinates and to place VIIRS points; without it the UI assumes ±0.2° around the centroid.' },
      { name: 'thermal', type: 'ThermalCrop', req: false, desc: 'himawari_image only. Per-cell temperatures behind the image, for the temperature tooltip. Without it the image shows no tooltip.' },
    ],
  },
  {
    name: 'ThermalCrop', origin: 'backend',
    desc: 'Brightness temperature per cell behind the thermal image. A cell is a 0.02° ASAPify pixel (≈ 2 km, comparable to a native satellite pixel), so a ±0.2° crop holds 20 × 20 cells and the bbox lies on grid lines. The himawari_image PNG must use this fixed hot-channel colour scale: 270 K #d8dee4, 282 K #8f9aa5, 290 K #3c434b, 298 K #262b31, 304 K #5b2a1d, 310 K #a8380f, 316 K #ff6a00, 324 K #ffb347, 332 K #fff1bf, 340 K #ffffff (linear interpolation, no per-crop stretching); the UI legend and tooltip swatch use the same scale.',
    fields: [
      { name: 'bbox', type: '[lon_w, lat_s, lon_e, lat_n]', req: true, desc: 'Same as EvidenceImg.bbox. Cell (0, 0) is the north-west corner.' },
      { name: 'cols', type: 'integer', req: true, desc: 'Number of columns (west → east).' },
      { name: 'rows', type: 'integer', req: true, desc: 'Number of rows (north → south).' },
      { name: 'bands', type: 'ThermalBand[]', req: true, desc: 'Hot and reference channel of each satellite: Himawari-9 B07 + B14, GK2A SW038 + IR105. An unavailable satellite may be omitted.' },
    ],
  },
  {
    name: 'ThermalBand', origin: 'backend',
    desc: 'One channel in a ThermalCrop.',
    fields: [
      { name: 'sat', type: "'himawari' | 'gk2a'", req: true, desc: 'Source satellite.' },
      { name: 'band', type: 'string', req: true, desc: 'B07 / B14 (Himawari), SW038 / IR105 (GK2A).' },
      { name: 'um', type: 'number', req: true, desc: 'Centre wavelength, µm. < 5 = hot channel (3.8–3.9), ≥ 5 = reference channel (10–11); the UI uses it to pair channels.' },
      { name: 'values', type: '(number | null)[]', req: true, desc: 'cols × rows brightness temperatures, top row first, kelvin to 1 decimal. null = cloud-covered / not observed.' },
    ],
  },
  {
    name: 'ViirsDetection', origin: 'backend',
    desc: 'One FIRMS point from get_latest_viirs.',
    fields: [
      { name: 'src', type: 'string', req: true, desc: 'e.g. VIIRS_NOAA20_NRT / _SP.' },
      { name: 'time_utc', type: ISO, req: true, desc: 'Acquisition time.' },
      { name: 'distance_km', type: 'number', req: true, desc: 'Distance to centroid; ≤ 2 is emphasised.' },
      { name: 'confidence', type: 'string', req: true, desc: 'l / n / h from FIRMS.' },
      { name: 'frp', type: 'number', req: true, desc: 'Fire radiative power (MW).' },
      { name: 'lat', type: 'number', req: true, desc: 'Point latitude (viirs map layer).' },
      { name: 'lon', type: 'number', req: true, desc: 'Point longitude.' },
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
      { name: 'telegram', type: 'null', req: true, desc: 'Compatibility field; no inline send.' },
      { name: 'notifications', type: "{state: 'fanout_pending'|'outbox_saved'|'no_recipients', recipients: number, jobs: number} | null", req: true, desc: 'Saved outbox, not proof of delivery. fanout_pending = the decision is saved but recipients are not all queued yet; the backend sweep resumes it. The subscriber count never fails a decision.' },
      { name: 'queue', type: "{state: 'accepted'|'awaiting_recovery', count: number}", req: false, desc: 'Enqueue result for publish; Scheduler recovers enqueue failures.' },
    ],
  },
  {
    name: 'VerifyRequest', origin: 'backend',
    desc: 'Request re-verification.',
    fields: [
      { name: 'force', type: 'boolean', req: false, desc: 'Default false. true skips the 6 h cooldown.' },
    ],
  },
  {
    name: 'VerifyResponse', origin: 'backend',
    desc: 'Request forwarded to asapify-agent (asynchronous).',
    fields: [
      { name: 'verification_id', type: 'string', req: true, desc: 'Id of the verification the agent will create.' },
      { name: 'cluster_id', type: 'string', req: true, desc: 'Cluster being verified.' },
      { name: 'status', type: "'queued'", req: true, desc: 'The result appears in the cluster detail once the agent finishes.' },
    ],
  },
  {
    name: 'Alert', origin: 'backend',
    desc: 'Alert published to subscribers.',
    fields: [
      { name: 'id', type: 'string', req: true, desc: '`A-{MMDD}-{nnn}`.' },
      { name: 'cluster_id', type: 'string', req: true, desc: 'Source cluster.' },
      { name: 'province', type: PROV_T, req: true, desc: 'Target province; its subscribers receive the message.' },
      { name: 'caption', type: 'string', req: true, desc: 'Caption sent (or last edited).' },
      { name: 'published_by', type: 'string (email)', req: true, desc: 'Publishing operator.' },
      { name: 'published_at', type: ISO, req: true, desc: 'Publish time.' },
      { name: 'status', type: "'active' | 'closed'", req: true, desc: 'closed = inbox entries labelled RESOLVED, unsent jobs cancelled.' },
      { name: 'closed_at', type: `${ISO} | null`, req: true, desc: 'Close time.' },
      { name: 'closed_by', type: "string | 'system' | null", req: true, desc: "Operator email, or 'system' when the cluster closed automatically." },
      { name: 'notifications', type: "{state: 'fanout_pending'|'outbox_saved'|'no_recipients', recipients: number, jobs: number}", req: true, desc: 'Queue summary; per-channel status comes from /operator/alerts/{id}/deliveries.' },
    ],
  },
  {
    name: 'CloseRequest', origin: 'backend',
    desc: 'Close an alert early.',
    fields: [
      { name: 'reason', type: 'string | null', req: false, desc: 'Note for audit_log.' },
    ],
  },
  {
    name: 'PeatBoundary', origin: 'backend',
    desc: 'Static file `layers/peat_pixels.geojson` in the public bucket (not an API endpoint).',
    fields: [
      { name: 'features[].geometry', type: 'Polygon | MultiPolygon', req: true, desc: 'Processed peat boundary (KHG ∩ 15 provinces − built-up), simplified.' },
    ],
  },
  {
    name: 'Preferences', origin: 'backend',
    desc: 'One account\'s subscription: regions, channels and consent. Stored per verified Google account.',
    fields: [
      { name: 'provinces', type: `(${PROV_T})[]`, req: true, desc: 'Max 15, no duplicates. At least one is required when consent = true.' },
      { name: 'channels', type: "('telegram' | 'fcm' | 'web_push' | 'whatsapp' | 'sms' | 'gmail' | 'lora' | 'bluetooth_mesh')[]", req: true, desc: 'Chosen channels, no duplicates. Channels not implemented yet are stored but never sent to.' },
      { name: 'consent', type: 'boolean', req: true, desc: 'Consent to receive alerts. false = no inbox entries or jobs for this account.' },
      { name: 'exercises', type: 'boolean', req: false, desc: 'Also receive exercise messages (alerts from replay data). Default false.' },
    ],
  },
  {
    name: 'NotificationSettings', origin: 'backend',
    desc: 'Content of the /notifications page: the account\'s preferences and what each channel can do on the server.',
    fields: [
      { name: 'preferences', type: 'Preferences & {telegram_linked: boolean, device_registered: boolean}', req: true, desc: 'No chat_id or device token; only whether one is linked.' },
      { name: 'channels[]', type: "{channel, implemented: boolean, enabled: boolean, restriction: 'NON_EMERGENCY_ONLY' | 'HARDWARE_REQUIRED' | 'ADAPTER_PENDING' | null}", req: true, desc: 'enabled = actually sends (live mode and channel switched on). FCM/Web Push are for exercises only, never emergencies.' },
      { name: 'mode', type: "'dry_run' | 'live'", req: true, desc: 'dry_run = no provider is contacted; delivery status becomes simulated.' },
    ],
  },
  {
    name: 'Notice', origin: 'backend',
    desc: 'One message in a subscriber\'s web inbox. The inbox is filled even when every channel is off.',
    fields: [
      { name: 'id', type: 'string (64 hex)', req: true, desc: 'Inbox id, deterministic per alert × account (deduplication).' },
      { name: 'alert_id', type: 'string', req: true, desc: 'Source alert.' },
      { name: 'province', type: PROV_T, req: true, desc: 'Alert province.' },
      { name: 'text', type: 'string', req: true, desc: 'Caption published by the operator.' },
      { name: 'purpose', type: "'emergency' | 'exercise'", req: true, desc: 'exercise = alert from replay data; only for accounts with exercises = true.' },
      { name: 'published_at', type: ISO, req: true, desc: 'Publish time.' },
      { name: 'expires_at', type: ISO, req: true, desc: 'Publish + 1 h; jobs still unsent after that are cancelled.' },
      { name: 'acknowledged_at', type: `${ISO} | null`, req: true, desc: 'When the subscriber pressed confirm.' },
      { name: 'status', type: 'string', req: true, desc: 'Alert status when the message was created.' },
    ],
  },
  {
    name: 'Delivery', origin: 'backend',
    desc: 'One send job for one channel and one recipient. No recipient address or chat_id.',
    fields: [
      { name: 'id', type: 'string (64 hex)', req: true, desc: 'Job id, deterministic (deduplication).' },
      { name: 'channel', type: 'string', req: true, desc: 'Channel of this job.' },
      { name: 'stage', type: "'initial' | 'escalation'", req: true, desc: 'escalation = WhatsApp/SMS for exercise messages, delayed 2 min and skipped once confirmed.' },
      { name: 'status', type: "'pending' | 'sending' | 'accepted' | 'failed' | 'unknown' | 'blocked' | 'cancelled' | 'simulated'", req: true, desc: 'accepted = the provider took it, not proof it was read. unknown = outcome uncertain, never resent automatically.' },
      { name: 'error', type: 'string | null', req: true, desc: 'Provider error code, if any.' },
      { name: 'attempts', type: 'number', req: true, desc: 'Number of send attempts.' },
      { name: 'created_at · started_at · finished_at', type: `${ISO} | null`, req: true, desc: 'Job timestamps.' },
      { name: 'acknowledged_at', type: `${ISO} | null`, req: true, desc: 'From the recipient\'s inbox.' },
    ],
  },
  {
    name: 'TelegramLink', origin: 'backend',
    desc: 'One-time deep link to the bot.',
    fields: [
      { name: 'url', type: 'string', req: true, desc: '`https://t.me/{bot}?start={code}`.' },
      { name: 'expires_in_seconds', type: '600', req: true, desc: 'The code expires after 10 min.' },
    ],
  },
  {
    name: 'DeviceRequest', origin: 'backend',
    desc: 'Push token from Firebase Messaging in the browser.',
    fields: [
      { name: 'token', type: 'string (20–4096, [A-Za-z0-9_:-.])', req: true, desc: 'One token per account.' },
    ],
  },
  {
    name: 'DeviceState', origin: 'backend',
    desc: 'Result of registering/removing a device.',
    fields: [
      { name: 'registered', type: 'boolean', req: true, desc: 'true after POST, false after DELETE.' },
    ],
  },
  {
    name: 'Ack', origin: 'backend',
    desc: 'Result of confirming a message.',
    fields: [
      { name: 'acknowledged_at', type: ISO, req: true, desc: 'Time of the first confirmation.' },
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
    desc: 'One peat region of the risk engine (a NASA POWER cell with mapped peat) and its latest assessed 10-minute slot.',
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
      { name: 'slots', type: 'SlotRecord[]', req: true, desc: 'Oldest first, 6 per hour; `hours` query parameter, default 24 (144 slots).' },
      { name: 'hours', type: 'object[]', req: true, desc: 'NASA POWER support per hour, oldest first: observed_at, inputs (skin_temperature_k, baseline_k, delta_t_k, relative_humidity_pct, …), quality, flags. No status.' },
      { name: 'power', type: 'PowerSupport | null', req: false, desc: 'Latest POWER hour: observed_at, skin_temperature_k, baseline_k, delta_t_k, relative_humidity_pct, updated_at. About 2–3 days behind.' },
      { name: 'transitions', type: 'object[]', req: true, desc: 'Last 20 status changes, newest first: observed_at, previous, current, utilities, reason.' },
      { name: 'verifications', type: 'Verification[]', req: true, desc: 'Last 10 agent runs, newest first.' },
      { name: 'last_error', type: 'string | null', req: true, desc: 'Error type of the last failed cycle for this region.' },
    ],
  },
  {
    name: 'SlotRecord', origin: 'backend',
    desc: 'Audit record of one 10-minute satellite slot (design section 10, audit trail). Firestore keeps it 30 days.',
    fields: [
      { name: 'observed_at', type: ISO, req: true, desc: 'Scan start of the slot (UTC), not the ingestion time.' },
      { name: 'night, sun_elevation_deg', type: 'boolean, number', req: true, desc: 'Night = sun below −6° at the cell centre. Only night slots can reach ALERT.' },
      { name: 'views', type: '{ himawari9, gk2a: SatelliteView | null }', req: true, desc: 'Per satellite: n_pixels, n_clear, cloud_fraction, n_peat, n_peat_clear, background_k, background_mad_k, max_anomaly_k (0 = no fire-like pixel, null = too few clear pixels), max_z, n_hot, n_hot_peat, hot_on_peat, hot_lat, hot_lon, mwir_k, lwir_k. null = no data for this slot.' },
      { name: 'inputs', type: 'RegionInputs', req: true, desc: 'delta_t_k (the anomaly both satellites confirm; null = not observable), cloud_cover_pct (clearest view), relative_humidity_pct (Open-Meteo), hot_lat, hot_lon.' },
      { name: 'support', type: '{ viirs_support?, power_support?: number }', req: true, desc: 'Only at a possible hotspot; can only raise ALERT.' },
      { name: 'quality', type: "{ thermal, relative_humidity: 'ACCEPTED' | 'DEGRADED' | 'REJECTED' | 'MISSING' }", req: true, desc: 'thermal ACCEPTED = night and both satellites agree; DEGRADED (day, one satellite, disagreement) is capped at WARNING; REJECTED = no clear view.' },
      { name: 'flags', type: 'string[]', req: true, desc: 'two_satellites_agree, two_satellites_quiet, satellites_disagree, single_satellite:<name>, no_data:<name>, no_clear_view, daytime, model_estimate.' },
      { name: 'status, utilities, memberships, reason', type: 'Status, object, object, string', req: true, desc: 'Rules-engine output for that slot; the reason says when the cap applied.' },
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
      { name: 'model', type: 'string', req: true, desc: 'Gemini model on Vertex AI.' },
      { name: 'daily_quota, used_today, remaining', type: 'integer', req: true, desc: 'Hard daily quota (UTC day), taken before any model call.' },
      { name: 'max_tool_calls', type: 'integer', req: true, desc: 'FIRMS calls per run.' },
    ],
  },
  {
    name: 'RegionDecisionRequest', origin: 'backend',
    desc: 'DecisionRequest plus the verification it decides on.',
    fields: [
      { name: 'action', type: "'publish' | 'reject'", req: true, desc: 'Publish fans out to subscribers of the province (purpose = emergency).' },
      { name: 'caption', type: 'string | null', req: false, desc: 'Required for publish; ≤ 1,024 characters.' },
      { name: 'reason', type: 'string | null', req: false, desc: 'Required for reject.' },
      { name: 'verification_id', type: 'string', req: true, desc: 'Verification.id; a second decision on it → 409 ALREADY_DECIDED.' },
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
    id: 'meta', method: 'GET', path: '/meta', auth: 'public',
    title: 'Data state',
    purpose: 'Latest slot per satellite, night/day and replay status.',
    usedBy: 'Map → data banner (DataBanner), H/G rows and latest slot in the slot player; "single satellite", "daytime", "replay" states.',
    params: [AS_OF_PARAM],
    responses: [{ code: 200, schema: 'Meta', example: 'meta' }],
    errors: ['VALIDATION'],
  },
  {
    id: 'regions', method: 'GET', path: '/operator/regions', auth: 'operator',
    title: 'Peat regions',
    purpose: 'All 65 regions with their current status and latest inputs. The engine reads one satellite slot every 10 minutes, so the UI refreshes no faster than that.',
    usedBy: 'Regions map (home) → map fill, filters, list.',
    responses: [{ code: 200, schema: 'RegionSummary[]', example: 'regions' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'DATA_NOT_READY'],
  },
  {
    id: 'region', method: 'GET', path: '/operator/regions/{id}', auth: 'operator',
    title: 'Region detail',
    purpose: 'Latest slots (audit records), POWER support, the last 20 status changes and the last 10 verifications of one region. Each hour shown costs 6 Firestore reads.',
    usedBy: 'Region detail → timeline, satellites, utilities, status changes, verification card, decision.',
    params: [
      { name: 'id', type: 'path · string', req: true, desc: 'Region id, e.g. R2.50S113.750E.' },
      { name: 'hours', type: 'query · integer 1–72', req: false, desc: 'Default 24 (144 slots).' },
    ],
    responses: [{ code: 200, schema: 'RegionDetail', example: 'region' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'DATA_NOT_READY'],
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
    purpose: 'Same rules as cluster decisions: once per verification, audited, publish needs a caption and fans out to that province\'s subscribers. A REJECTED verification can only be rejected.',
    usedBy: 'Region detail → DecisionPanel.',
    params: [{ name: 'id', type: 'path · string', req: true, desc: 'Region id.' }],
    body: { schema: 'RegionDecisionRequest', example: 'regionDecisionReq' },
    responses: [{ code: 201, schema: 'DecisionResponse', example: 'regionDecisionRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_DECIDED', 'VERIFICATION_REJECTED', 'REASON_REQUIRED', 'CAPTION_INVALID'],
  },
  {
    id: 'pixels', method: 'GET', path: '/operator/pixels', auth: 'operator',
    title: 'Peat pixel index',
    purpose: 'Static grid geometry, downloaded once then cached (send ETag + Cache-Control). Other compact responses refer to cells by this order.',
    usedBy: 'Map → geometry of every pixel square (built once), pixel id / coordinate search, pixel inspector.',
    responses: [{ code: 200, schema: 'PixelIndex', example: 'pixels' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'grid', method: 'GET', path: '/operator/grid', auth: 'operator',
    title: 'Peat pixel status',
    purpose: 'Every peat pixel for the latest night slot ≤ as_of. Two formats: GeoJSON points (default, as in backend.html, for other tools/debugging) and `format=compact` (used by the UI).',
    usedBy: 'Map (format=compact) → status colours + icons, cluster outlines, inspector, "cloud covered" state (> 50% N).',
    params: [
      AS_OF_PARAM,
      { name: 'format', type: "query · 'geojson' | 'compact'", req: false, desc: 'Default geojson. The UI always sends compact.' },
      { name: 'province', type: `query · ${PROV_T}`, req: false, desc: 'geojson only (optional); the UI filters client-side.' },
    ],
    responses: [
      { code: 200, schema: 'GridCompact', example: 'gridCompact', note: 'format=compact. Long strings are trimmed in the example.' },
      { code: 200, schema: 'GridFeature', example: 'grid', note: 'format=geojson: FeatureCollection<Point, GridFeature.properties>, trimmed to 2 features.' },
    ],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'night', method: 'GET', path: '/operator/grid/night', auth: 'operator',
    title: 'Per-slot status for one night',
    purpose: '54 status strings (compact format) for one night; one request replaces 54 × /operator/grid. Slots after as_of = null.',
    usedBy: 'Map → slot player (night ribbon: ▲ row = ALERT count per slot), archive night picker (status + that night\'s cluster outlines), 54-slot history in the pixel inspector.',
    params: [
      { name: 'night', type: 'query · YYYY-MM-DD', req: true, desc: 'night_id (UTC+7 date the night starts), within Meta.nights. Outside the range → VALIDATION.' },
      AS_OF_PARAM,
    ],
    responses: [{ code: 200, schema: 'NightCompact', example: 'night', note: 'Example trimmed. A night without data: every slot is null and `clusters` is empty.' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'nights', method: 'GET', path: '/operator/nights', auth: 'operator',
    title: 'Night availability per month',
    purpose: 'One row per archive night in that month: whether it has data and how many ALERT clusters it had. Nights outside Meta.nights are not sent.',
    usedBy: 'Map → calendar in the slot player (faded date = no data, dot = ALERT clusters).',
    params: [
      { name: 'month', type: 'query · YYYY-MM', req: true, desc: 'Month shown by the calendar.' },
    ],
    responses: [{ code: 200, schema: 'NightSummary', example: 'nights', note: 'NightSummary[], in date order. Example trimmed.' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'basemaps', method: 'GET', path: '/operator/basemaps', auth: 'operator',
    title: 'Basemap options',
    purpose: 'Raster basemaps provided by the BE (e.g. satellite imagery for the as_of date). The source is the BE\'s choice; the FE only mounts the tile template.',
    usedBy: 'Map → layer control, "satellite" option.',
    params: [AS_OF_PARAM],
    responses: [{ code: 200, schema: 'Basemap', example: 'basemaps', note: 'Basemap[]. Empty array = street and plain maps only.' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'clusters', method: 'GET', path: '/operator/clusters', auth: 'operator',
    title: 'ALERT cluster list',
    purpose: 'ALERT clusters + latest verification + decision. The response is a bare array.',
    usedBy: 'Map → cluster list panel (the UI sorts by utility or trigger_slot), "empty" state.',
    params: [
      { name: 'state', type: "query · 'active' | 'closed'", req: false, origin: 'backend', desc: 'Default active. The UI uses active for the latest night.' },
      { name: 'night', type: 'query · YYYY-MM-DD', req: false, origin: 'backend', desc: 'Archive night: clusters that were at ALERT in any slot that night, whatever their state (first_warning_at ≤ night end and last_warning_at ≥ night start). When set, `state` is ignored.' },
      AS_OF_PARAM,
    ],
    responses: [{ code: 200, schema: 'ClusterSummary', example: 'clusters', note: 'ClusterSummary[].' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'cluster', method: 'GET', path: '/operator/clusters/{id}', auth: 'operator',
    title: 'Cluster detail',
    purpose: '3-night utility series, MAUT attributes at the trigger slot, neighbours, full verification + tool trace, signed image URLs.',
    usedBy: 'Cluster detail → UtilityChart, AttributeBars, NeighbourGrid, verification card, ToolTrace, DecisionPanel caption; map → VIIRS points for the selected cluster.',
    params: [
      { name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Cluster id, e.g. C-0924-002.' },
      AS_OF_PARAM,
    ],
    responses: [{ code: 200, schema: 'ClusterDetail', example: 'cluster' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND'],
  },
  {
    id: 'verify', method: 'POST', path: '/operator/clusters/{id}/verify', auth: 'operator',
    title: 'Re-verify',
    purpose: 'Forward to asapify-agent POST /verify. Respect the 6 h cooldown unless force = true.',
    usedBy: null,
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Cluster id.' }],
    body: { schema: 'VerifyRequest', example: 'verifyReq' },
    responses: [{ code: 202, schema: 'VerifyResponse', example: 'verifyRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'COOLDOWN_ACTIVE'],
  },
  {
    id: 'decision', method: 'POST', path: '/operator/clusters/{id}/decision', auth: 'operator',
    title: 'Publish / reject',
    purpose: 'Publish: save the decision, then inbox entries and a queue are written for that province\'s subscribers; the subscriber count never fails a decision. Reject: save the reason. Once per cluster; everything goes to audit_log. The UI reloads the detail after 201.',
    usedBy: 'Cluster detail → DecisionPanel (Publish / Reject buttons).',
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Cluster id.' }],
    body: { schema: 'DecisionRequest', example: 'decisionReq' },
    responses: [
      { code: 201, schema: 'DecisionResponse', example: 'decisionRes' },
      { code: 409, schema: 'Error', example: 'decisionErr', note: 'The UI shows the message for the code, then reloads the detail.' },
    ],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_DECIDED', 'REASON_REQUIRED', 'CAPTION_INVALID'],
  },
  {
    id: 'alerts', method: 'GET', path: '/operator/alerts', auth: 'operator',
    title: 'Alert list',
    purpose: 'Published alerts + Telegram send status.',
    usedBy: null,
    params: [
      { name: 'status', type: "query · 'active' | 'closed'", req: false, origin: 'backend', desc: 'Omitted = all.' },
      AS_OF_PARAM,
    ],
    responses: [{ code: 200, schema: 'Alert', example: 'alerts', note: 'Alert[].' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'close', method: 'POST', path: '/operator/alerts/{id}/close', auth: 'operator',
    title: 'Close alert',
    purpose: 'Early close by an operator: inbox entries get the RESOLVED label and unsent jobs are cancelled. Automatic closing goes through agent /cluster-closed. Not implemented in the backend yet.',
    usedBy: null,
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Alert id, e.g. A-0924-001.' }],
    body: { schema: 'CloseRequest', example: 'closeReq' },
    responses: [{ code: 200, schema: 'Alert', example: 'closeRes' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_CLOSED'],
  },
  {
    id: 'deliveries', method: 'GET', path: '/operator/alerts/{id}/deliveries', auth: 'operator',
    title: 'Delivery status per channel',
    purpose: 'Every send job of one alert with the recipient\'s confirmation time. No recipient address or chat_id.',
    usedBy: 'Cluster detail → DeliveryStatus under the decision. Polls every 15 s while a job is running, then every 60 s until 1 h after publishing.',
    params: [{ name: 'id', type: 'path · string', req: true, origin: 'backend', desc: 'Alert id, e.g. A-0924-001.' }],
    responses: [{ code: 200, schema: 'Delivery', example: 'deliveries', note: 'Delivery[].' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'notif-settings', method: 'GET', path: '/notifications/settings', auth: 'user',
    title: 'Notification settings',
    purpose: 'The signed-in account\'s preferences and what each channel can do on the server.',
    usedBy: '/notifications on open.',
    responses: [{ code: 200, schema: 'NotificationSettings', example: 'notifSettings' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'notif-preferences', method: 'PUT', path: '/notifications/preferences', auth: 'user',
    title: 'Save preferences',
    purpose: 'Replace the account\'s whole preference set. consent = false stops every new message for this account.',
    usedBy: '/notifications → Save and Unsubscribe buttons.',
    body: { schema: 'Preferences', example: 'preferences' },
    responses: [{ code: 200, schema: 'Preferences', note: 'Plus telegram_linked and device_registered.' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION'],
  },
  {
    id: 'notif-telegram', method: 'POST', path: '/notifications/telegram-link', auth: 'user',
    title: 'Telegram bot link',
    purpose: 'One-time /start deep link, valid for 10 min. The account is linked once the user presses Start in a private chat with the bot.',
    usedBy: '/notifications → Connect Telegram button.',
    responses: [{ code: 200, schema: 'TelegramLink', example: 'telegramLink' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'TELEGRAM_NOT_CONFIGURED'],
  },
  {
    id: 'notif-device', method: 'POST', path: '/notifications/device', auth: 'user',
    title: 'Register push device',
    purpose: 'Store one FCM/Web Push token for the account. Push is for exercise messages only, never emergencies.',
    usedBy: '/notifications → Register browser push.',
    body: { schema: 'DeviceRequest', example: 'deviceReq' },
    responses: [{ code: 200, schema: 'DeviceState' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION', 'DEVICE_ALREADY_LINKED'],
  },
  {
    id: 'notif-device-delete', method: 'DELETE', path: '/notifications/device', auth: 'user',
    title: 'Remove push device',
    purpose: 'Delete this account\'s push token.',
    usedBy: null,
    responses: [{ code: 200, schema: 'DeviceState' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'notif-inbox', method: 'GET', path: '/notifications/inbox', auth: 'user',
    title: 'Inbox',
    purpose: 'The 50 latest messages of the signed-in account.',
    usedBy: '/notifications → inbox list; kept for offline use when the user turns it on.',
    responses: [{ code: 200, schema: 'Notice', example: 'inbox', note: 'Notice[], newest first.' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN'],
  },
  {
    id: 'notif-ack', method: 'POST', path: '/notifications/inbox/{id}/ack', auth: 'user',
    title: 'Confirm receipt',
    purpose: 'Record the confirmation time. Idempotent: a second confirmation returns the first time. Follow-up jobs not yet run are skipped.',
    usedBy: '/notifications → Confirm button on each message.',
    params: [{ name: 'id', type: 'path · string (64 hex)', req: true, origin: 'backend', desc: 'Inbox id. Another account\'s id → 404.' }],
    responses: [{ code: 200, schema: 'Ack', example: 'ack' }],
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION'],
  },
];

/** Internal endpoints (asapify-agent and asapify-notify) — not for the UI; listed so the BE team knows the boundary. */
export const INTERNAL: { method: string; path: string; desc: string }[] = [
  { method: 'POST', path: '/verify', desc: 'OIDC sa-jobs / sa-api. Body {cluster_id, trigger_slot, force}. 202 + verification_id.' },
  { method: 'POST', path: '/cluster-closed', desc: 'OIDC sa-jobs. Body {cluster_id}. If an alert was published: close it, label the inbox entries RESOLVED, cancel unsent jobs.' },
  { method: 'POST', path: '/api/v1/notifications/telegram-webhook', desc: 'Called by Telegram; requires the X-Telegram-Bot-Api-Secret-Token header. Only links private chats through /start; never replies.' },
  { method: 'POST', path: '/_internal/notifications/dispatch', desc: 'asapify-notify. OIDC asapify-task from Cloud Tasks. Body {job_id}. Claims one job, then sends it.' },
  { method: 'POST', path: '/_internal/engine/geo-tick', desc: 'asapify-notify. OIDC asapify-task from Cloud Scheduler every 10 minutes (minute 5, 15, … 55), ?budget=240. Newest Himawari-9 + GK2A slot for all 65 regions: fusion, rules, state machine, agent requests and waiting agent runs.' },
  { method: 'POST', path: '/_internal/engine/tick', desc: 'asapify-notify. OIDC asapify-task from Cloud Scheduler every 15 minutes, ?batch=20&budget=240. NASA POWER support only: one probe, then new hours per region. Sets no status.' },
  { method: 'POST', path: '/_internal/notifications/sweep', desc: 'asapify-notify. OIDC asapify-task from Cloud Scheduler every minute. Resumes pending fan-outs, queues pending jobs, marks stuck jobs unknown.' },
];

/** Static examples for endpoints without a mock fixture. */
export const STATIC_EXAMPLES: Partial<Record<ExampleKey, unknown>> = {
  // regions / region: the engine run locally on the real 11 Oct 2026 18:10 UTC slot (no humidity source in that run)
  regions: [{
    id: 'R3.50S105.625E', province: '16', lat: -3.5, lon: 105.625, bounds: [105.3125, -3.75, 105.9375, -3.25], peat_km2: 66.7,
    status: 'ALERT', since: '2026-10-11T18:10:00Z', observed_at: '2026-10-11T18:10:00Z', utilities: { SAFE: 0, WARNING: 0, ALERT: 1 },
    updated_at: '2026-10-11T18:40:00Z', agent_requested_at: '2026-10-11T18:40:00Z', last_agent_at: '2026-10-11T18:40:00Z',
    verification: null,
    inputs: { delta_t_k: 39.396, cloud_cover_pct: 0, relative_humidity_pct: null, hot_lat: -3.5658, hot_lon: 105.7343 },
    quality: { thermal: 'ACCEPTED', relative_humidity: 'MISSING' },
    reason: 'ALERT has the highest utility (1.000); humidity unavailable, thermal input only',
    flags: ['two_satellites_agree'], night: true,
  }],
  region: {
    id: 'R3.50S105.625E', province: '16', status: 'ALERT', since: '2026-10-11T18:10:00Z', observed_at: '2026-10-11T18:10:00Z', last_error: null,
    slots: [{
      observed_at: '2026-10-11T18:10:00Z', night: true, sun_elevation_deg: -66.2,
      views: {
        himawari9: { n_pixels: 686, n_clear: 686, cloud_fraction: 0, n_peat: 14, n_peat_clear: 14, background_k: 0.083, background_mad_k: 0.658, max_anomaly_k: 39.396, max_z: 59.92, n_hot: 18, n_hot_peat: 0, hot_on_peat: false, hot_lat: -3.577, hot_lon: 105.723, mwir_k: 342.45, lwir_k: 302.97 },
        gk2a: { n_pixels: 825, n_clear: 825, cloud_fraction: 0, n_peat: 12, n_peat_clear: 12, background_k: -0.118, background_mad_k: 0.551, max_anomaly_k: 42.252, max_z: 76.68, n_hot: 19, n_hot_peat: 0, hot_on_peat: false, hot_lat: -3.566, hot_lon: 105.734, mwir_k: 348.04, lwir_k: 305.91 },
      },
      inputs: { delta_t_k: 39.396, cloud_cover_pct: 0, relative_humidity_pct: null, hot_lat: -3.5658, hot_lon: 105.7343 },
      support: { viirs_support: 1 }, quality: { thermal: 'ACCEPTED', relative_humidity: 'MISSING' }, flags: ['two_satellites_agree'],
      sources: { thermal: 'Himawari-9 AHI B07-B13 and GK2A AMI SW038-IR105 brightness temperatures (NOAA open data on AWS)', relative_humidity: 'open_meteo', viirs_support: 'nasa_firms', power_support: 'nasa_power' },
      status: 'ALERT', utilities: { SAFE: 0, WARNING: 0, ALERT: 1 }, memberships: { delta_t_low: 0, delta_t_medium: 0, delta_t_high: 1, viirs_support: 1 },
      reason: 'ALERT has the highest utility (1.000); humidity unavailable, thermal input only',
    }],
    hours: [], power: null,
    transitions: [{ observed_at: '2026-10-11T18:10:00Z', previous: null, current: 'ALERT', utilities: { SAFE: 0, WARNING: 0, ALERT: 1 }, reason: 'ALERT has the highest utility (1.000); humidity unavailable, thermal input only' }],
    verifications: [],
  },
  agentInfo: { configured: true, model: 'gemini-3.5-flash', daily_quota: 20, used_today: 3, remaining: 17, max_tool_calls: 3 },
  regionVerifyRes: {
    id: '20261013T121908Z', region_id: 'R3.50S105.625E', trigger: 'manual', requested_by: 'operator@example.org', at: '2026-10-13T12:19:08Z',
    observed_at: '2026-10-10T23:00:00Z', region_status: 'NO_OBSERVABLE', validation_status: 'CONFIRMED', agent_validation_status: 'CONFIRMED',
    confidence_score: 0.95, analysis: 'NASA FIRMS VIIRS shows 1,938 hotspots in the buffered region within 24 hours, 1,794 of nominal or high confidence, up to 367 K. This is a thermal indication, not a visual confirmation.',
    supporting_data: { firms_hotspot_count: 1938, highest_brightness_temp: 367 },
    draft_operator_alert: { title: 'Thermal indication in South Sumatra', message: 'NASA FIRMS shows many hotspots near peat region R3.50S105.625E. Verify in the field.' },
    checks: [], error: null,
    tool_calls: [{ hours_window: 24, buffer_km: 10, from: '2026-10-09T23:00:00Z', to: '2026-10-11T23:00:00Z', hotspot_count: 1938, confident_count: 1794, highest_brightness_temp_k: 367, error: null }],
    evidence: [{ lat: -3.42, lon: 105.71, acquired_at: '2026-10-11T06:24:00Z', hours_from_observation: 7.4, distance_km: 13.2, confidence: 'h', brightness_k: 367, frp_mw: 48.1, daynight: 'D', satellite: 'N21' }],
    model: 'gemini-3.5-flash', usage: { model_calls: 2, prompt_tokens: 3499, output_tokens: 353, thought_tokens: 0 }, duration_s: 11.1, decision: null,
  },
  regionDecisionReq: { action: 'publish', caption: 'Thermal indication in South Sumatra\n\nNASA FIRMS shows many hotspots near peat region R3.50S105.625E. Verify in the field.', reason: null, verification_id: '20261013T121908Z' },
  regionDecisionRes: {
    action: 'publish', by: 'operator@example.org', at: '2026-10-13T12:25:00Z', reason: null, alert_id: 'A-R3.50S105.625E-20261013T121908Z',
    notifications: { state: 'outbox_saved', recipients: 2, jobs: 2 }, queue: { state: 'accepted', count: 2 },
  },
  health: { status: 'ok', version: '0.1.0', time: '2023-09-24T15:10:03Z' },
  verifyReq: { force: false },
  verifyRes: { verification_id: 'V-0924-002-1510', cluster_id: 'C-0924-002', status: 'queued' },
  decisionReq: {
    action: 'publish',
    caption: '<b>ALERT · Suspected smouldering peat</b>\n📍 Central Kalimantan · -2.21, 113.92 · 4 pixels\n…',
    reason: null,
  },
  decisionRes: {
    action: 'publish', by: 'operator@example.org', at: '2023-09-24T15:30:00Z', reason: null,
    alert_id: 'A-0924-001', telegram: null, notifications: {state: 'outbox_saved', recipients: 2, jobs: 4}, queue: {state: 'accepted', count: 4},
  },
  decisionErr: { error: { code: 'ALREADY_DECIDED', message: 'An operator has already decided on this cluster.' } },
  alerts: [{
    id: 'A-0923-001', cluster_id: 'C-0923-001', province: '62',
    caption: '<b>ALERT · Suspected smouldering peat</b>\n📍 Central Kalimantan · -2.05, 113.69 · 6 pixels\n…',
    published_by: 'operator@example.org', published_at: '2023-09-23T17:02:00Z',
    status: 'active', closed_at: null, closed_by: null,
    notifications: { state: 'outbox_saved', recipients: 3, jobs: 5 },
  }],
  closeReq: { reason: 'Fire out according to the Central Kalimantan disaster agency (BPBD)' },
  closeRes: {
    id: 'A-0923-001', cluster_id: 'C-0923-001', province: '62',
    caption: '<b>ALERT · Suspected smouldering peat</b>\n📍 Central Kalimantan · -2.05, 113.69 · 6 pixels\n…',
    published_by: 'operator@example.org', published_at: '2023-09-23T17:02:00Z',
    status: 'closed', closed_at: '2023-09-26T02:00:00Z', closed_by: 'operator@example.org',
    notifications: { state: 'outbox_saved', recipients: 3, jobs: 5 },
  },
  notifSettings: {
    preferences: { provinces: ['62'], channels: ['telegram'], consent: true, exercises: true, telegram_linked: true, device_registered: false },
    channels: [
      { channel: 'telegram', implemented: true, enabled: false, restriction: null },
      { channel: 'web_push', implemented: true, enabled: false, restriction: 'NON_EMERGENCY_ONLY' },
      { channel: 'sms', implemented: false, enabled: false, restriction: 'ADAPTER_PENDING' },
    ],
    mode: 'dry_run',
  },
  preferences: { provinces: ['62', '63'], channels: ['telegram', 'web_push'], consent: true, exercises: true },
  deviceReq: { token: 'fcm-token-from-browser:APA91b…' },
  telegramLink: { url: 'https://t.me/asapify_bot?start=Zq3…', expires_in_seconds: 600 },
  inbox: [{
    id: '3f9c…e21a', alert_id: 'A-0924-001', province: '62', purpose: 'exercise', status: 'active',
    text: '<b>ALERT · Suspected smouldering peat</b>\n📍 Central Kalimantan · -2.21, 113.92 · 4 pixels\n…',
    published_at: '2023-09-24T15:30:00Z', expires_at: '2023-09-24T16:30:00Z', acknowledged_at: '2023-09-24T15:33:12Z',
  }],
  ack: { acknowledged_at: '2023-09-24T15:33:12Z' },
  deliveries: [{
    id: '7b1d…09cf', channel: 'telegram', stage: 'initial', status: 'accepted', error: null, attempts: 1,
    created_at: '2023-09-24T15:30:00Z', started_at: '2023-09-24T15:30:02Z', finished_at: '2023-09-24T15:30:03Z',
    acknowledged_at: '2023-09-24T15:33:12Z',
  }],
};
