# Content pages — «Новости», «Новость», «Аренда», «Контакты», «Музей»

Four pages that are the same page with different words (round 24), plus one that is not
(round 28). Everything they share lives in `src/page/`; everything that differs is a
`ContentScreen` subclass and a block in `src/styles/pages.css`.

**«Музей» is the page that stretched the shell** — it has a rAF, a GPU canvas and a four-stop
colour run ending on white, where the other four are flat and static. It still extends
`ContentScreen`, and what it needed from `src/page/` was four small widenings rather than a
second shell: `ContentScreen.remeasure()`, `pageHead`'s multi-paragraph lead and `cta`/`dark`
overrides, and `PageBackground.blend`/`toIndex`. (The dawn it needs skipping is round 27's
`MainHandoff.setFrom()`, which derives it from luminance — no flag.) Read `docs/architecture/MUSEUM.md` before touching
any of them — each one has a page depending on the reason it exists.

---

## The shell — `src/page/`

| module | what it owns |
|---|---|
| `PageShell.ts` | the scroller, the colour track, the wordmark, the handoff, `start`/`stop` |
| `ContentScreen.ts` | the abstract page: implements the router's `Screen` contract, builds lazily |
| `pageBackground.ts` | the colour as a pure function of `scrollTop` over `ColorStop[]` |
| `mainHandoff.ts` | the interior-line fire, `bgPure`, `history.back()` |
| `contactForm.ts` | the form, its copy parameterised |
| `homeLink.ts` | the wordmark — one box sitewide, 251.2 × 40 at (32, 32) |
| `seamColors.ts` | `MAIN_BG` and `DAWN_MID` |
| `pageHead.ts` | title + lead + the «Стать партнером» button |

**These were MOVED out of `screens/concept/`, not rewritten.** Their comments carry reasoning
that cost whole rounds; read them before changing anything in them.

### Writing a new page

```ts
export class ThingScreen extends ContentScreen {
  constructor(el: HTMLElement) { super(el, 'thing-page'); }
  protected stops() { return [{ top: 0, color: T.bgLightMain }]; }
  protected build() { this.shell.add(someSection); }
}
```

Then one entry in `main.ts`'s registry, one in `router.ts`'s `HASHES`, one `<div class="screen">`
in `index.html`. **Do not append the handoff's own stops** — `PageShell` adds them, because the
seam only works if the page's last colour is exactly `MAIN_BG` and leaving that to each page
would be four chances to forget.

### The one structural rule

**The chrome is a SIBLING of the scroller, never a child.** A scroll container's
absolutely-positioned children scroll with its content, so a home link inside it slides off the
top on the first wheel event. `PageShell` enforces this by owning both.

---

## The seam

All four pages scroll into the main screen's light, as the designer's frames show. It works
because `PageShell.update()` applies the colour **before** the handoff checks its line, in the
same task — reversed, a hard flick paints one frame of the intermediate colour, which is the
only way this seam can flash. `mainHandoff.ts` states the contract at length.

`SEAM_HASH` is per-route (`#main-from-<route>`), so scrolling off «Аренда» and pressing Back
returns to «Аренда». Verified on all four.

**The dawn is conditional on the colour the zone is leaving (round 27).** `DAWN_MID`
(`#2b4a7a`) exists to bridge «О Крестах»'s ~7 % lightness contact form to a 62 % brand blue —
travel no single band can cross without turning to mush. The four content pages end **white**,
and there the same mid-tone is a dip *down* into a dark blue on the way to a lighter colour;
the client reported exactly that. So `MainHandoff.setFrom()` measures the incoming colour's
relative luminance and drops the dawn above 0.2 — the two real inputs are 0.006 and 1.0, so it
is a classifier with a canyon down the middle, not a dial. One stop fewer needs less room:

