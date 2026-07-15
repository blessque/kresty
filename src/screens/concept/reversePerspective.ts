import * as THREE from 'three';

/**
 * Icon-style ("reverse") perspective, baked into the geometry once at load.
 *
 * Every wall vertex is pushed horizontally outward — away from its own wall —
 * proportionally to how far below its own wall's roof line it sits:
 *
 *   offset = outwardDir · SPLAY_K · (wallTopY − y)
 *
 * Wall tops are welded to roof edges and travel zero, so walls stay attached
 * to their roofs; wall bottoms travel the most. Seen straight from above, each
 * building shows its roof PLUS all four façades as trapezoid bands around it
 * (references/reverso.png). Building positions are untouched, so there is no
 * global fisheye — the divergence is polycentric, per building, the way icon
 * painters did it. Normals are left as-is on purpose: each façade keeps its
 * flat directional shade.
 *
 * The GLB is one merged mesh, so walls are discovered geometrically: faces
 * with near-horizontal normals, flood-filled into strips through shared
 * (position-welded) vertices; each strip knows its own roof line.
 */

/** outward wall travel per unit of height below the wall's own roof line */
export const SPLAY_K = 0.6;
/** a face is a wall when |normal.y| is below this (≈ steeper than 70°) */
const WALL_NY_MAX = 0.35;
/** ignore wall strips shorter than this fraction of the model height (curbs, steps) */
const MIN_WALL_H_FRAC = 0.04;
/** position-weld quantum as a fraction of the bbox diagonal */
const WELD_EPS_FRAC = 1e-5;

export function applyIconSplay(geometry: THREE.BufferGeometry, splayK: number = SPLAY_K): void {
  if (splayK === 0) return;

  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = geometry.getIndex();
  const triCount = (index ? index.count : pos.count) / 3;
  const vertAt = index
    ? (tri: number, corner: number) => index.getX(tri * 3 + corner)
    : (tri: number, corner: number) => tri * 3 + corner;

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const eps = size.length() * WELD_EPS_FRAC;
  const minWallH = size.y * MIN_WALL_H_FRAC;

  // ---- weld: coincident positions (split normals, seams) → one shared id ----
  const weldIdByKey = new Map<string, number>();
  const weldOfVertex = new Uint32Array(pos.count);
  const weldCopies: number[][] = []; // weldId → vertex indices
  for (let v = 0; v < pos.count; v++) {
    const key =
      Math.round(pos.getX(v) / eps) +
      ',' +
      Math.round(pos.getY(v) / eps) +
      ',' +
      Math.round(pos.getZ(v) / eps);
    let id = weldIdByKey.get(key);
    if (id === undefined) {
      id = weldCopies.length;
      weldIdByKey.set(key, id);
      weldCopies.push([]);
    }
    weldOfVertex[v] = id;
    weldCopies[id].push(v);
  }

  // ---- classify faces; accumulate area-weighted outward normals per weld ----
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  const wallFaces: number[] = []; // tri indices
  const wallFaceOf = new Int32Array(triCount).fill(-1); // tri → index into wallFaces
  const faceNX: number[] = []; // area-weighted horizontal normal per wall face
  const faceNZ: number[] = [];
  const wallsAtWeld = new Map<number, number[]>(); // weldId → wall-face list

  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, vertAt(t, 0));
    b.fromBufferAttribute(pos, vertAt(t, 1));
    c.fromBufferAttribute(pos, vertAt(t, 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac); // length = 2·area, direction = face normal
    const len = n.length();
    if (len < 1e-12) continue;
    if (Math.abs(n.y / len) >= WALL_NY_MAX) continue; // roof / ground / terrain

    const wf = wallFaces.length;
    wallFaceOf[t] = wf;
    wallFaces.push(t);
    faceNX.push(n.x);
    faceNZ.push(n.z);
    for (let corner = 0; corner < 3; corner++) {
      const w = weldOfVertex[vertAt(t, corner)];
      let list = wallsAtWeld.get(w);
      if (!list) wallsAtWeld.set(w, (list = []));
      list.push(wf);
    }
  }

  // ---- flood-fill wall faces into strips (union-find via shared welds) ----
  const parent = new Int32Array(wallFaces.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (const list of wallsAtWeld.values()) {
    const r0 = find(list[0]);
    for (let i = 1; i < list.length; i++) parent[find(list[i])] = r0;
  }

  // per strip: its own roof line (topY) and total height
  const stripTop = new Map<number, number>();
  const stripBottom = new Map<number, number>();
  for (let wf = 0; wf < wallFaces.length; wf++) {
    const root = find(wf);
    for (let corner = 0; corner < 3; corner++) {
      const y = pos.getY(vertAt(wallFaces[wf], corner));
      stripTop.set(root, Math.max(stripTop.get(root) ?? -Infinity, y));
      stripBottom.set(root, Math.min(stripBottom.get(root) ?? Infinity, y));
    }
  }

  // ---- displace: per welded position, once, written to every copy ----
  for (const [w, faces] of wallsAtWeld) {
    let dirX = 0;
    let dirZ = 0;
    let topY = -Infinity;
    for (const wf of faces) {
      const root = find(wf);
      if (stripTop.get(root)! - stripBottom.get(root)! < minWallH) continue;
      dirX += faceNX[wf];
      dirZ += faceNZ[wf];
      topY = Math.max(topY, stripTop.get(root)!);
    }
    const dirLen = Math.hypot(dirX, dirZ);
    if (dirLen < 1e-9 || topY === -Infinity) continue;

    const y = pos.getY(weldCopies[w][0]);
    const d = splayK * Math.max(0, topY - y);
    if (d === 0) continue;
    const dx = (dirX / dirLen) * d;
    const dz = (dirZ / dirLen) * d;
    for (const v of weldCopies[w]) {
      pos.setX(v, pos.getX(v) + dx);
      pos.setZ(v, pos.getZ(v) + dz);
    }
  }

  pos.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
