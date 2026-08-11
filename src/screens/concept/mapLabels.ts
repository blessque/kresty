import * as THREE from 'three';
import { connectedComponents, type MeshComponent, type BuildingPart } from './buildingSplit';
import type { FlatSurface } from './groundPlan';
import { BUILDING_MARKS, SITE_MARKS, alignShift, createMark } from './mapMarks';

/**
 * The map's caption layer: one solved caption, and the authored marks.
 *
 * DOM, not 3D text: three has no text primitive without pulling in a font
 * loader and a glyph mesh per caption, and the project's type is already the
 * web fonts in `styles/fonts.css`. A projected DOM node stays crisp at any DPR,
 * costs one `matrix` write per frame, and inherits the site's typography for
 * free.
 *
 * ---------------------------------------------------------------------------
 * ROUND 17 RETIRED THE STREET SOLVER, and left the river's standing.
 *
 * Rounds 9–15 recovered «Арсенальная наб.» and «ул. Комсомола» as connected
 * components of `Color_M04` and searched each road for an interior point. That
 * machinery was sound and it kept losing anyway, because the thing it solved
 * for stopped existing: round 12 squared the plan to the screen and pushed
 * ул. Комсомола off the top, round 15 straightened Арсенальная наб. clean below
 * the frame, and by then neither road was drawn at all in the resting
 * composition. The solver's answers were being clamped into the margin band by
 * `SOLVE_MARGIN` — that is to say, the right answer was already the margin, and
 * the search was an expensive way to arrive there.
 *
 * The designer's frame (591:194) says so outright: both street names are set
 * upright in the white band outside the plate, in a lighter tint, the way a map
 * letters a feature that runs off the sheet. They are authored in `mapMarks.ts`
 * now. What is left here is the search, serving the one caption that still has
 * a visible feature to sit inside — the Neva.
 *
 * ---------------------------------------------------------------------------
 * ROUND 10: the anchor is an INTERIOR POINT, solved once — not a point plus
 * corrections.
 *
 * Rounds 9–9.5 placed each caption at the perpendicular foot of its feature
 * (genuinely on the feature) and then slid it by hand-tuned fractions of the
 * site span, with nothing re-testing that the result was still inside the
 * polygon. The Neva bends across the frame, so sliding half a site-span along
 * an axis measured back at the anchor walked «р. Нева» off the water and onto
 * the embankment. A second correction, `nudgeIntoView`, then clamped captions
 * against a fixed pixel INSET box — a screen-space term in a position that is
 * otherwise model-space, which is precisely why captions drifted relative to
 * the map when the window was resized.
 *
 * The fix rests on one property of this projection. The plan-oblique shear is
 * `x' = x + sx·y, z' = z + sz·y`, which is the IDENTITY at y = 0, and the
 * overview camera is orthographic. So for flat ground geometry the entire
 * model→screen chain is a single AFFINE map — and affine maps preserve
 * interiority. A point chosen inside a polygon in model space therefore
 * projects inside that polygon's projection at every shear, zoom and window
 * size, with no per-frame correction of any kind.
 *
 * That turns placement into a one-off search (`solve`), re-run only when the
 * viewport changes, with `update` reduced to a projection and a transform
 * write. There is no pixel clamp anywhere in the per-frame path.
 */

/** the material the river caption is recovered from */
const WATER_MAT = 'Color_H08';

const RIVER = 'р. Нева';

/**
 * Margin from the window edge the solver keeps clear, in px.
 *
 * A VISIBILITY constraint applied once while solving, NOT a per-frame clamp —
 * that distinction is the whole point of round 10.
 */
const SOLVE_MARGIN = 28;

/**
 * The fixed UI a caption must not collide with, as live selectors.
 *
 * Measured rects, not reserved bands. Round 10's first pass reserved 96px along
 * the WHOLE bottom edge to dodge one centred hint, which also walled off the
 * bottom-left corner — the exact spot «р. Нева» was asked to occupy — and
 * pushed the caption inward onto the pier. An element only actually obstructs
 * the box it occupies, so that is what gets excluded.
 */
const OBSTACLES = ['.concept-home', '.map-info'];

/** breathing room around each obstacle, px */
const OBSTACLE_PAD = 12;

/**
 * How much clear water the caption needs around its anchor, in px. Roughly half
 * a line box, so the caption sits on the river rather than straddling its bank.
 */
const MIN_CLEARANCE = 13;

/** search resolution, px. The solve is O(cells × edges) and runs at load and on
 *  resize only, so this can afford to be fine. */
const GRID_STEP = 5;

/** captions fade out as the camera swings to a focused building — the
 *  isometric view is not a plan, and a plan caption reads as a mistake there */
const FADE_POWER = 2;

