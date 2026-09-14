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
 * ROUND 16 was that content — seven resident sections below the map. ROUND 18
 * removed them again and put an INTRO BLOCK above the map instead (the h1 and
 * standfirst of Figma 616:188), so the scroller now reads
 * `[intro] [map stage]` and the map is no longer the first thing in it.
 *
 * The chrome — logo, drawer, admin panel — stays OUTSIDE this scroller as a
 * direct child of the screen. A scroll container's absolutely-positioned
 * children scroll with its content, so leaving them in would scroll the logo
 * off the top.
 *
 * THE OFFSET
 * ----------
 * Things that measure themselves against the map rather than against the page:
 * the picker (the stage moves under a stationary cursor), and `toBottom`. While
 * the map was the first thing in the scroller, `scrollTop` served both. With the
 * intro above it they differ by the intro's height, and getting that wrong is a
 * SILENT failure — `buildingPicker.ts` records the round-14 version: the map
 * still highlights buildings, just the wrong ones.
 *
 * TWO QUANTITIES, and round 18 shipped a bug by treating them as one. How far
 * the map has been SCROLLED cannot be negative. Where the window sits relative
 * to the STAGE can, and is, for the whole time the intro is on screen. Only
 * `stageOffset` — unclamped — may be used to convert a coordinate.
 *
 * `overscan` deliberately does NOT take the offset: `.map-stage`'s percentage
 * height resolves against the scroller's content box, not its `scrollHeight`,
 * so siblings before or after it do not change its size.
 */

/** map stage height as a multiple of the viewport; `?vh=<k>` overrides */
export const STAGE_VH = 1.5;

export class MapScroll {
  /** the plate and the river band live in here */
  readonly stage = document.createElement('div');
  /**
   * ROUND 26: THE FLOOR PLATE, and the canvas is now its child rather than the
   * stage's.
   *
   * The designer's map stands on a blue rectangle ten grid columns wide instead
   * of bleeding off every edge, and the cleanest way to say that is to make the
   * rectangle the canvas's own box: then "fit the model into the plate" is just
   * the fit that already existed, measured against a smaller element. The
   * alternative — keeping the canvas full-bleed and teaching MapCamera to frame
   * into a sub-rectangle — is a second framing system to maintain alongside the
   * drawer inset and the overscan.
   *
   * Its background is what the buildings are seen against: the GLB's ground
   * surfaces are hidden now (groundPlan.ts) and the canvas clears to alpha 0,
   * so this element IS the site's ground.
   */
  readonly plate = document.createElement('div');
  /**
   * The Neva — a full-bleed band below the plate, with a wavy top edge.
   *
   * `.map-water` is a plain box; the WAVE MASK goes on `.map-river` inside it
   * and the pier is that element's SIBLING, not its child. A CSS mask clips an
   * element's descendants as well as its own painting, so a pier inside the
   * masked band gets its stem sliced off along the wave — which looks like a
   * short pier rather than like a clipping bug.
   */
  readonly river = document.createElement('div');
  /** the page scroller: the intro block, then the stage */
  readonly scroller = document.createElement('div');

  /** measured height of everything above the stage; 0 until `setIntro` */
  private introH = 0;
  private intro?: HTMLElement;

  constructor(container: HTMLElement, vh = STAGE_VH) {
    this.scroller.className = 'concept-scroll';
    this.stage.className = 'map-stage';
    this.stage.style.setProperty('--map-vh', String(vh));
    this.plate.className = 'map-plate';
    this.river.className = 'map-water';
    // the pier is artwork ON the river, not a volume in the model any more —
    // and a SIBLING of the masked band, see the field's note
    this.river.innerHTML = '<div class="map-river"></div><div class="map-pier"></div>';
    this.stage.append(this.plate, this.river);
    this.scroller.appendChild(this.stage);
    container.appendChild(this.scroller);
  }

  /** put a block above the map. Its height is MEASURED, never assumed — it is
   *  wrapped type, so it grows when the window narrows. */
  setIntro(el: HTMLElement) {
    this.intro = el;
    this.scroller.insertBefore(el, this.stage);
    this.measureIntro();
  }

  /** re-read the intro's height; call from resize, before anything reads the
   *  map's own scroll */
  measureIntro() {
    this.introH = this.intro ? this.intro.offsetHeight : 0;
  }

