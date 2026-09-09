# Main screen — ray field, nav geometry, the photo slider

Full-viewport nav where a live crossing-light / lit-dust shader replaces a pre-rendered video.
Uniform anatomy is in [RAY_FIELD.md](RAY_FIELD.md); decisions and rejected experiments are in
[../effects/TUNING_LOG.md](../effects/TUNING_LOG.md).

Variants: Сияние · Прорезь · Призма · **Слайдер, and Слайдер is the DEFAULT** —
`DEFAULT_INDEX` in `variants.ts` resolves to it, and it is the only variant that arms
`PhotoSlider` (every other tab gets the Showreel). `?fx=` is a dev override, including killed
and legacy presets. The `V` key reveals the switcher.

---

## Ray field

- **The GLSL and WGSL shaders are mirrored twins** — `src/gpu/webgl2/rayField.frag.glsl` ↔
  `src/gpu/webgpu/rayField.wgsl`. ANY math change lands in **both**, same structure, same
  names.
- All shader distances are in **reference px** (the 1440×800 design frame); the shader divides
  by `u_scale`. Never hardcode screen px.
- Variants are **uniform presets + two integer mode uniforms** (`hoverMode`,
  `compositeMode`) — one shader program, no per-variant shader files. New behaviour = new mode
  branch + preset.
- The canvas composites via CSS `mix-blend-mode: screen` (light-on-black output). Anything
  that must **darken** the backdrop belongs to the eclipse composite mode, not to a blending
  change.
- **The whole light cross slowly rotates** at ~0.6°/s — `signRot` state → `u_signRot` / `p9.w`.
  Wind and parallax stay screen-true on top of it. This is also why a screenshot diff can
  never isolate an interaction here: every frame differs anyway.
- The 4 primary beams strike **BETWEEN the links** — bisector angles derived from link
  positions measured at runtime (upright cross, the window-grille motif). They sway ±8° global
  plus a small per-beam wander; they do **not** track or point at links (superseded).
- Hovering a link triggers the **gallery-dark scene change** (`.hover-scene` + `u_sceneDim`
  light surge). This is the hero interaction; per-beam hover modes are secondary.
- Avoid polar-lattice artifacts: no noise/particle grids keyed on (r, θ) cells.
- **The light has a colour** — `lightR/G/B` on `RayFieldParams`, white in every shipped preset.
  It multiplies **BEFORE** the filmic shoulder, and that placement is the decision: each
  channel tone-maps on its own, so a hot core still blooms to white while the falloff keeps
  the hue. Moving it after the shoulder (or doing it in CSS, which is necessarily after)
  flattens it into a gel laid over a white lamp. Three floats, not a vec3, so `lerpParams` can
  walk `NUMERIC_KEYS`.

### Two silent failure modes

- **A uniform uploaded but not listed in `WebGL2RayFieldRenderer`'s name list is a SILENT
  no-op** — `u()` returns `null` and `gl.uniform*(null, …)` does nothing. No error, no visual
  artefact. Adding a uniform means adding it to that list, and **verifying hover on EVERY
  link**: the first four looking right is exactly what a missed fifth slot looks like.
- **Probing the light needs uniform interception, not pixels.** `drawImage` on the ray canvas
  returns empty (no `preserveDrawingBuffer`), and pixel-diffing screenshots cannot isolate an
  interaction because the light rotates at ~0.6°/s and the slider cycles — every frame differs
  anyway. Intercept `getUniformLocation` to map location → name, then wrap the `uniform*` call
  and read what is actually sent.

---

## Nav geometry (round 11)

**Five links at EXACTLY 72°, and the positions are DERIVED** (`navSpec()` in `layout.ts`) from
one radius (272) and one step. Figma's per-label centres scatter over r = 256…287 because a
longer word has a longer bounding box — transcribing those five radii would bake a text-length
artefact into the layout and drift on any copy change.

Labels are Figma's own: «Музей» · «О «Крестах»» · «Контакты» · «Аренда» · «События»
(«События» = Events, not News). Light convergence and nav are at the EXACT screen centre.

**Nav hover = a doubled label** — a glowing white label plus a translucent FILLED `::after`
copy offset along the glyph axis. NOT a black silhouette, and NOT an outline/text-stroke copy:
round 9.1 killed the stroke as "cheap".

**A 5th link needed no shader change, and the reason is the preset.** «Сияние»/«Слайдер» run
`primaryIntensity: 0` (beams dead) and `slitMix: 1`, and the composite is
`mix(field, slit, slitMix)` — so `field`, with the hover `zone` blaze and the `u_shadow`
wedge, never reaches the screen. The only live link data is the slit light's lean, and both
its sums are reduced **on the CPU** into `hoverDir`/`hoverAmt`. The `vec4` slots stay
four-wide for «Призма» only.

