/**
 * The light's look (round 33) — the designer's handles, read by every light
 * (main, «Музей», «О Крестах») when it builds a frame. Mutated IN PLACE by
 * `screens/lab/lightLab.ts`, never reassigned (the `MOTION` pattern: a panel row
 * closes over the object). Only `?lab` loads the panel; on a normal visit this
 * object stays at `LOOK_DEFAULTS`.
 *
 * ROUND 33.1: `LOOK_DEFAULTS` IS THE SHIPPED LOOK — the user's own pick from the
 * lab, applied to every light on top of its preset. So `applyLook` is no longer
 * the identity on a normal visit; the presets (`variants.ts`, `motionParams.ts`)
 * stay the base it multiplies, untouched. The do-nothing look is
 * exposure/trail/bloom/core 1 and everything else 0.
 *
 * ROUND 33.2 (same day): the user's second pick, tuned on «Музей» — shorter,
 * crisper rays with far less glow, and nothing laid over them: no rainbow, no
 * haze, no film grain. The haze's scale/drift/wind keep 33.1's values, inert at
 * haze 0, so turning it back on in the lab starts where the user left it.
 *
 * Pure: imports nothing — `applyLook` is typed structurally, so it needs no gpu/
 * type to accept a `RayFieldParams`.
 */
export const LOOK_DEFAULTS = {
  /** gain on the light's emission (rays, bloom, core) */
  exposure: 1.05,
  /** trail length: a multiplier on the decay exponent λ (< 1 longer, > 1 shorter) */
  trail: 1.47,
  /** ray source: 0 = the radial smear, 1 = crisp — round 5's "razor". Part-way
   *  crisp also raises the canvas's detail cap (`detailScale`): finer edges */
  edge: 0.41,
  /** the rainbow fringe, added to the preset's `ca` (0 since round 33) — 0.02 in
   *  33.1, off again in 33.2; the old look was 0.03 */
  rainbow: 0,
  bloom: 0.34,
  core: 0.67,
  /** extended source: ray edges feather with distance */
  penumbra: 0,
  /** living haze: drifting air density, stirred by the cursor — 0.18 in 33.1 */
  haze: 0,
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
 *
 * `over` replaces handles for ONE light (round 34.1: «Музей»'s own exposure),
 * so a page can differ without the global look moving on every other page.
 */
export function applyLook<T extends LookTarget>(p: T, over?: Partial<typeof LOOK>): T {
  const L = over ? { ...LOOK, ...over } : LOOK;
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

/**
 * «Музей»'s own handles (round 34) — the lab's «Музей» group, the same
 * mutate-in-place pattern as `LOOK`. Read by `MuseumLight` and `MuseumScreen`
 * every frame, so a slider moves the page live.
 *
 * ── why the one gain became three numbers ───────────────────────────────────
 * Round 28.1 put ONE `GAIN = 0.22` on all four emissive terms, because the
 * emblem is 2.2 viewport heights — about 4× the hero's — and at the preset's
 * own intensities the field washed out. The user: "why is it faded?" — and the
 * diagnosis is that the gain treated a LENGTH problem as a BRIGHTNESS one.
 *
 * At `dissolve: 1` the visible arms ARE the rays, and the rays' trails decay in
 * EMBLEM units, so a 4× emblem draws them 4× longer in px: they cross the whole
 * frame and, under `screen`, lift the navy toward pale blue. Dimming them to
 * 22 % kept the field dark by making the cross itself grey. `reach` instead
 * shortens the trails back toward the hero's px length, and then the rays can
 * burn at the hero's strength. Measured at 1440×900 against main's own cross
 * (luminance percentiles over the left half, `?rot=30`):
 *
 *     look                                field p10   arms p99
 *     round 28.1 (one gain 0.22)             41         169
 *     bloom/core at 1, rays still 0.22       54         205    field lifted, arms still grey
 *     cross 0.3 · trails 1.2 · reach 0.3     34         228    ← shipped
 *     main's cross (centre 500²)             54         237
 *
 * `cross` is the bloom and core (the glow hugging the emblem), `rays` the
 * godrays and haze (round 34 called it `trails`; the lab key is still
 * `musTrails`, so the user's links keep working), `reach` the trails' length
 * relative to «Сияние»'s.
 *
 * `solid` is `1 − dissolve`: 0 is «Сияние»'s fully dissolved register (no crisp
 * body, only glow); above 0 the emblem's own strokes come back, the way the
 * «О Крестах» icons draw them at 0.59. Live — the shader lerps the baked bloom
 * toward its crisp copy, so no re-bake.
 *
 * `exposure`, `trail`, `edge`, `bloom` and `core` are «Музей»'s OWN copies of
 * the Light group's handles (34.1, 34.2), replacing them on this page alone. The
 * user tunes the look ON this page, and through the global handles every
 * change also landed on «О Крестах» — exposure 0.46 dimmed its icons, and
 * 34.2's core 0 would have switched their crisp body off entirely.
 *
 * The three `phone*` handles act below the 1160 breakpoint only, where the body
 * copy runs over the light: a cap on its strength, and where the convergence
 * point sits — x as a fraction of the width (0 = the left edge, −0.25 a quarter
 * screen further off it), y as a fraction of the height (0.5 = the middle, 1 =
 * the bottom corner). The user: "people read text in some point of their mobile
 * screen, not thru the full screen height." Desktop stays at (0, 0.5).
 */
/* Round 34.2: the user's own pick from the lab, on this page (34.1 was their
   first: exposure 0.46 · cross 0.47 · rays 1.3 · reach 0.34 · solid 0.49). On a
   phone the cross sits in the bottom-right corner (1, 0.98) at 0.56, where it
   "doesn't hurt left-aligned text reading"; on a desktop its centre sits a
   little off the left edge, −80 px at 1440 ("not exactly on the page's 0 X"),
   as a fraction of the width so it scales with the screen. The table above is
   round 34's first cut. */
export const MUSEUM_LOOK_DEFAULTS = {
  // the Light group's handles, this page's own values
  exposure: 0.33,
  trail: 0.81,
  edge: 0.32,
  bloom: 0.21,
  core: 0,
  // what the emblem's size forces
  cross: 0.49,
  rays: 0.68,
  reach: 0.33,
  solid: 0.86,
  // where it sits
  deskX: -0.056,
  phoneGlow: 0.56,
  phoneX: 1,
  phoneY: 0.98,
};

/** the part of `MUSEUM_LOOK` that replaces the Light group's handles on «Музей» */
export function museumLookOver(): Partial<typeof LOOK> {
  const M = MUSEUM_LOOK;
  return { exposure: M.exposure, trail: M.trail, edge: M.edge, bloom: M.bloom, core: M.core };
}

export const MUSEUM_LOOK = { ...MUSEUM_LOOK_DEFAULTS };
