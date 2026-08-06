import * as THREE from 'three';
import { WATER_DEFAULTS, type RippleParams } from './waterParams';

/**
 * A seamlessly tiling value-noise FBM, baked once at load, used as the river's
 * ripple field (water.ts).
 *
 * WHY A BAKED TEXTURE RATHER THAN NOISE IN THE SHADER
 * ---------------------------------------------------
 * Two reasons, and both matter here.
 *
 * Performance: sampling this costs two or three texture fetches per water
 * fragment — cache-friendly, and roughly 2–3x cheaper than the ~200 ALU an
 * equivalent in-shader FBM would need, which is the ratio that matters on the
 * Intel integrated parts in the support matrix. It is built once, in 64 KiB
 * (plus mips, ~87 KB).
 *
 * Look: summed sine waves cannot produce water. They interfere into a regular
 * plaid, which is exactly what round 9.1's three-sine drift looked like once you
 * raised its contrast enough to see it — and then again in 9.4's `gloss`, and
 * again in 9.5's «Гравюра». Three strikes. A sum of sinusoids is phase-coherent,
 * so its autocorrelation never decays and structure at one point predicts
 * structure arbitrarily far away; that is what the eye calls "artificial".
 * Value noise decorrelates, so it reads as a surface.
 *
 * TILING is the whole trick: each octave's lattice indices are taken modulo the
 * octave's grid size, so the right edge interpolates back into the left and the
 * texture can repeat forever with no seam.
 *
 * The generator is a fixed-seed LCG on purpose — the same bytes every reload, so
 * a screenshot diff is meaningful and "it looks different today" cannot happen.
 *
 * NOT ALWAYS CHEAP. Measured in this browser at the shipped 2 octaves:
 * 256² = 1.9 ms / 64 KiB, 512² = 7.8 ms / 256 KiB, **1024² = 31.5 ms / 1 MiB**,
 * which is what round 14 ships. It runs once, synchronously, inside
 * `new GroundPlan(...)` — i.e. AFTER the GLB has loaded and before the map's
 * first frame, so it costs roughly one dropped frame at load rather than any
 * added latency. The admin panel can call it again at any time.
 */

/**
 * Bakes one tile. The dials and the argument behind each shipped value live in
 * waterParams.ts (`RippleParams`) — round 14 moved them there so the admin
 * panel could rebake on demand. `baseGrid` is the one that decides what the
 * water looks like: an FBM's dominant feature size is tile/baseGrid, and the
 * coarsest octave carries the most amplitude.
 *
 * Cheap enough to call live: ~4 ms at 256².
 */
export function buildRippleTexture(
  opts: RippleParams = WATER_DEFAULTS.texture
): THREE.DataTexture {
  const { size, baseGrid: BASE_GRID, octaves: OCTAVES, gain: GAIN, seed: SEED } = opts;
  const rnd = lcg(SEED);

  // one random lattice per octave, each already sized to its own grid
  const lattices: Float32Array[] = [];
  for (let o = 0; o < OCTAVES; o++) {
    const g = BASE_GRID << o;
    const cells = new Float32Array(g * g);
    for (let i = 0; i < cells.length; i++) cells[i] = rnd();
    lattices.push(cells);
  }

  const field = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let sum = 0;
      let amp = 1;
      let norm = 0;
      for (let o = 0; o < OCTAVES; o++) {
        sum += amp * sampleLattice(lattices[o], BASE_GRID << o, u, v);
        norm += amp;
        amp *= GAIN;
      }
      field[y * size + x] = sum / norm;
    }
  }

  // Stretch so the byte range is actually used. An FBM's raw output clusters
  // hard around 0.5, and the shader's ramp window would otherwise sample a
  // narrow slice of it and band.
  //
  // PERCENTILE, not min/max — this was a real bug in the round-9.2 version.
  // The extremes of a 4-octave FBM are single-texel outliers, so stretching by
  // them barely moved the bulk of the distribution: the texture still clustered
  // around 0.5 despite "stretching to full range". Cutting at the 1st/99th
  // percentile stretches what is actually there. The cost is clipping ~2% of
  // texels to the ends, which for a noise field is free.
  const [lo, hi] = percentileRange(field, 0.01);
  const span = hi - lo || 1;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < field.length; i++) {
    const v = ((field[i] - lo) / span) * 255;
    data[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // MIPMAPS ARE NOT OPTIONAL. The finest octave lands near or below one screen
  // pixel, so without mip filtering the ripple aliases into crawling moiré —
  // worst in focus mode, where the camera tilts and the water runs to a grazing
  // angle. `size` must stay a power of two for this to be valid.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // Focus mode swings the camera to ~35° elevation, so the water runs to a
  // grazing angle and trilinear picks its mip from the worst axis — which
  // over-blurs along the other one. three clamps this to the hardware maximum
  // on upload, so a flat 4 is safe everywhere. Bake-time, not live: anisotropy
  // is applied when the texture is uploaded.
  tex.anisotropy = opts.anisotropy;
  // raw scalar field, not colour — must not be tagged sRGB or three will
  // gamma-decode it and skew the crest threshold
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- internals

/** deterministic PRNG — same texture every reload */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The `p`-th and `(1-p)`-th percentiles of `field`, via a 256-bin histogram.
 * Values are known to lie in [0, 1] (the lattice holds [0, 1) and the octave
 * sum is normalised), so fixed bins are exact enough — the result only feeds a
 * contrast stretch.
 */
function percentileRange(field: Float32Array, p: number): [number, number] {
  const BINS = 256;
  const hist = new Uint32Array(BINS);
  for (let i = 0; i < field.length; i++) {
    const b = Math.floor(field[i] * BINS);
    hist[b < 0 ? 0 : b >= BINS ? BINS - 1 : b]++;
  }
  const cut = field.length * p;

  let acc = 0;
  let loBin = 0;
  for (let i = 0; i < BINS; i++) {
    acc += hist[i];
    if (acc > cut) {
      loBin = i;
      break;
    }
  }

  acc = 0;
  let hiBin = BINS - 1;
  for (let i = BINS - 1; i >= 0; i--) {
    acc += hist[i];
    if (acc > cut) {
      hiBin = i;
      break;
    }
  }

  return [loBin / BINS, (hiBin + 1) / BINS];
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** bilinear value noise on a wrapped lattice; `u`/`v` in [0, 1) */
function sampleLattice(cells: Float32Array, g: number, u: number, v: number): number {
  const x = u * g;
  const y = v * g;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  // the modulo is what makes the tile seamless
  const xa = ((x0 % g) + g) % g;
  const ya = ((y0 % g) + g) % g;
  const xb = (xa + 1) % g;
  const yb = (ya + 1) % g;

  const c00 = cells[ya * g + xa];
  const c10 = cells[ya * g + xb];
  const c01 = cells[yb * g + xa];
  const c11 = cells[yb * g + xb];

  const top = c00 + (c10 - c00) * fx;
  const bot = c01 + (c11 - c01) * fx;
  return top + (bot - top) * fy;
}
