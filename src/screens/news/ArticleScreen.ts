import { ContentScreen } from '../../page/ContentScreen';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
import { ARTICLE, RELATED } from './newsData';
import { T } from '../../styles/tokens.gen';

const p = (s: string) => `<p>${escapeHtml(bindShortWords(s))}</p>`;
const img = (src: string, cls: string) =>
  `<img class="${cls}" src="${asset(encodeURI(src))}" alt="" loading="lazy"` +
  ` decoding="async" width="1200" height="800">`;

/**
 * «Новость» — one article (Figma `854:185`).
 *
 * THE ARTICLE HAS ITS OWN MEASURE, and it is not half the page. The frame runs
 * body copy from x=615 to x=1291 — wider than the right column, narrower than
 * full — with the date and the pull-quote in a left rail beside it. That is a
 * long-form decision, not a grid violation: `.col-r` holds the prose and the
 * rail is `.col-l`, but the prose is allowed to start before the centre line
 * because a reading measure is not a layout column. See `.article-body`.
 */
export class ArticleScreen extends ContentScreen {
  constructor(el: HTMLElement) {
    super(el, 'article-page');
  }

  protected stops() {
    return [{ top: 0, color: T.bgLightMain }];
  }

  protected build() {
    const head = document.createElement('header');
    head.className = 'page-head page-grid';
    head.innerHTML =
      `<div class="col-full">` +
      `<nav class="article-crumbs">` +
      `<a href="#news" data-to="news">Новости</a>` +
      `<span class="news-filters__dot" aria-hidden="true"></span>` +
      `<span>${escapeHtml(ARTICLE.category)}</span>` +
      `</nav>` +
      `<h1 class="article-title">${escapeHtml(bindShortWords(ARTICLE.title))}</h1>` +
      `</div>`;
    this.shell.add(head);

    const body = document.createElement('article');
    body.className = 'article page-grid';
    body.innerHTML =
      `<div class="col-l article-rail"><p class="article-date">${escapeHtml(ARTICLE.date)}</p></div>` +
      `<div class="col-r article-body">` +
      p(ARTICLE.lead) +
      `<h2>${escapeHtml(bindShortWords(ARTICLE.h2))}</h2>` +
      p(ARTICLE.body2) +
      `<h3>${escapeHtml(bindShortWords(ARTICLE.h3))}</h3>` +
      p(ARTICLE.body3) +
      `<div class="article-gallery">` +
      ARTICLE.gallery.map((g) => img(g, 'article-gallery__img')).join('') +
      `</div>` +
      p(ARTICLE.listLead) +
      `<ul class="article-list">` +
      ARTICLE.list.map((i) => `<li>${escapeHtml(bindShortWords(i))}</li>`).join('') +
      `</ul>` +
      `</div>`;
    this.shell.add(body);

    // The pull-quote sits in the LEFT rail in the frame, opposite the prose.
    const quote = document.createElement('figure');
    quote.className = 'article-quote page-grid';
    quote.innerHTML =
      `<div class="col-l">` +
      `<span class="article-quote__mark" aria-hidden="true">«»</span>` +
      `<blockquote>${escapeHtml(bindShortWords(ARTICLE.quote))}</blockquote>` +
      `<figcaption>${escapeHtml(ARTICLE.quoteBy)}</figcaption>` +
      `</div>` +
      `<div class="col-r article-body">` +
      p(ARTICLE.closing) +
      img(ARTICLE.closingImage, 'article-img') +
      `</div>`;
    this.shell.add(quote);

    this.shell.add(this.buildRelated());

    head.querySelector('[data-to="news"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('news');
    });
  }

  /** «Читайте также» — the frame's own three-column split of the 1142 measure */
  private buildRelated(): HTMLElement {
    const sec = document.createElement('section');
    sec.className = 'article-related page-grid';
    sec.innerHTML =
      `<div class="col-full">` +
      `<h2 class="article-related__title">Читайте также</h2>` +
      `<div class="article-related__grid">` +
      RELATED.map(
        (n) =>
          `<a class="article-related__card" href="#news/1">` +
          `<p class="news-card__meta"><span>${escapeHtml(n.date)}</span></p>` +
          `<p class="article-related__headline">${escapeHtml(bindShortWords(n.title))}</p>` +
          `</a>`,
      ).join('') +
      `</div>` +
      `<a class="article-all" href="#news">Все новости</a>` +
      `</div>`;
    sec.querySelector('.article-all')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('news');
    });
    return sec;
  }
}