/**
 * The canvas the captions are projected into — round 14's 150vh stage, NOT the
 * window.
 *
 * `restH` is the window's height: the band of the stage that is on screen when
 * the page is at rest. `scrollTop` is only ever needed to bring the
 * window-pinned obstacles into the same frame as the caption layer.
 */
export interface StageView {
  w: number;
  h: number;
  restH: number;
  scrollTop: number;
}

interface Feature {
  /** world-space triangle vertices, 3 per triangle */
  tris: THREE.Vector3[];
  /** world-space boundary segments, as [a, b] pairs */
  edges: [THREE.Vector3, THREE.Vector3][];
}

interface Label {
  el: HTMLElement;
  /** null for the authored marks — they are placed, not searched for */
  feature: Feature | null;
  /** world-space anchor; null until the river's first solve */
  at: THREE.Vector3 | null;
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
  private b = new THREE.Vector3();
  /** viewport the current anchors were solved for */
  private solvedFor = { w: 0, h: 0 };

  /**
   * `stage` is the scrolling map stage the caption layer belongs to; `chrome`
   * is the screen root the pinned UI lives on. Round 14 split the two — before
   * it they were the same element, and `solve` looked the obstacles up through
   * `layer.parentElement`, which now finds only the stage and would silently
   * report NO obstacles at all, letting a caption settle on the logo.
   */
  constructor(stage: HTMLElement, private readonly chrome: HTMLElement) {
    this.layer.className = 'map-labels';
    stage.appendChild(this.layer);
  }

  /**
   * `surfaces` are the flat plan geometries, in the same (already baked and
   * yaw-rotated) frame the GroundPlan meshes use. `modelMatrix` is the root's
   * normalize transform, applied here so anchors land in world space.
   */
  build(
    surfaces: FlatSurface[],
    parts: BuildingPart[],
    modelMatrix: THREE.Matrix4,
    siteSpan: number
  ) {
    this.clear();
    this.buildMarks(parts, modelMatrix, siteSpan);

    const water = biggest(components(surfaces, WATER_MAT));
    if (!water) return;
    const el = document.createElement('div');
    el.className = 'map-label map-label--river';
    el.textContent = RIVER;
    this.layer.appendChild(el);
    this.labels.push({
      el,
      feature: feature(water, modelMatrix),
      at: null,
      shift: '-50%',
    });
  }