| | dark page | light page |
|---|---|---|
| `HANDOFF_VH` | 3.5 | 3.0 |
| stops | 0.6 → `DAWN_MID`, 1.4 → `MAIN_BG` | 0.8 → `MAIN_BG` |
| `FIRE_VH` | 2.0 | 1.5 |

The band is ±0.3 (`BAND_VH / 2`), so a light page is pure blue from 1.1 and the line at 1.5
gets a 0.4 settle. `?ho=` / `?fire=` override both. **`PageShell` passes the page's last stop
colour**; `conceptPage.ts` passes `FORM_BG` explicitly rather than relying on the dark default.

**THE FIRE LINE MUST BE REACHABLE, and that is arithmetic, not taste.** The zone is
`HANDOFF_VH` viewports tall and the last one is the window itself, so the furthest `scrollTop`
anyone can reach is `top + (HANDOFF_VH − 1.0) · viewH`. The line must sit below that with
clearance — which is all the dark path's "0.5 bounce" has ever meant: `3.5 − 1.0 − 2.0 = 0.5`.

Round 27 first shipped the light path at 2.4/1.7, putting the line **0.3 viewports past the end
of the scroll**: the colour still ramped to blue and the swap never fired, so every content
page dead-ended on a flat blue screen that ignored scrolling. `MIN_TAIL_VH = 1.5` now clamps
`fireVh` for defaults *and* `?fire=` alike, with a dev-time error.

**A colour check cannot catch this** — the ramp was perfect. Only scrolling to the real bottom
and asserting the route swapped does, which is why that round-trip is now part of the pass.

**The transition is generic.** `TransitionController`'s `'toConcept'` means "away from main",
not "to concept" — so main↔any page gets the fly-into-the-light and page↔page cuts, which is
right: there is no light to converge when main is not an endpoint.

---

## Layout

Everything horizontal comes from `.page-grid` — **twelve columns since round 25** (see
DESIGN_SYSTEM). `pages.css` sets no horizontal *position* at all.

**ROUND 29 DELETED THE 16px TEXT INSET SITEWIDE** — `--grid-text-inset`, the `.gp-text` utility,
all twelve `padding-inline` declarations and every `gp-text` in markup. Text and images now both
sit on the column edge: **one alignment per column, not two.** Measured with
`npm run spec:figma` — 75 inset-bearing boxes → 0, and the count of text nodes landing exactly
on a column edge rose on every page (news 0→28, contacts 4→25, rent 9→23, article 7→21, concept
22→28). If you are porting a rule that used it, drop the padding; do not re-introduce the token
under a new name.

**The News card is the grid's own worked example, and it got simpler.** `.col-media` is five
columns = 559.333 at the design frame, so the image **fills** its position at `width: 100%`.
The air before the headline is the skipped column 6 — a real grid position, not slack to be
explained. `.anchor-outer` / `.anchor-inner` are deleted.

- **The article's body copy is `.col-main`, columns 7–11 (round 27).** Round 25 had it at
  `6 / span 6` off the frame's x=615→1291, which was a true reading of that frame — but the
  client's note was that this page should follow the longread, and the longread's body is
  `.col-main`. (Round 27's reason — that `.ms-frame` overhangs by one column and the overhang is
  only free because column 12 is skipped — is superseded: round 29's strip is a full `100vw`
  and walks back to the viewport edge from column 7. The move is still right for the reason the
  client gave.)
- **The quote breaks OUT to ten columns from inside the five-column body, and round 29's
  section headings break out the same way.** Both are children of `.article-body` because they
  arrive in the block list in reading order; lifting them onto the page grid would mean
  splitting the body into fragments around every one. The bleed is
  `5 × (--grid-col + --grid-gutter)` — which both widens `.col-main` to `.col-full` and is
  exactly the distance from column 7's left edge back to column 2's, so one number does both
  and neither is a literal. It is zeroed below 1160. **They share a measure and the Factoid
  type; they do NOT share the quote mark** — one of them is a quotation and the other is a
  heading.
