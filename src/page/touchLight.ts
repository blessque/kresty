import { SmoothPointer } from '../shared/pointer';

/**
 * The light's cursor on a phone (round 34) — «Музей» and «О Крестах».
 *
 * On a desktop the cursor IS the input: it hovers, so the light leans toward it
 * all the time. On a phone there is no hover, and on a page that scrolls the
 * browser takes the touch for the pan (`touch-action: pan-y`), so `pointermove`
 * reports only where each scroll began. Fed to the light, that was the harsh
 * motion the user reported: the light lurched toward each new touch, swung
 * there over a second and parked. And «О Крестах» started from `(−9999, −9999)`
 * before the first touch, which shoved the light ~720 px off its icon.
 *
 * So a phone gets the two things a hand actually does to it here:
 *
 *   TILT   — `SmoothPointer`'s gyro, the main screen's own input, with touch
 *            positions ignored. The grip at the first reading is neutral.
 *   SCROLL — the page's velocity is a gust. A flick pushes the virtual cursor
 *            along the content's motion and the light leans after it; when the
 *            page settles the gust dies and the light drifts back.
 *
 * With neither, the cursor rests at the frame's centre, which is what the
 * shader's lean and parallax treat as "no input".
 *
 * Both go through ONE ease with the main screen's tau, so a phone and a desktop
 * have the same weight — the light follows, it never snaps.
 */

/** a touch-primary device: no hover, a coarse pointer. Hybrids with a mouse keep the cursor */
export const TOUCH_LIGHT = matchMedia('(hover: none) and (pointer: coarse)');

/** scroll speed, px/s, at which the gust is full — a brisk flick, not a fling */
const GUST_FULL = 2200;
/** how far a full gust moves the cursor, in viewport heights. Halved in 34.2
 *  (0.34 → 0.17) with «Музей»'s bounce: the lean and its return were too big */
const GUST_REACH = 0.17;
/** the gust's own rise and fall, s — short, so one slow frame is not a gust */
const GUST_TAU = 0.12;
/** the cursor's ease, s — `SmoothPointer.tau`; the gyro gets 0.7 of it, as on main */
const TAU = 0.4;

export class TouchLightInput {
  private hand = new SmoothPointer({ ignoreTouch: true });
  private lastTop: number | null = null;
  private ptr: [number, number] | null = null;
  /** the current gust, −1…1: + while the page scrolls down */
  private gust = 0;

  attach() {
    this.hand.attach();
  }

  detach() {
    this.hand.detach();
    this.lastTop = null;
    this.ptr = null;
    this.gust = 0;
  }

  /**
   * Once per frame. Returns the eased virtual cursor in viewport px. `viewW` /
   * `viewH` are the scroller's box, the frame the light is drawn against.
   */
  update(dtMs: number, scrollTop: number, viewW: number, viewH: number): [number, number] {
    const dt = Math.min(dtMs, 50) / 1000;
    const v = this.lastTop === null || dt <= 0 ? 0 : (scrollTop - this.lastTop) / dt;
    this.lastTop = scrollTop;
    if (dt > 0) {
      const target = Math.max(-1, Math.min(1, v / GUST_FULL));
      this.gust += (target - this.gust) * (1 - Math.exp(-dt / GUST_TAU));
    }

    const h = this.hand;
    const tilt = h.tilting;
    // the gyro's offset from ITS centre, re-centred on this frame's centre
    const tx = viewW / 2 + (tilt ? h.raw.x - innerWidth / 2 : 0);
    // scrolling down moves the content UP, and the air goes with it
    const ty = viewH / 2 + (tilt ? h.raw.y - innerHeight / 2 : 0) - this.gust * GUST_REACH * viewH;

    if (!this.ptr || dt <= 0) return (this.ptr = [tx, ty]);
    const k = 1 - Math.exp(-dt / (tilt ? TAU * 0.7 : TAU));
    this.ptr = [this.ptr[0] + (tx - this.ptr[0]) * k, this.ptr[1] + (ty - this.ptr[1]) * k];
    return this.ptr;
  }
}
