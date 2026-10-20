# «Музей» — the descent, and the light that stops working

Round 28. Figma frame `1049:1021`. Route `#museum`, `src/screens/museum/`.

**The page is: masthead → four eras → handoff → the REAL main screen.** No contact form, no
footer. It extends `ContentScreen` like the other four content pages and adds exactly two
things: a rAF, and a canvas.

---

## The argument

Four eras, four fields, descending:

| § | era | field | |
|---|---|---|---|
| — | masthead | `T.bgDarkMain` `#031721` | |
| 1 | Экономическая свобода · 1710–1880 | `T.bgDarkMain` `#031721` | |
| 2 | Изоляция свободы · 1884–2017 | `T.bgCulture` `#081b5a` | |
| 3 | Забвение · 2017–2026 | `DAWN_MID` `#2b4a7a` | aliased `BG_OBLIVION` |
| 4 | Свобода личности · 2026–… | `T.bgLightMain` `#ffffff` | |
| — | seam | `MAIN_BG` `#56b7e6` | no dawn — see below |

The copy is about freedom being taken away and given back, and the field is the only part of
the page that says so without words. **That is why the last section is white and not a fifth
blue**: the light has to stop working, because the place stopped needing it.

---

## The light

One cross, convergence point pinned at **(x = 0, y = 50vh)** — x = 0 bisects the emblem on the
frame edge, so the page shows its right half. It does not travel. It **rotates 180° across the
content**, and nothing else about it moves.

### Why it is not `screens/concept/pageLight.ts`

That class is almost entirely a solution to *travel*: its icon slides past the frame, so a
two-viewport canvas is baked once per station and then moved on the compositor, guarded by a
`SectionGeom` table, an envelope, a hysteresis test and a station invariant. The assertion it
protects is "0 GPU submissions across 60 scrolling frames".

A cross that does not travel needs none of it. `museumLight.ts` is a **one-viewport canvas that
re-renders every frame with a live clock**, which is the main screen's cost profile, not a
regression against the concept page's. Measured **60 fps idle, 59 fps scrolling** at 1440×900.

**It was baked first and that was wrong.** The first cut froze `timeSec` at 0 and redrew only
when the scroll or the cursor moved it, inheriting the concept page's "a still reader submits
nothing" budget. That budget is right THERE, where a second GPU context runs beside Three.js
and six stations each want their own mask. Here it bought nothing anybody could see and cost
the thing worth having: with the clock stopped, `breathe`, `shimmer`, the dust drift, the fiber
comb and the slow `vnoise` gate on the god-rays are all inert **by construction**, so the light
was a photograph of the hero rather than the hero. There is exactly one glowing element on this
page and nothing else on the GPU; it can afford a clock.

**Round 31: the cursor is EASED, not quantised** — `SmoothPointer`'s τ 0.4 s, the main screen's
feel. The 20-cell grid (5×4) it replaced was a leftover of the baked light and made the cross
jump between 20 poses; *disturbed dust, never literally follow the mouse* is satisfied by
inertia, exactly as on the main screen.

**Round 34: on a phone the cursor is the HAND and the SCROLL, never the finger.**
`page/touchLight.ts`, gated on `(hover: none) and (pointer: coarse)`: the gyro (main's own
`SmoothPointer`, with `ignoreTouch` so a finger landing to scroll no longer yanks the light) plus
a **scroll gust**, where the eased page velocity pushes the virtual cursor along the content's
motion and lets go when the page settles. The rotation gets weight too: a spring chases
`progress × π`, so a flick glides on and settles. **34.2 made it critically damped (ζ 1) and
removed round 34's ~7° gust twist, and halved the gust (0.34 → 0.17 viewports).** The user found
the swing-back "too hard". Desktop keeps the direct mapping. `?rot=` still pins.

### The numbers, and how they were got

URL dials: `?sign=` (emblem span in viewport heights) · `?exp=` (the RAYS gain since round 34) ·
`?fall=` (falloff, ref px). Plus `?rot=<deg>` to pin the angle, and `?ls=` for render scale. The
rest are the lab's **«Музей» group** (`?lab`, `MUSEUM_LOOK` in `shared/lightLook.ts`).

**«Сияние» IS THE PRESET, SPREAD UNTOUCHED.** Only what the composition forces may differ —
`centerPx`, `signSize`, `signRot` — plus what the emblem's SIZE forces (below). `layers` and
`octaves` come from the perf tier exactly as `MainScreen` supplies them.

