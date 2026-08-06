import * as THREE from 'three';
import type { BuildingPart } from './buildingSplit';

/**
 * The map's orthographic camera and its two poses.
 *
 * OVERVIEW — pinned straight top-down, never rotating. This is the locked
 * plan-oblique rule (TUNING_LOG map round 4): rotating an ortho camera
 * compresses the roof plan by cos θ, so the overview must not rotate.
 *
 * FOCUS — a classic isometric view of one building. The round-4 rule is
 * SUSPENDED here on purpose (round 8, agreed with the designer): the focused
 * detail view is not the plan drawing, and the isometric angle is what makes a
 * building read as a volume — roof plus two wall faces get different normals,
 * so the raking key finally gives three distinct tones. Top-down never could,
 * because every flat roof shares one normal.
 *
 * The caller must unwind the shear to zero as `focus` rises: shear and camera
 * rotation compound into a skewed mess if both are applied at once.
 */

/** classic isometric elevation, atan(1/√2) */
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);
/** camera distance — irrelevant to ortho framing, just keeps the scene inside
 *  the near/far planes from any angle */
const DIST = 400;
/** padding inside the region the focused building is framed into */
const FOCUS_PAD = 0.78;
/** never zoom in past this fraction of the overview framing — without it a
 *  small shed would fill the screen at absurd magnification */
const MIN_HALF_H_FRAC = 0.16;
/** spring settle time (s); lower = snappier */
const TAU = 0.26;

/** critically damped spring — chosen over a fixed-duration tween because the
 *  camera must retarget mid-flight when a second building is clicked. */
class Spring {
  constructor(public value: number, private vel = 0) {}
  step(target: number, dt: number) {
    const w = 1 / TAU;
    this.vel += (-2 * w * this.vel - w * w * (this.value - target)) * dt;
    this.value += this.vel * dt;
  }
  snap(target: number) {
    this.value = target;
    this.vel = 0;
  }
}

