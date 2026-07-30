import * as THREE from 'three';

/**
 * The «Грани» look — the one the designer picked out of round 6's three
 * candidates. Edge-forward: an alpha-blended body carries atmosphere while the
 * fat white edge lines (edgeLines.ts) do the drawing.
 *
 * NO transmission on purpose: alpha blending is the only way to see buildings
 * THROUGH other buildings — transmissive meshes are invisible to each other in
 * three's transmission pass. It also means this is an ordinary lit PBR surface,
 * so the light rig in mapStudio.ts genuinely drives the shading.
 *
 * These numbers are hand-tuned by the designer. Change them only on request.
 */

/** near-white studio field */
export const MAP_BG = 0xf2f6fa;

export interface MapMaterialSpec {
  color: number;
  roughness: number;
  transmission: number;
  /** in normalized world units — ConceptScreen divides the model scale back
   *  out, because three multiplies thickness by the model's world scale */
  thickness: number;
  ior: number;
  attenuationColor: number;
  attenuationDistance: number;
  envMapIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  iridescence: number;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}

export const MAP_LOOK: MapMaterialSpec = {
  // deeper than the field on purpose: the white edge lines are the drawing and
  // need a body dark enough to read against
  color: 0x2f86c4,
  roughness: 0.1,
  transmission: 0,
  thickness: 125,
  ior: 1.45,
  attenuationColor: 0xffffff,
  attenuationDistance: Infinity,
  envMapIntensity: 1.1,
  clearcoat: 1,
  clearcoatRoughness: 0.2,
  iridescence: 0.5,
  transparent: true,
  opacity: 0.5,
  depthWrite: true,
};

/** hovered building — lifted and warmed so it separates from its neighbours */
export const MAP_LOOK_HOVER: Partial<MapMaterialSpec> = {
  color: 0x1f6fae,
  opacity: 0.72,
  envMapIntensity: 1.4,
};

/** the building whose drawer is open — denser glass, not a different material:
 *  the project's glass language is kept through focus (round 8 decision) */
export const MAP_LOOK_SELECTED: Partial<MapMaterialSpec> = {
  color: 0x1f78b8,
  opacity: 0.82,
  envMapIntensity: 1.5,
};

/** everything else while a building is focused — pulled back to roughly 40% of
 *  normal presence and desaturated toward grey, so the focused volume owns the
 *  view without the surroundings disappearing entirely */
export const MAP_LOOK_DIMMED: Partial<MapMaterialSpec> = {
  color: 0x8fa6b8,
  opacity: 0.2,
  envMapIntensity: 0.5,
  clearcoat: 0,
  iridescence: 0,
};

export function buildMaterial(
  spec: MapMaterialSpec = MAP_LOOK,
  override: Partial<MapMaterialSpec> = {}
): THREE.MeshPhysicalMaterial {
  const m = { ...spec, ...override };
  return new THREE.MeshPhysicalMaterial({
    color: m.color,
    metalness: 0,
    roughness: m.roughness,
    transmission: m.transmission,
    thickness: m.thickness,
    ior: m.ior,
    attenuationColor: new THREE.Color(m.attenuationColor),
    attenuationDistance: m.attenuationDistance,
    envMapIntensity: m.envMapIntensity,
    clearcoat: m.clearcoat,
    clearcoatRoughness: m.clearcoatRoughness,
    iridescence: m.iridescence,
    specularIntensity: 1,
    transparent: m.transparent,
    opacity: m.opacity,
    depthWrite: m.depthWrite,
    // DoubleSide is REQUIRED, not a preference: the GLB is a SketchUp export
    // with 1537 down-facing vs 1245 up-facing triangles in primitive 0 — many
    // roof faces are wound facing down — plus 221 flipped-winding and 126
    // boundary edges. Under FrontSide those back-face cull and punch visible
    // holes in the roofs. Never "optimize" this back to FrontSide.
    side: THREE.DoubleSide,
  });
}
