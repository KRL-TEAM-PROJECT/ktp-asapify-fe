# ASAPify demo video: script v5

Script for the submission video of the system after the changes of 16 October 2026: adaptive fuzzy curves, no
night-only or two-satellite cap, a 15-minute cycle, the Gemini AI Analysis with NASA satellite images, a 24-hour
cooldown for automatic analyses and CAPTCHA access for the judges. Site https://hack2skill-510921.web.app. It keeps
the shape of v4 (and of the v3 video from 6 October 2026: 1920 × 1080, 30 fps, eight scenes, AI voice-over,
original score, closing line "Rules detect. Gemini investigates. A person decides.") and rewrites every line the
changes made untrue. Target length: about 2:57, under 3:00.

Every rule and number below was read from the code and the docs on 17 October 2026. Numbers only the live system can
give (counts on the map, the example analysis) are marked **[read on screen]**: read them on the day of recording.
Nothing in this script describes a feature that is not in the code; the recording itself proves it is live.

## What changed since v4

| v4 (freeze, 16 Oct) | v5 (17 Oct) | Why |
|---|---|---|
| Every 10 minutes | ASAPify rates a slot every 15 minutes (the satellites still scan every 10) | Cloud Scheduler `asapify-geo-tick` `5-59/15` |
| ALERT needs a night hotspot both satellites see within 8 km; by day it stops at WARNING | ALERT can come day or night, from whichever satellites see the region; agreement is only a quality flag | BE `fusion.py`, `rules.py`: no caps; ΔT is the clear-weighted mean of the satellites that see |
| Humidity as its own weight in Fuzzy MAUT | Air drier than its NASA POWER normal lowers both thresholds by up to 1 K; the sun raises them by up to 1 K | BE `rules.py` (ΔT counted = ΔT + dry-air shift − sun shift), `ingest.py` (POWER humidity normal) |
| One tool, NASA FIRMS hotspots; no imagery | Same tool, plus two NASA GIBS images (true colour, false colour SWIR) of the last daytime VIIRS pass and the weather at the hot pixel | BE `imagery.py`, `verifier.py`; images never confirm a fire on their own |
| Panel "Agent verification" | Panel "Gemini AI Analysis" | FE rename |
| Automatic analysis again after 6 h | At most once per region in 24 hours (Re-verify still works) | BE `RuleConfig.cooldown` |
| "Gemini on Vertex AI" | "Gemini Enterprise" | Google's current name for the platform the agent runs on |
| Judges need an operator to add them | A signed-in account can make itself an operator after a CAPTCHA while the window is open, without the Admin page | BE `access_routes.py` (`/api/v1/access/signup`) |

## Before recording (blocking)

1. **The changes are live.** BE and FE are deployed, and the geo tick runs every 15 minutes: in Cloud Shell
   `APPLY=1 bash gcp/geo-setup.sh`, then check that Cloud Scheduler shows `asapify-geo-tick` at `5-59/15`.
2. **Record after the change.** Slots stored before the deploy keep the status the old rules gave them (nothing is
   recomputed). For scenes 3 and 7 pick a day from 17 Oct (WIB) on with regions at Alert **[read on screen]**; the
   day calendar marks alert days. With the 15-minute cycle about one 10-minute scan slot in three is never rated;
   the day player steps over the empty ones.
3. **Scene 4** (region page): any time of day, a region at Alert. The "Fuzzy MAUT result" card opens with "How ΔT
   was counted" (ΔT measured, dry air, sun, ΔT counted); records stored before the change do not have it, so use a
   slot from after the deploy. If you record by day, the sun line shows the shift.
4. **Scene 5 needs an analysis with images.** Open a region at Alert whose "Gemini AI Analysis" shows "Satellite
   images (…)". If none exists yet, press Re-verify once, signed in, on a region at Alert (one of the 20 daily runs).
   Check that both images show; if the card says "No satellite image was checked…", look at `imagery.errors` in
   Firestore (`engine_regions/{id}/verifications/{id}`) before recording. Fill V16R from the screen.
