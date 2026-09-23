import { ContentScreen } from '../../page/ContentScreen';
import { ContactForm } from '../../page/contactForm';
import { buildPageHead } from '../../page/pageHead';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
import { T } from '../../styles/tokens.gen';

/**
 * «Аренда» (Figma `854:296`).
 *
 * ROUND 28 brought this page up to the standard the other three got in round 27
 * — it was the one content page commit `182feab` never touched, so it had none
 * of the sticky heading columns, no `fonts.ready` re-measure, no flow column and
 * a 3:2 render force-cropped into a square.
 *
 * TODO(copy): the lead and every space description below are WRITTEN HERE, not
 * supplied. The frame's own lead was the «Павильон»/«Остров» string from another
 * project (it still stands on «Контакты»); these replace it in the same register.
 * The figures are invented but CLOSE against the designer's own `STATS`: the four
 * enclosed spaces sum to exactly 2500 м² and the smallest unit quoted is 13 м².
 * «Территория» is open ground and is quoted separately. The designer should still
 * read the words.
 */
const LEAD =
  'Сдаём помещения в исторических корпусах и на территории комплекса — под ' +
  'магазины, мастерские, кафе, офисы и культурные проекты. Свободная планировка, ' +
  'отдельные входы и выход к собственной набережной.';

/** the designer's own figures, unchanged */
const STATS: [string, string][] = [
  ['Общая площадь', '2500 м²'],
  ['Минимальная площадь помещения', '13 м²'],
  ['Плановая ежедневная посещаемость', '9000 чел.'],
];

interface RentSpace {
  name: string;
  /** native 3:2 (2400×1600), so `aspect-ratio` crops nothing away */
  photo: string;
  alt: string;
  body: string;
  stats: [string, string][];
}

/**
 * The five spaces. Every photograph is a native 3:2 render — the same shape the
 * News card settled on, and well inside the 2:1 letterbox ceiling
 * `articleData.assertArticle()` enforces next door. `concept-plan.webp`, which
 * used to be cropped square here, goes back to being the «Аренда» nav-hover
 * image only (`hoverImages` in MainScreen.ts), which is all it ever was.
 */
const SPACES: RentSpace[] = [
  {
    name: 'Западный крест',
    photo: '/resources/atrium-floor.webp',
    alt: 'Галереи вокруг центрального атриума Западного креста',
    body:
      'Четыре яруса галерей вокруг центрального атриума. Бывшие камеры становятся ' +
      'небольшими торговыми помещениями и мастерскими с окнами во двор — формат ' +
      'для локальных марок, ремесленников и шоурумов.',
    stats: [
      ['Площадь', '900 м²'],
      ['Помещения', 'от 13 м²'],
    ],
  },
  {
    name: 'Восточный крест',
    photo: '/resources/atrium-roof.webp',
    alt: 'Верхний ярус и световой фонарь Восточного креста',
    body:
      'Второй крест отдан культуре и сервису: выставочные залы на нижних ярусах, ' +
      'студии и небольшие офисы выше. Историческая кладка и своды сохранены, ' +
      'инженерия заменена полностью.',
    stats: [
      ['Площадь', '780 м²'],
      ['Высота потолков', '3,6 м'],
    ],
  },
  {
    name: 'Фудкорт',
    photo: '/resources/restaurant-embankment.webp',
    alt: 'Зал фудкорта с выходом на набережную',
    body:
      'Общий зал с выходом на набережную и десятью корнерами. Вытяжка, ' +
      'водоподготовка и силовая электрика подведены к каждому месту — кухню можно ' +
      'запускать без перепланировки.',
    stats: [
      ['Площадь', '480 м²'],
      ['Посадочных мест', '250'],
    ],
  },
  {
    name: 'Офисный центр',
    photo: '/resources/forum.webp',
    alt: 'Общее пространство офисного центра',
    body:
      'Административный корпус после реставрации: свободная планировка, ' +
      'панорамные окна, отдельный вход и лифт. Переговорные и конференц-зал — ' +
      'в общем пользовании арендаторов.',
    stats: [
      ['Площадь', '340 м²'],
      ['Блоки', 'от 40 м²'],
    ],
  },
  {
    name: 'Территория',
    photo: '/resources/main-entrance.webp',
    alt: 'Главный вход и внутренний двор комплекса',
    body:
      'Внутренние дворы, набережная и прогулочные маршруты открыты для ярмарок, ' +
      'сезонных веранд, фестивалей и съёмок. Точки подключения к воде и ' +
      'электричеству выведены по всему периметру.',
    stats: [
      ['Открытая площадь', '8000 м²'],
      ['Сезон', 'май — октябрь'],
    ],
  },
];

