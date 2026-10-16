# ktp-asapify-fe

> **Frozen on 16 October 2026.** Development has stopped; this repository and its docs describe the app as it
> stands. Only fixes that keep the deployed site running belong here.

**GCP integration:** see [docs/GCP.md](docs/GCP.md) for Firebase Hosting, Google sign-in,
the operator custom claim and the Cloud Run API; the app sends the Firebase token.

ASAPify operator web app (Google Cloud AI Builder Cup 2026): a map of 65 peat regions that the backend's risk engine
rates every 15 minutes from Himawari-9 and GK2A (SAFE < WARNING < ALERT, plus NO_OBSERVABLE), with each slot's hot
pixels and the VIIRS detections beside them, and a day player that opens any archived day; a region page (ΔT,
humidity and cloud timeline, how dry air and the sun moved ΔT, Fuzzy MAUT utilities, status changes), the Gemini
agent's verification (NASA FIRMS hotspots, the NASA GIBS images it looked at and the weather at the hot pixel) with a
Re-verify button, and the publish/reject decision.

- Design: [docs/MOBILE_FIRST.md](docs/MOBILE_FIRST.md) (mobile-first rules and the brand manual's visual language)
- UI specification: `../asapify/ui.html` · API contract: `../asapify/backend.html` sections 03–05
- System concept and rules: `../ASAPify_Pitch_Google_AI_Builder_2026/WORKLOG.md` sections 7–10
- The interface, code and API are English only.

## Running

```bash
npm install
npm run dev        # http://localhost:5173; /api is proxied to an asapify-api on :8080
npm run build      # tsc --noEmit + vite build → dist/
```

Needs Node ≥ 22.12 (`engines`). Copy `.env.example` to `.env.local` and fill it:

| Variable | Value | Meaning |
|---|---|---|
| `VITE_API_BASE` | URL | API base; empty = same origin (`/api` is proxied to `:8080` in dev) |
| `VITE_FIREBASE_*` | Firebase Web App config | Google sign-in for operators; see [docs/GCP.md](docs/GCP.md) |

## Deploy

The judged prototype runs on Firebase Hosting at https://hack2skill-510921.web.app,
deployed by the GitHub Actions workflow described in [docs/GCP.md](docs/GCP.md).

## API contract for the BE team

Open the **API contract** tab in the app (`/api-contract`, operators only). It lists conventions (auth, UTC time,
`as_of`, coordinates, errors), the error code table, every `asapify-api` endpoint (parameters, body, responses,
errors, the UI screens that use it), schemas, the static map files, and the internal endpoints.
JSON examples are static samples in `src/contract/spec.ts`.

## Light map

- MapLibre (±290 KB gzip) loads only on the map route; other pages are ±113 KB gzip (±17 KB of it is the motion core, see *Motion*). The region detail page also loads per route.
- Lite mode switches on automatically with data saver, RAM ≤ 2 GB, ≤ 2 cores (or ≤ 4 cores with RAM ≤ 4 GB),
  or reduced motion: plain basemap, no camera animation, pixel ratio 1, and interface transform
  motion off (fades only). A choice saved earlier on the device (`asapify.lite`) overrides the detection.
- Province boundaries: geoBoundaries IDN ADM1 (ODbL, © OpenStreetMap contributors), 15 provinces simplified to
  ±90 KB in `public/provinces.geojson`.
- Map labels (province names, OpenFreeMap basemap labels, MapLibre buttons) are English.

The data source is `src/contract/spec.ts` (TypeScript types stay in `src/types.ts`). `backend.html` was last
aligned on 6 Oct 2026 and is older than this contract; at the freeze the contract tab is the reference.

## Motion

Animation uses [`motion`](https://motion.dev) (the successor of framer-motion). Every component uses `m` from `src/motion`
(not `motion`), wrapped in `LazyMotion` inside `MotionProvider`: the ±17 KB gzip core ships in the initial bundle, the full
motion features (animation, gestures, layout, drag; ±20 KB gzip) load later as the `features` chunk. If that chunk fails
to load, `<html>` gets the `no-motion` class and the page shows without motion.

| Where | Motion |
|---|---|
| Page changes, cards, bars, charts | spring in when visible (`reveal`, `whileInView`); chart lines draw, bars grow |
| Navigation links | the active background slides between items (`layoutId`) |
| Dropdowns (`Select`) | the list opens from the button side, the option highlight slides with arrows/pointer |
| Region list | changing order/filter → cards slide into place; new cards stagger in, removed ones shrink away |
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
- Plus Jakarta Sans and JetBrains Mono are bundled through `@fontsource` (no Google Fonts).
