import { NEWS_ITEMS } from './layout';
import { bindShortWords } from '../../shared/ruTypography';

const CYCLE_MS = 10_000;
const FADE_MS = 420;

/**
 * Bottom-left news block (Figma node 338:48): date · headline · «Все новости».
 * Round 8 added the date row — it fades and swaps together with its headline so
 * the pair is never mismatched mid-transition.
 */
export class NewsTicker {
  private dateEl: HTMLElement;
  private textEl: HTMLElement;
  private index = 0;
  private timer: number | undefined;
  private swap: number | undefined;

  constructor(container: HTMLElement) {
    container.innerHTML = `
      <p class="news-date"></p>
      <p class="headline"></p>
      <a href="#" onclick="return false">Все новости</a>
    `;
    this.dateEl = container.querySelector('.news-date')!;
    this.textEl = container.querySelector('.headline')!;
    this.render();
  }

  /**
   * `bindShortWords` on both rows: it keeps «по демонтажу» / «для начала» whole,
   * and on the date it keeps the day with its month («1 ноября» never splits).
   */
  private render() {
    const item = NEWS_ITEMS[this.index];
    this.dateEl.textContent = bindShortWords(item.date);
    this.textEl.textContent = bindShortWords(item.text);
  }

  start() {
    this.stop();
    this.timer = window.setInterval(() => {
      this.dateEl.classList.add('fading');
      this.textEl.classList.add('fading');
      this.swap = window.setTimeout(() => {
        this.index = (this.index + 1) % NEWS_ITEMS.length;
        this.render();
        this.dateEl.classList.remove('fading');
        this.textEl.classList.remove('fading');
      }, FADE_MS);
    }, CYCLE_MS);
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.swap);
  }
}
