/**
 * Resident data for the «Концепция» map, keyed by the stable part ids that
 * buildingSplit.ts assigns.
 *
 * IDs are assigned by descending triangle count, so they follow modelling
 * detail rather than size — `b00` is the finely-modelled domed church, not one
 * of the big cross blocks. IDs are assigned AFTER the sliver absorption in
 * buildingSplit.ts, so changing `MIN_FOOTPRINT_FRAC` or `MIN_TRIS` renumbers
 * everything from the first part it drops onward. Re-derive the table if you
 * touch those thresholds. Replacing the GLB invalidates it entirely.
 *
 * ---------------------------------------------------------------------------
 * ROUND 10.2 — remapped against the client's zoning plan (НИиПИ
 * «Спецреставрация», СХЕМА ФУНКЦИОНАЛЬНОГО ЗОНИРОВАНИЯ, sheet 28/133) and the
 * publicly announced programme.
 *
 * ORIENTATION. The plan draws the Neva at the TOP; this render puts it at the
 * BOTTOM — a ~180° rotation. Two independent landmarks fix it: `b01` reaches
 * furthest toward the Neva AND carries the round volume `b04` on its far side,
 * exactly as Лит Е1 carries its rotunda on the plan. So **b01 = Лит Е1** and
 * **b02 = Лит Е3**. The pre-round-10.2 comments read «left of the plan» for
 * b01 and were mirrored — that is now fixed, and it is why the two cross blocks
 * previously carried each other's names.
 *
 * CONFIDENCE. Assigned from geometry, and certain: the two crosses (b01/b02),
 * the domed church (b00), the rotunda (b04), the flat slab on the water
 * (b18 = the pier) and the large flat deck (b15 = the parking structure).
 * Everything else is placed by its zone on the plan — offices and cafés along
 * the embankment, rental and catering along ул. Комсомола — NOT by reading a
 * lit letter off the drawing, which is not legible at that resolution. The
 * functions are the client's; the specific part each lands on is a reading.
 *
 * CONFIRMED PROGRAMME (press, June 2026): ГК «КВС» + Cosmos Hotel Group, two
 * hotels in the two cross blocks totalling 262 rooms — 5★ with 126 rooms and a
 * spa, 4★ with 136 rooms and a large conference hall — plus a multimedia
 * museum, a gastronomic cluster, public space and a dedicated pier. 15 bn ₽,
 * completion 2030. Architect of the original complex: А. О. Томишко, 1884–1890;
 * the church of St Alexander Nevsky was consecrated in 1890.
 *
 * Brand marks and URLs remain INVENTED placeholders — see residentLogos.ts.
 */

/**
 * A branded resident — a hotel, restaurant, café or shop that carries its own
 * identity, as opposed to a plain programme entry like «Переговорные».
 *
 * ALL URLS ARE INVENTED AND DO NOT RESOLVE (bar the Cosmos group site). They
 * exist so the drawer can be judged with real link furniture in it.
 */
export interface Brand {
  /** key into RESIDENT_LOGOS (residentLogos.ts) */
  logo: string;
  /** placeholder destination */
  url: string;
  /** what the link offers, e.g. «Сайт» or «Забронировать номер» */
  cta: string;
}

/**
 * What a resident IS, so the hover rail can summarise a building as
 * «126 номеров · 2 ресторана · спа-комплекс» instead of listing it.
 *
 * `hotel` and `service` are deliberately absent from the summary: the hotel is
 * the building itself, and back-of-house is not a selling point.
 */
export type ResidentType =
  | 'hotel'
  | 'room'
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'shop'
  | 'office'
  | 'spa'
  | 'museum'
  | 'hall'
  | 'workshop'
  | 'parking'
  | 'church'
  | 'service';

export interface Resident {
  label: string;
  /** storey index; 0 = ground floor */
  floor: number;
  type: ResidentType;
  /** how many of this thing — rooms, halls, parking bays. Defaults to 1. */
  count?: number;
  /** present only on branded residents */
  brand?: Brand;
}

