import * as THREE from 'three';
import { buildRippleTexture } from './rippleTexture';

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
 *   1. Two samples of ONE tiling FBM at PRIME scales (113 / 157 world units),
 *      serving as both the warp field and the activity envelope. Each repeats
 *      across the frame on its own, but their composite period is
 *      lcm(113, 157) = 17741 world units — 30x the screen width, so tiling is
 *      gone by construction. They drift NEAR-OPPOSITE (20° / 196°) at ~1.1 u/s,
 *      which is what gives the crest pattern a LIFETIME: wavefronts form and
 *      dissolve rather than translating, and nothing is trackable.
 *   2. Two directional carriers only 27° apart, wavelengths 10.0 and 6.2 world
 *      units (25 / 15 px), weighted 0.74 / 0.26 so they read as ONE wave family.
 *      This is the stage that was missing — it is what makes the surface read as
 *      water rather than as weather.
 *   3. Phase warp of 2.4 / 1.7 CYCLES. Past ~1 cycle the wavefronts genuinely
 *      fold, producing the forks and dislocations the reference is full of.
 *      This is the single most important constant in the file.
 *   4. An activity envelope from the warp field, so some reaches run calm and
 *      others choppy — real water is never uniformly agitated.
 *   5. A two-tone ramp on a HUE path (troughs bluer, crests whiter) plus a thin
 *      bright crest. `rgb *= k` moves toward grey instead, which is what made
 *      the old `chop` mode read as mould.
 *
 * NOTE the surviving rule: no `fract`, no `abs(x−0.5)`, no ridge transform.
 * A `sin` is not one of those — it is smooth, and a smooth alternating band IS
 * a wave crest. The banned operators are the ones that MULTIPLY frequency.
 *
 * Like every previous mode this is a pure function of world XZ at y = 0 — the
 * fixed point of the plan-oblique shear — so the plan still cannot distort
 * under the cursor. See groundPlan.ts.
 */

export interface WaterHandle {
  update(t: number): void;
  dispose(): void;
}

// ------------------------------------------------------------------- tuning

/**
 * Tile size in world units per layer. BOTH PRIME, and that is the whole
 * anti-tiling argument: the composite pattern repeats at their lcm, which must
 * stay far larger than the ~581 world units visible across the frame. Swapping
 * either for a round number (120, 160) would drop the composite period to ~480
 * and the repeat would walk straight back into view.
 */
const TILE_A = 113;
const TILE_B = 157;

/**
 * How fast each warp layer travels (world units/second) and in what direction
 * (degrees). THIS IS THE MAIN SPEED DIAL — the carriers barely move, so almost
 * all the visible life comes from these two.
 *
 * The headings are 176° apart — NEARLY OPPOSITE — and that is load-bearing, not
 * decorative. The warp dominates the phase gradient (that is what makes crests
 * fold), so whatever moves the warp moves the crests. Two fields drifting along
 * near-opposite vectors have a superposition with no coherent translation, so
 * the wavefronts re-form in place instead of sliding. Rotating these toward each
 * other reintroduces visible scrolling — measured at 19% of frame-to-frame
 * change explained by translation here, 33% at 130° apart, 46% with a single
 * dominant drift.
 *
 * Raise both to make the surface livelier; keep them within ~10% of each other
 * and keep the headings ~180° apart.
 */
const DRIFT_A = 1.1;
const DRIFT_B = 1.05;
const HEADING_A = 20;
const HEADING_B = 196;

/**
 * The wave carriers — the stage whose absence made the surface read as cloud.
 * `len` is the wavelength in world units (x2.48 for screen px at the overview
 * camera), `head` the crest-normal heading in degrees, `speed` the phase
 * advance in cycles/second, `amp` its share of the height field.
 *
 * ONE DOMINANT FAMILY, not two equals. The first attempt gave the two carriers
 * 0.55/0.45 at 68° apart and it read as woven mesh — two comparable crest sets
 * crossing make a diamond lattice, which is just plaid wearing a warp. The
 * reference photo has a single family of long arcs with fine detail riding on
 * it, so: 0.74/0.26, and only 27° between them, which makes the second read as
 * variation WITHIN one wave family rather than as a second family.
 *
 * Wavelengths are 10.0 and 6.2 world units = 25 and 15 screen px at the
 * overview camera. The first pass used 5.5/3.7 (13.6/9.2 px) and that was fine
 * enough to read as moiré rather than as waves. Neither heading is square to
 * the river.
 *
 * `speed` IS DELIBERATELY ALMOST ZERO. A carrier phase advance is a RIGID
 * TRANSLATION of the crest field — precisely the "obvious scrolling" defect. At
 * 0.09 cycles/s a shift-matching test attributed 26% of all frame-to-frame
 * change to a single (11,12) px translation. The evolution has to come from the
 * WARP field drifting instead: because the carrier term stays put, translating
 * the warp does not translate the crests, it re-forms them. What is left here
 * is just enough to suggest travel (~0.5 px/s), with opposite signs so there is
 * no common direction.
 */
const WAVES = [
  { len: 10.0, head: 20, speed: 0.02, amp: 0.74, warp: 2.4, mixA: 0.56 },
  { len: 6.2, head: 47, speed: -0.025, amp: 0.26, warp: 1.7, mixA: 0.42 },
];

/**
 * How much of the crest amplitude the activity envelope can remove. Real water
 * is never uniformly agitated; a constant amplitude everywhere is one of the
 * things that reads as generated.
 */
const CALM = 0.55;

/** a thin bright crest, like light catching the top of a ripple. Kept small —
 *  this is the one term that can tip the surface from "alive" into "effect". */
