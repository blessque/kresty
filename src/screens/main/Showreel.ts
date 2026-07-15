import { SHOWREEL_IMAGES } from './layout';
import { IdleWatcher } from '../../shared/idle';

/**
 * After ~4s idle the flat blue crossfades into a photo slideshow beneath
 * the ray canvas. Any interaction fades back to blue. `mix` (0..1) is read
 * by the shader each frame to slightly dim the light over photos.
 */
export class Showreel {
  mix = 0;
  private root: HTMLElement;
  private imgs: HTMLImageElement[] = [];
  private current = 0;
  private cycleTimer: number | undefined;
  private idle: IdleWatcher;
  private active = false;
  private raf = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'showreel';
    container.appendChild(this.root);
    this.idle = new IdleWatcher(4200, () => this.activate(), () => this.deactivate());
  }

  attach() {
    this.idle.attach();
  }

  detach() {
    this.idle.detach();
    this.deactivate();
  }

  private ensureImages() {
    if (this.imgs.length) return;
    for (const src of SHOWREEL_IMAGES) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      this.root.appendChild(img);
      this.imgs.push(img);
    }
  }

  private activate() {
    this.ensureImages();
    this.active = true;
    this.root.classList.add('active');
    this.imgs.forEach((im, i) => im.classList.toggle('visible', i === this.current));
    this.cycleTimer = window.setInterval(() => {
      const prev = this.current;
      this.current = (this.current + 1) % this.imgs.length;
      this.imgs[prev].classList.remove('visible');
      this.imgs[this.current].classList.add('visible');
    }, 4000);
    this.animateMix(1);
  }

  private deactivate() {
    this.active = false;
    this.root.classList.remove('active');
    clearInterval(this.cycleTimer);
    this.animateMix(0);
  }

  private animateMix(target: number) {
    cancelAnimationFrame(this.raf);
    const step = () => {
      this.mix += (target - this.mix) * 0.06;
      if (Math.abs(this.mix - target) > 0.005) this.raf = requestAnimationFrame(step);
      else this.mix = target;
    };
    this.raf = requestAnimationFrame(step);
  }
}
