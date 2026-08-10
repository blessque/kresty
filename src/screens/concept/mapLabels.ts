import * as THREE from 'three';
import { connectedComponents, type MeshComponent, type BuildingPart } from './buildingSplit';
import type { FlatSurface } from './groundPlan';
import { infoFor } from './buildingsInfo';

/**
 * Captions for the river and the two streets.
 *
 * DOM, not 3D text: three has no text primitive without pulling in a font
 * loader and a glyph mesh per caption, and the project's type is already the
 * web fonts in `styles/fonts.css`. A projected DOM node stays crisp at any DPR,
 * costs one `matrix` write per frame, and inherits the site's typography for
 * free.
 *
 * ANCHORS ARE DERIVED, NOT AUTHORED. The GLB has no named nodes, so a caption
 * cannot be attached to "the embankment" by name. Each labelled feature is
 * recovered as a connected component of its material's primitive; `Color_M04`
 * holds BOTH streets as one primitive, which is why this module needs the
 * component split at all, and the embankment is told apart from ул. Комсомола
 * by which of the two lies nearer the river.
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

/** the material each caption is recovered from */
const WATER_MAT = 'Color_H08';
const STREET_MAT = 'Color_M04';

const TEXT = {
  river: 'р. Нева',
  /** the street nearer the river */
  embankment: 'Арсенальная наб.',
  /** the other one */
  inland: 'ул. Комсомола',
};

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
 * How much clear feature the caption needs around its anchor, in px. Roughly
 * half a line box, so a 22px caption sits on its road rather than straddling
 * the kerb. The streets measure ~55px across at the default framing, so a
 * centreline anchor clears this comfortably.
 */
const MIN_CLEARANCE = 13;

/** search resolution, px. The solve is O(cells × edges) and runs at load and on
 *  resize only, so this can afford to be fine. */
const GRID_STEP = 5;

/**
 * Street captions sit LEFT of centre along their own run — Figma 477:440 places
 * both there, and the design is the spec. Expressed as a fraction of the
 * caption's own valid span along the street, so it stays left-of-centre at any
 * framing instead of encoding a fixed distance that stops meaning the same
 * thing when the visible stretch changes length.
 */
const STREET_BIAS = 0.3;

/**
 * A `Color_M04` component counts as a street once it runs at least this much of
 * the site's own span. Both real roads cross the whole site and then bleed off
 * both edges — they measure 2.4× and 4.8× the span — so this is a wide moat
 * around the only two things that can pass, not a tuned threshold.
 */
const MIN_STREET_RUN_FRAC = 0.25;

/** captions fade out as the camera swings to a focused building — the
 *  isometric view is not a plan, and a plan caption reads as a mistake there */
const FADE_POWER = 2;

/**
 * BUILDING captions — the round-13 test set, from the client's own map.
 *
 * These are NOT solved. Where a plan caption has a polygon to sit inside and a
 * whole search to run, a building caption belongs to one volume and the client
 * placed each one by hand, in a different quadrant per cross so the two do not
 * collide. So placement is authored here: `at` is an offset from the roof
 * centre in FRACTIONS OF THE SITE SPAN, which keeps it meaningful at any
 * framing — a fixed distance would stop meaning the same thing the moment the
 * fit changes, which is exactly the mistake round 10 removed from the solver.
 *
 * `+x` is screen-right, `+z` is screen-DOWN (the plan is square to the screen
 * since round 12, so the two axes map straight to the page).
 *
 * The first line is always the building's own `name` — never duplicated here,
 * so a rename in buildingsInfo.ts cannot leave the map disagreeing with the
 * drawer. `sub` is the optional second line.
 */