const BODY =
  'Дом надзирателей был возведён в конце XIX века по проекту архитектора Антония ' +
  'Томишко в составе знаменитого тюремного ансамбля на Арсенальной набережной. ' +
  'Реконструкция началась в 2023 году. За два года специалисты укрепили фундамент ' +
  'и несущие стены, восстановили исторические фасады с характерными элементами ' +
  'кирпичного стиля, заменили перекрытия и инженерные коммуникации. Помещения ' +
  'сдаются с готовыми мощностями и подключениями — отделку арендатор ведёт под ' +
  'свой формат.';

const CTA = 'Связаться';

/** the designer's Factoid pairs — «2500 м²» at 72/110%, one per line */
function stats(rows: [string, string][]): string {
  return (
    `<dl class="rent-stats">` +
    rows
      .map(
        ([k, v]) =>
          `<div class="rent-stat">` +
          `<dt>${escapeHtml(bindShortWords(k))}</dt>` +
          `<dd>${escapeHtml(v)}</dd>` +
          `</div>`,
      )
      .join('') +
    `</dl>`
  );
}

/**
 * A space's two figures, side by side and SMALL.
 *
 * Deliberately not `stats()`: the Factoid is 72px and the panel is five columns
 * (559 at the design frame), so two «8000 м²» beside each other would not fit and
 * one per line would shout louder than the heading above them. The Factoid is the
 * page's one headline number, and it belongs to «Общая информация».
 */
function facts(rows: [string, string][]): string {
  return (
    `<dl class="rent-facts">` +
    rows
      .map(
        ([k, v]) =>
          `<div class="rent-fact">` +
          `<dt>${escapeHtml(bindShortWords(k))}</dt>` +
          `<dd>${escapeHtml(bindShortWords(v))}</dd>` +
          `</div>`,
      )
      .join('') +
    `</dl>`
  );
}

export class RentScreen extends ContentScreen {
  /** «Западный крест» on arrival */
  private active = 0;
  private tabs: HTMLButtonElement[] = [];
  private panels: HTMLElement[] = [];
  private warmed = new Set<number>();

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
      `<div class="col-main page-flow">${stats(STATS)}</div>`;
    this.shell.add(info);

    this.shell.add(this.buildSpaces());

    const body = document.createElement('section');
    body.className = 'page-block page-grid';
    // ROUND 28: this prose used to sit in `.col-main` with no heading at all —
    // the one block on the page that named nothing. It is about the building, so
    // the heading says so.
    body.innerHTML =
      `<div class="col-aside"><h2 class="page-h2">О комплексе</h2></div>` +
      `<div class="col-main page-flow">` +
      `<p class="page-prose">${escapeHtml(bindShortWords(BODY))}</p>` +
      `</div>`;
    this.shell.add(body);

    // the shared form, with «Аренда»'s own heading. Round 28 marked this
    // `data-sticky-head` so its `.sec-col` pinned by MEASUREMENT rather than at
    // the flat `14vh` fallback; round 29 took the pinning off every heading on
    // the site, so what is left is the alignment — one rank, one behaviour,
    // which was the point of round 28's change in the first place.
    const form = new ContactForm(this.shell.scroller, {
      heading: 'Контакты',
      icon: false, // no page light on this page — an empty box would just be a hole
      wideHead: false, // a short block, not a longread section — see ContactFormCopy
    });
    this.shell.add(form.el);