5. **Save the Telegram invite link** (Admin → Telegram groups → Invite link → Save link). Until then `/join` shows
   "The alert group is not open yet" instead of "Join on Telegram", and V21 ("which anyone can join") is not true.
6. **Publishing is real.** NOTIFICATION_MODE is `live`: Publish posts a real message in the group and cannot be
   recalled, and each verification takes one decision. Publish only a CONFIRMED verification. Its message box is
   prefilled with the agent's draft alert: edit it into a short, careful message ending with "Verify it in the field
   before acting." Rehearse up to the confirmation and do the real take once. Screen-record the real group on a phone.
7. **Accounts.** Scenes 3, 4 and 7 signed out (the public map and region pages); scenes 5 and 6 signed in with an
   operator the team added, in a second browser profile. While the judges' window is open
   (`UNTIL=YYYY-MM-DD APPLY=1 bash gcp/signup-setup.sh`), a non-operator sees "Operator access for judging" with a
   CAPTCHA after signing in; do not record with such an account (it has no Admin page). If the window was never
   set up, drop "reCAPTCHA Enterprise" from the architecture card and the YouTube description.
8. **Scene 2 statistics** come from v3. V03's "80 percent more land than in the same months of 2023" could not be
   confirmed on 16 Oct (a quick check found a comparison with 2025, not 2023): check it on SiPongi and change the
   figure and the card if needed. V04 rests on v3's card (NEA via Malay Mail: PSI 102, unhealthy, 14 Sep 2026).

## Scene plan

| # | Time | Scene | On screen | VO |
|---|---|---|---|---|
| 1 | 0:00-0:12 | Hook | v3 scene 1 (black, the word *asap* = smoke, haze), end on the ASAPify logo; rebuilt for V02 (see Production) | V01-V02 |
| 2 | 0:12-0:30 | The problem | v3 scene 2 (three statistic cards with sources, peat cross-section: smouldering for days, then "first hotspot seen from space") | V03-V05 |
| 3 | 0:30-0:52 | Two satellites, every 15 minutes | Public map `/`, day player on a slot from 17 Oct on with regions at Alert **[read on screen]**: 65 cells coloured by status, legend (Himawari-9 hot pixel; GK2A ring = both agree; VIIRS detection within 10 km and 12 h). Overlay: "Himawari-9 140.7° E · GK2A 128.2° E · rated every 15 min · NOAA Open Data". End on a hatched *Not observable* cell | V06R-V08 |
| 4 | 0:52-1:17 | Rules detect | The region page of a region at Alert: "What the satellites saw at …" (strongest anomaly, 3.9 / 10.4 µm at that pixel, Sun), then the "Fuzzy MAUT result" card: "How ΔT was counted" (ΔT measured, Dry air (…σ, NASA POWER), Sun, ΔT counted), the utility bars and "Status changes". Text overlay: "3.9 µm test, 11 Oct night slot: all 6 cirrus false alarms removed" | V09-V12 |
| 5 | 1:17-1:59 | Gemini investigates | The same or another region at Alert, "Gemini AI Analysis": "Automatic, on entering Alert" (or Re-verify), "Confirmed indication", confidence, FIRMS hotspots, highest brightness **[read on screen]**; "Satellite images (…, … h before the observation)" with "True colour (smoke)" and "False colour SWIR (burn scars, fire)"; "What the agent saw" (Smoke, Burn scar); the weather line; "Tool calls (n)" opened; Draft alert. Show the Re-verify button signed in, without pressing it again | V13-V18R |
| 6 | 1:59-2:21 | A person decides | Signed in: "Operator decision" → "Message for the Telegram group" → Publish → "Post this alert for … in the ASAPify Telegram group?" → "Yes, send" → delivery status "accepted by provider". Cut to a phone: the message arriving in the group. Then `/join`: "Get fire alerts on Telegram" → "Join on Telegram" | V19-V21B |
| 7 | 2:21-2:39 | Replay any day | Map: "Play this day" over a day from 17 Oct on; the day calendar with alert days. Text overlay (11 Oct is before the archive starts): "11 Oct 18:10 UTC · one night slot · same 10 regions on both satellites · each with a VIIRS fire within 1.4 km of the hot pixel · not a calibration" | V22R-V24 |
| 8 | 2:39-2:57 | Phone, Google Cloud, close | Phone (390 px): public map with the bottom sheet. Architecture card: Cloud Run (API + private worker, Jakarta) · Cloud Scheduler · Cloud Tasks · Firestore · Gemini Enterprise + ADK · Firebase Hosting + Auth · Secret Manager · Artifact Registry · reCAPTCHA Enterprise · GitHub Actions via Workload Identity. Logo, URL, tagline | V27R-V26 |

