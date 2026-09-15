import { asset } from '../shared/assetUrl';
import { escapeHtml } from '../shared/escapeHtml';

/**
 * One picture. `w`/`h` are the file's INTRINSIC pixels and they are required,
 * not decorative: they are written to the `<img>` so the box is committed
 * before decode. Without that a late image resolves its own height, shifts
 * everything below it and desyncs the measured scroll track mid-scroll.
 *
 * They also replace a global `aspect-ratio: 3/2`, which the round-26 photography
 * breaks in both directions: four of the renders are portrait (down to 0.67) and
 * three are panoramas (up to 4.80).
 */
export interface MediaItem {
  src: string;
  alt: string;
  w: number;
  h: number;
}

/**
 * THE PICTURE BLOCK — one photograph, or several as a slider (round 26).
 *
 * Figma `1132:173`. A 559-wide block (= `.col-main`), photos 410 tall in a row
 * with the grid's own 24px gutter between them, and two 60×60 chevrons 24px
 * below, starting at the 16px text inset and 16px apart.
 *
 * ── the filmstrip, and why the peek is contained ────────────────────────────
 * Slides sit in a row with the grid's own gutter between them and the strip
 * translates, so the NEXT photo shows past the right edge of the block. The
 * frame is therefore ONE COLUMN WIDER than the block and clips: the bleed lands
 * in the skipped column 12 and stops exactly at the content edge. Clipping on
 * the left is not optional — the outgoing photo would otherwise cover the
 * sticky heading beside it.
 *
 * ── the fit is width-first, height-capped ───────────────────────────────────
 * "Active photo takes the full block width, except too-tall photos — set a
 * height limit and centre them." So a slide takes the block width, and only if
 * that would overrun the cap does the cap bind and the slide come out narrower.
 * A 1.49 landscape is 559 × 375 and fills the block; a 0.86 portrait would be
 * 559 × 650, so it becomes 352 × 410. That is why the strip is CENTRED rather
 * than left-aligned: a no-op for anything filling the block, and the whole point
 * for a portrait that does not.
 *
 * ── what this is NOT ────────────────────────────────────────────────────────
 * `screens/main/PhotoSlider.ts` was read and deliberately not reused. It is an
 * idle auto-show whose whole state machine exists to RETREAT on user input, it
 * is `position: absolute; inset: 0` full-bleed with `object-fit: cover`, it
 * imports its slides at module scope, and its timing is tied to the ray-field's
 * light dip. Every one of those is the opposite of what a content slider needs.
 * What is borrowed is the idea, not the code: photos change by a transform on
 * the compositor, and nothing animates on the main thread.
 */

/** the frame's own height for the strip, px at the 1440 design frame */
export const STRIP_H = 410;

export interface MediaSliderHost {
  /**
   * Called when the block's own height changes — a slide of a different aspect
   * becoming active. «О Крестах» re-measures its scroll track on this, because
   * a section that changes height after layout desyncs the light's stations.
   */
  onResize?: () => void;
}

export class MediaSlider {
  readonly el: HTMLElement;
  private strip: HTMLElement;
  private prev: HTMLButtonElement | null = null;
  private next: HTMLButtonElement | null = null;
  private i = 0;
  private ro: ResizeObserver | null = null;

  constructor(
    private items: MediaItem[],
    private host: MediaSliderHost = {},
  ) {
    this.el = document.createElement('div');
    this.el.className = items.length > 1 ? 'ms ms--slider' : 'ms';

    const frame = document.createElement('div');
    frame.className = 'ms-frame';
    this.strip = document.createElement('div');
    this.strip.className = 'ms-strip';
    this.strip.innerHTML = items
      .map(
        (m) =>
          `<img class="ms-shot" src="${asset(encodeURI(m.src))}"` +
          ` alt="${escapeHtml(m.alt)}" loading="lazy" decoding="async"` +
          // intrinsic pixels, so the box is committed before decode — the
          // reason `pageSections.ts` requires w/h on every MediaItem
          ` width="${m.w}" height="${m.h}">`,
      )
      .join('');
    frame.appendChild(this.strip);
    this.el.appendChild(frame);

    if (items.length > 1) this.el.appendChild(this.buildControls());

    // APPLY ON LAYOUT, NOT IN THE CONSTRUCTOR. Both the slide cap and the
    // centring need the block's measured width, and at construction this element
    // is not in the document yet — `clientWidth` is 0, which would publish
    // `--ms-block-w: 0px` and collapse every slide to nothing. A ResizeObserver
    // fires once the box exists and again whenever it changes, which also covers
    // the viewport resize and `--k` moving the whole grid.
    this.ro = new ResizeObserver(() => this.apply());
    this.ro.observe(this.el);

    // A LAZY IMAGE ARRIVING IS NOT A RESIZE OF ANYTHING WE CAN OBSERVE, and
    // this cost a measurement to find. The block's width never changes when a
    // photo decodes; neither does the STRIP's, because it is a block-level flex
    // container filling the frame. So both ResizeObservers stay silent while the
    // thing that actually changed — the slide's own box — goes from 0 to its
    // real width. The symptom was precise: the first slide of every set sat
    // exactly half a block to the right, because `apply()` had centred against
    // `offsetWidth: 0`, and every LATER slide was correct because by then the
    // images had loaded. Listen to the images themselves.
    for (const img of this.strip.querySelectorAll('img')) {
      if (img.complete) continue;
      img.addEventListener('load', () => this.apply(), { once: true });
    }
  }

