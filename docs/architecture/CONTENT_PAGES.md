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

**The transition is generic.** `TransitionController`'s `'toConcept'` means "away from main",
not "to concept" — so main↔any page gets the fly-into-the-light and page↔page cuts, which is
right: there is no light to converge when main is not an endpoint.

---

## Layout

Everything horizontal comes from `.page-grid` (see DESIGN_SYSTEM). Nothing in `pages.css` sets
a horizontal position; if a rule there has a left/right value it is a fixed-size composition or
a bug.

**The News card is the grid's own worked example.** A 559px square anchored `.anchor-outer` in
the left column at a 96px margin ends at 655; the headline starts at 720; the 65px between them
is the image not filling its column, and it reproduces the 64 the designer drew. **Do not add a
gutter to recreate it** — that would double it here and open a seam on every other page.

Two measures are deliberately *not* the grid, both typographic:

- **The article's body copy starts before the centre line** (`--article-outdent`). A reading
  measure is not a layout column, and forcing it onto one makes the lines too short at 24px.
- **«Читайте также» is three columns of the full measure.** The frame's cards are 364.67 wide
  and `(1142 − 2×24) / 3` is 364.67 exactly — the designer's arithmetic, not an invention.

Below 1160 the pages stack, and **that takes two declarations**: the template *and* the
placement, or `grid-column: 2` creates an implicit second column.

---

## Open

- **The lead paragraph on «Контакты» and «Аренда» is placeholder.** Both frames carry the same
  «Павильон»/«Остров» string from another project. Marked `TODO(copy)`.
- **One article exists.** `#news/1`; every card routes to it.
- **«Музей» still routes nowhere** — no design yet.
- The news card images stand in for screenshots the frames show; marked in `newsData.ts`.