**The wordmark is ONE box sitewide: 251.2×40 at (32, 32)** — `.logo`, `.concept-home`,
`.fx-home`. A descriptor sits under it (Caption Big since round 21) and a «Связаться» button
top-right.

---

## The photo slider and its headlines

`PhotoSlider.ts` is the live file. **The round-10 "headline cycler" was never shipped and its
branch is deleted** — `HeadlineCycler.ts` / `HoverScene.ts` do not exist.

### The one rule everything else serves

**A HEADLINE IS ONLY EVER VISIBLE WHEN ITS PHOTO IS.** This is the client's rule and it is
mechanical: `npm run probe:headline` samples `headline ≤ photo` every frame, where
`headline = parentOpacity × max(word opacity)`.

**It is a PRODUCT and neither factor alone can see anything** — `.out .word` pins the spans at
1 through the melt, and the parent sits at 1 with no `.show`; each read on its own returns a
flat 1.000. The invariant is stated as a *comparison*, not a threshold, because the exit
(block melts in 540 ms, photo in 1100) and the entrance (words rise at 950 ms, photo at 0.97)
are both correct and a threshold flags them. **Three separate paths reached the same symptom
across rounds 11 / 18.3 / 21.**

### What keeps it true

- **`.slider-headline`'s resting state is `opacity: 0`, and `.slider-headline .word` says
  `transition: none`.** The base used to be opacity 1 — invisible only because the spans
  inside were 0 — so anything that stripped `.out` **snapped** the block back on (a transition
  declared inside a class leaves with the class; it does not ease). And **a zero-duration
  transition still honours its delay**: the per-word `transition-delay` is INLINE, so with
  `transition-property: all` and `duration: 0s` Chrome waits out the delay and then snaps —
  the words drained one at a time on the 80 ms stagger. `.out .word`'s
  `transition-delay: 0ms !important` only covers the window where `.out` is applied.
- **`showSlide()` retires the headline only `if (!this.firstThrow)`, and `activate()` plus the
  cleanup timer both `replaceChildren()`.** `.out` on an empty headline is not a no-op: it
  re-freezes stale word spans at `opacity: 1`.
- **`IDLE_MS` is 2000, and two things are coupled to it.** `OUT_MS + 100` (700) is the exit
  cleanup and `IDLE_MS` must stay the longer of the two; and `scripts/headline-probe.mjs`
  waits it out twice, so it mirrors the constant. The probe's guard fails closed (exit 2)
  rather than passing vacuously — but it still has to be told.
- **Do not relax `setHoverBlocked`/`tryActivate`.** The delay is still short enough that the
  round-18.3 activation gate is load-bearing: every hover-out re-arms the countdown. Entering
  a link clears the latch, so the countdown must elapse from scratch and un-blocking can never
  activate by itself. When probing it, dispatch `pointerleave` with **no `pointermove` behind
  it** and sample the `.word` spans, not the block.

### The slide handoff

- **Only the OUTGOING photo animates.** The incoming sits UNDERNEATH at opacity 1 from frame
  one. Do not "improve" this into a two-layer fade: the opaque lower layer is what makes the
  flat blue unreachable *by construction*, and fading both would sum to < 1 at the midpoint
  and flash the backdrop through.
- **`SLIDE_DIP_S = 1.1` must stay ≈ `2 × (FADE_DELAY + FADE_MS/2) / 1000`** — the light's dip
  is a half-sine that has to peak on the cross-fade's midpoint. The two constants live in
  different files (`MainScreen.ts` / `PhotoSlider.ts`) and both say so.
- Dead and not to be rebuilt: the voronoi/`mask-composite` dissolve (rounds 8/8.1) and the
  «Наплыв»/«Створ»/«Сдвиг» trio behind `.tr-switch` (round 8.2). No mask transitions here.

### Copy

**Photo and headline are HARD-BOUND** in `SLIDER_SLIDES` (`layout.ts`) — the photo is the
headline's illustration, not decoration. Do not reorder or re-pair.

**Every headline begins with «Свобода» and that is a creative constraint, not a coincidence**
(`references/texts.txt`): the word is STATIC and only the rest of the line changes. The same
seven topics are unwrapped at length on «О Крестах» under a different h2. One slide still runs
on stand-in photography (marked TODO): slide 2 wants a real culture/events frame.

Russian short words are bound with U+00A0 via `shared/ruTypography.ts` — that is also what
makes the headline rags match Figma. **Split on the PLAIN space only.**

While the slider runs, the nav and the «Связаться» button go **fully transparent** (round 22;
was Figma's 40 %) and return on any input.
