# «Слайдер» — star photo slider merged with «Сияние» (round 6)

Date: 2026-07-23 · Status: approved design, pre-implementation
Figma: file `xtd3isfSuz1gnWxTClA2Vs`, page «Concept» node `252:39`
(frames `slider01`..`slider04` = nodes `252:47`, `252:63`, `252:79`, `252:95`).

## Goal

The main screen's second hero feature: after the user goes idle, a photo slider
takes over the background. Each slide shows the same scene from two angles at
once — the **zenith** shot (looking up) full-bleed behind, and the **nadir**
shot (looking down) inside a 4-pointed star mask. The «Сияние» light does not
disappear: it becomes the **projector** — it flashes to throw each star photo
out of its own center, then retreats to an ember with faint god-rays leaking
from behind the star's points. Implemented as a 4th switcher tab «Слайдер».

Chosen approach (user-approved): **«Проектор»** — light subordinate but always
present; slide changes are light events. Rejected: constant dusty-amber glow
over veiled photos (fights the Figma look); light fully off (kills the live
pitch during the showcase state).

## Assets

New real photos in `public/resources/` (committed — the placeholder era ends):

| Slide | Star (nadir) | Background (zenith) | Headline |
|---|---|---|---|
| 1 | `main-1a.png` | `main-1b+3b.png` (shared sky) | Игровые площадки вместо закрытой территории |
| 2 | `main-2a.png` | `main-2b.png` | Объединение вместо заключения |
| 3 | `main-3a.png` | `main-1b+3b.png` (shared sky) | Открытые лекции вместо закрытых замков |
| 4 | `main-4a.png` | `main-4b.png` | Уютные кафе вместо темных коридоров |

- `public/resources/Star 1.svg` → moves to `src/assets/star.svg`, imported
  `?raw` (like `logo.svg`/`sign.svg`) and inlined as a data-URI CSS mask.
  1000×1000 viewBox, 4 concave points aimed up/right/down/left — the same
  directions where the 4 beams strike (bisectors between links).
- **Deleted** (files + their `.gitignore` entries): `карта.png`,
  `reference-light-3.png`, `reference-light-4.png`, `reference-light-5.png`,
  `Screenshot 2026-07-15 at 14.40.43 1.png`.
- Re-pointed consumers of the deleted files:
  - `SHOWREEL_IMAGES` (old crossfade showreel, still the idle behavior of
    tabs 1–3) → `main-1a..4a.png`.
  - Hover-scene per-link images in `MainScreen.buildDom` → `main-1a..4a.png`
    (index-aligned with NAV_LINKS: История→1a, Концепция→2a, Аренда→3a,
    Контакты→4a).
- Note: photos are heavy (2–7 MB each, ~22 MB total). Fine for the pitch
  prototype; preload lazily (below). Optimization (resize/webp) is a later,
  separate decision.

## Layout numbers (from Figma `slider01`, stage px, 1440×800)

- **Star:** 1000×1000, center (784, 400) — NOT the light convergence point
  (760, 420). The star sits per Figma; the scale transition's
  `transform-origin` is the light center expressed in star-local coords:
  `(760−784+500, 420−400+500) = (476px, 520px)` — so it grows exactly out of
  the light, yet lands exactly on the mockup position.
- **Headline:** ALS Chromius Medium (`font-variation-settings 'wght' 500`),
  64px, `leading normal`, white, centered text, block width 692px, x-center
  784, top 294 (Figma: `top: calc(50% − 106px)`).
- **Background overlay:** flat `rgba(0,0,0,0.2)` (user's dial; Figma mockup
  used 0.41 — kept as a reference point if legibility fails on the sky).
