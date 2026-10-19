/**
 * The exact light's mask data (round 33), built once per mask from the canvas
 * `rasterizeMask` already returns. Matches `LightMaskData` in
 * `gpu/rayFieldTypes.ts` STRUCTURALLY — shared/ imports nothing internal, so the
 * type cannot be imported here; TypeScript checks the match where screens/ pass
 * one to the other.
 *
 * Three things, each replacing a source of noise or of drift:
 *
 * 1. **Bottom-up rows, uploaded by hand.** Both renderers used to upload the
 *    canvas Y-flipped (`UNPACK_FLIP_Y_WEBGL` / `flipY: true`). WebGPU's
 *    `writeTexture` cannot flip, so the flip happens here, once, for both — the
 *    texture holds exactly the bytes it always did and the twins get identical
 *    input. (That flip is also why every mask renders mirrored — an OPEN issue
 *    awaiting the designer; this keeps it exactly as it was.)
 * 2. **Gaussian mips.** The final pass reads the crisp core at the LOD the
 *    emblem is drawn at (no stair-stepped icon edges when 640 texels land in
 *    fewer device pixels), the polar pass band-limits the ray source to its own
 *    grid, and `penumbra` is just a LOD bias — all three need levels that are
 *    blurred, not boxed: a box mip magnified reads as a grid of diamonds.
 * 3. **The bloom, baked.** The old bloom was 24 taps of the 18 px channel on a
 *    spiral rotated by per-pixel jitter — an estimator, so a source of noise.
 *    Every tap's angle is uniform, so its EXPECTED kernel is a sum of 24
 *    gaussian-blurred rings, and a blurred ring has a closed form (the Rice
 *    density, I₀ below). That kernel is fitted by a non-negative sum of
 *    gaussians and applied once, here, at a quarter of the mask's resolution
 *    (the bloom is a 54–120-texel glow; nothing finer survives) in float, so its
 *    dark tail cannot band. The pixel then reads it with one fetch.
 */

export interface LightMaskBuild {
  size: number;
  levels: Uint8Array<ArrayBuffer>[];
  inkBox: [number, number, number, number];
  bloom: { size: number; pad: number; dissolve: number; halves: Uint16Array<ArrayBuffer> };
}

/** the old G channel's blur, mask texels — `rasterizeMask`'s `softBlur` default */
const SOFT_SIGMA = 18;
/** bloom bake resolution divisor and padded grid edge */
const BLOOM_DOWN = 4;
const BLOOM_GRID = 256;

export function buildLightMask(cv: HTMLCanvasElement, opts: { dissolve: number }): LightMaskBuild {
  const size = cv.width;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx || cv.height !== size) throw new Error('lightMask: square 2d canvas expected');
  const src = ctx.getImageData(0, 0, size, size).data;

  // 1. bottom-up rows: texture row 0 = canvas bottom, as the Y-flipped upload had it
  const level0 = new Uint8Array(size * size * 4);
  const row = size * 4;
  for (let y = 0; y < size; y++) level0.set(src.subarray((size - 1 - y) * row, (size - y) * row), y * row);

  return {
    size,
    levels: mipChain(level0, size),
    inkBox: inkBoxB(level0, size),
    bloom: bakeBloom(level0, size, opts.dissolve),
  };
}

// ── 2. gaussian mips ────────────────────────────────────────────────────────