## Narration

Line ids follow v4 (`R` = rewritten for v5). Durations: unchanged lines keep their v4 length; rewritten lines are
estimated at v3's measured pace of about 2.7 words per second. Re-time from the rendered audio.

| Id | Line | ≈ s |
|---|---|---|
| V01 | In Indonesian, *asap* means smoke. | 2.1 |
| V02 | We flag it ASAP, and check it before anyone is told. | 4.1 |
| V03 | By July, fires in Indonesia had burned 80 percent more land than in the same months of 2023. *(re-check, see Before recording 8)* | 6.6 |
| V04 | In September, the haze pushed Singapore's air into the unhealthy range. | 4.0 |
| V05 | Peat can burn underground for days before a hotspot shows up from space. | 4.2 |
| V06R | Japan's Himawari-9 and Korea's GK2A watch the same peat from two angles, and ASAPify reads them every fifteen minutes. | 7.0 |
| V07R | It scores every clear pixel in 65 peat regions of Sumatra and Kalimantan. When clouds hide one satellite, the other can still see. | 8.5 |
| V08 | Clouds count as not observable, never as safe. | 3.0 |
| V09 | Rules detect. | 1.1 |
| V10 | A pixel counts only if its 3.9-micron channel warms too. That removed all six cirrus false alarms on our test night. | 7.4 |
| V11R | The anomaly sets the status. Air drier than its NASA POWER normal lowers the bar by up to one kelvin; the midday sun raises it. | 9.3 |
| V12 | Every status comes from auditable rules, with Fuzzy MAUT at the core. AI is not the detector. | 5.9 |
| V13 | Gemini investigates. | 1.5 |
| V14R | When a region enters Alert, an agent built with Google's Agent Development Kit, powered by Gemini Enterprise, takes over. | 7.0 |
| V15R | It pulls NASA FIRMS VIIRS hotspots, looks at true- and false-colour NASA images of the last daytime pass, and answers in a fixed YAML schema. | 9.3 |
| V16R | In [province], it counted [N] hotspots over 24 hours, and [smoke shows in the image]: a confirmed thermal indication. *(fill from the screen, see Before recording 4)* | 7.0 |
| V17R | An image never confirms a fire on its own. If clear, fresh images show no smoke and no scar, a Confirmed goes to manual review. | 9.3 |
| V18R | The backend checks every number against the tool's real output. The AI never changes a status. | 5.9 |
| V19 | A person decides. | 1.3 |
| V20 | The operator sees why the region is on Alert and what the agent found, then publishes, or rejects with a reason. | 7.8 |
| V21 | Published alerts go to the ASAPify Telegram group, which anyone can join. | 4.5 |
| V21B | Cloud Tasks delivers each one, and the operator sees whether Telegram accepted it. | 4.8 |
| V22R | Every slot ASAPify processes lands in a day archive anyone can replay. | 4.5 |
| V23R | In one night slot we checked, both satellites flagged the same ten regions, all beside VIIRS fires. | 6.3 |
| V24 | Small embers stay too faint for a pixel two to four kilometres wide. | 4.8 |
| V27R | The public map works on a phone, with a lite mode for data saver and low-end devices. | 6.3 |
| V25 | It all runs on Google Cloud: Cloud Run, Firestore, Gemini Enterprise, and Firebase. | 5.6 |
| V26 | Rules detect. Gemini investigates. A person decides. | 4.0 |

