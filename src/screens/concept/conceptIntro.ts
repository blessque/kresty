import { bindShortWords } from '../../shared/ruTypography';

/**
 * The page's opening block, above the map — Figma 616:188 / 616:260.
 *
 * Round 18. Until now «Концепция» opened straight onto the map, with no title
 * and no standfirst; the designer's first full-page frame gives it both, and
 * puts them in the RIGHT half of the measure rather than at the left margin —
 * the map below is full-bleed and starts at the left, so a left-aligned title
 * would sit directly over the column the plan's own margin captions use.
 *
 * The heading is Chromius **Medium**, which on this font's axis is `wght 150`,
 * NOT 500 — see `styles/fonts.css`. The axis runs min 50 / default 120 / max
 * 232, so a stray `font-weight: 500` clamps to Black. All of that lives in the
 * stylesheet; this module only builds the box.
 */

const TITLE = 'О «Крестах»';
const LEAD =
  'Легендарные Кресты откроют двери для жителей Санкт-Петербурга, ' +
  'туристов, артистов и бизнеса.';

export function buildIntro(): HTMLElement {
  const el = document.createElement('header');
  el.className = 'concept-intro';

  const inner = document.createElement('div');
  inner.className = 'concept-intro__body';

  const h1 = document.createElement('h1');
  h1.className = 'concept-intro__title';
  // bound with U+00A0 like the rest of the site's Russian, so a narrow window
  // cannot leave «О» stranded at the end of a line
  h1.textContent = bindShortWords(TITLE);

  const lead = document.createElement('p');
  lead.className = 'concept-intro__lead';
  lead.textContent = bindShortWords(LEAD);

  inner.append(h1, lead);
  el.appendChild(inner);
  return el;
}
