import { SHOWREEL_IMAGES } from './layout';
import { IdleWatcher } from '../../shared/idle';

/**
 * After ~4s idle the flat blue crossfades into a photo slideshow beneath
 * the ray canvas. Any interaction fades back to blue. `mix` (0..1) is read
 * by the shader each frame to slightly dim the light over photos.
 *
 * Once the photos have been up for a moment, a dark veil eases in over them
 * (`dark`, 0..1) — this is what flips the light into its dusty amber register
 * (u_modeMix). White/holographic light exists only over the flat blue.
 */
export class Showreel {
  mix = 0;
  /** 0..1 — delayed darkening of the photos; drives the dusty light mode */
  dark = 0;
  private root: HTMLElement;
  private veil: HTMLElement;
  private imgs: HTMLImageElement[] = [];
  private current = 0;
  private cycleTimer: number | undefined;
  private darkTimer: number | undefined;
  private idle: IdleWatcher;
  private active = false;
  private raf = 0;
  private darkRaf = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'showreel';
    container.appendChild(this.root);
    this.veil = document.createElement('div');
    this.veil.className = 'showreel-veil';
    this.root.appendChild(this.veil);
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
    // the photos hold for a beat, then the room goes dark → dusty light
    clearTimeout(this.darkTimer);
    this.darkTimer = window.setTimeout(() => this.animateDark(1), 1600);
  }

  private deactivate() {
    this.active = false;
    this.root.classList.remove('active');
    clearInterval(this.cycleTimer);
    clearTimeout(this.darkTimer);
    this.animateMix(0);
    this.animateDark(0);
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

  private animateDark(target: number) {
    cancelAnimationFrame(this.darkRaf);
    const step = () => {
      this.dark += (target - this.dark) * 0.045;
      this.veil.style.opacity = String(this.dark * 0.82);
      if (Math.abs(this.dark - target) > 0.005) this.darkRaf = requestAnimationFrame(step);
      else this.dark = target;
    };
    this.darkRaf = requestAnimationFrame(step);
  }
}
