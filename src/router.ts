import type { MainScreen } from './screens/main/MainScreen';
import type { ConceptScreen } from './screens/concept/ConceptScreen';
import { TransitionController } from './screens/transition/TransitionController';

export type Route = 'main' | 'concept';

export class Router {
  private transition: TransitionController;
  current: Route;

  constructor(
    private main: MainScreen,
    private concept: ConceptScreen,
  ) {
    this.transition = new TransitionController(main);
    this.current = location.hash === '#concept' ? 'concept' : 'main';

    main.onNavigate = (to) => this.navigate(to);
    concept.onNavigate = (to) => this.navigate(to);
    addEventListener('popstate', () => {
      const target: Route = location.hash === '#concept' ? 'concept' : 'main';
      if (target !== this.current) this.navigate(target, false);
    });
  }

  showInitial() {
    if (this.current === 'concept') {
      this.main.stop();
      this.concept.start();
    } else {
      this.concept.stop();
      this.main.start();
    }
  }

  async navigate(to: Route, push = true) {
    if (to === this.current || this.transition.busy) return;
    const from = this.current;
    this.current = to;
    if (push) {
      history.pushState({ screen: to }, '', to === 'concept' ? '#concept' : location.pathname + location.search);
    }

    const swap = () => {
      if (to === 'concept') {
        // prime one frame so the reveal is never blank
        this.concept.primeFrame();
        this.main.stop();
        this.concept.start();
      } else {
        this.concept.stop();
        this.main.start();
      }
    };

    await this.transition.play(to === 'concept' ? 'toConcept' : 'toMain', swap);
    void from;
  }
}
