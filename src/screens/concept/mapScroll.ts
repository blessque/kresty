/**
 * The «Концепция» page scroller.
 *
 * ROUND 14 built this as an internal 50 vh reveal so the Neva could be judged,
 * and left a note saying what would happen next:
 *
 *   "This is also the seam the eventual full-page scroll will hang off: when
 *    content lands before and after the map, the stage becomes a section in a
 *    document rather than a pane in a fixed screen, and nothing else moves."
 *
 * ROUND 16 is that content. The scroller now holds the map stage AND the
 * resident sections below it, and it is the page's only scroll. `#screen-concept`
 * is still a fixed pane, `html/body` still never scroll, and the main screen is
 * still untouched — the note held.
 *
 * The chrome — logo, hover rail, drawer, admin panel — stays OUTSIDE this
 * scroller as a direct child of the screen. A scroll container's
 * absolutely-positioned children scroll with its content, so leaving them in
 * would scroll the logo off the top.
 *
 * THE CLAMP
 * ---------
 * Three things measure themselves against the map's own scroll: the picker
 * (the stage moves under a stationary cursor), the caption solver, and the
 * camera. Before this round `scrollTop` was that value, because the map was all
 * there was to scroll. It no longer is — past the map it keeps growing into the
 * sections, which would drag the pick point and the caption domain out to
 * nowhere. `mapScrollTop` is the clamped value and every one of those three
 * reads it, so the clamp exists once.
 */

/** map stage height as a multiple of the viewport; `?vh=<k>` overrides */
export const STAGE_VH = 1.5;

export class MapScroll {
  /** the canvas and the caption layer live in here */
  readonly stage = document.createElement('div');
  /** resident sections are appended here, after the stage */
  readonly scroller = document.createElement('div');

  constructor(container: HTMLElement, vh = STAGE_VH) {
    this.scroller.className = 'concept-scroll';
    this.stage.className = 'map-stage';
    this.stage.style.setProperty('--map-vh', String(vh));
    this.scroller.appendChild(this.stage);
    container.appendChild(this.scroller);
  }

  /** the raw scroll of the whole page — sections included */
  get scrollTop(): number {
    return this.scroller.scrollTop;
  }

  /**
   * The map's OWN scroll, clamped to the stage.
   *
   * Past the bottom of the map this stops advancing, so the picker and the
   * caption solver behave as they do at the foot of the map rather than being
   * driven somewhere undefined. They are additionally skipped entirely once the
   * map is off screen — this clamp is the guard, not the optimisation.
   */
  get mapScrollTop(): number {
    return Math.min(this.scroller.scrollTop, Math.max(0, this.stageH - this.viewH));
  }

  /** does the map stage still intersect the viewport? */
  get mapVisible(): boolean {
    return this.scroller.scrollTop < this.stageH;
  }

  /** the viewport height this scroller occupies */
  get viewH(): number {
    return this.scroller.clientHeight;
  }

  /** the rendered canvas size, in CSS px — NOT the window size */
  get stageW(): number {
    return this.scroller.clientWidth;
  }
  get stageH(): number {
    return this.stage.clientHeight;
  }

  /**
   * stageH / viewportH — what MapCamera extends the frustum by.
   *
   * Measured rather than assumed equal to `vh`, so a CSS change cannot
   * desynchronise the camera from the canvas and stretch the world vertically.
   * Unaffected by the sections: `.map-stage`'s percentage height resolves
   * against the scroller's content box, not its `scrollHeight`, so siblings
   * after it do not change its size.
   */
  get overscan(): number {
    const view = this.viewH;
    return view > 0 ? this.stageH / view : 1;
  }

  reset() {
    this.scroller.scrollTop = 0;
  }

  /**
   * The rail's river hint — the BOTTOM OF THE MAP, not the bottom of the page.
   * Before the sections existed those were the same position and this used
   * `scrollHeight`; it would now fly past seven sections to the foot of the
   * document.
   */
  toBottom() {
    this.scroller.scrollTo({
      top: Math.max(0, this.stageH - this.viewH),
      behavior: 'smooth',
    });
  }

  /** focus mode pins the view: the isometric framing assumes the viewport, and
   *  a scroll fighting the swing has no defined meaning */
  lock(on: boolean) {
    if (on) this.reset();
    this.scroller.classList.toggle('locked', on);
  }
}