- **«Читайте также» is three cards inside `.col-full`.** That is cols 2–11 = 1142.667, and the
  designer's own `(1142 − 2×24)/3 = 364.67` falls straight out of it.
- **`RentScreen`'s empty `col-l` spacer is gone** — it existed only to push content right,
  which `.col-main` now names directly.
- **«Аренда»'s five spaces are a segmented control (round 28).** A vertical `role="tablist"` in
  the sticky heading column under an H2 «Помещения»; `.col-main` holds all five panels with
  four `hidden`. The label is a `<span>` inside a FULL-WIDTH BLOCK button, which is what lets
  the underline hug the word while the column's own `text-align: var(--sec-col-align, center)`
  still decides where the word sits — an inline-block button would need a second centring rule
  that could then disagree with the H2 above it. `text-align: inherit` is required with it: the
  UA sheet centres button contents outright and would ignore the escape hatch. Tabs are
  tertiary at rest, ink + underline when chosen. **`select()` ends with `shell.measure()`** —
  the panels are different heights, so a switch moves every colour stop below it and the
  handoff's `offsetTop`; `NewsScreen.applyFilter` ends the same way for the same reason.
  A hidden panel is `display: none`, so its `loading="lazy"` photograph never fetches until
  first shown — one `pointerenter` warms it.

### The flow column — `.page-flow`

`.contacts-body` renamed (round 28): it was already a generic "this column flows" rule wearing
one page's name, and «Аренда» needed three. The selectors are type-generic (`img`, `.btn`)
rather than naming `.rent-photo` / `.rent-cta`, because a shared rule that lists one page's
classes is not shared. `margin-block: 0` is stated once on the column instead of by every
child, and **nothing inside may declare a block margin — `margin: 0` included**: those are
(0,1,0) and so is `.rent-stats`, so only source order decides. The rules therefore sit at the
END of `pages.css`'s component rules.

Below 1160 the pages stack, and **that takes two declarations**: the template *and* the
placement, listing every role class — round 29 adds `.mus-head > .head-wide` to that list — or
the surviving `grid-column` creates implicit columns.

**`min-width: 0` on `.page-grid > *` is LOAD-BEARING and global as of round 29.** `1fr` is
`minmax(auto, 1fr)`, so a track floors at its content's min-content and a child with
`width: 100vw` contributes 100vw: without it the `.col-main` track floors at the whole viewport,
the twelve "equal" columns stop being equal, and the page grows a horizontal overflow that reads
as a broken grid rather than as one overflowing child. «Музей» already carried this as a local
`≤1160` fix; it is one rule now. The cost is that a long unbreakable word overflows its column
instead of widening it, which `npm run probe:heads` and the 1160 breakpoint already watch.

### The body is a block list, not a schema (round 27)

`articleData.ts` carries `ArticleBlock[]` — `p` · `h2` · `h3` · `list` · `quote` · `media` —
the same shape `pageSections.ts` uses, widened. It replaced an object with fifteen named
fields rendered by one hard-coded template, which could describe one article shaped one way: a
picture between the first two paragraphs was not something the data could say. **Order is the
data.** A `media` block with 2+ items renders as a `MediaSlider`, one item renders as a figure,
so two pictures can only stack if something is written between them — `assertArticle()` shouts
in dev if two `media` blocks end up adjacent. `MediaItem` now lives in `page/mediaSlider.ts`
(it was in `pageSections.ts`, which made shared furniture depend on one screen).

### The picture slider is scroll-panned and 100vw (round 29) — `page/mediaSlider.ts`

No arrows, no active index. `buildControls()`, `go()`, `.ms-controls`, `.ms-btn` and every
per-page chevron colour (including `#screen-museum .ms-btn`) are deleted, and so is the
`opacity: .38` / `.is-active` dimming — there is no active slide to be the exception.

