import * as THREE from 'three';
import { buildRippleTexture } from './rippleTexture';

/**
 * Four ways to render the Neva, switchable with `?water=<mode>`.
 *
 * They differ in LOOK and in TECHNIQUE, not in parameters — the point is to
 * choose a direction, not to tune one. None of them displaces geometry: the
 * river polygon stays pointwise on y = 0, which is what keeps the plan
 * undistorted under the plan-oblique shear (see groundPlan.ts).
 *
 *   chop   — baked tiling FBM sampled twice, tonal. Round 9.2's current look.
 *   lines  — engraved contour lines. Pure procedural, NO texture at all.
 *   glints — drifting specks of light. Geometry (THREE.Points), not a surface
 *            shader; the water itself stays a flat fill.
 *   gloss  — analytic wave normals lit by a real specular highlight. No
 *            texture; the surface reads as a lit material rather than a tint.
 */

export type WaterMode = 'chop' | 'lines' | 'glints' | 'gloss';
export const WATER_MODES: WaterMode[] = ['chop', 'lines', 'glints', 'gloss'];
export const DEFAULT_WATER: WaterMode = 'chop';

export interface WaterHandle {
  /** extra scene content the mode needs (only `glints` uses this) */
  object?: THREE.Object3D;
  update(t: number): void;
  dispose(): void;
}

export function isWaterMode(v: string | null): v is WaterMode {
  return !!v && (WATER_MODES as string[]).includes(v);
}

/**
 * `mat` is the river's material; `geometry` is its (already baked, world-frame)
 * polygon. Returns a handle the caller drives once per frame.
 */
export function applyWaterMode(
  mode: WaterMode,
  mat: THREE.MeshBasicMaterial,
  geometry: THREE.BufferGeometry
): WaterHandle {
  const time = { value: 0 };
  const tick = (extra?: WaterHandle): WaterHandle => ({
    object: extra?.object,
    update: (t) => {
      time.value = t;
      extra?.update(t);
    },
    dispose: () => extra?.dispose(),
  });

  if (mode === 'glints') return tick(buildGlints(mat, geometry, time));
  if (mode === 'lines') return injectLines(mat, time), tick();
  if (mode === 'gloss') return injectGloss(mat, time), tick();
  return injectChop(mat, time), tick({ update: () => {}, dispose: () => {} });
}

/** shared preamble: world-XZ position, so every mode is shear-invariant */
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

// ------------------------------------------------------------------- chop

const CHOP_LAYERS = [
  { tile: 190, speed: 1.0, weight: 0.6 },
  { tile: 105, speed: 1.7, weight: 0.4 },
];
const CHOP_ANISO = 2.2;
const CHOP_DARK = 0.15;
const CHOP_CREST = 0.11;

function injectChop(mat: THREE.MeshBasicMaterial, time: { value: number }) {
  const tex = buildRippleTexture();
  const sum = CHOP_LAYERS.map(
    (l) => `texture2D(uRipple, vec2(
      (q.x - uTime * ${l.speed.toFixed(3)}) / ${l.tile.toFixed(2)},
      q.y / ${(l.tile * CHOP_ANISO).toFixed(2)})).r * ${l.weight.toFixed(3)}`
  ).join('\n    + ');
  inject(
    mat,
    time,
    `vec2 q = vec2(-vFlow.x, vFlow.y);
    float n = ${sum};
    float swell = 0.72 + 0.28 * sin(q.y * 0.024166 + uTime * 0.6);
    float trough = 1.0 - ${CHOP_DARK} * (1.0 - smoothstep(0.30, 0.62, n));
    // ridge transform: contours of n are naturally thin, unlike a high threshold
    float ridge = 1.0 - abs(n * 2.0 - 1.0);
    float crest = smoothstep(0.82, 0.98, ridge) * swell;
    diffuseColor.rgb *= trough;
    diffuseColor.rgb += crest * ${CHOP_CREST};`,
    { uRipple: { value: tex } }
  );
  mat.userData.waterTexture = tex;
}