V16R must stay true to the analysis on screen: say "smoke shows in the image" only if "What the agent saw" reads
Smoke: visible; otherwise drop that clause ("In [province], it counted [N] hotspots over 24 hours: a confirmed
thermal indication.").

About 410 words and 153 s of speech; the scene windows add up to 2:57. Scene 4 has the least room (about 1.3 s of
pauses), then scene 5 (about 2 s). If one overflows, shorten V11R to "The anomaly sets the status. Dry air lowers the
bar by up to one kelvin; the midday sun raises it." (about 7 s), or V07R to "It scores 65 peat regions of Sumatra and
Kalimantan; where clouds hide one satellite, the other still sees."; keep the total under 3:00.

Pronunciation for the voice: "GK2A" = G-K-two-A; "VIIRS" = "veers"; "FIRMS" = "firms"; "MAUT" = "mawt";
"YAML" = "yamel"; "ASAP" as in v3; "SWIR" is on screen only, not spoken.

## Captions

Generate the SRT from the final voice-over timing, as v3 did (`src/timing3.py` writes `timeline.json`, cues of at
most about 50 characters, split at commas). The caption text is the Narration column, without the asterisks, the
brackets and the notes.

## YouTube

**Title:** ASAPify: two satellites watch Indonesia's peat every 15 minutes | Google Cloud AI Builder Cup 2026

**Description:**

> In Indonesian, asap means smoke. ASAPify reads two geostationary satellites, Japan's Himawari-9 and Korea's GK2A,
> every 15 minutes over 65 peat regions in Sumatra and Kalimantan. Transparent rules set each region's status: a
> contextual 3.9/10.4 µm anomaly from whichever satellites see the region, rated with Fuzzy MAUT on curves that move
> with how dry the air is against its NASA POWER normal and with the sun. Clouds are "not observable", never "safe".
> On Alert, a Gemini agent built with the Agent Development Kit checks NASA FIRMS VIIRS hotspots and NASA satellite
> images and answers in a fixed schema whose key numbers the backend checks; an image never confirms a fire on its
> own. An operator decides what is posted in the ASAPify Telegram group.
>
> Rules detect. Gemini investigates. A person decides.
>
> Chapters
> 0:00 asap means smoke
> 0:12 The problem
> 0:30 Two satellites, every 15 minutes
> 0:52 Rules detect
> 1:17 Gemini investigates
> 1:59 A person decides
> 2:21 Replay any day
> 2:39 Phone and Google Cloud
>
> Built on Google Cloud: Cloud Run, Cloud Scheduler, Cloud Tasks, Firestore, Secret Manager, Artifact Registry,
> Gemini Enterprise, Agent Development Kit, reCAPTCHA Enterprise, Firebase Hosting and Auth.
> Data: Himawari-9 (JMA) and GK2A (KMA) via NOAA Open Data on AWS; NASA FIRMS, NASA GIBS and NASA POWER; Open-Meteo
> weather (CC BY 4.0); indicative peat map (KHG, KLHK); province boundaries from geoBoundaries (ODbL); basemap
> OpenFreeMap, © OpenStreetMap contributors.
> Demo screens: the live ASAPify web app with real satellite data.
> Narration: AI voice. Music: original score.
> A prototype: thresholds were checked against VIIRS on one night slot only.
>
> Prototype: https://hack2skill-510921.web.app (judges: sign in with Google and tick the CAPTCHA for operator access
> until [last day of judging])
> Code: [repository URL — the team repositories are private; add the link the submission form accepts]
> Theme: Sustainability & Social Impact

Drop the judges' note in brackets if the CAPTCHA window is not open when the video is published.