**The bleed is measured back from column 7, not from `50%`.** `.ms--slider` is `width: 100vw`
with `margin-left: calc(-1 * var(--ms-bleed))`, where

```css
--ms-bleed: calc((100vw - var(--grid-content)) / 2 + 6 * (var(--grid-col) + var(--grid-gutter)));
```

**TRAP: the full-bleed snippet everyone reaches for, `margin-left: calc(50% - 50vw)`, is wrong
here and wrong in a way that looks like a bug in the grid.** It centres the 100vw box on its
CONTAINER, which is the viewport's centre only if the container is itself centred. This block
lives in `.col-main`, whose centre at 1440 is **1011.67 against the viewport's 720** — the strip
came out 292px right of the page and ran 292px off the other edge. Below the grid's collapse
there is no column 7 to walk back from, so the override drops the six units: at
`max-width: 1160px` in page.css, and again at `max-height: 720px` in concept.css because
«О Крестах» is the only page that also collapses on height.

**The pan is `animation-timeline: view()`, and script publishes ONE number.** A rAF scroll
handler here is bit-for-bit round 16.1's reported defect — main thread racing the compositor,
10 fps and 20px jumps. `MediaSlider` writes `--ms-travel`; the `ms-pan` keyframe translates by
it along the frame's own view progress. Verified: at cover 0/25/50/75/100 % the transform is
0 / −300 / −599 / −899 / −1198, and the last slide lands flush on the viewport's right edge.

**`.ms-strip` is `justify-content: safe center`, and the reason is measured.** Of the nine
picture sets across the three longreads, **five are two-photo sets** that measure ~1254px at
410px tall and fit inside 1440 — their travel is 0 and they must simply sit centred. Plain
`center` would centre the overflowing ones too, pushing half the excess off the LEFT edge behind
`overflow: clip`, so the first photograph would be unreachable at rest. `safe` falls back to
`flex-start` exactly at the overflow boundary, which is the decision made from the content
rather than from a flag. Measured travels: 0, 0, 445, 1198, 0.

**Slides are `height: var(--ms-h); width: auto`** — definite height, width derived from the
intrinsic ratio. That is a *stronger* guard against round 27's 0×0 lazy-image desync than the
fixed box it replaces, not a weaker one. `.ms-frame` keeps `overflow: clip` (it bounds the
scrollable overflow, where `overflow-x: hidden` leaves `scrollLeft` movable) and drops the
one-column peek.

**The fallbacks are CORRECTNESS, not polish.** Both `@supports not (animation-timeline: view())`
and `@media (prefers-reduced-motion: reduce)` turn `.ms-frame` into a real `overflow-x: auto`
snap container. Without them the three overflowing sets hide every slide past the first behind
`overflow: clip` with no way to reach them. The two rule lists are identical and adjacent on
purpose: change both or neither.

### ROUND 29: NOTHING PINS, AND SECTION HEADINGS ARE A BAND

**`page/stickyHeads.ts` is DELETED**, with `.sticky-head` / `[data-sticky-head]` in page.css,
all its wiring in `ContactsPage.ts`, and `PageShell.onMeasure` — which had no subscriber left
once the last one went, and an API nothing calls is a claim that one exists. Round 28's whole
apparatus (pin a heading at `(viewH − colH)/2`, clamp to `viewH − colH − padBottom`, write
`--sec-pin` per block) is gone with it. Keep round 27's finding about *why* a rail must answer
something — the article's borrowed date rail was deleted on exactly that reasoning — and note
that the same argument now retires the rest: a heading that scrolls away hands over by itself.

**On the three LONGREADS — «О Крестах», «Музей», «Новость» — a section heading is a
full-width FACTOID band.** `.head-wide` in `pages.css` is `grid-column: 2 / -2`, the ten-column
measure (148.656 → 1291.33, i.e. 1142.672 wide at 1440), with the `--type-factoid-*` triple:
72/110%, weight 150. Frame `1253:701` settles the size arithmetically — the hotel heading is
drawn 237px tall, which is `3 × 72 × 1.1` and cannot be any other number.

