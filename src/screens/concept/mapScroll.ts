/**
 * The map's scroll container — the +50 vh that brings the Neva into view.
 *
 * ROUND 14. Round 13 framed the map on the parts with mass, which pushed the
 * river off the bottom of the frame; all that was left at rest was a blue
 * triangle in the corner. Measured against the shipped framing, the shoreline
 * sits 411 px below frame centre and the Neva runs unbroken past 968 — so a
 * 400 px (50 vh) reveal lands on open water, edge to edge, with the shoreline
 * just at the top of the revealed band. That is where STAGE_VH comes from.
 *
 * WHY THE DOCUMENT DOES NOT SCROLL
 * --------------------------------
 * `global.css` sets `html, body { overflow: hidden }` and
 * `.screen { position: fixed; inset: 0 }`, and the main screen's viewport-pinned
 * layout (rounds 10–11) depends on both. So the scroll is INTERNAL to
 * `#screen-concept`, which stays a fixed pane. `#grain` and `#white-flash` are
 * fixed on the document and never see it.
 *
 * The chrome — logo, hover rail, drawer, admin panel — stays OUTSIDE this
 * scroller, as a direct child of the screen. A scroll container's
 * absolutely-positioned children scroll with its content, so leaving them in
 * would scroll the logo off the top.
 *
 * This is also the seam the eventual full-page scroll will hang off: when
 * content lands before and after the map, the stage becomes a section in a
 * document rather than a pane in a fixed screen, and nothing else moves.
 */

/** stage height as a multiple of the viewport; `?vh=<k>` overrides */
export const STAGE_VH = 1.5;

export class MapScroll {
  /** the canvas and the caption layer live in here */
  readonly stage = document.createElement('div');
  private readonly scroller = document.createElement('div');

  constructor(container: HTMLElement, vh = STAGE_VH) {
    this.scroller.className = 'map-scroll';
    this.stage.className = 'map-stage';
    this.stage.style.setProperty('--map-vh', String(vh));
    this.scroller.appendChild(this.stage);
    container.appendChild(this.scroller);
  }

  get scrollTop(): number {
    return this.scroller.scrollTop;
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
   * Measured rather than assumed equal to `vh`: the scroller is the authority
   * on both numbers, so a CSS change cannot desynchronise the camera from the
   * canvas and stretch the world vertically.
   */
  get overscan(): number {
    const view = this.scroller.clientHeight;
    return view > 0 ? this.stageH / view : 1;
  }

  reset() {
    this.scroller.scrollTop = 0;
  }

  toBottom() {
    this.scroller.scrollTo({ top: this.scroller.scrollHeight, behavior: 'smooth' });
  }

  /** focus mode pins the view: the isometric framing assumes the viewport, and
   *  a scroll fighting the swing has no defined meaning */
  lock(on: boolean) {
    if (on) this.reset();
    this.scroller.classList.toggle('locked', on);
  }
}
