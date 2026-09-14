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

Everything horizontal comes from `.page-grid` — **twelve columns since round 25** (see
DESIGN_SYSTEM). `pages.css` sets no horizontal *position*; the one horizontal value it may use
is the grid's own 16px text inset (`.gp-text` / `--grid-text-inset`), because text hangs inside
its column while images sit flush to the column edge.

**The News card is the grid's own worked example, and it got simpler.** `.col-media` is five
columns = 559.333 at the design frame, which is the square's authored width, so the image
**fills** its position at `width: 100%`. The air before the headline is the skipped column 6 —
a real grid position now, not slack to be explained. `.anchor-outer` / `.anchor-inner` are
deleted.

- **The article's body copy is `grid-column: 6 / span 6`** — the frame's x=615→1291 lands on
  columns 6–11 exactly. `--article-outdent` is gone; see DESIGN_SYSTEM for why its 104px was
  the two-column grid measuring its distance from this one.
- **«Читайте также» is three cards inside `.col-full`.** That is cols 2–11 = 1142.667, and the
  designer's own `(1142 − 2×24)/3 = 364.67` falls straight out of it.
- **`RentScreen`'s empty `col-l` spacer is gone** — it existed only to push content right,
  which `.col-main` now names directly.

Below 1160 the pages stack, and **that takes two declarations**: the template *and* the
placement, listing all four role classes plus `.article-body`, or the surviving `grid-column`
creates implicit columns.

---

## Open

- **The lead paragraph on «Контакты» and «Аренда» is placeholder.** Both frames carry the same
  «Павильон»/«Остров» string from another project. Marked `TODO(copy)`.
- **One article exists.** `#news/1`; every card routes to it.
- **«Музей» still routes nowhere** — no design yet.
- The news card images stand in for screenshots the frames show; marked in `newsData.ts`.
