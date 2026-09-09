# Design System — tokens, type, motion, the button

The vocabulary the whole site draws from.

**No raw hex, `font-size`, `line-height` or `font-weight` anywhere in CSS outside
`src/styles/`.** If nothing fits, add a token to `tokens.css` and say why in the commit.
Enforced by `npm run lint:tokens` (also a Stop hook), which fails on **new** raw values and
stays quiet on the pre-token debt recorded in `scripts/token-baseline.json` — re-record with
`lint:tokens:update` only when the count **drops**. `npm run tokens:check` (also in `build`)
catches hand edits to the generated files. `/designcheck` is the full on-demand audit.

---

## The three layers, and the layer is the prefix

**The designer authors in Figma → Token Studio → `tokens/`.** `scripts/build-tokens.mjs`
generates `src/styles/tokens.gen.css` + `tokens.gen.ts`; both are **committed and must not
be hand-edited**. Re-export → `npm run tokens` → read the CSS diff.

```
--ref-*  primitives  →  --color-* / --type-* / --font-*  semantics  →  components
```

**Stylesheets reference the semantic layer only.** `--ref-*`, `--fs-*`, `--lh-*` must not
appear outside `src/styles/`. That is what makes "which blue?" have one answer — before it,
this codebase carried eight.

**`tokens.css` is the hand-written layer and holds ONLY what the set does not name.** Every
entry is an admission of a gap and carries the question it is waiting on: the map's blue-grey
ink ramp, `--accent-intro-heading`, `--field-form`, the scrims, the slider headline's 56/64,
the two motion curves.

