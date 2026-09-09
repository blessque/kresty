import { PageShell } from './PageShell';
import { LEAD_COLOR, type ColorStop } from './pageBackground';
import type { Route, Screen } from '../router';

/**
 * A content page: the shell plus whatever the page puts in it (round 24).
 *
 * Four pages landed at once and they differ only in content, so everything they
 * share is here — the scroller, the colour track, the wordmark, the handoff, and
 * the four-method contract the router expects. A page subclass writes `build()`
 * and, if it wants a colour run, `stops()`.
 *
 * NO rAF LOOP. Nothing on these pages animates: the colour and the handoff are
 * pure functions of `scrollTop`, so the shell runs them on the scroll event.
 * That is also why a page can sit in the DOM permanently and cost nothing.
 */
export abstract class ContentScreen implements Screen {
  readonly shell: PageShell;
  onNavigate: (to: Route) => void = () => {};
  onScrollToMain: (from: number) => void = () => {};
  transitionBusy: () => boolean = () => false;

  private built = false;

  constructor(
    protected el: HTMLElement,
    cssClass: string,
  ) {
    this.el.classList.add('hidden', cssClass);
    this.el.innerHTML = '';
    this.shell = new PageShell(this.el, () => this.onNavigate('main'));
    this.shell.onScrollToMain = (from) => this.onScrollToMain(from);
    this.shell.transitionBusy = () => this.transitionBusy();
    addEventListener('resize', this.onResize);
  }

  /** build the page's content into the shell; called once, lazily on first show */
  protected abstract build(): void;

  /**
   * The page's own colour stops, top to bottom. The shell appends the handoff's
   * two — the dawn and main's blue — so a page never has to remember that the
   * seam only works if its LAST colour is exactly `MAIN_BG`.
   */
  protected stops(): ColorStop[] {
    return [];
  }

  /**
   * Lazily built, and that is the point of a seven-route site: four pages that
   * a given reader may never open cost one empty div each until they are.
   */
  private ensureBuilt() {
    if (this.built) return;
    this.built = true;
    this.build();
    this.shell.bg.el.style.background = LEAD_COLOR;
    this.shell.setStops(this.stops());
  }

  start(restore?: number) {
    this.ensureBuilt();
    this.shell.start(restore === undefined ? 0 : Math.min(restore, this.shell.restoreTop()));
  }

  stop() {
    this.shell.stop();
  }

  /** the router asks seam-capable screens where a return should land */
  restoreTop(): number {
    return this.shell.restoreTop();
  }

  private onResize = () => {
    if (this.built) this.shell.measure();
  };
}
