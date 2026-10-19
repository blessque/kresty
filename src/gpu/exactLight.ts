/**
 * THE EXACT LIGHT'S CPU HALF (round 33). Everything both backends derive from one
 * `RayFieldState` before the polar passes and the final pass run, computed ONCE
 * here so WebGL2 and WebGPU cannot disagree about it.
 *
 * ── what replaced what ───────────────────────────────────────────────────────
 * The god-rays used to be a 16–32-step JITTERED march from each pixel toward the
 * light centre. Noise was its normal output — rounds 5 and 31.4 only reshaped it,
 * and every rung below native resolution stretched each noisy pixel into a blotch.
 * Seen from the light centre, though, every ray is a straight line, so the march
 * is a 1D integral along one angle, and in polar coordinates about the centre that
 * integral is a PREFIX SUM. `polarPasses.ts` builds it exactly, once per frame, in
 * a texture whose size does not depend on the screen; each pixel reads it.
 *
 * ── the kernel is MATCHED, not naive — read before simplifying ──────────────
 * The look everyone signed off is the EXPECTED VALUE of the old 28-step march,
 * which is not ∫₀¹ m(c + t·d)·e^{−λ(1−t)} dt. Its samples sit at
 * tᵢ = 1 − (i + 1.25 + 0.5·jit)/N, so: the weights carry a gain g = decay^−1.5;
 * the forward range ends 1/N short of the pixel; and the LAST sample lands
 * BEHIND the light centre, on the emblem's solid centre disc — an isotropic glow
 * floor (~15 LSB in the gaps at mid-field) that a naive exact integral deletes.
 * So the forward part is fitted on the radius a·r, a = 1 − 1/N, and the behind
 * part is one extra term along θ+π. `?rays=pure` keeps the naive kernel reachable
 * so the designer can compare; `?rays=march` keeps the old estimator itself.
 *
 * λ is also FIXED at N = 28 now. It used to be −N·ln(decay) with N = the device's
 * step count, so a phone at 16 steps drew a measurably different light
 * (+20–57 % in the wedges, 2.3× in the gaps) from the M1 at 28.
 *
 * Imports nothing but types: `gpu/` stays portable.
 */
import type { RayFieldState, RaysMode } from './rayFieldTypes';

export type { RaysMode };

/** the old default rung's step count — the reference the look is matched to */
export const N_REF = 28;

/** numeric code the shaders branch on (u_raysMode / p13.w) */
export const RAYS_CODE: Record<RaysMode, number> = { march: 0, exact: 1, pure: 2, ref: 3 };

export interface ExactKernel {
  /** cubic Σ kc[n]·τⁿ fitted to the forward kernel on τ ∈ [0, 1] */
  kc: [number, number, number, number];
  /** forward radius scale: 1 − 1/N_REF matched, 1 pure */
  a: number;
  /** behind-centre weight (0 = pure) */
  wb: number;
  /** the decay exponent and gain, for the probe-only reference march */
  lambda: number;
  g: number;
}

/** 4×4 normal equations of a least-squares cubic on [0, 1], midpoint samples */
function fitCubic(f: (t: number) => number): [number, number, number, number] {
  const G = 256;
  const A = [0, 0, 0, 0].map(() => [0, 0, 0, 0]);
  const b = [0, 0, 0, 0];
  for (let i = 0; i < G; i++) {
    const t = (i + 0.5) / G;
    const y = f(t);
    const p = [1, t, t * t, t * t * t];
    for (let r = 0; r < 4; r++) {
      b[r] += p[r] * y;
      for (let c = 0; c < 4; c++) A[r][c] += p[r] * p[c];
    }
  }
  for (let k = 0; k < 4; k++) {
    let m = k;
    for (let r = k + 1; r < 4; r++) if (Math.abs(A[r][k]) > Math.abs(A[m][k])) m = r;
    [A[k], A[m]] = [A[m], A[k]];
    [b[k], b[m]] = [b[m], b[k]];
    for (let r = k + 1; r < 4; r++) {
      const q = A[r][k] / A[k][k];
      for (let c = k; c < 4; c++) A[r][c] -= q * A[k][c];
      b[r] -= q * b[k];
    }
  }
  const x = [0, 0, 0, 0];
  for (let k = 3; k >= 0; k--) {
    let s = b[k];
    for (let c = k + 1; c < 4; c++) s -= A[k][c] * x[c];
    x[k] = s / A[k][k];
  }
  return [x[0], x[1], x[2], x[3]];
}

