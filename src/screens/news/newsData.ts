/**
 * The news list (Figma `854:251` for the cards, `854:185` for «Читайте также»).
 *
 * ROUND 27 FILLED THE CATEGORIES. The frames draw three cards, so three is what
 * round 24 transcribed — but the filter row offers three categories and «Все»,
 * and with three items «Интервью» filtered to an empty page. A tab that can only
 * ever show nothing is not a tab. The client asked for 3–5 per category, so the
 * list below is 13 items: the designer's three verbatim, and ten written in the
 * same register to fill the two thin categories and the empty one.
 *
 * EVERY CARD CARRIES INTRINSIC `w`/`h`. They are written to the `<img>` so the
 * box is committed before decode — the same rule `MediaItem` states for the
 * longread, and for the same reason: a lazy image that resolves its own height
 * late grows the page under a reader who is already scrolling. That is not
 * theoretical here. It is the bug that dragged the longread's light 585px off
 * its icon last round.
 *
 * Every card still routes to `#news/1` — one article exists.
 */

export type Category = 'Интервью' | 'Строительство' | 'СМИ о нас';

/** the filter row, in the frame's order. «Все» is the resting state. */
export const CATEGORIES: Category[] = ['Интервью', 'Строительство', 'СМИ о нас'];

export interface NewsItem {
  id: string;
  date: string;
  category: Category;
  title: string;
  /** list-card image; absent on the "read also" entries, which are text-only */
  image?: string;
  /** intrinsic pixels of that image — required whenever `image` is set */
  w?: number;
  h?: number;
}

/** `/resources/<name>.webp` with its real pixel size, read off the files */
const pic = (name: string, w: number, h: number) => ({
  image: `/resources/${name}.webp`,
  w,
  h,
});

export const NEWS: NewsItem[] = [
  // ── the designer's three, verbatim ──────────────────────────────────────
  {
    id: '1',
    date: '12 августа',
    category: 'Строительство',
    title: 'Завершена реконструкция дома надзирателей',
    ...pic('atrium-roof', 2400, 1600),
  },
  {
    id: '2',
    date: '12 августа',
    category: 'СМИ о нас',
    title: 'Тайны под штукатуркой: что нашли реставраторы в доме надзирателей',
    ...pic('table', 2400, 1600),
  },
  {
    id: '3',
    date: '12 августа',
    category: 'Строительство',
    title: 'Музей вместо гауптвахты: готовность дома надзирателей — 90%',
    ...pic('main-entrance', 2400, 1600),
  },

  // ── Строительство ───────────────────────────────────────────────────────
  {
    id: '4',
    date: '7 августа',
    category: 'Строительство',
    title: 'Набережная раскрыта: с фасадов сняли строительные леса',
    ...pic('komsomola-street', 2400, 1340),
  },
  {
    id: '5',
    date: '29 июля',
    category: 'Строительство',
    title: 'Временный паркинг открыт со стороны улицы Комсомола',
    ...pic('temp-parking', 2400, 1611),
  },
  {
    id: '6',
    date: '18 июля',
    category: 'Строительство',
    title: 'Кровли обоих крестов прошли контрольное обследование',
    ...pic('overview', 2400, 1611),
  },

  // ── Интервью ────────────────────────────────────────────────────────────
  {
    id: '7',
    date: '5 августа',
    category: 'Интервью',
    title: 'Архитектор проекта: «Мы сохраняем не стены, а масштаб»',
    ...pic('mice-3', 2400, 1351),
  },
  {
    id: '8',
    date: '24 июля',
    category: 'Интервью',
    title: 'Шеф-повар «Литеры О» — о кухне в бывшем тюремном корпусе',
    ...pic('restaurant-litera-o', 2400, 1611),
  },
  {
    id: '9',
    date: '11 июля',
    category: 'Интервью',
    title: 'Как проектировали термы: разговор с автором водной программы',
    ...pic('spa-interior', 2400, 1340),
  },
  {
    id: '10',
    date: '2 июля',
    category: 'Интервью',
    title: 'Гостиница в камере: интервью с автором номеров',
    ...pic('room-3', 2400, 1611),
  },

  // ── СМИ о нас ───────────────────────────────────────────────────────────
  {
    id: '11',
    date: '9 августа',
    category: 'СМИ о нас',
    title: '«Кресты» ночью: репортаж о первой подсветке набережной',
    ...pic('embankment-night', 2400, 1019),
  },
  {
    id: '12',
    date: '27 июля',
    category: 'СМИ о нас',
    title: 'Площадь перед храмом назвали лучшим общественным пространством года',
    ...pic('temple-square', 2000, 1117),
  },
  {
    id: '13',
    date: '15 июля',
    category: 'СМИ о нас',
    title: 'Что увидят первые посетители: путеводитель по будущему маршруту',
    ...pic('temple-passage', 2400, 1611),
  },
];

/** «Читайте также» — six headlines from the article frame, text only */
export const RELATED: NewsItem[] = [
  { id: 'r1', date: '12 августа', category: 'Строительство',
    title: 'Возвращение к жизни: стартовала реставрация дома надзирателей' },
  { id: 'r2', date: '11 августа', category: 'Строительство',
    title: 'За фасадом XIX века: как укрепляют исторические стены «Крестов»' },
  { id: 'r3', date: '10 августа', category: 'СМИ о нас',
    title: 'Тайны под штукатуркой: что нашли реставраторы в доме надзирателей' },
  { id: 'r4', date: '9 августа', category: 'Интервью',
    title: 'От камеры к лекторию: как меняется внутреннее пространство здания' },
  { id: 'r5', date: '8 августа', category: 'Строительство',
    title: 'Инженерное сердце «Крестов»: новые коммуникации в старых стенах' },
  { id: 'r6', date: '7 августа', category: 'Строительство',
    title: 'Впереди главный корпус: «Кресты» готовят к полному открытию' },
];
