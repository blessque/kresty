import type { MainScreen } from './screens/main/MainScreen';
import type { ConceptScreen } from './screens/concept/ConceptScreen';
import type { ContactsScreen } from './screens/contacts/ContactsScreen';
import { TransitionController } from './screens/transition/TransitionController';

export type Route = 'main' | 'concept' | 'contacts';

/**
 * `#main-from-concept` is the main screen reached by SCROLLING off the bottom
 * of «О Крестах», rather than by clicking a nav link.
 *
 * It denotes the same screen — provenance does not change what you are looking
 * at — but it records where you came from, which is what makes scrolling back
 * up return you there. It is shareable and coherent on a cold load: landing on
 * it directly gives the main screen, with the back gesture simply falling
 * through to an ordinary navigation because there is no history entry behind
 * it (see `goBackFromMain`).
 */
const SEAM_HASH = '#main-from-concept';

function parseHash(): { route: Route; seam: boolean } {
  if (location.hash === '#concept') return { route: 'concept', seam: false };
  if (location.hash === '#contacts') return { route: 'contacts', seam: false };
  if (location.hash === SEAM_HASH) return { route: 'main', seam: true };
  return { route: 'main', seam: false };
}

interface NavOpts {
  push?: boolean;
  style?: 'flash' | 'seam';
  /** scroll offset to restore on «О Крестах»; undefined means a fresh arrival */
  restore?: number;
}

export class Router {
  private transition: TransitionController;
  current: Route;
  /** how the CURRENT screen was arrived at — decides how it is left again */
  private enteredBy: 'flash' | 'seam' = 'flash';
  /** the composition root re-arms the back gesture here; see main.ts */
  onEnterMain: () => void = () => {};

  constructor(
    private main: MainScreen,
    private concept: ConceptScreen,
    private contacts: ContactsScreen,
  ) {
    this.transition = new TransitionController(main);
    const initial = parseHash();
    this.current = initial.route;
    if (initial.seam) this.enteredBy = 'seam';

    main.onNavigate = (to) => this.navigate(to);
    concept.onNavigate = (to) => this.navigate(to);
    contacts.onNavigate = (to) => this.navigate(to);

    // The reader scrolled off the bottom of «О Крестах». Two history operations,
    // and the ORDER is the important half: `replaceState` first writes the
    // scroll offset onto the entry being left, so it belongs to that entry and
    // survives a reload and a multi-step back/forward — which is where the
    // platform would put it too.
    concept.onScrollToMain = (from) => {
      history.replaceState({ screen: 'concept', scroll: from }, '', '#concept');
      history.pushState({ screen: 'main', from: 'concept' }, '', SEAM_HASH);
      void this.swapTo('main', 'seam');
    };
    concept.transitionBusy = () => this.transition.busy;

    addEventListener('popstate', (e) => {
      const { route, seam } = parseHash();
      if (route === this.current) return;
      const st = e.state as { scroll?: number } | null;
      void this.swapTo(route, seam || this.enteredBy === 'seam' ? 'seam' : 'flash', st?.scroll);
    });
  }

  /**
   * Scrolling back up at the top of the main screen. Calls `history.back()`
   * rather than navigating directly, so THE GESTURE AND THE BROWSER BACK BUTTON
   * ARE ONE CODE PATH — they cannot drift, and no orphan forward entry is
   * created, so Forward still returns here as a browser should.
   *
   * The guard matters: on a deep link or a reload onto the seam hash there is
   * no previous entry, and `history.back()` would leave the site entirely.
   */
  goBackFromMain() {
    if (this.current !== 'main' || this.transition.busy) return;
    const st = history.state as { from?: string } | null;
    if (st?.from === 'concept') {
      history.back();
    } else if (location.hash === SEAM_HASH) {
      void this.navigate('concept', { push: true, style: 'seam' });
    }
  }

  private stopAllBut(keep: Route) {
    if (keep !== 'main') this.main.stop();
    if (keep !== 'concept') this.concept.stop();
    if (keep !== 'contacts') this.contacts.stop();
  }

  private startScreen(to: Route, restore?: number) {
    if (to === 'concept') {
      // prime one frame so the reveal is never blank
      this.concept.primeFrame();
      this.concept.start(restore);
    } else if (to === 'contacts') {
      this.contacts.start();
    } else {
      this.main.start();
      this.onEnterMain();
    }
  }

  showInitial() {
    this.stopAllBut(this.current);
    this.startScreen(this.current);
  }

  private async swapTo(to: Route, style: 'flash' | 'seam', restore?: number) {
    if (to === this.current || this.transition.busy) return;
    const from = this.current;
    this.current = to;
    this.enteredBy = style;

    const swap = () => {
      this.stopAllBut(to);
      // Returning to «О Крестах» through the seam lands where the reader left;
      // an ordinary nav click still lands on the resting composition. Those are
      // different arrivals and `start()` is told which.
      this.startScreen(to, style === 'seam' && to === 'concept' ? restoreOr(restore) : undefined);
    };

    // The fly-into-the-light transition converges MainScreen's OWN renderer
    // (TransitionController is constructed from it), so it only has meaning
    // when the main screen is one endpoint. «Контакты» is a temporary showcase
    // page and deliberately stays out of it — it cuts.
    if (from === 'contacts' || to === 'contacts') {
      swap();
      return;
    }

    await this.transition.play(to === 'concept' ? 'toConcept' : 'toMain', swap, style);
  }

  async navigate(to: Route, opts: NavOpts = {}) {
    const { push = true, style = 'flash', restore } = opts;
    if (to === this.current || this.transition.busy) return;
    if (push) {
      history.pushState(
        { screen: to },
        '',
        to === 'main' ? location.pathname + location.search : `#${to}`,
      );
    }
    await this.swapTo(to, style, restore);
  }
}

/**
 * `undefined` means "a fresh arrival, land at the top"; a returning reader with
 * no recorded offset should still land at the bottom rather than the top, which
 * is what −1 signals to ConceptScreen (it clamps).
 */
function restoreOr(v: number | undefined): number {
  return v ?? Number.MAX_SAFE_INTEGER;
}
