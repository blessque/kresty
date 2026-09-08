import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
import { PAGE_SECTIONS, sectionBg, type PageSection } from './pageSections';
import { PageLight } from './pageLight';
import type { ColorStop } from './pageBackground';

/**
 * The five editorial sections below the map: a pinned left column carrying the
 * lit icon and the h2, and a right column of copy and images that scrolls
 * normally.
 *
 * THE LEFT COLUMN IS `position: sticky`, NEVER A JS TRANSFORM.
 * A transform driven from the rAF loop runs on the MAIN thread while the right
 * column scrolls on the COMPOSITOR — which is bit-for-bit the shape of round
 * 16.1's reported defect ("lags, jumps ~20 px, like 10 fps"). The lesson from
 * that round is not "make the shader cheaper", it is "nothing that must track
 * the scroll goes on the main thread". Sticky is compositor-resolved in WebKit,
 * Blink and Gecko, which is also what makes this hold up in Safari.
 *
 * Three ways sticky breaks SILENTLY, all of them guarded in concept.css:
 *   1. as a flex item with the default `align-items: stretch` it is full-height
 *      and has nowhere to travel → the grid uses `align-self: start`;
 *   2. any ancestor between it and the scrollport with `overflow: hidden` clips
 *      it → the section and the grid stay `overflow: visible`;
 *   3. a transformed / filtered / `will-change` ancestor steals its containing
 *      block → nothing above `.sec-col` may carry `will-change`.
 *
 * No second scrollport is created: these are siblings appended after
 * `.map-stage` inside the existing `.concept-scroll`, exactly as round 16 did.
 * Round 16 measured that siblings after the stage do not change the stage's
 * percentage height (it resolves against the content box, not `scrollHeight`),
 * so the camera's `overscan` invariant survives untouched.
 */

/**
 * White breathing room between the map and the first section, as a fraction of
 * the viewport.
 *
 * MEASURED, not chosen for looks (round 16, and both clauses still hold here).
 * Three things have to happen in order — the map leaves, white is actually
 * seen, then the colour turns — and the gap is what buys room for the middle
 * one. The map's canvas is OPAQUE and covers its whole stage, so any crossfade
 * that starts while the map is still on screen happens behind it and is simply
 * lost; the reader would then meet an already-coloured page the instant the map
 * clears.
 *
 * With the blend band centred on the first section's top, the fade begins at
 * `top0 − viewH·(0.5 + BAND_VH/2)`. Requiring that to fall after the map has
 * gone gives `gap > 0.5 + BAND_VH/2` = 0.8 viewports. The light-clearance
 * clause is now `P₀ ≥ 0.2·viewH`, which the section's top padding satisfies
 * with room to spare — so the same number still serves both, with more margin
 * than it had.
 */
const GAP_VH = 0.8;

export interface SectionGeom {
  /** section top within the scroller */
  top: number;
  height: number;
  /** sticky inset A: where the column pins, px from the viewport top */
  pin: number;
  /** P: section top → icon centre, px */
  toIcon: number;
  /** H: the sticky column's own height, px */
  colH: number;
  /** B: the section's bottom padding, px */
  padBottom: number;
  /** C: the icon centre's offset inside the column, px */
  iconInCol: number;
  /** the icon's centre x within the scroller, px — measured, not authored */
  iconX: number;
  /** the icon box's rendered size, px — responsive, so the light follows it */
  iconPx: number;
  /** false below the sticky breakpoint: the column flows and never pins */
  sticky: boolean;
}

export class SectionRun {
  readonly light = new PageLight(PAGE_SECTIONS.map((s) => s.icon));

  private sections: HTMLElement[] = [];
  private gap = document.createElement('div');
  private geom: SectionGeom[] = [];

  constructor(scroller: HTMLElement) {
    this.gap.className = 'page-gap';
    this.gap.style.setProperty('--gap-vh', String(GAP_VH));
    scroller.appendChild(this.gap);

    for (const s of PAGE_SECTIONS) {
      const el = this.build(s);
      this.sections.push(el);
      scroller.appendChild(el);
    }
  }

  private build(s: PageSection): HTMLElement {
    const el = document.createElement('section');
    el.className = 'sec';
    el.dataset.section = s.id;

    const paras = s.paras
      .map((p) => `<p>${escapeHtml(bindShortWords(p))}</p>`)
      .join('');
    // aspect-ratio is authored from the known 3:2 crop so the height is
    // committed BEFORE decode. Without it a late image resolves its height and
    // shifts every section below it, desyncing the measured track mid-scroll —
    // round 16 never hit this because it had no images.
    const figure = s.image
      ? `<figure class="sec-figure">` +
        `<img src="${asset(encodeURI(s.image))}" alt="${escapeHtml(s.imageAlt ?? '')}"` +
        ` loading="lazy" decoding="async" width="1200" height="800">` +
        `</figure>`
      : '';

    el.innerHTML =
      `<div class="sec-grid">` +
      `<div class="sec-col">` +
      `<div class="sec-icon" aria-hidden="true"></div>` +
      `<h2 class="sec-h2">${escapeHtml(bindShortWords(s.h2))}</h2>` +
      `</div>` +
      `<div class="sec-body">${paras}${figure}</div>` +
      `</div>`;
    return el;
  }