  /**
   * Place the authored marks — Figma 591:194, the table in `mapMarks.ts`.
   *
   * A building mark's anchor sits on the ROOF (`bbox.max.y`), and that is the
   * whole trick: restricted to a horizontal plane at height h the plan-oblique
   * shear `x' = x + sx·y, z' = z + sz·y` becomes `(x, z) → (x + sx·h, z + sz·h)`
   * — it has no linear part left, so it is a pure TRANSLATION. A mark anchored
   * up there slides exactly as far as its roof does and never skews, with no
   * per-frame correction of any kind.
   *
   * A site mark sits at y = 0, the shear's fixed point, so it does not move with
   * the lean at all. Its offset is measured from the WORLD origin, which is the
   * site's own centre at grade: `ConceptScreen` seats the model with
   * `position = (−center·scale, −groundY·scale, −center·scale)`, so that point
   * is (0, 0, 0) by construction and needs no measuring here.
   */
  private buildMarks(
    parts: BuildingPart[],
    modelMatrix: THREE.Matrix4,
    siteSpan: number
  ) {
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
      this.labels.push({ el, feature: null, at, shift: alignShift(mark.align) });
    }
  }

  /**
   * Project and place; `focus` is MapCamera.focus, `shear` is the live
   * plan-oblique matrix.
   *
   * Every anchor goes through `shear` — including the plan captions, for which
   * it is PROVABLY a no-op, since they sit on y = 0 and that plane is the
   * shear's fixed point. One code path serves both kinds; the alternative was a
   * per-label flag guarding a branch that can only ever be false.
   */
  update(
    camera: THREE.Camera,
    view: StageView,
    focus: number,
    shear: THREE.Matrix4
  ) {
    const { w, h } = view;
    const vis = Math.max(0, 1 - focus) ** FADE_POWER;
    if (vis <= 0.001) {
      this.layer.style.opacity = '0';
      return;
    }
    this.layer.style.opacity = String(vis);

    // Re-solve only when the viewport changed. The shear cannot invalidate an
    // anchor — it is the identity on this geometry — and neither can the focus
    // swing, during which the captions are faded out anyway.
    if (w !== this.solvedFor.w || h !== this.solvedFor.h) {
      this.solve(camera, view);
      this.solvedFor = { w, h };
    }

    for (const l of this.labels) {
      // A feature can be too far off-frame to hold its own caption — after
      // round 12 squared the plan to the screen, ул. Комсомола keeps only a
      // ~33px sliver at the top edge, and no 21px line fits in it. `solve`
      // leaves such a label unanchored; without this it would render at the
      // layer origin, i.e. the top-left corner, on top of the logo.
      l.el.classList.toggle('unplaced', !l.at);
      if (!l.at) continue;
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

  /**
   * Choose an interior anchor for the river caption, in world space.
   *
   * Runs at load and on resize. Everything here is screen-space reasoning —
   * "inside the viewport", "bottom-left", "13px of clear water" are all pixel
   * notions — but the RESULT is converted back to a world point, so the
   * per-frame path stays a pure projection and the caption stays welded to the
   * Neva between solves.
   */
  private solve(camera: THREE.Camera, view: StageView) {
    const { w, h } = view;
    const blocked = obstacleRects(this.chrome, view.scrollTop);

    for (const l of this.labels) {
      // the authored marks are placed, not searched for
      if (!l.feature) continue;
      const scr = l.feature.tris.map((p) => project(p, camera, w, h));
      const edges = l.feature.edges.map(
        ([p, q]) => [project(p, camera, w, h), project(q, camera, w, h)] as const
      );

      // The search domain constrains the label's BOX, not just its anchor: a
      // centre inside the inset can still hang half the text off-screen, which
      // is how «р. Нева» ended up clipped by the right edge on the first pass.
      // Measured from the live element, so it follows the real font metrics.
      const half = { x: l.el.offsetWidth / 2, y: l.el.offsetHeight / 2 };
      const box = {
        x0: SOLVE_MARGIN + half.x,
        y0: SOLVE_MARGIN + half.y,
        x1: w - SOLVE_MARGIN - half.x,
        y1: h - SOLVE_MARGIN - half.y,
      };

      // the feature's on-screen extent, intersected with the allowed box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of scr) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const x0 = Math.max(box.x0, minX), x1 = Math.min(box.x1, maxX);
      const y0 = Math.max(box.y0, minY), y1 = Math.min(box.y1, maxY);
      if (x1 <= x0 || y1 <= y0) continue; // feature not visible; keep last anchor

      let best: { x: number; y: number } | null = null;
      let bestScore = -Infinity;

      for (let y = y0; y <= y1; y += GRID_STEP) {
        for (let x = x0; x <= x1; x += GRID_STEP) {
          if (!insideAny(scr, x, y)) continue;
          if (overlaps(blocked, x, y, half)) continue;
          if (straddles(y, half, view.restH)) continue;
          const clear = clearance(edges, x, y);
          if (clear < MIN_CLEARANCE) continue;

          // The corner preference must DOMINATE, with clearance only breaking
          // ties. Weighting the two into one linear score is what sent the
          // river caption to the bottom-RIGHT on the first pass: the wide
          // right-hand stretch of the Neva scores ~300px of clearance, which
          // simply outbid a bias term capped at 200. Scaling the preference
          // past any reachable clearance makes the ordering lexicographic.
          //
          // small x, large y — each normalised over the valid span so neither
          // axis dominates on a window much wider than it is tall
          const bias = (x - x0) / (x1 - x0) + (y1 - y) / (y1 - y0);
          const score = -bias * 1e6 + clear;
          if (score > bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
      }

      if (!best) continue;
      const at = unproject(best.x, best.y, l.feature, camera, w, h);
      if (at) l.at = at;
    }
  }

  private clear() {
    this.layer.innerHTML = '';
    this.labels = [];
    this.solvedFor = { w: 0, h: 0 };
  }
}

// ---------------------------------------------------------------- internals

/**
 * Would the caption centred at `y` be cut in half by the resting fold?
 *
 * It may sit above the fold or below it — but never ACROSS it, because the
 * resting viewport clips whatever hangs past and the caption ships as a row of
 * severed letters until you scroll. Round 15 hit this the moment the wider fit
 * brought a caption back into the resting frame: the solver placed it at y
 * 778.9 with a box reaching 808.7, so 9 px of it were amputated at rest.
 *
 * The legal domain is genuinely two regions, not one shifted one, and this is
 * the cheapest way to say so: reject the seam, let the search find whichever
 * side has room.
 */
function straddles(y: number, half: P2, fold: number): boolean {
  return y - half.y < fold && y + half.y > fold;
}

function components(surfaces: FlatSurface[], material: string): MeshComponent[] {
  const out: MeshComponent[] = [];
  for (const s of surfaces) {
    if (s.materialName !== material) continue;
    out.push(...connectedComponents(s.geometry));
  }
  return out;
}

/** world-space triangles + boundary edges for a component */
function feature(c: MeshComponent, modelMatrix: THREE.Matrix4): Feature {
  const pos = c.geometry.getAttribute('position');
  const tris: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    tris.push(
      new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(modelMatrix)
    );
  }
  return { tris, edges: boundaryEdges(tris) };
}

/**
 * The outline of a triangulated polygon: every edge used by exactly one
 * triangle. Interior edges appear twice and cancel.
 *
 * Distance-to-boundary is what "is there room for the caption here?" actually
 * means, and measuring it against ALL edges would count interior diagonals —
 * which would report the middle of a wide river as cramped simply because the
 * tessellation happens to run a diagonal through it.
 */
function boundaryEdges(tris: THREE.Vector3[]): [THREE.Vector3, THREE.Vector3][] {
  const seen = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; n: number }>();
  const key = (p: THREE.Vector3) =>
    `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const v = [tris[i], tris[i + 1], tris[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      const ka = key(a);
      const kb = key(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const hit = seen.get(k);
      if (hit) hit.n++;
      else seen.set(k, { a, b, n: 1 });
    }
  }
  const out: [THREE.Vector3, THREE.Vector3][] = [];
  for (const e of seen.values()) if (e.n === 1) out.push([e.a, e.b]);
  return out;
}

function project(p: THREE.Vector3, camera: THREE.Camera, w: number, h: number) {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
}

interface P2 { x: number; y: number }
interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * Live viewport rects of the fixed UI the captions must miss.
 *
 * Read at solve time rather than hardcoded, so the reserved area follows the
 * real rendered type — the hint is one centred line whose width depends on the
 * font actually loading, and guessing it is how the previous full-width band
 * came about.
 */
function obstacleRects(root: HTMLElement, scrollTop: number): Rect[] {
  // The obstacles are pinned to the WINDOW and getBoundingClientRect answers in
  // window coordinates, but the caption layer lives in the scrolled stage since
  // round 14 — so the two frames differ by exactly the scroll offset. The
  // caller re-solves at scrollTop 0 (see ConceptScreen.resize), which is the
  // resting composition the design is judged in.
  const out: Rect[] = [];
  for (const sel of OBSTACLES) {
    const el = root.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({
      x0: r.left - OBSTACLE_PAD,
      y0: r.top + scrollTop - OBSTACLE_PAD,
      x1: r.right + OBSTACLE_PAD,
      y1: r.bottom + scrollTop + OBSTACLE_PAD,
    });
  }
  return out;
}

/** would a caption centred at (x, y) with these half-extents hit any obstacle */
function overlaps(rects: Rect[], x: number, y: number, half: P2): boolean {
  for (const r of rects) {
    if (
      x + half.x > r.x0 && x - half.x < r.x1 &&
      y + half.y > r.y0 && y - half.y < r.y1
    ) return true;
  }
  return false;
}

/** is (x, y) inside any projected triangle of the feature */
function insideAny(scr: P2[], x: number, y: number): boolean {
  for (let i = 0; i + 2 < scr.length; i += 3) {
    const a = scr[i], b = scr[i + 1], c = scr[i + 2];
    const d1 = (x - b.x) * (a.y - b.y) - (a.x - b.x) * (y - b.y);
    const d2 = (x - c.x) * (b.y - c.y) - (b.x - c.x) * (y - c.y);
    const d3 = (x - a.x) * (c.y - a.y) - (c.x - a.x) * (y - a.y);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

/** distance from (x, y) to the nearest boundary segment */
function clearance(edges: readonly (readonly [P2, P2])[], x: number, y: number): number {
  let best = Infinity;
  for (const [a, b] of edges) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    let t = len > 1e-9 ? ((x - a.x) * dx + (y - a.y) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx - x;
    const py = a.y + t * dy - y;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

/**
 * Screen point → world point on the feature's plane.
 *
 * Builds the 2×2 linear part of the (affine) model→screen map from two probe
 * offsets around the feature's first vertex and inverts it. Valid because the
 * ground geometry is flat and the overview camera is orthographic — the same
 * property that lets the anchor be solved once and then simply projected.
 */
function unproject(
  x: number, y: number, f: Feature, camera: THREE.Camera, w: number, h: number
): THREE.Vector3 | null {
  const o = f.tris[0];
  const so = project(o, camera, w, h);
  const sx = project(o.clone().add(new THREE.Vector3(1, 0, 0)), camera, w, h);
  const sz = project(o.clone().add(new THREE.Vector3(0, 0, 1)), camera, w, h);

  const m00 = sx.x - so.x, m01 = sz.x - so.x;
  const m10 = sx.y - so.y, m11 = sz.y - so.y;
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) return null;

  const dx = x - so.x;
  const dy = y - so.y;
  const u = (m11 * dx - m01 * dy) / det;
  const v = (-m10 * dx + m00 * dy) / det;
  return new THREE.Vector3(o.x + u, o.y, o.z + v);
}

function biggest(list: MeshComponent[]): MeshComponent | undefined {
  return list.sort((a, b) => b.triCount - a.triCount)[0];
}
