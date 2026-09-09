import { escapeHtml } from '../shared/escapeHtml';
import { bindShortWords } from '../shared/ruTypography';

/**
 * The masthead every content page carries (round 24): the page title, an
 * optional lead paragraph, and the «Стать партнером» button at the top right.
 *
 * All four of the designer's frames draw the same three things in the same
 * places, so they are built once. The button is the shared `.btn` with a new
 * label — `--onlight` because these pages are light, where «Связаться» on the
 * main screen's blue is the ondark variant.
 *
 * The button sits OUTSIDE the grid, pinned to the page's 32px corner rule along
 * with the wordmark — the header and the logos keep their own margins and are
 * explicitly not on the content grid.
 */
export interface PageHeadOpts {
  title: string;
  /** the paragraph under the title, if the frame has one */
  lead?: string;
  onPartner: () => void;
}

export const PARTNER_CTA = 'Стать партнером';

export function buildPageHead({ title, lead, onPartner }: PageHeadOpts): HTMLElement {
  const head = document.createElement('header');
  head.className = 'page-head';

  const grid = document.createElement('div');
  grid.className = 'page-grid';
  grid.innerHTML =
    `<div class="col-full">` +
    `<h1 class="page-title">${escapeHtml(bindShortWords(title))}</h1>` +
    (lead ? `<p class="page-lead">${escapeHtml(bindShortWords(lead))}</p>` : '') +
    `</div>`;
  head.appendChild(grid);

  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'btn btn--onlight page-partner';
  cta.textContent = PARTNER_CTA;
  cta.addEventListener('click', onPartner);
  head.appendChild(cta);

  return head;
}
