import { ContentScreen } from '../../page/ContentScreen';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
import { buildPageHead } from '../../page/pageHead';
import { NEWS, CATEGORIES, type Category } from './newsData';
import { T } from '../../styles/tokens.gen';

/**
 * «Новости» — the list (Figma `854:251`).
 *
 * A card is a photograph in the LEFT column and date · category · headline in
 * the RIGHT. The visible gap between them is the SKIPPED COLUMN 6, not a gutter
 * — the picture fills `.col-media` exactly. Nothing here sets a horizontal
 * position; the grid does.
 *
 * ROUND 27: THE CARD IS AN `<article>`, NOT AN `<a>`.
 * The client asked for the category tags to be blue, and on this site blue means
 * clickable — so the tag had to become a real control rather than blue paint on
 * an inert label. A `<button>` inside an `<a>` is invalid and behaves
 * unpredictably (the outer link swallows the click in some engines, both fire in
 * others), so the meta row is free to hold a working filter button.
 *
 * ROUND 27.1: THE WHOLE CARD IS THE TARGET. There is ONE link, on the headline,
 * and `pages.css` stretches its `::after` across the card — so the picture, the
 * headline and the air between them all click through, while the accessible
 * name stays the headline and the tag button sits above it on `z-index`. Round
 * 27's two links (picture + headline) left a dead strip down the middle, which
 * is what the reader actually aims at.
 */
export class NewsScreen extends ContentScreen {
  private filter: Category | null = null;

  constructor(el: HTMLElement) {
    super(el, 'news-page');
  }

  /**
   * Show one category, from outside — the article's breadcrumb following its way
   * back up. Safe before `build()`: `buildFilters` and `buildCards` both read
   * `filter` as they go, so a list that has never been opened comes up already
   * filtered instead of rendering all thirteen and then hiding nine.
   */
  showCategory(c: Category | null) {
    this.filter = c;
    this.applyFilter();
  }

  protected stops() {
    // one flat field; the shell adds the dawn and main's blue below it
    return [{ top: 0, color: T.bgLightMain }];
  }

  protected build() {
    this.shell.add(
      buildPageHead({
        title: 'Новости',
        onPartner: () => this.onNavigate('contacts'),
      }),
    );

    const list = document.createElement('div');
    list.className = 'news-list';
    list.append(this.buildFilters(), this.buildCards());
    this.shell.add(list);
  }

  private buildFilters(): HTMLElement {
    const row = document.createElement('nav');
    row.className = 'news-filters page-grid';
    row.setAttribute('aria-label', 'Фильтр новостей');

    const inner = document.createElement('div');
    // Round 26 gave this `.gp-text` so the tabs lined up with the H1 above them,
    // which was 16px inside its column. Round 29 removed the inset everywhere, so
    // the two agree again with no class at all — the alignment is the point, not
    // the utility.
    inner.className = 'col-full news-filters__row';
    // «Все» plus the three categories, separated by the frame's small stars
    const all: (Category | null)[] = [null, ...CATEGORIES];
    all.forEach((c, i) => {
      if (i > 0) {
        const dot = document.createElement('span');
        dot.className = 'news-filters__dot';
        dot.setAttribute('aria-hidden', 'true');
        inner.appendChild(dot);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'news-filters__btn';
      b.textContent = c ?? 'Все';
      b.classList.toggle('on', this.filter === c);
      b.addEventListener('click', () => {
        this.filter = c;
        this.applyFilter();
      });
      inner.appendChild(b);
    });
    row.appendChild(inner);
    return row;
  }

  private buildCards(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'news-cards';
    for (const n of NEWS) {
      const card = document.createElement('article');
      card.className = 'news-card page-grid';
      card.dataset.category = n.category;
      // Honour a filter set BEFORE this list was ever built — the article's
      // breadcrumb can arrive here first. `buildFilters` already reads `filter`
      // for the active tab; without the same read here the tab came up correct
      // above thirteen unfiltered cards.
      card.hidden = this.filter !== null && n.category !== this.filter;
      card.innerHTML =
        `<div class="col-media">` +
        (n.image
          // `.col-media` is five columns = 559.333 at the design frame, so the
          // picture FILLS its position. `w`/`h` are the file's real pixels: the
          // box has to exist before the lazy image decodes, or the page grows
          // under a reader who is already scrolling.
          //
          // No link of its own — the headline's link is stretched over the whole
          // card in CSS, so the picture, the headline and the air between them
          // are one target with one accessible name.
          ? `<img class="news-card__img" src="${asset(encodeURI(n.image))}" alt=""` +
            ` loading="lazy" decoding="async" width="${n.w}" height="${n.h}">`
          : '') +
        `</div>` +
        `<div class="col-main news-card__body">` +
        `<h2 class="news-card__title">` +
        `<a class="news-card__link" href="#news/1">${escapeHtml(bindShortWords(n.title))}</a>` +
        `</h2>` +
        `<p class="news-card__meta">` +
        `<span class="news-card__date">${escapeHtml(n.date)}</span>` +
        `<span class="news-filters__dot" aria-hidden="true"></span>` +
        `<button type="button" class="news-card__tag">${escapeHtml(n.category)}</button>` +
        `</p>` +
        `</div>`;

      card.querySelector('.news-card__link')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.onNavigate('article');
      });
      // the tag filters the list to its own category — which is what makes it
      // legitimately blue rather than blue-and-inert
      card.querySelector('.news-card__tag')?.addEventListener('click', () => {
        this.filter = n.category;
        this.applyFilter();
        this.el.querySelector('.news-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      wrap.appendChild(card);
    }
    return wrap;
  }

  /**
   * Client-side, and it re-measures afterwards: hiding a card changes every
   * colour stop and the handoff's own top, and the shell reads those from the
   * DOM rather than caching them.
   */
  private applyFilter() {
    this.el.querySelectorAll<HTMLElement>('.news-card').forEach((c) => {
      c.hidden = this.filter !== null && c.dataset.category !== this.filter;
    });
    this.el.querySelectorAll<HTMLElement>('.news-filters__btn').forEach((b) => {
      b.classList.toggle('on', (b.textContent === 'Все' ? null : b.textContent) === this.filter);
    });
    this.shell.measure();
  }
}
