/**
 * THE RENTAL INVENTORY — one record per thing a tenant can sign for.
 *
 * ROUND 32. Both «Аренда» and the map's drawer read this file, so a figure can
 * never disagree between the two. It is pure data with no imports, which is why
 * it lives in `shared/`: `screens/rent` and `screens/concept` may not import each
 * other, and `shared/` imports nothing internal.
 *
 * SOURCES, and what each one is trusted for:
 *
 * - `references/rent-spreadsheet.xlsx` (the client's) — WHAT is let and on what
 *   terms: use, «Арендопригодная площадь», the terraces, «П/Ч», parking, fit-out.
 *   Every row counts except the red ones, which are booked: both hotels and their
 *   vestibules, the museum, the conference hall and «Ледник» (a public WC).
 *   Areas are column G, rounded here to whole metres for display only.
 * - `references/57–126-for-claude.pdf` (НИиПИ «Спецреставрация») — WHICH building
 *   is which litera. Its key plan (pp. 1, 52) was converted to GLB space with the
 *   two cross centres as anchors, and every litera landed inside exactly one
 *   part. That is how `mapId` was assigned — measured, not read off a drawing
 *   (see CONCEPT_MAP.md, «Литеры»).
 *
 * WHAT THE SOURCES DO NOT SAY, and so nothing here says either: rents, tenants,
 * ceiling heights (bar the pavilion's 4 m), entrances, ventilation, power per
 * building (bar the stage's 80 kW), deadlines. «Аренда» names those as
 * «уточним по запросу» rather than leaving empty rows or inventing them.
 *
 * ROUND 32.1 — BY BUSINESS, NOT BY ADDRESS. A tenant's first question is «is
 * this for my business?», so each offer carries `roles`: the categories it can
 * serve and, for a mixed building, WHICH PART serves each. М1 is a restaurant on
 * the ground floor and offices above, so it is listed under both, each time
 * framed by its own floors. The address survives as a location phrase.
 * ROUND 32.2 made the categories the page's five tabs (the designer's page).
 *
 * THE LITERA IS NEVER RENDERED on «Аренда»: it is the heritage survey's index
 * and tells a tenant nothing about the space. It stays as data because the map
 * audit and the neighbours are keyed to it.
 *
 * TERRACES ARE NEVER LET SEPARATELY — the client's rule, which is why they are a
 * field of the building rather than offers of their own.
 *
 * TODO(copy): `body` is WRITTEN HERE from the spreadsheet and the deck, not
 * supplied. The spreadsheet does not say how many tenants a multi-tenant building
 * will hold, nor how its floors split, so no count or split is given anywhere.
 */

export type Zone = 'embankment' | 'komsomola' | 'inner';

/** what a tenant is looking for — the page's grouping */
export type Category = 'food' | 'office' | 'retail' | 'wellness' | 'events';

/** the fit-out a building is handed over in — see `FINISHES` */
export type Finish = 'design' | 'floors' | 'pre' | 'common' | 'shell' | 'stage';

export interface EstatePhoto {
  src: string;
  w: number;
  h: number;
  alt: string;
}

/**
 * One way an offer serves one category. `floors` names the part's floors when
 * the building is mixed (М1's restaurant is «1 этаж», its offices «2–3 этажи»);
 * `name` and `area` override the offer's when the part is its own thing (Д's
 * event pavilion is 288 м², not the business centre's 1 670).
 *
 * `key` is ROUND 32.2's one crucial fact, the card's fourth cell — set by hand
 * and only where it decides the lease (the pavilion's ceiling, the stage's
 * power). An office card's parking is derived instead, see `keyFact()`.
 */
export interface Role {
  cat: Category;
  floors?: string;
  name?: string;
  area?: number;
  key?: { label: string; value: string };
}

export interface Offer {
  /** `#rent/<slug>` */
  slug: string;
  /** the heritage survey's index — data only, never shown on «Аренда» */
  litera: string;
  zone: Zone;
  roles: Role[];
  /** the map part this offer sits in (buildingSplit ids) */
  mapId: string;
  /** the offer's name on its card */
  name: string;
  /** one company, several tenants, one operator */
  format: string;
  /** «Арендопригодная площадь», м² */
  area: number;
  /** covered or open terraces, м² each — let only together with the building */
  terraces: number[];
  floors?: string;
  /** «П/Ч» in the spreadsheet */
  levels?: string;
  parking: number;
  finish: Finish;
  body: string;
  photo: EstatePhoto;
}