// ------------------------------------------------------------------ lines

/** world units between engraved contours (~2.7 px per unit, so ~10 px apart) */
const LINE_SPACING = 3.8;
/** line weight in screen pixels — held constant by fwidth, so it never thickens
 *  when the focus camera zooms in */
const LINE_PX = 1.15;
const LINE_INK = 0.13;
/** world units per second the contours travel west */
const LINE_DRIFT = 1.6;

/**
 * «Гравюра» — engraved contour lines, the register of an old survey drawing.
 * The map's whole language is edge-forward («Грани» = fat white edge lines), so
 * water drawn as LINEWORK rather than as texture is arguably the most native
 * option of the four.
 *
 * Entirely procedural: no texture, no VRAM, ~4 sin per fragment. The lines are
 * contours of a scalar field that is warped by two travelling sines, so they
 * undulate and drift instead of marching rigidly.
 *
 * `fwidth` is what makes it hold up: dividing by the field's screen-space
 * derivative gives lines a constant PIXEL width at any zoom, and antialiases
 * them for free. Without it they would alias to dashes when minified and
 * balloon into stripes in focus mode.
 */
function injectLines(mat: THREE.MeshBasicMaterial, time: { value: number }) {
  inject(
    mat,
    time,
    `vec2 q = vec2(-vFlow.x, vFlow.y);
    // The field varies along q.x, so the contours run ACROSS the river — square
    // to the bank — and the -uTime term marches them west (+q.x is west, since
    // q.x = -world.x). Warping in q.y is what makes each line undulate along
    // its own length instead of staying a ruled straight edge.
    float f = (q.x - uTime * ${LINE_DRIFT.toFixed(2)}) / ${LINE_SPACING.toFixed(3)}
      + 0.42 * sin(q.y * 0.055 - uTime * 0.55)
      + 0.20 * sin(q.y * 0.131 + q.x * 0.021 + uTime * 0.9)
      + 0.10 * sin(q.y * 0.245 - uTime * 1.6);
    float dist = abs(fract(f - 0.5) - 0.5);
    float line = 1.0 - smoothstep(0.0, fwidth(f) * ${LINE_PX.toFixed(2)}, dist);
    diffuseColor.rgb -= line * ${LINE_INK};`
  );
}

// ------------------------------------------------------------------ gloss

/**
 * «Глянец» — the surface treated as a lit material instead of a tint.
 *
 * Four travelling waves are summed analytically and DIFFERENTIATED to get a
 * true surface normal, which is then lit with a Blinn-Phong highlight from the
 * same direction as mapStudio's key light. The geometry stays perfectly flat —
 * only the normal is fictional — so nothing moves off y = 0.
 *
 * This is the only mode where the water has a specular, so it is the only one
 * that reads as wet. No texture; ~8 sin/cos per fragment.
 */
/**
 * Waves are parameterised by SLOPE, not by amplitude, because slope is what the
 * lighting actually consumes — and the first attempt got this wrong in an
 * instructive way. The key light gives H ≈ (-0.43, 0.85, -0.33), so a FLAT
 * normal already scores dot(N,H) = 0.85 and pow(0.85, 42) ≈ 0.001. The normal
 * has to tilt ~32° toward the light before a highlight exists at all. Slopes of
 * 0.067 (3.8°) could never fire; these peak near 0.9, which crosses it.
 */
const GLOSS_WAVES = [
  { dir: [-1.0, 0.12], len: 7.5, slope: 0.34, speed: 1.0 },
  { dir: [-1.0, -0.31], len: 4.5, slope: 0.26, speed: 1.5 },
  { dir: [-0.72, 0.69], len: 11.5, slope: 0.22, speed: 0.7 },
  { dir: [-0.9, 0.44], len: 2.75, slope: 0.12, speed: 2.2 },
];
const GLOSS_SHINE = 26;
/** how hard the sharp crest highlight pulls back up toward the base tone */
const GLOSS_SPEC = 0.9;
/** and the broad shading from the wave slopes, which fills the mid-tones */
const GLOSS_BROAD = 0.85;
/**
 * The darkest the surface goes, as a per-channel multiplier on the base water
 * colour. Red is pulled down hardest so the shadow side shifts BLUER rather
 * than merely greyer. Derived from the base rather than hardcoded, so
 * `setFocus`'s fade toward the field still works — a fixed dark colour would
 * stay dark while everything around it faded out.
 */
