import { asset } from '../../shared/assetUrl';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';

/**
 * The «О Крестах» hero — Figma `1253:693`, 1440×511, above the masthead.
 *
 * A full-bleed dusk render of the complex from the Neva, a centred tagline, and
 * a row of four in-page links. It is the first thing on the page and the only
 * photograph on it that is not inside a picture block.
 *
 * ── the numbers, and where they came from ───────────────────────────────────
 * Everything below is off the frame rather than eyeballed. The image box is
 * 1440×589 anchored to the BOTTOM of a 511-tall frame, i.e. 78px is cropped off
 * the top; the veil is a linear gradient from transparent at 73.5% to
 * `rgba(3,23,33,0.4)` at the foot; the tagline is Base Text (24/145%) on a
 * 436px measure; the links are Caption Small (16/120%) 87px apart. The CSS in
 * concept.css states each of those as a share of 1440 so they scale with the
 * rest of the fluid grid, and says so where it does.
 *
 * ── this block is NOT a `.page-grid` ────────────────────────────────────────
 * Both the tagline and the link row are centred on the PAGE, not placed on
 * columns: 502 + 436/2 = 720 and 369 + 702/2 = 720, both exactly the page
 * centre at 1440. Putting them on the grid would be inventing a structure the
 * frame does not have, and the twelve columns have no centre line to land on —
 * column 6 ends at 720 and column 7 begins there.
 */

const TAGLINE_A = 'Пространство внутренней свободы';
const TAGLINE_B = 'на территории легендарной тюрьмы в Санкт-Петербурге';

/**
 * The link row.
 *
 * TODO(designer): «Резиденты» and «Что тут будет» both land on the section run,
 * because the page has exactly three things to jump to — the map, the five offer
 * sections and the form — and the frame asks for four links. Round 16's
 * `residentSections.ts` was a separate block and is deleted. This is a table so
 * retargeting either one is a single line; ask before guessing at a fourth
 * destination.
 */
const LINKS: { label: string; target: string }[] = [
  { label: 'Карта комплекса', target: '.map-stage' },
  { label: 'Резиденты', target: '.sec' },
  { label: 'Что тут будет', target: '.sec' },
  { label: 'Задать вопрос', target: '.contact-form' },
];

export function buildHero(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'concept-hero';

  el.innerHTML =
    `<img class="concept-hero__img shimmer" src="${asset('/resources/embankment-hero.webp')}"` +
    // Intrinsic pixels for the same reason every MediaItem carries them: the box
    // is committed before decode. This one is ABOVE the fold and the first thing
    // the map's scroll geometry is measured against, so a late reflow here moves
    // `introTop` and with it every scroll position on the page.
    ` width="2400" height="960" alt="«Кресты» со стороны Невы" fetchpriority="high">` +
    `<div class="concept-hero__veil" aria-hidden="true"></div>` +
    `<p class="concept-hero__tag">${escapeHtml(bindShortWords(TAGLINE_A))}<br>` +
    `${escapeHtml(bindShortWords(TAGLINE_B))}</p>` +
    `<nav class="concept-hero__nav" aria-label="Разделы страницы">` +
    LINKS.map(
      (l) =>
        `<a href="#concept" data-target="${escapeHtml(l.target)}">` +
        `${escapeHtml(bindShortWords(l.label))}</a>`,
    ).join('') +
    `</nav>`;

  // `href="#concept"` keeps these real links — focusable, and they say where
  // they are without a `role`. The route is already `#concept`, so the default
  // action is a no-op worth preventing anyway: letting it through would push a
  // duplicate history entry and the browser Back button is the page's own return
  // gesture (see mainHandoff).
  el.querySelector('.concept-hero__nav')?.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[data-target]');
    if (!a) return;
    e.preventDefault();
    document
      .querySelector(a.getAttribute('data-target')!)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  return el;
}
