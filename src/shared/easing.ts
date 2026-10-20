export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** rAF-driven tween. Returns a cancel function. */
export function tween(
  durationMs: number,
  onFrame: (t: number) => void,
  onDone?: () => void,
): () => void {
  const start = performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = clamp01((now - start) / durationMs);
    onFrame(t);
    if (t < 1) raf = requestAnimationFrame(step);
    else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * A damped spring chasing a moving target (round 34) — for motion that should
 * carry WEIGHT rather than be geared to its input. `tween` above is fixed-length
 * and cannot be retargeted; this can, every frame. ζ < 1 overshoots slightly,
 * which is the weight; settle time is about 4 / (ζ·ω) seconds.
 *
 * Sub-stepped at 1/120 s so a long frame (a tab coming back, a GC pause) cannot
 * make it ring or diverge. The first call snaps to the target: arriving on a
 * page is not motion.
 */
export class Spring {
  value: number | null = null;
  private v = 0;

  constructor(
    private omega: number,
    private zeta: number,
  ) {}

  step(target: number, dtMs: number): number {
    if (this.value === null) return (this.value = target);
    let dt = Math.min(dtMs, 50) / 1000;
    let x = this.value;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 120);
      this.v += (-2 * this.zeta * this.omega * this.v - this.omega * this.omega * (x - target)) * h;
      x += this.v * h;
      dt -= h;
    }
    return (this.value = x);
  }

  reset() {
    this.value = null;
    this.v = 0;
  }
}
