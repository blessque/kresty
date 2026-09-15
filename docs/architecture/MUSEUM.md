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

The cursor is still quantised to 20 cells (5×4) even though every frame draws — `u_parallax`
deforms the field toward the pointer, and the brief has always said *disturbed dust, never
literally follow the mouse*. The quantisation enforces that; it was never only a render budget.
No settle timer, unlike «О Крестах» — a bake there can pull a 70–90 ms mask rasterize with it,
and here the single mask never changes.

### The numbers, and how they were got

Three URL dials, which is how these were arrived at rather than guessed:
`?sign=` (emblem span in viewport heights) · `?exp=` (exposure gain) · `?fall=` (falloff, ref px).
Plus `?rot=<deg>` to pin the angle, and `?ls=` for render scale.

**«Сияние» IS THE PRESET, SPREAD UNTOUCHED.** Only what the composition forces may differ —
`centerPx`, `signSize`, `signRot` — plus ONE gain on the four emissive terms, because the
emblem is ~4× the hero's and those terms are not normalised for size. `layers` and `octaves`
come from the perf tier exactly as `MainScreen` supplies them.

| | shipped | note |
|---|---|---|
| `signSize` | **2.2 vh** | = the vector's own 1400px ink, so both crosses are one size |
| `GAIN` | **0.22** | one multiplier on godrays/bloom/core/haze; a scale correction |
| everything else | «Сияние» | dissolve 1 · grain 0.06 · ca · parallax · falloff 780 · dust · breathe · shimmer |
| render scale | cap **1.5** | concept caps at 2; this one re-renders per frame |

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

**`signSize` and `GAIN` are a pair. Do not move one alone.**

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

Grid role classes only — `.col-aside` for the era, `.col-main` for the body. The `.mus-*`
vocabulary deliberately does **not** reuse «О Крестах»'s `.sec-*`: that sheet's sizing hangs off
`--sec-pin`/`--sec-pad-top`/`--sec-body-lead`, which `applyMotionCss()` writes onto
`document.documentElement` from a module-level singleton that survives its screen being hidden.
Sharing the vocabulary would mean the concept page's tuning panel silently driving this page.

**The body leads the era**, which is the reverse of the longread. The frames put the kicker
~9vh into a section and the era name ~44vh, so the copy starts first and the title arrives as it
reaches the middle. Copying `--sec-body-lead: 50vh` put a screen of empty column beside every
section.

`.mus-col` is `position: sticky; top: 50%; transform: translateY(-50%)` — the era centres on the
viewport middle, which is where the cross's convergence point is, with nothing measured in
script. (A transform on the sticky element *itself* is fine; one on an **ancestor** steals
sticky's containing block.)

**`min-height: 150vh` on `.mus` is load-bearing.** A sticky column is on screen from the moment
its section's top edge is, so at a boundary the outgoing era sits at the top of the frame while
the incoming one arrives at the bottom. «Забвение» is three blocks long and did exactly that.
The floor plus `fadeEras()` — an opacity envelope on distance from the frame's middle — is what
keeps one era in the light at a time. «О Крестах» never shows this because its light's envelope
fades each station and the eye follows the light; there is one cross here and it never moves.

### Blocks

Four kinds, against the longread's two: `p` · `h3` · `list` · `media`. The round-26 rule is
kept — **a `media` block with ≥2 items is a slider, with 1 a figure** — so two pictures can only
stack if a `p` lies between them, and the DEV adjacency assertion is ported too.

List marks are `src/assets/star-bullet.svg` driven as a **mask** — the designer's file
byte-for-byte, which round 27 already masks for both the news tag separator and the news list
bullet. One file, three uses, and the mask is what lets each take its own colour:
`--color-mark-star` (amber) here, decorative and therefore not blue. A `clip-path: polygon()`
shipped first and was visibly wrong — the real outline is four QUADRATIC curves pinching to
sharp points, and straight edges between those points read as a notched diamond. Approximating
a shape the project already owns is the mistake to avoid.

**The picture block hugs its tallest slide.** `--ms-h` is a flat 410px elsewhere — the
designer's number for «О Крестах», where the photographs are mixed portrait and landscape.
All of «Музей»'s are wide (1304×728 renders 559×312 in the body column), so the constant left
49px of dead air above and below every slide and 189px between a photo and the paragraph under
it. `MuseumRun.fitFrames()` writes a per-block `--ms-h` from the slides' **intrinsic** aspects,
capped at 410.

`height: auto` is NOT the fix and was tried: slides are `loading="lazy"` with `width`/`height`
attributes and `width: auto; height: auto` in CSS, so before decode those attributes supply only
an aspect-ratio — which needs a definite side — and every frame measured 0×0. That is round 27's
desync bug exactly, and the fixed height was what had been hiding it. The height stays definite;
only its value changes, and it comes from numbers known before the first byte arrives.

**The chrome runs the other way to the ink.** The wordmark and the slider chevrons are
`--color-link` blue sitewide, which is correct on the four white pages and is the one thing with
no contrast on `#081b5a`. `--mus-chrome` is written per frame from the same `whiteness` and runs
white → link blue, so they are legible on the dark fields and interactive-blue by the time the
field is white. The masthead CTA is `.btn--secondary` on dark — transparent plate, white stroke —
labelled «Связаться», which is the frame's own word on this page.

### Narrow

Below 1160 the grid collapses to one column — **template, placement AND `min-width: 0`**.
The third one is not optional and is a new finding: `1fr` is `minmax(auto, 1fr)`, so the track
floors at its content's min-content, and `.ms-frame` is deliberately `100% + one column + one
gutter` wide. The track grew to fit it and **the body column measured 1501px inside a 1100px
viewport** — photographs running off the right edge with the next slide visible beside them.
Measured identically at 1100 and 900. `min-width: 0` is what lets a grid item be narrower than
its own overflowing child.

`.mus-col` stops sticking, and the light drops to 45 % (`NARROW_LIGHT`), because at that width
the body copy moves under the convergence point and there is no left edge to spare.

---

## Assets

Eleven WebP, round-8 recipe (long edge ≤ 2400, `cwebp -q 82`, native aspect), all prefixed
`museum-`. Nine came from `references/`; §4's two came off the Figma frame and exist nowhere
else in the project — the winter street is only 1280×859, which is under the cap and barely
covers a 559px column at 2× DPR. **Ask the designer for the source.**

Two copy corrections were made to the frame's own text, both flagged in `museumSections.ts`:
«Сохранились элемент» → «Сохранился элемент», and `...` → `…`. «остается»/«свое» were left as
written.
