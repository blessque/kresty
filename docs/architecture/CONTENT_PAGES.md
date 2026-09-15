# Content pages — «Новости», «Новость», «Аренда», «Контакты»

Four pages that are the same page with different words (round 24). Everything they share
lives in `src/page/`; everything that differs is a `ContentScreen` subclass and a block in
`src/styles/pages.css`.

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
DESIGN_SYSTEM). `pages.css` sets no horizontal *position*; the one horizontal value it may use
is the grid's own 16px text inset (`.gp-text` / `--grid-text-inset`), because text hangs inside
its column while images sit flush to the column edge.

**The News card is the grid's own worked example, and it got simpler.** `.col-media` is five
columns = 559.333 at the design frame, so the image **fills** its position at `width: 100%`.
The air before the headline is the skipped column 6 — a real grid position, not slack to be
explained. `.anchor-outer` / `.anchor-inner` are deleted.

- **The article's body copy is `.col-main`, columns 7–11 (round 27).** Round 25 had it at
  `6 / span 6` off the frame's x=615→1291, which was a true reading of that frame — but the
  client's note was that this page should follow the longread, and the longread's body is
  `.col-main`. The move also fixes the picture block by construction: `.ms-frame` is one column
  + one gutter wider than its block so the next photo peeks in from the right, and that
  overhang is only free because column 12 is skipped. At `6 / span 6` there was nowhere for it
  to go.
- **The quote breaks OUT to ten columns from inside the five-column body.** It is a child of
  `.article-body` because it arrives in the block list in reading order; lifting it onto the
  page grid would mean splitting the body into fragments around every quote. The bleed is
  `5 × (--grid-col + --grid-gutter)` — which both widens `.col-main` to `.col-full` and is
  exactly the distance from column 7's left edge back to column 2's, so one number does both
  and neither is a literal. It is zeroed below 1160.
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
placement, listing every role class, or the surviving `grid-column` creates implicit columns.

### The body is a block list, not a schema (round 27)

`articleData.ts` carries `ArticleBlock[]` — `p` · `h2` · `h3` · `list` · `quote` · `media` —
the same shape `pageSections.ts` uses, widened. It replaced an object with fifteen named
fields rendered by one hard-coded template, which could describe one article shaped one way: a
picture between the first two paragraphs was not something the data could say. **Order is the
data.** A `media` block with 2+ items renders as a `MediaSlider`, one item renders as a figure,
so two pictures can only stack if something is written between them — `assertArticle()` shouts
in dev if two `media` blocks end up adjacent. `MediaItem` now lives in `page/mediaSlider.ts`
(it was in `pageSections.ts`, which made shared furniture depend on one screen).

### Sticky heading columns

**Only «Контакты» and «Аренда» use this.** Round 27 gave the article a sticky date rail too,
on the grounds that the longread has one — but the longread's rail tracks *which section owns
the frame*, a question that changes as you scroll. A single article never asks it, so the rail
was borrowed motion; round 27.1 moved date · category into the masthead under the H1 (the
`meta` slot on `buildPageHead`), which is where the reader just read them on the news card.
**A pinned column has to be answering something.**

**Round 28 made «Аренда» true.** It had none of this — the line above had claimed it for a
round. All four of its blocks are managed now, the form included.

`page/stickyHeads.ts` pins a heading to the vertical centre of the frame while its body
scrolls — `(viewH − colH) / 2`, clamped to `viewH − colH − padBottom`, written per block as
`--sec-pin`. Mark the block `data-sticky-head` and the column `.sticky-head`; `.sec-col` is
matched too, so one mechanism serves the longread and the content pages.

**THE PIN IS CAPPED BY THE BLOCK'S OWN HEIGHT, not by the page.** Sticky travel cannot leave
the element's grid area, so a short block releases its heading almost at once — «Общая
информация» holds for ~110px of a 400px scroll and «Помещения» for ~350px of 500. That is the
clamp working, and it is why a pinning test must be written against a block with runway.

**Below 1160 the columns STOP sticking (round 28), and that is a third declaration the stack
has always needed** beside the template and the placement. A pinned column is only legible
while there is a column BESIDE it to scroll past; stacked, the thing scrolling past is directly
underneath, so the heading pins on top of it — «Аренда»'s five tab names sat over the
photograph, unreadable. `stickyHeads.ts` had assumed the rule existed since it was written: its
"strip `--sec-pin` from a column that is not actually sticky" branch was dead code until now.

**It was half-present before and that was the bug.** `concept.css` is imported globally, so its
`.sec-col` rule already made the contact form's heading sticky on «Контакты» — at the flat
`14vh` fallback — while the two `.page-h2` columns beside it were not sticky at all. Three
headings of one rank behaving three ways is what the client reported. Note the three ways
`position: sticky` fails **silently**: a stretched grid item has nowhere to travel, an
`overflow: hidden` ancestor clips it, and a transformed ancestor steals its containing block.

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
- **«Музей» still routes nowhere** — no design yet.
- **«Контакты» carries the repo's first third-party embed** — the Yandex Maps iframe widget.
  No API key, no `<script>`, no dependency, but it is a request to Yandex on every view, and
  the pin's coordinates were derived from the address rather than from the object's own card.
