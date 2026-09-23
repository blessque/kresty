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
 * THE PICTURE BLOCK — one photograph, or several as a SCROLL-PANNED strip.
 *
 * ── round 29: the strip broke out of the column ─────────────────────────────
 * A slider is now `100vw`, edge to edge past the page margins, and it pans
 * sideways as the reader scrolls DOWN. There are no arrows: the movement is not
 * something you operate, it is something the page does while you read past it.
 *
 * THE PAN IS A NATIVE SCROLL-DRIVEN ANIMATION, and that is the whole design of
 * this file. The obvious implementation — a rAF scroll handler writing a
 * transform — is forbidden here by measurement, not by taste: it is bit-for-bit
 * round 16.1's reported defect on «О Крестах», where a transform on the main
 * thread raced the compositor scrolling the column beside it and the result was
 * 10 fps and 20px jumps. `animation-timeline: view()` runs off the main thread
 * for free. So the only thing script does is publish ONE number, `--ms-travel`,
 * and the keyframes in page.css do the rest. Nothing here runs per frame.
 *
 * ── a lone picture is not a strip ───────────────────────────────────────────
 * One item is still a plain figure in the body column at its five-column width,
 * unmoved and unclipped. It has nowhere to pan to, and `width: 100%` on it is
 * load-bearing for a reason that has nothing to do with motion — see page.css.
 *
 * ── what this is NOT ────────────────────────────────────────────────────────
 * `screens/main/PhotoSlider.ts` was read and deliberately not reused. It is an
 * idle auto-show whose whole state machine exists to RETREAT on user input, it
 * is `position: absolute; inset: 0` full-bleed with `object-fit: cover`, it
 * imports its slides at module scope, and its timing is tied to the ray-field's
 * light dip. Every one of those is the opposite of what a content strip needs.
 */

/* ROUND 29 DELETED `STRIP_H`. It was this file's copy of the strip height, kept
 * in step with `--ms-h: 410px` in page.css, and its one consumer was
 * `MuseumRun.fitFrames()` — which is gone, because a slide with a definite
 * height has no dead air to fit away. The height now lives in exactly one
 * place, the CSS, which is where it was always supposed to be.
 */

export interface MediaSliderHost {
  /**
   * Called when the strip's measured travel changes — once on layout, and again
   * as each lazy image resolves its width. «О Крестах» and «Музей» both derive
   * scroll geometry they do not own from these blocks, so anything that moves
   * after first layout has to say so.
   *
   * Fired on CHANGE ONLY, which is what keeps a ResizeObserver from driving a
   * page re-measure in a loop. The number settles after the last image decodes.
   */
  onResize?: () => void;
}

export class MediaSlider {
  readonly el: HTMLElement;
  private strip: HTMLElement;
  private frame: HTMLElement;
  private ro: ResizeObserver | null = null;
  private travel = -1;

  constructor(
    items: MediaItem[],
    private host: MediaSliderHost = {},
  ) {
    this.el = document.createElement('div');
    this.el.className = items.length > 1 ? 'ms ms--slider' : 'ms';

    this.frame = document.createElement('div');
    this.frame.className = 'ms-frame';
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
    this.frame.appendChild(this.strip);
    this.el.appendChild(this.frame);

    // MEASURE ON LAYOUT, NOT IN THE CONSTRUCTOR. The travel is the strip's
    // scroll width less the frame's, and at construction this element is not in
    // the document — both are 0, which would publish `--ms-travel: 0px` and
    // leave a strip that never pans. A ResizeObserver fires once the box exists
    // and again whenever it changes, which also covers the viewport resize.
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(this.el);

    // A LAZY IMAGE ARRIVING IS NOT A RESIZE OF ANYTHING WE CAN OBSERVE, and this
    // cost a measurement to find in round 26. The block's width never changes
    // when a photo decodes; neither does the STRIP's box, because it is a flex
    // container filling the frame. So both ResizeObservers stay silent while the
    // thing that actually changed — the slide's own width — settles.
    //
    // It matters less than it did (every slide now has a DEFINITE height and
    // resolves its width from the intrinsic ratio before a byte arrives) but not
    // none: a file whose real aspect differs from its declared `w`/`h` corrects
    // itself on load, and the travel has to follow.
    for (const img of this.strip.querySelectorAll('img')) {
      if (img.complete) continue;
      img.addEventListener('load', () => this.measure(), { once: true });
    }
  }

  /** stop observing — the page never tears a section down today, but a slider
   *  that outlives its element would keep a live observer on a detached node */
  destroy() {
    this.ro?.disconnect();
  }

  /**
   * Publish how far the strip has to travel, and nothing else.
   *
   * `--ms-travel` is the one number the pan needs: the keyframe in page.css
   * animates `translateX(calc(-1 * var(--ms-travel)))` along a `view()` timeline,
   * so the strip finishes with its last slide flush to the right edge exactly as
   * the block leaves the frame. Clamped at 0 — a strip narrower than the
   * viewport has nowhere to go and must not drift backwards.
   *
   * `scrollWidth` rather than a sum of the children: it includes the flex gaps,
   * and restating `n × slide + (n−1) × gutter` here would be reimplementing the
   * CSS in TypeScript where the two can drift.
   */
  private measure() {
    const travel = Math.max(0, this.strip.scrollWidth - this.frame.clientWidth);
    if (travel === this.travel) return;
    this.travel = travel;
    this.el.style.setProperty('--ms-travel', `${travel}px`);
    this.host.onResize?.();
  }
}
