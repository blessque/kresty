import * as THREE from 'three';
import { concat, footprintAxis, type BuildingPart } from './buildingSplit';

/**
 * Per-building composition — round 26.
 *
 * WHY THIS FILE EXISTS AT ALL, which is the thing to understand before adding
 * to it. The designer's map (Figma 1120:30) is a COLLAGE: every building in the
 * frame is a vector mask over its own copy of a screenshot of this app, and the
 * copies are at different offsets. Subtracting each copy's offset from its
 * mask's position recovers where that building stood in the capture, and doing
 * that for the two crosses — one cutout used twice, so the arithmetic is
 * unambiguous — says they were pulled 164.9px further apart horizontally and
 * 27.4px vertically, about 14% of the plate width. Two other copies are scaled
 * NON-UNIFORMLY (1.187 across, 1.402 down), which is the proof that the frame
 * is a composition rather than a survey.
 *
 * The client confirmed the re-arrangement is deliberate — a navigation
 * designer's call, not an accident of collage — and asked for it in code for
 * now, with a renewed model to follow. So this is a deliberately TEMPORARY
 * layer: when that GLB lands, entries here get deleted, not maintained.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES THAT ARE NOT STYLE PREFERENCES
 *
 * 1. OFFSETS ARE FRACTIONS OF THE SITE SPAN, NEVER PIXELS. The fit changes with
 *    the window and with `FIT_MARGIN`; a pixel offset is a number that was true
 *    once. Same convention as `mapMarks.ts`, same reason.
 *
 * 2. THE TRANSFORM IS BAKED INTO THE GEOMETRY, and `bbox` is recomputed from
 *    it. Six things downstream read `BuildingPart.bbox` — `massedBox` for the
 *    framing, the caption anchors, the picker, `MapCamera`'s focus azimuth via
 *    `axisAngle` — and a `mesh.position` would leave every one of them
 *    describing where the building used to be. Baking keeps one source of truth
 *    instead of six consumers that each have to remember.
 */

export interface BuildingPlacement {
  /** move, in fractions of the site span; +x right, +z down the screen */
  move?: [number, number];
  /** turn about the building's OWN centre, degrees clockwise on screen */
  turn?: number;
}

/**
 * Volumes that do not render.
 *
 * `b18` is the pier — a 0.09-tall slab lying in the river, which round 26 moved
 * out of the model entirely: the Neva is a DOM band now and the pier is flat
 * white artwork drawn on it. It was never really a building (round 13 took it
 * out of the framing measurement for exactly that reason); it is plan furniture
 * that happened to be exported as a volume.
 *
 * Hidden rather than deleted from the split, because the split is what assigns
 * the ids: dropping a part upstream would renumber everything after it and
 * silently re-key `buildingsInfo.ts`.
 */
export const HIDDEN_BUILDINGS = new Set(['b18']);

/**
 * Parts the split broke apart that are ONE building.
 *
 * `b17` («Навес») and `b10` («Офисы на набережной») are connected in the real
 * structure — the client's reading, and a canopy joined to the block it shelters
 * is exactly the kind of thin bridge a connected-components pass loses when the
 * exporter leaves a seam.
 *
 * THE MERGE HAPPENS AFTER IDS ARE ASSIGNED, and the order is load-bearing:
 * merged, the pair is 190 triangles, and ids sort on triangle count — merging
 * before assignment would move the survivor from tenth place to sixth and
 * renumber every id below it, silently re-keying `buildingsInfo.ts`. The
 * survivor keeps the LOWER id so the entry that describes the bigger half is the
 * one that lives.
 */
export const MERGE_INTO: Record<string, string> = { b17: 'b10' };

/**
 * The designer's composition. Empty entries are buildings the frame leaves
 * where they are.
 *
 * TODO(round 26): these are derived from the collage for the two crosses and
 * are PROVISIONAL for everything else — the frame cannot say where a building
 * that it also rescaled belongs. They get measured against the render.
 */
export const PLACEMENTS: Record<string, BuildingPlacement> = {
  // the two crosses carry the whole of the measured spread, split about the
  // site centre so the cluster does not drift off its own framing
  b02: { move: [-0.084, -0.014] },
  b01: { move: [0.084, 0.014] },
};

