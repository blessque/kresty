import * as THREE from 'three';
import { connectedComponents, type MeshComponent } from './buildingSplit';
import type { FlatSurface } from './groundPlan';

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
 * cannot be attached to "the embankment" by name. Instead each labelled feature
 * is recovered as a connected component of its material's primitive, and the
 * caption is pinned to the point of that component nearest the model centre —
 * which is by construction the part of the feature that faces the site, i.e.
 * the part actually on screen. That survives a re-export, a different yaw and a
 * different framing without a single hand-tuned coordinate.
 *
 * `Color_M04` holds BOTH streets as one primitive, which is why this module
 * needs the component split at all; the embankment is then told apart from
 * ул. Комсомола by which of the two lies nearer the river.
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
 * The river caption is pushed off the shoreline into open water by this
 * fraction of the SITE's span — never the river's own, which reaches ~30× the
 * site (the Neva slab runs far past the frame) and would fling the caption
 * clean off screen.
 */
const RIVER_OFFSET = 0.09;

/**
 * …and shifted ALONG the shoreline by this fraction of the site span.
 *
 * Without it the river and embankment captions stack in one column: both are
 * anchored to the point of their feature nearest the model centre, and the two
 * features are parallel and adjacent, so "nearest to centre" is the same
 * direction for both. Separating them along the shore is what a cartographer
 * would do anyway — labels for parallel features get staggered, never stacked.
 */
const RIVER_ALONG = -0.5;

/**
 * Street captions are nudged along their own street by this fraction of the
 * site span. The geometric anchor is the perpendicular foot — cartographically
 * correct, but Figma (477:440) sits both captions left of it, and the design is
 * the spec.
 */
const STREET_ALONG = -0.22;

/**
 * Captions keep clear of the screen edges AND of the fixed UI: the logo and the
 * «Концепция» title occupy the top band, the hover hint the bottom one.
 */
const INSET = { top: 104, right: 28, bottom: 96, left: 28 };
/** captions fade out as the camera swings to a focused building — the
 *  isometric view is not a plan, and a plan caption reads as a mistake there */
const FADE_POWER = 2;

interface Label {
  el: HTMLElement;
  /** model-space anchor, in the same frame as the flat geometry */
  at: THREE.Vector3;
  /** a second model-space point along the feature, so the caption can be
   *  rotated to run WITH the street instead of across it */
  along: THREE.Vector3;
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

  constructor(container: HTMLElement) {
    this.layer.className = 'map-labels';
    container.appendChild(this.layer);
  }

  /**
   * `surfaces` are the flat plan geometries, in the same (already baked and
   * yaw-rotated) frame the GroundPlan meshes use. `modelMatrix` is the root's
   * normalize transform, applied here so anchors land in world space.
   */
  build(surfaces: FlatSurface[], modelMatrix: THREE.Matrix4, siteSpan: number) {
    this.clear();

    const water = biggest(components(surfaces, WATER_MAT));
    const streets = components(surfaces, STREET_MAT)
      .filter((c) => c.triCount >= 4)
      .sort((p, q) => q.triCount - p.triCount)
      .slice(0, 2);
    if (!water || streets.length === 0) return;

    // the model centre in the geometry's own frame: everything is placed
    // relative to it, so nothing here depends on the yaw or the framing
    const centre = new THREE.Vector3();

    // embankment = the street whose centroid is nearer the river
    streets.sort(
      (p, q) =>
        p.centroid.distanceToSquared(water.centroid) -
        q.centroid.distanceToSquared(water.centroid)
    );

    // river: the closest SURFACE point to the centre is the bank directly in
    // front of the site, and centre→bank is perpendicular to the shoreline, so
    // stepping further along it lands square in open water
    const bank = nearestSurfacePoint(water, centre);
    const out = bank
      .clone()
      .sub(centre)
      .normalize()
      .multiplyScalar(siteSpan * RIVER_OFFSET);
    const along = axisVector(water.axisAngle).multiplyScalar(siteSpan * RIVER_ALONG);
    this.add(TEXT.river, bank.add(out).add(along), water.axisAngle, modelMatrix, 'river', false);

    const names = [TEXT.embankment, TEXT.inland];
    streets.forEach((s, i) => {
      const at = nearestSurfacePoint(s, centre).add(
        axisVector(s.axisAngle).multiplyScalar(siteSpan * STREET_ALONG)
      );
      this.add(names[i], at, s.axisAngle, modelMatrix, 'street', true);
    });
  }

  private add(
    text: string,
    at: THREE.Vector3,
    axis: number,
    modelMatrix: THREE.Matrix4,
    kind: string,
    rotates: boolean
  ) {
    const el = document.createElement('div');
    el.className = `map-label map-label--${kind}`;
    el.textContent = text;
    this.layer.appendChild(el);

    // a metre along the feature's principal axis, so the on-screen angle is
    // measured rather than assumed — it then tracks any model yaw for free
    const along = at.clone().add(axisVector(axis));

    this.labels.push({
      el,
      at: at.clone().applyMatrix4(modelMatrix),
      along: along.applyMatrix4(modelMatrix),
      rotates,
    });
  }

