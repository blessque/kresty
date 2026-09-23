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
  /**
   * The paragraph under the title, if the frame has one — or several, which is
   * what «Музей» needs (round 28). Widening this rather than letting that page
   * hand-roll its masthead is what keeps «H1 + lead at columns 2-7 on every
   * page» a fact about the code and not a convention someone remembers.
   */
  lead?: string | string[];
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
  /**
   * The masthead sits on a DARK field, so the button takes the ondark variants
   * (round 28). Four of the five content pages are white from the first pixel;
   * «Музей» opens on near-black, where `--onlight`'s blue plate would be the
   * one thing on screen with no contrast. Ondark + secondary is the transparent
   * plate with a white stroke and white ink.
   */
  dark?: boolean;
  /** overrides `PARTNER_CTA` — «Музей»'s frame asks for «Связаться» */
  cta?: string;
}

export const PARTNER_CTA = 'Стать партнером';

export function buildPageHead({
  title,
  lead,
  eyebrow,
  meta,
  onPartner,
  dark,
  cta,
}: PageHeadOpts): HTMLElement {
  const head = document.createElement('header');
  head.className = 'page-head';

  const leads = lead === undefined ? [] : Array.isArray(lead) ? lead : [lead];

  const grid = document.createElement('div');
  grid.className = 'page-grid';
  grid.innerHTML =
    `<div class="col-lead">` +
    (eyebrow ?? '') +
    `<h1 class="page-title">${escapeHtml(bindShortWords(title))}</h1>` +
    leads.map((l) => `<p class="page-lead">${escapeHtml(bindShortWords(l))}</p>`).join('') +
    (meta ?? '') +
    `</div>`;
  head.appendChild(grid);

  if (onPartner) {
    const btn = document.createElement('button');
    btn.type = 'button';
    // ondark is the DEFAULT variant (`.btn` alone) — there is no `btn--ondark`
    // class; see button.css's matrix. Secondary on dark = transparent plate,
    // white stroke, white ink.
    btn.className = dark ? 'btn btn--secondary page-partner' : 'btn btn--onlight page-partner';
    btn.textContent = cta ?? PARTNER_CTA;
    btn.addEventListener('click', onPartner);
    head.appendChild(btn);
  }

  return head;
}
