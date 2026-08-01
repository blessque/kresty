import * as THREE from 'three';
import { MAP_BG } from './mapLooks';
import { buildRippleTexture } from './rippleTexture';

/**
 * The flat site plan under the buildings — the Neva, the two roads and the
 * neighbouring city blocks that `map-w-river.glb` carries as zero-thickness
 * surfaces.
 *
 * WHY THIS NEEDS NO ANTI-DISTORTION MACHINERY AT ALL
 * --------------------------------------------------
 * The plan-oblique shear ConceptScreen applies is
 *
 *     x' = x + sx·y      z' = z + sz·y
 *
 * so the plane y = 0 is its FIXED POINT: substitute y = 0 and the map is the
 * identity, for every sx and sz. The schematic therefore holds its exact,
 * undistorted plan under any lean — not because anything special is done to
 * it, but because it lies on the one plane the shear cannot touch.
 *
 * The GLB cooperates exactly: all three flat primitives sit on a single plane
 * (local z ≡ 614.914) which, after the node's Z-up→Y-up rotation, IS the
 * model's minimum world y — and ConceptScreen's normalize already puts the
 * model's minimum at y = 0. There is no baseline to fudge.
 *
 * The same geometry becomes a real ground surface the moment a building is
 * selected, because focus mode rotates the CAMERA (mapCamera.ts) and no plane
 * is invariant under that. One piece of geometry, both behaviours, no state.
 *
 * LOOK: near-monochrome, tones sampled from the designer's snapshot (round
 * 9.1) — streets lighter than the ground plate, blocks a solid grey, and the
 * river the one surface carrying real hue. The river also carries the only
 * motion on the map (round 9.2).
 */

/** a mesh counts as flat when its height is negligible against its footprint.
 *  Scale-free on purpose: the ratio holds whatever units the export uses, and
 *  it survives an export that gives the surfaces a hair of thickness. */
export const FLAT_RATIO = 1e-3;

export interface FlatSurface {
  /** the GLTF material name — the only per-surface identity the export carries */
  materialName: string;
  geometry: THREE.BufferGeometry;
}

/**
 * Tone per source material. The GLB has one material per surface class, which
 * is a far more reliable classifier than any geometric test — the river and a
 * road are both flat polygons and nothing about their shape says which is which.
 *
 * Values sampled from the designer's snapshot (round 9.1). The earlier
 * hue-free ramp was too quiet: the blocks vanished into the field and the water
 * read as grey haze rather than as a river.
 *
 * `depth` orders coplanar surfaces: every one of these sits on the SAME plane,
 * so without an explicit order they z-fight. Higher = drawn on top.
 */
const TONES: Record<string, { color: number; depth: number }> = {
  /** the Neva — the only surface with real hue, so the water reads as water */
  Color_H08: { color: 0xd4eaf5, depth: 0 },
  /** neighbouring city blocks — solidly present grey, they frame the site */
  Color_M02: { color: 0xccd7dd, depth: 1 },
  /** Арсенальная наб. + ул. Комсомола — lighter than the ground plate, so the
   *  streets read as ribbons cut through it rather than as more blocks */
  Color_M04: { color: 0xf5f5f5, depth: 2 },
};
const FALLBACK = { color: 0xccd7dd, depth: 1 };

/** the one surface that gets the chop — see RIPPLE_LAYERS below */
export const WATER_MATERIAL = 'Color_H08';

/**
 * Every plan surface is pushed BEHIND the buildings in depth.
 *
 * Without this the pier (`b18` — a 0.09-tall slab whose base is exactly on the
 * plane) z-fights with the river: `side: DoubleSide` renders the slab's bottom
 * face, which is precisely coplanar with the water. Two coplanar triangles from
 * different meshes interpolate depth from different vertices, so per-pixel
 * float error decides the winner and the overlap dissolves into moiré — which
 * reshuffles on any sub-pixel camera change, i.e. it FLICKERS while the return
 * spring settles.
 *
 * polygonOffset is the right tool because it biases only the depth VALUE
 * written, never the vertex — so the plan stays pointwise on y = 0 and the
 * pixel-exact shear invariance is untouched. Moving the plan down by an epsilon
 * would have fixed the flicker and quietly forfeited that guarantee.
 */
const PLAN_PUSH = 16;