/**
 * ROUND 32.2 — THE FIVE TABS, in the designer's words (Figma `1320:122`). `name`
 * is the tab, said as what the reader came to do; `note` opens its panel, and
 * the page appends the area range it computes from the cards.
 */
export const CATEGORIES: { id: Category; name: string; note: string }[] = [
  {
    id: 'food',
    name: 'Открыть ресторан или кофейню',
    note: 'Рестораны со своей кухней, гастромаркет, кофейня — почти все с террасами.',
  },
  {
    id: 'office',
    name: 'Снять офис',
    note: 'Особняки целиком для одной компании, бизнес-центры и коворкинг.',
  },
  {
    id: 'retail',
    name: 'Открыть магазин',
    note: 'Торговые помещения в здании у главного входа с набережной — первом, мимо которого проходят гости квартала.',
  },
  {
    id: 'wellness',
    name: 'Помещение под СПА и фитнес',
    note: 'СПА-центр с бассейном и фитнес-залом у пятизвёздочного отеля, со своей входной группой.',
  },
  {
    id: 'events',
    name: 'Пространства для мероприятий',
    note: 'Летняя сцена во дворе, остеклённый павильон и выставочный зал.',
  },
];

/** where the building stands, said the way a tenant would weigh it */
export const ZONE_PLACE: Record<Zone, string> = {
  embankment: 'Набережная, окна на Неву',
  komsomola: 'Улица Комсомола, фасад на улицу',
  inner: 'Внутри квартала, рядом с отелями',
};

/**
 * The fit-out, as the two things a tenant needs to estimate the job: what they
 * receive and what is left to them. `short` heads «Состояние помещений»; `card`
 * is the card's value, which already sits under the label «Отделка» and so
 * drops the word (the designer's card, round 32.2).
 */
export const FINISHES: Record<Finish, { short: string; card: string; given: string; left: string }> = {
  design: {
    short: 'Готовая отделка',
    card: 'Готовая',
    given: 'Чистовая отделка по дизайн-проекту',
    left: 'Мебель и оборудование',
  },
  floors: {
    short: 'Готовая отделка, фальшполы',
    card: 'Готовая, фальшполы',
    given: 'Фальшполы и чистовая отделка по дизайн-проекту',
    left: 'Мебель и оборудование',
  },
  pre: {
    short: 'Предчистовая отделка',
    card: 'Предчистовая',
    given: 'Помещения, подготовленные под чистовую отделку',
    left: 'Интерьер и чистовая отделка под себя',
  },
  common: {
    short: 'Общие зоны готовы',
    card: 'Общие зоны готовы',
    given: 'Отделанные холлы, лестницы и санузлы',
    left: 'Отделка своего помещения',
  },
  shell: {
    short: 'Без отделки',
    card: 'Без отделки',
    given: 'Помещения без отделки',
    left: 'Кухня, залы и интерьер под свою концепцию',
  },
  stage: {
    short: 'Сборная конструкция',
    card: 'Сборная конструкция',
    given: 'Сборно-разборная сцена на сезон',
    left: 'Программа и проведение',
  },
};

const PA = 'подвал и чердак';
const ATTIC = 'чердак';

const R = '/resources/rent/';
const photo = (src: string, alt: string, w = 2400, h = 1600): EstatePhoto => ({ src, w, h, alt });

