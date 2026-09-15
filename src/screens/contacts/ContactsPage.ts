import { ContentScreen } from '../../page/ContentScreen';
import { ContactForm } from '../../page/contactForm';
import { buildPageHead } from '../../page/pageHead';
import { StickyHeads } from '../../page/stickyHeads';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { T } from '../../styles/tokens.gen';

/**
 * The real «Контакты» page (Figma `854:126`).
 *
 * Round 24 replaced the icon showcase that used to sit on this nav link — that
 * is still reachable at `#icons`, with its `?admin` panel and `?icon=N` jump,
 * because the light-on-arbitrary-SVG work it proves is still wanted for tuning.
 * It is simply no longer what a client clicking «Контакты» is shown.
 */

/** TODO(copy): PLACEHOLDER — see RentScreen; the same «Павильон» string. */
const LEAD =
  'Искусство и творчество — в Павильоне и на мастер-классах: исторические здания ' +
  'и деревянные постройки на Острове не предназначены для самовыражения.';

/** label → value. A value beginning `+7` or containing `@` becomes a link. */
const GENERAL: [string, string][] = [
  ['Вход для посетителей:', 'Ежедневно с 9:00 до 23:00'],
  ['Справочная', '+7 812 654-40-11'],
  ['Групповое посещение', '+7 812 654-40-11'],
  ['Электронная почта', 'kresty@spb.ru'],
  ['Адрес', 'Санкт-Петербург, Арсенальная набережная, 7'],
];

const PRESS_LEAD =
  'По вопросам размещения рекламы, а также для обращений представителей СМИ:';

/**
 * The building, on the real map (round 27) — Арсенальная наб., 7.
 *
 * THE IFRAME WIDGET, NOT THE JS API. The widget needs no API key, no `<script>`
 * tag and no npm dependency, which keeps a hard rule intact: this prototype adds
 * no runtime dependencies. It is still the repo's first third-party embed, so it
 * is built here in one place where that is visible.
 *
 * `scroll=false` matters more than it looks: the page scrolls inside
 * `.page-scroll`, and an iframe that swallows the wheel to zoom is the classic
 * scroll trap — the reader's page stops moving over a third of the frame.
 *
 * The URL must NOT go through `asset()`. That prefixes `import.meta.env.BASE_URL`
 * for the GitHub Pages subpath and would mangle an absolute URL; it is for
 * things in `public/`.
 */
const MAP_CENTRE = '30.370700,59.952700';
const MAP_URL =
  'https://yandex.ru/map-widget/v1/?' +
  new URLSearchParams({
    ll: MAP_CENTRE,
    z: '16',
    mode: 'search',
    text: 'Кресты, Арсенальная набережная, 7, Санкт-Петербург',
    pt: `${MAP_CENTRE},pm2rdm`,
    scroll: 'false',
  }).toString();

function pairs(rows: [string, string][]): string {
  return rows
    .map(([k, v]) => {
      const href = v.startsWith('+7')
        ? `tel:${v.replace(/[^+\d]/g, '')}`
        : v.includes('@')
          ? `mailto:${v}`
          : null;
      const value = href
        ? `<a class="cf-phone" href="${href}">${escapeHtml(v)}</a>`
        : escapeHtml(bindShortWords(v));
      return (
        `<div class="contact-pair">` +
        `<dt>${escapeHtml(bindShortWords(k))}</dt>` +
        `<dd>${value}</dd>` +
        `</div>`
      );
    })
    .join('');
}

export class ContactsPage extends ContentScreen {
  private heads = new StickyHeads(this.shell.scroller);

  constructor(el: HTMLElement) {
    super(el, 'contacts-page');
    this.shell.onMeasure = (viewH) => this.heads.measure(viewH);
  }

  protected stops() {
    return [{ top: 0, color: T.bgLightMain }];
  }

  protected build() {
    this.shell.add(
      buildPageHead({
        title: 'Контакты',
        lead: LEAD,
        // the button on this page has nowhere else to go — it scrolls to the form
        onPartner: () => this.el.querySelector('.contact-form')?.scrollIntoView({ behavior: 'smooth' }),
      }),
    );

    // `data-sticky-head` + `.sticky-head` are the pair StickyHeads measures and
    // page.css styles: the heading holds the centre of the frame while the
    // column beside it scrolls. All three blocks on this page carry it, which is
    // the whole point — «Аренда помещений» already stuck (the form's `.sec-col`
    // picks up concept.css's rule globally) and these two did not.
    const general = document.createElement('section');
    general.className = 'page-block page-grid';
    general.dataset.stickyHead = '';
    general.innerHTML =
      `<div class="col-aside sticky-head gp-text"><h2 class="page-h2">Общая информация</h2></div>` +
      `<dl class="col-main contact-pairs gp-text">${pairs(GENERAL)}</dl>`;
    this.shell.add(general);

    // full width, inside the margins — `.col-full` is columns 2–11, and that IS
    // the frame's 1142 measure (10 × 92.667 + 9 × 24 = 1142.667). Ten columns
    // is what the map was asked for, so the span needed no new class.
    const map = document.createElement('section');
    map.className = 'page-block page-grid';
    map.innerHTML =
      `<div class="col-full">` +
      `<iframe class="contacts-map" src="${escapeHtml(MAP_URL)}"` +
      ` title="Кресты на карте Санкт-Петербурга" loading="lazy"` +
      ` allowfullscreen></iframe>` +
      `</div>`;
    this.shell.add(map);

    // «Аренда помещений» — the shared form with this page's heading
    const form = new ContactForm(this.shell.scroller, {
      heading: 'Аренда помещений',
      icon: false,
    });
    form.el.dataset.stickyHead = '';
    this.shell.add(form.el);

    const press = document.createElement('section');
    press.className = 'page-block page-grid';
    press.dataset.stickyHead = '';
    press.innerHTML =
      `<div class="col-aside sticky-head gp-text"><h2 class="page-h2">Пресс-служба</h2></div>` +
      // `.contacts-body` makes this a FLOW column like `.sec-body` and
      // `.article-body`. Without it the prose and the list both declare
      // `margin: 0` and no rule in page.css reaches them, so they rendered
      // welded together with no gap at all.
      `<div class="col-main contacts-body gp-text">` +
      `<p class="page-prose">${escapeHtml(bindShortWords(PRESS_LEAD))}</p>` +
      `<dl class="contact-pairs">${pairs([['Электронная почта', 'kresty@spb.ru']])}</dl>` +
      `</div>`;
    this.shell.add(press);

    // Chromius is a webfont, and a column measured against the fallback gives a
    // pin that is wrong by whatever the two faces disagree about.
    void document.fonts.ready.then(() => this.shell.measure());
  }
}