export class MapCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  /** 0 = overview, 1 = fully focused; the caller scales the shear by 1 − this */
  focus = 0;

  private maxShear = 0.8;
  private fitMargin = 1;
  private fitHalfX = 150;
  private fitHalfZ = 150;
  private fitTopY = 75;

  private viewW = 1;
  private viewH = 1;
  private inset = 0; // drawer width in px
  private overscan = 1;

  // animated state
  private halfH = new Spring(150);
  private ndcX = new Spring(0);
  private focusSpring = new Spring(0);
  private target = new THREE.Vector3();
  private targetTo = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private quatTo = new THREE.Quaternion();

  private overviewQuat = new THREE.Quaternion();
  private focusPart: BuildingPart | null = null;
  private azimuth = 0;
  // MUST be a Camera, not a plain Object3D: Object3D.lookAt() points +Z at the
  // target, while the camera branch points −Z at it (cameras look down their
  // own −Z). With an Object3D every orientation comes out reversed — the plan
  // renders mirrored and the isometric pose ends up underneath the model.
  private tmp = new THREE.Camera();

  constructor() {
    // overview orientation: looking straight down with north (−Z) up on screen
    this.tmp.position.set(0, DIST, 0);
    this.tmp.up.set(0, 0, -1);
    this.tmp.lookAt(0, 0, 0);
    this.overviewQuat.copy(this.tmp.quaternion);
    this.quat.copy(this.overviewQuat);
    this.quatTo.copy(this.overviewQuat);
  }

  setModelExtents(halfX: number, halfZ: number, topY: number) {
    this.fitHalfX = halfX;
    this.fitHalfZ = halfZ;
    this.fitTopY = topY;
  }

  setDials(maxShear: number, fitMargin: number) {
    this.maxShear = maxShear;
    this.fitMargin = fitMargin;
  }

  /**
   * `inset` = width in px of the drawer occupying the left edge.
   *
   * This is the DESIGN VIEWPORT — the window — not the canvas. Round 14 made
   * the canvas 1.5x taller than the window, and every fit here must keep being
   * measured against the window; see setOverscan.
   */
  setViewport(w: number, h: number, inset: number) {
    this.viewW = w;
    this.viewH = h;
    this.inset = inset;
  }

  /**
   * canvasH / viewportH (round 14's 150vh map scroll, 1 before it).
   *
   * The FIT MUST NOT SEE THIS. `overviewHalfH` returns
   * `max(needH, needW / aspect)` and the current framing is height-bound;
   * feeding it the taller canvas's aspect (1.80 → 1.20) flips it width-bound
   * and renders the buildings ~35% larger than the framing signed off in round
   * 13 — the exact opposite of what a scroll added to inspect the water at its
   * shipped scale is for.
   *
   * So the fit stays on the window and the extra height is bolted on afterwards
   * in `applyToCamera`, which gives two properties worth stating:
   *   - world units per pixel are bit-for-bit unchanged, because the frustum
   *     grows by exactly the factor the canvas does;
   *   - the camera target stays centred in the TOP viewport band, so at
   *     scrollTop 0 the composition is pointwise the pre-scroll one — in the
   *     overview and in focus mode, where the focused building must still land
   *     in the middle of the screen.
   */
  setOverscan(k: number) {
    this.overscan = Math.max(1, k);
  }

  /** null returns to the overview */
  focusOn(part: BuildingPart | null) {
    this.focusPart = part;
    if (!part) return;

    // Four diagonals show the same pair of façades; take the one nearest the
    // current azimuth so consecutive clicks swing the short way instead of
    // lurching — this is what keeps per-building angles from disorienting.
    const base = part.axisAngle + Math.PI / 4;
    let best = base;
    let bestDelta = Infinity;
    for (let k = 0; k < 4; k++) {
      const cand = base + (k * Math.PI) / 2;
      const d = Math.abs(shortestAngle(cand - this.azimuth));
      if (d < bestDelta) {
        bestDelta = d;
        best = cand;
      }
    }
    this.azimuth = best;

    // the building's centre in world space (model transform, no shear — the
    // shear is unwinding to zero as we arrive)
    this.targetTo.copy(part.centroid).applyMatrix4(this.modelMatrix);

    const dir = new THREE.Vector3(
      Math.cos(ISO_ELEVATION) * Math.sin(best),
      Math.sin(ISO_ELEVATION),
      Math.cos(ISO_ELEVATION) * Math.cos(best)
    );
    this.tmp.position.copy(this.targetTo).addScaledVector(dir, DIST);
    this.tmp.up.set(0, 1, 0);
    this.tmp.lookAt(this.targetTo);
    this.quatTo.copy(this.tmp.quaternion);
  }

  update(dt: number) {
    const focusing = this.focusPart !== null;
    this.focusSpring.step(focusing ? 1 : 0, dt);
    this.focus = this.focusSpring.value;

    if (!focusing) {
      this.targetTo.set(0, 0, 0);
      this.quatTo.copy(this.overviewQuat);
    }

    this.halfH.step(focusing ? this.focusHalfH() : this.overviewHalfH(), dt);
    this.ndcX.step(focusing ? this.regionNdcX() : 0, dt);
    this.target.lerp(this.targetTo, 1 - Math.exp(-dt / TAU));
    // slerp the ORIENTATION rather than animating azimuth/elevation: an orbit
    // parameterisation is degenerate at 90° elevation, which is exactly where
    // the overview sits.
    this.quat.slerp(this.quatTo, 1 - Math.exp(-dt / TAU));

    this.applyToCamera();
  }

  /** jump straight to the current target (transition priming, resize) */
  snap() {
    const focusing = this.focusPart !== null;
    this.focusSpring.snap(focusing ? 1 : 0);
    this.focus = this.focusSpring.value;
    if (!focusing) {
      this.targetTo.set(0, 0, 0);
      this.quatTo.copy(this.overviewQuat);
    }
    this.halfH.snap(focusing ? this.focusHalfH() : this.overviewHalfH());
    this.ndcX.snap(focusing ? this.regionNdcX() : 0);
    this.target.copy(this.targetTo);
    this.quat.copy(this.quatTo);
    this.applyToCamera();
  }

  private applyToCamera() {
    const aspect = this.viewW / this.viewH;
    const halfH = this.halfH.value;
    const halfW = halfH * aspect;
    // off-centre framing is a FRUSTUM offset, not a camera move: with the
    // target at view origin, shifting the frustum centre puts it at ndcX.
    const cx = -this.ndcX.value * halfW;
    this.camera.left = cx - halfW;
    this.camera.right = cx + halfW;
    // The top edge is the fixed one and the frustum grows DOWNWARD, so the
    // window-sized band at the top of the canvas keeps framing the target
    // symmetrically. Asymmetric ortho bounds are already how the drawer inset
    // works horizontally (`cx` above) — same mechanism, other axis.
    this.camera.top = halfH;
    this.camera.bottom = halfH - 2 * halfH * this.overscan;
    this.camera.updateProjectionMatrix();

    this.camera.quaternion.copy(this.quat);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
    this.camera.position.copy(this.target).addScaledVector(back, DIST);
    this.camera.updateMatrixWorld();
  }

  /** the whole plan, plus worst-case shear reach, on both axes */
  private overviewHalfH(): number {
    const aspect = this.viewW / this.viewH;
    const reach = Math.abs(this.maxShear) * this.fitTopY;
    const needW = this.fitHalfX + reach;
    const needH = this.fitHalfZ + reach;
    return Math.max(needH, needW / aspect) * this.fitMargin;
  }

  /** centre of the area right of the drawer, in NDC x */
  private regionNdcX(): number {
    const centrePx = this.inset + (this.viewW - this.inset) / 2;
    return (centrePx / this.viewW) * 2 - 1;
  }

  /** fit the focused building's projected extent into that region */
  private focusHalfH(): number {
    const part = this.focusPart!;
    const aspect = this.viewW / this.viewH;
    // project the part's 8 world-space bbox corners into the FINAL camera
    // orientation, so the framing target is stable while the swing animates
    const inv = new THREE.Quaternion().copy(this.quatTo).invert();
    const box = part.bbox;
    const v = new THREE.Vector3();
    let ex = 0;
    let ey = 0;
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      );
      v.applyMatrix4(this.modelMatrix).sub(this.targetTo).applyQuaternion(inv);
      ex = Math.max(ex, Math.abs(v.x));
      ey = Math.max(ey, Math.abs(v.y));
    }
    const regionFrac = (this.viewW - this.inset) / this.viewW;
    const byH = ey / FOCUS_PAD;
    const byW = ex / (regionFrac * FOCUS_PAD) / aspect;
    return Math.max(byH, byW, this.overviewHalfH() * MIN_HALF_H_FRAC);
  }

  private modelMatrix = new THREE.Matrix4();
  setModelMatrix(m: THREE.Matrix4) {
    this.modelMatrix.copy(m);
  }
}

/** wrap to (−π, π] */
function shortestAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