**THE TYPE SELECTOR IS `h2.head-wide, .head-wide > h2, .article-body > h2` — on the HEADING,
never on the wrapper.** Three selectors because the band *is* the heading on «О Крестах» and
*wraps* it on «Музей», where the era name is followed by its years and only one of the two is
72px. Putting `font-size` on the wrapper is a live trap and cost this round a measurement: the
UA sheet gives `h2` `font-size: 1.5em`, so a 72px band rendered «Музей»'s era name at **108px** —
bigger than the site's H1, and plausible enough on screen to read as a design choice.

**The flat pages do NOT get the band.** «Аренда» and «Контакты» keep `.page-h2` at 40px in
`.col-aside`, now **left-aligned at the top of its section** rather than pinned to the frame's
centre. Their sections are short, and a 72px heading over three lines of prose is a title
looking for a page.

**`ContactForm` therefore takes a `wideHead?: boolean`** — `true` on «О Крестах» (the default),
`false` on «Аренда» and «Контакты». It is deliberately NOT derived from the existing `icon`
flag even though the two agree on all three call sites today: one says "this form is a longread
section", the other says "this form has a mark beside it", and collapsing them is how the next
page that wants one without the other becomes a puzzle.

**`.article-body h2` at H3 tokens (32px) is deleted, and the specificity was the trap.** That
rule and the band's are BOTH (0,1,1), so source order decides — leaving the old one "harmlessly
in place" would have silently kept the article at 32px while the other two longreads went to 72.

**What round 28 built here, and what is left of it.** «Аренда» was the one content page round
27's pass never reached, so round 28 gave all four of its blocks a pinned heading through
`page/stickyHeads.ts` — `(viewH − colH) / 2`, clamped to `viewH − colH − padBottom`, written
per block as `--sec-pin`. Round 29 removed the pinning from every HEADING. Two findings from
that round outlive the mechanism and are worth keeping:

- **Sticky travel is capped by the BLOCK's own height, not the page's.** A short block releases
  its heading almost at once — «Общая информация» held for ~110px of a 400px scroll. Any test
  of pinning has to be written against a block with runway, or it passes on nothing happening.
- **A pinned column is only legible while there is a column BESIDE it to scroll past.** Stacked
  below 1160 the thing scrolling past is directly underneath, so the heading pins on top of it;
  «Аренда»'s five tab names sat over the photograph. Anything that pins again needs the
  un-stick as a third declaration beside the template and the placement reset.

---

## Open

- **The lead paragraph on «Контакты» is placeholder** — the «Павильон»/«Остров» string from
  another project, marked `TODO(copy)`. «Аренда» got real copy in round 28, but it is WRITTEN
  rather than supplied: the lead, the five space descriptions and their figures are ours. The
  figures at least close against the designer's own — the four enclosed spaces sum to 2500 м²
  and the smallest unit quoted is 13 м². It wants a copy pass, like the news headlines.
- **One article exists.** `#news/1`; **thirteen** cards route to it. Round 27 filled the
  categories (a tab that filtered to nothing is not a tab) but the article behind them is
  still the single one.
- **Ten of the thirteen headlines are written, not the designer's.** The three from frame
  `854:251` are verbatim; the rest fill the two thin categories and the empty one, in the same
  register, and want a copy pass.
- **«Музей»'s two closing renders are low-res.** The temple square came off the frame at
  3000×2000 and is fine; the winter street is only 1280×859 and exists nowhere else in the
  project. Ask the designer for the source. → `museumSections.ts`
- **«Контакты» carries the repo's first third-party embed** — the Yandex Maps iframe widget.
  No API key, no `<script>`, no dependency, but it is a request to Yandex on every view, and
  the pin's coordinates were derived from the address rather than from the object's own card.
