# ktp-asapify-fe

**GCP integration:** see [docs/GCP.md](docs/GCP.md) for Firebase Hosting, Google sign-in,
the operator custom claim and the Cloud Run API. Live mode sends the Firebase token; mock mode stays available.

ASAPify operator web app (Google Cloud AI Builder Cup 2026): a map of 65 peat regions that the backend's risk engine
rates hour by hour (SAFE < WARNING < ALERT, plus NO_OBSERVABLE), a region page (ΔT, humidity and cloud timeline,
Fuzzy MAUT utilities, status changes), the Gemini agent's NASA FIRMS verification with a Re-verify button, and the
publish/reject decision. The earlier pixel map of the Himawari design stays at `/pixels` without live data.

- UI specification: `../asapify/ui.html` · API contract: `../asapify/backend.html` sections 03–05
- System concept and rules: `../ASAPify_Pitch_Google_AI_Builder_2026/WORKLOG.md` sections 7–10
- The interface, code and API are English only.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/
```

Copy `.env.example` to `.env` when you need to change the mode:

| Variable | Value | Meaning |
|---|---|---|
| `VITE_API_MODE` | `mock` (default) / `live` | `mock` = fictional data without a backend; `live` = `asapify-api` |
| `VITE_API_BASE` | URL | API base for live mode; empty = same origin (`/api` is proxied to `:8080` in dev) |
| `VITE_PEAT_LAYER_URL` | GeoJSON URL | `peat-boundary` layer in the public bucket (live mode) |
| `VITE_PROVINCES_LAYER_URL` | GeoJSON URL | Province boundary layer in the public bucket (live mode) |

## Deploy

The judged prototype runs on Firebase Hosting in live mode at https://hack2skill-510921.web.app,
deployed by the GitHub Actions workflow described in [docs/GCP.md](docs/GCP.md).

Vercel is only for mock-mode previews: import the repository in Vercel; settings come from `vercel.json`
(Vite, `npm ci`, `npm run build`, output `dist/`). Without any environment variable the site runs in **mock mode**
(fictional data + demo login). `vercel.json` also routes every path to `index.html` (a deep link such as
`/clusters/C-0924-002` never 404s) and serves `/maplibre/*.mjs` as JavaScript for the map worker. Needs Node ≥ 22.12 (`engines`).

> The mock-mode demo login protects nothing: anyone with the URL can enter. That is fine while the data is
> fictional; live mode uses Firebase Auth.

## Mock mode

Regions (`/`): the real 65 regions and peat shapes from `public/regions.geojson` (built by the backend's
`tools/build_regions.py`; copy it here when the region list changes), with generated hourly inputs up to
11 Oct 2026 13:00 UTC+7, rated by a copy of the backend rules so every status appears. Re-verify returns a sample
result after about 1.5 s. Decisions live in memory and disappear on reload.

Pixels (`/pixels`): a fictional replay of 24 Sep 2023 22:10 UTC+7. Every province (10 Sumatra + 5 Kalimantan) has a fictional peat area
over its real peat region, so any province filter shows pixels. Five ALERT clusters: Central Kalimantan (backtest,
bbox `113.5,-2.6,114.3,-1.9`) `C-0924-002` strong evidence, `C-0924-001` inconclusive, `C-0923-001` already published;
South Sumatra (OKI) `C-0924-003` strong evidence; Riau (Kampar) `C-0924-004` inconclusive.
Archive nights 16 Feb–24 Sep 2023 (start of the GK2A archive on NOAA) open from the calendar in the slot player:
faded date = no data, dot = ALERT clusters. The nights of 11 Apr, 2 Jul and 19 Aug 2023 have no data on purpose.
The night of 15 Sep holds an old cluster `C-0915-001` (West Kalimantan, Kubu Raya) that was rejected and closed.
VIIRS imagery comes straight from NASA GIBS (the real imagery of that date); Himawari crops are SVG illustrations.
Decisions live in memory and disappear on reload. The login is a stand-in (no Firebase).

Screen states can be demoed with `?scenario=` (remembered while the tab is open):
`normal` · `empty` · `cloud` · `one_satellite` · `daytime`.

## API contract for the BE team

Open the **API contract** tab in the app (`/api-contract`, public). It lists conventions (auth, UTC time,
`as_of`, coordinates, errors), the error code table, every `asapify-api` endpoint (parameters, body, responses,
errors, the UI screens that use it), schemas, static files in the bucket, and the internal endpoints.
JSON examples come from the same mock fixtures as the UI, so they cannot drift from what is shown.

The map uses a **compact format**: `GET /operator/pixels` once (grid geometry, cached),
then `GET /operator/grid?format=compact` and `GET /operator/grid/night` (54 slots in one request
for the player). Measured for 10,000 pixels per slot: compact ≈ 23 KB raw / 11 KB gzip, GeoJSON ≈ 1.9 MB
raw / 83 KB gzip. GeoJSON stays available (`format=geojson`, the default) for other tools.

## Light map

- MapLibre (±290 KB gzip) loads only on the map route; other pages are ±113 KB gzip (±17 KB of it is the motion core, see *Motion*). The cluster detail page (±10 KB gzip) also loads per route.
- Pixel geometry is built once; per-slot status, the status filter and the player use `feature-state`
  (only cells that changed are rewritten, no re-tiling).
- Lite mode switches on automatically with data saver, RAM ≤ 2 GB, ≤ 2 cores (or ≤ 4 cores with RAM ≤ 4 GB),
  or reduced motion: plain basemap, no glow/grid lines/camera animation, pixel ratio 1, and interface transform
  motion off (fades only). It can be changed in the Layers control; the choice is saved per device.
- Mock province boundaries: geoBoundaries IDN ADM1 (ODbL, © OpenStreetMap contributors), 15 provinces simplified to
  ±90 KB in `public/mock/`. Live mode uses `VITE_PROVINCES_LAYER_URL`. The province picked in the filter is drawn
  with a thick outline, its label, and a shade outside it.
- Map labels (province names, OpenFreeMap basemap labels, MapLibre buttons) are English.

The data source is `src/contract/spec.ts` (TypeScript types stay in `src/types.ts`). Every endpoint
and field in the contract is listed in `backend.html` (aligned on 6 Oct 2026).

## Cluster detail: measured temperatures

The `/clusters/:id` page shows numbers, not just weights:

- **Tooltips on evidence images.** Himawari thermal image: hover, tap or use the arrow keys to see the brightness
  temperature of every 0.02° pixel (pixel id, coordinates, distance from the marker) for **Himawari-9 B07/B14** and **GK2A
  SW038/IR105** in °C and K, the channel difference, the anomaly against the crop background (median, MAD spread, z), and
  whether the pixel is a cluster member or cloudy. VIIRS image: coordinates + distance under the cursor, and FIRMS
  detection points (satellite, time, distance, confidence, FRP) that can be focused with Tab. Tooltips render in
  `<body>` (`FloatingTip`), so they are never clipped, stay clamped to the screen, and slide on a spring.
- **MAUT parameter table.** Each attribute shows its measured number (e.g. `+18.6 K`, `2 of 3 nights`), its u value, weight,
  contribution w × u, supporting numbers (per-channel temperatures, background, σ, LST/TS/T2M, peak U per night), the
  normalisation scale, and the formula `U = Σ w·u ÷ Σ w` with its numbers. Hover a u bar to see its normalisation formula.
- **Data.** `EvidenceImg.thermal` (a `ThermalCrop` grid, 4 channels × 20 × 20 cells) and `ClusterDetail.attribute_details` are
  part of the official contract (`backend.html`); both are optional (without them images have no tooltip and the table
  shows only u and weight; `u_N` is still computed from the neighbours, and a missing `EvidenceImg.bbox` is assumed ±0.2°
  around the cluster). The schemas are in the API contract tab. Mock mode builds the image, tooltip and table from one
  fictional temperature grid, so the numbers always agree and tie to `u` in the fixtures (`src/mock/thermal.ts`).

## Motion

Animation uses [`motion`](https://motion.dev) (the successor of framer-motion). Every component uses `m` from `src/motion`
(not `motion`), wrapped in `LazyMotion` inside `MotionProvider`: the ±17 KB gzip core ships in the initial bundle, the full
motion features (animation, gestures, layout, drag; ±20 KB gzip) load later as the `features` chunk. If that chunk fails
to load, `<html>` gets the `no-motion` class and the page shows without motion.

| Where | Motion |
|---|---|
| Page changes, cards, bars, charts, neighbour grid | spring in when visible (`reveal`, `whileInView`); chart lines draw, bars grow |
| Navigation links | the active background slides between items (`layoutId`) |
| Dropdowns (`Select`) | the list opens from the button side, the option highlight slides with arrows/pointer |
| Night calendar | opens from the trigger corner; changing month slides the grid in that direction, height fixed at 6 rows |
| Layers panel, pixel inspector | appear/disappear; the inspector slides to its new place when the Layers panel opens (`LayoutGroup`) |
| Cluster list | changing order/filter → cards slide into place; new cards stagger in, removed ones shrink away |
| Bottom sheet (screens < 1024 px) | dragged by its handle (`Sheet`): slow release → nearest position, flick → its direction; content still scrolls |
| Decision panel | reason/confirmation/error blocks fade in and out, elements below slide |
| Buttons, chips, switches, `<details>` | pure CSS: presses bounce (`--ease-spring`), switch knobs, `<details>` opens with a flowing height |

The system *reduced motion* preference and lite mode use `MotionConfig reducedMotion`: transform/layout motion jumps
to its end value; only opacity still fades. Spring presets live in `src/motion/presets.ts`.

## Technical notes

- MapLibre 6 loads its module worker from a separate file. The `maplibreWorker` plugin in `vite.config.ts`
  serves `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` as-is under `/maplibre/`
  (dev) and copies them to `dist/maplibre/` (build); `setWorkerUrl` points there.
- Basemap: OpenFreeMap `positron` (light) / `dark` (dark), no API key; a theme change calls `setStyle`
  and every data layer is reinstalled on `style.load`.
- IBM Plex fonts are bundled through `@fontsource` (no Google Fonts).
