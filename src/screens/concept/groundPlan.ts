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
 * `depth` orders coplanar surfaces: every one of these sits on the SAME plane,
 * so without an explicit order they z-fight. Higher = drawn on top.
 */
const TONES: Record<string, { color: number; depth: number }> = {
  /** the Neva — the darkest tone, so the water reads as a mass */
  Color_H08: { color: 0xd8e2ec, depth: 0 },
  /** neighbouring city blocks — barely separated from the field */
  Color_M02: { color: 0xe6ecf3, depth: 1 },
  /** Арсенальная наб. + ул. Комсомола — lighter than the field, so the roads
   *  read as ribbons cut through it rather than as more blocks */
  Color_M04: { color: 0xffffff, depth: 2 },
};
const FALLBACK = { color: 0xe6ecf3, depth: 1 };

/** how far the plan fades toward the field while a building is focused. Not
 *  all the way: the site keeps its ground, it just stops competing. */
const FOCUS_FADE = 0.55;

export class GroundPlan {
  readonly group = new THREE.Group();

  private mats: THREE.MeshBasicMaterial[] = [];
  private base: THREE.Color[] = [];
  private readonly bg = new THREE.Color(MAP_BG);

  constructor(surfaces: FlatSurface[]) {
    for (const s of surfaces) {
      const tone = TONES[s.materialName] ?? FALLBACK;
      const mat = new THREE.MeshBasicMaterial({
        color: tone.color,
        // Unlit on purpose. A lit plane under mapStudio's raking key would take
        // a gradient and a hotspot; a schematic wants to read as a drawing, one
        // flat tone per class.
        //
        // toneMapped:false is load-bearing, not a micro-optimisation: the
        // renderer runs NeutralToneMapping, which would roll #ffffff down to a
        // grey — while MAP_BG is written as the clear colour and is NOT tone
        // mapped. Without this the plan and the field would sit in two
        // different tonal spaces and the ramp above would be meaningless.
        toneMapped: false,
        // same SketchUp winding problem as the volumes (see mapLooks.ts): faces
        // are wound both ways, so FrontSide punches holes in the plan
        side: THREE.DoubleSide,
        // coplanar decal stacking. Under an orthographic camera looking square
        // at the plane the slope term is ~0, so `units` is what actually
        // separates the layers; `factor` only matters once focus mode tilts.
        polygonOffset: true,
        polygonOffsetFactor: -tone.depth,
        polygonOffsetUnits: -4 * tone.depth,
      });

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
