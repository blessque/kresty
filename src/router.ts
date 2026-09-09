import type { MainScreen } from './screens/main/MainScreen';
import { TransitionController } from './screens/transition/TransitionController';

/**
 * ROUND 24 MADE THIS A REGISTRY. It used to enumerate every route in five
 * places — a union, an if-chain, a constructor parameter, `stopAllBut` and
 * `startScreen` — which was fine for three and untenable for seven. Adding a
 * page is now one entry in `SCREENS` plus one line in `HASHES`.
 */
export type Route = 'main' | 'concept' | 'contacts' | 'news' | 'article' | 'rent' | 'icons';

/**
 * The whole contract a screen owes the router. Deliberately tiny: a screen never
 * imports the router, never learns that other routes exist, and shows or hides
 * ITSELF — the router does not touch the DOM.
 */
export interface Screen {
  /** the router assigns this; the screen calls it */
  onNavigate: (to: Route) => void;
  start(restore?: number): void;
  stop(): void;
  /** draw one frame before being revealed, so a transition never lands on blank */
  primeFrame?(): void;
  /** the reader scrolled off the bottom into the main screen's light */
  onScrollToMain?: (from: number) => void;
  /** the router tells seam-capable pages when a transition is mid-flight */
  transitionBusy?: () => boolean;
  /** where a return through the seam should land */
  restoreTop?(): number;
}

/**
 * `#main-from-<route>` is the main screen reached by SCROLLING off the bottom of
 * a page rather than by clicking a nav link.
 *
 * It denotes the same screen — provenance does not change what you are looking
 * at — but it records where you came from, which is what makes scrolling back up
 * return you there. It is shareable and coherent on a cold load: landing on it
 * directly gives the main screen, with the back gesture falling through to an
 * ordinary navigation because there is no history entry behind it.
 *
 * ROUND 24 made it per-route. It was `#main-from-concept` when «О Крестах» was
 * the only page that seamed; four more do now, and a shared hash would return
 * every one of them to the same page.
 */
const SEAM_PREFIX = '#main-from-';

/** hash → route. `main` is the fallback, so an unknown hash lands home. */
const HASHES: Record<string, Route> = {
  '#concept': 'concept',
  '#contacts': 'contacts',
  '#news': 'news',
  '#rent': 'rent',
  '#icons': 'icons',
};

function parseHash(): { route: Route; seam: Route | null } {
  const h = location.hash;
  // the article is the one route with a parameter; there is a single article in
  // the pitch, so the id is parsed and ignored rather than pretended away
  if (h.startsWith('#news/')) return { route: 'article', seam: null };
  if (h.startsWith(SEAM_PREFIX)) {
    const from = h.slice(SEAM_PREFIX.length) as Route;
    return { route: 'main', seam: from in SCREEN_IDS ? from : null };
  }
  return { route: HASHES[h] ?? 'main', seam: null };
}

/** every route that has a screen — also the guard for a hand-typed seam hash */
const SCREEN_IDS: Record<Route, true> = {
  main: true,
  concept: true,
  contacts: true,
  news: true,
  article: true,
  rent: true,
  icons: true,
};

function hashFor(route: Route): string {
  if (route === 'main') return location.pathname + location.search;
  if (route === 'article') return '#news/1';
  return `#${route}`;
}

interface NavOpts {
  push?: boolean;
  style?: 'flash' | 'seam';
  /** scroll offset to restore; undefined means a fresh arrival */
  restore?: number;
}

export class Router {
  private transition: TransitionController;
  current: Route;
  /** how the CURRENT screen was arrived at — decides how it is left again */
  private enteredBy: 'flash' | 'seam' = 'flash';
  /** which page the reader seamed out of, so back returns there */
  private seamFrom: Route | null = null;
  /** the composition root re-arms the back gesture here; see main.ts */
  onEnterMain: () => void = () => {};

  constructor(
    private main: MainScreen,
    private screens: Record<Route, Screen>,
  ) {
    this.transition = new TransitionController(main);
    const initial = parseHash();
    this.current = initial.route;
    if (initial.seam) {
      this.enteredBy = 'seam';
      this.seamFrom = initial.seam;
    }

    for (const [id, s] of Object.entries(screens) as [Route, Screen][]) {
      s.onNavigate = (to) => this.navigate(to);
      s.transitionBusy = () => this.transition.busy;
      if (!s.onScrollToMain) continue;
      // The reader scrolled off the bottom. Two history operations, and the
      // ORDER is the important half: `replaceState` first writes the scroll
      // offset onto the entry being LEFT, so it belongs to that entry and
      // survives a reload and a multi-step back/forward — which is where the
      // platform would put it too.
      s.onScrollToMain = (from) => {
        history.replaceState({ screen: id, scroll: from }, '', hashFor(id));
        history.pushState({ screen: 'main', from: id }, '', SEAM_PREFIX + id);
        this.seamFrom = id;
        void this.swapTo('main', 'seam');
      };
    }

    addEventListener('popstate', (e) => {
      const { route, seam } = parseHash();
      if (seam) this.seamFrom = seam;
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
   * The guard matters: on a deep link or a reload onto a seam hash there is no
   * previous entry, and `history.back()` would leave the site entirely.
   */
  goBackFromMain() {
    if (this.current !== 'main' || this.transition.busy) return;
    const st = history.state as { from?: Route } | null;
    if (st?.from && st.from in SCREEN_IDS) {
      history.back();
    } else if (location.hash.startsWith(SEAM_PREFIX) && this.seamFrom) {
      void this.navigate(this.seamFrom, { push: true, style: 'seam' });
    }
  }

  private stopAllBut(keep: Route) {
    for (const [id, s] of Object.entries(this.screens) as [Route, Screen][]) {
      if (id !== keep) s.stop();
    }
  }

  private startScreen(to: Route, restore?: number) {
    const s = this.screens[to];
    // prime one frame so a reveal is never blank
    s.primeFrame?.();
    s.start(restore);
    if (to === 'main') this.onEnterMain();
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
      // Returning through the seam lands where the reader left; an ordinary nav
      // click still lands on the resting composition. Those are different
      // arrivals and `start()` is told which.
      this.startScreen(to, style === 'seam' && to !== 'main' ? restoreOr(restore) : undefined);
    };

    // THE FLY-INTO-THE-LIGHT CONVERGES MAIN'S OWN RENDERER (TransitionController
    // is constructed from it), so it only has meaning when the main screen is one
    // endpoint. Page↔page cuts — there is no light to converge. Round 24
    // generalised this from a hard-coded «Контакты» opt-out; `'toConcept'` never
    // meant concept, it meant "away from main".
    if (from !== 'main' && to !== 'main') {
      swap();
      return;
    }

    await this.transition.play(to === 'main' ? 'toMain' : 'toConcept', swap, style);
  }

  async navigate(to: Route, opts: NavOpts = {}) {
    const { push = true, style = 'flash', restore } = opts;
    if (to === this.current || this.transition.busy) return;
    if (push) history.pushState({ screen: to }, '', hashFor(to));
    await this.swapTo(to, style, restore);
  }
}

/**
 * `undefined` means "a fresh arrival, land at the top"; a returning reader with
 * no recorded offset should still land at the bottom rather than the top, which
 * is what a very large number signals to a screen (they clamp).
 */
function restoreOr(v: number | undefined): number {
  return v ?? Number.MAX_SAFE_INTEGER;
}
