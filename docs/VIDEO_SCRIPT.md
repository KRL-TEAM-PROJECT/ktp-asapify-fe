# ASAPify demo video: script v4

Script for the submission video of the system as frozen on 16 October 2026 (tag `freeze-2026-10-16`, live image
`gh-f40381a`, site https://hack2skill-510921.web.app). It keeps the shape of the v3 video from 6 October 2026
(2:52, 1920 × 1080, 30 fps, eight scenes, AI voice-over, original score, closing line "Rules detect. Gemini
investigates. A person decides.") and replaces every line that no longer matches the frontend, the backend or the
Google Cloud setup. Target length: about 2:57, under 3:00.

Every number below was read from the code, the docs or the live system on 16 October 2026 and checked a second time
against the code and the live API. Sources are listed at the end. Nothing in this script describes a feature that is
not live.

## What changed since v3

| v3 (6 Oct) | v4 (freeze) | Why |
|---|---|---|
| Screens from the old `asapify-web` app in mock mode (sample data replaying 24 Sep) | Screens recorded from the live app with real data from 14-16 Oct | Mock mode was removed (FE PR #17); the judged prototype is the live site |
| "We make sure responders hear about it ASAP, and know it's real" | "We flag it ASAP, and check it before anyone is told" | An alert is a checked thermal indication, not proof of fire |
| Satellites watch "all night"; the mid-infrared channel shows an ember "about twenty-five times stronger" | Every 10 minutes, day and night (by day the status stops at WARNING); the 25× figure is dropped | The engine runs all day; the 25× figure has no source in the repositories |
| A *pixel* turns AWAS: utility score, 2 of 8 neighbours warm, both satellites agree | A *region* (65 peat regions) is SAFE, WARNING, ALERT or NOT OBSERVABLE; ALERT needs a night hotspot both satellites see within 8 km | The engine rates regions; AWAS, clusters and the neighbour rule are gone |
| "Six attributes from both satellites and NASA POWER baselines" | Contextual 3.9/10.4 µm anomaly + humidity in Fuzzy MAUT; VIIRS and POWER can only raise ALERT | POWER is support only since the geostationary engine went live on 14 Oct |
| The agent takes each AWAS cluster and calls five tools, reads satellite images for smoke | The agent runs on entering ALERT (or Re-verify) with one tool, NASA FIRMS VIIRS hotspots; no imagery | `asapify_agent/agent.py` has one tool; the UI says no imagery is checked |
| "A validator checks every number came from a tool" | The backend checks the agent's hotspot count and highest brightness against the tool's real output, else Needs manual review | `verifier.py` checks those fields, not the free text |
| Alerts land in the *provincial* Telegram group | Alerts are posted in the ASAPify Telegram group; anyone joins from Get alerts | One team group since 15 Oct; no provincial groups, DMs or inbox |
| "In this replay the alert goes out 20 minutes after the scan" | Dropped. Cloud Tasks delivery with per-group status instead | Latency was never measured in the live system |
| "On past fire seasons we measure how often AWAS comes before VIIRS" | One checked night slot: both satellites flagged the same 10 regions, each beside a VIIRS fire | No backtest was run; the day archive replays real slots |
| "Operators can work from a phone, with a lite mode for slow connections" | The public map works on a phone, with a lite mode for Data Saver and low-end devices | The map is public now; lite mode reacts to the device, not the connection speed |
| "Cloud Run, Gemini on Vertex AI, and Firebase" | Gemini Enterprise; adds Firestore (and Cloud Scheduler, Cloud Tasks on the architecture card) | The real stack |

## Before recording (blocking)

1. **Live app only.** Record https://hack2skill-510921.web.app. Scenes 3, 4 and 7 signed out (the public map and
   region pages), scenes 5 and 6 signed in with an operator account in a second browser profile.
2. **Night, twice over.** ALERT only comes from a night slot both satellites confirm; by day every region stops at
   WARNING (16 Oct, 18:00 WIB slot: 4 WARNING, 29 SAFE, 32 NOT OBSERVABLE, 0 ALERT).
   - Scene 3 (map): use the day player on **16 Oct, 00:00 WIB**: 6 regions at ALERT (South Sumatra 2, North Sumatra 2,
     Central and East Kalimantan 1 each), including both agent examples of scene 5. The 00:00 WIB slot of 15 Oct has
     9 (South Sumatra 4, Central Kalimantan 3, South and East Kalimantan 1 each) for a fuller map.
   - Scene 4 (region page): record it **live after dark, while a region is at Alert**. With `?date=` the region page
     shows the last slot of that day and has no slot picker, so a past night cannot be reopened there.
     `R3.50S105.625E` (South Sumatra) was at Alert most nights from 14 to 16 Oct. Record the "Day (sun …°): Warning
     at most" cut by day.
3. **Archive gaps.** 15 Oct holds 86 of 144 slots and 16 Oct also has gaps: a tick processes only the newest slot
   both satellites have published and never backfills, so slots can be skipped, and until 16 Oct about one tick in
   eight also failed out of memory (the worker runs with 1 GiB since then). The longest gap-free runs on 15 Oct are
   4-5 slots (40-50 minutes); use one of them for the day-player scrub.
4. **Save the Telegram invite link** (Admin → Telegram groups → Invite link → Save link). Until then `/join` shows
   "The alert group is not open yet" instead of "Join on Telegram", and V21 ("which anyone can join") is not true.
5. **Publishing is real.** NOTIFICATION_MODE is `live`: Publish posts a real message in the group and cannot be
   recalled, and each verification takes one decision. Publish only a CONFIRMED verification. Its message box is
   prefilled with the agent's draft alert: edit it into a short, careful message ending with "Verify it in the field
   before acting." Rehearse up to the confirmation and do the real take once. Screen-record the real group on a phone
   (v3 used a mock-up).
6. **The two agent examples** (scene 5) are on the public region pages `/regions/R3.50S105.625E` and
   `/regions/R1.50N98.750E`. A region gets a new automatic verification each time it enters Alert again (6 h
   cooldown), which replaces the one shown; older ones stay under "Earlier verifications". Read the numbers on screen
   on the day of recording and change V16N/V17N if they differ. "Tool calls (n)" is collapsed: click it open. Do not
   press Re-verify: it uses one of the 20 daily agent runs and replaces the example.
7. **Scene 2 statistics** come from v3. V03's "80 percent more land than in the same months of 2023" could not be
   confirmed on 16 Oct (a quick check found a comparison with 2025, not 2023): check it on SiPongi and change the
   figure and the card if needed. V04 rests on v3's card (NEA via Malay Mail: PSI 102, unhealthy, 14 Sep 2026).
8. **On-screen wording.** The Publish confirmation and the About page used to mention "subscribers in that
   province". The fix ships with the PR that adds this file; check the deployed confirmation reads "Post this alert
   for … in the ASAPify Telegram group?" before recording scene 6.

## Scene plan

| # | Time | Scene | On screen | VO |
|---|---|---|---|---|
| 1 | 0:00-0:12 | Hook | v3 scene 1 (black, the word *asap* = smoke, haze), end on the ASAPify logo; rebuilt for the new V02 (see Production) | V01-V02 |
| 2 | 0:12-0:30 | The problem | v3 scene 2 (three statistic cards with sources, peat cross-section: smouldering for days, then "first hotspot seen from space") | V03-V05 |
| 3 | 0:30-0:52 | Two satellites, every 10 minutes | Public map `/`, day player on 16 Oct 00:00 WIB: 65 cells coloured by status, legend (Himawari-9 hot pixel; GK2A ring = both agree; VIIRS detection within 10 km and 12 h). Overlay: "Himawari-9 140.7° E · GK2A 128.2° E · every 10 min · NOAA Open Data". End on a hatched *Not observable* cell | V06-V08 |
| 4 | 0:52-1:17 | Rules detect | Live, after dark: the region page of a region at Alert (e.g. `/regions/R3.50S105.625E`): "What the satellites saw at …" (strongest anomaly, 3.9 / 10.4 µm at that pixel, Sun: "Night (sun …°)", "Both satellites agree"), then the "Fuzzy MAUT result" bars and "Status changes". Text overlay: "3.9 µm test, 11 Oct night slot: all 6 cirrus false alarms removed". Short cut (recorded by day): "Day (sun …°): Warning at most" | V09-V12 |
| 5 | 1:17-1:59 | Gemini investigates | `/regions/R3.50S105.625E`, "Gemini AI Analysis": "Automatic, on entering Alert", "Confirmed indication", Confidence 0.95, FIRMS hotspots 683, Highest brightness 367.0 K, "Tool calls (1)" opened, Draft alert. Then `/regions/R1.50N98.750E`: "Needs manual review", "Tool calls (2)" opened (24 h / 10 km, then 48 h / 25 km), 0 hotspots. Hold on the line "No imagery is checked…"; show the Re-verify button signed in, without pressing it | V13-V18N |
| 6 | 1:59-2:21 | A person decides | Signed in: "Operator decision" → "Message for the Telegram group" → Publish → confirmation → "Yes, send" → delivery status "accepted by provider". Cut to a phone: the message arriving in the group. Then `/join`: "Get fire alerts on Telegram" → "Join on Telegram" | V19-V21B |
| 7 | 2:21-2:39 | Replay any day | Map: "Play this day" over a gap-free stretch of 15 Oct; the day calendar with alert days. Text overlay (11 Oct is before the archive starts): "11 Oct 18:10 UTC · one night slot · same 10 regions on both satellites · each with a VIIRS fire within 1.4 km of the hot pixel · not a calibration" | V22R-V24 |
| 8 | 2:39-2:57 | Phone, Google Cloud, close | Phone (390 px): public map with the bottom sheet. Architecture card: Cloud Run (API + private worker, Jakarta) · Cloud Scheduler · Cloud Tasks · Firestore · Gemini on Vertex AI + ADK · Firebase Hosting + Auth · Secret Manager · Artifact Registry · GitHub Actions via Workload Identity. Logo, URL, tagline | V27R-V26 |

## Narration

Line ids follow v3 (`N`/`R` = rewritten). Durations: unchanged lines use their v3 length; new lines are estimated at
v3's measured pace of about 2.7 words per second. Re-time from the rendered audio.

| Id | Line | ≈ s |
|---|---|---|
| V01 | In Indonesian, *asap* means smoke. | 2.1 |
| V02 | We flag it ASAP, and check it before anyone is told. | 4.1 |
| V03 | By July, fires in Indonesia had burned 80 percent more land than in the same months of 2023. *(re-check, see Before recording 7)* | 6.6 |
| V04 | In September, the haze pushed Singapore's air into the unhealthy range. | 4.0 |
| V05 | Peat can burn underground for days before a hotspot shows up from space. | 4.2 |
| V06 | Japan's Himawari-9 and Korea's GK2A look at the same peat from two angles, every ten minutes. | 5.9 |
| V07 | ASAPify scores every clear pixel in 65 peat regions of Sumatra and Kalimantan, and the two satellites have to confirm each other. | 8.2 |
| V08 | Clouds count as not observable, never as safe. | 3.0 |
| V09 | Rules detect. | 1.1 |
| V10 | A pixel counts only if its 3.9-micron channel warms too. That removed all six cirrus false alarms on our test night. | 7.4 |
| V11 | Alert needs a night hotspot that both satellites see within eight kilometres. By day, it stops at Warning. | 6.7 |
| V12 | Every status comes from auditable rules, with Fuzzy MAUT at the core. AI is not the detector. | 5.9 |
| V13 | Gemini investigates. | 1.5 |
| V14 | When a region enters Alert, an agent built with Google's Agent Development Kit, powered by Gemini Enterprise, gets one tool. | 8.2 |
| V15 | It pulls NASA FIRMS VIIRS hotspots around that region, and answers in a fixed YAML schema. | 5.9 |
| V16N | In South Sumatra, it counted 683 hotspots in and around the region over 24 hours: a confirmed thermal indication. | 7.1 |
| V17N | In North Sumatra, both satellites saw an anomaly of about ten kelvin, but VIIRS had nothing, even in a wider search: needs manual review. | 8.9 |
| V18N | The backend checks the agent's hotspot count and brightness against the tool's real output. The AI never changes a status. | 7.4 |
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

About 395 words and 148 s of speech; the scene windows add up to 2:57. Scenes 4, 5 and 7 have the least room (about
2 s, 2 s and 1 s of pauses). If one overflows, shorten V07 to "ASAPify scores 65 peat regions of Sumatra and
Kalimantan." or trim V17N or V20; keep the total under 3:00.

Pronunciation for the voice: "GK2A" = G-K-two-A; "VIIRS" = "veers"; "FIRMS" = "firms"; "MAUT" = "mawt";
"YAML" = "yamel"; "ASAP" as in v3.

## Captions

Generate the SRT from the final voice-over timing, as v3 did (`src/timing3.py` writes `timeline.json`, cues of at
most about 50 characters, split at commas). The caption text is the Narration column, without the asterisks and the
re-check note.

## YouTube

**Title:** ASAPify: two satellites watch Indonesia's peat every 10 minutes | Google Cloud AI Builder Cup 2026

**Description:**

> In Indonesian, asap means smoke. ASAPify reads two geostationary satellites, Japan's Himawari-9 and Korea's GK2A,
> every 10 minutes over 65 peat regions in Sumatra and Kalimantan. Transparent rules set each region's status: a
> contextual 3.9/10.4 µm anomaly, two-satellite confirmation and Fuzzy MAUT. Alert needs a night hotspot both
> satellites see; clouds are "not observable", never "safe". On Alert, a Gemini agent built with the Agent
> Development Kit checks NASA FIRMS VIIRS hotspots and answers in a fixed schema whose key numbers the backend
> checks. An operator decides what is posted in the ASAPify Telegram group.
>
> Rules detect. Gemini investigates. A person decides.
>
> Chapters
> 0:00 asap means smoke
> 0:12 The problem
> 0:30 Two satellites, every 10 minutes
> 0:52 Rules detect
> 1:17 Gemini investigates
> 1:59 A person decides
> 2:21 Replay any day
> 2:39 Phone and Google Cloud
>
> Built on Google Cloud: Cloud Run, Cloud Scheduler, Cloud Tasks, Firestore, Secret Manager, Artifact Registry,
> Gemini Enterprise, Agent Development Kit, Firebase Hosting and Auth.
> Data: Himawari-9 (JMA) and GK2A (KMA) via NOAA Open Data on AWS; NASA FIRMS and NASA POWER; Open-Meteo humidity
> (CC BY 4.0); indicative peat map (KHG, KLHK); province boundaries from geoBoundaries (ODbL); basemap OpenFreeMap,
> © OpenStreetMap contributors.
> Demo screens: the live ASAPify web app with real satellite data from 14-16 October 2026.
> Narration: AI voice. Music: original score.
> A prototype: thresholds were checked against VIIRS on one night slot only.
>
> Prototype: https://hack2skill-510921.web.app
> Code: [repository URL — the team repositories are private; add the link the submission form accepts]
> Theme: Sustainability & Social Impact

## Claims and sources

| Claim | Source |
|---|---|
| 65 peat regions (NASA POWER cells with ≥ 25 km² KHG peat) in 11 provinces of Sumatra and Kalimantan | BE `asapify_engine/regions.json`, FE About page; live `/api/v1/public/regions` |
| Himawari-9 (140.7° E) and GK2A (128.2° E), every 10 minutes, NOAA Open Data | BE `docs/ENGINE.md`; Cloud Scheduler `asapify-geo-tick` (`5-59/10 * * * *`) |
| Only clear pixels are scored (10.4 µm ≥ 270 K) | BE `asapify_engine/contextual.py` |
| A pixel counts only if 3.9 µm itself warms; on the checked night slot the first version had 6 of 11 hot Himawari regions with no VIIRS fire (thin cirrus), and the test removed all 6 | BE `docs/ENGINE.md` (Breaking changes 3; Validation) |
| ALERT only at night with both satellites within 8 km; day / one satellite / disagreement capped at WARNING | BE `asapify_engine/fusion.py` (`agree_km = 8.0`, sun below −6°), `docs/ENGINE.md` items 4-5 |
| Clouds (< 40 % clear, > 60 % cloud) = NOT OBSERVABLE, never SAFE; no utility is computed then | BE `fusion.py` `min_clear = 0.4`, `rules.py` `cloud_max = 60.0`; FE "Not rated: the slot is not observable" |
| Fuzzy MAUT, safety margin 0.05, every transition stored | BE `asapify_engine/rules.py`, `fsm.py`; FE region page "Status changes" |
| Agent: built with ADK, runs in the Cloud Run services, Gemini Enterprise, one tool `fetch_firms_data`, fixed YAML; the backend checks the hotspot count, the highest brightness and that CONFIRMED has a nominal/high hotspot | BE `asapify_agent/agent.py`, `asapify_engine/verifier.py`; env `GEMINI_MODEL=gemini-3.5-flash` |
| South Sumatra example: 683 hotspots in the region's cell plus 10 km over 24 h (638 nominal/high), highest 367 K, CONFIRMED 0.95, automatic, 1 tool call | Live `/api/v1/public/regions/R3.50S105.625E`, verification 15 Oct 2026 21:05 UTC (slot 20:40 UTC) |
| North Sumatra example: both satellites agree at night, ΔT 9.9 K (Himawari 10.9 K, GK2A 9.9 K), 0 hotspots after widening from 24 h / 10 km to 48 h / 25 km, NEEDS_MANUAL_REVIEW 0.75 | Live `/api/v1/public/regions/R1.50N98.750E`, verification 15 Oct 2026 17:35 UTC (slot 17:00 UTC) |
| 19 of 65 regions have a verification; their latest are 14 CONFIRMED and 5 NEEDS_MANUAL_REVIEW (17 automatic, 2 manual) | Live `/api/v1/public/regions`, 16 Oct |
| Operator publishes or rejects with a reason; one decision per verification | BE `engine_routes.py` (`decision`), FE "Operator decision" |
| Telegram group only; Cloud Tasks delivery; per-group status ("accepted" = Telegram took it) | BE `docs/NOTIFICATIONS.md`; FE delivery status |
| Day archive, day player, public map | BE `engine_days`, `public_routes.py`; FE `DayPlayer`, `DayCalendar` |
| One night slot checked: both satellites hot in the same 10 regions, each with a VIIRS fire within 1.4 km of the hot pixel | BE `docs/ENGINE.md` (Validation, 11 Oct 2026 18:10 UTC) |
| Small fires below a 2-4 km pixel | FE About page (Limitations) |
| Mobile first; lite mode on Data Saver, ≤ 2 GB RAM, a weak CPU or reduced motion | FE `docs/MOBILE_FIRST.md`, `src/lib/device.ts` |
| Google Cloud services | Live project `hack2skill-510921`: Cloud Run `asapify-api` + `asapify-notify`, Scheduler (3 jobs), Cloud Tasks, Firestore `asapify`, Secret Manager, Artifact Registry, Vertex AI, Firebase Hosting + Auth |
| Scene 2 statistics | v3 scene 2 cards: SiPongi (Ministry of Forestry), Ministry of Health via IQAir, NEA via Malay Mail. V03 not confirmed on 16 Oct |

## Do not say

- "predicts fires", "detects every fire", "confirmed fire" (say "confirmed thermal indication"), "smoke seen"
- "real-time" (say "every ten minutes"; a slot reaches ASAPify 20-30 minutes after the scan)
- any backtest result, or how fast an alert reaches people (never measured)
- "operational early-warning system", "validated" (one night slot was checked against VIIRS)
- "subscribers", "provincial groups", "AWAS", "clusters", "five tools", "slow connections"

## Production

- v3 source: `ASAPify_video_v3_source.zip` (inside `ASAPIFY.zip` in the team folder) holds the HyperFrames scenes
  `scenes/s1`-`s8`, the Python scene builders and timing scripts in `src/`, the voice lines in `audio/vo/` and the
  music scripts. Its scripts use absolute paths under `/home/claude/`; adjust them.
- Reuse as it is: scene 2 (re-check the statistics; its map label "15 provinces" counts the provinces of both
  islands, while the peat regions lie in 11 of them).
- Rebuild scene 1: its caption is baked into the HTML and the asap → ASAP → ASAPify animation (`scenes_a.py`,
  `S1_JS`) is timed to the old V02. Replace the logo frame's line "Early detection of smouldering peat fires" with
  "Rules detect. Gemini investigates. A person decides." (a 2-4 km pixel misses most smouldering fires).
- Rebuild scenes 3-8 from new screen recordings of the live app (v3 used mock screenshots of `asapify-web`).
  `scenes_d.py` places highlight boxes by v3 screenshot coordinates (`boxes3.json`, `yes_box.json`) and carries a
  "mock mode" tag and AWAS/cluster text: rewrite those scene bodies and remeasure the boxes. Replace the
  illustrative VIIRS tile and the Telegram phone mock-up with the real map and a real group recording.
- Voice: the zip holds the v3 WAV files (24 kHz) and `lines.json`, not the TTS settings; generate the new lines
  with the same voice as v3 and overwrite the files with the same ids, or the mix picks up v3 audio.
- New voice lines: V02, V06, V07, V08 ("not observable" instead of "no observation"), V10, V11, V12, V14, V15,
  V16N, V17N, V18N, V20, V21, V21B, V22R, V23R, V24, V27R, V25. Unchanged: V01, V03 (unless its figure changes),
  V04, V05, V09, V13, V19, V26.
- Scene windows (s): 12, 18, 22, 25, 42, 22, 18, 18 (v3: 12, 18, 22, 24.4, 42.6, 22, 14.6, 16.8).
- Music: `music3.py` and `mix3.py` hard-code `DUR = 172.4` and place accents at v3 scene times; set the new total
  (about 177) and re-render the score once the cut is timed.
- Loudness as v3: normalise to −16 LUFS, then concatenate the scenes and mux the audio.
