import { NEWS_HEADLINES } from './layout';

export class NewsTicker {
  private el: HTMLElement;
  private index = 0;
  private timer: number | undefined;

  constructor(container: HTMLElement) {
    container.innerHTML = `
      <p class="headline">${NEWS_HEADLINES[0]}</p>
      <a href="#" onclick="return false">Все новости</a>
    `;
    this.el = container.querySelector('.headline')!;
  }

  start() {
    this.stop();
    this.timer = window.setInterval(() => {
      this.el.classList.add('fading');
      setTimeout(() => {
        this.index = (this.index + 1) % NEWS_HEADLINES.length;
        this.el.textContent = NEWS_HEADLINES[this.index];
        this.el.classList.remove('fading');
      }, 420);
    }, 10_000);
  }

  stop() {
    clearInterval(this.timer);
  }
}
