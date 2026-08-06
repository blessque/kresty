import * as THREE from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  MAP_LOOK,
  MAP_LOOK_HOVER,
  MAP_LOOK_SELECTED,
  MAP_LOOK_DIMMED,
  buildMaterial,
} from './mapLooks';
import { makeEdgeMaterial } from './edgeLines';
import type { BuildingPart } from './buildingSplit';

/**
 * Hover/selection for the split building meshes.
 *
 * Owns four body materials and three edge materials — the states are expressed
 * by swapping material REFERENCES on the affected mesh, never by cloning a
 * material per building.
 */
export class BuildingPicker {
  readonly buildings: THREE.Mesh[] = [];
  hoverId: string | null = null;
  selectedId: string | null = null;
  onHoverChange: (id: string | null) => void = () => {};

  readonly edge: LineMaterial;
  private readonly edgeHover: LineMaterial;
  private readonly edgeDim: LineMaterial;
  private readonly base: THREE.MeshPhysicalMaterial;
  private readonly hover: THREE.MeshPhysicalMaterial;
  private readonly sel: THREE.MeshPhysicalMaterial;
  private readonly dim: THREE.MeshPhysicalMaterial;

  private parts = new Map<string, BuildingPart>();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2(-2, -2); // off-screen until the first move
  private resW = 1;
  private resH = 1;

  constructor() {
    this.base = buildMaterial();
    this.hover = buildMaterial(MAP_LOOK, MAP_LOOK_HOVER);
    this.sel = buildMaterial(MAP_LOOK, MAP_LOOK_SELECTED);
    this.dim = buildMaterial(MAP_LOOK, MAP_LOOK_DIMMED);
    this.edge = makeEdgeMaterial();
    this.edgeHover = makeEdgeMaterial({ opacity: 1, linewidth: 1.6 });
    this.edgeDim = makeEdgeMaterial({ opacity: 0.12 });
  }

  add(mesh: THREE.Mesh, part: BuildingPart) {
    mesh.userData.buildingId = part.id;
    mesh.material = this.base;
    this.buildings.push(mesh);
    this.parts.set(part.id, part);
  }

  part(id: string | null): BuildingPart | undefined {
    return id ? this.parts.get(id) : undefined;
  }

  mesh(id: string | null): THREE.Mesh | undefined {
    return this.buildings.find((m) => m.userData.buildingId === id);
  }

  /** three multiplies thickness by the model's world scale when building the
   *  volume transmission ray — divide the normalize scale back out */
  setModelScale(scale: number) {
    for (const m of [this.base, this.hover, this.sel, this.dim]) {
      m.thickness = MAP_LOOK.thickness / scale;
    }
  }

  /** fat lines are screen-space and need the pixel resolution */
  setResolution(w: number, h: number) {
    this.resW = w;
    this.resH = h;
    for (const e of [this.edge, this.edgeHover, this.edgeDim]) e.resolution.set(w, h);
  }

  /**
   * Pointer position in CANVAS pixels, not window pixels.
   *
   * Round 14: the canvas is 1.5x the window's height and scrolls under it, so
   * `innerHeight` stopped being the NDC divisor and the caller has to add the
   * scroll offset. Without both halves of that the hover silently drifts by
   * however far you have scrolled — the map still highlights buildings, just
   * the wrong ones.
   */
  setPointer(canvasX: number, canvasY: number) {
    this.ndc.set((canvasX / this.resW) * 2 - 1, -(canvasY / this.resH) * 2 + 1);
  }

  /**
   * Picked per frame, not per pointermove: the shear moves geometry under a
   * stationary cursor, so the hovered building changes without the pointer.
   */
  update(scene: THREE.Scene, camera: THREE.Camera) {
    if (!this.buildings.length) return;
    scene.updateMatrixWorld(); // shearGroup.matrixAutoUpdate is false
    this.ray.setFromCamera(this.ndc, camera);
    const hit = this.ray.intersectObjects(this.buildings, false)[0];
    const id = (hit?.object.userData.buildingId as string) ?? null;
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.onHoverChange(id);
    this.apply();
  }

  select(id: string | null) {
    this.selectedId = id;
    this.apply();
  }

  private apply() {
    const focusing = this.selectedId !== null;
    for (const mesh of this.buildings) {
      const id = mesh.userData.buildingId as string;
      const on = id === this.selectedId;
      const hot = id === this.hoverId;
      // while focused, everything that is not the subject recedes
      mesh.material = on ? this.sel : focusing ? this.dim : hot ? this.hover : this.base;
      const line = mesh.children[0] as LineSegments2 | undefined;
      if (line) {
        line.material = on ? this.edgeHover : focusing ? this.edgeDim : hot ? this.edgeHover : this.edge;
      }
    }
  }
}
