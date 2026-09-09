import { DAWN_MID, MAIN_BG } from './seamColors';
import type { ColorStop } from './pageBackground';

/**
 * The scroll handoff into the real main screen.
 *
 * There is NO footer and no copy of the main block. The reader simply keeps
 * scrolling and arrives on `#screen-main` without being able to tell where one
 * page ended and the next began — which is better than a 1:1 copy on every
 * count: there is only ever one main block (the real one), the page gains no
 * second ray-field canvas, and the same pattern serves every other page.
 *
 * WHY THE SEAM IS UNDETECTABLE RATHER THAN MERELY SMOOTH
 * -----------------------------------------------------
 * `#screen-main`'s resting field is flat `#56b7e6` and nothing else — the
 * showreel and the hover scene both sit at opacity 0, and only `.stage` and
 * `.corners` would show. Meanwhile `slitLight()` returns
 * `core·coreIntensity + bloom·bloom + rays·godrays`, all multiplied by `life`,
 * and everything downstream of it in `main()` is multiplicative EXCEPT two
 * additive terms: `col += (g − 0.5)·u_grain` (and «Сияние» ships `grain: 0.06`)
 * and the ±1/255 anti-banding dither.
 *
 * So a main screen at `reveal 0` — intensities AND grain zeroed — writes
 * exactly `vec3(0)`, which under `mix-blend-mode: screen` leaves the page its
 * own flat blue. If this page's last painted frame is also that blue, ZERO
 * pixels change at the swap. The residue is the dither, which is sub-LSB after
 * the blend and is the same residual round 16.1 already measured and accepted.
 *
 * The light then blooms open out of nothing — see TransitionController's
 * 'seam' style, which is swap-then-emerge, not converge-then-release. There is
 * nothing to converge FROM here.
 */

/**
 * Height of the handoff zone, in viewports. Empty — no background of its own,
 * because `.page-bg` stays the single source of the page colour (round 16's
 * `.res-gap` comment records the bug that rule prevents: a hard-coded colour
 * sits as an unfading band across the crossfade running underneath it).
 *
 * The 3.5 is a budget, not padding. Measured from the zone's top `Ht`:
 *   1.0   the form's last line clears the top of the frame BEFORE the colour
 *         starts moving — white-on-dark copy must not sit on a field that is
 *         turning sky blue
 *   1.4   the dawn: two stops, back to back (see pageSections.DAWN_MID)
 *   0.6   the settle — pure, unmoving blue, so the eye has already accepted the
 *         flat field before the swap
 *   0.5   bounce clearance below the fire line
 */
export const HANDOFF_VH = 3.5;

/** where the swap fires, in viewports from the zone's top */
export const FIRE_VH = 2.0;

/**
 * Hysteresis, in viewports: how far back up the reader must scroll before the
 * trigger can arm again. Also where a return from the main screen lands, which
 * is why it is one number — the two are the same guard from opposite sides.
 */
const REARM_VH = 0.35;

export class MainHandoff {
  readonly el = document.createElement('div');

  private armed = false;
  private fired = false;
  private vh = HANDOFF_VH;
  private fireVh = FIRE_VH;

  /** fires once when the reader crosses the line on a pure blue field */
  onCross: () => void = () => {};

  constructor(scroller: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.vh = clampNum(q.get('ho'), HANDOFF_VH, 1, 10);
    this.fireVh = clampNum(q.get('fire'), FIRE_VH, 0.5, this.vh - 0.5);
    this.el.className = 'main-handoff';
    this.el.style.setProperty('--handoff-vh', String(this.vh));
    scroller.appendChild(this.el);
  }

  get top(): number {
    return this.el.offsetTop;
  }

  /** the two stops that carry the page from the form's dark into main's blue */
  stops(viewH: number): ColorStop[] {
    const t = this.top;
    return [
      { top: t + 0.6 * viewH, color: DAWN_MID },
      { top: t + 1.4 * viewH, color: MAIN_BG },
    ];
  }

  /** where a return from the main screen should land: past the dawn, disarmed */
  restoreTop(viewH: number): number {
    return this.top + (this.fireVh - REARM_VH - 0.05) * viewH;
  }

  /**
   * Decide whether to hand off. MUST be called AFTER the colour track has been
   * computed and applied, in the same task.
   *
   * THE ORDERING IS LOAD-BEARING. Reversed, a hard flick that jumps from
   * mid-band to past the line paints one frame of the intermediate colour and
   * then main's blue — and that is the only way this seam can flash. It is an
   * ordering bug, not a timing one, which is why `bgPure` is also required
   * rather than trusted to follow from the scroll position: it makes the flick
   * case safe by construction instead of by arithmetic.
   *
   * The fire line is an INTERIOR position, not the scroller's end.
   * `scrollTop + clientHeight >= scrollHeight` is unreliable at fractional
   * device pixel ratios and is exactly where rubber-banding lives; an inset
   * line has neither problem, and it means the true bottom is never reached
   * before the swap — so the macOS rubber band can never be seen here.
   */
  update(scrollTop: number, viewH: number, bgPure: boolean, busy: boolean) {
    const fireAt = this.top + this.fireVh * viewH;
    if (scrollTop < fireAt - REARM_VH * viewH) {
      this.armed = true;
      this.fired = false;
    }
    if (!this.armed || this.fired || busy || !bgPure) return;
    if (scrollTop >= fireAt) {
      this.fired = true;
      this.armed = false;
      this.onCross();
    }
  }

  /** cleared when the reader comes back, so the trigger can run again */
  reset() {
    this.armed = false;
    this.fired = false;
  }
}

function clampNum(raw: string | null, dflt: number, lo: number, hi: number): number {
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}