const GLOSS_DARK: [number, number, number] = [0.68, 0.8, 0.93];

function injectGloss(mat: THREE.MeshBasicMaterial, time: { value: number }) {
  const slope = GLOSS_WAVES.map((w) => {
    const n = Math.hypot(w.dir[0], w.dir[1]);
    const d = `vec2(${(w.dir[0] / n).toFixed(4)}, ${(w.dir[1] / n).toFixed(4)})`;
    const k = ((Math.PI * 2) / w.len).toFixed(5);
    // `+ uTime` (not `-`) is what sends the crests WEST, matching the drift
    // direction every other mode uses
    return `${d} * (${w.slope.toFixed(3)} * cos(${k} * dot(q, ${d}) + uTime * ${w.speed.toFixed(3)}))`;
  }).join('\n      + ');
  inject(
    mat,
    time,
    `vec2 q = vec2(-vFlow.x, vFlow.y);
    // DOMAIN WARP first. Four plain sines interfere into a regular lattice —
    // the same plaid that killed the sine version of chop mode - and it reads
    // as woven fabric, not water. Displacing the sample position by two slow,
    // incommensurate sines destroys the repeat while keeping the whole mode
    // texture-free.
    q += vec2(sin(q.y * 0.062 + uTime * 0.21),
              sin(q.x * 0.054 - uTime * 0.17)) * 1.7;
    // d(height)/d(q): the summed waves' analytic gradient
    vec2 slope = ${slope};
    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    // same key direction as mapStudio's rig, and an orthographic top-down eye
    vec3 L = normalize(vec3(-300.0, 170.0, -230.0));
    vec3 H = normalize(L + vec3(0.0, 1.0, 0.0));
    float spec = pow(max(dot(N, H), 0.0), ${GLOSS_SHINE.toFixed(1)});
    // Broad tonal shading, driven by how far the surface tilts TOWARD the
    // light in the horizontal plane. Deliberately not smoothstep(dot(N, L)):
    // N is dominated by its +Y component, so dot(N, L) sits in a narrow band
    // near 0.6-0.8 and any smoothstep over it saturates at 1 across most of the
    // surface — which left the river flat and stuck ~40% short of the dark end.
    // dot(slope, L.xz) has a known range (|slope| <= ~0.9), so the ramp below
    // genuinely spans 0..1.
    float facing = -dot(slope, vec2(L.x, L.z));
    float broad = smoothstep(-0.3, 0.3, facing);

    // The surface only ever DARKENS: full base colour is the ceiling, reached
    // on the crests, and everything else falls toward a bluer shadow. Adding
    // light instead (the previous approach) pushed the river brighter than the
    // flat #d4eaf5 it is supposed to be.
    float lit = clamp(broad * ${GLOSS_BROAD} + spec * ${GLOSS_SPEC}, 0.0, 1.0);
    vec3 dark = diffuseColor.rgb * vec3(${GLOSS_DARK[0]}, ${GLOSS_DARK[1]}, ${GLOSS_DARK[2]});
    diffuseColor.rgb = mix(dark, diffuseColor.rgb, lit);`
  );
}

// ----------------------------------------------------------------- glints

const GLINT_COUNT = 2600;
/**
 * How far west a glint travels before it wraps and fades back in.
 *
 * Kept SHORT on purpose. At 9 world units (~24 px) glints drifted clean across
 * the shoreline and sparkled on the embankment — the river mesh is pushed back
 * by polygonOffset while points are not, so a stray glint wins the depth test
 * over the road and there is no cheap way to clip it. Short travel plus the
 * inset in scatterOnSurface keeps every speck on water.
 */
