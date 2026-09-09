import { ContentScreen } from '../../page/ContentScreen';
import { ContactForm } from '../../page/contactForm';
import { buildPageHead } from '../../page/pageHead';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
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

    const general = document.createElement('section');
    general.className = 'page-block page-grid';
    general.innerHTML =
      `<div class="col-l"><h2 class="page-h2">Общая информация</h2></div>` +
      `<dl class="col-r contact-pairs">${pairs(GENERAL)}</dl>`;
    this.shell.add(general);

    // full width, inside the margins — both columns, which is what `.col-full`
    // is for. The frame draws this at the page's full 1142 measure.
    const photo = document.createElement('section');
    photo.className = 'page-block page-grid';
    photo.innerHTML =
      `<div class="col-full">` +
      `<img class="contacts-photo" src="${asset('/resources/hotel.webp')}" alt=""` +
      ` loading="lazy" decoding="async" width="1200" height="600">` +
      `</div>`;
    this.shell.add(photo);

    // «Аренда помещений» — the shared form with this page's heading
    const form = new ContactForm(this.shell.scroller, {
      heading: 'Аренда помещений',
      icon: false,
    });
    this.shell.add(form.el);

    const press = document.createElement('section');
    press.className = 'page-block page-grid';
    press.innerHTML =
      `<div class="col-l"><h2 class="page-h2">Пресс-служба</h2></div>` +
      `<div class="col-r">` +
      `<p class="page-prose">${escapeHtml(bindShortWords(PRESS_LEAD))}</p>` +
      `<dl class="contact-pairs">${pairs([['Электронная почта', 'kresty@spb.ru']])}</dl>` +
      `</div>`;
    this.shell.add(press);
  }
}
