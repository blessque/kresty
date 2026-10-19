/**
 * The living haze's noise (round 33): a seamlessly tiling value-noise FBM, R8,
 * with a box mip chain — built once per renderer, ~5 ms.
 *
 * Same construction as the river's `screens/concept/rippleTexture.ts` (which
 * cannot be shared: it imports three, and `gpu/` must stay portable): lattice
 * indices taken modulo each octave's grid so the right edge interpolates back
 * into the left, a fixed-seed LCG so every reload is byte-identical (a probe
 * diff stays meaningful), and a 1st/99th-percentile stretch — a min/max stretch
 * of an FBM is decided by single-texel outliers and leaves the bulk grey.
 *
 * Coarse on purpose (features at 1/4, 1/8, 1/16 of the tile): the haze is air
 * density, not dust. Its anti-tiling and anti-scrolling come from HOW it is read
 * (two incommensurate scales, opposed drifts, a warp — see `hazeDensity`), not
 * from this texture.
 */
export const HAZE_SIZE = 256;

export function hazeNoise(): Uint8Array<ArrayBuffer>[] {
  const n = HAZE_SIZE;
  let seed = 0x2f6b9d;
  const lcg = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const field = new Float32Array(n * n);
  let amp = 1;
  for (const grid of [4, 8, 16]) {
    const lat = Float32Array.from({ length: grid * grid }, lcg);
    const cell = n / grid;
    for (let y = 0; y < n; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < n; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const at = (i: number, j: number) => lat[(j % grid) * grid + (i % grid)];
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        field[y * n + x] += amp * (top + (bot - top) * sy);
      }
    }
    amp *= 0.5;
  }
  const sorted = Float32Array.from(field).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)];
  const hi = sorted[Math.floor(sorted.length * 0.99)];
  const level0 = new Uint8Array(n * n);
  for (let i = 0; i < field.length; i++) {
    level0[i] = Math.round(255 * Math.min(1, Math.max(0, (field[i] - lo) / (hi - lo || 1))));
  }
  const levels = [level0];
  let prev = level0;
  for (let m = n >> 1; m >= 1; m >>= 1) {
    const next = new Uint8Array(m * m);
    const w = m * 2;
    for (let y = 0; y < m; y++) {
      for (let x = 0; x < m; x++) {
        const i = 2 * y * w + 2 * x;
        next[y * m + x] = (prev[i] + prev[i + 1] + prev[i + w] + prev[i + w + 1] + 2) >> 2;
      }
    }
    levels.push(next);
    prev = next;
  }
  return levels;
}
