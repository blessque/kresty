import type { MainScreen } from '../main/MainScreen';
import { clamp01, easeInOutCubic } from '../../shared/easing';

/**
 * "Flying into the light": the main screen's own ray renderer converges
 * (beams narrow, core blows out), a white flash guarantees a fully opaque
 * moment where the screen swap happens, then the light releases over the
 * destination. ~700ms total.
 */
export class TransitionController {
  busy = false;
  private flash = document.getElementById('white-flash')!;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private main: MainScreen) {}

  play(direction: 'toConcept' | 'toMain', swap: () => void): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true;

    if (this.reduced.matches) {
      return new Promise((resolve) => {
        this.flash.style.transition = 'opacity 150ms ease';
        this.flash.style.opacity = '0.5';
        setTimeout(() => {
          swap();
          this.flash.style.opacity = '0';
          setTimeout(() => {
            this.busy = false;
            resolve();
          }, 160);
        }, 150);
      });
    }

    const D = 720;
    const flashPeakT = 0.46; // swap moment
    let swapped = false;
    const start = performance.now();

    return new Promise((resolve) => {
      const frame = (now: number) => {
        const t = clamp01((now - start) / D);

        // converge phase 0→0.38, release 0.53→1
        let conv: number;
        if (t < 0.38) conv = easeInOutCubic(t / 0.38);
        else if (t < 0.53) conv = 1;
        else conv = 1 - easeInOutCubic((t - 0.53) / 0.47);

        // flash bell around the swap
        const f = Math.exp(-Math.pow((t - flashPeakT) / 0.13, 2));
        this.flash.style.transition = 'none';
        this.flash.style.opacity = String(0.92 * f);

        if (direction === 'toConcept') {
          // before swap the main screen is live and converging;
          // after swap it is hidden — stop driving it
          if (!swapped) {
            this.main.converge = conv;
            this.main.setStageDim(conv);
          }
        } else {
          // toMain: after the swap the main screen is live, starting
          // converged and releasing
          if (swapped) {
            this.main.converge = conv;
            this.main.setStageDim(conv);
          }
        }

        if (!swapped && t >= flashPeakT) {
          swapped = true;
          swap();
          if (direction === 'toMain') {
            this.main.converge = 1;
            this.main.setStageDim(1);
          }
        }

        if (t < 1) requestAnimationFrame(frame);
        else {
          this.main.converge = 0;
          this.main.setStageDim(0);
          this.flash.style.opacity = '0';
          this.busy = false;
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }
}