/**
 * ─────────────────────────── SQUARING TO THE GRID ───────────────────────────
 *
 * «Some buildings are rotated individually, not the whole model» — the client,
 * and the frame draws every volume square to the screen. The whole-model yaw is
 * NOT the answer to this: round 12 settled that at exactly 180° and squaring it
 * again would undo the site grid everything else is keyed to.
 *
 * So the turn is DERIVED, not authored, and the quantity that derives it already
 * exists: `BuildingPart.axisAngle` is the footprint's principal axis from a
 * second-moment fit. Folded into ±45°, it IS how far that volume sits off
 * square, and turning by its negative squares it. Nothing has to be measured off
 * the render, and when the renewed GLB lands the same rule re-derives itself
 * instead of needing a new table of angles.
 *
 * THE ASPECT GATE IS THE LOAD-BEARING PART, because a principal axis is only
 * meaningful on an elongated footprint. On a square one it is the ratio of two
 * nearly equal second moments and its angle is noise; on the two crosses, which
 * are four-fold symmetric, there is no principal axis AT ALL — and sure enough
 * they measure −41.55° and +42.84°, which is that degeneracy showing its face.
 * Acting on those numbers would fling both crosses 42° off the site.
 *
 * The measured set separates cleanly, which is why these thresholds are not
 * arbitrary: every volume this squares reads aspect ≥ 1.41, every one it
 * declines reads ≤ 1.30, and the crosses and the rotunda sit at exactly 1.00.
 *
 * THE INDEPENDENT CHECK, and the reason to trust the whole approach: this
 * measures the parking deck (`b15`) at −4.02° off square. Round 17 authored
 * `turn: -4.47` on its caption BY HAND, off the designer's frame, to match "the
 * parking roof's slight list". Two derivations that share no inputs, half a
 * degree apart. (That caption's hand-turn is gone now — squaring the deck is
 * what makes it unnecessary.)
 */
const SQUARE_MIN_ASPECT = 1.35;
/** below this, the reading is noise rather than a list */
const SQUARE_MIN_DEG = 2;

/**
 * Volumes that keep their own angle even when the rule would square them.
 *
 * Empty today, and that is a statement rather than a placeholder: nothing in the
 * measured set needs an exception. It exists because the renewed model will be
 * measured through the same rule, and the place to record "this one is meant to
 * be askew" should already be obvious when it is needed.
 */
export const KEEP_ANGLE = new Set<string>();

/** how far this part is off square, or 0 if that cannot be answered honestly */
function squaringTurn(part: BuildingPart): number {
  if (KEEP_ANGLE.has(part.id)) return 0;
  const s = part.bbox.getSize(new THREE.Vector3());
  const aspect = Math.max(s.x, s.z) / Math.max(Math.min(s.x, s.z), 1e-6);
  if (aspect < SQUARE_MIN_ASPECT) return 0;
  const deg = (part.axisAngle * 180) / Math.PI;
  const off = ((((deg + 45) % 90) + 90) % 90) - 45;
  // `+off`, NOT `-off`, and the sign was settled by measuring rather than by
  // reasoning: the first version returned the negative and every squared volume
  // came back at exactly TWICE its original angle (b03 12.37→24.74, b15
  // −4.02→−8.04). `footprintAxis` reads the angle in the (x, z) plane, where a
  // three.js rotation about +Y by θ is a rotation by −θ — so the measurement
  // moves against the turn, and cancelling it means turning WITH the reading.
  //
  // Worth stating because the failure is symmetric: both signs produce a
  // plausible-looking map full of tilted buildings, and only the numbers say
  // which one cancelled.
  return Math.abs(off) < SQUARE_MIN_DEG ? 0 : off;
}

/**
 * Bake placement into the parts, in place.
 *
 * Returns the parts that should be drawn — hidden ones are dropped here rather
 * than at the call site, so "which volumes exist" is one decision in one file.
 *
 * The turn is about the part's OWN centre, not the world origin: a building is
 * rotated to square it to the grid, and rotating it about a point hundreds of
 * units away would fling it across the site instead.
 */