  /** project and place; `focus` is MapCamera.focus */
  update(camera: THREE.Camera, w: number, h: number, focus: number) {
    const vis = Math.max(0, 1 - focus) ** FADE_POWER;
    if (vis <= 0.001) {
      this.layer.style.opacity = '0';
      return;
    }
    this.layer.style.opacity = String(vis);

    for (const l of this.labels) {
      this.a.copy(l.at).project(camera);
      const x = (this.a.x * 0.5 + 0.5) * w;
      const y = (-this.a.y * 0.5 + 0.5) * h;

      let ang = 0;
      if (l.rotates) {
        this.b.copy(l.along).project(camera);
        const bx = (this.b.x * 0.5 + 0.5) * w;
        const by = (-this.b.y * 0.5 + 0.5) * h;
        // keep the caption reading left-to-right whichever way the axis points
        ang = Math.atan2(by - y, bx - x);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
      }

      const p = nudgeIntoView(x, y, Math.cos(ang), Math.sin(ang), w, h);
      l.el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${ang.toFixed(4)}rad)`;
    }
  }

  private clear() {
    this.layer.innerHTML = '';
    this.labels = [];
  }
}

// ---------------------------------------------------------------- internals

function components(surfaces: FlatSurface[], material: string): MeshComponent[] {
  const out: MeshComponent[] = [];
  for (const s of surfaces) {
    if (s.materialName !== material) continue;
    out.push(...connectedComponents(s.geometry));
  }
  return out;
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

function biggest(list: MeshComponent[]): MeshComponent | undefined {
  return list.sort((a, b) => b.triCount - a.triCount)[0];
}

/**
 * The point ON the component's surface nearest `to` — searched over triangles,
 * not vertices.
 *
 * Vertices are the wrong domain here: these polygons are coarse (a whole street
 * is 8-11 corners), so the nearest VERTEX is whichever corner happens to be
 * closest and can sit at the far end of the street. The nearest surface point is
 * the perpendicular foot, which is by definition the middle of the stretch
 * facing the site — exactly where a map caption belongs. Components are 10-60
 * triangles, so the brute-force scan is free and runs once at load.
 */
function nearestSurfacePoint(c: MeshComponent, to: THREE.Vector3): THREE.Vector3 {
  const pos = c.geometry.getAttribute('position');
  const tri = new THREE.Triangle();
  const hit = new THREE.Vector3();
  const best = new THREE.Vector3();
  let bestD = Infinity;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    tri.a.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    tri.b.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
    tri.c.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    tri.closestPointToPoint(to, hit);
    const d = hit.distanceToSquared(to);
    if (d < bestD) {
      bestD = d;
      best.copy(hit);
    }
  }
  return best;
}

/**
 * Bring a caption inside the inset box with the LEAST movement, choosing
 * between two corrections:
 *
 *  - slide along the feature's own axis, which keeps the caption on its street;
 *  - clamp perpendicular, which is shorter when the street runs near-parallel
 *    to the edge being violated.
 *
 * Sliding alone is a trap, and an instructive one. `ул. Комсомола` runs ~5° off
 * horizontal and its anchor sat 42px above the top inset; satisfying that by
 * sliding costs 42/sin(5°) ≈ 480px ALONG the street, which walked the caption
 * clean past the visible stretch of road. Clamping cost 42px and left it on a
 * road ~55px wide. Whichever moves less is the one that keeps the caption
 * looking deliberate — so take the shorter of the two rather than committing to
 * either rule.
 */
function nudgeIntoView(
  x: number, y: number, dx: number, dy: number, w: number, h: number
): { x: number; y: number } {
  const lo = { x: INSET.left, y: INSET.top };
  const hi = { x: w - INSET.right, y: h - INSET.bottom };
  if (x >= lo.x && x <= hi.x && y >= lo.y && y <= hi.y) return { x, y };

  const clamped = {
    x: Math.min(hi.x, Math.max(lo.x, x)),
    y: Math.min(hi.y, Math.max(lo.y, y)),
  };

  // the interval of t for which p + t·d is inside the box, over both axes
  let tMin = -Infinity;
  let tMax = Infinity;
  let sliceable = true;
  const bound = (p: number, d: number, min: number, max: number) => {
    if (Math.abs(d) < 1e-6) {
      if (p < min || p > max) sliceable = false;
      return;
    }
    const a = (min - p) / d;
    const b = (max - p) / d;
    tMin = Math.max(tMin, Math.min(a, b));
    tMax = Math.min(tMax, Math.max(a, b));
  };
  bound(x, dx, lo.x, hi.x);
  bound(y, dy, lo.y, hi.y);

  if (!sliceable || tMin > tMax) return clamped;
  const t = Math.min(tMax, Math.max(tMin, 0));
  const slid = { x: x + dx * t, y: y + dy * t };

  return Math.abs(t) <= Math.hypot(clamped.x - x, clamped.y - y) ? slid : clamped;
}
