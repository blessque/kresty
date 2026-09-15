import { ContentScreen } from '../../page/ContentScreen';
import { MediaSlider } from '../../page/mediaSlider';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { buildPageHead } from '../../page/pageHead';
import { RELATED, type Category } from './newsData';
import { ARTICLE, assertArticle, type ArticleBlock } from './articleData';
import { T } from '../../styles/tokens.gen';
import quoteSvg from '../../assets/icon-quote.svg?raw';

/**
 * «Новость» — one article (Figma `854:185`).
 *
 * ROUND 27: REBUILT ON THE LONGREAD'S STRUCTURE. The page had none of it — a
 * fixed fifteen-field schema rendered by one template, a static date rail, a
 * two-up CSS grid where the longread has a slider, and images cropped to 16/9
 * regardless of what the photograph was. It read as a different site.
 *
 * The body is a BLOCK LIST (articleData.ts) and pictures are the shared
 * `MediaSlider`.
 *
 * ROUND 27.1 TOOK THE STICKY RAIL BACK OUT. Round 27 gave the date and category
 * a pinned column because the longread has one — but the longread's rail tracks
 * WHICH SECTION owns the frame, a question that changes as you scroll and is
 * worth following. A single article never asks it, so the rail was borrowed
 * motion with nothing behind it. The meta is part of the masthead now, under the
 * H1, exactly as it reads on the news card the reader clicked to get here.
 *
 * THE MEASURE MOVED TO `.col-main`, columns 7–11. Round 25 had put it at
 * `6 / span 6` off the frame's x=615→1291, and that was right for the frame it
 * measured — but the client's note is that this page should follow the longread,
 * and the longread's body is `.col-main`. The move also fixes the slider by
 * construction: `.ms-frame` is deliberately one column + one gutter wider than
 * its block so the next photograph peeks in from the right, and that overhang
 * only lands in empty space because column 12 is skipped. At `6 / span 6` the
 * body already ended at column 11's right edge and the peek would have spilled
 * out of the content area.
 */
export class ArticleScreen extends ContentScreen {
  /**
   * The breadcrumb's category was followed. Wired in `main.ts` — the composition
   * root — so this screen never learns that a news LIST exists, the same reason
   * `ScrollIntent` is wired there rather than inside `MainScreen`.
   */
  onCategory: (c: Category) => void = () => {};

  private sliders: MediaSlider[] = [];

  constructor(el: HTMLElement) {
    super(el, 'article-page');
  }

  protected stops() {
    return [{ top: 0, color: T.bgLightMain }];
  }

  protected build() {
    assertArticle(ARTICLE);

    // The shared masthead. Breadcrumbs go in the `eyebrow` slot — this page used
    // to hand-build a head that differed from every other page's in four ways.
    const head = buildPageHead({
      title: ARTICLE.title,
      // ROUND 27.3: THE CATEGORY IS A LINK HERE, and only here. It is a
      // breadcrumb — the whole point of the trail is that each step goes back to
      // the wider thing it belongs to, so a category that is not clickable is a
      // breadcrumb pretending to be a label. Blue follows from that, it is not
      // the reason for it.
      eyebrow:
        `<nav class="article-crumbs">` +
        `<a href="#news" data-to="news">Новости</a>` +
        `<span class="news-filters__dot" aria-hidden="true"></span>` +
        `<a href="#news" data-to="category">${escapeHtml(ARTICLE.category)}</a>` +
        `</nav>`,
      // ROUND 27.1: date · category belong to the H1 block. Round 27 put them in
      // a sticky rail copied from the longread, but the longread's rail tracks
      // WHICH SECTION you are in — it earns its stickiness by answering a
      // question that changes as you scroll. A single article never asks it, so
      // the rail was motion for its own sake, and the meta is simply part of the
      // masthead the way it is on the news card it came from.
      // THE DATE ALONE. Round 27.1 repeated the category here, two lines under
      // the breadcrumb that already names it — the same word twice in one
      // masthead, the second time saying nothing the first did not.
      meta: `<p class="article-meta"><span class="news-card__date">${escapeHtml(ARTICLE.date)}</span></p>`,
    });
    this.shell.add(head);

    const article = document.createElement('article');
    article.className = 'article page-grid';
    article.innerHTML = `<div class="col-main article-body"></div>`;
    this.renderBody(article.querySelector('.article-body') as HTMLElement);
    this.shell.add(article);

    this.shell.add(this.buildRelated());

    head.querySelector('[data-to="news"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('news');
    });
    head.querySelector('[data-to="category"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      // filter first, then navigate: the list reads `filter` while it builds, so
      // a first-ever visit comes up already filtered rather than flashing all 13
      this.onCategory(ARTICLE.category);
      this.onNavigate('news');
    });

    void document.fonts.ready.then(() => this.shell.measure());
  }

  /**
   * Walk the blocks in order. Every gap between them is owned by the shared flow
   * in `page.css` — nothing here sets a margin, which is what keeps this column
   * and the longread's `.sec-body` from drifting apart.
   */
  private renderBody(body: HTMLElement) {
    for (const b of ARTICLE.body) {
      body.appendChild(this.renderBlock(b));
    }
  }

  private renderBlock(b: ArticleBlock): HTMLElement {
    switch (b.kind) {
      case 'p': {
        const el = document.createElement('p');
        el.textContent = bindShortWords(b.text);
        return el;
      }
      case 'h2':
      case 'h3': {
        const el = document.createElement(b.kind);
        el.textContent = bindShortWords(b.text);
        return el;
      }
      case 'list': {
        const el = document.createElement('div');
        el.className = 'article-list-block';
        el.innerHTML =
          (b.lead ? `<p>${escapeHtml(bindShortWords(b.lead))}</p>` : '') +
          `<ul class="article-list">` +
          b.items.map((i) => `<li>${escapeHtml(bindShortWords(i))}</li>`).join('') +
          `</ul>`;
        return el;
      }
      case 'quote': {
        // THE MARK IS THE DESIGNER'S ICON, not the `«»` glyph pair this page used
        // to set at H1 size. Inlined `?raw` rather than masked because it is one
        // instance at one colour — the star is masked because it is two.
        const el = document.createElement('figure');
        el.className = 'article-quote';
        el.innerHTML =
          `<span class="article-quote__mark" aria-hidden="true">${quoteSvg}</span>` +
          `<blockquote>${escapeHtml(bindShortWords(b.text))}</blockquote>` +
          `<figcaption>${escapeHtml(b.by)}</figcaption>`;
        return el;
      }
      case 'media': {
        const slider = new MediaSlider(b.items, {
          // a slide of a different aspect changes the block's height, and the
          // colour stops and the handoff's top are all measured from the DOM
          onResize: () => this.shell.measure(),
        });
        this.sliders.push(slider);
        return slider.el;
      }
    }
  }

  /** «Читайте также» — the frame's own three-column split of the 1142 measure */
  private buildRelated(): HTMLElement {
    const sec = document.createElement('section');
    sec.className = 'article-related page-grid';
    sec.innerHTML =
      `<div class="col-full gp-text">` +
      `<h2 class="article-related__title">Читайте также</h2>` +
      `<div class="article-related__grid">` +
      RELATED.map(
        (n) =>
          `<a class="article-related__card" href="#news/1">` +
          `<p class="news-card__meta">` +
          `<span class="news-card__date">${escapeHtml(n.date)}</span>` +
          `</p>` +
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
