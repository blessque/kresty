# «О Крестах» page and the seam (round 19)

**The page is: hero → masthead → map → gap → 5 sections → contact form → handoff → the REAL
main screen.** There is NO footer and no copy of the main block. `conceptPage.ts` orchestrates;
`conceptHero.ts` / `sectionRun.ts` / `pageBackground.ts` / `pageLight.ts` / `contactForm.ts` /
`mainHandoff.ts` do the work. It all lives inside the map's scroller — see
[CONCEPT_MAP.md](CONCEPT_MAP.md#scrolling) — which runs ~13 viewports, far past the stage.

Round 16's `residentSections.ts` / `residentGroups.ts` / `iconLight.ts` are DELETED.
`pageLight.ts` is `iconLight` recovered ~verbatim from `ef324b3^`, and every measurement in
its comments still holds.

---

## The hero (round 29) — `conceptHero.ts`

Figma `1253:693`, 1440×511, **above the masthead**: a full-bleed dusk render of the complex from
the Neva (`public/resources/embankment-hero.webp`, 2400×960, encoded from
`references/Renders/01_Voda.jpg` with the round-8 recipe), a veil, a centred tagline at Base
Text on a 436px measure, and four in-page links at Caption Small 87px apart. Height is
`clamp(320px, 35.486vw, 620px)` — full-bleed, so it has no reason to stop at 1440, but it needs
a ceiling or 2560 turns a 2.8:1 band into a letterbox slit.

**It is deliberately NOT a `.page-grid`.** Tagline and link row both centre on 720
(502 + 436/2, 369 + 702/2) — the PAGE centre, which the twelve columns have no line for:
column 6 ends where column 7 begins.

**`MapScroll.setIntro` is variadic now, and `measureIntro()` reads `stage.offsetTop`** rather
than summing block heights. The sum was correct for one block and is a maintenance trap for
two; the offset stays right however many blocks sit above the stage and whatever margins they
collapse.

**The wordmark needs a second ink, and that is measured, not a taste call.** New state class
`over-hero` on `#screen-concept` (written from the scroll position, `scrollTop < heroH − 72` —
the mark is 40px tall at the 32px corner, so what matters is the hero's bottom edge, not whether
the hero is on screen). Mean relative luminance per band against the three inks the site owns:

```
  band        bg L    white     ink #031721   link blue
  wordmark    0.496   1.92:1    9.51:1        1.17:1
  nav row     0.109   6.58:1    2.78:1        2.92:1
```

The photograph is a dusk sky at the top and dark water at the foot, so **it inverts across its
own height** — ink up there, white down here, one photograph and two answers, and the sitewide
blue is the worst available in both places. It cannot be `:not(.past-intro)`: that state turns
over at 60 % of everything above the map, by which point the mark is over the white masthead.

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
- **Round 31: the icon light is LIVE by default** — redrawn every visible frame with the running
  clock (`breathe`/`shimmer` finally alive) and an eased cursor, fed to the frame governor. The
  2-viewport canvas and its `translate3d` stay, so the light never chases the scroll; a
  `scissorPx` band shades only the on-screen viewport, so it costs what the main screen costs.
  Everything below about bakes, cells and the settle timer is now **`?bake` only**.
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

## The section opener, and the column that still sticks (round 29)

**ROUND 29: THE OPENER LEFT THE COLUMN.** Each `.sec` now opens with
`<div class="sec-head page-grid"><p class="sec-loud loud col-full">` above `.sec-grid` — the
ten-column FACTOID treatment «Музей» shares (see CONTENT_PAGES and DESIGN_SYSTEM), with
`padding: var(--sp-page) 0`. The frame draws 92 and 116.5 above and below; those are the two
nearest neighbours of one scale value, and taking the scale value is the point of having one.

**ROUND 29.2: IT IS A `<p>`, NOT AN `<h2>`, and the data field is `lead`.** The first pass
emitted `<h2 class="sec-h2 head-wide">`, which made the site's H2 mean 72px here and 40px on
«Аренда» — a visual treatment wearing a semantic level. Every one of these is a PROPOSITION,
not a title: «Остановиться в роскошном отеле в исторических зданиях-крестах» is a sentence
beginning with a verb. `PageSection.h2` was renamed to **`PageSection.lead`** with it, because
calling the field `h2` is what led to it being emitted as one. Three classes, three jobs:
`.loud` is the type (`--type-factoid-*`, in `styles/pages.css`), `.col-full` is the position
(the role class that already meant the ten-column measure — round 29's duplicate `.head-wide`
is deleted), and **`.sec-loud` carries no declarations at all**. It is the probe's selector and
a named hook; `concept.css` loads after `pages.css`, so anything restated on it would silently
win and put the opener back at 40px.

It is a **separate `.page-grid`**, not a third item inside `.sec-grid`. Both lay out identically
to the pixel, but a full-width item in the section's own grid would make the sticky aside a
row-2 item whose containing block is that row — and the band could then never carry its own
vertical rhythm without moving the icon with it.

**`.sec-col` KEEPS `position: sticky` even though it now holds only the icon**, and that is not
inertia: `sectionRun.measure()` reads this element's computed `top` to place the god-ray's
stations, so making it static moves the LIGHT, not just the icon. It is `position: sticky`,
NEVER a rAF transform — a transform runs on the main thread while the right column scrolls on
the compositor, which is round 16.1's "10 fps, jumps 20px" exactly. It lost
`text-align: var(--sec-col-align, center)` along with the text it was centring, and
`--sec-col-align` is deleted from `motionParams.ts`: one property, not two, because the icon's
own `--sec-icon-inline` margin now says everything.

**The icon holds VERTICALLY CENTRED (round 25), and the pin is per section.** The pin that
centres is `(viewH − colH)/2`; `sectionRun.measure()` writes each section's own `--sec-pin` in
px, clamped by the station invariant, and `MOTION.centre = 0` restores a flat `pin` in vh.

**MEASURED CONSEQUENCE OF THE OPENER LEAVING: `colH` stopped swinging.** It was 400–530 across the
run and changed with every re-wrap of a Russian line; with the icon alone it is a **constant 264**.
`--sec-pin` went ~230 → **318** at 1440×900, and the station invariant
`pin + colH + padBottom ≤ viewH` now clears by **+206px at every section** instead of clamping.
The clamp was the thing putting blocks above centre; it no longer binds.

**`--sec-body-lead` is 34vh (was 50).** It starts the body below the band so the icon is on
screen and pinned before the first paragraph arrives — layout, not animation, because a rAF
transform on `.sec-col` is round 16.1's defect and a `transform`/`filter`/`will-change` on any
ancestor steals sticky's containing block. **The value was measured before it was changed, and
the measurement is that this dial is not a correctness one:** at the scroll position where the
icon reaches its pin, the body's first line is at y = 751 / 679 / 607 / 535 for leads
50 / 42 / 34 / 26 in a 900 viewport, and **the light reads 1.00 in all four** — it reaches full
strength with the icon's top still at 1881, long before the pin. Light peaks 1.00 and boundary
dips 0.000 re-swept at leads 50 / 34 / 30 / 24 / 18. So the lead composes the section; it does
not gate the envelope.

**The default lives in two places and they must track each other**: `MOTION.bodyLead` in
`motionParams.ts` and the CSS fallback `padding-top: var(--sec-body-lead, 34vh)` in
`concept.css`. The page has to be correct with no JS.

**Hyphenation is OFF on `.sec-loud`** (round 29), and `npm run probe:heads` is what makes that
safe. It was load-bearing at a FLAT 40px in a four-column column — «для размышлений» is one
unbreakable 407px NBSP run against a 442px measure — and the loud changes both terms: ten
columns, and `--fs-factoid` is fluid again at `clamp(60px, 5vw, 72px)`. **«О Крестах» is the
tighter of the two swept routes and runs on 2.8px of clearance at 1200**, so a copy edit to any
`PAGE_SECTIONS.lead` must re-run the probe. At 72px a mid-word break is the most visible thing on
the page, which is why `hyphens: auto` was not simply left on as insurance.

**This page collapses on HEIGHT as well as width, and round 29's picture strip has to know.**
`.ms--slider` is `width: 100vw` offset by `--ms-bleed`, which walks back from column 7's left
edge (CONTENT_PAGES has the arithmetic). page.css carries the width half at `max-width: 1160px`
for all three longreads; the `max-height: 720px` copy is `#screen-concept`-scoped in concept.css
because nothing else on the site collapses on height. Miss it and the strip hangs 535px off the
left of a short window.

**`measure()` now re-runs on `document.fonts.ready`.** Its own header always said "call on
resize, on font swap and on image load" and the font-swap call was never wired, so every
measurement was taken against the fallback face. Round 25's centring made it visible — colH 458
under the fallback against 506 under Chromius, putting the pin 24px high on four of five
sections — but `colH` is also a term of the station invariant and of `iconY`'s `pushed` phase, so
it was never harmless. A constant pin simply hid it. (Those two numbers are the pre-band column,
heading included. Keep the call: `colH` is smaller now but it is still measured type-adjacent
geometry, and the invariant still reads it.)

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
