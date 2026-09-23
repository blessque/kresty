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
  /** the canvas and the caption layer live in here */
  readonly stage = document.createElement('div');
  /** the page scroller: the intro block, then the stage */
  readonly scroller = document.createElement('div');

  /** measured height of everything above the stage; 0 until `setIntro` */
  private introH = 0;

  constructor(container: HTMLElement, vh = STAGE_VH) {
    this.scroller.className = 'concept-scroll';
    this.stage.className = 'map-stage';
    this.stage.style.setProperty('--map-vh', String(vh));
    this.scroller.appendChild(this.stage);
    container.appendChild(this.scroller);
  }

  /** put one or more blocks above the map, in order. Round 29 made this variadic
   *  for the hero, which sits above the masthead. Heights are MEASURED, never
   *  assumed — it is wrapped type and a photograph, so both grow when the window
   *  narrows. */
  setIntro(...els: HTMLElement[]) {
    for (const el of els) this.scroller.insertBefore(el, this.stage);
    this.measureIntro();
  }

  /** re-read the height of everything above the stage; call from resize, before
   *  anything reads the map's own scroll */
  measureIntro() {
    // THE STAGE'S OWN OFFSET, not the sum of the blocks' heights. `.concept-scroll`
    // is `position: absolute` and therefore the offset parent, so this is exactly
    // the distance from the scroller's content top — and unlike a sum it stays
    // right however many blocks are above and whatever margins they collapse.
    this.introH = this.stage.offsetTop;
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

  /**
   * Is the hero still behind the pinned wordmark? (round 29)
   *
   * The wordmark sits at the page's 32px corner and is 40px tall, so what
   * matters is whether the hero's BOTTOM EDGE is still below 72 — not whether
   * the hero is on screen at all. Measured off the element rather than from a
   * constant: its height is a `clamp` on `vw`, so it is a different number at
   * every window width.
   */
  get overHero(): boolean {
    const hero = this.scroller.firstElementChild as HTMLElement | null;
    if (!hero || !hero.classList.contains('concept-hero')) return false;
    return this.scroller.scrollTop < hero.offsetHeight - 72;
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