  /** height of the block above the map stage */
  get introTop(): number {
    return this.introH;
  }

  /** the raw scroll of the whole page — sections included */
  get scrollTop(): number {
    return this.scroller.scrollTop;
  }

  /**
   * WINDOW → STAGE, on the y axis. Add it to a window-space y to get the same
   * point in the stage's own coordinates.
   *
   * **It is deliberately unclamped and goes NEGATIVE**, and that is the whole
   * reason it exists separately. While the intro is on screen the stage's top
   * edge sits `introH − scrollTop` px BELOW the window's, so a cursor in the
   * intro is at a negative stage y — off the top of the map, which is exactly
   * what the picker should conclude.
   *
   * This used to be `mapScrollTop`, a value clamped at 0 because a scroll
   * position cannot be negative. That conflated two different things: how far
   * the map has been scrolled, and where the window is relative to the stage.
   * Clamping is right for the first and wrong for the second, and using the
   * clamped value as a coordinate transform pinned the whole pick zone to the
   * top of the window while the map itself sat 454 px lower — so clicking the
   * white intro selected buildings.
   */
  get stageOffset(): number {
    return this.scroller.scrollTop - this.introH;
  }

  /** does the map stage still intersect the viewport? */
  get mapVisible(): boolean {
    return this.scroller.scrollTop < this.introH + this.stageH;
  }

  /** has the intro scrolled away, i.e. is the map what you are looking at? */
  get pastIntro(): boolean {
    return this.scroller.scrollTop > this.introH * 0.6;
  }

  /** the viewport height this scroller occupies */
  get viewH(): number {
    return this.scroller.clientHeight;
  }

  /** the full width of the scroller — the band the margin captions letter into */
  get stageW(): number {
    return this.scroller.clientWidth;
  }
  get stageH(): number {
    return this.stage.clientHeight;
  }

  /**
   * THE RENDERED CANVAS SIZE since round 26 — the plate, not the stage and
   * certainly not the window.
   *
   * Everything that used to take `stageW/stageH` takes these instead: the
   * renderer, the picker's resolution, the caption layer's projection space and
   * MapCamera's viewport. They are read from the laid-out element rather than
   * computed from the grid, so the CSS stays the single author of the plate's
   * size and a media query cannot desynchronise the camera from the canvas.
   */
  get plateW(): number {
    return this.plate.clientWidth;
  }
  get plateH(): number {
    return this.plate.clientHeight;
  }
  /** the plate's top-left within the STAGE — what turns a stage coordinate into
   *  a plate one, for the picker */
  get plateLeft(): number {
    return this.plate.offsetLeft;
  }
  get plateTop(): number {
    return this.plate.offsetTop;
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

  /** the top of the PAGE — the intro, then the map below it */
  reset() {
    this.scroller.scrollTop = 0;
  }

  /**
   * Put the reader back where they left, clamped to what the page can actually
   * scroll. A THIRD arrival position, distinct from both `reset()` and
   * `toMapTop()` — see the note on `toMapTop` about that conflation; this is
   * the same lesson a third time.
   */
  restore(y: number) {
    const max = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    this.scroller.scrollTop = Math.min(Math.max(0, y), max);
  }

  /**
   * The top of the MAP, which is `introH` down the page, not 0.
   *
   * These were the same position until the intro block landed above the stage,
   * and `reset()` was used for both. It is the same conflation that broke the
   * picker: "the top" is two places now, and focus mode wants the second one —
   * the isometric framing assumes the map fills the viewport, and pinning to the
   * page top instead leaves the reader looking at the standfirst with half a map
   * under it.
   */
  toMapTop() {
    this.scroller.scrollTop = this.introH;
  }

  /** the BOTTOM OF THE MAP, not the bottom of the page — the intro sits above
   *  the stage, so the map's foot is that much further down */
  toBottom() {
    this.scroller.scrollTo({
      top: this.introH + Math.max(0, this.stageH - this.viewH),
      behavior: 'smooth',
    });
  }

  /** jump to an absolute scroller position (the motion panel's section jumps) */
  scrollTo(top: number) {
    this.scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /** focus mode pins the view: the isometric framing assumes the viewport, and
   *  a scroll fighting the swing has no defined meaning */
  lock(on: boolean) {
    if (on) this.toMapTop();
    this.scroller.classList.toggle('locked', on);
  }
}
