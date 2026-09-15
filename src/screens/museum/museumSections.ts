import { T } from '../../styles/tokens.gen';
import { DAWN_MID } from '../../page/seamColors';
import type { MediaItem } from '../../page/mediaSlider';

/**
 * The four eras of «Музей», Figma frame `1049:1021`.
 *
 * ROUND 28. The shape is `screens/concept/pageSections.ts`'s on purpose — one
 * table, one exported array, so the designer's pass is a text edit. What is
 * different is the four fields the page descends through and the two extra
 * block kinds the frames actually use.
 *
 * ── the page is a descent, and the descent is the argument ──────────────────
 * Near-black → navy → slate → white, one field per era. The copy is about
 * freedom being taken away and given back, and the field is the only part of
 * the page that says so without words. That is also why the last section is
 * WHITE rather than a fifth dark blue: the light has to stop working, because
 * the place stopped needing it.
 *
 * ── what the white field costs ──────────────────────────────────────────────
 * «О Крестах» notes that the palette and the light are coupled — the canvas
 * composites `mix-blend-mode: screen`, i.e. `1 − (1−a)(1−b)`, which can only
 * LIGHTEN, so a bright field leaves the god-rays nothing to lighten into. That
 * is a bug there and the POINT here, but it means four things have to move
 * together across the last boundary — the canvas out, the vector cross in, the
 * ink inverted, the grain gone. `MuseumScreen.whiteProgress()` drives all four
 * off the one blend factor `PageBackground` painted with.
 */

/** One line in the star-bulleted list — `.mus-list` renders the star itself. */
export type SectionBlock =
  | { kind: 'p'; text: string }
  /** a heading INSIDE the body column; the era name lives in the aside instead */
  | { kind: 'h3'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'media'; items: MediaItem[] };

export interface MuseumSection {
  id: string;
  /** the era, in the sticky left column, sitting inside the light cross */
  era: string;
  /** the years under it */
  years: string;
  /** the one-line «Свобода …» epigraph that opens the body column */
  kicker: string;
  body: SectionBlock[];
  /** page background while this section owns the frame */
  bg: string;
}

const p = (text: string): SectionBlock => ({ kind: 'p', text });
const h3 = (text: string): SectionBlock => ({ kind: 'h3', text });
const list = (...items: string[]): SectionBlock => ({ kind: 'list', items });
const media = (...items: MediaItem[]): SectionBlock => ({ kind: 'media', items });
const pic = (src: string, alt: string, w: number, h: number): MediaItem => ({
  src: `/resources/${src}.webp`,
  alt,
  w,
  h,
});

/**
 * «Забвение»'s field. `DAWN_MID` rather than a new colour: the run needs one
 * step between the navy and white, and the seam already owns a measured
 * mid-tone at exactly that lightness. Its own file calls it "a transition value
 * with no design meaning, not a brand colour" — true where the seam uses it,
 * because nothing is READ at that colour there. Here a whole section is, so it
 * is aliased under a name that says what it has been promoted to rather than
 * borrowed anonymously.
 */
const BG_OBLIVION = DAWN_MID;

export const MUSEUM_TITLE = 'Музей';

export const MUSEUM_LEAD = [
  'Сегодня бывшая тюрьма становится пространством, где человек вновь может ' +
    'самостоятельно распоряжаться своим временем — исследовать, выбирать, ' +
    'останавливаться и получать новый опыт.',
  'История комплекса насчитывает 300 лет. С XVIII века до сегодняшних дней ' +
    'свобода остается главным смыслом пространства.',
];

