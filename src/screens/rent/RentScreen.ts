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
      `<div class="col-aside"><h2 class="page-h2">Общая информация</h2></div>` +
      `<div class="col-main">` +
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

    // The spaces list beside a square photograph. ROUND 25: the photo now FILLS
    // `.col-main` (five columns = 559.333 at the design frame, the square's own
    // width), so it needs no anchor class — the air between list and photo is the
    // skipped column 6, the same rule the News card follows.
    const spaces = document.createElement('section');
    spaces.className = 'page-block page-grid';
    spaces.innerHTML =
      `<ul class="col-aside rent-spaces">` +
      SPACES.map((s) => `<li>${escapeHtml(bindShortWords(s))}</li>`).join('') +
      `</ul>` +
      `<div class="col-main">` +
      `<img class="rent-photo" src="${asset('/resources/concept-plan.webp')}" alt=""` +
      ` loading="lazy" decoding="async" width="1200" height="1200">` +
      `</div>`;
    this.shell.add(spaces);

    const body = document.createElement('section');
    body.className = 'page-block page-grid';
    // ROUND 25: the empty `<div class="col-l">` spacer is gone. It existed only
    // to push the prose into the right half — the one place the grid was used to
    // PUSH content rather than to PLACE it. `.col-main` names the position, so
    // the placeholder has nothing left to do.
    body.innerHTML =
      `<div class="col-main page-prose"><p>${escapeHtml(bindShortWords(BODY))}</p></div>`;
    this.shell.add(body);

    // the shared form, with «Аренда»'s own heading
    const form = new ContactForm(this.shell.scroller, {
      heading: 'Контакты',
      icon: false, // no page light on this page — an empty box would just be a hole
      wideHead: false, // a short block, not a longread section — see ContactFormCopy
    });
    this.shell.add(form.el);
  }
}
