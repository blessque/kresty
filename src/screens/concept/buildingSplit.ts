import * as THREE from 'three';

/**
 * Recovers individual buildings from `map.glb`.
 *
 * The GLB is a single mesh with two primitives and no per-building nodes, so
 * there is nothing to read building identity from — it has to be derived.
 * Vertices are welded on a quantised position key, triangles that share a
 * welded vertex are unioned, and each connected component becomes its own
 * geometry.
 *
 * Measured on this model: 27 components (19 in primitive 0, 8 in primitive 1),
 * 24 of them substantial — matching the volumes visible on screen. Two known
 * lumps: the two largest prim-0 components each span 9.77×9.77, so a cross
 * block is welded to its adjacent courtyard and apse and selects as one unit.
 *
 * IDs must be STABLE — buildingsInfo.ts is keyed by them — so components are
 * sorted deterministically (triangle count desc, then min x, then min z).
 * Replacing the GLB invalidates the mapping.
 */

export interface BuildingPart {
  /** stable id, `b00`… — the key buildingsInfo.ts uses */
  id: string;
  geometry: THREE.BufferGeometry;
  triCount: number;
  centroid: THREE.Vector3;
  bbox: THREE.Box3;
  /** footprint's principal axis in the XZ plane (radians). The isometric focus
   *  camera looks 45° off this, so both the long and short façades are visible
   *  even on the model's rotated blocks. */
  axisAngle: number;
}

/**
 * A part only counts as a building if it has a real FOOTPRINT. Triangle count
 * is the wrong test: the church's columns are finely modelled (44 tris each)
 * yet measure 0.02×0.12 in a 22-unit-wide model, so a triangle threshold keeps
 * them as separate "buildings" while a footprint threshold correctly folds
 * them into the church. Anything smaller than this fraction of the model's
 * longest horizontal span is absorbed into its nearest real neighbour, so
 * clicking a column or a chimney selects the building it belongs to.
 */
const MIN_FOOTPRINT_FRAC = 0.03;
/** …and a hard floor on triangles for degenerate scraps */
const MIN_TRIS = 20;
/** weld tolerance as a fraction of the model's bounding-box diagonal */
const WELD_FRAC = 1e-4;

export function splitConnectedParts(geometries: THREE.BufferGeometry[]): BuildingPart[] {
  const raw: Omit<BuildingPart, 'id'>[] = [];
  for (const geo of geometries) raw.push(...componentsOf(geo));

  // deterministic order → stable ids across reloads
  raw.sort(
    (a, b) =>
      b.triCount - a.triCount ||
      a.bbox.min.x - b.bbox.min.x ||
      a.bbox.min.z - b.bbox.min.z
  );

  // model-wide span, so the footprint test is scale-independent
  const whole = new THREE.Box3();
  for (const p of raw) whole.union(p.bbox);
  const span = Math.max(whole.max.x - whole.min.x, whole.max.z - whole.min.z);
  const minFootprint = span * MIN_FOOTPRINT_FRAC;

  const isBuilding = (p: Omit<BuildingPart, 'id'>) => {
    const s = p.bbox.getSize(new THREE.Vector3());
    return p.triCount >= MIN_TRIS && Math.max(s.x, s.z) >= minFootprint;
  };
  const keep = raw.filter(isBuilding);
  const drop = raw.filter((p) => !isBuilding(p));

  // absorb the crumbs into their nearest surviving neighbour
  const merged = new Map<number, THREE.BufferGeometry[]>();
  for (const d of drop) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < keep.length; i++) {
      const dist = keep[i].centroid.distanceToSquared(d.centroid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    const list = merged.get(best) ?? [];
    list.push(d.geometry);
    merged.set(best, list);
  }

  return keep.map((p, i) => {
    const extras = merged.get(i);
    const geometry = extras ? concat([p.geometry, ...extras]) : p.geometry;
    if (extras) p.geometry.dispose();
    return {
      id: 'b' + String(i).padStart(2, '0'),
      geometry,
      triCount: p.triCount,
      centroid: p.centroid,
      bbox: p.bbox,
      axisAngle: p.axisAngle,
    };
  });
}