- **Nav links during slider:** opacity 0.5 (Figma), eased ~0.5 s.
- Logo, news block, corner mark: unchanged (we keep «КРЕСТЫ · 2026», not the
  mockup's ARTLEBEDEV mark — that swap was decided long ago).

## Architecture

### New: `src/screens/main/StarSlider.ts` (~150–200 lines)

Owns the slider DOM, the idle watcher, the slide cycle, and exposes state the
screen reads each frame. No GPU work, no shader knowledge.

DOM (z-order matters — the ray canvas is z:3, stage z:4):

```
.star-slider            z:1, full viewport (same slot as .showreel)
  img.bg ×2             full-bleed zenith photos, object-fit cover, crossfade
  .star-slider-overlay  flat rgba(0,0,0,0.2)
  .star-stage           1440×800 stage-transform mirror (translate+scale,
                        updated from layout()) — star must live in stage coords
    .star-wrap          1000×1000 at center (784,400); CSS mask-image:
                        url(data:image/svg+xml;…star.svg); transform-origin
                        476px 520px; animated transform: scale()
      img.star ×2       nadir photos, crossfade on slide change
.slider-headline        lives INSIDE the real .stage (z:4, above the light):
                        Chromius 64px white, w 692, x-center 784, top 294,
                        opacity-crossfaded per slide
```

Public surface:

- `mix: number` — 0..1 overall presence (drives `bgMix` contribution and the
  screen's `sliderMix` target).
- `onFlash: () => void` — fired at each slide-change moment (and on entry)
  so MainScreen can reset its flash clock.
- `attach()` / `detach()` — arm/disarm the IdleWatcher (4200 ms, same delay
  as the old showreel). Only the active idle treatment is attached: the
  «Слайдер» tab arms StarSlider, tabs 1–3 arm the old Showreel.
- Wake condition = any pointer/key/touch (IdleWatcher's existing contract) →
  **full exit**: photos, star, headline all fade ~0.6 s, links return to
  full opacity, light returns to default. Nothing persists.

Slide cycle (per approved choreography):

1. Entry (idle fired): bg fades in ~0.8 s; `onFlash()`; star scales
   0.05 → 1 in ~0.5 s (expo-out — same violence register as the approved
   appearance burst); headline fades in ~0.3 s after the star lands.
2. Hold ~6 s.
3. Change: headline fades out ~0.2 s; star scales down into the origin
   ~0.25 s (ease-in); bg crossfades ~0.8 s; `onFlash()`; next star explodes
   out ~0.5 s; next headline in. Cycle 1→2→3→4→1.
4. Images are preloaded (`new Image().src`, `decoding='async'`) when the
   «Слайдер» tab activates, not at boot.

### Changed: `src/screens/main/variants.ts`

- 4th switcher entry `{ id: 'slider', label: 'Слайдер', params: <copy of
  siyanie params> }` — same light, different idle behavior.
  `SWITCHER_COUNT` 3 → 4.

### Changed: `src/screens/main/MainScreen.ts`

- `SLIT_IDS` += `'slider'` (it renders the «Сияние» slit light).
- Arm/disarm logic in `setVariant` + `start`/`stop`: slider tab ⇒
  `starSlider.attach()` / `showreel.detach()`, else the reverse. Switching
  tabs full-exits whichever show is up.
- New eased scalar `sliderMix` (target = starSlider active-and-showing ? 1:0,
  tau ≈ 0.25 s in, 0.2 s out) and a `sliderFlashT` clock reset by `onFlash`.
- **Param modulation, CPU-side only** (same pattern as `converge` and the
  burst — zero shader changes, zero new uniforms, twins untouched):

  | param | ember state (m = sliderMix) | flash (k = e^(−t/0.15)) |
  |---|---|---|
  | coreIntensity | ×(1 − 0.92·m) | ×(1 + 2.0·k) |
  | bloom         | ×(1 − 0.70·m) | ×(1 + 2.5·k) |
  | godrays       | ×(1 − 0.55·m) | ×(1 + 3.5·k) |
  | dustAmount    | ×(1 − 0.60·m) | — |

  Result at rest: no blown core behind the headline; faint rays leak from
  behind the star's 4 points onto the bg photo (backlit-star read).
- `bgMix` fed `max(showreel.mix, starSlider.mix)`.
- The slider does **NOT** drive `showreel.dark`/`modeMix` — the light stays
  white/holographic over the naturally-exposed photos. Dusty amber remains
  the hover + old-showreel mechanic.
- `.slider-on` class on the screen root while showing → `.nav-link`
  opacity 0.5 (CSS transition ~0.5 s).
- The stage-transform mirror (`.star-stage`) is updated inside `layout()`
  alongside the real stage.

### CSS: `src/screens/main/main.css`

New blocks for the DOM above; `mask-image` + `-webkit-mask-image` (Safari)
with the star data-URI; `will-change: transform` on `.star-wrap` during
animation. No changes to existing z-indices or blend modes.

## Untouched

`rayField.frag.glsl` / `rayField.wgsl` (the mirrored twins), uniform buffers,
`rayFieldTypes.ts`, router, TransitionController, Showreel logic (image list
only), NewsTicker, concept screen.

## Edge cases

- Navigating to «Концепция» mid-show: `MainScreen.stop()` detaches the
  slider → full exit; on return the idle cycle re-arms.
- Resize mid-show: `.star-stage` re-follows `stageScale()`; bg is viewport-
  full-bleed so it just re-covers.
- Hidden tab: rAF stops; dt clamp already prevents flash skipping (same
  protection the burst uses).
- Hovering a link the instant before idle fires: IdleWatcher's activity
  events reset it — same behavior as the old showreel; hover-scene and
  slider cannot be up simultaneously.
- `?fx=` dev override maps index 3 → slider variant like any other.

## Verification

1. `npm run typecheck` + `npm run build`.
2. Dev server + headless Chrome screenshots (existing scripts pattern,
   :5199): entry burst frames (~80/300/800 ms), mid-slide composition
   (star + headline + 0.5 links + ember light), slide-change flash, wake-up
   exit back to flat blue.
3. Both backends (WebGPU + forced WebGL2) — must render identically; the
   slider itself is DOM/CSS so only the param modulation differs per backend.
4. Tabs 1–3: old showreel still works with the new photos; hover scenes show
   the new images.

## Docs after implementation

- `docs/effects/TUNING_LOG.md`: «Feedback round 6» entry (decisions, dials)
  + variants table row.
- `docs/CHANGELOG.md` session entry.
- Memory: project status update.

## Open dials (expected designer tuning)

- Overlay darkness 0.2 (Figma had 0.41) — the sky slide is the stress test.
- Hold time 6 s; ember depths (the ×-factors above); flash strength.
- Star entry/exit durations (0.5 s / 0.25 s).