export const OFFERS: Offer[] = [
  // ------------------------------------------------------------- набережная
  {
    slug: 'a',
    litera: 'А',
    zone: 'embankment',
    roles: [{ cat: 'office' }],
    mapId: 'b13',
    name: 'Коворкинг на набережной',
    format: 'Коворкинг, несколько арендаторов',
    area: 1287,
    terraces: [],
    floors: '2',
    levels: PA,
    parking: 15,
    finish: 'floors',
    body:
      'Рабочие места и кабинеты для небольших команд, общие переговорные — два ' +
      'этажа окнами на Неву. Отделку и инженерию делает управляющая компания.',
    photo: photo(R + 'a-embankment.webp', 'Дом на западном углу набережной со стороны Невы', 1500, 1000),
  },
  {
    slug: 'b',
    litera: 'Б',
    zone: 'embankment',
    roles: [{ cat: 'office' }],
    mapId: 'b10',
    name: 'Особняк на набережной',
    format: 'Целиком одной компании',
    area: 1227,
    terraces: [],
    floors: '3',
    levels: PA,
    parking: 13,
    finish: 'pre',
    body:
      'Отдельный трёхэтажный дом фасадом на Неву — для компании, которой нужно ' +
      'своё здание. Планировку и интерьер делаете под себя.',
    photo: photo(R + 'b-embankment.webp', 'Трёхэтажный дом на Арсенальной набережной', 1500, 1000),
  },
  {
    slug: 'v',
    litera: 'В',
    zone: 'embankment',
    roles: [{ cat: 'food' }],
    mapId: 'b16',
    name: 'Кофейня с террасой',
    format: 'Один арендатор',
    area: 75,
    terraces: [42.5],
    floors: '1',
    parking: 0,
    finish: 'pre',
    body:
      'Небольшое отдельное здание бывшей прачечной на пути с набережной во двор ' +
      'квартала — под кофейню с крытой террасой.',
    photo: photo(R + 'v-facade.webp', 'Одноэтажное здание бывшей прачечной', 2304, 1536),
  },
  {
    slug: 'k',
    litera: 'К',
    zone: 'embankment',
    roles: [{ cat: 'retail', name: 'Торговая галерея у входа' }, { cat: 'office' }],
    mapId: 'b05',
    name: 'Здание у главного входа',
    format: 'Несколько арендаторов',
    area: 763,
    terraces: [],
    floors: '2',
    levels: PA,
    parking: 13,
    finish: 'design',
    body:
      'Бывший главный вход с набережной — первое здание, мимо которого проходят ' +
      'гости квартала. Магазины, сервисы и офисы с общими холлами.',
    photo: photo(R + 'k-winter.webp', 'Входное здание с аркой зимой', 2400, 1601),
  },
  {
    slug: 'p',
    litera: 'П',
    zone: 'embankment',
    roles: [{ cat: 'office' }],
    mapId: 'b14',
    name: 'Особняк у причала',
    format: 'Целиком одной компании',
    area: 1154,
    terraces: [],
    floors: '3',
    levels: PA,
    parking: 11,
    finish: 'pre',
    body:
      'Отдельный трёхэтажный особняк на набережной напротив причала квартала — ' +
      'целиком для одной компании.',
    // the deck has no render of П: a crop of the aerial render, centred on the building
    photo: photo(R + 'p-aerial.webp', 'Трёхэтажный особняк на набережной с высоты', 1050, 700),
  },

  // -------------------------------------------------------- улица Комсомола
  {
    slug: 'e5',
    litera: 'Е5',
    zone: 'komsomola',
    roles: [{ cat: 'office' }],
    mapId: 'b03',
    name: 'Бизнес-центр класса А',
    format: 'Несколько арендаторов',
    area: 1719,
    terraces: [],
    floors: '3',
    parking: 19,
    finish: 'floors',
    body:
      'Три этажа под мансардной крышей у западной границы квартала, с фальшполами ' +
      'и готовой отделкой по дизайн-проекту.',
    photo: photo(R + 'e5-winter.webp', 'Бизнес-центр на улице Комсомола зимой', 2304, 1536),
  },
  {
    slug: 'm1',
    litera: 'М1',
    zone: 'komsomola',
    roles: [
      { cat: 'food', floors: '1 этаж', name: 'Ресторан с галереей' },
      { cat: 'office', floors: '2–3 этажи', name: 'Офисы над галереей' },
    ],
    mapId: 'b08',
    name: 'Ресторан и офисы с галереей',
    format: 'Несколько арендаторов',
    area: 999,
    terraces: [381.88, 135, 135],
    floors: '3',
    levels: ATTIC,
    parking: 8,
    finish: 'common',
    body:
      'Вдоль фасада на улицу Комсомола пристраивается остеклённая галерея: три ' +
      'террасы, которые сдаются вместе с помещениями.',
    photo: photo(R + 'm1-gallery.webp', 'Остеклённая галерея вдоль кирпичного фасада'),
  },
  {
    slug: 'm2',
    litera: 'М2',
    zone: 'komsomola',
    roles: [
      { cat: 'food', floors: '1 этаж', name: 'Ресторан с двумя террасами' },
      { cat: 'office', floors: '2 этаж', name: 'Офисы рядом с галереей' },
    ],
    mapId: 'b12',
    name: 'Ресторан и офисы',
    format: 'Несколько арендаторов',
    area: 768,
    terraces: [82, 135],
    floors: '2',
    levels: ATTIC,
    parking: 6,
    finish: 'common',
    body:
      'Двухэтажный корпус рядом с галереей: ресторан внизу, офисы наверху и две ' +
      'террасы.',
    // no render of М2 in the deck: a crop of the aerial render, centred on the building
    photo: photo(R + 'm2-aerial.webp', 'Двухэтажный корпус с террасой с высоты', 1050, 700),
  },
  {
    slug: 'l',
    litera: 'Л',
    zone: 'komsomola',
    roles: [
      { cat: 'office' },
      { cat: 'events', name: 'Выставочный зал' },
    ],
    mapId: 'b09',
    name: 'Офисы и выставочный зал',
    format: 'Несколько арендаторов',
    area: 566,
    terraces: [249.16, 105],
    floors: '2',
    levels: ATTIC,
    parking: 4,
    finish: 'common',
    body:
      'Два этажа под офисы и выставочный зал, остеклённая терраса на улицу и ' +
      'крытая — с обратной стороны.',
    photo: photo(R + 'l-street.webp', 'Кирпичные корпуса на улице Комсомола'),
  },
  {
    slug: 'd',
    litera: 'Д',
    zone: 'komsomola',
    roles: [
      { cat: 'office' },
      {
        cat: 'events',
        name: 'Павильон для мероприятий',
        area: 287.54,
        key: { label: 'Потолки', value: '4 м' },
      },
    ],
    mapId: 'b07',
    name: 'Бизнес-центр класса Б+',
    format: 'Несколько арендаторов',
    area: 1670,
    terraces: [],
    floors: '2',
    levels: PA,
    parking: 20,
    finish: 'design',
    body:
      'Здесь же будет офис управляющей компании. Со стороны улицы Комсомола ' +
      'пристраивается остеклённый павильон для мероприятий, 288 м².',
    photo: photo(R + 'd-facade.webp', 'Двухэтажный корпус с ризалитом'),
  },

  // --------------------------------------------------------- внутри квартала
  {
    slug: 'o',
    litera: 'О',
    zone: 'inner',
    roles: [{ cat: 'food' }],
    mapId: 'b06',
    name: 'Ресторанный корпус',
    format: 'Два ресторана',
    area: 2549,
    terraces: [287.7],
    floors: '2',
    levels: PA,
    parking: 0,
    finish: 'shell',
    body:
      'Самое большое из сдаваемых зданий — бывшие кухня и пекарня, под два ' +
      'ресторана с террасой в центре квартала. Кухню и залы строите под свою ' +
      'концепцию.',
    photo: photo(R + 'o-hall.webp', 'Зал ресторана под кирпичными сводами'),
  },
  {
    slug: 'e4',
    litera: 'Е4',
    zone: 'inner',
    roles: [{ cat: 'food' }],
    mapId: 'b11',
    name: 'Гастромаркет',
    format: 'Несколько арендаторов',
    area: 808,
    terraces: [145, 78],
    floors: '3',
    levels: ATTIC,
    parking: 0,
    finish: 'common',
    body:
      'Бывшая баня у Западного креста — три этажа корнеров с разными арендаторами ' +
      'и две крытые террасы во двор.',
    photo: photo(R + 'e4-facade.webp', 'Бывшая баня с гирляндами над двором'),
  },
  {
    slug: 'e1-restaurant',
    litera: 'Е1',
    zone: 'inner',
    roles: [{ cat: 'food' }],
    mapId: 'b04',
    name: 'Ресторан в ротонде',
    format: 'Один оператор',
    area: 1517,
    terraces: [],
    parking: 0,
    finish: 'shell',
    body:
      'Круглый остеклённый зал во дворе пятизвёздочного отеля — со своим входом, ' +
      'открытый не только постояльцам.',
    photo: photo(R + 'e1-rotunda-hall.webp', 'Остеклённый зал ресторана с видом на Неву', 2400, 1601),
  },
  {
    slug: 'e1-spa',
    litera: 'Е1',
    zone: 'inner',
    roles: [{ cat: 'wellness', key: { label: 'Инженерия', value: 'по техплану оператора' } }],
    mapId: 'b01',
    name: 'СПА-центр',
    format: 'Один оператор',
    area: 2096,
    terraces: [],
    parking: 0,
    finish: 'pre',
    body:
      'Бассейн и фитнес-зал в новом остеклённом объёме у отеля на 126 номеров, со ' +
      'своей входной группой.',
    photo: photo('/resources/pool.webp', 'Бассейн СПА-центра за стеклянным фасадом'),
  },
  {
    slug: 'stage',
    litera: 'Е3',
    zone: 'inner',
    roles: [{ cat: 'events', key: { label: 'Мощность', value: '80 кВт' } }],
    mapId: 'b02',
    name: 'Летняя сцена',
    format: 'Оператор на сезон',
    area: 550,
    terraces: [],
    parking: 0,
    finish: 'stage',
    body:
      'Сезонная площадка для концертов и событий во дворе у Западного креста: ' +
      'сцена 200 м², боковые зоны и 300 м² для зрителей.',
    // TODO(render): no render of the stage exists — a courtyard stands in
    photo: photo(R + 'yard-winter.webp', 'Двор квартала вечером', 2304, 1536),
  },
];

