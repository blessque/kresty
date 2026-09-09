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
 * A card is a square photograph in the LEFT column and date · category ·
 * headline in the RIGHT. The visible gap between them is not a gutter: the
 * columns meet at the page centre and the image simply does not fill its
 * column, which is exactly what `styles/grid.css` documents about this page.
 * Nothing here sets a horizontal position — the grid does.
 */
export class NewsScreen extends ContentScreen {
  private filter: Category | null = null;

  constructor(el: HTMLElement) {
    super(el, 'news-page');
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
      const a = document.createElement('a');
      a.className = 'news-card page-grid';
      a.href = '#news/1';
      a.dataset.category = n.category;
      a.innerHTML =
        `<div class="col-l">` +
        (n.image
          // ANCHOR-OUTER: against the page margin, so the slack falls at the
          // CENTRE line — which is the 64px the designer drew between the image
          // and the headline, and the example `styles/grid.css` cites.
          ? `<img class="news-card__img anchor-outer" src="${asset(encodeURI(n.image))}" alt=""` +
            ` loading="lazy" decoding="async" width="1200" height="1200">`
          : '') +
        `</div>` +
        `<div class="col-r news-card__body">` +
        `<h2 class="news-card__title">${escapeHtml(bindShortWords(n.title))}</h2>` +
        `<p class="news-card__meta">` +
        `<span>${escapeHtml(n.date)}</span>` +
        `<span class="news-filters__dot" aria-hidden="true"></span>` +
        `<span>${escapeHtml(n.category)}</span>` +
        `</p>` +
        `</div>`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.onNavigate('article');
      });
      wrap.appendChild(a);
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