const CREST = 0.05;

/**
 * The two ends of the ramp, as per-channel multipliers on the base water tone.
 *
 * DERIVED from `diffuseColor` rather than written as literals, because
 * GroundPlan.setFocus lerps the base toward MAP_BG while a building is focused
 * — fixed colours would stay saturated while everything around them faded out.
 *
 * The multipliers are deliberately UNEQUAL. Equal ones would be a brightness
 * ramp, which desaturates toward grey; unequal ones move along a temperature
 * axis, so the shadow side reads as deeper water and the light side as sky on
 * water. Against #c5e0f0 these land (181,214,239) → (206,230,242) — bluer in
 * the troughs, whiter on the crests.
 *
 * MIND THE COLOUR SPACE. These multiply `diffuseColor` in LINEAR working space,
 * but the register was agreed in what you can see, which is sRGB. The first
 * pass sized them for ±4% linear and measured ±1.7% on screen, because sRGB
 * encoding compresses a linear ratio by roughly its 2.2 gamma. Always size
 * these against a measured screenshot, never against the multiplier.
 *
 * Widened once the wave carriers went in: crests need contrast to read as
 * crests, and the cloud version's ±3.9% was part of why it looked like haze.
 * These endpoints are (168,206,237) → (213,234,243); the field rarely reaches
 * either extreme, so what MEASURES on screen is 203 → 229, i.e. ±6.1% of code
 * value about the midpoint. That is above the ±4% originally agreed — the
 * agreement predates there being any wave structure to carry the read.
 *
 * This pair is the contrast dial. If the verdict is "too strong" or "I can't
 * see it", scale the deltas from 1.0 here — do NOT add stages.
 */
const DEEP: [number, number, number] = [0.7, 0.83, 0.975];
const LIGHT: [number, number, number] = [1.19, 1.1, 1.03];

// ------------------------------------------------------------------- shader

/** UV-space drift per second, from a heading and a world-units/second speed */
function drift(headingDeg: number, speed: number, tile: number): string {
  const a = (headingDeg * Math.PI) / 180;
  const x = (Math.cos(a) * speed) / tile;
  const y = (Math.sin(a) * speed) / tile;
  return `vec2(${x.toFixed(6)}, ${y.toFixed(6)})`;
}

export function applyWater(mat: THREE.MeshBasicMaterial): WaterHandle {
  const time = { value: 0 };
  const tex = buildRippleTexture();

  const carriers = WAVES.map((w, i) => {
    const a = (w.head * Math.PI) / 180;
    const d = `vec2(${Math.cos(a).toFixed(4)}, ${Math.sin(a).toFixed(4)})`;
    // BOTH noise fields warp BOTH carriers, in different proportions. Warping a
    // carrier by a single drifting field just translates its crests — see
    // `speed` above; the warp dominates the phase gradient, so whatever moves
    // the warp moves the wavefronts. A superposition of two fields travelling
    // along different vectors has no coherent translation of its own, so the
    // crests re-form in place. Different mixes keep the two carriers from being
    // warped identically, which would re-correlate them.
    const n = `(nA * ${w.mixA.toFixed(2)} + nB * ${(1 - w.mixA).toFixed(2)})`;
    return `sin(6.2831853 * (dot(q, ${d}) / ${w.len.toFixed(2)}
      + ${n} * ${w.warp.toFixed(2)} + uTime * ${w.speed.toFixed(3)})) * ${w.amp.toFixed(2)}`;
  }).join('\n      + ');

  inject(
    mat,
    time,
    `vec2 q = vFlow;
    // the warp field: two decorrelated low-frequency samples that drift apart,
    // so the crest pattern has a lifetime instead of a direction of travel
    float nA = texture2D(uRipple, q / ${TILE_A.toFixed(1)}
      + uTime * ${drift(HEADING_A, DRIFT_A, TILE_A)}).r;
    float nB = texture2D(uRipple, q / ${TILE_B.toFixed(1)}
      + uTime * ${drift(HEADING_B, DRIFT_B, TILE_B)}).r;

    // wavefronts. The phase warp is measured in CYCLES, and it is > 1 on
    // purpose: that is the threshold past which crests fold and fork instead of
    // running parallel. Below it this is «Гравюра» again.
    float h = ${carriers};

    // some reaches calm, some choppy
    h *= ${(1 - CALM).toFixed(2)} + ${CALM.toFixed(2)} * nA;
    float s = clamp(0.5 + 0.5 * h, 0.0, 1.0);

    vec3 base = diffuseColor.rgb;
    diffuseColor.rgb = mix(
      base * vec3(${DEEP.map((v) => v.toFixed(3)).join(', ')}),
      base * vec3(${LIGHT.map((v) => v.toFixed(3)).join(', ')}),
      s);
    diffuseColor.rgb += smoothstep(0.86, 1.0, s) * ${CREST.toFixed(3)};`,
    { uRipple: { value: tex } }
  );

  return {
    update: (t) => {
      time.value = t;
    },
    // round 9.2 leaked this: the texture was parked on mat.userData and
    // GroundPlan.dispose only ever freed materials and geometries
    dispose: () => tex.dispose(),
  };
}

/** shared preamble: world-XZ position, so the effect is shear-invariant */
function inject(
  mat: THREE.MeshBasicMaterial,
  time: { value: number },
  body: string,
  uniforms: Record<string, THREE.IUniform> = {}
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    for (const [k, v] of Object.entries(uniforms)) shader.uniforms[k] = v;
    const decls = Object.keys(uniforms)
      .map((k) => `uniform sampler2D ${k};`)
      .join('\n');
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