/** the spreadsheet's «Паркинг на 179 м/м» — the sum of the per-building allocations */
export const PARKING_TOTAL = 179;

export function offerBySlug(slug: string): Offer | undefined {
  return OFFERS.find((o) => o.slug === slug);
}

/** Е1 carries two offers, so a map part could hold more than one */
export function offersOn(mapId: string): Offer[] {
  return OFFERS.filter((o) => o.mapId === mapId);
}

/** every offer that serves a category, with the role it serves it by */
export function offersIn(cat: Category): { offer: Offer; role: Role }[] {
  const out: { offer: Offer; role: Role }[] = [];
  for (const offer of OFFERS) {
    const role = offer.roles.find((r) => r.cat === cat);
    if (role) out.push({ offer, role });
  }
  return out;
}

export function terraceArea(o: Offer): number {
  return o.terraces.reduce((s, t) => s + t, 0);
}

/**
 * interior + terraces + any part with an area of its own (Д's pavilion is a
 * separate spreadsheet row, not inside the 1 670) — everything signed for
 */
export function totalArea(o: Offer): number {
  return o.area + terraceArea(o) + o.roles.reduce((s, r) => s + (r.area ?? 0), 0);
}

/**
 * «Этажность» on a card: the part's floors when the role names them, otherwise
 * the building's — «2 этажа + подвал и чердак». A role with an area of its own
 * (the pavilion) is not the building, so it quotes no floors it was not given.
 */
export function cardFloors(o: Offer, r: Role): string | null {
  if (r.floors) return r.floors;
  if (r.area || !o.floors) return null;
  const n = Number(o.floors);
  const word = plural(n, 'этаж', 'этажа', 'этажей');
  return o.levels ? `${n} ${word} + ${o.levels}` : `${n} ${word}`;
}

/**
 * The card's fourth cell — only where it decides the lease. An office tenant's
 * first practical question is where their people park, so an office card with
 * spaces says how many; everything else is the role's hand-set `key`.
 */
export function keyFact(o: Offer, r: Role): { label: string; value: string } | null {
  if (r.key) return r.key;
  if (r.cat === 'office' && o.parking) {
    return { label: 'Парковка', value: `${o.parking} ${plural(o.parking, 'машино-место', 'машино-места', 'машино-мест')}` };
  }
  return null;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «1 227 м²» — whole metres, thin-space thousands, NBSP before the unit */
export function sqm(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} м²`;
}

/** «1 помещение», «3 помещения», «9 помещений» */
export function spaces(n: number): string {
  return `${n} ${plural(n, 'помещение', 'помещения', 'помещений')}`;
}
