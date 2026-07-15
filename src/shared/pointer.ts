/**
 * Tracks the raw pointer in CSS pixels and exposes an exponentially
 * smoothed position (the shader consumes the smoothed one so dust
 * disturbance feels like inertia, not a hard cursor follow).
 */
export class SmoothPointer {
  raw = { x: innerWidth / 2, y: innerHeight / 2 };
  smooth = { x: innerWidth / 2, y: innerHeight / 2 };
  /** smoothing time constant, seconds */
  tau = 0.4;
  private onMove = (e: PointerEvent) => {
    this.raw.x = e.clientX;
    this.raw.y = e.clientY;
  };

  attach() {
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onMove, { passive: true });
  }

  detach() {
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onMove);
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt / this.tau);
    this.smooth.x += (this.raw.x - this.smooth.x) * k;
    this.smooth.y += (this.raw.y - this.smooth.y) * k;
  }
}