export const MUSEUM_SECTIONS: MuseumSection[] = [
  {
    id: 'trade',
    era: 'Экономическая свобода',
    years: '1710–1880',
    kicker: 'Свобода для дела.',
    bg: T.bgDarkMain, // ink-1000  #031721
    body: [
      media(
        pic('museum-embankment-1800s', 'Набережная Невы в XIX веке, гравюра', 1160, 700),
      ),
      p('Три века назад на этом берегу Невы кипела жизнь:'),
      list('Пивовары варили хмельное;', 'Купцы торговали;', 'Амбары ломились от бочек с вином.'),
      p(
        'Пространство служило экономике государства и предприимчивости мастеров, ' +
          'купцов, торговцев.',
      ),
    ],
  },
  {
    id: 'isolation',
    era: 'Изоляция свободы',
    years: '1884–2017',
    kicker: 'Свобода от преступности, инакомыслия и страха.',
    bg: T.bgCulture, // navy  #081b5a
    body: [
      media(pic('museum-prison-river', '«Кресты» со стороны Невы', 1118, 676)),
      p(
        'Потом пришло другое время. Место закрылось за высокими стенами и глухими ' +
          'заборами. Внутри возникло пространство несвободы, где изоляция стала частью ' +
          'повседневной жизни заключённых, политических узников и «врагов народа».',
      ),
      p('История этого периода продолжается в экспозиции музея.'),
      // two pictures with no prose between them — so they are ONE block and
      // render as a slider. That is the rule, expressed as data.
      media(
        pic('museum-bunks-exhibit', 'Экспозиция: трёхъярусные нары', 1304, 728),
        pic('museum-dormitory', 'Отрядное помещение с двухъярусными нарами', 1062, 582),
      ),
      p('Сохранились трёх- и двухъярусные нары, полка с наклейками, зеркала из камер.'),
      h3('Свободу и человеческую личность переосмысляли заново'),
      p(
        'Левая стена — о духе, вере и надежде. Центральная — о связи с внешним миром ' +
          'и общении внутри тюрьмы. Правая — о теле, труде и мастерстве заключённых.',
      ),
      media(pic('museum-cell-wall', 'Стена камеры с экспозиционными панелями', 1280, 826)),
      // FIXED: «Сохранились элемент» — number disagreement; and the double
      // space before «иконы». The designer's own text, corrected in place.
      p(
        'Сохранился элемент проволоки, перехватывающей нелегальную коммуникацию, ' +
          'малявы и приспособления для их передачи, нитки дорог, иконы.',
      ),
      h3('Судьбы людей становились частью истории'),
      p(
        'Здесь раскрываются истории известных заключённых «Крестов»: деятелей культуры, ' +
          'литературы, истории, политики, науки, искусства и других публичных фигур.',
      ),
      media(
        pic('museum-tally-wall', 'Отметки дней на стене прогулочного дворика', 1352, 820),
        pic('museum-duty-office', 'Дежурная часть: картотека, телефон, радиоприёмник', 1352, 820),
      ),
      p(
        'Сохранился служебный телефон, внутренние документы, нары, зеркало, плитка ' +
          'из камеры, иконки заключённых, улавливатель для сброса ключей из «Крестов», ' +
          'фонари и лампочки над дверью камеры.',
      ),
      // FIXED: «...» → «…» (U+2026)
      h3('Музей откроется вместе с комплексом в 2029 году…'),
    ],
  },
  {
    id: 'oblivion',
    era: 'Забвение',
    years: '2017–2026',
    kicker: 'Свобода без содержания.',
    bg: BG_OBLIVION, // #2b4a7a
    body: [
      media(
        pic('museum-rotunda', 'Пустая ротонда «Крестов»', 1376, 898),
        pic('museum-corridor', 'Коридор с дверями камер', 1000, 694),
      ),
      p('Стены опустели, наступила пауза и тишина. Место принадлежит только памяти.'),
      p(
        'Возвращаемся к истокам места: «Кресты» снова становятся открытыми с памятью ' +
          'прошлого, но пока еще без содержания будущего.',
      ),
    ],
  },
  {
    id: 'person',
    era: 'Свобода личности',
    // FIXED: «2026–...» → «2026–…»
    years: '2026–…',
    kicker: 'Свобода для человека.',
    bg: T.bgLightMain, // #ffffff — where the light stops working
    body: [
      media(pic('museum-temple-square', 'Площадь перед храмом', 2400, 1600)),
      // FIXED: double space in «рестораны  с авторской кухней»
      p(
        'Теперь вместо пивоварен — рестораны с авторской кухней, вместо складов — ' +
          'коворкинги и отели, вместо тюремных коридоров — залы для проведения ' +
          'концертов и выставок.',
      ),
      media(pic('museum-winter-street', 'Улица комплекса зимой', 1280, 859)),
      p(
        'Свобода выбирать: шум или тишина, работа или отдых, вера или знание, ' +
          'уединение или встреча. Здесь каждый может найти что-то свое для ' +
          'обогащения жизни.',
      ),
    ],
  },
];

/** index of the section whose field is white — the one the light cannot survive */
export const WHITE_SECTION = MUSEUM_SECTIONS.findIndex((s) => s.bg === T.bgLightMain);

if (import.meta.env.DEV) {
  for (const s of MUSEUM_SECTIONS) {
    s.body.forEach((b, i) => {
      const next = s.body[i + 1];
      if (b.kind === 'media' && next?.kind === 'media') {
        console.error(
          `[kresty] museum section "${s.id}": two media blocks in a row at ${i}. ` +
            `Adjacent pictures are ONE block — merge them and they become a slider.`,
        );
      }
    });
  }
  if (WHITE_SECTION < 0) {
    console.error('[kresty] museum: no white section — the light has nothing to hand over to.');
  }
}
