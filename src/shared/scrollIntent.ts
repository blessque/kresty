/**
 * "The reader wants to go back up", on a screen that does not scroll.
 *
 * `html`, `body` and `.screen` are all `overflow: hidden`, so the main screen
 * has no scrollport and there is no scroll event to listen to. This turns raw
 * wheel and touch input into a single deliberate gesture.
 *
 * THE ARMING RULE IS THE ONE THAT MATTERS, and it is structural rather than
 * tuned: the accumulator cannot open until the wheel has been SILENT for
 * `QUIET_MS`. A macOS momentum tail is a continuous ≥60 Hz stream, so it
 * physically cannot open one — which means a reader who arrives here by
 * flicking downward cannot be bounced straight back by their own inertia. It
 * does not depend on picking a threshold that beats a decay curve.
 *
 * Everything else is belt and braces: a distance threshold rather than an
 * event, a cooldown covering the transition, and a reset on any sign flip.
 */

/** silence required before input counts at all, ms */
const QUIET_MS = 140;
/** accumulated upward wheel distance that fires, px */
const WHEEL_PX = 240;
/** finger travel that fires, px — a shorter throw, because touch is deliberate */
const TOUCH_PX = 90;
/** after firing, ignore everything for this long (≥ the 900ms seam) */
const COOLDOWN_MS = 800;

export class ScrollIntent {
  private acc = 0;
  private lastEvent = 0;
  private armed = false;
  private until = 0;
  private touchY: number | null = null;
  private attached = false;

  constructor(
    private el: HTMLElement,
    private onFire: () => void,
  ) {}

  attach() {
    if (this.attached) return;
    this.attached = true;
    this.reset();
    // passive: this never calls preventDefault — the page does not scroll, so
    // there is nothing to cancel, and a non-passive wheel listener would make
    // the browser wait on us before compositing
    this.el.addEventListener('wheel', this.onWheel, { passive: true });
    this.el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.el.addEventListener('touchmove', this.onTouchMove, { passive: true });
    this.el.addEventListener('touchend', this.onTouchEnd, { passive: true });
    this.el.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
    // A wheel gesture is not keyboard-reachable, and this is the only way this
    // navigation exists at all for a keyboard user.
    addEventListener('keydown', this.onKey);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('touchstart', this.onTouchStart);
    this.el.removeEventListener('touchmove', this.onTouchMove);
    this.el.removeEventListener('touchend', this.onTouchEnd);
    this.el.removeEventListener('touchcancel', this.onTouchEnd);
    removeEventListener('keydown', this.onKey);
  }

  /** call on entering the screen: disarmed, and in cooldown */
  reset() {
    this.acc = 0;
    this.armed = false;
    this.touchY = null;
    this.lastEvent = performance.now();
    this.until = performance.now() + COOLDOWN_MS;
  }

  private fire() {
    this.acc = 0;
    this.armed = false;
    this.until = performance.now() + COOLDOWN_MS;
    this.onFire();
  }

  private onWheel = (e: WheelEvent) => {
    const now = performance.now();
    if (now < this.until) {
      this.lastEvent = now;
      return;
    }
    // Silence opens the gesture; a continuous stream (momentum) never does.
    if (now - this.lastEvent > QUIET_MS) {
      this.armed = true;
      this.acc = 0;
    }
    this.lastEvent = now;
    if (!this.armed) return;

    // deltaMode NORMALISATION. Firefox on Windows reports LINES (mode 1), about
    // 3 per notch — without this the threshold needs ~80 notches and the
    // gesture reads as broken rather than as strict.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const dy = e.deltaY * unit;
    if (dy > 0) {
      this.acc = 0; // scrolling down: not this gesture
      return;
    }
    this.acc += -dy;
    if (this.acc >= WHEEL_PX) this.fire();
  };

  private onTouchStart = (e: TouchEvent) => {
    if (performance.now() < this.until) return;
    this.touchY = e.touches[0]?.clientY ?? null;
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.touchY === null || performance.now() < this.until) return;
    const y = e.touches[0]?.clientY ?? this.touchY;
    // the finger moving DOWN is the page moving up
    if (y - this.touchY >= TOUCH_PX) this.fire();
  };

  private onTouchEnd = () => {
    this.touchY = null;
  };

  private onKey = (e: KeyboardEvent) => {
    if (performance.now() < this.until) return;
    if (e.key === 'PageUp' || e.key === 'Home' || e.key === 'ArrowUp') this.fire();
  };
}
