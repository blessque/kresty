# «О Крестах» page and the seam (round 19)

**The page is: map → gap → 5 sections → contact form → handoff → the REAL main screen.**
There is NO footer and no copy of the main block. `conceptPage.ts` orchestrates;
`sectionRun.ts` / `pageBackground.ts` / `pageLight.ts` / `contactForm.ts` / `mainHandoff.ts`
do the work. It all lives inside the map's scroller — see
[CONCEPT_MAP.md](CONCEPT_MAP.md#scrolling) — which runs ~13 viewports, far past the stage.

Round 16's `residentSections.ts` / `residentGroups.ts` / `iconLight.ts` are DELETED.
`pageLight.ts` is `iconLight` recovered ~verbatim from `ef324b3^`, and every measurement in
its comments still holds.

---

## The inter-section gap IS the swap quality (round 23.1)

`pageLight.ts` says *"the light fades out as its own icon leaves the frame and the swap happens
at zero."* Whether that is true depends entirely on **`--sec-pad-top`**, because the pin holds
each icon near `u ≈ 0.22` — close to `envelope()`'s flat top — so the roll-off only engages if
the icon has room to travel between stations. Measured min opacity per boundary at 1440×900:

```
  gap 20vh   0.811   0.811   0.267   0.252     ← the mask swapped at 81% brightness
  gap 40vh   0.000   0.000   0.000   0.000     ← what the comment always claimed
```

So the "rude" swap and "the gaps are too small" were **one problem**. The default is 40vh
(≈51vh of visible gap once `padBottom` is added). **`padTop` is the lever, not `padBottom`** —
the latter is a term of the station invariant and cannot grow far; the former is in neither the
invariant nor the column.

Corollary: `edge` and `curve` only shape a ramp the icon actually reaches. On a short viewport,
or if the gap is ever reduced, they go inert and `MOTION.swapDip` is the fallback — a half-sine
fall to `1 − dip` over `swapMs` that **holds the icon back until the bottom**, so the mask
changes at the darkest moment («Слайдер»'s own rule: *the light dips, it never flashes*).
Default 0. Measured 1.000 at dip 0, 0.049 at 0.7 on the flush-section build.

Three further contributors, all on dials rather than guessed:
`iconY` is `min(max(flowing, pinned), pushed)`, so its slope jumps **−1 → 0 → −1** and the
envelope inherits both corners (`follow`); `track()` had no hysteresis, so the owner could
chatter and every flip is a re-bake (`hysteresis`); and `bake()` renders one frame with the old
mask still uploaded before `maskFor()` resolves (left alone — the dip covers it).

## The motion panel — `?admin=1`

`MotionPanel.ts` + `motionPanel.css`, dynamically imported so neither reaches a client demo's
bundle. Built on `WaterPanel`'s shape plus `ControlPanel`'s segmented row and **versioned**
`STORE_KEY` (an unversioned store shadows changed defaults, which is the whole activity here).

**Two invariants are live readouts in the panel, not console warnings** — `pin`, `padBottom`
and `iconSize` are all sliders now, and a warning nobody is watching is not a guard rail:

- `pin + columnHeight + padBottom ≤ viewH` — the station invariant.
- `gapVh ≥ 0.5 + bandVh/2` — and note the **shipped default sits exactly ON that floor**
  (gap 0.8, band 0.6). There is no headroom: widen the colour band and the gap must follow, or
  the crossfade climbs into the map.

Layout dials reach CSS through `applyMotionCss()`, which writes custom properties on the ROOT
so they inherit to all five sections and the form at once. **The stylesheet's fallbacks are the
same defaults**, so the page is correct with no JS.

## Round 25 — the icons react to the cursor, and hold centred

- **Render scale 1 → 2**, closing the standing Retina-softness open issue. The client's "too
  grainy" and the log's "53 % sharpness" were the same measurement: at cap 1 the canvas renders
  one device pixel per CSS pixel and the compositor doubles it, and `hash21(fragPx)` seeds from
  ABSOLUTE fragment position, so every dither speck becomes a 2×2 smear. Measured after:
  mean |∇luminance| over lit pixels **4.28 → 5.68**.
- **`?ls=<k>` now exists.** It was documented here since round 16.1 and never built (nothing
  read `ls`; the constant also lives in `conceptPage.ts`, not `ConceptScreen.ts`).
- **The cursor moves the light again, in 5 × 4 = 20 quantised cells.** Three things were off,
  not one: `MOTION.parallax` was 0 (which zeroes every consumer of `q`), `bake()` was never
  called on cursor movement despite its own doc comment saying it was, and **the pointer was
  passed in WINDOW coordinates where `render()` expects canvas-local** — an error of up to a
  full viewport, inert only because parallax was 0. Canvas-local is `cursorY − (iconY − viewH)`.
- **A bake needs the cursor to SETTLE (90 ms), and that is what makes full scale affordable.**
  Baking on every cell crossing put 28 of 65 frames over 30 ms; with the settle a fast flick
  costs 0 bakes during and 1 after, and a reader's four deliberate moves cost four bakes with
  **0 of 98 frames over 30 ms**. So the hitch was never one bake's price — it was bakes arriving
  faster than they complete. Round 16.1's property is intact: **60 scrolling frames still make 0
  GPU submissions.**

## The two sticky columns

**The left column is `position: sticky`, NEVER a rAF transform.** A transform runs on the main
thread while the right column scrolls on the compositor, which is round 16.1's "10 fps, jumps
20px" exactly.

**The icon + h2 hold VERTICALLY CENTRED (round 25), and the pin is per section.** The pin that
centres is `(viewH − colH)/2`, and `colH` swings 400px+ across the run — these are wrapped
Russian headings, nine lines for the museum against four for «Аренда» — so one `vh` would centre
exactly one section. `sectionRun.measure()` writes each section's own `--sec-pin` in px, clamped
by the station invariant; where the clamp binds the block sits above centre, which is the right
trade. `MOTION.centre = 0` restores a flat `pin` in vh.

**`--sec-body-lead` (50vh) starts the body below the heading**, so the icon and h2 are on screen
and pinned before the first paragraph arrives. Layout, not animation — a rAF transform on
`.sec-col` is round 16.1's defect, and a `transform`/`filter`/`will-change` on any ancestor
steals sticky's containing block.

**`measure()` now re-runs on `document.fonts.ready`.** Its own header always said "call on
resize, on font swap and on image load" and the font-swap call was never wired, so every
measurement was taken against the fallback face. Round 25's centring made it visible — colH 458
under the fallback against 506 under Chromius, putting the pin 24px high on four of five
sections — but `colH` is also a term of the station invariant and of `iconY`'s `pushed` phase, so
it was never harmless. A constant pin simply hid it.

Three silent breakages, all commented in `concept.css`:

1. a sticky flex item under `align-items: stretch` (→ grid + `align-self: start`),
2. an `overflow: hidden` ancestor,
3. a `transform` / `filter` / `will-change` ancestor.

**The station invariant is `pin + columnHeight + paddingBottom ≤ viewH`**, asserted at runtime
in `sectionRun.ts`. It replaces round 16's height-based dip proof (sticky adds a hold phase).
**Top padding belongs on `.sec`, never on `.sec-col`** — inside the column it counts toward
the column's own height and breaks the invariant.

**`iconY`'s clamp upper bound must NOT be floored at `pinned`.** That "guard" is what left the
last icon lit on the handoff's blue two viewports past its section; the bound has to fall so
`envelope()` can reach 0.

---

## The colour track

**`.page-bg` is ONE element, and nothing else may carry a background** — a hard-coded colour
anywhere below sits as an unfading band across the crossfade. Pure colour outside a 0.6 vh
band centred on each seam; **not a gradient**. The sample point is the viewport CENTRE.
`color-mix(in oklab, …)` behind a `CSS.supports` probe.

**Two palettes ship** (`?pal=figma`): the designer's sampled hues include a 39.2 %-lightness
violet, against the 15–22 % ceiling this light has under `screen` — `1−(1−a)(1−b)` can only
lighten. `bgDeep` moves lightness only, never hue or saturation. Awaiting the designer.

---

## The seam into the main screen

**THE SEAM IS UNDETECTABLE BY CONSTRUCTION, and `grain` is part of it.** Main's resting field
is the flat brand blue; at `reveal 0` the shader writes `vec3(0)` — but only if `grain` is in
the reveal multiply, because it is one of the two ADDITIVE terms in `main()` (the other is the
±1/255 dither). Measured: max Δ 2 on 0.02 % of pixels at the swap.

**`setStageDim` is not `setReveal`.** The former leaves the stage at opacity 0.05 and never
touches `.corners` — the wordmark/descriptor/CTA/mark layer would appear fully opaque at the
swap. `setReveal` drives both plus `--grain-k` (`#grain` is off on «О Крестах» and 0.07 on
main, and over blue an overlay grain is visible — it is a no-op only against black).

**The handoff fires at an INTERIOR line, not scroll-end.** `scrollTop + clientHeight >=
scrollHeight` is unreliable at fractional DPR and is where rubber-banding lives. The colour
must be applied BEFORE the fire check **in the same task**, and `bgPure` is required —
reversed, a hard flick paints one frame of the intermediate colour. `?ho=` / `?fire=`.

**The return gesture calls `history.back()`**, so it and the browser Back button are one code
path. Arming needs 140 ms of wheel silence — a momentum stream is continuous at 60 Hz and so
cannot open an accumulation. `deltaMode 1 → ×16`, or Firefox needs ~80 notches.

**One ray-field canvas per page is a hard rule.** A second is a second `GPUDevice` —
`WebGPURayFieldRenderer.init` calls `requestAdapter()` AND `requestDevice()` per instance.
Assertions to keep reproducing: 0 GPU submissions across 60 frames inside a section, ~1 per
station boundary.
