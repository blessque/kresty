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
 * THE SAME BUDGET FOR A PAGE THAT IS ALREADY LIGHT (round 27).
 *
 * `DAWN_MID` exists to bridge «О Крестах»'s ~7 % lightness contact form to a
 * 62 % brand blue — travel no single band can cross without turning to mush.
 * The four content pages end WHITE, and there the same mid-tone is a dip down
 * into a dark blue and back up again: the reader watches the page get darker on
 * the way to a lighter colour. The client reported exactly that.
 *
 * So the dawn is not removed, it is CONDITIONAL — kept where its reasoning
 * holds, dropped where it never did.
 *
 * THE FIRE LINE MUST BE REACHABLE, AND THAT IS ARITHMETIC, NOT TASTE.
 * The zone is `HANDOFF_VH` viewports tall and the last one of them is the window
 * itself, so the furthest `scrollTop` a reader can ever reach is
 * `top + (HANDOFF_VH − 1.0) · viewH`. The line has to sit below that with room
 * to spare, which is what the dark path's "0.5 bounce clearance" has always
 * meant: 3.5 − 1.0 − 2.0 = 0.5.
 *
 * Round 27 shipped this wrong. A 2.4-viewport zone with the line at 1.7 puts it
 * 0.3 viewports past the end of the scroll: the colour still ramped to blue and
 * the swap simply never fired, leaving the reader stuck on a flat blue page with
 * scrolling that did nothing. `MIN_TAIL_VH` below makes that unexpressible, and
 * a colour check cannot catch it — only scrolling to the actual bottom can.
 *
 * The light budget, measured from the zone's top:
 *   0.8   the single stop, white straight into blue
 *   0.3   half a band (BAND_VH / 2) — the field is pure from 1.1
 *   0.4   the settle
 *   ————  the fire line at 1.5
 *   1.5   the window (1.0) plus bounce clearance (0.5)
 *   3.0   total
 */
export const LIGHT_HANDOFF_VH = 3.0;
export const LIGHT_FIRE_VH = 1.5;

/**
 * Scroll that must remain BELOW the fire line: one viewport (the window itself,
 * which is never scrollable past) plus 0.5 of bounce clearance. `fireVh` is
 * clamped to `vh − MIN_TAIL_VH`, so neither a default nor a `?fire=` override
 * can put the line somewhere the reader cannot go.
 */
const MIN_TAIL_VH = 1.5;

/**
 * Below this relative luminance a page counts as dark and keeps the dawn.
 * The two real inputs sit nowhere near it — `#050b1d` is 0.006 and `#ffffff` is
 * 1.0 — so this is a classifier with a canyon down the middle, not a dial.
 */
const DARK_MAX_L = 0.2;

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
  /** does the page this zone follows end dark? defaults true — the old behaviour */
  private dark = true;
  private readonly hoRaw: string | null;
  private readonly fireRaw: string | null;

  /** fires once when the reader crosses the line on a pure blue field */
  onCross: () => void = () => {};

  constructor(scroller: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.hoRaw = q.get('ho');
    this.fireRaw = q.get('fire');
    this.el.className = 'main-handoff';
    this.applyBudget();
    scroller.appendChild(this.el);
  }

  get top(): number {
    return this.el.offsetTop;
  }

  /**
   * Tell the zone what colour it is leaving. Called before `stops()` — the
   * incoming colour decides both the ramp's shape and the zone's height, and
   * the height has to reach the DOM before anything measures `offsetTop`.
   */
  setFrom(color: string) {
    const dark = luminance(color) < DARK_MAX_L;
    if (dark === this.dark) return;
    this.dark = dark;
    this.applyBudget();
  }

  private applyBudget() {
    const baseVh = this.dark ? HANDOFF_VH : LIGHT_HANDOFF_VH;
    const baseFire = this.dark ? FIRE_VH : LIGHT_FIRE_VH;
    this.vh = clampNum(this.hoRaw, baseVh, 1, 10);
    // the upper bound is the REACHABILITY invariant, not a safety margin: above
    // it the line sits past the end of the scroll and the seam silently dies
    this.fireVh = clampNum(this.fireRaw, baseFire, 0.5, this.vh - MIN_TAIL_VH);
    if (import.meta.env.DEV && baseFire > this.vh - MIN_TAIL_VH) {
      console.error(
        `mainHandoff: fire line ${baseFire} is unreachable in a ${this.vh}-viewport zone ` +
          `(max ${this.vh - MIN_TAIL_VH}) — clamped. The seam would never fire.`,
      );
    }
    this.el.style.setProperty('--handoff-vh', String(this.vh));
  }

  /**
   * The stops that carry the page into main's blue: two through the dawn from a
   * dark page, ONE straight across from a light one.
   */
  stops(viewH: number, from?: string): ColorStop[] {
    if (from !== undefined) this.setFrom(from);
    const t = this.top;
    return this.dark
      ? [
          { top: t + 0.6 * viewH, color: DAWN_MID },
          { top: t + 1.4 * viewH, color: MAIN_BG },
        ]
      : [{ top: t + 0.8 * viewH, color: MAIN_BG }];
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

/**
 * WCAG relative luminance of a `#rgb`/`#rrggbb` string. Perceptual rather than a
 * channel average, because the question being asked is "does this read as dark",
 * and the gamma ramp is most of the answer at the dark end.
 */
function luminance(hex: string): number {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  if (full.length < 6) return 0;
  const ch = (i: number) => {
    const s = parseInt(full.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}