/** how far the plan fades toward the field while a building is focused. Not
 *  all the way: the site keeps its ground, it just stops competing. */
const FOCUS_FADE = 0.55;

// ------------------------------------------------------------------- water

/**
 * Wind chop on the river, drifting WEST (world −X, screen-left at this yaw).
 *
 * ROUND 9.2 REWRITE. The previous version summed three sine waves and was
 * essentially invisible. The cause was FREQUENCY, not amplitude, and the
 * arithmetic is worth keeping: the overview frustum is ~529 world units across
 * 1440 px, so one world unit is ~2.7 px — which made those 26/17/41-unit waves
 * render at 71 px / 46 px / 111 px. Those are not ripples, they are broad
 * gradients, and a ±3.5% swing spread over 70 px is far below perception.
 *
 * Two things changed. Tile sizes are now chosen so the visible chop lands
 * around 8-25 px. And the field is sampled from a baked tiling FBM
 * (rippleTexture.ts) instead of summed sines, because sines interfere into a
 * regular plaid — raise their contrast enough to see them and you see the
 * plaid, not water.
 *
 * Cost: two texture fetches plus ~10 ALU per WATER fragment, on a surface
 * already being drawn, in a loop that already runs on rAF. If it ever needs
 * cutting, the lever is `mapPixelRatio` in shared/performanceTier.ts.
 */

/**
 * Sampling layers. `tile` is how many world units one wrap of the texture
 * covers — at ~2.7 px per world unit, `tile` 190 is a ~517 px wrap, which maps the
 * 512-texel texture at roughly one texel per screen pixel so its full detail is
 * used without aliasing. Two incommensurate scales at different speeds stop the
 * repeat from being legible.
 */
const RIPPLE_LAYERS = [
  { tile: 190, speed: 1.0, weight: 0.6 },
  { tile: 105, speed: 1.7, weight: 0.4 },
];
/**
 * Crests are stretched ACROSS the direction of travel by this factor — a wave
 * front runs perpendicular to the way it propagates, which is what gives the
 * reference photo its streaky look instead of a field of blobs.
 */
const RIPPLE_ANISO = 2.2;
/** how much the troughs darken. The designer asked for darkening rather than
 *  lightening, and on a light-blue plan that is also what carries contrast. */
const WATER_DARK = 0.15;
/** …and a narrow bright ridge on the crests, the one lightening that survives.
 *  This is the reference's structure: dark body, fine bright lines. */
const WATER_CREST = 0.11;
/** crest window, applied to the RIDGE field (not the raw noise) — narrow and
 *  high, so the ridges stay as thin lines rather than widening into blotches */
const CREST_LO = 0.82;
const CREST_HI = 0.98;
/** a slow, very large swell that gathers the crests into patches, the way wind
 *  does on real water. One `sin`, and it is what stops the chop reading as an
 *  even mechanical texture. */
const SWELL_TILE = 260;
const SWELL_SPEED = 0.6;

export class GroundPlan {
  readonly group = new THREE.Group();

  private mats: THREE.MeshBasicMaterial[] = [];
  private base: THREE.Color[] = [];
  private readonly bg = new THREE.Color(MAP_BG);
  private readonly time = { value: 0 };
  private animateWater = false;
  private ripple?: THREE.DataTexture;