**Round 34: the single `GAIN = 0.22` treated a LENGTH problem as a brightness one.** At
dissolve 1 the visible arms ARE the rays, and the rays' trails decay in emblem units, so a 4×
emblem draws them 4× longer in px. They crossed the whole frame and lifted the navy, and 0.22
fixed that by making the cross grey. The user asked "why is it faded?" Now `reach` shortens the
trails back toward the hero's length, and the rays burn at the hero's strength. Luminance
percentiles over the left half at 1440×900, `?rot=30`:

| look | field p10 | arms p99 |
|---|---|---|
| round 28.1, one gain 0.22 | 41 | 169 |
| bloom/core at 1, rays still 0.22 (the first split) | 54 | 205 (field lifted, arms still grey) |
| **cross 0.3 · rays 1.2 · reach 0.3** (shipped) | **34** | **228** |
| main's own cross, centre 500² | 54 | 237 |

| | shipped | note |
|---|---|---|
| `signSize` | **2.2 vh** | = the vector's own 1400px ink, so both crosses are one size |
| `exposure` · `trail` · `edge` · `bloom` · `core` | **0.33 · 0.81 · 0.32 · 0.21 · 0** | this page's OWN copies of the Light group's handles, replacing them here only (34.1–34.2) |
| `cross` | **0.49** | gain on bloom + core, the glow hugging the emblem |
| `rays` | **0.68** | gain on godrays + haze, the rays themselves (`?exp=` overrides; lab key `musTrails`) |
| `reach` | **0.33** | the trails' length relative to «Сияние»'s; what keeps the field dark |
| `solid` | **0.86** | `1 − dissolve`, the crisp register: rays gated near the centre, a sharper bloom. With `core` 0 the strokes themselves stay dark. It raises the canvas to native resolution (≈ 4.1 ms on the M1 at 2×, the bench's "exact, moving" row) |
| `deskX` | **−0.056** | the desktop centre, as a fraction of the width: −80 px at 1440, scaling with the screen |

**Rounds 34.1 and 34.2 are the user's own looks from the lab**: the rows above are 34.2's. The
first cut (cross 0.3 · rays 1.2 · reach 0.3 · solid 0) is the measured row in the table before
it. Both links set Light-group handles while tuning this page: 34.1 `exposure`, 34.2 `trail`,
`edge`, `bloom` and `core`. Those reach every page, so 34.1 dimmed «О Крестах»'s icons and 34.2's
`core 0` would have switched their crisp body off. The page now carries its own copies
(`museumLookOver()` → `applyLook(p, over)`), and the global handles no longer reach it.
| everything else | «Сияние» | dissolve 1 · grain 0 (31.3) · ca 0 (round 33) · parallax · falloff 780 · dust · breathe · shimmer — then the shipped look on top (33.2, tuned on this page: trail ×1.47, ray edge 0.41, bloom ×0.34, core ×0.67, see RAY_FIELD.md) |
| render scale | **the detail cap** (round 33) | `page/lightScale.ts`: ≈ 1.0 at 1440 on a 2× screen, governed by `EXACT_LADDER`; was a 1.5 cap under the march ladder. `?ls=` still pins it |

### Round 28 built this from the WRONG PARENT

It copied `screens/concept/pageLight.ts`, the nearest precedent for "the hero light on a page".
But that class does not use «Сияние» either — it overrides seven params from «О Крестах»'s
`MOTION` set, dialled for ~200px silhouettes that must read as objects, and ships `grain: 0`
and `octaves: 0` on top. Inherited here the divergence was:

```
dissolve   1    → 0.41    «Сияние» IS the dissolved logo; 0.41 is «Прорезь»
grain      0.06 → 0       the register is "grainy, sculptural" — a client rule
octaves    4    → 0       the fbm dust switched off entirely
layers     3    → 4
godrays / bloom / core / falloff / parallax   all re-tuned
```

**`octaves: 0` did the visible damage** — it feeds the volumetric noise, so the light had no
dust in it and read as a smooth pre-rendered gradient. That is what "why does it look baked?"
was pointing at, and the live clock alone was never going to fix it. Every param that gets a
local opinion is a step back toward a lookalike; keep them coming through the spread.

**`signSize` and the size terms are a pair. Do not move one alone.** (Round 28.1 wrote this
about `GAIN`; since round 34 the terms are `reach`, `trails` and `cross`, and `reach` is the one
that scales with the emblem.)

`signSize` is the SLIT, not the rays — their reach comes from `falloffL`. That is true, and it
is *not* sufficient: a small slit makes thin needles, and both the frame's own light-beam
renders and the designer's vector draw WIDE soft wedges. **The emblem's size sets the rays'
width even though it does not set their length.** It shipped at 0.46 (the hero's 380-on-1440)
on the correct half of that reasoning and read as a different effect at a different scale.

At 2.2 the slit is large enough that every pixel is a source, so the gain must come down with
it: the canvas composites `screen`, which makes the gain also **how far the light lifts the
field**, and the field is the argument of this page. Sanity-checked against the frame's own hero
render, whose open field reads ~`rgb(37,37,33)`.

Note that single-pixel sampling stopped being a stable measurement once `grain` and the clock
went live — every frame genuinely differs, which is the point. Compare regions, or just look.

---

## The white ending — one number, four consumers

The last field is white, where the shader light is not faint but **absent**: `screen` is
`1 − (1−a)(1−b)`, which can only lighten. Four things therefore have to move together across
that boundary, and if any lags the page shows white text on a white field:

```
whiteness  →  canvas opacity      1 − w
           →  vector cross        w × 0.3
           →  --mus-ink           mix(#ffffff → #031721, w)
           →  --grain-k           1 − w
```

`MuseumScreen.whiteness()` reads `PageBackground.blend` / `.toIndex` — **the blend factor the
colour track actually painted with**, not a second copy of the same smoothstep. A second copy
would agree today and drift the first time a band width or a stop moved, and the failure is
invisible copy rather than an error. Exposing those two fields is the round-28 change to
`pageBackground.ts`.

It is *whiteness*, not "progress past white": the field leaves white again at the seam, and a
cross that only knew it had arrived would sit blue-on-blue over the handoff.

Both the light and the cross are additionally multiplied by a `fade` that ramps to 0 across the
first viewport of the handoff — so the page's last painted frames are flat blue with nothing on
them, which is the whole basis of the seam being undetectable. **Measured: max Δ 6 at the swap**,
rising to 24 at 120 ms and 86 at 300 ms as the light intentionally blooms open.

### The seam skips the dawn, and this page declares nothing to make that happen

`DAWN_MID` exists to bridge «О Крестах»'s ~7 %-lightness form to a 62 % brand blue. A page whose
last field is **white** has no such gap, and routing through `#2b4a7a` makes the ending dip dark
before it brightens.

Round 28 shipped a `MainHandoff.dawn` flag for this. **Round 27 had already solved it properly**
and landed on `main` first: `setFrom()` reads the incoming colour's relative luminance and drops
the dawn above 0.2, with `PageShell` passing the page's last stop. The flag was deleted on the
rebase — it was a second, manual answer to a question already answered, and one that could
disagree with the track it described. «Музей» gets the light path (`HANDOFF_VH` 3.0,
`FIRE_VH` 1.5) with no museum code at all. Verified: the ramp is white → `#56b7e6` with no
`#2b4a7a` anywhere, and the seam still fires.

---

## The two emblems are not the same drawing

- the light rasterizes `assets/sign.svg` — the hero's own file, `{ raw: true }`, no `contentFrac`
- the vector is `assets/cross-vector.svg` — **the designer's `references/cross-vector-big.svg`**,
  byte-for-byte, with the viewBox opened from its `0 0 545 1135` crop to the drawing's own
  bounding box `-855 -265 1400 1400`

Reusing `sign.svg` for both is the obvious move and it is wrong: measured, the wedges are 3.5 %
of the span in `sign.svg` and 2.4 % in the designer's, so the hero's emblem puts visibly fatter
rays on the white section than the frame draws. The delivered crop cannot be used directly
either — **rotating a pre-cropped half rotates its straight cut edge into view.**

What the two share is centre, footprint and direction of travel. Their ray angles do not match
and cannot be made to (different drawings, and the mask is uploaded Y-flipped, which mirrors the
light's rays): measured on a circle around the convergence point, the light's sit at about
−56/−15/−7/+11/+17° and the vector's at ±18/±27/±63/±72°. The crossfade is a dissolve between
two drawings of one motif, over a 0.6-viewport band during which the angle moves ~10°.

### The rotation direction had to be fixed, not assumed

**The shader turns the opposite way to CSS for the same number.** It rotates the coordinates it
*samples* the mask with, so the image turns against the sign; `rotate()` turns the drawing
itself. Measured with `?rot=`: ray angles moved **−10° for `signRot: +10°`** and **+40° for
`rotate(40deg)`**. `MuseumScreen` therefore writes `--mus-rot` as the **negative** of the
shader's angle. Left unnegated the two counter-rotate through the crossfade.

The 45° symmetry of the emblem is what makes this easy to get wrong by eye: a 40° step lands
one ray almost exactly where another was. Measure on a circle; do not look.

---

## Layout

Grid role classes only — `.head-wide` for the era band (round 29; it was `.col-aside`),
`.col-main` for the body. The `.mus-*` vocabulary deliberately does **not** reuse
«О Крестах»'s `.sec-*`: that sheet's sizing hangs off `--sec-pin`/`--sec-pad-top`/
`--sec-body-lead`, which `applyMotionCss()` writes onto `document.documentElement` from a
module-level singleton that survives its screen being hidden. Sharing the vocabulary would mean
the concept page's tuning panel silently driving this page. `.head-wide` is the exception and is
safe precisely because it is the opposite kind of thing — a grid POSITION plus a type style in
`styles/pages.css`, with no JS writing to it.

### ROUND 29: THE ERA NAME LEFT THE CROSS

Round 28's signature pairing was a sticky `.mus-col` —
`position: sticky; top: 50%; transform: translateY(-50%)` — so the era title rode inside the
light cross's convergence point at every viewport height, with nothing measured in script. The
client replaced it with the **same full-width FACTOID band the longread now uses**:

```
<div class="mus-head page-grid"><div class="head-wide">
  <h2 class="mus-era">…</h2><p class="mus-years">…</p>
</div></div>
```

`padding: var(--sp-page) 0`, matching `.sec-head` in concept.css so the two longreads open a
section identically. **`.mus-col` is DELETED rather than emptied**, and three things go with it:

- **`MuseumScreen.fadeEras()`, `ERA_HOLD` and `--mus-era-op`.** That crossfade existed only
  because two PINNED titles could share the frame at every boundary — a sticky column is on
  screen from the moment its section's top edge is, and «Забвение» is three blocks long. A
  heading that scrolls away hands over by itself. This is the shape of the whole round: the
  mechanism was correct *for pinning*, so deleting the pin deletes the mechanism, not just its
  parameters.
- Round 28's note that **"the body leads the era"** — the kicker ~9vh in, the era name ~44vh —
  described a PINNED title and stopped being true. The era opens its section like every other
  heading on the site. `--sec-body-lead`'s screen of empty column was already rejected here for
  putting nothing beside the cross, and still is; `.mus-body` has no lead-in.
- **The type goes on the heading, never on the band.** `.mus-era` takes `.head-wide`'s Factoid
  from pages.css and restates nothing — museum.css loads second at the same (0,1,0), so a
  `font-size` here would silently win and put it back at 40. The *wrapper* is the other half of
  the same trap: the UA sheet gives `h2` `font-size: 1.5em`, so setting 72 on `.head-wide`
  rendered the era name at **108px** — larger than the site's H1, and plausible enough on screen
  to read as a design choice.

**Hyphenation is off on `.mus-era`**, as on `.sec-h2`. This page has by far the most room of the
three routes: «Экономическая свобода», the longest, clears its measure by 244px at 1440 and
175px at 1165. `npm run probe:heads` holds that.

**`min-height: 150vh` on `.mus` outlived its first reason and kept a second.** It was a screen
and a half because two pinned titles could share the frame; nothing pins now, so that cannot
happen. But the cross rotates 180° across the whole page and its pacing is per section — a
section shorter than this turns it faster than the eye reads, which is the same complaint from
the other end.

### Blocks

Four kinds, against the longread's two: `p` · `h3` · `list` · `media`. The round-26 rule is
kept — **a `media` block with ≥2 items is a slider, with 1 a figure** — so two pictures can only
stack if a `p` lies between them, and the DEV adjacency assertion is ported too.

List marks are `src/assets/star-bullet.svg` driven as a **mask** — the designer's file
byte-for-byte, which round 27 already masks for both the news tag separator and the news list
bullet. One file, three uses, and the mask is what lets each take its own colour. A
`clip-path: polygon()` shipped first and was visibly wrong — the real outline is four QUADRATIC
curves pinching to sharp points, and straight edges between those points read as a notched
diamond. Approximating a shape the project already owns is the mistake to avoid.

**ROUND 29: 12px, and the same 12px as `.article-list`.** There is one star size on this site
now; the 24px amber mark this page shipped with was the only second opinion and the client
removed it. `--color-mark-star` is deleted from `tokens.css` with it. **The colour is
`var(--mus-chrome, var(--color-text-ondark-main))`, NOT a literal white** — that is the whole
subtlety of "white bullets on the dark background": this page descends to a `#ffffff` field, and
a literal white mark is invisible on the fourth era. The fallback is white so the list is
legible before the first rAF.

**The chrome runs the other way to the ink.** The wordmark is `--color-link` blue sitewide,
which is correct on the four white pages and is the one thing with no contrast on `#081b5a`.
`--mus-chrome` is written per frame from the same `whiteness` and runs white → link blue, so it
is legible on the dark fields and interactive-blue by the time the field is white. The star
bullets take it too. The slider chevrons were the other consumer until round 29 deleted them —
the strip pans with the page scroll and there is nothing to press. The masthead CTA is
`.btn--secondary` on dark — transparent plate, white stroke — labelled «Связаться», which is the
frame's own word on this page.

### The picture strip (round 29) — and why `fitFrames()` is gone

`MuseumRun.fitFrames()` is **DELETED**, and `STRIP_H` is no longer imported here. It wrote a
per-block `--ms-h` from the slides' intrinsic aspects because the shared 410 is «О Крестах»'s
number — mixed portrait and landscape — where all of «Музей»'s photographs are wide: at 559 in
the body column a 1304×728 render was 312 tall inside a 410 frame, leaving 49px of dead air
above and below every slide and 189px between a photo and the paragraph under it.

Both halves of that are gone. The strip is `width: 100vw` now and each slide is
`height: var(--ms-h); width: auto` — **a slide fills the height exactly and takes the width its
aspect gives it**, so there is no dead air to remove. See CONTENT_PAGES for the full mechanism
(`--ms-bleed`, `animation-timeline: view()`, `safe center`, the `@supports` / reduced-motion
scroll fallback).

Keep the reason the height stays DEFINITE. `height: auto` is not the fix and was tried: slides
are `loading="lazy"` with `width`/`height` attributes, so before decode those attributes supply
only an aspect-ratio — which needs a definite side — and every frame measured 0×0. That is round
27's desync bug exactly. `height: var(--ms-h); width: auto` is a *stronger* guard than the fixed
box it replaces, not a weaker one: the definite side is stated in CSS and the other is derived
from the intrinsic ratio the attributes already carry.

### Narrow

Below 1160 the grid collapses to one column — **template AND placement**, and the placement
reset must name `.mus-head > .head-wide` too or the band's ten-column span survives into a
one-column grid and creates implicit tracks, leaving the heading narrower than the body under
it.

The third declaration, **`min-width: 0`, moved to `.page-grid > *` in grid.css in round 29** and
is global now. Round 28 found it here: `1fr` is `minmax(auto, 1fr)`, so the track floors at its
content's min-content, `.ms-frame` was deliberately `100% + one column + one gutter` wide, and
**the body column measured 1501px inside a 1100px viewport** (identically at 1100 and 900). That
is the same bug the `100vw` strip would now cause on a WIDE screen, so it is one rule rather
than two that can disagree.

Below 1160 the body copy moves under the convergence point and there is no left edge to spare,
so the light is capped. It was a fixed 45 % (`NARROW_LIGHT`). **Since round 34 it is the lab's
`phoneGlow`, at 0.56 since 34.1**, and two more handles place the convergence point on a narrow
screen:
`phoneX` (fraction of the width, 0 = the left edge, −0.25 a quarter further off it) and `phoneY`
(fraction of the height, 0.5 = the middle, 1 = the bottom corner). The user's reasoning: a phone
is read in one band of its height, so where the light sits matters as much as how bright it is.
The vector cross reads the same point through `--mus-cx`/`--mus-cy`, written by `MuseumScreen`,
so the white handover lands where the light was.

**34.1: on a phone the cross sits in the BOTTOM-RIGHT corner** (`phoneX` 1, `phoneY` 0.98),
the user's pick: there "it doesn't hurt left-aligned text reading". The page then shows the
emblem's left half, a mirror of the desktop composition, **so the spin mirrors too**. The rule is
derived from where the centre sits (right of the frame's middle → the angle is negated), so the
lab can move it back left and the original turn returns. The vector cross reads the same signed
angle. (Nothing sticks down here any more — there is
nothing left to un-stick.)

---

## Assets

Eleven WebP, round-8 recipe (long edge ≤ 2400, `cwebp -q 82`, native aspect), all prefixed
`museum-`. Nine came from `references/`; §4's two came off the Figma frame and exist nowhere
else in the project — the winter street is only 1280×859, which is under the cap and barely
covers a 559px column at 2× DPR. **Ask the designer for the source.**

Two copy corrections were made to the frame's own text, both flagged in `museumSections.ts`:
«Сохранились элемент» → «Сохранился элемент», and `...` → `…`. «остается»/«свое» were left as
written.
