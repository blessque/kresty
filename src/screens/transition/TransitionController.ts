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

  /**
   * `style` picks the punctuation, and the two are genuinely different events:
   *
   * - `'flash'` (default) is a CLICK. The white flash is deliberate — it marks
   *   that you went somewhere. Unchanged since round 7.
   * - `'seam'` is the reader SCROLLING off the bottom of «О Крестах» into the
   *   main screen. The whole point is that they cannot tell where one page
   *   ended and the next began, so a flash is exactly the wrong thing.
   *
   * The seam is also not converge-then-release: there is nothing to converge
   * FROM, because the concept page has no light on screen at that moment. It is
   * swap-then-EMERGE — the main screen arrives dark on its own flat blue (which
   * is what the concept page's last frame is showing too, so zero pixels
   * change), and the light then blooms open out of a point as `reveal` walks up
   * and `converge` walks down together. See mainHandoff.ts.
   */
  play(
    direction: 'toConcept' | 'toMain',
    swap: () => void,
    style: 'flash' | 'seam' = 'flash',
  ): Promise<void> {
    if (this.busy) return Promise.resolve();
    if (style === 'seam') return this.playSeam(direction, swap);
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

  /**
   * The seamless variant. Never touches `#white-flash`.
   *
   * `toMain`: the swap happens at t = 0, with the main screen already at
   * `reveal 0` — every light intensity AND `grain` multiplied to zero, so the
   * shader writes `vec3(0)` and `mix-blend-mode: screen` leaves the page its
   * own `#56b7e6`. That is the same colour the concept page's handoff zone has
   * settled on, which is what makes the swap invisible rather than merely
   * quick. Then the light emerges.
   *
   * `toConcept` is the mirror: the light collapses first, and the swap happens
   * once the main screen is dark — so the reader scrolls back up out of a flat
   * blue field into the same flat blue field.
   */
  private playSeam(direction: 'toConcept' | 'toMain', swap: () => void): Promise<void> {
    this.busy = true;
    const D = this.reduced.matches ? 200 : 900;
    const toMain = direction === 'toMain';

    if (toMain) {
      // dark BEFORE the swap, and primed, so the first painted frame is flat
      // blue rather than whatever the canvas last held
      this.main.beginReveal();
      swap();
      this.main.primeFrame();
    }

    const start = performance.now();
    return new Promise((resolve) => {
      let swapped = toMain;
      const frame = (now: number) => {
        const t = clamp01((now - start) / D);
        const e = easeInOutCubic(t);
        // reveal walks 0→1 while converge walks 1→0: the light blooms open out
        // of a point rather than fading up uniformly
        const k = toMain ? e : 1 - e;
        this.main.setReveal(k);
        this.main.converge = 1 - k;

        if (!swapped && k <= 0.001) {
          swapped = true;
          swap();
        }
        if (t < 1) requestAnimationFrame(frame);
        else {
          if (!swapped) swap();
          this.main.setReveal(toMain ? 1 : 0);
          this.main.converge = toMain ? 0 : 1;
          this.busy = false;
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }
}
