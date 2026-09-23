import { ContentScreen } from '../../page/ContentScreen';
import { ContactForm } from '../../page/contactForm';
import { buildPageHead } from '../../page/pageHead';
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

/** ROUND 30: the client's copy (2026-09-23), replacing the «Павильон» placeholder */
const LEAD = '«Кресты» открываются для новых идей, проектов и деловых возможностей.';

/** label → value. A value beginning `+7` or containing `@` becomes a link. */
/**
 * ROUND 30: the client's three contacts replace the visitor-desk rows
 * («Справочная», «Групповое посещение», the placeholder `kresty@spb.ru`); the
 * hours and the address were not in their note and stay. The rent phone is
 * THEIR placeholder, shipped as sent — replace it when the real number arrives.
 */
const GENERAL: [string, string][] = [
  ['Вход для посетителей:', 'Ежедневно с 9:00 до 23:00'],
  ['Аренда', '+7 (000) 000-00-00'],
  ['Сотрудничество', 'hello@kresty-spb.ru'],
  ['Для СМИ', 'K.Shcherbakova@kvsspb.ru'],
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

/** the same place as a link, for the placeholder and for when the widget never arrives */
const MAP_LINK =
  'https://yandex.ru/maps/?' +
  new URLSearchParams({ ll: MAP_CENTRE, z: '16', text: 'Кресты, Арсенальная набережная, 7' }).toString();

/**
 * How long a map that has STARTED loading gets before the placeholder says so
 * and offers the link (round 31.5). Counted from the moment the block nears the
 * viewport, not from page load: the iframe is `loading="lazy"`, so before that
 * the browser has not even asked for it.
 */
const MAP_TIMEOUT_MS = 10000;

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
  constructor(el: HTMLElement) {
    super(el, 'contacts-page');
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

    // ROUND 29: NOTHING ON THIS PAGE PINS. Round 28's `data-sticky-head` /
    // `.sticky-head` pair held each heading at the centre of the frame while its
    // column scrolled past; the client asked for headings that simply sit at the
    // top of their section. `StickyHeads` is deleted, not disabled — it had one
    // consumer and this was it.
    const general = document.createElement('section');
    general.className = 'page-block page-grid';
    general.innerHTML =
      `<div class="col-aside"><h2 class="page-h2">Общая информация</h2></div>` +
      `<dl class="col-main contact-pairs">${pairs(GENERAL)}</dl>`;
    this.shell.add(general);

    // full width, inside the margins — `.col-full` is columns 2–11, and that IS
    // the frame's 1142 measure (10 × 92.667 + 9 × 24 = 1142.667). Ten columns
    // is what the map was asked for, so the span needed no new class.
    //
    // ROUND 31.5: A PLACEHOLDER UNDER THE MAP. A third-party widget is the one
    // thing on the page that can simply not arrive — offline, blocked by a
    // tracker filter (it pulls ad scripts), or slow — and an empty 2:1 hole in
    // the page reads as broken. The placeholder is the same shimmer the photos
    // use, carries the address and a link, and stays under the iframe, which
    // fades in over it on `load`. If nothing has loaded MAP_TIMEOUT_MS after the
    // block came near the viewport, it says so and the link is the way out.
    const map = document.createElement('section');
    map.className = 'page-block page-grid';
    map.innerHTML =
      `<div class="col-full">` +
      `<div class="contacts-map" data-state="loading">` +
      `<div class="contacts-map__ph shimmer">` +
      `<p class="contacts-map__addr">${escapeHtml(bindShortWords('Санкт-Петербург, Арсенальная набережная, 7'))}</p>` +
      `<p class="contacts-map__msg" aria-live="polite">Карта загружается…</p>` +
      `<a class="contacts-map__link" href="${escapeHtml(MAP_LINK)}" target="_blank" rel="noopener">` +
      `Открыть в Яндекс Картах</a>` +
      `</div>` +
      `<iframe class="contacts-map__frame" src="${escapeHtml(MAP_URL)}"` +
      ` title="Кресты на карте Санкт-Петербурга" loading="lazy"` +
      ` allowfullscreen></iframe>` +
      `</div>` +
      `</div>`;
    this.shell.add(map);
    this.watchMap(map.querySelector('.contacts-map') as HTMLElement);

    // «Аренда помещений» — the shared form with this page's heading
    const form = new ContactForm(this.shell.scroller, {
      heading: 'Аренда помещений',
      icon: false,
      wideHead: false,
    });
    this.shell.add(form.el);

    const press = document.createElement('section');
    press.className = 'page-block page-grid';
    press.innerHTML =
      `<div class="col-aside"><h2 class="page-h2">Пресс-служба</h2></div>` +
      // `.page-flow` makes this a FLOW column like `.sec-body` and
      // `.article-body`. Without it the prose and the list both declare
      // `margin: 0` and no rule in page.css reaches them, so they rendered
      // welded together with no gap at all. (Named `.contacts-body` until round
      // 28, when «Аренда» needed the same thing three times over.)
      `<div class="col-main page-flow">` +
      `<p class="page-prose">${escapeHtml(bindShortWords(PRESS_LEAD))}</p>` +
      `<dl class="contact-pairs">${pairs([['Электронная почта', 'K.Shcherbakova@kvsspb.ru']])}</dl>` +
      `</div>`;
    this.shell.add(press);

    // Round 28 re-measured on `document.fonts.ready` here, because a heading
    // column measured against the fallback face gave a sticky pin wrong by
    // whatever Chromius and the fallback disagree about. There is no pin now,
    // and `PageShell.measure()` derives its colour stops from the viewport
    // height alone — nothing it computes depends on the font. Dropped with the
    // pin rather than left as a call that looks load-bearing and is not.
  }

  /**
   * loading → ready | failed.
   *
   * THE IFRAME'S `load` IS NOT PROOF THE MAP ARRIVED. Measured with Yandex
   * blocked: `load` still fires, because the browser loads its own error page
   * into the frame — and that page is as cross-origin as the real one, so
   * nothing inside can be inspected to tell them apart. So when the block nears
   * the viewport a `no-cors` probe of the same URL goes out: its response is
   * opaque, but a blocked or offline request REJECTS, which is the one signal
   * the frame cannot give. Ready = frame loaded AND probe answered; failed =
   * probe rejected, or nothing within MAP_TIMEOUT_MS.
   */
  private watchMap(box: HTMLElement) {
    const frame = box.querySelector('iframe') as HTMLIFrameElement;
    const ph = box.querySelector('.contacts-map__ph') as HTMLElement;
    const msg = box.querySelector('.contacts-map__msg') as HTMLElement;
    let loaded = false;
    let reachable: boolean | null = null;
    let timer = 0;
    const settle = () => {
      if (box.dataset.state !== 'loading') return;
      if (reachable === false) {
        clearTimeout(timer);
        box.dataset.state = 'failed';
        ph.classList.add('is-failed');
        msg.textContent = 'Карта не загрузилась';
      } else if (loaded && reachable) {
        clearTimeout(timer);
        box.dataset.state = 'ready';
        ph.classList.add('is-loaded'); // stops the sheen under the map
      }
    };
    frame.addEventListener('load', () => {
      loaded = true;
      settle();
    });
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        fetch(MAP_URL, { mode: 'no-cors' }).then(
          () => (reachable = true),
          () => (reachable = false),
        ).finally(settle);
        timer = window.setTimeout(() => {
          reachable = reachable ?? false; // nothing answered in time
          if (!loaded) reachable = false;
          settle();
        }, MAP_TIMEOUT_MS);
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(box);
  }
}