  constructor(surfaces: FlatSurface[]) {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const s of surfaces) {
      const tone = TONES[s.materialName] ?? FALLBACK;
      const mat = new THREE.MeshBasicMaterial({
        color: tone.color,
        // Unlit on purpose. A lit plane under mapStudio's raking key would take
        // a gradient and a hotspot; a schematic wants to read as a drawing, one
        // flat tone per class.
        //
        // toneMapped:false is load-bearing, not a micro-optimisation: the
        // renderer runs NeutralToneMapping, which would roll a near-white down
        // to a grey — while MAP_BG is written as the clear colour and is NOT
        // tone mapped. Without this the plan and the field would sit in two
        // different tonal spaces and the ramp above would be meaningless.
        toneMapped: false,
        // same SketchUp winding problem as the volumes (see mapLooks.ts): faces
        // are wound both ways, so FrontSide punches holes in the plan
        side: THREE.DoubleSide,
        // Coplanar stacking, plus PLAN_PUSH so the whole plan loses to the
        // buildings (see the constant — this is the pier flicker fix). Under an
        // orthographic camera square to the plane the slope term is ~0, so
        // `units` is what actually separates layers; `factor` starts to matter
        // once focus mode tilts the camera.
        polygonOffset: true,
        polygonOffsetFactor: PLAN_PUSH / 8 - tone.depth * 0.5,
        polygonOffsetUnits: PLAN_PUSH - 4 * tone.depth,
      });

      if (s.materialName === WATER_MATERIAL && !still) {
        this.applyWaterDrift(mat);
        this.animateWater = true;
      }

      const mesh = new THREE.Mesh(s.geometry, mat);
      // never pickable and never edge-lined: the plan is context, the buildings
      // are the interaction (BuildingPicker only raycasts what it was given,
      // but this makes the intent explicit and skips the bounds test)
      mesh.raycast = () => {};
      mesh.renderOrder = tone.depth;
      this.group.add(mesh);
      this.mats.push(mat);
      this.base.push(new THREE.Color(tone.color));
    }
  }

  /**
   * Injected into MeshBasicMaterial rather than written as a ShaderMaterial on
   * purpose. A raw ShaderMaterial would drop three's `colorspace_fragment`
   * chunk, so the linear colour would be written straight to an sRGB target and
   * the river would come out visibly too dark — and it would also lose the
   * `setFocus` tint, which drives the stock `diffuse` uniform.
   */
  private applyWaterDrift(mat: THREE.MeshBasicMaterial) {
    this.ripple = buildRippleTexture();

    // flow basis: F is the drift direction (west), P is across it. Sampling in
    // this frame is what lets the crests be stretched across the flow.
    const layers = RIPPLE_LAYERS.map(
      (l) => `texture2D(uRipple, vec2(
        (q.x - uTime * ${l.speed.toFixed(3)}) / ${l.tile.toFixed(2)},
        q.y / ${(l.tile * RIPPLE_ANISO).toFixed(2)}
      )).r * ${l.weight.toFixed(3)}`
    ).join('\n      + ');

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uRipple = { value: this.ripple };
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vFlow;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
  // WORLD xz, not uv: the river polygon carries no useful uvs, and world space
  // also makes the drift independent of the shear (which is the identity here).
  vFlow = (modelMatrix * vec4(transformed, 1.0)).xz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'varying vec2 vFlow;\nuniform float uTime;\nuniform sampler2D uRipple;\nvoid main() {'
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  {
    // flow-aligned coordinates: x runs downstream, y across the stream
    const vec2 F = vec2(-1.0, 0.0);
    const vec2 P = vec2(0.0, 1.0);
    vec2 q = vec2(dot(vFlow, F), dot(vFlow, P));

    float n = ${layers};

    // broad wind patches, so the chop is not uniformly dense everywhere
    float swell = 0.72 + 0.28 * sin(
      q.y * ${((Math.PI * 2) / SWELL_TILE).toFixed(6)} + uTime * ${SWELL_SPEED.toFixed(3)}
    );

    // Broad tonal variation comes from the smooth field: darken the troughs.
    float trough = 1.0 - ${WATER_DARK.toFixed(4)}
      * (1.0 - smoothstep(0.30, 0.62, n));

    // Crests come from a RIDGE transform, not from thresholding the smooth
    // field. Thresholding an FBM high gives wide soft blobs, because the field's
    // gradient is gentle wherever it is high — that is what made the first two
    // attempts read as mottling. Folding it about its midpoint puts a sharp
    // crease along every n = 0.5 contour, and contours are naturally thin,
    // continuous and line-like: wave crests. One extra abs().
    float ridge = 1.0 - abs(n * 2.0 - 1.0);
    float crest = smoothstep(${CREST_LO.toFixed(3)}, ${CREST_HI.toFixed(3)}, ridge) * swell;

    diffuseColor.rgb *= trough;
    diffuseColor.rgb += crest * ${WATER_CREST.toFixed(4)};
  }`
        );
    };
  }

  /** advance the river drift; `t` is elapsed seconds */
  update(t: number) {
    if (this.animateWater) this.time.value = t;
  }

  /** `t` = MapCamera.focus, 0 = overview, 1 = focused on one building */
  setFocus(t: number) {
    const k = t * FOCUS_FADE;
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.copy(this.base[i]).lerp(this.bg, k);
    }
  }

  dispose() {
    this.ripple?.dispose();
    for (const m of this.mats) m.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
