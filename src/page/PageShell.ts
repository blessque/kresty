import { PageBackground, LEAD_COLOR, type ColorStop } from './pageBackground';
import { MainHandoff } from './mainHandoff';
import { buildHomeLink } from './homeLink';

/**
 * Everything a content page needs to behave like «О Крестах» minus the map
 * (round 24): a scroller, a colour track, the wordmark home link, and the
 * handoff that scrolls the reader into the main screen's light.
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 * Four pages landed at once and every one of the designer's frames ends with
 * the main screen pasted at the bottom. The seam is the most delicate thing in
 * this codebase — an ordering bug in it is the only way the page can flash — so
 * building it four more times by hand was four chances to get it wrong. The
 * modules were MOVED here from `screens/concept/`, not rewritten; their comments
 * carry reasoning that cost real rounds to learn.
 *
 * ── the one structural rule ─────────────────────────────────────────────────
 * THE CHROME IS A SIBLING OF THE SCROLLER, NEVER A CHILD. A scroll container's
 * absolutely-positioned children scroll with its content, so a home link inside
 * it slides off the top on the first wheel event. `mapScroll.ts` states the same
 * rule for the map's furniture; this class enforces it by owning both.
 *
 * ── what it deliberately does NOT do ────────────────────────────────────────
 * No rAF loop. Nothing here animates: the colour and the handoff are pure
 * functions of `scrollTop`, so they run on the scroll event and on resize. A
 * page that wants per-frame work (a light, a canvas) drives its own loop and
 * calls `update()` from it instead — which is exactly what «О Крестах» does
 * through `ConceptPage`.
 */
export class PageShell {
  /** content goes in here */
  readonly scroller = document.createElement('div');
  readonly handoff: MainHandoff;
  readonly bg: PageBackground;

  /** the reader crossed the handoff line — the screen tells the router */
  onScrollToMain: (from: number) => void = () => {};
  /** true while a route transition is playing; the handoff must not fire then */
  transitionBusy: () => boolean = () => false;

  private stops: ColorStop[] = [];
  private running = false;

  /**
   * @param screen the `.screen` container
   * @param onHome  what the wordmark does
   */
  constructor(
    private screen: HTMLElement,
    onHome: () => void,
  ) {
    // The colour track prepends itself to the screen, BEHIND the scroller.
    this.bg = new PageBackground(screen);
    this.scroller.className = 'page-scroll';
    screen.appendChild(this.scroller);
    // sibling of the scroller — see the header
    screen.appendChild(buildHomeLink(onHome));

    this.handoff = new MainHandoff(this.scroller);
    this.handoff.onCross = () => this.onScrollToMain(this.scroller.scrollTop);

    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
  }

  /** append page content ABOVE the handoff, which must stay last in the scroller */
  add(el: HTMLElement) {
    this.scroller.insertBefore(el, this.handoff.el);
  }

  /**
   * Give the page its colour run. The handoff's own two stops — the dawn and
   * main's blue — are appended here rather than by the caller, because the seam
   * only works if the page's LAST colour is exactly `MAIN_BG`, and leaving that
   * to each page would be four chances to forget.
   */
  setStops(stops: ColorStop[]) {
    this.stops = stops;
    this.measure();
  }

  measure() {
    const viewH = this.scroller.clientHeight;
    if (!viewH) return;
    this.bg.setStops([...this.stops, ...this.handoff.stops(viewH)]);
    this.update();
  }

  /** where a return from the main screen lands: past the dawn, disarmed */
  restoreTop(): number {
    return this.handoff.restoreTop(this.scroller.clientHeight);
  }

  start(restore?: number) {
    this.running = true;
    this.screen.classList.remove('hidden');
    this.handoff.reset();
    // A fresh arrival starts at the top; a return from the seam lands where the
    // handoff says, which is past the dawn so the reader does not immediately
    // re-cross the line they just came through.
    this.scroller.scrollTop = restore ?? 0;
    this.measure();
  }

  stop() {
    this.running = false;
    this.screen.classList.add('hidden');
  }

  /**
   * Colour first, handoff second, IN THE SAME TASK. Reversed, a hard flick that
   * jumps from mid-band to past the line paints one frame of the intermediate
   * colour — the only way this seam can flash. `MainHandoff.update` says so at
   * length; this method is the other half of that contract.
   */
  update() {
    if (!this.running) return;
    const viewH = this.scroller.clientHeight;
    if (!viewH) return;
    const top = this.scroller.scrollTop;
    this.bg.update(top, viewH);
    this.handoff.update(top, viewH, this.bg.pure, this.transitionBusy());
  }

  private onScroll = () => this.update();
}

export { LEAD_COLOR };