/** [1 3 3 1]/8 per axis and decimate — a binomial, i.e. near-gaussian, pyramid */
function mipChain(level0: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer>[] {
  const out = [level0];
  let prev = level0;
  let n = size;
  while (n >= 8) {
    const m = n >> 1;
    const tmp = new Float32Array(m * n * 4); // horizontal pass: m wide, n tall
    for (let y = 0; y < n; y++) {
      const row = y * n * 4;
      for (let x = 0; x < m; x++) {
        const a = row + Math.max(0, 2 * x - 1) * 4;
        const b = row + 2 * x * 4;
        const c = b + 4;
        const d = row + Math.min(n - 1, 2 * x + 2) * 4;
        const o = (y * m + x) * 4;
        for (let k = 0; k < 4; k++) tmp[o + k] = (prev[a + k] + 3 * (prev[b + k] + prev[c + k]) + prev[d + k]) * 0.125;
      }
    }
    const next = new Uint8Array(m * m * 4);
    const stride = m * 4;
    for (let y = 0; y < m; y++) {
      const a = Math.max(0, 2 * y - 1) * stride;
      const b = 2 * y * stride;
      const c = b + stride;
      const d = Math.min(n - 1, 2 * y + 2) * stride;
      const o = y * stride;
      for (let x = 0; x < stride; x++) {
        next[o + x] = Math.round((tmp[a + x] + 3 * (tmp[b + x] + tmp[c + x]) + tmp[d + x]) * 0.125);
      }
    }
    out.push(next);
    prev = next;
    n = m;
  }
  return out;
}

/** the B channel's ink box in texture uv — the polar passes' support */
function inkBoxB(level0: Uint8Array, size: number): [number, number, number, number] {
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (level0[(y * size + x) * 4 + 2] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return [0, 0, 1, 1];
  return [x0 / size, y0 / size, (x1 + 1) / size, (y1 + 1) / size];
}

// ── 3. the bloom bake ───────────────────────────────────────────────────────

/** I₀(x)·e^(−x), Abramowitz & Stegun 9.8.1–9.8.2 (|ε| < 2e-7) */
function i0e(x: number): number {
  if (x < 3.75) {
    const t = (x / 3.75) ** 2;
    const i0 =
      1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    return i0 * Math.exp(-x);
  }
  const t = 3.75 / x;
  const p =
    0.39894228 +
    t * (0.01328592 + t * (0.00225319 + t * (-0.00157565 + t * (0.00916281 +
    t * (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))));
  return p / Math.sqrt(x);
}

/**
 * Radial profile of the old bloom's expected kernel at distance r (mask texels):
 * Σᵢ (wᵢ/12)·[N(σ) ⊛ ring(ρᵢ)](r), the ring normalised to unit mass. Its total
 * mass is Σ wᵢ/12 = 1.0566 — the old bloom's DC gain, kept.
 */
function spiralProfile(r: number, bloomR: number): number {
  const s2 = SOFT_SIGMA * SOFT_SIGMA;
  let f = 0;
  for (let i = 0; i < 24; i++) {
    const rho = ((i + 0.5) / 24) * bloomR;
    const w = 1 - rho / (bloomR * 1.06);
    f += (w / 12) * Math.exp(-((r - rho) ** 2) / (2 * s2)) * i0e((r * rho) / s2);
  }
  return f / (2 * Math.PI * s2);
}

const fitCache = new Map<number, { sigma: number; w: number }[]>();

/**
 * Non-negative weights of unit-mass gaussians fitting the profile, by coordinate
 * descent on the Gram matrix (cheap: ~3 ms, cached per radius). Measured against
 * an exact quadrature of the rings: max error 1.0 % of the kernel's peak at
 * dissolve 1, 0.55 % at 0.41, 0.47 % at 0 — a smooth shape difference in a glow,
 * where the old estimator's per-pixel noise was several percent.
 */
function fitGaussians(bloomR: number): { sigma: number; w: number }[] {
  const keyR = Math.round(bloomR * 4) / 4;
  const hit = fitCache.get(keyR);
  if (hit) return hit;
  const sig: number[] = [];
  for (let s = SOFT_SIGMA; s < bloomR + 4 * SOFT_SIGMA; s *= 1.1) sig.push(s);
  const M = 128;
  const rMax = bloomR + 5 * SOFT_SIGMA;
  const rs = Array.from({ length: M }, (_, j) => ((j + 0.5) / M) * rMax);
  const target = rs.map((r) => spiralProfile(r, bloomR));
  const basis = sig.map((s) => rs.map((r) => Math.exp(-(r * r) / (2 * s * s)) / (2 * Math.PI * s * s)));
  // ∫ (·)² dA = ∫ (·)² 2πr dr, softened by σ so the peak is not left to chance
  const area = rs.map((r) => r + SOFT_SIGMA);
  const K = sig.length;
  const G = basis.map((bk) => basis.map((bl) => bk.reduce((a, v, j) => a + v * bl[j] * area[j], 0)));
  const grad = basis.map((bk) => -bk.reduce((a, v, j) => a + v * target[j] * area[j], 0));
  const w = new Float64Array(K);
  for (let it = 0; it < 8000; it++) {
    for (let k = 0; k < K; k++) {
      const nw = Math.max(0, w[k] - grad[k] / G[k][k]);
      const d = nw - w[k];
      if (d !== 0) {
        for (let l = 0; l < K; l++) grad[l] += d * G[l][k];
        w[k] = nw;
      }
    }
  }
  // keep the DC exact: the fitted mass must equal the kernel's (1.0566)
  let mass = 0;
  for (let i = 0; i < 24; i++) mass += (1 - (i + 0.5) / 24 / 1.06) / 12;
  const sum = w.reduce((a, v) => a + v, 0) || 1;
  const out = sig.map((s, k) => ({ sigma: s, w: (w[k] * mass) / sum })).filter((g) => g.w > 1e-5);
  fitCache.set(keyR, out);
  return out;
}

/** Young–van Vliet recursive gaussian, in place, along one axis (σ in texels) */
function yvv(buf: Float32Array, n: number, sigma: number, horizontal: boolean) {
  const q = sigma >= 2.5 ? 0.98711 * sigma - 0.9633 : 3.97156 - 4.14554 * Math.sqrt(1 - 0.26891 * sigma);
  const b0 = 1.57825 + 2.44413 * q + 1.4281 * q * q + 0.422205 * q * q * q;
  const b1 = (2.44413 * q + 2.85619 * q * q + 1.26661 * q * q * q) / b0;
  const b2 = -(1.4281 * q * q + 1.26661 * q * q * q) / b0;
  const b3 = (0.422205 * q * q * q) / b0;
  const B = 1 - (b1 + b2 + b3);
  const line = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) line[i] = buf[horizontal ? k * n + i : i * n + k];
    let w1 = 0;
    let w2 = 0;
    let w3 = 0;
    for (let i = 0; i < n; i++) {
      const w = B * line[i] + b1 * w1 + b2 * w2 + b3 * w3;
      line[i] = w;
      w3 = w2;
      w2 = w1;
      w1 = w;
    }
    w1 = w2 = w3 = 0;
    for (let i = n - 1; i >= 0; i--) {
      const y = B * line[i] + b1 * w1 + b2 * w2 + b3 * w3;
      line[i] = y;
      w3 = w2;
      w2 = w1;
      w1 = y;
    }
    for (let i = 0; i < n; i++) buf[horizontal ? k * n + i : i * n + k] = line[i];
  }
}

function bakeBloom(level0: Uint8Array, size: number, dissolve: number): LightMaskBuild['bloom'] {
  const low = size / BLOOM_DOWN;
  const off = (BLOOM_GRID - low) >> 1;
  const pad = off / low;
  // the G channel — the very 18 px canvas blur the old taps read — box-averaged
  // to the bake grid and centred in its padding. Each fitted gaussian already
  // contains that 18 px, so below it is deconvolved: σ_eff = √(σ² − 18²).
  const base = new Float32Array(BLOOM_GRID * BLOOM_GRID);
  for (let y = 0; y < low; y++) {
    for (let x = 0; x < low; x++) {
      let s = 0;
      for (let dy = 0; dy < BLOOM_DOWN; dy++) {
        for (let dx = 0; dx < BLOOM_DOWN; dx++) {
          s += level0[((y * BLOOM_DOWN + dy) * size + x * BLOOM_DOWN + dx) * 4 + 1];
        }
      }
      base[(y + off) * BLOOM_GRID + x + off] = s / (BLOOM_DOWN * BLOOM_DOWN * 255);
    }
  }
  const field = (d: number) => {
    // `bloomR = 0.085·(1 + 1.2·dissolve)` in uv, exactly as the old shader
    const bloomR = 0.085 * (1 + 1.2 * Math.min(1, Math.max(0, d))) * size;
    const acc = new Float32Array(BLOOM_GRID * BLOOM_GRID);
    for (const g of fitGaussians(bloomR)) {
      const b = base.slice();
      const s = Math.sqrt(Math.max(0, g.sigma * g.sigma - SOFT_SIGMA * SOFT_SIGMA)) / BLOOM_DOWN;
      // below half a bake texel the recursive filter is out of range and the
      // blur is invisible anyway: identity
      if (s >= 0.5) {
        yvv(b, BLOOM_GRID, s, true);
        yvv(b, BLOOM_GRID, s, false);
      }
      for (let i = 0; i < acc.length; i++) acc[i] += g.w * b[i];
    }
    return acc;
  };
  const a = field(dissolve);
  const z = field(0);
  const halves = new Uint16Array(BLOOM_GRID * BLOOM_GRID * 2);
  for (let i = 0; i < a.length; i++) {
    halves[i * 2] = toHalf(Math.max(0, a[i]));
    halves[i * 2 + 1] = toHalf(Math.max(0, z[i]));
  }
  return { size: BLOOM_GRID, pad, dissolve, halves };
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** IEEE binary16, round-to-nearest; the carry into the exponent is intended */
function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const e = ((x >>> 23) & 0xff) - 112;
  const m = x & 0x7fffff;
  if (e <= 0) return e < -10 ? sign : sign | (((m | 0x800000) >> (1 - e)) + 0x1000) >> 13;
  if (e >= 31) return sign | 0x7c00;
  return sign | ((e << 10) + ((m + 0x1000) >> 13));
}
