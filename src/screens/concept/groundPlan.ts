import * as THREE from 'three';
import { MAP_BG } from './mapLooks';

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
 * LOOK: monochrome, tone only (map round 9 decision). The glass volumes are
 * the only colour on screen, so the plan is built from the field colour alone —
 * roads lighter than the field, water darker, blocks in between.
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

/** the one surface that gets the drift — see WATER_WAVES below */
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
 * Subtle procedural drift on the river, flowing WEST (world −X, screen-left at
 * this yaw) — the 2GIS register: you notice it only once you stop looking at it.
 *
 * Three travelling sine waves, summed and used to modulate lightness by a few
 * percent. Deliberately NOT a normal map, a reflection or a displacement: the
 * water is one flat polygon read straight down, so there is nothing for a
 * normal to catch, and lightness is the only channel that reads at all.
 *
 * Cost is three `sin` per fragment over the water's screen area, on a surface
 * that is already being drawn — no extra pass, no texture, no geometry. The map
 * renders on rAF regardless, so this adds no frames either.
 */
const WATER_WAVES = [
  // direction (xz, normalised in the shader), wavelength in normalized model
  // units (the model spans 300), relative weight
  { dir: [-1.0, 0.16], length: 26, weight: 0.5 },
  { dir: [-1.0, -0.34], length: 17, weight: 0.32 },
  { dir: [-0.7, 0.62], length: 41, weight: 0.18 },
];
/** crest speed, normalized model units per second. The model spans 300, so this
 *  crosses the visible river in about a minute — a drift, not a current. */
const WATER_SPEED = 1.4;
/** peak lightness swing. Above ~0.05 it stops reading as water and starts
 *  reading as banding on a flat fill. */
const WATER_AMP = 0.035;

export class GroundPlan {
  readonly group = new THREE.Group();

  private mats: THREE.MeshBasicMaterial[] = [];
  private base: THREE.Color[] = [];
  private readonly bg = new THREE.Color(MAP_BG);
  private readonly time = { value: 0 };
  private animateWater = false;

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
    const waves = WATER_WAVES.map((w) => {
      const len = Math.hypot(w.dir[0], w.dir[1]);
      // k = 2π/wavelength, so phase = k·(distance travelled along dir − speed·t)
      return {
        d: [w.dir[0] / len, w.dir[1] / len],
        k: (Math.PI * 2) / w.length,
        w: w.weight,
      };
    });
    const sum = waves
      .map((v) => `${v.w.toFixed(3)} * sin(${v.k.toFixed(5)} * (dot(p, vec2(${v.d[0].toFixed(4)}, ${v.d[1].toFixed(4)})) - uTime * ${WATER_SPEED.toFixed(3)}))`)
      .join('\n      + ');

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
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
        .replace('void main() {', 'varying vec2 vFlow;\nuniform float uTime;\nvoid main() {')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  {
    vec2 p = vFlow;
    float wave = ${sum};
    diffuseColor.rgb *= 1.0 + wave * ${WATER_AMP.toFixed(4)};
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
    for (const m of this.mats) m.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
