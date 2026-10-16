# Mobile First Principle

ASAPify operators work from provincial command posts and from the field, often on a mid-range Android phone over
a weak mobile connection. Every screen is designed for a 360 × 640 px phone first. Larger screens add columns,
never features.

## 1. Start from the phone

- Design and build each screen at 360 px wide first. Nothing scrolls sideways at 320 px, except a chart or a table
  inside its own scroll box.
- Larger screens get layout, not content: every width has the same information and the same actions.
- CSS: base rules are the phone. `@media (min-width: 640px)` and `@media (min-width: 1024px)` only add to them.
  No `max-width` media queries.

## 2. The task decides the order

- The operator's first question is "where is it hot now?". The map and the latest status come first; the list,
  filters and explanations follow.
- On a phone the region list is a bottom sheet that starts closed. Its handle always shows the number of regions at
  Alert and Warning and the slot time, so a closed sheet still answers the question.
- One primary action per screen (Publish or Reject on a region, Add on operator access).
- Secondary information collapses into the sheet or a `<details>` disclosure. It is never dropped.

## 3. Thumb reach

- Primary navigation sits at the bottom on phones (tab bar) and at the top on desktop.
- Touch targets are at least 44 × 44 px with at least 6 px between them; the map's own zoom buttons are 40 px.
- Every gesture has a visible control: the sheet handle is a button, the slot slider has a play button and
  previous/next day buttons, the calendar opens from a button.

## 4. Type and contrast

- Body text 16 px, data and secondary text 14 px, nothing below 12 px. Inputs are 16 px so iOS does not zoom.
- A chart that would shrink its labels below 12 px keeps its scale and scrolls sideways instead.
- Text meets WCAG AA (4.5:1). Each brand colour has a darker step for text (`--amber-ink`, `--ember-ink`).
- Status is never colour alone: every status tag has an icon and a word; on the map, satellite pixels are squares
  and VIIRS detections are dots.
- Plus Jakarta Sans for the interface, JetBrains Mono for data (IDs, coordinates, times, numbers) with tabular
  figures (brand manual, section 02).

## 5. Weak networks and old phones

- Each route loads only its own code; the map library loads only on the map. Fonts are self-hosted.
- Data always shows its time ("Latest slot 12 Oct 01:10 UTC+7"), so stale data is visible. Missing data is never
  shown as Safe.
- Poll no faster than the data changes (one satellite slot rated every 15 minutes). One day of the archive is one request.
- Lite mode (data saver, ≤ 2 GB RAM, ≤ 2 cores, or reduced motion): plain basemap, no camera animation, pixel
  ratio 1, no transform motion.

## 6. Motion

- Opacity and transform only, 120-200 ms, ease-out. Springs are critically damped: no bounce, no overshoot.
- `prefers-reduced-motion` turns transform motion off.

## 7. Viewport

- Heights use `100dvh`; fixed bars respect `env(safe-area-inset-*)`.
- The sheet never covers more than 70 % of the height, so the map stays usable in landscape.

## 8. Before a merge

- Check 360 × 640 (Android, lite mode), 390 × 844 (iPhone), 768 × 1024 and 1280 × 800.
- Light and dark theme; keyboard only; reduced motion.
- No page-level horizontal scroll, no text under 12 px, every target at least 44 px.

## Visual language (brand manual)

| Token | Value | Use |
|---|---|---|
| Peat Charcoal | `#1E293B` | text, primary buttons, focus ring, selection; dark-theme surfaces |
| Canopy Emerald | `#1B4D3E` | SAFE |
| Warning Ochre | `#D97706` (text `#A44E07`) | WARNING |
| Thermal Amber | `#EA580C` (text `#C2410C`) | ALERT, hot pixels, VIIRS detections |
| Background | `#F8FAFC`, dark `#0F172A` | page |

- Instruments, not toys: radius 2-4 px, hairline dividers instead of stacks of cards, no blur, no glow, no heavy
  shadows (only floating layers get a soft one).
- Severity is weight: an Alert tag is solid, a Warning tag is outlined, Safe is a tint, Not observable is hatched.
- Areas are tinted, signals are saturated: a Safe region recedes on the map, a hot pixel stands out.
- The tokens live at the top of `src/styles.css`; components use the tokens, never raw colours. The map is the one
  exception (MapLibre cannot read CSS variables): `src/map/regionMap.ts` mirrors the tokens in `PALETTE`.
