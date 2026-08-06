/**
 * Every dial the Neva has, and the reasoning behind each shipped value.
 *
 * Split out of water.ts in round 14 so the admin panel (`?admin=1`) has
 * something to bind to and so the shipped numbers stay in one place. THE
 * COMMENTS ARE THE POINT: each of these was arrived at by shipping the opposite
 * first, across four rejected water modes and two rejected rewrites. Read them
 * before moving a number, and read TUNING_LOG map rounds 11 and 11.1 before
 * moving several.
 */

/** the noise-texture bake — changing any of these rebuilds the DataTexture */
export interface RippleParams {
  /**
   * SIZE IS DECIDED BY `baseGrid`, not by taste. The finest lattice is
   * `baseGrid << (octaves - 1)` cells across the tile, and below roughly 8
   * texels per cell the bake stops carrying information and starts carrying
   * interpolation. Shipped: 27 × 2 octaves = 54 cells, so 1024 gives 19 texels
   * per cell and 256 would give under 5.
   *
   * The cost is real and it is paid at load, measured: 1 MiB and 31.5 ms at
   * 1024, against 256 KiB / 7.8 ms at 512 and 64 KiB / 1.9 ms at 256. Must stay
   * a power of two, or mipmapping is invalid.
   */
  size: number;
  /**
   * Grid cells across the tile for the COARSEST octave — the dial that decides
   * what the water looks like, because an FBM's dominant feature size is
   * tile/baseGrid and the coarsest octave carries the most amplitude.
   *
   * THIS IS ONLY MEANINGFUL TOGETHER WITH `tileA`/`tileB`. What matters is the
   * feature size in screen px: tile / baseGrid × 2.48 px per world unit. The
   * shipped 27 against tiles of 351 and 151 gives 32 px and 14 px coarse
   * features — fine, busy texture, which is what carries the chop.
   *
   * Round 11 shipped 4 against a 113 tile (70 px) for a calm swell, having
   * dropped it from 32 for the round-9.2 `chop` mode, where the coarsest feature
   * was tile/32 and the result read as mould or camouflage. That failure was
   * about the RATIO, not the number: 27 is fine here because the tiles grew with
   * it.
   */
  baseGrid: number;
  /** each octave doubles the grid. Shipped at 2 (round 11 used 3) — with a
   *  baseGrid this fine, a third octave lands below one screen pixel and only
   *  feeds the mip chain. */
  octaves: number;
  /** how much each successive octave contributes. Shipped 0.36 (round 11 used
   *  0.5): the fine octave supports the coarse one rather than competing. */
  gain: number;
  /** fixed seed on purpose — the same bytes every reload, so a screenshot diff
   *  is meaningful and "it looks different today" cannot happen */
  seed: number;
  /** Focus mode swings the camera to ~35° elevation, so the water runs to a
   *  grazing angle and trilinear picks its mip from the worst axis. three
   *  clamps to the hardware maximum on upload, so a flat 4 is safe everywhere. */
  anisotropy: number;
}

/**
 * One wave carrier — the stage whose absence made the surface read as cloud.
 *
 * ONE FAMILY, NOT TWO. This is the rule that survived round 14 intact, and it
 * is why the two carriers stay close in heading (11° / 31°, so 20° apart). The
 * first attempt gave them 0.55/0.45 at 68° apart and it read as woven mesh —
 * two comparable crest sets crossing make a diamond lattice, which is just
 * plaid wearing a warp.
 *
 * What DID change: the shipped amplitudes are 0.88/0.57 rather than round 11's
 * 0.74/0.26, and the wavelengths are 3.5 and 24.1 world units (9 and 60 px)
 * rather than 10.0 and 6.2. So the second carrier is now the LONG one — a broad
 * swell with fine chop riding on it, instead of two near-neighbours. They still
 * read as one family because they still run nearly the same way; it is the
 * heading that does that work, not the wavelength.
 */
