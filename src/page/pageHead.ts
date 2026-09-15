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
  /**
   * Markup to sit ABOVE the title — «Новость»'s breadcrumbs, today the only
   * caller. Already-escaped HTML, because it carries its own <a>.
   */
  eyebrow?: string;
  /**
   * Markup to sit BELOW the title and lead — «Новость»'s date · category
   * (round 27.1). It belongs to the masthead because there is exactly one
   * article on the page: a rail that tracks the scroll is answering a question
   * ("which section am I in") that a single article never asks.
   * Already-escaped HTML, same contract as `eyebrow`.
   */
  meta?: string;
  /** omitted on «Новость», the one page the frames give no CTA */
  onPartner?: () => void;
}

export const PARTNER_CTA = 'Стать партнером';

export function buildPageHead({ title, lead, eyebrow, meta, onPartner }: PageHeadOpts): HTMLElement {
  const head = document.createElement('header');
  head.className = 'page-head';

  const grid = document.createElement('div');
  grid.className = 'page-grid';
  grid.innerHTML =
    `<div class="col-lead gp-text">` +
    (eyebrow ?? '') +
    `<h1 class="page-title">${escapeHtml(bindShortWords(title))}</h1>` +
    (lead ? `<p class="page-lead">${escapeHtml(bindShortWords(lead))}</p>` : '') +
    (meta ?? '') +
    `</div>`;
  head.appendChild(grid);

  if (onPartner) {
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'btn btn--onlight page-partner';
    cta.textContent = PARTNER_CTA;
    cta.addEventListener('click', onPartner);
    head.appendChild(cta);
  }

  return head;
}
