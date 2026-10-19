/**
 * The light's look (round 33) — the designer's handles, read by every light
 * (main, «Музей», «О Крестах») when it builds a frame. Mutated IN PLACE by
 * `screens/lab/lightLab.ts`, never reassigned (the `MOTION` pattern: a panel row
 * closes over the object). Only `?lab` loads the panel; on a normal visit this
 * object stays at `LOOK_DEFAULTS`.
 *
 * ROUND 33.1: `LOOK_DEFAULTS` IS THE SHIPPED LOOK — the user's own pick from the
 * lab (2026-10-20), applied to every light on top of its preset. So `applyLook`
 * is no longer the identity on a normal visit; the presets (`variants.ts`,
 * `motionParams.ts`) stay the base it multiplies, untouched. The do-nothing look
 * is exposure/trail/bloom/core 1 and everything else 0.
 *
 * Pure: imports nothing — `applyLook` is typed structurally, so it needs no gpu/
 * type to accept a `RayFieldParams`.
 */
export const LOOK_DEFAULTS = {
  /** gain on the light's emission (rays, bloom, core) */
  exposure: 1.05,
  /** trail length: a multiplier on the decay exponent λ (< 1 longer, > 1 shorter) */
  trail: 1.23,
  /** ray source: 0 = the shipped radial smear, 1 = crisp — round 5's "razor" */
  edge: 0,
  /** the rainbow fringe, added to the preset's `ca` (0 since round 33): noise-free
   *  now, so the user brought back a little — the old look was 0.03 */
  rainbow: 0.02,
  bloom: 1.07,
  core: 1.01,
  /** extended source: ray edges feather with distance */
  penumbra: 0,
  /** living haze: drifting air density, stirred by the cursor */
  haze: 0.18,
  hazeScale: 270,
  hazeDrift: 0.7,
  hazeWind: 1.65,
};

export const LOOK = { ...LOOK_DEFAULTS };

interface LookTarget {
  godrays: number;
  bloom: number;
  coreIntensity: number;
  ca: number;
  trail: number;
  rayEdge: number;
  penumbra: number;
  haze: number;
  hazeScale: number;
  hazeDrift: number;
  hazeWind: number;
}

/**
 * The look applied on top of a preset. Multiplicative terms, or terms that only
 * act on the rays (rainbow, haze), so the reveal multiply that follows it — the
 * scroll seam's exact black — still zeroes everything it emits.
 */
export function applyLook<T extends LookTarget>(p: T): T {
  const L = LOOK;
  return {
    ...p,
    godrays: p.godrays * L.exposure,
    bloom: p.bloom * L.exposure * L.bloom,
    coreIntensity: p.coreIntensity * L.exposure * L.core,
    ca: p.ca + L.rainbow,
    trail: p.trail * L.trail,
    rayEdge: Math.max(p.rayEdge, L.edge),
    penumbra: Math.max(p.penumbra, L.penumbra),
    haze: Math.max(p.haze, L.haze),
    hazeScale: L.haze > 0 ? L.hazeScale : p.hazeScale,
    hazeDrift: L.haze > 0 ? L.hazeDrift : p.hazeDrift,
    hazeWind: L.haze > 0 ? L.hazeWind : p.hazeWind,
  };
}