// ---------------------------------------------------------------- internals

function componentsOf(geo: THREE.BufferGeometry): Omit<BuildingPart, 'id'>[] {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const nrm = src.getAttribute('normal');
  const triCount = pos.count / 3;

  src.computeBoundingBox();
  const diag = src.boundingBox!.getSize(new THREE.Vector3()).length() || 1;
  const q = 1 / (diag * WELD_FRAC);

  // weld vertices on a quantised key
  const keys = new Map<string, number>();
  const weld = new Int32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const k = `${Math.round(pos.getX(v) * q)},${Math.round(pos.getY(v) * q)},${Math.round(pos.getZ(v) * q)}`;
    let id = keys.get(k);
    if (id === undefined) {
      id = keys.size;
      keys.set(k, id);
    }
    weld[v] = id;
  }

  // union-find over welded vertices, joined per triangle
  const parent = new Int32Array(keys.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const union = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  };
  for (let t = 0; t < triCount; t++) {
    union(weld[t * 3], weld[t * 3 + 1]);
    union(weld[t * 3], weld[t * 3 + 2]);
  }

  // bucket triangles by component root
  const buckets = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const r = find(weld[t * 3]);
    const list = buckets.get(r) ?? [];
    list.push(t);
    buckets.set(r, list);
  }

  const out: Omit<BuildingPart, 'id'>[] = [];
  for (const tris of buckets.values()) {
    const p = new Float32Array(tris.length * 9);
    const n = nrm ? new Float32Array(tris.length * 9) : null;
    for (let i = 0; i < tris.length; i++) {
      for (let k = 0; k < 3; k++) {
        const v = tris[i] * 3 + k;
        const o = i * 9 + k * 3;
        p[o] = pos.getX(v);
        p[o + 1] = pos.getY(v);
        p[o + 2] = pos.getZ(v);
        if (n && nrm) {
          n[o] = nrm.getX(v);
          n[o + 1] = nrm.getY(v);
          n[o + 2] = nrm.getZ(v);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (n) g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    else g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere(); // raycasting rejects on this first

    const bbox = g.boundingBox!.clone();
    out.push({
      geometry: g,
      triCount: tris.length,
      centroid: bbox.getCenter(new THREE.Vector3()),
      bbox,
      axisAngle: footprintAxis(p),
    });
  }
  if (src !== geo) src.dispose();
  return out;
}

/**
 * Principal axis of the footprint (radians in the XZ plane), by PCA over the
 * component's vertices. A bounding box would be useless here: several blocks in
 * this model are rotated, so their axis-aligned box says nothing about which
 * way the building actually faces. The covariance's dominant eigenvector does.
 */
function footprintAxis(p: Float32Array): number {
  const n = p.length / 3;
  let mx = 0;
  let mz = 0;
  for (let i = 0; i < n; i++) {
    mx += p[i * 3];
    mz += p[i * 3 + 2];
  }
  mx /= n;
  mz /= n;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (let i = 0; i < n; i++) {
    const dx = p[i * 3] - mx;
    const dz = p[i * 3 + 2] - mz;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
  }
  return 0.5 * Math.atan2(2 * sxz, sxx - szz);
}

function concat(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let pn = 0;
  for (const g of list) pn += g.getAttribute('position').count;
  const p = new Float32Array(pn * 3);
  const n = new Float32Array(pn * 3);
  let o = 0;
  for (const g of list) {
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    for (let i = 0; i < gp.count; i++, o++) {
      p[o * 3] = gp.getX(i);
      p[o * 3 + 1] = gp.getY(i);
      p[o * 3 + 2] = gp.getZ(i);
      n[o * 3] = gn.getX(i);
      n[o * 3 + 1] = gn.getY(i);
      n[o * 3 + 2] = gn.getZ(i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