export interface BuildingInfo {
  name: string;
  /** one line under the title IN THE DRAWER — the hover rail no longer shows it */
  kind: string;
  /** two lines, shown on the left rail while the building is hovered */
  brief: string;
  /** drawer hero photo (path under /resources). Only the hotels have one so
   *  far; a building without it simply opens without a hero. */
  photo?: string;
  /** operator wordmark, an SVG path under /resources. Sits BELOW the hero and
   *  stands in for `kind`, which the Figma drawer does not show when a building
   *  carries an operator. */
  logo?: string;
  /** the building's own outbound link — «Сайт отеля ›» in the Figma, directly
   *  under the brief. Distinct from a resident's `brand.url`. */
  link?: { url: string; label: string };
  /**
   * Keys (hotel rooms) in the building.
   *
   * A building-level fact, NOT a resident: the Figma drawer lists the tenants
   * you could walk into, and «Номера · 126» is not one of them. It still has to
   * reach the hover summary, which is where «126 номеров» is the single most
   * useful thing said about a cross — so it lives here and is folded into the
   * `room` total by `summarize()`.
   */
  rooms?: number;
  /** exactly what the drawer lists — a curated set, not an inventory */
  residents: Resident[];
}

const COSMOS = 'https://cosmosgroup.ru';

export const BUILDINGS_INFO: Record<string, BuildingInfo> = {
  // 8482 tris · domed, column-fronted, between the two crosses = Лит Е2
  b00: {
    name: 'Церковь святого Александра Невского',
    kind: 'Лит. Е2 · 1890, арх. А. О. Томишко',
    brief: 'Тюремный храм, освящённый в 1890 году. Его купол виден с набережной Невы.',
    residents: [
      { label: 'Действующий храм', floor: 0, type: 'church' },
      { label: 'Концертный зал', floor: 0, type: 'hall' },
      { label: 'Выставочное пространство', floor: 1, type: 'hall' },
    ],
  },

  // 2758 tris · 9.77×9.77 · reaches furthest toward the Neva, rotunda attached
  // → Лит Е1. Welded to its courtyard and apse, so it selects as one unit.
  // Named «Западный крест» after the client's own drawer design, which is also
  // the geography: with the Neva to the north, Лит Е1 is the western of the two.
  b01: {
    name: 'Западный крест',
    kind: 'Лит. Е1 · отель Cosmos 5★',
    photo: '/resources/hotel.webp',
    logo: '/resources/cosmos-logo.svg',
    link: { url: COSMOS, label: 'Сайт отеля' },
    brief: 'Пятизвездочный отель с номерами на месте бывших камер.',
    rooms: 126,
    // exactly the three rows in the client's drawer design, in their order
    residents: [
      { label: 'Гостиница Cosmos Selection 5*', floor: 0, type: 'hotel' },
      { label: 'Ресторан Cosmos', floor: 0, type: 'restaurant' },
      { label: 'SPA-Комплекс', floor: 0, type: 'spa' },
    ],
  },

  // 2626 tris · 9.77×9.77 · the second cross, further from the Neva → Лит Е3
  b02: {
    name: 'Восточный крест',
    kind: 'Лит. Е3 · отель Cosmos 4★',
    photo: '/resources/hotel.webp',
    logo: '/resources/cosmos-logo.svg',
    link: { url: COSMOS, label: 'Сайт отеля' },
    brief: 'Четырехзвездочный отель с конференц-центром и мультимедийным музеем.',
    rooms: 136,
    // three rows, matching the west cross — the design shows only one drawer,
    // and two crosses that list different amounts would read as an accident
    residents: [
      { label: 'Гостиница Cosmos Smart 4*', floor: 0, type: 'hotel' },
      { label: 'Конференц-зал', floor: 0, type: 'hall' },
      {
        label: 'Мультимедийный музей «Кресты»',
        floor: 0,
        type: 'museum',
        brand: { logo: 'museum', url: 'https://museum-kresty.ru', cta: 'Купить билет' },
      },
    ],
  },

  // 316 tris · far end of the ул. Комсомола row
  b03: {
    name: 'Арендный корпус',
    kind: 'Арендные помещения',
    brief: 'Арендные помещения вдоль улицы Комсомола: студии, шоурумы и небольшие офисы.',
    residents: [
      {
        label: 'Книжный магазин «Полка»',
        floor: 0,
        type: 'shop',
        brand: { logo: 'polka', url: 'https://polka-kresty.ru', cta: 'Сайт' },
      },
      { label: 'Шоурумы', floor: 0, type: 'shop', count: 4 },
      { label: 'Студии и офисы', floor: 1, type: 'office', count: 6 },
    ],
  },

  // 304 tris · 1.76×1.76 · the round volume on the first corpus
  b04: {
    name: 'Ротонда',
    kind: 'Панорамный ресторан',
    brief: 'Круглый объём над первым корпусом. Панорамный ресторан и бар с видом на Неву.',
    residents: [
      {
        label: 'Панорамный ресторан',
        floor: 4,
        type: 'restaurant',
        brand: { logo: 'galereya', url: 'https://rotonda-kresty.ru', cta: 'Забронировать стол' },
      },
      {
        label: 'Бар «Башня»',
        floor: 4,
        type: 'bar',
        brand: { logo: 'bashnya', url: 'https://bashnya.bar', cta: 'Забронировать' },
      },
    ],
  },

  // 280 tris · 4.88×2.22 · the widest volume on the embankment row
  b05: {
    name: 'Главный офис',
    kind: 'Главный офис комплекса',
    brief: 'Управляющая компания квартала и представительства резидентов на набережной.',
    residents: [
      { label: 'Управляющая компания', floor: 0, type: 'office' },
      {
        label: 'Коворкинг «Набережная»',
        floor: 1,
        type: 'office',
        brand: { logo: 'naberezhnaya', url: 'https://naberezhnaya.work', cta: 'Тарифы' },
      },
      { label: 'Офисы резидентов', floor: 2, type: 'office', count: 8 },
    ],
  },

  // 272 tris · 2.48×3.81 · tall volume on the ул. Комсомола row
  b06: {
    name: 'Гастрономический корпус',
    kind: 'Общественное питание',
    brief: 'Гастрономический кластер квартала: фуд-холл, пекарня и винный бар под одной крышей.',
    residents: [
      { label: 'Фуд-холл', floor: 0, type: 'restaurant' },
      {
        label: 'Пекарня «Тесто»',
        floor: 0,
        type: 'cafe',
        brand: { logo: 'testo', url: 'https://testo-bakery.ru', cta: 'Сайт' },
      },
      {
        label: 'Кофейня «Свет»',
        floor: 0,
        type: 'cafe',
        brand: { logo: 'svet', url: 'https://svet.coffee', cta: 'Сайт' },
      },
      {
        label: 'Винный бар «Погреб»',
        floor: 1,
        type: 'bar',
        brand: { logo: 'pogreb', url: 'https://pogreb-wine.ru', cta: 'Забронировать' },
      },
    ],
  },

  // 232 tris · 1.86×5.16 · long volume at the far end of the Комсомола row
  b07: {
    name: 'Офисный корпус',
    kind: 'Офисы',
    brief: 'Офисный корпус на границе участка. Отдельный вход со стороны улицы Комсомола.',
    residents: [
      { label: 'Офисы резидентов', floor: 0, type: 'office', count: 12 },
      { label: 'Переговорные', floor: 2, type: 'hall', count: 3 },
    ],
  },

  // 208 tris · 2.58×2.45 · Комсомола row
  b08: {
    name: 'Кафе на Комсомола',
    kind: 'Общественное питание',
    brief: 'Кафе с отдельным входом с улицы, работающее и на квартал, и на город.',
    residents: [
      { label: 'Кафе', floor: 0, type: 'cafe' },
      { label: 'Летняя веранда', floor: 0, type: 'cafe' },
    ],
  },

  // 204 tris · 1.91×2.48 · Комсомола row
  b09: {
    name: 'Торговая галерея',
    kind: 'Арендные помещения',
    brief: 'Небольшая торговая галерея: магазины у входа и сервисы для жителей квартала.',
    residents: [
      { label: 'Магазины', floor: 0, type: 'shop', count: 5 },
      { label: 'Пункт выдачи заказов', floor: 0, type: 'service' },
    ],
  },

  // 142 tris · 2.75×1.94 · embankment row
  b10: {
    name: 'Офисы на набережной',
    kind: 'Офисы',
    brief: 'Офисные помещения с окнами на Неву и выходом на набережную.',
    residents: [
      { label: 'Офисы резидентов', floor: 0, type: 'office', count: 9 },
      { label: 'Переговорные', floor: 1, type: 'hall', count: 2 },
    ],
  },

  // 130 tris · 2.58×1.40 · Комсомола row
  b11: {
    name: 'Сервисный корпус',
    kind: 'Сервисы квартала',
    brief: 'Бытовые сервисы квартала: прачечная самообслуживания, ателье и мастерские.',
    residents: [
      { label: 'Прачечная самообслуживания', floor: 0, type: 'service' },
      { label: 'Ателье', floor: 0, type: 'workshop' },
      { label: 'Мастерские резидентов', floor: 1, type: 'workshop', count: 6 },
    ],
  },

  // 128 tris · 1.44×2.63 · the chimneyed volume on the Комсомола row
  b12: {
    name: 'Котельная',
    kind: 'Котельная · инженерный корпус',
    brief: 'Историческая котельная с трубой. Инженерное сердце комплекса, закрыта для гостей.',
    residents: [{ label: 'Техническая служба квартала', floor: 0, type: 'service' }],
  },

  // 110 tris · 2.50×1.47 · embankment row, near the main entrance
  b13: {
    name: 'Кафе на набережной',
    kind: 'Кафе',
    brief: 'Кафе у главного входа с террасой, обращённой к Арсенальной набережной.',
    residents: [
      { label: 'Кафе', floor: 0, type: 'cafe' },
      { label: 'Терраса на набережной', floor: 0, type: 'cafe' },
    ],
  },

  // 110 tris · 2.75×1.94 · embankment row, by the pier
  b14: {
    name: 'Офисы у причала',
    kind: 'Офисы',
    brief: 'Небольшой офисный корпус у причала, с выходом к воде и подземному переходу.',
    residents: [
      { label: 'Офисы резидентов', floor: 0, type: 'office', count: 6 },
      { label: 'Касса водных маршрутов', floor: 0, type: 'service' },
    ],
  },

  // 68 tris · 2.74×5.17 but only 0.43 high — a flat deck, not a volume
  b15: {
    name: 'Паркинг',
    kind: 'Временная конструкция паркинга',
    brief: 'Многоуровневый паркинг комплекса с въездом со стороны улицы Комсомола.',
    residents: [{ label: 'Машино-места', floor: 0, type: 'parking', count: 240 }],
  },

  // 59 tris · 1.07×1.38 · small pavilion on the embankment row
  b16: {
    name: 'Входной павильон',
    kind: 'Входная группа',
    brief: 'Павильон главного входа: информационный центр с картой квартала и сувениры.',
    residents: [
      { label: 'Информационный центр', floor: 0, type: 'service' },
      { label: 'Сувенирный магазин', floor: 0, type: 'shop' },
    ],
  },

  // 48 tris · 2.67×1.87 · only 0.21 high — a canopy
  b17: {
    name: 'Навес',
    kind: 'Навес общественного пространства',
    brief: 'Крытый навес над общественным пространством. Сезонная сцена и ярмарки.',
    // typed `service`, not `hall`: an open-air stage summarised as «зал» reads
    // as an indoor room. It simply contributes no summary clause.
    residents: [{ label: 'Летняя сцена', floor: 0, type: 'service' }],
  },

  // 46 tris · 6.95×1.64 · 0.09 high — the slab lying on the water
  b18: {
    name: 'Причал «Кресты»',
    kind: 'Причал · водные маршруты',
    brief: 'Собственный причал комплекса, включающий «Кресты» в городские водные маршруты.',
    residents: [
      { label: 'Речные маршруты', floor: 0, type: 'service' },
      { label: 'Кафе на причале', floor: 0, type: 'cafe' },
    ],
  },
};

