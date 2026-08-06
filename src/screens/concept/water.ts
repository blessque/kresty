import * as THREE from 'three';
import { buildRippleTexture } from './rippleTexture';
import {
  WATER_DEFAULTS,
  textureChanged,
  cloneWaterParams,
  type WaterParams,
} from './waterParams';

/**
 * The Neva — one water look, round 11. (Rounds 9.2–9.5 shipped four switchable
 * modes behind `?water=`; all four were rejected and are deleted.)
 *
 * WHY THE PREVIOUS FOUR READ AS "PROCEDURAL"
 * ------------------------------------------
 * «Гравюра», the shipped one, was an ISOLINE EXTRACTOR, not a surface:
 *
 *     dist = abs(fract(f - 0.5) - 0.5);
 *     line = 1.0 - smoothstep(0.0, fwidth(f) * 1.15, dist);
 *
 * inks a curve at every integer crossing of `f`, so the output is exactly one
 * line per unit of `f` BY CONSTRUCTION. Measured at the overview camera's
 * 2.48 px per world unit, that was ~153 identical hairlines across the visible
 * river at a constant 9.4 px pitch, all within 15.7° of vertical, translating
 * rigidly west at 4 px/s. The three "warp" sines summed to 6.8 px against a
 * 9.4 px period, so contours could never cross or fold — the field's geometry
 * forbade turbulence. No amount of retuning those constants could have helped.
 *
 * The general rule that fell out of it, and the one worth keeping:
 * `fract`, `abs(x - 0.5)` and ridge transforms are FREQUENCY MULTIPLIERS. They
 * turn a smooth field into thin, high-contrast, regular features — which is the
 * signature of a drawing, and the opposite of a calm surface.
 *
 * AND WHY THE FIRST ATTEMPT AT THE FIX WAS ALSO WRONG
 * ---------------------------------------------------
 * Round 11's first pass replaced the comb with two warped samples of an
 * isotropic FBM. The designer's verdict: "the river looks like cloud sky now",
 * with a photo of real ripples attached. He was right, and the reason is
 * structural again: **an isotropic FBM is a cloud texture.** That is what it is
 * for. Having no preferred direction, it can only produce blobs — so killing
 * the stripes had also killed every trace of direction, and fog was what was
 * left.
 *
 * Water is ANISOTROPIC. It is made of WAVEFRONTS: crests that run long in one
 * direction and change sharply across it. The reference photo is not the
 * opposite of «Гравюра» — it is full of lines. The difference is that real
 * crests BEND, FORK and CROSS, while «Гравюра»'s were parallel and evenly
 * spaced.
 *
 * The phase-gradient argument says exactly how far short it fell. A carrier
 * sin(2π·dot(q,d)/λ) has phase gradient 1/λ. A warp W·noise(q) contributes
 * W·|∇noise| ≈ W/F for noise feature size F. Wavefronts can only fold where the
 * warp gradient CANCELS the carrier's, i.e. where W ≳ F/λ. With F ≈ 28 and
 * λ ≈ 5.5 that needs W ≈ 5 cycles. «Гравюра» used 0.72 — an order of magnitude
 * below the regime in which water exists.
 *
 * WHAT THIS DOES
 * --------------
 * Directional wave carriers whose PHASE is warped by several cycles of noise,
 * so the crests fold and interfere instead of marching. Total cost per water
 * fragment: 2 texture fetches, 2 sin, ~20 ALU.
 *
 * The five STAGES are fixed; every number in them is a dial in waterParams.ts
 * and none of them belongs in this comment. What each stage is for:
 *
 *   1. Two samples of ONE tiling FBM at different scales, serving as both the
 *      warp field and the activity envelope. Each repeats across the frame on
 *      its own; what makes tiling unobservable is their composite period, which
 *      is lcm(tileA, tileB) and must stay far larger than the frame.
 *   2. Two directional carriers close in heading, so they read as ONE wave
 *      family rather than as a crossing lattice. This is the stage that was
 *      missing in round 11's first pass — it is what makes the surface read as
 *      water rather than as weather.
 *   3. A phase warp measured in CYCLES. Past ~1 the wavefronts genuinely fold,
 *      producing the forks and dislocations the reference is full of; below it
 *      you get a ruled comb, every time.
 *   4. An activity envelope from the warp field, so some reaches run calm and
 *      others choppy — real water is never uniformly agitated.
 *   5. A two-tone ramp on a HUE path plus a thin bright crest. `rgb *= k` moves
 *      toward grey instead, which is what made the old `chop` mode read as mould.
 *
 * ROUND 14 RETUNED ALL OF IT and inverted two of round 11's own rules — the
 * warp layers now drift near-PARALLEL and the carriers travel fast, so the river
 * flows instead of shimmering in place. The arguments for both directions are
 * kept side by side in waterParams.ts, on the dials themselves.
 *
 * NOTE the surviving rule: no `fract`, no `abs(x−0.5)`, no ridge transform.
 * A `sin` is not one of those — it is smooth, and a smooth alternating band IS
 * a wave crest. The banned operators are the ones that MULTIPLY frequency.
 *
 * Like every previous mode this is a pure function of world XZ at y = 0 — the
 * fixed point of the plan-oblique shear — so the plan still cannot distort
 * under the cursor. See groundPlan.ts.
 *
 * ROUND 14: THE DIALS ARE UNIFORMS, NOT LITERALS
 * ----------------------------------------------
 * They all used to be interpolated into this source string and folded into the
 * compiled program, so changing one meant a recompile — which on a panel slider
 * is a recompile per frame plus a fresh entry in three's program cache each
 * time. The tuning values now live in waterParams.ts and arrive as uniforms;
 * the GLSL below is fixed text.
 *
 * The per-fragment cost is unchanged — still 2 texture fetches and 2 `sin`.
 * Headings stay trigonometry on the CPU (`unitVec`, `driftVec`), so the shader
 * never sees a degree. The carrier COUNT stays 2: a carrier is structural, and
 * `amp: 0` silences one.
 */

