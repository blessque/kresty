import { T } from '../styles/tokens.gen';

/**
 * The two colours the SEAM is made of (round 24 moved them here from
 * `screens/concept/pageSections.ts`).
 *
 * They were section-run constants when only one page seamed into the main
 * screen. Four more pages do now, and none of them has sections — so the colours
 * belong to the seam, not to the run that happened to own them first.
 */

/**
 * `#screen-main`'s resting field. It and `--color-field-main` BOTH derive from
 * the `blue` primitive, so they cannot drift — measured seam max Δ 1/255.
 *
 * READ FROM `tokens.gen.ts`, NEVER `getComputedStyle`: Vite injects CSS
 * asynchronously in dev, so a module-scope read can return `''` and this would
 * silently become empty with no error.
 */
export const MAIN_BG = T.blue;

/**
 * The mid-tone that carries a page's colour run out to the main screen's blue.
 *
 * TWO stops, not one wide band, and that is the decision: the leap from a ~7 %
 * lightness form to a 62 % lightness brand blue is far more travel than any
 * seam round 16 had, and widening a single band to cover it flattens the whole
 * thing into the mush a gradient would have been. A chosen mid-tone lets two
 * ordinary bands run back to back, and oklab through a mid-tone you picked
 * beats oklab through the midpoint it would have computed.
 *
 * A transition value with no design meaning — not a brand colour, which is why
 * it is not in the token set.
 */
export const DAWN_MID = '#2b4a7a';