/** Every part opens a drawer; unmapped ones get a neutral stub rather than
 *  nothing, so the interaction never feels broken while copy is pending. */
export function infoFor(id: string): BuildingInfo {
  return (
    BUILDINGS_INFO[id] ?? {
      name: 'Строение ' + id.replace(/^b0?/, ''),
      kind: 'Назначение уточняется',
      // NOT optional — `BUILDINGS_INFO[id]` types as a non-nullable
      // `BuildingInfo` without `noUncheckedIndexedAccess`, so `??` does not
      // force this literal to be checked against the interface and a missing
      // field here reaches the DOM as the string "undefined" rather than a
      // compile error.
      brief: 'Назначение этого строения уточняется вместе с проектом квартала.',
      residents: [],
    }
  );
}

// ------------------------------------------------------------ hover summary

/** counted things: [1, 2–4, 5+] */
const TYPE_WORDS: Partial<Record<ResidentType, [string, string, string]>> = {
  room: ['номер', 'номера', 'номеров'],
  restaurant: ['ресторан', 'ресторана', 'ресторанов'],
  cafe: ['кафе', 'кафе', 'кафе'],
  bar: ['бар', 'бара', 'баров'],
  shop: ['магазин', 'магазина', 'магазинов'],
  office: ['офис', 'офиса', 'офисов'],
  museum: ['музей', 'музея', 'музеев'],
  hall: ['зал', 'зала', 'залов'],
  workshop: ['мастерская', 'мастерские', 'мастерских'],
  parking: ['машино-место', 'машино-места', 'машино-мест'],
};

