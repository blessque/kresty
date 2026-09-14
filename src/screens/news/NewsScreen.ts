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
    // ROUND 26: `.gp-text` — the tabs are text and hang inside the column like
    // every other text block. Without it they started 16px left of the H1
    // directly above them, which is what the client reported.
    inner.className = 'col-full news-filters__row gp-text';
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
        `<div class="col-media">` +
        (n.image
          // ROUND 25: no anchor class. `.col-media` is five columns = 559.333 at
          // the design frame, which is the square's own width, so it FILLS its
          // position instead of leaving slack the old two-column grid had to
          // explain. The air before the headline is now the skipped column 6.
          ? `<img class="news-card__img" src="${asset(encodeURI(n.image))}" alt=""` +
            ` loading="lazy" decoding="async" width="1200" height="1200">`
          : '') +
        `</div>` +
        `<div class="col-main news-card__body gp-text">` +
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
