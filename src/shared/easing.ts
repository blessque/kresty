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