/** things that are named, not counted — «спа-комплекс», not «1 спа-комплекс» */
const TYPE_SOLO: Partial<Record<ResidentType, string>> = {
  spa: 'спа-комплекс',
  church: 'действующий храм',
};

/**
 * What leads the summary. `hotel` and `service` are absent on purpose — the
 * hotel IS the building, and back-of-house is not a selling point.
 *
 * Order is by pitch value, not by count. `spa` sits third because it is a
 * headline feature of the 5★ and was being cut by MAX_PARTS when it trailed
 * `bar`; `church` leads because on the one building that has it, it is the
 * whole answer.
 */
const TYPE_ORDER: ResidentType[] = [
  'church',
  'room',
  'restaurant',
  'spa',
  'museum',
  'hall',
  'cafe',
  'bar',
  'shop',
  'workshop',
  'office',
  'parking',
];

/** at most this many clauses — the rail is a glance, not an inventory */
const MAX_PARTS = 3;

/**
 * «126 номеров · ресторан · спа-комплекс».
 *
 * Replaces the old resident COUNT («6 резидентов»), which told you a number
 * without telling you what of.
 *
 * Takes the whole building, not just its residents, because `rooms` is a
 * building-level fact that never appears in the drawer's list — trimming the
 * crosses to the three rows in the client's design would otherwise have taken
 * the room count out of the summary with them.
 */
export function summarize(info: BuildingInfo): string {
  const totals = new Map<ResidentType, number>();
  if (info.rooms) totals.set('room', info.rooms);
  for (const r of info.residents) {
    totals.set(r.type, (totals.get(r.type) ?? 0) + (r.count ?? 1));
  }

  const parts: string[] = [];
  for (const type of TYPE_ORDER) {
    const n = totals.get(type);
    if (!n) continue;
    const solo = TYPE_SOLO[type];
    if (solo) {
      parts.push(solo);
    } else {
      const w = TYPE_WORDS[type];
      // A single one drops the numeral: «2 ресторана · бар», never
      // «2 ресторана · 1 бар» — the leading "1" reads like a stock count.
      if (w) parts.push(n === 1 ? w[0] : `${n} ${pluralize(n, w)}`);
    }
    if (parts.length === MAX_PARTS) break;
  }
  // NBSP before the separator so the middot sticks to the clause it follows —
  // a line may begin with «2 ресторана», never with «· 2 ресторана».
  return parts.join(' · ');
}

/** Russian count agreement: 1 номер, 2 номера, 5 номеров */
export function pluralize(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}