## Claims and sources

| Claim | Source |
|---|---|
| 65 peat regions (NASA POWER cells with ≥ 25 km² KHG peat) in 11 provinces of Sumatra and Kalimantan | BE `asapify_engine/regions.json`, FE About page; live `/api/v1/public/regions` |
| Himawari-9 (140.7° E) and GK2A (128.2° E) scan every 10 minutes; ASAPify rates a slot every 15 minutes | BE `docs/ENGINE.md`; `gcp/geo-setup.sh`, Cloud Scheduler `asapify-geo-tick` (`5-59/15 * * * *`) |
| Only clear pixels are scored (10.4 µm ≥ 270 K) | BE `asapify_engine/contextual.py` |
| A pixel counts only if 3.9 µm itself warms; on the checked night slot the first version had 6 of 11 hot Himawari regions with no VIIRS fire (thin cirrus), and the test removed all 6 | BE `docs/ENGINE.md` (Breaking changes 3; Validation) |
| ΔT is the mean of the satellites that see the region, weighted by how clear each view is; no night, single-satellite or disagreement cap | BE `asapify_engine/fusion.py` (`fuse`), `docs/ENGINE.md` |
| Dry air lowers the thresholds by up to 1 K (`1 K · tanh(z / 2)`, z against the NASA POWER humidity normal of the same place, hour and season); the sun raises them by up to 1 K (`1 K · sin(sun elevation)`); Safe < 1.95 K ≤ Warning < 6.95 K ≤ Alert on the counted ΔT | BE `asapify_engine/rules.py`, `ingest.py`, `geo.py` (`dryness`); FE About page (Rules) |
| Clouds (< 40 % clear, > 60 % cloud) = NOT OBSERVABLE, never SAFE; no utility is computed then | BE `fusion.py` `min_clear = 0.4`, `rules.py` `cloud_max = 60.0`; FE "Not rated: the slot is not observable" |
| Fuzzy MAUT, safety margin 0.05, every transition stored | BE `asapify_engine/rules.py`, `fsm.py`; FE region page "Status changes" |
| Agent: built with ADK, runs in the Cloud Run services on Gemini Enterprise, one tool `fetch_firms_data`, two NASA GIBS images (VIIRS NOAA-20 true colour and M11-I2-I1 false colour with the thermal anomalies) of the last daytime pass and the Open-Meteo weather at the hot pixel, fixed YAML | BE `asapify_agent/agent.py`, `asapify_engine/imagery.py`, `verifier.py`; env `GEMINI_MODEL=gemini-3.5-flash` |
| The backend checks the hotspot count, the highest brightness and that CONFIRMED has a nominal/high hotspot; images never confirm alone; a CONFIRMED goes to manual review when both clear images from the last 24 h show neither smoke nor a burn scar although a confident hotspot was already there at the pass | BE `asapify_engine/verifier.py` (`check_consistency`, `check_visual`) |
| Automatic analysis on entering ALERT, at most once per region in 24 hours; Re-verify by an operator; 20 runs a day | BE `rules.py` `RuleConfig.cooldown`, `fsm.py`, `Settings.agent_daily_quota` |
| The example analysis of scene 5 | **[read on screen]**: live `/api/v1/public/regions/{id}`, the verification shown, on the day of recording |
| Operator publishes or rejects with a reason; one decision per verification | BE `engine_routes.py` (`decision`), FE "Operator decision" |
| Telegram group only; Cloud Tasks delivery; per-group status ("accepted" = Telegram took it) | BE `docs/NOTIFICATIONS.md`; FE delivery status |
| Day archive, day player, public map | BE `engine_days`, `public_routes.py`; FE `DayPlayer`, `DayCalendar` |
| One night slot checked: both satellites hot in the same 10 regions, each with a VIIRS fire within 1.4 km of the hot pixel (11 Oct, under the rules of that day) | BE `docs/ENGINE.md` (Validation, 11 Oct 2026 18:10 UTC) |
| Small fires below a 2-4 km pixel | FE About page (Limitations) |
| Mobile first; lite mode on Data Saver, ≤ 2 GB RAM, a weak CPU or reduced motion | FE `docs/MOBILE_FIRST.md`, `src/lib/device.ts` |
| Judges' access: CAPTCHA self-registration while `OPERATOR_SIGNUP_UNTIL` is open, no Admin page, ends after that day | BE `asapify_api/access_routes.py`, `docs/GCP.md`; FE `src/components/OperatorSignup.tsx` |
| Google Cloud services | Live project `hack2skill-510921`: Cloud Run `asapify-api` + `asapify-notify`, Scheduler (3 jobs), Cloud Tasks, Firestore `asapify`, Secret Manager, Artifact Registry, Gemini Enterprise, reCAPTCHA Enterprise, Firebase Hosting + Auth |
| Scene 2 statistics | v3 scene 2 cards: SiPongi (Ministry of Forestry), Ministry of Health via IQAir, NEA via Malay Mail. V03 not confirmed on 16 Oct |