const GLINT_TRAVEL = 3.2;
const GLINT_SPEED = 0.085;
const GLINT_SIZE = 6;
/** sampling is pulled this far toward each triangle's centroid, so no speck
 *  starts on the polygon's edge and drifts off it */
const GLINT_INSET = 0.14;

/**
 * «Блики» — the water stays a FLAT fill and all the motion is carried by
 * discrete specks of light drifting west, like sun sparkle.
 *
 * The only mode that is not a surface shader: it is geometry, a THREE.Points
 * cloud scattered over the river's own triangles (area-weighted, so the density
 * is even rather than clumping in small triangles). Each speck travels
 * GLINT_TRAVEL world units and fades in and out across that run, so it never
 * leaves the polygon and the wrap is invisible.
 *
 * Depth: the points sit at exactly the water's y, but the river MESH is pushed
 * back by polygonOffset (PLAN_PUSH), so the points test nearer and win — while
 * buildings still occlude them correctly. No offset needed.
 */
function buildGlints(
  mat: THREE.MeshBasicMaterial,
  geometry: THREE.BufferGeometry,
  time: { value: number }
): WaterHandle {
  const pts = scatterOnSurface(geometry, GLINT_COUNT);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts.pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(pts.phase, 1));

  const pointMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSize: { value: GLINT_SIZE } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform float uSize;
      varying float vFade;
      void main() {
        float ph = fract(aPhase + uTime * ${GLINT_SPEED});
        vec3 p = position + vec3(-${GLINT_TRAVEL.toFixed(1)} * ph, 0.0, 0.0);
        // fade in and out across the run, so the wrap is never seen
        vFade = sin(ph * 3.14159265);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vFade;
      void main() {
        // elliptical, stretched along the flow: a glint on water is a short
        // streak, not a dot
        vec2 o = (gl_PointCoord - 0.5) * vec2(1.0, 2.6);
        float d = length(o);
        float a = smoothstep(0.5, 0.06, d) * vFade * 0.9;
        gl_FragColor = vec4(1.0, 1.0, 1.0, a);
      }`,
  });

  const points = new THREE.Points(geo, pointMat);
  points.raycast = () => {};
  points.renderOrder = 1;
  // the surface itself stays plain in this mode
  mat.onBeforeCompile = () => {};

  return {
    object: points,
    update: () => {},
    dispose: () => {
      geo.dispose();
      pointMat.dispose();
      points.removeFromParent();
    },
  };
}

/** uniform random points on a mesh's surface, weighted by triangle area */
function scatterOnSurface(geo: THREE.BufferGeometry, count: number) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const tris = pos.count / 3;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cum: number[] = [];
  let total = 0;
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    total += b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5;
    cum.push(total);
  }

  const out = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * total;
    let t = cum.findIndex((v) => v >= r);
    if (t < 0) t = tris - 1;
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    // barycentric, folded so the sample stays inside the triangle
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const px = a.x + (b.x - a.x) * u + (c.x - a.x) * v;
    const py = a.y + (b.y - a.y) * u + (c.y - a.y) * v;
    const pz = a.z + (b.z - a.z) * u + (c.z - a.z) * v;
    // pull toward the centroid so nothing sits on the polygon boundary
    const k = 1 - GLINT_INSET;
    out[i * 3] = (a.x + b.x + c.x) / 3 + (px - (a.x + b.x + c.x) / 3) * k;
    out[i * 3 + 1] = (a.y + b.y + c.y) / 3 + (py - (a.y + b.y + c.y) / 3) * k;
    out[i * 3 + 2] = (a.z + b.z + c.z) / 3 + (pz - (a.z + b.z + c.z) / 3) * k;
    phase[i] = Math.random();
  }
  if (src !== geo) src.dispose();
  return { pos: out, phase };
}
