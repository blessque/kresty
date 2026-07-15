/**
 * Stylized footprints traced by eye from the archival plan
 * (Screenshot …14.38.27) and the aerial renders. Site coords: x → east,
 * z → south, units ≈ meters. Approximation is deliberate — but the two
 * cross-shaped cell blocks must stay legibly cross-shaped.
 */
export interface BuildingSpec {
  id: string;
  kind: 'cross' | 'rect' | 'circle';
  cx: number;
  cz: number;
  h: number;
  // cross
  halfLen?: number;
  halfW?: number;
  // rect
  w?: number;
  d?: number;
  // circle
  r?: number;
  rotY?: number;
  accent?: boolean; // warmer tint (the crosses + church)
}

export const SITE_W = 360;
export const SITE_D = 240;

export const BUILDINGS: BuildingSpec[] = [
  { id: 'cross-a', kind: 'cross', cx: 100, cz: 120, halfLen: 58, halfW: 13, h: 24, rotY: 0.06, accent: true },
  { id: 'cross-b', kind: 'cross', cx: 250, cz: 138, halfLen: 58, halfW: 13, h: 24, accent: true },
  { id: 'admin-church', kind: 'rect', cx: 172, cz: 186, w: 54, d: 20, h: 17 },
  { id: 'entrance', kind: 'rect', cx: 152, cz: 220, w: 42, d: 13, h: 12 },
  { id: 'rotunda', kind: 'circle', cx: 64, cz: 38, r: 17, h: 11 },
  { id: 'church', kind: 'rect', cx: 205, cz: 74, w: 38, d: 24, h: 21, accent: true },
  { id: 'kitchen', kind: 'rect', cx: 163, cz: 120, w: 26, d: 44, h: 14 },
  { id: 'bath', kind: 'rect', cx: 122, cz: 70, w: 24, d: 15, h: 10 },
  { id: 'hospital', kind: 'rect', cx: 176, cz: 36, w: 44, d: 15, h: 14 },
  { id: 'hospital-admin', kind: 'rect', cx: 120, cz: 34, w: 28, d: 13, h: 12 },
  { id: 'workshops', kind: 'rect', cx: 48, cz: 96, w: 34, d: 14, h: 10 },
  { id: 'barrack', kind: 'rect', cx: 300, cz: 40, w: 30, d: 14, h: 10 },
  { id: 'icehouse', kind: 'rect', cx: 30, cz: 150, w: 24, d: 13, h: 8 },
  { id: 'house-51', kind: 'rect', cx: 52, cz: 206, w: 30, d: 13, h: 14 },
  { id: 'house-52', kind: 'rect', cx: 94, cz: 210, w: 26, d: 13, h: 14 },
  { id: 'chimney', kind: 'rect', cx: 140, cz: 141, w: 6, d: 6, h: 36 },
  { id: 'east-wing', kind: 'rect', cx: 322, cz: 150, w: 16, d: 42, h: 12 },
];

/** 12-point plus/cross outline centred at origin */
export function crossOutline(halfLen: number, halfW: number): [number, number][] {
  const L = halfLen;
  const w = halfW;
  return [
    [-w, -L], [w, -L], [w, -w], [L, -w], [L, w], [w, w],
    [w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w],
  ];
}
