# Firebase Hosting + Google sign-in

Live mode sends Firebase tokens to the Cloud Run API.
Mock mode stays available; live mode never reads the demo login from localStorage.
Status, 13 October 2026: live at https://hack2skill-510921.web.app (project `hack2skill-510921`).
Routine deploys go through GitHub Actions, not a laptop; see "Redeploy" below. Manual steps 1–5
are only for a new project.

1. Follow the backend setup in `ktp-asapify-be/docs/GCP.md`. The Firebase project id must match the backend.
2. Create a Firebase Web App, enable the Google provider and Authorized domains, then fill `.env.local`:

```dotenv
VITE_API_MODE=live
VITE_API_BASE=
VITE_FIREBASE_API_KEY=COPY_FROM_FIREBASE_WEB_APP
VITE_FIREBASE_AUTH_DOMAIN=COPY_FROM_FIREBASE_WEB_APP
VITE_FIREBASE_PROJECT_ID=SAME_PROJECT_ID
VITE_FIREBASE_APP_ID=COPY_FROM_FIREBASE_WEB_APP
VITE_PEAT_LAYER_URL=
VITE_PROVINCES_LAYER_URL=/mock/provinces.geojson
```

The bundled province boundary file comes from geoBoundaries; although it sits in the `mock` folder, it holds
boundary geometry, not detection points. Check the attribution before publishing.
An empty peat layer does not mean a peat map exists. Install the team's peat mask build once it is ready.

3. Install dependencies from the lockfile and build:

```bash
npm ci
npm run build
```

4. Run the official Firebase CLI with an authorised account, then deploy to an explicit project:

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting --project "$ASAPIFY_PROJECT_ID"
```

`firebase.json` rewrites `/api/**` to `asapify-api` in Jakarta before the SPA fallback.
Make sure Cloud Run accepts public invokers at the transport layer and that **the API verifies the
Firebase ID token on every `/operator/**`**. A Firebase token does not replace Cloud Run IAM;
without public transport, Hosting gets a 403 before the request reaches the app.

5. The first sign-in creates the Firebase user, but app access is only granted after an admin
adds the custom claim `role=operator`. The admin checks the UID/email, then uses `tools/set_operator.py`
from the BE repository; the user signs out and in again. No team email is allowed automatically.

## Checks

- An old mock login never opens live-mode routes.
- While the Firebase session restores, the page waits instead of rushing to the login page.
- Operator requests send `Authorization: Bearer <ID token>`; the Firebase SDK refreshes the token.
- Non-operator accounts get 403. Signing out and in again works on the Hosting domain.
- Without pipeline data, the "data not available" message appears; never read it as safe data.
- The detail page and the `/clusters/:id` deep link work; the MapLibre worker is served as JavaScript.
- Decisions whose Telegram status is `pending`, `failed` or `unknown` are marked unconfirmed.

Proven on the live project: Google sign-in, the `/api/**` rewrite to Cloud Run, saving preferences and the inbox
in Firestore, and refusal of access without sign-in. Not tested yet: the operator flow with real data, publishing and
Telegram delivery. The MapLibre chunk size warning predates this work; it stays lazily loaded.

## Deploy

The `.github/workflows/deploy-firebase.yml` workflow runs on every push to `main` (docs-only changes are skipped).
It builds live mode, deploys Hosting through Workload Identity Federation (account `asapify-firebase-deployer`,
no key file), then checks that the site serves the new bundle and that `/api/v1/health` still answers through
the rewrite. The only repository secret is `VITE_FIREBASE_API_KEY`. To redeploy `main` without a new commit:

```bash
gh workflow run "Deploy ASAPify Frontend" --repo KRL-TEAM-PROJECT/ktp-asapify-fe --ref main
```

Merge only reviewed changes to `main`. This workflow never changes the backend, Firestore rules or IAM.
If a release misbehaves, roll it back in the Firebase console (Hosting → release history → Roll back).

References: https://firebase.google.com/docs/hosting/cloud-run and
https://firebase.google.com/docs/auth/admin/custom-claims.

## Notification Engine v1

The `/notifications` page is open to every verified Google account. The map and decisions stay operator-only.
Use the Notification Engine v1 backend from the BE repository; follow its `docs/NOTIFICATIONS.md` for the worker and indexes.
Fill `VITE_FIREBASE_MESSAGING_SENDER_ID` and `VITE_FIREBASE_VAPID_KEY` before building.
FCM/Web Push are exercise/non-emergency only; WhatsApp/SMS/Gmail/LoRa/Bluetooth are planned, not active senders.

The Telegram button creates a one-time deep link; press Start in the bot, then save the preferences. Push must be
registered from a browser that allows it. Offline use is turned on by a user checkbox; only the public shell
and inboxes that were loaded are stored. Tokens and API responses never enter the service-worker cache. The local
inbox is deleted on sign-out. Confirmation needs the server; the UI never fakes a confirmation while offline.

`notification-sw.js` is built as a module service worker and served no-cache by Firebase Hosting.
Test it with `npm run build && npm run preview`; the Vite dev server does not serve the built worker name.

Project: `hack2skill-510921` (number `950889990251`). The Firebase Web App is registered; its configuration is in the deploy workflow.
`VITE_FIREBASE_VAPID_KEY` is not set yet, so browser push cannot be registered on the live site. The deploy workflow
reads it from a repository variable: create the key pair in the Firebase console (Project settings → Cloud Messaging →
Web Push certificates), then `gh variable set VITE_FIREBASE_VAPID_KEY --repo KRL-TEAM-PROJECT/ktp-asapify-fe --body '<public key>'`
and run the workflow again. It is a public key, not a secret.