  /** stop observing — the page never tears a section down today, but a slider
   *  that outlives its element would keep a live observer on a detached node */
  destroy() {
    this.ro?.disconnect();
  }

  private buildControls(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ms-controls';
    // «‹» and «›» as SVG rather than glyphs: the frame draws a thin chevron,
    // and a text arrow would take the body font's weight axis with it.
    const chevron = (dir: 'prev' | 'next') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ms-btn ms-btn--${dir}`;
      b.setAttribute('aria-label', dir === 'prev' ? 'Предыдущее фото' : 'Следующее фото');
      b.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true">` +
        `<path d="${dir === 'prev' ? 'M15 4 7 12l8 8' : 'M9 4l8 8-8 8'}"` +
        ` fill="none" stroke="currentColor" stroke-width="2"` +
        ` stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      b.addEventListener('click', () => this.go(dir === 'prev' ? -1 : 1));
      return b;
    };
    this.prev = chevron('prev');
    this.next = chevron('next');
    row.append(this.prev, this.next);
    return row;
  }

  private go(d: number) {
    const n = Math.min(this.items.length - 1, Math.max(0, this.i + d));
    if (n === this.i) return;
    this.i = n;
    this.apply();
    // a slide of a different aspect changes the block's own width, not its
    // height — the strip height is fixed — but the host is told anyway, because
    // «О Крестах» measures geometry it does not own.
    this.host.onResize?.();
  }

  /**
   * Position the strip so slide `i` is centred in the frame.
   *
   * THE FIT IS WIDTH-FIRST, HEIGHT-CAPPED — the client's rule, and getting it
   * the other way round is the obvious mistake. A slide takes the FULL BLOCK
   * WIDTH, and only if that would make it taller than the cap does the cap take
   * over and the slide come out narrower. So a 1.49 landscape is 559 × 375 and
   * fills the block; a 0.86 portrait would be 559 × 650, so it becomes 352 × 410
   * instead. The CSS states it as `max-width: 100%` + `max-height: var(--ms-h)`.
   *
   * That is why the strip is CENTRED rather than left-aligned: centring is a
   * no-op for anything that fills the block, and it is the whole point for a
   * portrait that does not.
   *
   * Offsets are MEASURED rather than computed from the intrinsic ratios. The
   * arithmetic version has to re-derive `min(blockWidth, cap × ratio)` including
   * how `--k` scales both — i.e. reimplement the CSS in TypeScript, where the
   * two can drift. One layout read per slide change is cheaper than that bug,
   * and it happens on a click, never per frame.
   */
  private apply() {
    const shots = [...this.strip.querySelectorAll<HTMLElement>('.ms-shot')];
    shots.forEach((s, k) => s.classList.toggle('is-active', k === this.i));
    this.prev?.toggleAttribute('disabled', this.i === 0);
    this.next?.toggleAttribute('disabled', this.i === this.items.length - 1);

    const active = shots[this.i];
    if (!active) return;
    // not laid out yet (or hidden): leave the CSS fallback in place rather than
    // publishing a zero width
    if (this.el.clientWidth === 0) return;
    // `.ms` is the BLOCK; `.ms-frame` inside it is one column wider so the peek
    // has room. Both the slide cap and the centring are the block's, never the
    // frame's — see the `--ms-block-w` note in page.css.
    const frameW = this.el.clientWidth;
    this.el.style.setProperty('--ms-block-w', `${frameW}px`);
    // `offsetLeft` is relative to the strip's own padding box, which is exactly
    // the untransformed position — so this does not read back the transform it
    // is about to write
    const centre = active.offsetLeft + active.offsetWidth / 2;
    this.strip.style.setProperty('--ms-x', `${frameW / 2 - centre}px`);
  }
}