## Do not say

- "predicts fires", "detects every fire", "confirmed fire" (say "confirmed thermal indication")
- "smoke seen" as proof; say "smoke shows in the satellite image" only when the analysis on screen reports it, and
  never as a confirmation
- "real-time" (say "every fifteen minutes"; a slot reaches ASAPify 20-30 minutes after the scan, and the images are
  from the last daytime pass)
- "only at night", "both satellites must agree" (no longer true)
- any backtest result, or how fast an alert reaches people (never measured)
- "operational early-warning system", "validated" (one night slot was checked against VIIRS)
- "subscribers", "provincial groups", "AWAS", "clusters", "five tools", "slow connections", "Vertex AI"

## Production

- v3 source: `ASAPify_video_v3_source.zip` (inside `ASAPIFY.zip` in the team folder) holds the HyperFrames scenes
  `scenes/s1`-`s8`, the Python scene builders and timing scripts in `src/`, the voice lines in `audio/vo/` and the
  music scripts. Its scripts use absolute paths under `/home/claude/`; adjust them.
- Reuse as it is: scene 2 (re-check the statistics; its map label "15 provinces" counts the provinces of both
  islands, while the peat regions lie in 11 of them).
- Rebuild scene 1: its caption is baked into the HTML and the asap → ASAP → ASAPify animation (`scenes_a.py`,
  `S1_JS`) is timed to the old V02. Replace the logo frame's line "Early detection of smouldering peat fires" with
  "Rules detect. Gemini investigates. A person decides." (a 2-4 km pixel misses most smouldering fires).
- Rebuild scenes 3-8 from new screen recordings of the live app taken after the 16 October changes. `scenes_d.py`
  places highlight boxes by v3 screenshot coordinates (`boxes3.json`, `yes_box.json`) and carries a "mock mode" tag
  and AWAS/cluster text: rewrite those scene bodies and remeasure the boxes (scene 4 now highlights "How ΔT was
  counted", scene 5 the two images and "What the agent saw").
- Voice: generate with the same voice as v3/v4 and overwrite the files with the same ids, or the mix picks up old
  audio. New for v5: V06R, V07R, V11R, V14R, V15R, V16R, V17R, V18R. From v4 as recorded: V02, V08, V10, V12, V20,
  V21, V21B, V22R, V23R, V24, V27R, V25 (V25 again if v4 still said "Vertex AI"). Unchanged since v3: V01, V03
  (unless its figure changes), V04, V05, V09, V13, V19, V26.
- Scene windows (s): 12, 18, 22, 25, 42, 22, 18, 18, as v4.
- Music: `music3.py` and `mix3.py` hard-code `DUR = 172.4` and place accents at v3 scene times; set the new total
  (about 177) and re-render the score once the cut is timed.
- Loudness as v3: normalise to −16 LUFS, then concatenate the scenes and mux the audio.
