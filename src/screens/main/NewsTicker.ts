import { NEWS_ITEMS } from './layout';
import { bindShortWords } from '../../shared/ruTypography';

const CYCLE_MS = 10_000;
const FADE_MS = 420;

/**
 * Bottom-left news block (Figma node 338:48): headline · «Все новости».
 *
 * Round 8 added a date row above the headline and round 18 removed it again —
 * see NEWS_ITEMS. Two rows now, and one thing that fades.
 */
export class NewsTicker {
  private textEl: HTMLElement;
  private index = 0;
  private timer: number | undefined;
  private swap: number | undefined;

  constructor(container: HTMLElement) {
    container.innerHTML = `
      <p class="headline"></p>
      <a href="#" onclick="return false">Все новости</a>
    `;
    this.textEl = container.querySelector('.headline')!;
    this.render();
  }

  /** `bindShortWords` keeps «по демонтажу» / «для начала» whole across a break */
  private render() {
    this.textEl.textContent = bindShortWords(NEWS_ITEMS[this.index].text);
  }

  start() {
    this.stop();
    this.timer = window.setInterval(() => {
      this.textEl.classList.add('fading');
      this.swap = window.setTimeout(() => {
        this.index = (this.index + 1) % NEWS_ITEMS.length;
        this.render();
        this.textEl.classList.remove('fading');
      }, FADE_MS);
    }, CYCLE_MS);
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.swap);
  }
}
