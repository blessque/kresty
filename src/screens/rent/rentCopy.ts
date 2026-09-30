/**
 * «Аренда»'s own words — everything on the page that is not about one space.
 * Each space's copy is its `body` in shared/estate.ts, each tab's line its
 * `CATEGORIES` note.
 *
 * ROUND 32.2: the head, the facts and their prose are the DESIGNER'S, verbatim
 * from Figma `1320:112` (one typo fixed: «госетй»). Kept in one file so they
 * can be read in one place.
 *
 * NOT SOURCED, and on the page because the designer put them there — flagged so
 * nobody mistakes them for the client's figures:
 *   · «1 миллион посетителей», «половина … зайдут в гастроквартал» — no source;
 *   · «800 человек», «300 гостей» — our estimates (offices at 10–12 м² a desk;
 *     262 rooms × ~70 % occupancy × ~1.6 guests), never confirmed by the client;
 *   · «10 минут» to «пл. Ленина» — not walked on a map.
 * The client's own numbers are elsewhere: 262 rooms, 1 402 м² conference hall,
 * 179 parking spaces, 2030 (see buildingsInfo.ts and shared/estate.ts).
 */

export const LEAD =
  'Помещения общей площадью 20 000 м² вместят до 70 арендаторов в пространстве ' +
  'нового общественно-культурного комплекса. Выбирайте помещение под ресторан, ' +
  'офис, магазин, СПА или образовательное заведение. Каждое помещение будет ' +
  'оборудовано необходимой инфраструктурой, включая парковочные места.';

export const FACTS_HEADING = 'Кресты — точка притяжения активности';

/** [figure, what it means] — the figure is a Factoid and may wrap */
export const FACTS: [string, string][] = [
  ['1 миллион посетителей', 'Ежегодно более миллиона человек посетят комплекс, и половина из них зайдут в гастроквартал'],
  ['800 человек', 'Столько офисных сотрудников будут работать на территории комплекса регулярно'],
  ['300 гостей', 'Столько гостей будет вмещать два отеля ежедневно'],
  ['2030 год', 'Кресты откроются уже через три года'],
  ['10 минут', 'Пешая доступность до метро «пл. Ленина» и Финляндского вокзала'],
];

export const FACTS_NOTE =
  'Мультимедийный музей и экскурсии, действующий храм, парковка на 179 машиномест ' +
  'и собственный причал — квартал открыт жителям и гостям города';

/** «Об аренде» — the designer's three sentences, verbatim (round 32.2) */
export const ABOUT_HEADING = 'Об аренде';
export const ABOUT: string[] = [
  'Помещения передаются в одном из пяти состояний — от готовой отделки до пустых стен под собственную кухню.',
  'Террасы сдаются только вместе с основным помещением и не могут быть арендованы отдельно.',
  'Машиноместа на парковке закреплены за помещениями индивидуально.',
];

/** the form on this page — heading and first line are the designer's */
export const FORM_HEADING = 'Контакты';
export const FORM_LEAD = 'Свяжитесь с нами для консультации и предварительной записи на просмотр.';