const BUILDING_CAPTIONS: Record<string, { sub?: string; at: [number, number] }> = {
  /** the screen-LEFT cross — the client puts its caption in the lower-RIGHT
   *  quadrant between the arms */
  b02: { sub: 'Отель Cosmos 4*', at: [0.102, 0.081] },
  /** the screen-RIGHT cross — lower-LEFT quadrant, the mirror choice, which is
   *  what keeps it clear of the SPA block */
  b01: { sub: 'Отель Cosmos 5*', at: [-0.125, 0.087] },
  b04: { at: [-0.02, 0.058] },
  /** not on the client's map — a test case on purpose: a low flat roof, to show
   *  the travel is proportional to HEIGHT (this one slides ~8px at full lean
   *  against the crosses' ~45px, because that is how far its roof goes) */
  b15: { at: [0, 0] },
};

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
  axisAngle: number;
}

interface Label {
  el: HTMLElement;
  /** null for building captions — they are authored, not searched for */
  feature: Feature | null;
  /** how to bias the search within the feature; `fixed` skips the solver */
  bias: 'bottom-left' | 'street' | 'fixed';
  /**
   * How far down the stage the solver may place this caption (round 14).
   *
   * `rest` = the window-sized band visible before you scroll; `full` = the
   * whole 150vh stage, including the revealed river.
   *
   * The rule is "a caption goes where its feature READS". Round 14 read that as
   * `rest` for the streets and `full` for the river: the embankment then still
   * crossed the resting frame diagonally, so `full` let it settle 28px below
   * the fold — lettering a stretch of road nobody saw at rest — while the Neva
   * was `unplaced` for want of visible water.
   *
   * ROUND 15 MOVED THE ROAD, so the same rule now gives the opposite answer.
   * Straightening Арсенальная наб. dropped it to a level band ~48px BELOW the
   * resting frame; it is not partly visible any more, it is not visible at all.
   * A `rest` solve therefore has no road to letter and comes out `unplaced`,
   * and the caption follows its road down. `full` for everything is now one
   * code path, and for ул. Комсомола it is inert either way — that one sits
   * ABOVE the frame, and the stage only extends downward.
   */
  band: 'rest' | 'full';
  /** solved world-space anchor; null until the first solve */
  at: THREE.Vector3 | null;
  /** Streets are lettered along their own run; the river is NOT. Figma sets
   *  «р. Нева» horizontal (its bounding box is exactly one line box tall), which
   *  is also the cartographic convention — a water body is labelled level, a
   *  thoroughfare is labelled along its length. */
  rotates: boolean;
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
    this.buildBuildings(parts, modelMatrix, siteSpan);

    const water = biggest(components(surfaces, WATER_MAT));
    if (water) {
      this.add(TEXT.river, feature(water, modelMatrix), 'river', 'bottom-left', false, 'full');
    }

    // A street is told from a scrap by its RUN, not by its triangle count.
    //
    // This was `triCount >= 4`, and round 15's export broke it: straightening
    // the two roads took them from 9 and 6 triangles to 3 and 2, so both were
    // filtered out — and since the guard here used to be shared with the river,
    // the early return took «р. Нева» down with them. All three plan captions
    // vanished because the roads got SIMPLER.
    //
    // `buildingSplit.ts` already learned this and says so in its own header:
    // triangle count measures modelling detail, and modelling detail is not
    // what makes something a street. A road crosses the whole site by
    // definition, so measure that instead and the filter survives the next
    // re-export.
    const streets = components(surfaces, STREET_MAT)
      .filter((c) => horizontalRun(c) >= siteSpan * MIN_STREET_RUN_FRAC)
      .sort((p, q) => horizontalRun(q) - horizontalRun(p))
      .slice(0, 2);
    if (!water || streets.length === 0) return;

    // embankment = the street whose centroid is nearer the river
    streets.sort(
      (p, q) =>
        p.centroid.distanceToSquared(water.centroid) -
        q.centroid.distanceToSquared(water.centroid)
    );