**Layout is NOT tokenised, on purpose.** Max-widths, the grid, breakpoints and the 32/40
corner rule are *decisions*: a number alone cannot carry why. They live in code beside their
reasoning (`layout.ts`'s `STAGE_W`/`CENTER_X`, the geometry in `sectionRun.ts`). The rule is
single-sourcing, not centralising for its own sake. Motion durations follow the same rule.

Colour is **consolidated but not re-picked**. Near-duplicate blues (`#36a0ff`, `#44abde`)
are named rather than merged so the duplication stays legible for the designer to settle.

### Silent traps in the token layer

- **Line-heights are UNITLESS RATIOS.** `concept.css` centres the map marks with
  `calc(var(--mark-lh) * 1em - …)`; a px line-height is invalid at computed-value time, the
  whole calc drops, and both entrance marks jump ~5px with no error.
- **Sizes are emitted in px, not rem.** The tokens assume a 16px root; this site's is 21px,
  so rem would render ~31 % oversized. Type that scales with the browser root *inside* a
  fixed 1440×800 stage (nav positions derived from r=272, captions solved from
  `offsetWidth`) is a bug, not accessibility.
- **JS reads `tokens.gen.ts`, never `getComputedStyle`.** Vite injects CSS asynchronously in
  dev, so a module-scope read can return `''` — `MAIN_BG` would silently become empty and
  the seam would break with no error. `tsc` checks the module.
- **`#screen-main`'s field and `MAIN_BG` both derive from the `blue` primitive**, so they
  cannot drift. Seam max Δ **1/255**. Note the *painted* pixel is not the field colour: the
  ray canvas composites with `mix-blend-mode: screen` and `#grain` sits at 7 % overlay, so
  sampling a screenshot is the wrong test. Read the computed `background-color`.
- **The lint's EXEMPT list is where raw values hide** — `tokens.css`, `tokens.gen.css`,
  `fonts.css`, `waterPanel.css`. A raw brand blue sat in `waterPanel.css` unflagged until
  round 22.1.
- **A page whose colour is written from JS needs the JS changed too.** «Контакты»' field
  comes from `ControlPanel` defaults, and `STORE_KEY` must bump when a default moves or
  localStorage outranks it.
- Section fields are `--color-bg-{hotels,food,culture,wellness,offices}`. `?pal=old` shows
  round 19's set for A/B; delete `LEGACY_BG` on sign-off.

---

## Type

**The scale is the designer's six Figma text styles, verbatim:**

| Style | size / leading | weight |
|---|---|---|
| H1 | 54 / 1.1 | Medium 150 |
| H2 | 44 / 1.1 | Medium 150 |
| H3 | 32 / 1.2 | Medium 150 |
| Base Text | 24 / 1.45 | Regular 120 |
| Caption Big | 24 / 1.2 | Regular 120 |
| Caption Small | 16 / 1.2 | Regular 120 |

Do not invent a seventh size; a missing one is a question for the designer. Base and Caption
Big are both 24px and that is not a duplicate — since round 22 they differ **only** in
line-height. The export carries exactly three ratios (1.1 / 1.2 / 1.45).

**A style carries its WEIGHT too**, so moving between two styles is never just a size change.

### The Chromius weight axis is the project's most-repeated bug

**ALS Chromius's `wght` axis is min 50 / default 120 / max 232** — Regular is **120**,
Medium is **150**. A plain `400` or `500` **silently clamps to 232 = Black**. No error, no
warning. It has shipped twice (round 8 upward, round 11 downward).

- Use `--type-*-weight`, or `--font-weight-regular` / `--font-weight-medium`. Never a literal.
- **Never add `font-variation-settings`** to a Chromius rule — it overrides `font-weight`.
- **A form control does NOT inherit weight** through `font-family: inherit`, so `.btn` and
  every input must state theirs or the UA's `normal` clamps to Black.
- `font-weight` is deliberately NOT one token: ALS Hauss's axis is ordinary, where 120 is
  **Thin**, so one shared value would be wrong on one of the two families.

### Editing a text style's weight means editing its REFERENCE

`Caption Big.$value.fontWeight` in `tokens/colors/Mode 1.json` points at
`{fontWeights.als-chromius-0}` — **and so do H1, H2 and H3.** Changing that entry's *value*
from "Medium" to "Regular" looks like the same edit and silently re-weights all three
headings. **The generated diff must be exactly one line**; anything else means the wrong edit.

**`tokens/` is the designer's export, so a hand edit is a fork.** It keeps `tokens:check`
consistent, but the next Figma re-export reverts it unless the text style is changed there
too. Caption Big's weight is currently in that state, which also makes the button diverge
from Figma component 898:336 (it states Medium).

### Fonts

**ALS Chromius VF ONLY** (`public/resources/`, committed). ALS Hauss Next was removed at the
designer's request in round 10 and there is exactly **one `@font-face`** on the site. Rounds
11 and 19 reintroduced `font-family: 'ALS Hauss'` and four visible blocks silently rendered
in system sans for two rounds. `build-tokens.mjs` throws on any other family; `lint:tokens`
bans the string.

---

## Motion (round 22)

**Two curves, in `tokens.css`. Not in the designer's export — engineering defaults, and a
question filed like the scrims.**

```css
--ease-out:  cubic-bezier(0.23, 1, 0.32, 1);   /* responds in place: hover, press, focus */
--ease-move: cubic-bezier(0.3, 0, 0.12, 1);    /* travels: drawer, water panel */
```

`--ease-move` is the project's own rounds 6–7 curve, **named, not re-picked. Do not re-tune
it.** Before round 22 the site authored plain `ease` in **25 interaction rules across nine
durations** — which is measurably why the button read as linear: `ease` is **29.5 % complete
at 20 % of its duration** where `--ease-out` is **68 %**. **Never `ease-in` on an
interaction**; it delays the first moment, which is the moment being watched.

**Durations are deliberately NOT tokenised** — same reasoning as layout. Interaction tier is
240 ms; press feedback is 120 ms.

- **Interaction rules that MOVE something are gated behind
  `@media (hover: hover) and (pointer: fine)`.** A touch device fires `:hover` on tap and has
  nothing to clear it. `global.css` used to declare a `--hover-disabled` flag for this and
  **nothing ever read it**; round 22 deleted it. Press states (`:active`) are deliberately
  UNgated — a touch press should feel pressed.
- **When probing a tap, assert the screen is still up.** The real CTA navigates on click, so
  a naive test reads a hidden element and passes vacuously.
- Reduced motion means gentler, not zero: movement goes, opacity stays. The nav echo keeps
  its 4px offset under reduced motion because **the offset is the effect**.

---

## The button — `src/styles/button.css` (round 21, Figma 898:336)

`.btn` · `.btn--onlight` · `.btn--secondary`; `.btn` alone is main·ondark.

**A class contract, not a TS factory** — `contactForm.ts` builds its submit inside an
`innerHTML` string a factory could not reach. Call sites (`.contact-cta`, `.cf-submit`) carry
**position only**; do not re-declare fill, ink, type or the ledge there.

- **The ledge is the button's OWN colour, never a fixed white.** Figma's three exported SVGs
  stroke `white` on ondark and `#56B7E6` on onlight, so one `--btn-color` drives plate,
  border and ledge; only the ink differs — main inverts, secondary uses `--btn-color` as ink.
- **The ledge cannot be a `box-shadow`**: Figma's line starts 3px down / 8px in and runs 6px
  past the bottom-right, so it does not begin at the plate's corner.
- **No `rem` anywhere** — this root is 21px, so `0.25rem` lands at 5.25.
- **The secondary's border is paid for out of its padding**, or it measures 4px larger than
  main (`box-sizing: border-box` only constrains an explicit width/height; these are
  content-sized). All four variants must measure identically — 171.9×56.8 for «Связаться».
- Press is `scale(1.02)`, not Kowalski's 0.97: that 0.97 is measured from REST and this plate
  is already at 1.07 on hover, so 1.07 × 0.95 is the same proportional dip.
