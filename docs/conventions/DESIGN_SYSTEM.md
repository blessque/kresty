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

Colour is **consolidated but not re-picked**. Near-duplicate blues are named rather than
merged so the duplication stays legible for the designer to settle. (`#44abde` is gone —
see the rule below.)

### BLUE MEANS INTERACTIVE (round 25, the client's rule, site-wide)

**Colour follows interactivity, not tag.** A heading that is not a link takes ink
(`--color-text-onlight-main`) on light and white (`--color-text-ondark-main`) on dark. A
heading that **is** a link may be blue — which is why `.news-card__title`, an `<h2>` inside an
`<a>`, keeps its `--color-link` hover, while «12 августа» beside it stays ink and «СМИ о нас»,
a filter link, is blue. The designer's own frame draws exactly that.

This retired `--accent-intro-heading` (`#44abde`), a fourth blue the token file carried with
the note *"no semantic home: it is a heading, so `--color-link` is the wrong role"*. It had no
home because the **colour** was wrong, not because the set lacked a name.

Worth auditing rather than eyeballing, because a linked heading and an unlinked one look
identical in a screenshot: walk `h1,h2,h3` on every route and assert
`colour !== --color-link || el.closest('a')`. Two things it will legitimately report as
non-violations: `.article-related__headline` is a `<p>`, not a heading, and
`.article-quote__mark` is a decorative `aria-hidden` span at H1 *size* — blue, but neither is
a heading.

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

## The page grid (round 25) — `src/styles/grid.css`

**Twelve columns, from the designer's own spec frames** (Figma `1119:62` longread,
`1119:89` news, where the skipped columns are drawn as grey bars).

```
--page-margin:      32px        --grid-gutter: 24px
--page-max:         1376px      --grid-text-inset: 16px
.page-grid  → repeat(12, 1fr), column-gap 24, width min(100% − 64, 1376), centred

.col-aside  2 / span 4    442.667   longread h2
.col-media  2 / span 5    559.333   the square photo
.col-main   7 / span 5    559.333   body copy, both kinds of page
.col-full   2 / -2       1142.667   the full MEASURE — ten columns, not twelve
.gp-text    padding-inline: 16px
```

At 1440: `12 × 92.667 + 11 × 24 = 1376`. Column *n* starts at `32 + (n−1) × 116.667`.
**Columns 1 and 12 are skipped on every frame**, which is why `.col-full` is `2 / -2`.

- **Above the design frame the grid does not grow.** Content caps at 1376 and centres — 272px
  margins at 1920, 592 at 2560, columns always 92.667. Below 1440 the columns narrow.
- **Round 23's rejection of a 12-col grid was right arithmetic on the wrong constant.** It read
  *"559 is 6.8 columns of 82"* — true at a **96px** margin (1248 content). The designer's margin
  is **32**, giving 1376 and a 92.667 column, on which 559.333 is **exactly 5**. Independent
  check: «Читайте также»'s 1142 measure is cols 2–11 to three decimals.
- **The article's reading measure is a column span, not a typographic exception.** The frame's
  x=615→1291 is columns 6–11 (615.333→1291.333). The old `--article-outdent: 104px` was the
  tell — the old right column began at 720, and 720 − 615.333 = 104.667. The hack was measuring
  the gap between a two-column boundary and a twelve-column one.
- **Text is inset 16px; images are not.** Put the inset on the text-bearing element, never on
  the grid item, or an adjacent figure takes it and stops aligning with the column edge.
- **Collapsing to one column takes TWO declarations**, and the reset must now name all four
  role classes *and* `.article-body`. An explicit `grid-column` surviving into a one-column
  grid **creates implicit columns** (measured `348px 539px` at 1024). Miss one class and that
  element alone conjures them — which reads as a partially-applied media query.
- **The narrower aside makes Russian min-content the binding constraint, and hyphenation is
  what pays for it.** The design frame itself is fine; **1366 and below is where it breaks**
  (+21px, rising to +83 at 1180). `hyphens: auto` needs `lang="ru"` (set) or it silently
  no-ops, and it needs `hyphenate-limit-chars: 13 6 4` — **13 is the highest limit that never
  overflows, swept, and the highest is what you want because it hyphenates least.** Round 23's
  `max-width: min(15em, 80%)` clearance hack is deleted; the grid gives 140.667px of clearance
  structurally (a gutter plus the skipped column 6).

**Two measurement traps in that sweep, both of which returned a clean bill of health on
genuinely broken layout:**

- **`scrollWidth − clientWidth` cannot see overflow in centred text.** It hangs out both sides
  and scrollWidth under-reports. Measure the widest line box via `Range.getClientRects()`
  against the content box.
- **The unbreakable unit is an NBSP RUN, not a word.** `bindShortWords` binds short Russian
  words with U+00A0, so the real constraint is «для размышлений» at **407px**, not
  «размышлений» at 317. That also identifies round 23's own 407px figure, which it recorded
  against «экскурсионных» — the word alone is 346. The number was right; the label was not.
  Split on the plain space only.
- **`hyphenate-limit-chars` counts the RUN too**, NBSP included. «в исторических» is 14
  characters, so it breaks at limit 13 even though «исторических» alone is 12 and fits. **To
  spare a particular word, remove the NBSP from that string — the binding is the cause, not the
  limit.** Raising the limit instead re-opens the overflow.

The header, the wordmarks and the main-screen slider keep their own 32px corner rule and are
outside this grid.

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
`innerHTML` string a factory could not reach. Call sites (`.cf-submit`, `.page-partner`) carry
**position only**; do not re-declare fill, ink, type or the ledge there. (Round 25 deleted the
main screen's `.contact-cta`, the component's first adopter; the component itself is unchanged
and still serves the form submit and the page heads.)

- **The ledge is the button's OWN colour, never a fixed white.** Figma's three exported SVGs
  stroke `white` on ondark and `#56B7E6` on onlight, so one `--btn-color` drives plate,
  border and ledge; only the ink differs — main inverts, secondary uses `--btn-color` as ink.
- **The ledge cannot be a `box-shadow`**: Figma's line starts 3px down / 8px in and runs 6px
  past the bottom-right, so it does not begin at the plate's corner.
- **No `rem` anywhere** — this root is 21px, so `0.25rem` lands at 5.25.
- **The secondary's border is paid for out of its padding**, or it measures 4px larger than
  main (`box-sizing: border-box` only constrains an explicit width/height; these are
  content-sized). All four variants must measure identically at a given label.
- Press is `scale(1.02)`, not Kowalski's 0.97: that 0.97 is measured from REST and this plate
  is already at 1.07 on hover, so 1.07 × 0.95 is the same proportional dip.