  /** re-measure section geometry; call on resize, on font swap and on image load */
  measure(viewH: number) {
    this.geom = this.sections.map((el) => {
      const col = el.querySelector('.sec-col') as HTMLElement;
      const icon = el.querySelector('.sec-icon') as HTMLElement;
      const cs = getComputedStyle(col);
      // `position: static` below the sticky breakpoint — the column flows, so
      // there is no pin and the station invariant does not apply
      const isSticky = cs.position === 'sticky';
      const pin = isSticky ? parseFloat(cs.top) || 0 : 0;
      const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      // offsetTop chains are relative to the offsetParent; take the difference
      // of rects instead so nesting cannot silently change the meaning
      const er = el.getBoundingClientRect();
      const ir = icon.getBoundingClientRect();
      const cr = col.getBoundingClientRect();
      return {
        top: el.offsetTop,
        height: el.offsetHeight,
        pin,
        toIcon: ir.top + ir.height / 2 - er.top,
        colH: col.offsetHeight,
        padBottom,
        iconInCol: ir.top + ir.height / 2 - cr.top,
        // MEASURED off the icon's own rect, so the light's x and the h2's
        // column come from one source (the grid) instead of two that can drift
        iconX: ir.left + ir.width / 2,
        iconPx: ir.width,
        sticky: isSticky,
      };
    });

    // The station-handoff invariant, which replaces round 16's "sections are one
    // viewport apart" (sticky adds a hold phase, so that argument no longer
    // applies). This one does not depend on section height at all: icon i's
    // window ends at `T(i+1) − B − H + C`, icon i+1's begins at
    // `T(i+1) + P − viewH`, so non-overlap requires A + H + B ≤ viewH.
    //
    // It is violated by a NARROW window, because the h2 is wrapped Russian type
    // and gains lines. Silent otherwise: the symptom is a halo popping at a
    // station swap, which nobody traces back to a line break.
    for (const [i, g] of this.geom.entries()) {
      if (!g.sticky) continue;
      const need = g.pin + g.colH + g.padBottom;
      if (need > viewH) {
        console.warn(
          `[kresty] section ${PAGE_SECTIONS[i].id}: pin+col+pad = ${need.toFixed(0)}px ` +
            `exceeds the ${viewH}px viewport — the icon light will pop at a swap. ` +
            `Clamp .sec-h2's font-size.`,
        );
      }
    }
  }

  get firstTop(): number {
    return this.geom[0]?.top ?? Infinity;
  }

  get lastBottom(): number {
    const g = this.geom[this.geom.length - 1];
    return g ? g.top + g.height : 0;
  }

  /** each section contributes one colour stop, keyed to its own measured top */
  stops(): ColorStop[] {
    return this.geom.map((g, i) => ({ top: g.top, color: sectionBg(PAGE_SECTIONS[i]) }));
  }

  /**
   * Where section `i`'s icon sits on screen, in CSS px down the viewport.
   *
   * Derived analytically from geometry measured at resize — never a per-frame
   * `getBoundingClientRect()`, which would force layout inside the rAF loop.
   * The column travels with the page until it reaches its pin, holds while the
   * section passes, then is pushed back out by the section's own bottom edge:
   * exactly a clamp.
   */
  iconY(i: number, scrollTop: number): number {
    const g = this.geom[i];
    if (!g) return 0;
    const flowing = g.top + g.toIcon - scrollTop;
    if (!g.sticky) return flowing;
    const pinned = g.pin + g.iconInCol;
    const pushed = g.top + g.height - g.padBottom - g.colH + g.iconInCol - scrollTop;
    // `pushed` MUST NOT be floored at `pinned`. Flooring it looks like a
    // harmless guard and is the bug that left the last section's icon lit and
    // hovering on the handoff's flat blue, two viewports past its own section —
    // with the floor in place the upper bound never falls, so the icon can
    // never leave the frame and `envelope()` never reaches 0.
    return Math.min(Math.max(flowing, pinned), pushed);
  }

  iconX(i: number): number {
    return this.geom[i]?.iconX ?? 0;
  }

  /**
   * Which icon owns the light, and how bright it is.
   *
   * `mapVisible` short-circuits it: the map is above these sections and the two
   * renderers are never both wanted, so this is also what stops the page ever
   * paying for Three.js and the ray field in the same frame.
   */
  track(scrollTop: number, viewH: number, mapVisible: boolean) {
    let idx = 0;
    let best = Infinity;
    let bestY = 0;
    for (let i = 0; i < this.geom.length; i++) {
      const y = this.iconY(i, scrollTop);
      const d = Math.abs(y - viewH / 2);
      if (d < best) {
        best = d;
        idx = i;
        bestY = y;
      }
    }
    return {
      idx,
      x: this.iconX(idx),
      px: this.geom[idx]?.iconPx ?? 220,
      y: bestY,
      opacity: mapVisible ? 0 : PageLight.envelope(bestY / viewH),
    };
  }
}
