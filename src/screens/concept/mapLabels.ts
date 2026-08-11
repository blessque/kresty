import * as THREE from 'three';
import type { BuildingPart } from './buildingSplit';
import { BUILDING_MARKS, SITE_MARKS, alignShift, createMark } from './mapMarks';

/**
 * The map's caption layer: project each authored anchor, write one transform.
 *
 * DOM, not 3D text: three has no text primitive without pulling in a font
 * loader and a glyph mesh per caption, and the project's type is already the
 * web fonts in `styles/fonts.css`. A projected DOM node stays crisp at any DPR,
 * costs one `transform` write per frame, and inherits the site's typography for
 * free.
 *
 * ---------------------------------------------------------------------------
 * ROUND 18 RETIRED THE SOLVER. Do not rebuild it without re-reading this.
 *
 * Rounds 9–15 recovered «р. Нева», «Арсенальная наб.» and «ул. Комсомола» as
 * connected components of their materials and searched each polygon for an
 * interior point — a grid walk scored on clearance-to-boundary, with obstacle
 * rects read off the live chrome and a rule against straddling the resting
 * fold. It was ~400 lines and it was correct; what killed it is that its inputs
 * kept disappearing. Round 12 squared the plan to the screen and pushed
 * ул. Комсомола off the top; round 15 straightened Арсенальная наб. clean below
 * the frame; by then neither road was DRAWN at all in the resting composition
 * and the solver's answers were being clamped into the margin band anyway.
 * Round 17 authored both street names into that band instead, and round 18 cut
 * the river caption, which was the last feature with a polygon to sit inside.
 *
 * With nothing left to search for, the search is gone. What remains is worth
 * stating plainly because it is the whole module: every caption is authored in
 * `mapMarks.ts` as an offset in fractions of the site span, is converted once to
 * a world-space anchor here, and is then projected per frame. There is no
 * per-frame correction, no pixel clamp, and no state that a resize invalidates.
 *
 * The one property doing the work is unchanged from round 10: the overview
 * camera is orthographic and the plan-oblique shear is the identity at y = 0, so
 * the whole model→screen chain is a single AFFINE map. That is why an anchor
 * fixed once stays welded to its feature at every shear, zoom and window size.
 */

/** captions fade out as the camera swings to a focused building — the
 *  isometric view is not a plan, and a plan caption reads as a mistake there */
const FADE_POWER = 2;

/**
 * The canvas the captions are projected into — the 150vh map stage, NOT the
 * window. `restH` and `scrollTop` are the resting viewport and the map's own
 * scroll; they are part of the view the caller measures.
 */
export interface StageView {
  w: number;
  h: number;
  restH: number;
  scrollTop: number;
}

interface Label {
  el: HTMLElement;
  /** world-space anchor, fixed at build time */
  at: THREE.Vector3;
  /**
   * The CSS x-shift that puts the mark's own anchor edge on the projected
   * point — `-50%` for everything the design centres, `0%`/`-100%` for the
   * blocks it aligns. See `alignShift`.
   */
  shift: string;
}

export class MapLabels {
  private labels: Label[] = [];
  private readonly layer = document.createElement('div');
  private a = new THREE.Vector3();

  constructor(stage: HTMLElement) {
    this.layer.className = 'map-labels';
    stage.appendChild(this.layer);
  }

  /**
   * Convert every authored mark to a world-space anchor — Figma 591:194, the
   * table in `mapMarks.ts`. `modelMatrix` is the root's normalize transform.
   *
   * A building mark's anchor sits on the ROOF (`bbox.max.y`), and that is the
   * whole trick: restricted to a horizontal plane at height h the plan-oblique
   * shear `x' = x + sx·y, z' = z + sz·y` becomes `(x, z) → (x + sx·h, z + sz·h)`
   * — it has no linear part left, so it is a pure TRANSLATION. A mark anchored
   * up there slides exactly as far as its roof does and never skews, with no
   * per-frame correction of any kind. (The OFFSET is measured from the
   * footprint, which is a separate question — see `mapMarks.ts`, round 18.)
   *
   * A site mark sits at y = 0, the shear's fixed point, so it does not move with
   * the lean at all. Its offset is measured from the WORLD origin, which is the
   * site's own centre at grade: `ConceptScreen` seats the model with
   * `position = (−center·scale, −groundY·scale, −center·scale)`, so that point
   * is (0, 0, 0) by construction and needs no measuring here.
   */
  build(parts: BuildingPart[], modelMatrix: THREE.Matrix4, siteSpan: number) {
    this.clear();
    const byId = new Map(parts.map((p) => [p.id, p]));
    // the model's normalize scale, so a site offset in MODEL units (which is
    // what `siteSpan` is measured in) lands at the right world distance
    const scale = new THREE.Vector3().setFromMatrixScale(modelMatrix).x;

    for (const mark of [...BUILDING_MARKS, ...SITE_MARKS]) {
      let at: THREE.Vector3;
      if (mark.on) {
        const part = byId.get(mark.on);
        if (!part) continue;
        const c = part.bbox.getCenter(new THREE.Vector3());
        at = new THREE.Vector3(
          c.x + mark.at[0] * siteSpan,
          part.bbox.max.y,
          c.z + mark.at[1] * siteSpan
        ).applyMatrix4(modelMatrix);
      } else {
        at = new THREE.Vector3(
          mark.at[0] * siteSpan * scale,
          0,
          mark.at[1] * siteSpan * scale
        );
      }
      const el = createMark(mark);
      this.layer.appendChild(el);
      this.labels.push({ el, at, shift: alignShift(mark.align) });
    }
  }

  /**
   * Project and place; `focus` is MapCamera.focus, `shear` is the live
   * plan-oblique matrix.
   *
   * Every anchor goes through `shear` — including the site marks, for which it
   * is PROVABLY a no-op, since they sit on y = 0 and that plane is the shear's
   * fixed point. One code path serves both kinds; the alternative was a
   * per-label flag guarding a branch that can only ever be false.
   */
  update(camera: THREE.Camera, view: StageView, focus: number, shear: THREE.Matrix4) {
    const { w, h } = view;
    const vis = Math.max(0, 1 - focus) ** FADE_POWER;
    if (vis <= 0.001) {
      this.layer.style.opacity = '0';
      return;
    }
    this.layer.style.opacity = String(vis);

    for (const l of this.labels) {
      this.a.copy(l.at).applyMatrix4(shear).project(camera);
      const x = (this.a.x * 0.5 + 0.5) * w;
      const y = (-this.a.y * 0.5 + 0.5) * h;

      // A turned mark rotates its TEXT, in `mapMarks`, not its box — so nothing
      // here needs to know about rotation, and the box a mark occupies stays
      // the one the browser laid out.
      l.el.style.transform =
        `translate(${l.shift}, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  private clear() {
    this.layer.innerHTML = '';
    this.labels = [];
  }
}