    // Round 28 re-measured on `document.fonts.ready` here, because a heading
    // column measured against the fallback face gave a pin wrong by whatever
    // Chromius and the fallback disagree about. There is no pin now, and nothing
    // `PageShell.measure()` computes depends on the font: its stops come from the
    // viewport height, and the handoff reads its own `offsetTop` live on every
    // frame rather than from a cache.
  }

  /**
   * The five spaces as a real vertical tablist: the names in the sticky heading
   * column, the chosen space in `.col-main`.
   *
   * They were a `<ul>` beside one fixed photograph. The frame draws them as a
   * segmented control and the client reads them as one, so they are one — the
   * ARIA discipline is `ControlPanel`'s (the repo's only other control that sets
   * state attributes), the state handling is `NewsScreen`'s filter row.
   *
   * ALL FIVE PANELS LIVE IN THE DOM and four are `hidden`. Swapping one `<img>`
   * `src` would flash the empty box on every click; this way the only cost is the
   * first fetch, which `warm()` pays on hover.
   */
  private buildSpaces(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'page-block page-grid';

    const aside = document.createElement('div');
    aside.className = 'col-aside';
    aside.innerHTML = `<h2 class="page-h2">Помещения</h2>`;

    const list = document.createElement('div');
    list.className = 'rent-tabs';
    list.role = 'tablist';
    list.ariaOrientation = 'vertical';

    const main = document.createElement('div');
    main.className = 'col-main';

    SPACES.forEach((s, i) => {
      const on = i === this.active;

      // The label is a SPAN inside a full-width block button, and that is what
      // lets the underline hug the word while the column's own
      // `text-align: var(--sec-col-align, center)` still decides where the word
      // sits. An inline-block button would have to be centred by a second rule
      // that could then disagree with the heading above it.
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'rent-tab';
      tab.id = `rent-tab-${i}`;
      tab.role = 'tab';
      tab.setAttribute('aria-controls', `rent-panel-${i}`);
      tab.innerHTML = `<span>${escapeHtml(bindShortWords(s.name))}</span>`;
      tab.addEventListener('click', () => this.select(i));
      tab.addEventListener('pointerenter', () => this.warm(i));
      tab.addEventListener('keydown', (e) => this.onTabKey(e, i));
      this.tabs.push(tab);
      list.appendChild(tab);

      const panel = document.createElement('div');
      panel.className = 'rent-space page-flow';
      panel.id = `rent-panel-${i}`;
      panel.role = 'tabpanel';
      panel.setAttribute('aria-labelledby', tab.id);
      panel.innerHTML =
        `<img class="rent-photo" src="${asset(encodeURI(s.photo))}"` +
        ` alt="${escapeHtml(s.alt)}" decoding="async"${on ? '' : ' loading="lazy"'}` +
        ` width="2400" height="1600">` +
        `<p class="page-prose">${escapeHtml(bindShortWords(s.body))}</p>` +
        facts(s.stats) +
        `<button type="button" class="btn btn--onlight rent-cta">${CTA}</button>`;
      panel.querySelector('.rent-cta')?.addEventListener('click', () => this.scrollToForm());
      this.panels.push(panel);
      main.appendChild(panel);
    });

    aside.appendChild(list);
    section.appendChild(aside);
    section.appendChild(main);
    this.apply();
    return section;
  }

  /**
   * `shell.measure()` IS THE POINT, not housekeeping. The panels are different
   * heights, so a switch moves the whole page below this block and the seam has
   * to be re-evaluated against the new geometry. `NewsScreen.applyFilter` ends
   * the same way for the same reason. (Round 28 also re-pinned the heading
   * column from here through `onMeasure`; round 29 removed both.)
   */
  private select(i: number) {
    if (i === this.active) return;
    this.active = i;
    this.apply();
    this.shell.measure();
  }

  private apply() {
    this.tabs.forEach((t, i) => {
      const on = i === this.active;
      t.classList.toggle('on', on);
      t.ariaSelected = String(on);
      // roving tabindex: the control is one tab stop, the arrows move inside it
      t.tabIndex = on ? 0 : -1;
    });
    this.panels.forEach((p, i) => p.toggleAttribute('hidden', i !== this.active));
  }

  /** what `role="tablist"` promises the keyboard */
  private onTabKey(e: KeyboardEvent, i: number) {
    const last = this.tabs.length - 1;
    let to: number;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        to = i === last ? 0 : i + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        to = i === 0 ? last : i - 1;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.select(to);
    this.tabs[to].focus();
  }

  /**
   * A hidden panel is `display: none`, so its `loading="lazy"` image never
   * fetches until it is first shown — and the reader would watch an empty box
   * fill in. One hover is enough warning to have it decoded by the click.
   */
  private warm(i: number) {
    if (this.warmed.has(i)) return;
    this.warmed.add(i);
    new Image().src = asset(encodeURI(SPACES[i].photo));
  }

  private scrollToForm() {
    this.el.querySelector('.contact-form')?.scrollIntoView({ behavior: 'smooth' });
  }
}
