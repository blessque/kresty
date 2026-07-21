/**
 * Tracks the raw pointer in CSS pixels and exposes an exponentially
 * smoothed position (the shader consumes the smoothed one so dust
 * disturbance feels like inertia, not a hard cursor follow).
 *
 * On touch devices without a hovering cursor the device gyroscope plays the
 * cameraman instead: tilting the phone offsets a virtual pointer from the
 * screen center through the same smoothing pipeline. Best-effort — iOS 13+
 * permission is requested on the first touch; silently skipped elsewhere.
 */
export class SmoothPointer {
  raw = { x: innerWidth / 2, y: innerHeight / 2 };
  smooth = { x: innerWidth / 2, y: innerHeight / 2 };
  /** smoothing time constant, seconds */
  tau = 0.4;
  private gyroBase: { beta: number; gamma: number } | null = null;
  private gyroActive = false;

  private onMove = (e: PointerEvent) => {
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

  private onFirstTouch = () => {
    removeEventListener('touchstart', this.onFirstTouch);
    type PermissionRequester = { requestPermission?: () => Promise<string> };
    const doe = DeviceOrientationEvent as unknown as PermissionRequester;
    if (typeof doe.requestPermission === 'function') {
      doe
        .requestPermission()
        .then((res) => {
          if (res === 'granted') addEventListener('deviceorientation', this.onOrientation);
        })
        .catch(() => {});
    } else {
      addEventListener('deviceorientation', this.onOrientation);
    }
  };

  attach() {
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onMove, { passive: true });
    if ('ontouchstart' in window && typeof DeviceOrientationEvent !== 'undefined') {
      addEventListener('touchstart', this.onFirstTouch, { passive: true });
    }
  }

  detach() {
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onMove);
    removeEventListener('touchstart', this.onFirstTouch);
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
