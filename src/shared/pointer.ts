/**
 * Tracks the raw pointer in CSS pixels and exposes an exponentially
 * smoothed position (the shader consumes the smoothed one so dust
 * disturbance feels like inertia, not a hard cursor follow).
 *
 * On touch devices without a hovering cursor the device gyroscope plays the
 * cameraman instead: tilting the phone offsets a virtual pointer from the
 * screen center through the same smoothing pipeline. Best-effort — iOS 13+
 * permission is requested on the first TAP; silently skipped elsewhere.
 *
 * ROUND 34: THE REQUEST MOVED FROM `touchstart` TO `touchend`/`click`. WebKit
 * does not count a touchstart as a user gesture, so `requestPermission()`
 * rejected there, the `.catch` swallowed it, and the gyro most likely never ran
 * on an iPhone at all — while desktop Chrome, which has no orientation sensor,
 * could not show the difference. A touchend that ENDS A SCROLL is not a gesture
 * either, so a rejection keeps listening and the next tap asks again; only an
 * answer stops it. Once granted, the grant is shared by every instance (main,
 * «Музей», «О Крестах»), because it belongs to the page, not to a screen.
 */

/** iOS granted orientation access this page session — every instance may listen */
let orientationGranted = false;

export class SmoothPointer {
  raw = { x: innerWidth / 2, y: innerHeight / 2 };
  smooth = { x: innerWidth / 2, y: innerHeight / 2 };
  /** smoothing time constant, seconds */
  tau = 0.4;
  private gyroBase: { beta: number; gamma: number } | null = null;
  private gyroActive = false;
  private asking = false;

  /**
   * `ignoreTouch` (round 34, «Музей» and «О Крестах»): a finger's position is not
   * a cursor. On a page that scrolls, `pointermove` fires only until the browser
   * takes the pan, so the light would lurch to wherever each scroll began and
   * stay there. Those pages take the hand (the gyro) and the scroll instead.
   * Main keeps the default: its screen does not scroll, and a drag there is one.
   */
  constructor(private opts: { ignoreTouch?: boolean } = {}) {}

  /** is the gyro driving `raw` right now (no real pointer has outranked it) */
  get tilting(): boolean {
    return this.gyroActive;
  }

  private onMove = (e: PointerEvent) => {
    if (this.opts.ignoreTouch && e.pointerType === 'touch') return;
    // a real pointer always outranks the gyro
    this.gyroActive = false;
    this.raw.x = e.clientX;
    this.raw.y = e.clientY;
  };

  private onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    // center on the first reading so any resting grip is the neutral pose
    if (!this.gyroBase) this.gyroBase = { beta: e.beta, gamma: e.gamma };
    const db = Math.max(-25, Math.min(25, e.beta - this.gyroBase.beta));
    const dg = Math.max(-25, Math.min(25, e.gamma - this.gyroBase.gamma));
    this.gyroActive = true;
    this.raw.x = innerWidth / 2 + (dg / 25) * innerWidth * 0.45;
    this.raw.y = innerHeight / 2 + (db / 25) * innerHeight * 0.45;
  };

  private onTap = () => {
    if (this.asking) return;
    type PermissionRequester = { requestPermission?: () => Promise<string> };
    const doe = DeviceOrientationEvent as unknown as PermissionRequester;
    if (typeof doe.requestPermission !== 'function') return;
    this.asking = true;
    doe
      .requestPermission()
      .then((res) => {
        this.stopAsking();
        if (res !== 'granted') return;
        orientationGranted = true;
        addEventListener('deviceorientation', this.onOrientation);
      })
      // not a gesture (a touchend that ended a scroll) — the next tap asks again
      .catch(() => {})
      .finally(() => (this.asking = false));
  };

  private stopAsking() {
    removeEventListener('touchend', this.onTap);
    removeEventListener('click', this.onTap);
  }

  attach() {
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onMove, { passive: true });
    if ('ontouchstart' in window && typeof DeviceOrientationEvent !== 'undefined') {
      const doe = DeviceOrientationEvent as unknown as { requestPermission?: unknown };
      if (typeof doe.requestPermission !== 'function' || orientationGranted) {
        // Android, or iOS already said yes this session: no gesture needed
        addEventListener('deviceorientation', this.onOrientation);
      } else {
        addEventListener('touchend', this.onTap, { passive: true });
        addEventListener('click', this.onTap);
      }
    }
  }

  detach() {
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onMove);
    this.stopAsking();
    removeEventListener('deviceorientation', this.onOrientation);
    this.gyroBase = null;
    this.gyroActive = false;
  }

  update(dt: number) {
    // gyro drives with a slightly quicker hand than a mouse
    const tau = this.gyroActive ? this.tau * 0.7 : this.tau;
    const k = 1 - Math.exp(-dt / tau);
    this.smooth.x += (this.raw.x - this.smooth.x) * k;
    this.smooth.y += (this.raw.y - this.smooth.y) * k;
  }
}