export interface WaveParams {
  /** wavelength in world units (x2.48 for screen px at the overview camera).
   *  Shipped: 3.5 and 24.1 = 9 and 60 px. Anything under ~8 px reads as moiré
   *  rather than as waves, which is what killed the 5.5/3.7 first pass. */
  len: number;
  /** crest-normal heading in degrees; neither is square to the river, and the
   *  two stay within ~20° of each other so they read as one family */
  head: number;
  /**
   * Phase advance in cycles/second.
   *
   * ROUND 11 HELD THIS AT ~0.02 AND THE SHIPPED SET DOES NOT — it is 0.275 and
   * 0.39, with a SHARED sign so the two travel together. The old reasoning is
   * still true as physics: a carrier phase advance is a rigid translation of the
   * crest field (at 0.09 cycles/s a shift-matching test attributed 26% of all
   * frame-to-frame change to a single (11,12) px translation). Round 11 read
   * that as the "obvious scrolling" defect and suppressed it; round 14 wants it,
   * because a river visibly flows and a lake does not.
   *
   * So this is now the CURRENT dial. Turn both down toward zero and the surface
   * reverts to re-forming in place — but do that only alongside raising `warp`,
   * or what is left is «Гравюра»'s marching comb with nothing to break it up.
   */
  speed: number;
  /** this carrier's share of the height field */
  amp: number;
  /**
   * Phase warp in CYCLES — THE SINGLE MOST IMPORTANT CONSTANT IN THE FILE.
   *
   * A carrier sin(2π·dot(q,d)/λ) has phase gradient 1/λ; a warp W·noise(q)
   * contributes W·|∇noise| ≈ W/F for noise feature size F. Wavefronts can only
   * FOLD where the warp gradient cancels the carrier's, i.e. where W ≳ F/λ.
   * «Гравюра» used 0.72 — below the regime in which water exists — and drew a
   * ruled comb by construction. Below ~1 cycle you get hatching, every time,
   * and the round-14 panel reproduces that live at 0.3.
   *
   * The shipped 1.1 / 1.2 sit just past the threshold rather than comfortably
   * past round 11's 2.4 / 1.7. That is affordable ONLY because the carriers now
   * travel (see `speed`): variety comes from motion and interference instead of
   * from static folding. The two dials are coupled — drop the speeds without
   * raising this and the comb returns.
   */
  warp: number;
  /** this carrier's share of noise A in its warp. BOTH fields warp BOTH
   *  carriers; different mixes keep the two from being warped identically,
   *  which would re-correlate them. */
  mixA: number;
}

export interface WaterParams {
  /**
   * Tile size in world units per warp layer.
   *
   * THE TEST IS THE LCM, NOT PRIMALITY. The composite pattern repeats at
   * lcm(tileA, tileB), which must stay far larger than the ~581 world units
   * visible across the frame. Round 11 got there by making both prime
   * (lcm 17741 ≈ 30x the frame); the shipped 351/151 are not coprime by
   * construction but land at lcm 53001 ≈ 90x, so the guarantee is stronger, not
   * weaker. Two ROUND numbers (120, 160) would drop it to ~480 and the repeat
   * would walk straight back into view — that is the failure to avoid.
   */
  tileA: number;
  tileB: number;
  /**
   * How fast each warp layer travels (world units/second) and in what direction
   * (degrees). Together with the carrier speeds, this is what makes the river
   * move.
   *
   * ROUND 11 KEPT THE HEADINGS ~180° APART AND THE SHIPPED SET DOES NOT — they
   * are 14° apart now (235° / 249°). The reasoning behind the old rule still
   * holds and is worth knowing, because it tells you what you are trading:
   * the warp dominates the phase gradient, so whatever moves the warp moves the
   * crests; two fields drifting along near-opposite vectors have a superposition
   * with no coherent translation, so the wavefronts re-form in place rather than
   * sliding (measured: 19% of frame-to-frame change explained by translation at
   * 176° apart, 33% at 130°, 46% with a single dominant drift).
   *
   * Round 14's verdict is that a river should slide. Near-parallel headings plus
   * the carrier speeds below give it one direction of travel. If you ever want
   * the shimmering-in-place register back, that is the pair of dials — not the
   * carriers.
   */
  driftA: number;
  driftB: number;
  headingA: number;
  headingB: number;
  waves: [WaveParams, WaveParams];
  /** how much of the crest amplitude the activity envelope can remove. Real
   *  water is never uniformly agitated; a constant amplitude everywhere is one
   *  of the things that reads as generated. */
  calm: number;
  /** a thin bright crest, like light catching the top of a ripple. Kept small —
   *  this is the one term that can tip the surface from "alive" into "effect". */
  crest: number;
  /**
   * The two ends of the ramp, as per-channel multipliers on the base water tone.
   *
   * The multipliers are deliberately UNEQUAL. Equal ones would be a brightness
   * ramp, which desaturates toward grey; unequal ones move along a temperature
   * axis, so the shadow side reads as deeper water and the light side as sky on
   * water.
   *
   * MIND THE COLOUR SPACE. These multiply in LINEAR working space, but the
   * register is agreed in what you can see, which is sRGB — encoding compresses
   * a linear ratio by roughly its 2.2 gamma, so a ±4% linear change measures
   * ±1.7% on screen. Always size these against a measured screenshot, never
   * against the multiplier.
   *
   * The shipped pair is ASYMMETRIC: `light` is barely above unity (1.01/1.03/
   * 1.03) while `deep` pulls hard (0.57/0.845/0.985). So the base tone sits at
   * the CREST end and the modulation all happens downward, into the troughs —
   * the opposite of round 11's ramp about a midpoint. Measured on a 600×130
   * patch of open water: R 118→173, G 202→234.
   *
   * KNOWN, AND NOT A BUG: the base tone's blue is already 255, so `light[2]`
   * pushes past the ceiling and BLUE IS PINNED AT 255 ON 87.5% OF THE WATER.
   * Two consequences to know before reaching for these — `light[2]` is inert as
   * shipped, and the surface's variation is carried entirely by R and G, which
   * is why the crests read as cyan-white rather than as brighter blue. Lower
   * `color`'s blue first if you ever want the blue channel back in play.
   *
   * This pair is the contrast dial. If the verdict is "too strong" or "I can't
   * see it", scale the deltas from 1.0 here — do NOT add stages.
   */
  deep: [number, number, number];
  light: [number, number, number];
  /**
   * The base water tone — the plan's `Color_H08` surface (groundPlan.ts reads
   * it from here, so there is one source of truth).
   *
   * The trajectory is one-directional and worth reading as one: #d4eaf5 (round
   * 9.1, near-white) → #c5e0f0 (round 11, because a tonal swing against a
   * near-white base was below the threshold of visibility) → **#99daff** (round
   * 14). The Neva is now unambiguously the one saturated surface on a
   * near-monochrome plan, which is what makes it read as water rather than as a
   * lighter shade of ground.
   *
   * Its blue is 255, which is what pins the blue channel — see `light`.
   */
  color: number;
  texture: RippleParams;
}

