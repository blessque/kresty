import * as THREE from 'three';

/**
 * A seamlessly tiling value-noise FBM, baked once at load, used as the river's
 * ripple field (groundPlan.ts).
 *
 * WHY A BAKED TEXTURE RATHER THAN NOISE IN THE SHADER
 * ---------------------------------------------------
 * Two reasons, and both matter here.
 *
 * Performance: sampling this costs two texture fetches per water fragment —
 * cache-friendly, and far cheaper than the ~12 hash evaluations an equivalent
 * in-shader FBM would need. It is built once, in 64 KB.
 *
 * Look: summed sine waves cannot produce water. They interfere into a regular
 * plaid, which is exactly what round 9.1's three-sine drift looked like once you
 * raised its contrast enough to see it. Value noise has no preferred direction
 * and no repeating beat, so it reads as chop.
 *
 * TILING is the whole trick: each octave's lattice indices are taken modulo the
 * octave's grid size, so the right edge interpolates back into the left and the
 * texture can repeat forever with no seam.
 *
 * The generator is a fixed-seed LCG on purpose — the same bytes every reload, so
 * a screenshot diff is meaningful and "it looks different today" cannot happen.
 */

/**
 * Grid cells across the tile for the COARSEST octave.
 *
 * This is the dial that decides what the water looks like, because an FBM's
 * dominant feature size is tile/BASE_GRID and the coarsest octave carries the
 * most amplitude. At 4 the dominant feature came out ~31 px and the river read
 * as soft curtains rather than chop; at 12 it was still ~21 px and read as
 * camouflage. At 32, against a 512-texel tile mapped to ~517 screen px, the
 * dominant feature lands near 16 px with octaves at 8 / 4 / 2 px under it —
 * which is the range the eye reads as ripples.
 */
const BASE_GRID = 32;
/** each octave doubles the grid; GAIN is deliberately above 0.5 so the finer
 *  octaves keep enough energy to give the surface texture rather than blur */
const OCTAVES = 4;
const GAIN = 0.6;
const SEED = 0x5f3a91;

export function buildRippleTexture(size = 512): THREE.DataTexture {
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
  let lo = Infinity;
  let hi = -Infinity;

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
      const n = sum / norm;
      field[y * size + x] = n;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
  }

  // stretch to the full 0..1 range: an FBM's raw output clusters hard around
  // 0.5, and without this the shader's crest window would have almost nothing
  // above it and the ripples would flatten out again
  const span = hi - lo || 1;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < field.length; i++) {
    data[i] = Math.round(((field[i] - lo) / span) * 255);
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
