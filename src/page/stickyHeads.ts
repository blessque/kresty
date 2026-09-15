/**
 * A heading column that holds the vertical centre of the frame while its body
 * scrolls past (round 27).
 *
 * «О Крестах» has done this since round 25; the content pages had half of it by
 * accident. `concept.css` is imported globally, so its `.sec-col` rule was
 * already making the contact form's heading sticky on «Контакты» and «Аренда» —
 * but pinned at the flat `14vh` fallback, while the two `.page-h2` columns on
 * the same page were not sticky at all. Three headings of one rank, three
 * different behaviours. That is what the client reported, and no amount of
 * restyling the headings would have fixed it.
 *
 * THE PIN IS PER BLOCK, NOT ONE `vh` FOR THE PAGE. The inset that centres a
 * column is `(viewH − colH) / 2`, and `colH` changes with every heading: one
 * line of Russian against three is 80px of swing, so a single `vh` centres
 * exactly one block and leaves the rest slightly wrong in both directions.
 *
 * THE CLAMP IS NOT DECORATION. `viewH − colH − padBottom` stops a tall column in
 * a short viewport from being pinned below the point where its own block ends,
 * which would leave the heading floating over the NEXT block. Centring pushes
 * the pin down, the clamp caps it, and the cap wins.
 *
 * Three ways `position: sticky` fails SILENTLY — no error, no warning, the
 * element simply scrolls away. All three are guarded, and all three have cost
 * this project real time before (see sectionRun.ts):
 *
 *   1. a sticky GRID ITEM under the default `align-items: stretch` is as tall as
 *      its row, so it has nowhere to travel → the column needs `align-self:
 *      start`, which `page.css` gives it;
 *   2. any ancestor between it and the scrollport with `overflow: hidden` clips
 *      it → `.page-block` and `.page-grid` must stay `overflow: visible`;
 *   3. a transformed / filtered / `will-change` ancestor steals its containing
 *      block → nothing above a heading column may carry one.
 *
 * Measure AFTER `document.fonts.ready`. Chromius is a webfont; a column measured
 * against the fallback reports a different height, and the pin is then wrong by
 * however much the two faces disagree — which looks like a tuning problem rather
 * than a timing one.
 */

/** the head column inside a managed block — either spelling, one mechanism */
const HEAD = '.sticky-head, .sec-col';

export class StickyHeads {
  constructor(private scroller: HTMLElement) {}

  /**
   * Re-pin every managed block. Cheap and synchronous: it runs on resize and
   * once on `fonts.ready`, never per frame — the column travels on the
   * compositor, which is the whole reason this is `sticky` and not a transform
   * driven from a rAF loop.
   */
  measure(viewH: number) {
    if (!viewH) return;
    const blocks = this.scroller.querySelectorAll<HTMLElement>('[data-sticky-head]');
    for (const block of blocks) {
      const col = block.querySelector<HTMLElement>(HEAD);
      if (!col) continue;
      // A column that is not actually sticky (below the stacking breakpoint the
      // pages collapse to one column) must not carry a stale inset.
      if (getComputedStyle(col).position !== 'sticky') {
        block.style.removeProperty('--sec-pin');
        continue;
      }
      const colH = col.offsetHeight;
      const padBottom = parseFloat(getComputedStyle(block).paddingBottom) || 0;
      const centred = (viewH - colH) / 2;
      const ceiling = viewH - colH - padBottom;
      block.style.setProperty('--sec-pin', `${Math.max(0, Math.min(centred, ceiling))}px`);
    }
  }
}
