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

## The two sticky columns

**The left column is `position: sticky`, NEVER a rAF transform.** A transform runs on the main
thread while the right column scrolls on the compositor, which is round 16.1's "10 fps, jumps
20px" exactly.

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
