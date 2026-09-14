import { buildPageHead } from '../../page/pageHead';

/**
 * The page's opening block, above the map — Figma 616:188 / 616:260.
 *
 * ROUND 26: THIS IS THE SHARED MASTHEAD NOW. It used to be its own h1, its own
 * lead and its own three CSS rules, placed in the RIGHT half of the measure
 * because the full-bleed map below starts at the left margin and a left-aligned
 * title was thought to sit over the column the plan's margin captions use.
 *
 * The client's instruction is that H1 + lead is the universal opening of every
 * page, at columns 2–7. The collision the old comment feared does not happen:
 * the intro sits ABOVE the map stage, not over it, and `mapLabels.ts`'s solver
 * takes its obstacles from measured rects — which do not include this header.
 * Verified after the move: all seven captions still place.
 *
 * What remains here is the copy and the spacing class. The type, the colour and
 * the grid position are `buildPageHead`'s, so a future «Музей» page is one call.
 */

const TITLE = 'О «Крестах»';
const LEAD =
  'Легендарные Кресты откроют двери для жителей Санкт-Петербурга, ' +
  'туристов, артистов и бизнеса.';

export function buildIntro(): HTMLElement {
  // No `onPartner`: «О Крестах» carries no CTA in the frames, and the head
  // omits the button entirely rather than rendering a dead one.
  const el = buildPageHead({ title: TITLE, lead: LEAD });
  // `.concept-intro` keeps ONLY what is specific to this page: its own top and
  // bottom padding, and the scroll-driven exit that `#screen-concept.past-intro`
  // drives. Everything typographic now comes from `.page-head`.
  el.classList.add('concept-intro');
  return el;
}
