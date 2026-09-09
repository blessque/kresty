import { ContentScreen } from '../../page/ContentScreen';
import { ContactForm } from '../../page/contactForm';
import { buildPageHead } from '../../page/pageHead';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
import { T } from '../../styles/tokens.gen';

/**
 * «Аренда» (Figma `854:296`). Copy is the designer's own, except the lead —
 * see below.
 */

/**
 * TODO(copy): PLACEHOLDER. This exact string appears on both «Аренда» and
 * «Контакты» in the working file and is about «Павильон» and «Остров» — another
 * project's text. Transcribed rather than invented, so the designer can see
 * what needs replacing instead of finding words we made up.
 */
const LEAD =
  'Искусство и творчество — в Павильоне и на мастер-классах: исторические здания ' +
  'и деревянные постройки на Острове не предназначены для самовыражения.';

const STATS: [string, string][] = [
  ['Общая площадь', '2500 м²'],
  ['Минимальная площадь помещения', '13 м²'],
  ['Плановая ежедневная посещаемость', '9000 чел.'],
];

const SPACES = [
  'Западный крест',
  'Восточный крест',
  'Фудкорт',
  'Офисный центр',
  'Территория',
];

const BODY =
  'Дом надзирателей был возведён в конце XIX века по проекту архитектора Антония ' +
  'Томишко в составе знаменитого тюремного ансамбля на Арсенальной набережной. ' +
  'Реконструкция началась в 2023 году. За два года специалисты укрепили фундамент ' +
  'и несущие стены, восстановили исторические фасады с характерными элементами ' +
  'кирпичного стиля, заменили перекрытия и инженерные коммуникации.';

export class RentScreen extends ContentScreen {
  constructor(el: HTMLElement) {
    super(el, 'rent-page');
  }

  protected stops() {
    return [{ top: 0, color: T.bgLightMain }];
  }

  protected build() {
    this.shell.add(
      buildPageHead({ title: 'Аренда', lead: LEAD, onPartner: () => this.onNavigate('contacts') }),
    );

    // «Общая информация» — a heading in the left column and the numbers in the
    // right, which is the two-column metaphor doing exactly what it says.
    const info = document.createElement('section');
    info.className = 'page-block page-grid';
    info.innerHTML =
      `<div class="col-l"><h2 class="page-h2">Общая информация</h2></div>` +
      `<div class="col-r">` +
      `<dl class="rent-stats">` +
      STATS.map(
        ([k, v]) =>
          `<div class="rent-stat">` +
          `<dt>${escapeHtml(bindShortWords(k))}</dt>` +
          `<dd>${escapeHtml(v)}</dd>` +
          `</div>`,
      ).join('') +
      `</dl>` +
      `</div>`;
    this.shell.add(info);

    // The spaces list beside a square photograph. The image is a fixed square
    // anchored to the OUTER edge of its column, so the air before the centre
    // line is the composition's, not a gutter's — the News page's rule.
    const spaces = document.createElement('section');
    spaces.className = 'page-block page-grid';
    spaces.innerHTML =
      `<ul class="col-l rent-spaces">` +
      SPACES.map((s) => `<li>${escapeHtml(bindShortWords(s))}</li>`).join('') +
      `</ul>` +
      `<div class="col-r">` +
      `<img class="rent-photo" src="${asset('/resources/concept-plan.webp')}" alt=""` +
      ` loading="lazy" decoding="async" width="1200" height="1200">` +
      `</div>`;
    this.shell.add(spaces);

    const body = document.createElement('section');
    body.className = 'page-block page-grid';
    body.innerHTML =
      `<div class="col-l"></div>` +
      `<div class="col-r page-prose"><p>${escapeHtml(bindShortWords(BODY))}</p></div>`;
    this.shell.add(body);

    // the shared form, with «Аренда»'s own heading
    const form = new ContactForm(this.shell.scroller, {
      heading: 'Контакты',
      icon: false, // no page light on this page — an empty box would just be a hole
    });
    this.shell.add(form.el);
  }
}