export function applyLayout(parts: BuildingPart[], siteSpan: number): BuildingPart[] {
  const merged = mergeParts(parts);
  const out: BuildingPart[] = [];

  // BEFORE any decision is taken on them — see the note under this function.
  // The squaring rule reads `bbox` and `axisAngle` to judge whether a footprint
  // is elongated enough to have a meaningful axis, and judging that on the
  // split's pre-absorption numbers gets it wrong: b09 reads aspect 1.30 there
  // and 1.89 once its absorbed sliver is counted, i.e. below the gate and above
  // it. Measure first, then decide.
  for (const part of merged) rederive(part);

  for (const part of merged) {
    if (HIDDEN_BUILDINGS.has(part.id)) {
      part.geometry.dispose();
      continue;
    }
    const p = PLACEMENTS[part.id];
    // An explicit `turn` wins over the derived one — which is what makes the
    // rule safe to state as a rule: it is a default, not a law.
    const turn = p?.turn ?? squaringTurn(part);
    if (turn || p?.move) {
      const c = part.bbox.getCenter(new THREE.Vector3());
      const m = new THREE.Matrix4()
        .makeTranslation(
          (p?.move?.[0] ?? 0) * siteSpan + c.x,
          0,
          (p?.move?.[1] ?? 0) * siteSpan + c.z
        )
        .multiply(new THREE.Matrix4().makeRotationY((turn * Math.PI) / 180))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, 0, -c.z));
      // applyMatrix4 carries the NORMALS through too, which is why the turn can
      // be a matrix rather than a re-shade: the creased normals round 15 fought
      // for survive it.
      part.geometry.applyMatrix4(m);
      rederive(part);
    }
    out.push(part);
  }
  return out;
}

/**
 * ─── why `rederive` runs on parts this file did not touch ───────────────────
 *
 * Found by a measurement that could not be true: squaring `b13` changed its
 * HEIGHT, 0.769 → 0.974, under a rotation about Y — which cannot move anything
 * in y. It was not the rotation. `buildingSplit` absorbs sub-threshold slivers
 * into their nearest neighbour by concatenating geometry, but returns the
 * `bbox`, `centroid` and `axisAngle` of the part as it was BEFORE absorbing
 * them. So those three describe a smaller object than the one that is drawn and
 * raycast, on every part that absorbed anything — the church and its columns
 * being the clearest case.
 *
 * That is pre-existing and mostly invisible; what round 26 could not leave alone
 * is the INCONSISTENCY. Rederiving only the squared parts would have left the
 * map with two kinds of building: some describing their real extent and some
 * describing a subset, with nothing in the type to say which. Captions anchor on
 * `bbox`, the framing measures it, and the focus camera reads `axisAngle` —
 * three consumers that should not have to ask.
 *
 * `triCount` is deliberately NOT recomputed. It is what the ids were sorted on,
 * and a part that renumbers itself is the one failure this whole subsystem is
 * built to prevent.
 */

/**
 * Fold every `MERGE_INTO` source into its target.
 *
 * Reuses the split's own `concat`, deliberately: these two parts came out of one
 * primitive and a second, subtly different concatenation is how their normals or
 * winding would end up disagreeing with every other building on the site.
 *
 * `triCount` sums, because it is what the id ORDER was built from and a part
 * that lies about its own size makes the next id audit unreadable.
 */
function mergeParts(parts: BuildingPart[]): BuildingPart[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const dropped = new Set<string>();

  for (const [from, into] of Object.entries(MERGE_INTO)) {
    const src = byId.get(from);
    const dst = byId.get(into);
    if (!src || !dst) continue;
    const old = dst.geometry;
    dst.geometry = concat([old, src.geometry]);
    old.dispose();
    src.geometry.dispose();
    dst.triCount += src.triCount;
    rederive(dst);
    dropped.add(from);
  }
  return parts.filter((p) => !dropped.has(p.id));
}

/**
 * Re-derive everything `BuildingPart` promises about its geometry.
 *
 * DERIVED, never adjusted. It would be quicker to rotate the centroid by the
 * same matrix and add the turn to `axisAngle`, and that is exactly where a sign
 * error hides: `axisAngle` is a second-moment fit resolved through `atan2` into
 * a half-turn range, `MapCamera` reads it as a world angle, and the only symptom
 * of getting it backwards is the focus camera swinging to the wrong façade — on
 * one building, in a view you have to click to reach.
 */
function rederive(part: BuildingPart) {
  part.geometry.computeBoundingBox();
  part.geometry.computeBoundingSphere();
  part.bbox.copy(part.geometry.boundingBox!);
  part.bbox.getCenter(part.centroid);
  part.axisAngle = footprintAxis(
    part.geometry.getAttribute('position').array as Float32Array
  );
}