const kernelCache = new Map<string, ExactKernel>();

/**
 * The forward kernel and the behind-centre weight for a dissolve, a `trail`
 * multiplier on λ and a mode. Cached: a frame calls this with the same numbers
 * as the last one almost always.
 *
 * Test vectors (dissolve 1 / 0.41 / 0, trail 1, matched) — reproduced by the
 * round-33 review independently of this file:
 *   kc 0.40707 0.36185 0.13886 0.07207 · wb 0.01484
 *   kc 0.21751 0.35696 0.13917 0.27638 · wb 0.00788
 *   kc 0.13783 0.33504 0.02689 0.49631 · wb 0.00503
 */
export function kernelFor(dissolve: number, trail: number, mode: RaysMode): ExactKernel {
  const pure = mode === 'pure';
  const key = `${dissolve.toFixed(4)}|${trail.toFixed(4)}|${pure ? 'p' : 'm'}`;
  const hit = kernelCache.get(key);
  if (hit) return hit;
  // the old shader's `decay = mix(0.93, 0.968, dissolve)`, as an exponent at N_REF
  const decay = 0.93 + 0.038 * Math.min(1, Math.max(0, dissolve));
  const lambda = -N_REF * Math.log(decay) * Math.max(0.05, trail);
  const a = pure ? 1 : 1 - 1 / N_REF;
  const g = pure ? 1 : Math.exp((1.5 * lambda) / N_REF);
  const kc = fitCubic((t) => a * g * Math.exp(-lambda * (1 - a * t)));
  const wb = pure ? 0 : (g * Math.exp(-lambda * (1 + 0.5 / N_REF))) / N_REF;
  const k: ExactKernel = { kc, a, wb, lambda, g };
  if (kernelCache.size > 64) kernelCache.clear();
  kernelCache.set(key, k);
  return k;
}

/**
 * The light centre in mask uv — the CPU twin of `slitLight`'s
 *   par = (q·0.06 + hoverDir·26)·parallax;  lightUv = 0.5 − R·par/S
 * with R = GLSL `mat2(cR, sR, −sR, cR)` (column-major), i.e.
 * R·v = (cR·vx − sR·vy, sR·vx + cR·vy). Uploaded to EVERY pass, so the polar
 * texture and the pixel that reads it agree on where the centre is.
 */
export function lightCentre(s: RayFieldState): [number, number] {
  const S = Math.max(s.params.signSize, 1);
  const sc = Math.max(s.scale, 1e-4);
  const qx = (s.pointerPx[0] - s.centerPx[0]) / sc;
  const qy = (s.pointerPx[1] - s.centerPx[1]) / sc;
  const px = (qx * 0.06 + s.hoverDir[0] * 26) * s.params.parallax;
  const py = (qy * 0.06 + s.hoverDir[1] * 26) * s.params.parallax;
  const cR = Math.cos(s.signRot);
  const sR = Math.sin(s.signRot);
  return [0.5 - (cR * px - sR * py) / S, 0.5 - (sR * px + cR * py) / S];
}

/** the polar texture's shape for an angular resolution */
export function polarDims(nTheta: number): { nTheta: number; nS: number } {
  const t = Math.max(512, Math.min(4096, 2 ** Math.round(Math.log2(nTheta || 2048))));
  return { nTheta: t, nS: t >= 2048 ? 384 : 256 };
}

/** What the renderer knows about the uploaded mask (see `LightMaskData`). */
export interface MaskGeometry {
  size: number;
  /** B-channel ink box in mask uv, texture space: [u0, v0, u1, v1] */
  inkBox: [number, number, number, number];
  /** bumped on every upload — part of the polar rebuild key */
  revision: number;
}

/** Everything the three polar passes and the final pass read, for one frame. */
export interface ExactFrame {
  mode: RaysMode;
  c: [number, number];
  /** radius of the LAST polar texel centre: the B support seen from c, uv */
  sLast: number;
  /** radial bin width, uv */
  ds: number;
  nTheta: number;
  nS: number;
  kernel: ExactKernel;
  /** LOD of the final pass's core/bloom fetch */
  maskLod: number;
  /** P1's band-limit floor: log2(mask texels per canvas px), ≥ 0 */
  lodFloor: number;
  /** P1's penumbra blur, log2(mask texels), 0 = off */
  penLod: number;
  /** P1's ray source: 0 = B smear (the shipped look), 1 = R crisp (round 5's razor) */
  edge: number;
  /** a change here means the polar texture must be rebuilt */
  key: string;
}

