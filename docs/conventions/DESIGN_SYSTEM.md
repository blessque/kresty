# Design System — tokens, type, motion, the button

The vocabulary the whole site draws from.

**No raw hex, `font-size`, `line-height` or `font-weight` anywhere in CSS outside
`src/styles/`.** If nothing fits, add a token to `tokens.css` and say why in the commit.
Enforced by `npm run lint:tokens` (also a Stop hook), which fails on **new** raw values and
stays quiet on the pre-token debt recorded in `scripts/token-baseline.json` — re-record with
`lint:tokens:update` only when the count **drops**. `npm run tokens:check` (also in `build`)
catches hand edits to the generated files. `/designcheck` is the full on-demand audit.

Two type-layout probes fail closed and are part of a pass, not optional: **`npm run probe:heads`**
(`scripts/head-sweep.mjs`) sweeps the 72px section openers across eight widths on the **two**
longreads that have them — `.sec-loud` on «О Крестах», `.mus-era` on «Музей» — and exits non-zero
on the first overflow; hyphenation is off, and this is what pays for that. («Новость» left the
sweep in round 29.2: its subheadings are back in the body column at the measure every paragraph
already wraps to, so there is nothing to catch.) **`npm run spec:figma`** reports every box's grid
alignment, which is how round 29's inset removal was verified rather than eyeballed.

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
- **The UA sheet gives `h2` `font-size: 1.5em`, so a type style set on a WRAPPER multiplies.**
  Round 29 put 72px on the band that positioned «Музей»'s era name and it came out at **108px** —
  larger than the site's H1, and plausible enough on screen to read as a design choice rather than
  a bug. Round 29.2 removed the trap at its root rather than routing around it: **the 72px
  treatment is not put on a heading element at all.** `.loud` is only ever a `<p>`, so there is no
  `1.5em` in the chain to multiply and no wrapper/heading pair to get the wrong way round. The
  wider rule this leaves: a **size** set on a container that a heading will inherit through is a
  trap in either direction — set the size on the element that carries the text.