    const names = [TEXT.embankment, TEXT.inland];
    streets.forEach((s, i) => {
      this.add(names[i], feature(s, modelMatrix), 'street', 'street', true, 'full');
    });
  }

  /**
   * Captions welded to the buildings themselves.
   *
   * The anchor sits on the ROOF (`bbox.max.y`), and that is the whole trick:
   * restricted to a horizontal plane at height h the plan-oblique shear
   * `x' = x + sx·y, z' = z + sz·y` becomes `(x, z) → (x + sx·h, z + sz·h)` —
   * it has no linear part left, so it is a pure TRANSLATION. A caption anchored
   * up there therefore slides exactly as far as its roof does and never skews,
   * with no per-frame correction: `update` already runs every anchor through
   * the shear, which is simply the identity for the plan captions on y = 0.
   */
  private buildBuildings(
    parts: BuildingPart[],
    modelMatrix: THREE.Matrix4,
    siteSpan: number
  ) {
    for (const part of parts) {
      const spec = BUILDING_CAPTIONS[part.id];
      if (!spec) continue;
      const c = part.bbox.getCenter(new THREE.Vector3());
      const at = new THREE.Vector3(
        c.x + spec.at[0] * siteSpan,
        part.bbox.max.y,
        c.z + spec.at[1] * siteSpan
      ).applyMatrix4(modelMatrix);

      const el = document.createElement('div');
      el.className = 'map-label map-label--building';
      // one element per line: a caption is two left-aligned lines whose block is
      // centred on the anchor, which `white-space: pre-line` could not give
      for (const line of [infoFor(part.id).name, spec.sub]) {
        if (!line) continue;
        const row = document.createElement('div');
        row.textContent = line;
        el.appendChild(row);
      }
      this.layer.appendChild(el);
      // `band` is inert for an authored caption — it only constrains the solver
      this.labels.push({ el, feature: null, bias: 'fixed', at, rotates: false, band: 'full' });
    }
  }

  private add(
    text: string,
    f: Feature,
    kind: string,
    bias: Label['bias'],
    rotates: boolean,
    band: Label['band']
  ) {
    const el = document.createElement('div');
    el.className = `map-label map-label--${kind}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.labels.push({ el, feature: f, bias, at: null, rotates, band });
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

      let ang = 0;
      if (l.rotates && l.feature) {
        this.b
          .copy(l.at)
          .add(axisVector(l.feature.axisAngle))
          .applyMatrix4(shear)
          .project(camera);
        const bx = (this.b.x * 0.5 + 0.5) * w;
        const by = (-this.b.y * 0.5 + 0.5) * h;
        // keep the caption reading left-to-right whichever way the axis points
        ang = Math.atan2(by - y, bx - x);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
      }

      l.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${ang.toFixed(4)}rad)`;
    }
  }

  /**
   * Choose an interior anchor for every caption, in world space.
   *
   * Runs at load and on resize. Everything here is screen-space reasoning —
   * "inside the viewport", "left of centre", "13px of clear road" are all
   * pixel notions — but the RESULT is converted back to a world point, so the
   * per-frame path stays a pure projection and the caption stays welded to its
   * feature between solves.
   */
  private solve(camera: THREE.Camera, view: StageView) {
    const { w, h } = view;
    const blocked = obstacleRects(this.chrome, view.scrollTop);

    for (const l of this.labels) {
      // building captions are authored, not searched for
      if (l.bias === 'fixed' || !l.feature) continue;
      const scr = l.feature.tris.map((p) => project(p, camera, w, h));
      const edges = l.feature.edges.map(
        ([p, q]) => [project(p, camera, w, h), project(q, camera, w, h)] as const
      );

      // The search domain constrains the label's BOX, not just its anchor: a
      // centre inside the inset can still hang half the text off-screen, which
      // is how «р. Нева» ended up clipped by the right edge on the first pass.
      // Measured from the live element, so it follows the real font metrics.
      const half = halfExtents(l, camera, w, h);
      const bandH = l.band === 'full' ? h : view.restH;
      const box = {
        x0: SOLVE_MARGIN + half.x,
        y0: SOLVE_MARGIN + half.y,
        x1: w - SOLVE_MARGIN - half.x,
        y1: bandH - SOLVE_MARGIN - half.y,
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

      // on-screen axis direction, pointing screen-rightward, for the street bias
      const axis = screenAxis(l.feature, camera, w, h);
      // the resting fold, for captions allowed past it — see `straddles`
      const fold = l.band === 'full' ? view.restH : Infinity;

      let best: { x: number; y: number } | null = null;
      let bestScore = -Infinity;

      for (let y = y0; y <= y1; y += GRID_STEP) {
        for (let x = x0; x <= x1; x += GRID_STEP) {
          if (!insideAny(scr, x, y)) continue;
          if (overlaps(blocked, x, y, half)) continue;
          if (straddles(y, half, fold)) continue;
          const clear = clearance(edges, x, y);
          if (clear < MIN_CLEARANCE) continue;

          // The corner preference must DOMINATE, with clearance only breaking
          // ties. Weighting the two into one linear score is what sent the
          // river caption to the bottom-RIGHT on the first pass: the wide
          // right-hand stretch of the Neva scores ~300px of clearance, which
          // simply outbid a bias term capped at 200. Scaling the preference
          // past any reachable clearance makes the ordering lexicographic.
          let score: number;
          if (l.bias === 'bottom-left') {
            // small x, large y — each normalised over the valid span so neither
            // axis dominates on a window much wider than it is tall
            const bias = (x - x0) / (x1 - x0) + (y1 - y) / (y1 - y0);
            score = -bias * 1e6 + clear;
          } else {
            // ordering along the street is a rank, not a value — solved in its
            // own pass below; here clearance just finds the centreline
            score = clear;
          }
          if (score > bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
      }

      if (l.bias === 'street') {
        best = solveStreet(scr, edges, x0, y0, x1, y1, axis, blocked, half, fold) ?? best;
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
 * Would a caption centred at `y` be cut in half by the resting fold?
 *
 * A `full`-band caption may sit above the fold or below it — but never ACROSS
 * it, because the resting viewport clips whatever hangs past and the caption
 * ships as a row of severed letters until you scroll. Round 15 hit this the
 * moment the wider fit brought Арсенальная наб.'s road back into the resting
 * frame: the solver placed it at y 778.9 with a box reaching 808.7, so 9 px of
 * it were amputated at rest.
 *
 * Demoting the caption to `band: 'rest'` is NOT the fix — that road's near edge
 * now sits below the rest band's ceiling, so the constraint makes it
 * unplaceable again. The domain is genuinely two legal regions, not one shifted
 * one, and this is the cheapest way to say so: reject the seam, let the search
 * find whichever side has room. `Infinity` for `rest`-band captions, which can
 * never reach the fold anyway.
 */
function straddles(y: number, half: P2, fold: number): boolean {
  return y - half.y < fold && y + half.y > fold;
}

/** longest horizontal extent of a flat component — its run across the site */
function horizontalRun(c: MeshComponent): number {
  const s = c.bbox.getSize(new THREE.Vector3());
  return Math.max(s.x, s.z);
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
  return { tris, edges: boundaryEdges(tris), axisAngle: c.axisAngle };
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
 * Half-extents of the caption's on-screen box, measured from the live element
 * (`white-space: nowrap` + absolute positioning make `offsetWidth` the true
 * text width, so this follows the real font metrics rather than an estimate).
 *
 * Street captions are rotated to run with their road, so the relevant box is
 * the ROTATED AABB — «Арсенальная наб.» at 12° is both wider and taller than
 * its upright box, and using the upright one would let a corner cross the
 * viewport edge.
 */
function halfExtents(l: Label, camera: THREE.Camera, w: number, h: number): P2 {
  const bw = l.el.offsetWidth;
  const bh = l.el.offsetHeight;
  if (!l.rotates || !l.feature) return { x: bw / 2, y: bh / 2 };
  const ax = screenAxis(l.feature, camera, w, h); // unit: |x| = |cos|, |y| = |sin|
  const c = Math.abs(ax.x);
  const s = Math.abs(ax.y);
  return { x: (bw * c + bh * s) / 2, y: (bw * s + bh * c) / 2 };
}

/** the feature's principal axis as a screen-space unit vector, pointing right */
function screenAxis(f: Feature, camera: THREE.Camera, w: number, h: number): P2 {
  const o = f.tris[0];
  const a = project(o, camera, w, h);
  const b = project(o.clone().add(axisVector(f.axisAngle)), camera, w, h);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const s = dx < 0 ? -1 : 1; // point rightward so "left of centre" is unambiguous
  return { x: (dx / len) * s, y: (dy / len) * s };
}

/**
 * Street anchor: walk the valid interior points, order them along the street,
 * and take the one `STREET_BIAS` of the way in from the left-hand end.
 *
 * Done as its own pass rather than as a score term because "30% along the
 * street" is a rank, not a value — it cannot be expressed as something to
 * maximise until the full extent of the valid span is known.
 */
function solveStreet(
  scr: P2[],
  edges: readonly (readonly [P2, P2])[],
  x0: number, y0: number, x1: number, y1: number,
  axis: P2,
  blocked: Rect[],
  half: P2,
  fold: number
): P2 | null {
  const valid: { p: P2; t: number; clear: number }[] = [];
  for (let y = y0; y <= y1; y += GRID_STEP) {
    for (let x = x0; x <= x1; x += GRID_STEP) {
      if (!insideAny(scr, x, y)) continue;
      if (overlaps(blocked, x, y, half)) continue;
      if (straddles(y, half, fold)) continue;
      const clear = clearance(edges, x, y);
      if (clear < MIN_CLEARANCE) continue;
      valid.push({ p: { x, y }, t: x * axis.x + y * axis.y, clear });
    }
  }
  if (valid.length === 0) return null;

  let tMin = Infinity, tMax = -Infinity;
  for (const v of valid) {
    tMin = Math.min(tMin, v.t);
    tMax = Math.max(tMax, v.t);
  }
  const target = tMin + STREET_BIAS * (tMax - tMin);

  // among points at that station, take the one deepest inside the road — that
  // is the centreline, which is where a street caption belongs
  let best: { p: P2; clear: number } | null = null;
  for (const v of valid) {
    if (Math.abs(v.t - target) > GRID_STEP) continue;
    if (!best || v.clear > best.clear) best = v;
  }
  if (best) return best.p;

  // no sample landed in the band (a very short visible run) — nearest station
  let near = valid[0];
  for (const v of valid) {
    if (Math.abs(v.t - target) < Math.abs(near.t - target)) near = v;
  }
  return near.p;
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

/**
 * Unit vector along a footprint's principal axis, in the XZ plane.
 *
 * `footprintAxis` (buildingSplit.ts) returns `0.5·atan2(2·sxz, sxx − szz)`,
 * whose dominant eigenvector is `(cos θ, sin θ)` in **(x, z)**. Round 9.1 built
 * `(sin(θ+π/2), 0, cos(θ+π/2))` here, which expands to `(cos θ, 0, −sin θ)` —
 * the flipped z MIRRORED every caption's on-screen tilt, so the streets leaned
 * down-to-the-right when the real streets lean up-to-the-right. It was not
 * obvious because the mirrored angle is still plausible: the cross blocks
 * genuinely do lean the other way, so the captions looked like they were
 * following *something*.
 *
 * NOTE: `MapCamera.focusOn` reads the same `axisAngle` under a different
 * (azimuth-from-+Z) convention. It is deliberately NOT changed — it chooses
 * among four diagonals 90° apart by nearest-to-current, so a mirrored axis still
 * lands on a valid isometric pose, and round 8's focus framing is signed off.
 */
function axisVector(axis: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(axis), 0, Math.sin(axis));
}
