import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/**
 * Fat white lines along the model's hard edges — the «Грани» variant's
 * "drawing" layer.
 *
 * The reference cut-crystal icons read as crisp because their bevels catch
 * light. This geometry has hard 90° corners and no bevels, so nothing catches;
 * explicit edge lines supply that contour instead.
 *
 * Measured on map.glb: ~7,263 hard edges at a 30° threshold (7,348 at 20°,
 * 7,047 at 45° — the creases are genuine, not threshold noise), which is
 * trivial for LineSegments2's instanced quads.
 *
 * Plain LineBasicMaterial cannot do this: WebGL clamps `linewidth` to 1, so
 * the lines would be hairlines that vanish at high DPR.
 */
export const EDGE_ANGLE_DEG = 17.5;

export function makeEdgeMaterial(
  override: { color?: number; linewidth?: number; opacity?: number } = {}
): LineMaterial {
  return new LineMaterial({
    color: override.color ?? 0xffffff,
    // in CSS pixels; needs `resolution` kept in sync (see ConceptScreen.resize)
    linewidth: override.linewidth ?? 1,
    transparent: true,
    opacity: override.opacity ?? 0.4,
    depthTest: true,
    // lines are the drawing — they must not be occluded away by the hazy
    // alpha-blended fill they sit on
    depthWrite: false,
    // …and they must not LOSE THE TIE to it either. An edge line is exactly
    // coplanar with the two faces that produce it, so whether it survives the
    // depth test is decided by float error in the rasteriser's interpolation —
    // which means it is decided by how the exporter happened to triangulate
    // that face. Round 15's model re-triangulated the Ротонда's roof and its
    // two ribs silently lost the coin toss and vanished; the drum went flat.
    //
    // A tiny bias toward the camera settles the tie the way the drawing wants
    // it settled, everywhere, and it is the SAME tool groundPlan.ts uses for
    // the same class of problem (PLAN_PUSH, the pier-vs-river flicker). It
    // biases only the depth VALUE written, never the vertex, so nothing moves
    // on screen. Small on purpose: this must win coplanar ties and nothing
    // else — disabling depthTest instead over-reveals, drawing edges that a
    // taller building in front should legitimately hide (measured: brighter
    // than the pre-round-15 model, not equal to it).
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

/**
 * Builds one LineSegments2 per mesh and parents it to that mesh, so the lines
 * inherit the model's normalize transform AND the per-frame shear for free.
 * Returns the created objects so the caller can remove/dispose them on a
 * variant switch.
 */
export function buildEdgeLines(
  root: THREE.Object3D,
  material: LineMaterial,
  angleDeg = EDGE_ANGLE_DEG
): LineSegments2[] {
  const made: LineSegments2[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });

  for (const mesh of meshes) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, angleDeg);
    const pos = edges.getAttribute('position');
    const flat = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      flat[i * 3] = pos.getX(i);
      flat[i * 3 + 1] = pos.getY(i);
      flat[i * 3 + 2] = pos.getZ(i);
    }
    edges.dispose();

    const geo = new LineSegmentsGeometry();
    geo.setPositions(flat);

    const seg = new LineSegments2(geo, material);
    seg.computeLineDistances();
    // Excluded from picking: fat-line raycasting is expensive, and the lines
    // would otherwise intercept hits meant for the building mesh they sit on.
    seg.raycast = () => {};
    // parented to the mesh: same local space, so no transform bookkeeping
    mesh.add(seg);
    made.push(seg);
  }
  return made;
}

export function disposeEdgeLines(lines: LineSegments2[]): void {
  for (const l of lines) {
    l.removeFromParent();
    l.geometry.dispose();
  }
}