/**
 * `penumbra` 0..1 → an extended source of up to 5 % of the emblem: each slit edge
 * is blurred sideways by ε, so a ray's edge widens in proportion to distance —
 * razor at the emblem, feathered far out (exact in the far field). It costs a LOD
 * bias on a fetch P1 already makes, over the mask's gaussian mips.
 */
const PENUMBRA_MAX_UV = 0.05;

export function exactFrame(
  s: RayFieldState,
  mask: MaskGeometry,
  mode: RaysMode,
  nThetaWanted: number,
): ExactFrame {
  const { nTheta, nS } = polarDims(nThetaWanted);
  const c = lightCentre(s);
  const [u0, v0, u1, v1] = mask.inkBox;
  let support = 0;
  for (const [x, y] of [
    [u0, v0],
    [u1, v0],
    [u0, v1],
    [u1, v1],
  ]) {
    support = Math.max(support, Math.hypot(x - c[0], y - c[1]));
  }
  // one texel of slack so the bilinear footprint of the outermost ink is inside
  const sLast = Math.max(support + 1 / mask.size, 4 / mask.size);
  const ds = sLast / (nS - 0.5);
  const p = s.params;
  const kernel = kernelFor(p.dissolve, p.trail ?? 1, mode);
  const canvasSpan = Math.max(p.signSize * s.scale, 1); // the emblem, canvas px
  const texelsPerPx = mask.size / canvasSpan;
  const maskLod = Math.max(0, Math.log2(texelsPerPx));
  const pen = Math.max(0, Math.min(1, p.penumbra ?? 0));
  const penLod = pen > 0 ? Math.max(0, Math.log2(Math.max(1, pen * PENUMBRA_MAX_UV * mask.size))) : 0;
  const edge = Math.max(0, Math.min(1, p.rayEdge ?? 0));
  // c moves every frame on the main screen (rotation + an off-centre cursor),
  // so the key only spares the still pages: «Музей» and the icons at rest
  const q = (v: number, k: number) => Math.round(v * k);
  const key = [
    q(c[0], 1e5),
    q(c[1], 1e5),
    q(sLast, 1e5),
    nTheta,
    nS,
    q(maskLod, 64),
    q(penLod, 64),
    q(edge, 256),
    mask.revision,
  ].join('|');
  return { mode, c, sLast, ds, nTheta, nS, kernel, maskLod, lodFloor: maskLod, penLod, edge, key };
}

/**
 * How many canvas pixels per CSS pixel the light NEEDS (round 33).
 *
 * A noise-free light has nothing finer than its own sharpest feature, which is
 * the mask's edge as drawn on screen: B's 1.5-texel smear floor (or R's ~0.7-texel
 * antialiasing at `rayEdge` 1), widened by the penumbra. Rendering finer than
 * ~1/1.2 of that is pixels nobody can see — and since the old light's grain came
 * from rendering COARSER than the screen, the floor is half the screen's own
 * density, never lower. A visible crisp core (dissolve < 0.99: the icons) or a
 * phone's small emblem simply lands on native.
 */
export function detailScale(o: {
  /** emblem span, CSS px */
  spanCss: number;
  dpr: number;
  dissolve: number;
  maskSize: number;
  rayEdge?: number;
  penumbra?: number;
}): number {
  const dpr = Math.max(1, o.dpr);
  if (o.dissolve < 0.99) return dpr;
  const texelDev = (o.spanCss * dpr) / Math.max(1, o.maskSize);
  const edgeTexels = 1.5 + (0.7 - 1.5) * Math.max(0, Math.min(1, o.rayEdge ?? 0));
  const penTexels = Math.max(0, Math.min(1, o.penumbra ?? 0)) * PENUMBRA_MAX_UV * o.maskSize;
  const featureDev = texelDev * Math.max(edgeTexels, penTexels * 0.5);
  const s = dpr / Math.max(1, featureDev / 1.2);
  return Math.max(0.5 * dpr, Math.min(dpr, s));
}
