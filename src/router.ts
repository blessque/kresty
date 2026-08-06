import type { MainScreen } from './screens/main/MainScreen';
import type { ConceptScreen } from './screens/concept/ConceptScreen';
import type { ContactsScreen } from './screens/contacts/ContactsScreen';
import { TransitionController } from './screens/transition/TransitionController';

export type Route = 'main' | 'concept' | 'contacts';

function routeFromHash(): Route {
  if (location.hash === '#concept') return 'concept';
  if (location.hash === '#contacts') return 'contacts';
  return 'main';
}

export class Router {
  private transition: TransitionController;
  current: Route;

  constructor(
    private main: MainScreen,
    private concept: ConceptScreen,
    private contacts: ContactsScreen,
  ) {
    this.transition = new TransitionController(main);
    this.current = routeFromHash();

    main.onNavigate = (to) => this.navigate(to);
    concept.onNavigate = (to) => this.navigate(to);
    contacts.onNavigate = (to) => this.navigate(to);
    addEventListener('popstate', () => {
      const target = routeFromHash();
      if (target !== this.current) this.navigate(target, false);
    });
  }

  private stopAllBut(keep: Route) {
    if (keep !== 'main') this.main.stop();
    if (keep !== 'concept') this.concept.stop();
    if (keep !== 'contacts') this.contacts.stop();
  }

  private startScreen(to: Route) {
    if (to === 'concept') {
      // prime one frame so the reveal is never blank
      this.concept.primeFrame();
      this.concept.start();
    } else if (to === 'contacts') {
      this.contacts.start();
    } else {
      this.main.start();
    }
  }

  showInitial() {
    this.stopAllBut(this.current);
    this.startScreen(this.current);
  }

  async navigate(to: Route, push = true) {
    if (to === this.current || this.transition.busy) return;
    const from = this.current;
    this.current = to;
    if (push) {
      history.pushState(
        { screen: to },
        '',
        to === 'main' ? location.pathname + location.search : `#${to}`,
      );
    }

    const swap = () => {
      this.stopAllBut(to);
      this.startScreen(to);
    };

    // The fly-into-the-light transition converges MainScreen's OWN renderer
    // (TransitionController is constructed from it), so it only has meaning
    // when the main screen is one endpoint. «Контакты» is a temporary showcase
    // page and deliberately stays out of it — it cuts.
    if (from === 'contacts' || to === 'contacts') {
      swap();
      return;
    }

    await this.transition.play(to === 'concept' ? 'toConcept' : 'toMain', swap);
  }
}