export interface WaterHandle {
  update(t: number): void;
  /** live retune — writes uniforms, and rebakes the noise texture only if one
   *  of its bake-time options actually moved */
  setParams(p: WaterParams): void;
  dispose(): void;
}
// ------------------------------------------------------------------- shader

/** a heading in degrees as a unit vector in the XZ plane */
function unitVec(deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

/** UV-space drift per second, from a heading, a world-units/second speed and
 *  the tile the field is sampled at */
function driftVec(deg: number, speed: number, tile: number): [number, number] {
  const [x, y] = unitVec(deg);
  return [(x * speed) / tile, (y * speed) / tile];
}

/**
 * The fragment body. Fixed text since round 14 — every number arrives as a
 * uniform. `uWave` is (dirX, dirY, 1/len, amp) and `uWarp` is
 * (warp cycles, mixA, phase speed, —) per carrier.
 */
const BODY = `vec2 q = vFlow;
    // the warp field: two decorrelated low-frequency samples that drift apart,
    // so the crest pattern has a lifetime instead of a direction of travel
    float nA = texture2D(uRipple, q / uTiles.x + uTime * uDrift.xy).r;
    float nB = texture2D(uRipple, q / uTiles.y + uTime * uDrift.zw).r;

    // wavefronts. The phase warp is measured in CYCLES, and it is > 1 on
    // purpose: that is the threshold past which crests fold and fork instead of
    // running parallel. Below it this is «Гравюра» again.
    float h = 0.0;
    for (int i = 0; i < 2; i++) {
      float n = mix(nB, nA, uWarp[i].y);
      h += sin(6.2831853 * (dot(q, uWave[i].xy) * uWave[i].z
             + n * uWarp[i].x + uTime * uWarp[i].z)) * uWave[i].w;
    }

    // some reaches calm, some choppy
    h *= (1.0 - uCalmCrest.x) + uCalmCrest.x * nA;
    float s = clamp(0.5 + 0.5 * h, 0.0, 1.0);

    vec3 base = diffuseColor.rgb;
    diffuseColor.rgb = mix(base * uDeep, base * uLight, s);
    diffuseColor.rgb += smoothstep(0.86, 1.0, s) * uCalmCrest.y;`;

export function applyWater(
  mat: THREE.MeshBasicMaterial,
  params: WaterParams = WATER_DEFAULTS
): WaterHandle {
  const time = { value: 0 };
  let baked = cloneWaterParams(params);
  let tex = buildRippleTexture(baked.texture);

  // Held as refs, not read back from the shader: onBeforeCompile runs lazily on
  // the first render, so writing `.value` has to work before the program exists.
  const u = {
    uRipple: { value: tex },
    uTiles: { value: new THREE.Vector2() },
    uDrift: { value: new THREE.Vector4() },
    uWave: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uWarp: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uCalmCrest: { value: new THREE.Vector2() },
    uDeep: { value: new THREE.Vector3() },
    uLight: { value: new THREE.Vector3() },
  };

  const write = (p: WaterParams) => {
    u.uTiles.value.set(p.tileA, p.tileB);
    const [ax, ay] = driftVec(p.headingA, p.driftA, p.tileA);
    const [bx, by] = driftVec(p.headingB, p.driftB, p.tileB);
    u.uDrift.value.set(ax, ay, bx, by);
    p.waves.forEach((w, i) => {
      const [dx, dy] = unitVec(w.head);
      u.uWave.value[i].set(dx, dy, 1 / w.len, w.amp);
      u.uWarp.value[i].set(w.warp, w.mixA, w.speed, 0);
    });
    u.uCalmCrest.value.set(p.calm, p.crest);
    u.uDeep.value.set(...p.deep);
    u.uLight.value.set(...p.light);
  };
  write(baked);

  inject(
    mat,
    time,
    BODY,
    u,
    `uniform sampler2D uRipple;
uniform vec2 uTiles;
uniform vec4 uDrift;
uniform vec4 uWave[2];
uniform vec4 uWarp[2];
uniform vec2 uCalmCrest;
uniform vec3 uDeep;
uniform vec3 uLight;`
  );

  return {
    update: (t) => {
      time.value = t;
    },
    setParams: (p) => {
      write(p);
      // Only a bake-time option forces the rebuild; everything else is a
      // uniform write, so a slider drag never recompiles or reallocates.
      if (textureChanged(p.texture, baked.texture)) {
        const next = buildRippleTexture(p.texture);
        u.uRipple.value = next;
        tex.dispose();
        tex = next;
      }
      baked = cloneWaterParams(p);
    },
    // round 9.2 leaked this: the texture was parked on mat.userData and
    // GroundPlan.dispose only ever freed materials and geometries
    dispose: () => tex.dispose(),
  };
}

/**
 * Shared preamble: world-XZ position, so the effect is shear-invariant.
 *
 * `decls` is passed in rather than derived from the uniform names — round 13's
 * version generated `uniform sampler2D <name>;` for every entry, which was only
 * correct while the single uniform WAS a sampler. With a dozen vectors it would
 * declare all of them as textures and nothing would compile.
 */
function inject(
  mat: THREE.MeshBasicMaterial,
  time: { value: number },
  body: string,
  uniforms: Record<string, THREE.IUniform>,
  decls: string
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    for (const [k, v] of Object.entries(uniforms)) shader.uniforms[k] = v;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vFlow;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vFlow = (modelMatrix * vec4(transformed, 1.0)).xz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec2 vFlow;\nuniform float uTime;\n${decls}\nvoid main() {`
      )
      .replace('#include <map_fragment>', `#include <map_fragment>\n{\n${body}\n}`);
  };
}