/**
 * THE SHIPPED WATER, tuned by the designer with the round-14 admin panel.
 *
 * This set was arrived at by hand, on screen, against the revealed river — the
 * first time that was possible. It is the verdict, and it OVERRIDES several of
 * the rules the round-11 comments above state as general law. Where it does,
 * the comment says so on the spot rather than quietly disagreeing with the
 * number underneath it. Four of them are worth knowing before you touch this:
 *
 *   1. `headingA/B` are 14° apart, not ~180°. Round 11 kept them near-opposite
 *      so the warp superposition had no coherent translation and the crests
 *      re-formed in place. This set does the opposite ON PURPOSE and pairs it
 *      with fast carriers: the river now READS AS FLOWING rather than
 *      shimmering in place, which is what a river actually does.
 *   2. `speed` is 0.275 / 0.39 cycles/s, not ~0. Round 11 held it near zero
 *      because a carrier phase advance is a rigid translation of the crest
 *      field; here that translation IS the effect. The two carriers now share a
 *      sign, so they travel together.
 *   3. `tileA` is 351, which is NOT prime (3³·13). The anti-tiling argument was
 *      lcm(113,157) = 17741; lcm(351,151) = 53001, ~90x the visible frame, so
 *      the guarantee survives by a wider margin than before despite the loss of
 *      coprimality-by-construction. Check the lcm, not the primality, if you
 *      move these.
 *   4. `warp` is 1.1 / 1.2, close to the ~1 cycle folding threshold rather than
 *      comfortably past it. That is affordable only because the carriers move:
 *      the crests here get their variety from travel and interference rather
 *      than from static folding. Lower the speeds without raising the warp and
 *      «Гравюра»'s comb comes back.
 *
 * `texture.size` is 1024 — 1 MiB and a measured 31.5 ms bake at load, against
 * 64 KiB and 1.9 ms at 256. It earns it here: `baseGrid` 27 puts the finest
 * lattice at 54 cells across the tile, which 256 texels would resolve at under
 * 5 texels per cell.
 */
export const WATER_DEFAULTS: WaterParams = {
  tileA: 351,
  tileB: 151,
  driftA: 3.9,
  driftB: 2.85,
  headingA: 235,
  headingB: 249,
  waves: [
    { len: 3.5, head: 11, speed: 0.275, amp: 0.88, warp: 1.1, mixA: 0.46 },
    { len: 24.1, head: 31, speed: 0.39, amp: 0.57, warp: 1.2, mixA: 0.36 },
  ],
  calm: 0.72,
  crest: 0.098,
  deep: [0.57, 0.845, 0.985],
  light: [1.01, 1.03, 1.03],
  color: 0x99daff,
  texture: { size: 1024, baseGrid: 27, octaves: 2, gain: 0.36, seed: 0x5f3a91, anisotropy: 4 },
};

/** a deep copy — the panel mutates its working set, and the defaults are the
 *  thing "Reset" restores, so they must not be reachable by reference */
export function cloneWaterParams(p: WaterParams): WaterParams {
  return {
    ...p,
    waves: [{ ...p.waves[0] }, { ...p.waves[1] }],
    deep: [...p.deep],
    light: [...p.light],
    texture: { ...p.texture },
  };
}

/** do two parameter sets need a texture rebake to tell apart? */
export function textureChanged(a: RippleParams, b: RippleParams): boolean {
  return (
    a.size !== b.size ||
    a.baseGrid !== b.baseGrid ||
    a.octaves !== b.octaves ||
    a.gain !== b.gain ||
    a.seed !== b.seed ||
    a.anisotropy !== b.anisotropy
  );
}