- **Two rules at the same specificity are decided by SOURCE ORDER, and the sheet order here is
  not obvious.** `pages.css` loads before `concept.css` and `museum.css`, so a `font-size` on
  `.sec-loud` or `.mus-era` silently beats `.loud` and puts a 72px opener back at 40 — which is
  why neither restates its type (`.sec-loud` carries **no declarations at all**, deliberately:
  the type is `.loud` and the measure is `.col-full`, both shared with «Музей», and the class
  survives only as the probe's selector and a named hook). The same trap the other way round
  inside ONE sheet: `.article-body h2` and `.article-body > h2` are both (0,1,1) and sit 250
  lines apart in `pages.css`, so source order decides between them and the descendant selector
  loses. Round 29 hit it in both directions — first by leaving an old H3-token rule "harmlessly"
  in place, then by giving `> h2` a bleed — which is why the article's h2 now takes its **size**
  from one rule and nothing else claims it.
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
--page-max:         1376px
.page-grid  → repeat(12, 1fr), column-gap 24, width min(100% − 64, 1376), centred
.page-grid > *  → min-width: 0

.col-aside  2 / span 4    442.667   the icon column; «Аренда»/«Контакты» h2
.col-media  2 / span 5    559.333   the square photo
.col-main   7 / span 5    559.333   body copy, both kinds of page
.col-full   2 / -2       1142.667   the full MEASURE — ten columns, not twelve
```

**There are FOUR role classes, not five.** Round 29 shipped a `.head-wide` at `2 / -2` for the
longread section opener; round 29.2 deleted it as a duplicate of `.col-full`, which already means
"the ten-column measure" and was already named in every placement reset. The opener is
`.col-full` plus `.loud` — one class for where it sits, one for how it is set — and «Музей»'s
narrow breakpoint lost the extra `.mus-head > .head-wide` line it needed as a result. A second
class for an existing position is a second thing to remember to reset.

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
- **ROUND 29 DELETED THE 16px TEXT INSET.** Round 25's rule was *"text is inset 16px, images are
  not"*, put on the text-bearing element rather than the grid item so an adjacent figure would
  not take it. The client's answer is simpler and it is the one that ships: **a column has one
  left edge and everything in it uses that edge.** `--grid-text-inset`, `.gp-text`, all twelve
  `padding-inline` declarations and every `gp-text` in markup are gone. Measured with
  `npm run spec:figma`: 75 inset-bearing boxes → 0, and text nodes landing exactly on a column
  edge rose on every page (news 0→28, contacts 4→25, rent 9→23, article 7→21, concept 22→28).
- **`min-width: 0` on `.page-grid > *` is load-bearing (round 29), not hygiene.** `1fr` is
  `minmax(auto, 1fr)`, so a track floors at its content's min-content and a child with
  `width: 100vw` — the picture strip — contributes 100vw. Without it the twelve "equal" columns
  stop being equal and the page grows a horizontal overflow that reads as a broken grid rather
  than as one overflowing child. It was «Музей»'s local ≤1160 fix; it is one global rule now.
- **Collapsing to one column takes TWO declarations**, and the reset must now name all four
  role classes *and* `.article-body`. An explicit `grid-column` surviving into a one-column
  grid **creates implicit columns** (measured `348px 539px` at 1024). Miss one class and that
  element alone conjures them — which reads as a partially-applied media query.
- **ROUND 29: THERE IS NO `hyphens: auto` LEFT ON THE SITE, and that is a consequence of the
  opener leaving the aside, not a reversal.** Hyphenation was load-bearing while the longread's
  section opener was a FLAT 40px h2 in a four-column aside: the type stopped shrinking below 1440
  while the column kept going, so **1366 and below is where it broke** (+21px, rising to +83 at
  1180), and it needed `lang="ru"` (set, or it silently no-ops) plus
  `hyphenate-limit-chars: 13 6 4` — 13 being the highest limit that never overflows, swept, and
  the highest is what you want because it hyphenates least. The loud changes **both** terms: ten
  columns instead of four, and `--fs-factoid` is fluid again at `clamp(60px, 5vw, 72px)`. At 72px
  a mid-word break is the most visible thing on the page, and `hyphens: auto` breaks to balance
  the rag rather than only to avoid overflow — so it goes, and **`npm run probe:heads` is what
  makes that safe**: it sweeps eight widths over the two routes that carry a loud and exits
  non-zero on the first overflow. Worst measured clearance (negative is clearance): concept
  **−2.8 at 1200**, museum −175 at 1165. **«О Крестах» runs on under 3px**, so a copy edit to any
  `PAGE_SECTIONS.lead` must re-run the probe. Round 23's `max-width: min(15em, 80%)` clearance
  hack is deleted; the grid gives 140.667px of clearance structurally (a gutter plus the skipped
  column 6).

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
  limit.** Raising the limit instead re-opens the overflow. (Kept for the day hyphenation comes
  back; nothing sets it today.)
- **Do NOT estimate an overflow from the clamp** (round 29). Scaling the 1440 line width by the
  ratio of the two clamp values predicts a 28px overflow just above the breakpoint, and there
  isn't one: each heading re-wraps as the measure narrows, so *which* heading is worst changes
  with the width — «О Крестах» switches from «Остановиться…» to «Позаботиться…» at 1180. Only
  rendering knows, which is why `probe:heads` is a script and not a paragraph in the log.

The header, the wordmarks and the main-screen slider keep their own 32px corner rule and are
outside this grid.

## Type

**The scale is the designer's seven Figma text styles, verbatim:**

| Style | size / leading | weight | desktop → mobile |
|---|---|---|---|
| Factoid | 72 / 1.1 | Medium 150 | 72 → 60 |
| H1 | 54 / 1.1 | Medium 150 | 54 → 40 |
| H2 | 40 / 1.1 | Medium 150 | constant |
| H3 | 32 / 1.2 | Medium 150 | 32 → 28 |
| Base Text | 24 / 1.45 | Regular 120 | 24 → 20 |
| Caption Big | 24 / 1.2 | Regular 120 | 24 → 20 |
| Caption Small | 16 / 1.2 | Regular 120 | constant |

Do not invent an eighth size; a missing one is a question for the designer. Base and Caption
Big are both 24px and that is not a duplicate — since round 22 they differ **only** in
line-height. The export carries exactly three ratios (1.1 / 1.2 / 1.45).

**Factoid arrived in round 27 by asking, which is the point.** The article's pull-quote and
«Аренда»'s figures («2500 м²», «9000 чел.») were both being set at H2 because the code had no
larger style — the designer's file had had one all along. Adding it is four lines in `tokens/`
plus one in each of `build-tokens.mjs`'s two maps; the generator then emits
`--type-factoid-*`, the `clamp(60px, 5vw, 72px)` curve **and** the fixed-stage override under
`#screen-main` without being told to. If a style seems to be missing, that is the procedure —
not a one-off `font-size` at the call site.

### Factoid is THE LOUD — a treatment, not a heading level (round 29.2)

**`.loud` is the big opening statement of a section on the two longreads**: Factoid, 72/110%,
weight 150, at the ten-column measure. Frame `1253:701` settles the size arithmetically — the
hotel opener is drawn 237px tall, which is `3 × 72 × 1.1` and can be nothing else. Two classes,
one job each: **`.loud` is the type, `.col-full` is the position.** It is `<p class="sec-loud
loud col-full">` on «О Крестах», `<div class="col-full"><p class="mus-era loud">` on «Музей»
(the years sit under it and are not 72px), and the shared `ContactForm` emits the first form
when `wideHead` is true.

**It is never a heading element, and round 29's first pass got that wrong.** It shipped the
openers as `<h2 class="sec-h2 head-wide">`, which conflated a visual treatment with a semantic
level: the site's H2 then meant 72px on the longreads and 40px on the flat pages. The client's
correction — *"these big texts are no longer H2 … H2 remain H2 style (40 px)"* — is the rule
now. **H2 is 40px on every page**, `.page-h2` and `.article-body h2` alike; the size a block is
set at says nothing about its rank. (Two `<h2>`s predating round 29 still sit at 32 — see
**Open** at the foot of this file.)

The content decides the tag, not the size. «О Крестах»'s openers are propositions —
«Остановиться в роскошном отеле в исторических зданиях-крестах» is a sentence beginning with a
verb — so a `<p>` is plainly right. «Музей»'s era names («Экономическая свобода», «Забвение»)
genuinely *are* titles and were the close call; they are still `<p>`, because one H2 cannot mean
two sizes and the treatment is exactly what the two longreads share.

**NAMED `loud`, NOT `lead`.** Three things on this site already answer to "lead" and none of them
is this: `--fs-lead` is **32px** (H3's size primitive), `.page-lead` is the masthead's **24px**
paragraph, and `ContactForm.lead` is a sentence of body copy. A fourth meaning would be the same
conflation one level down. (The *data* field on `PageSection` is called `lead` — that is the
content's role in its section, where the class is the treatment. `PageSection.h2` was renamed in
round 29.2 precisely because calling the field `h2` is what led to it being emitted as one.)

The flat pages have no loud at all. «Аренда» and «Контакты» open their sections with `.page-h2`
at 40 in `.col-aside`: those sections are short, and a 72px opener over three lines of prose is a
title looking for a page.

**A style carries its WEIGHT too**, so moving between two styles is never just a size change.

**One star bullet size sitewide: 12px** (`src/assets/star-bullet.svg` as a `::before` mask,
never a marker and never a `clip-path` — the outline is four quadratic curves and straight edges
between their points read as a notched diamond). «Музей»'s 24px amber mark was the only second
opinion and round 29 removed it, deleting `--color-mark-star` with it. Note the museum's colour
is `var(--mus-chrome, …)` and not a literal white: that page descends to a `#ffffff` field, so
a hard-coded white bullet disappears on the last era.

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

---

## Open

**THE ELEMENT MATCHES THE STYLE, ON EVERY ROUTE (29.3).** Walking every route and listing each
heading element against its computed size is the only way to see a mismatch, because an `<h2>`
at H3's size looks like a deliberately smaller heading in a screenshot:

```
route      elements
main       —
#concept   h1.page-title 54 · p.sec-loud.loud.col-full 72
#museum    h1.page-title 54 · p.mus-era.loud 72 · h3.mus-h3 32
#news      h1.page-title 54 · h3.news-card__title 32
#news/1    h1.page-title 54 · h2 40 · h3 32 · h3.article-related__title 32
#rent      h1.page-title 54 · h2.page-h2 40
#contacts  h1.page-title 54 · h2.page-h2 40
drawer     h3.bld-name 32 (the map's building drawer, «О Крестах»)
```

The rule it asserts: **h1 = 54, h2 = 40, h3 = 32, the 72px opener is `p.loud`** — no element
at a size that belongs to another rank. Three `<h2>`s drawn at H3 (`.news-card__title`,
`.article-related__title`, `.bld-name`) were fixed by changing the ELEMENT to `<h3>`, not the
size, so the designer's frames are untouched. The article's `h3` went the other way: it wore
Caption Big (24) while «Музей»'s `h3` in the same role is 32, so it moved to `--type-h3-*` —
the one visible change. Known and accepted: «Новости» now goes h1 → h3 with no h2 between
(the card titles are list items, not sections); that is an outline skip, not a WCAG failure.

Re-run the walk after any heading change; it is the same audit the blue-means-interactive rule
needs (`colour !== --color-link || el.closest('a')`), so do both in one pass.
