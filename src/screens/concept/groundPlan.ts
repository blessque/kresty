import * as THREE from 'three';
import { MAP_BG } from './mapLooks';
import { applyWater, type WaterHandle } from './water';
import { WATER_DEFAULTS } from './waterParams';

/**
 * The flat site plan under the buildings — the Neva and the two roads, which
 * `map-fixed-roads.glb` carries as zero-thickness surfaces.
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
 * The GLB cooperates: both flat primitives sit on one plane (local z ≈ 128.128)
 * which, after the node's Z-up→Y-up rotation, IS the model's minimum world y —
 * and ConceptScreen's normalize already puts the model's minimum at y = 0.
 * There is no baseline to fudge.
 *
 * "One plane" is now approximate rather than exact: round 15's export scatters
 * those vertices over 3.4e-3 local units, ≈1e-4 once the model is normalized to
 * its 300-unit span. That is three orders below what `PLAN_PUSH` resolves, and
 * it buys the shear ~1e-4 px of travel at full lean — i.e. the invariance is
 * numerically intact, just no longer algebraically exact. Worth knowing before
 * anyone re-derives the argument from an equality that no longer holds.
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
const TONES: Record<string, { color: number; depth: number; hidden?: true }> = {
  /** The Neva — the only surface with real hue, so the water reads as water.
   *  The value itself lives in waterParams.ts, because the admin panel tunes it
   *  alongside the ripple and two sources of truth for one colour is how they
   *  drift apart. */
  Color_H08: { color: WATER_DEFAULTS.color, depth: 0 },
  /**
   * Neighbouring city blocks — a solidly present grey that framed the site.
   *
   * ROUND 12 hid them at the designer's request; ROUND 15's export DELETED the
   * primitive outright, so this entry no longer matches anything the GLB ships.
   *
   * It is kept anyway, and not out of sentiment: without it a re-export that
   * brings `Color_M02` back would fall through to FALLBACK — which is
   * `0xccd7dd` at depth 1, i.e. EXACTLY the tone these were drawn in before
   * round 12. The blocks would silently reappear, correctly styled, and look
   * like they had never been removed. Three lines of guard against un-deciding
   * a composition call by accident.
   *
   * (Nothing was ever cut out by hiding them: they were their own primitive
   * sharing no geometry with the streets or the river, and what shows through
   * is mapStudio's #dde6e9 ground plate — which already IS the site's ground,
   * since the GLB carries no surface for the site itself.)
   */
  Color_M02: { color: 0xccd7dd, depth: 1, hidden: true },
  /** Арсенальная наб. + ул. Комсомола — lighter than the ground plate, so the
   *  streets read as ribbons cut through it rather than as more blocks */
  Color_M04: { color: 0xf5f5f5, depth: 2 },
};
const FALLBACK = { color: 0xccd7dd, depth: 1 };

/** the one surface that gets the ripple shader — see water.ts */
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

export class GroundPlan {
  readonly group = new THREE.Group();

  private mats: THREE.MeshBasicMaterial[] = [];
  private base: THREE.Color[] = [];
  private readonly bg = new THREE.Color(MAP_BG);
  private water?: WaterHandle;
  private waterIndex = -1;
  private still = false;

  /** the admin panel's live handle on the river; undefined until the GLB loads */
  get river(): WaterHandle | undefined {
    return this.water;
  }

  /**
   * Retint the Neva.
   *
   * `base` too, not just the live colour: `setFocus` lerps the material from
   * `base` toward the field every frame, so writing only `mat.color` would be
   * undone on the next frame the focus spring moves.
   */
  setWaterColor(hex: number) {
    if (this.waterIndex < 0) return;
    this.base[this.waterIndex].setHex(hex);
    this.mats[this.waterIndex].color.setHex(hex);
  }

  constructor(surfaces: FlatSurface[]) {
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const s of surfaces) {
      const tone = TONES[s.materialName] ?? FALLBACK;
      // Suppressed surface classes never become meshes at all. Done here rather
      // than in ConceptScreen's traverse because this file owns the material →
      // look mapping, and because MapLabels is handed the same `flats` array
      // afterwards and must still see every surface to recover its features.
      // Nothing to dispose: a geometry no mesh ever referenced was never
      // uploaded, so it holds no GPU resource — only the CPU-side arrays, which
      // the caller's array still owns.
      if (tone.hidden) continue;
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

      if (s.materialName === WATER_MATERIAL) {
        this.water = applyWater(mat);
        this.waterIndex = this.mats.length;
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

  /** advance the river; `t` is elapsed seconds. Frozen under reduced motion —
   *  which is also the hook that lets the plan's shear invariance be re-proved
   *  over the water region, since a still river makes the whole plan static. */
  update(t: number) {
    if (!this.still) this.water?.update(t);
  }

  /** `t` = MapCamera.focus, 0 = overview, 1 = focused on one building */
  setFocus(t: number) {
    const k = t * FOCUS_FADE;
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.copy(this.base[i]).lerp(this.bg, k);
    }
  }

  dispose() {
    this.water?.dispose();
    for (const m of this.mats) m.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
