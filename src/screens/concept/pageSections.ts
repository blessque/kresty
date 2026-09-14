import { T } from '../../styles/tokens.gen';

/**
 * The five editorial sections below the map on «О Крестах».
 *
 * ROUND 19. This replaces round 16's `residentGroups.ts`, whose whole thesis
 * was that nothing here is authored — membership fell out of the map's own
 * `buildingsInfo.ts` so the section list and the building drawer could not
 * drift apart. That was a good argument for a resident DIRECTORY and is
 * irrelevant to five authored editorial sections, so `collectGroup()`,
 * `LABEL_GROUP` and the merge-by-label logic are all gone.
 *
 * What survives is the file's SHAPE — one table, one exported array — so the
 * designer's pass is a text edit rather than a code change.
 *
 * The copy is the client's own (`references/texts.txt`): each `h2` is that
 * file's «Внутри —» line verbatim, and `paras` are the body paragraphs it
 * already carries. The main screen states the same five topics in one line each
 * beginning «Свобода»; this is where they are unwrapped.
 *
 * THE PALETTE AND THE LIGHT ARE COUPLED — carried over from round 16 because
 * the designer will ask again. The light composites with `mix-blend-mode:
 * screen`, i.e. `1 − (1−a)(1−b)`, which can only LIGHTEN. On a bright field
 * there is no headroom left to lighten into: the god-rays flatten and the
 * colour shifts toward white. Making the light survive a bright background is
 * not a palette change, it is the eclipse composite mode — a different look
 * entirely. So these stay deep.
 */

/**
 * One picture. `w`/`h` are the file's INTRINSIC pixels and they are required,
 * not decorative: they are written to the `<img>` so the box is committed
 * before decode. Without that a late image resolves its own height, shifts
 * every section below it and desyncs the measured scroll track mid-scroll —
 * `sectionRun.ts` carries the same warning about its own figure.
 *
 * They also replace the global `aspect-ratio: 3/2`, which the round-26
 * photography breaks in both directions: four of the renders are portrait (down
 * to 0.67) and three are panoramas (up to 4.80).
 */
export interface MediaItem {
  src: string;
  alt: string;
  w: number;
  h: number;
}

/**
 * A section's body is an ORDERED LIST OF BLOCKS (round 26), which is what turns
 * the client's rule — "two photos may only sit one under another if a paragraph
 * separates them; otherwise they collapse into a slider" — from something the
 * renderer has to police into something the DATA CANNOT EXPRESS WRONGLY.
 *
 * Adjacent pictures are literally the same block. A `media` block with two or
 * more items renders as a slider; one with a single item renders as a figure.
 * Two pictures can therefore only stack if a `p` block lies between them, and
 * `assertBlocks()` below rejects two consecutive `media` blocks outright.
 *
 * The previous shape was `paras: string[]` plus one optional trailing `image`,
 * which could express neither several pictures nor a picture between two
 * paragraphs. A parallel `images[]` array would not have helped: the problem is
 * ORDERING, and two arrays cannot state it.
 */
export type SectionBlock =
  | { kind: 'p'; text: string }
  | { kind: 'media'; items: MediaItem[] };

export interface PageSection {
  id: string;
  /** file in public/resources — a solid white silhouette on transparent */
  icon: string;
  h2: string;
  /** prose and pictures in the order they are read */
  body: SectionBlock[];
  /** page background while this section owns the frame — a semantic token */
  bg: string;
}

/** shorthand so the table below reads as copy rather than as scaffolding */
const p = (text: string): SectionBlock => ({ kind: 'p', text });
const media = (...items: MediaItem[]): SectionBlock => ({ kind: 'media', items });
const pic = (src: string, alt: string, w: number, h: number): MediaItem => ({
  src: `/resources/${src}.webp`,
  alt,
  w,
  h,
});

/**
 * ROUND 20: one value per section, straight from the designer's semantic
 * tokens. The round-19 `bg`/`bgDeep` pair and `?pal=figma` are gone — they were
 * a stand-in for exactly this export, and keeping three palettes would be the
 * drift this file warns about. The shipped round-19 values stay reachable as
 * `?pal=old` for the designer's A/B; delete `LEGACY_BG` on sign-off.
 */
export function palette(): 'new' | 'old' {
  return new URLSearchParams(location.search).get('pal') === 'old' ? 'old' : 'new';
}

/** round 19's lightness-clamped set, for comparison only */
const LEGACY_BG: Record<string, string> = {
  hotel: '#460061',
  spa: '#5e0326',
  restaurant: '#56250b',
  museum: '#04225d',
  office: '#015a4b',
};

export function sectionBg(s: PageSection): string {
  return palette() === 'old' ? (LEGACY_BG[s.id] ?? s.bg) : s.bg;
}

/**
 * ROUND 19 COLOURS — sampled from the designer's own section frames
 * (`658:532` · `658:539` · `662:593` · `662:644`, decoded off the rendered
 * pixels) rather than reused from round 16.
 *
 * Figma draws FOUR bands for five topics, and the file is explicitly a dirty
 * visual reference, so the fifth is derived rather than invented: the four
 * sampled hues run violet → crimson → blue → teal, and «Ресторанная зона»
 * takes the warm amber that gap leaves.
 *
 * TWO LIGHTNESSES, BECAUSE THE PALETTE AND THE LIGHT ARE IN GENUINE TENSION.
 * The sampled violet measures 39.2 % lightness and the crimson 25.3 %, against
 * the 15–22 % band round 16 measured as this light's ceiling. Put on screen,
 * the violet does exactly what that measurement predicts: the god-rays stop
 * reading and the icon flattens into a silhouette, because `screen` is
 * `1 − (1−a)(1−b)` and a bright field leaves nothing to lighten into.
 *
 * So `bg` is the designer's own value, `bgDeep` is that value with the hue and
 * saturation UNTOUCHED and only the lightness pulled to 19 %. «Офисы» is
 * already at 17.8 % and is therefore identical in both. Neither is chosen here:
 * `?pal=figma` shows the sampled set, the default shows the deep one, and the
 * designer picks with both on screen.
 */
export const PAGE_SECTIONS: PageSection[] = [
  {
    id: 'hotel',
    icon: 'Bed-640.svg',
    h2: 'Остановиться в роскошном отеле в исторических зданиях-крестах',
    bg: T.bgHotels, // ink-1000  #031721   7.1% lightness
    body: [
      p('Для гостей и жителей города есть возможность заселиться в отели категории 4 и 5 звезд. В знаменитых зданиях можно провести время с семьей или заселиться в командировке.'),
      // two pictures with no prose between them — so they are ONE block and
      // render as a slider. That is the rule, expressed as data.
      media(
        pic('room-3', 'Номер в историческом здании', 2400, 1611),
        pic('room-4', 'Номер с видом на Неву', 1715, 2000),
      ),
      p('Из номеров открываются виды на Неву, окрестности и обновленную территорию открытого городского пространства.'),
      media(pic('cross-wing', 'Крыло креста — галереи и лестницы атриума', 1920, 2400)),
      p('Атриумы каждого здания — уютное пространство лобби с выходом к ресторану с авторской кухней и к музею.'),
      media(pic('atrium-floor', 'Атриум отеля', 2400, 1600)),
    ],
  },
  {
    id: 'spa',
    icon: 'SPA-640.svg',
    h2: 'Позаботиться о душе и теле в СПА-комплексе с бассейном',
    bg: T.bgWellness, // amethyst  #783c96  41.2% — above the light's ceiling
    body: [
      p('В отреставрированных исторических залах будет работать комплекс для расслабления и восстановления.'),
      media(
        pic('spa-interior', 'СПА-комплекс', 2400, 1340),
        pic('pool', 'Бассейн СПА-комплекса', 2400, 1600),
      ),
      p('Для тех, кто остался в отеле, — отдельные часы работы комплекса. Для гостей, кто заглянул на день и хочет замедлиться, комплекс работает в другие часы.'),
      p('Тишина, вода, приглушенный свет — все, чтобы сделать заботу о себе частью привычного городского маршрута.'),
    ],
  },
  {
    id: 'restaurant',
    icon: 'Restaurant-640.svg',
    h2: 'Пробовать авторскую кухню и новые прочтения знаковых блюд',
    bg: T.bgFood, // garnet    #78141e  27.5% — marginal
    body: [
      p('Панорамный ресторан с видом на Неву — гастрономическое путешествие в мир вкусов в авторских блюдах шеф-повара.'),
      media(
        pic('restaurant-litera-o', 'Ресторан в литере О', 2400, 1611),
        pic('restaurant-embankment', 'Ресторан с видом на Арсенальную набережную', 2400, 1600),
        pic('restaurant-level-1', 'Ресторан, первый уровень', 2400, 1611),
      ),
      p('Гастрономический кластер с камерными форматами кофеен, стрит-фуда нового поколения и уютными винными барами.'),
      media(pic('table', 'Ресторан с видом на Неву', 2400, 1600)),
      p('Разнообразие форматов удовлетворит каждого: от высокой кухни для особого случая до обедов по пути через город.'),
    ],
  },
  {
    id: 'museum',
    // the window grille is the project's own north-star motif, and round 16
    // already picked it for culture over `Culture-640.svg`
    icon: 'Window-640.svg',
    h2: 'Открывать новые темы для размышлений в музейном пространстве и на экскурсионных маршрутах',
    bg: T.bgCulture, // navy      #081b5a  19.2%
    body: [
      p('Музейное пространство в одном из крыльев зданий-крестов погружает в содержание понятия «свободы» — эволюцию представления о ней в России и мире.'),
      media(
        pic('temple', 'Храм на территории комплекса', 2400, 1611),
        pic('temple-from-mice', 'Вид на храм со стороны конгресс-центра', 2400, 1611),
        pic('temple-square', 'Площадь перед храмом', 2000, 1117),
        pic('temple-passage', 'Демонтированный переход между храмом и крестом', 2400, 1611),
      ),
      p('На территории разработаны экскурсионные маршруты, которые расскажут о пространстве в истории — что здесь было, чем особенная архитектура, что прогрессивного для своего времени показало это место.'),
      // a panorama: full block width at its own ratio, never cropped to 3:2
      media(pic('embankment-elevation', 'Развертка со стороны Арсенальной набережной', 2400, 720)),
    ],
  },
  {
    id: 'office',
    icon: 'Office-640.svg',
    h2: 'Арендовать офисы и коворкинг для работы',
    bg: T.bgOffices, // emerald   #004b3c  14.7%
    body: [
      p('Новый городской офисный кластер на Выборгской стороне, с удобной инфраструктурой и приятной атмосферой.'),
      media(
        pic('mice-3', 'Конгресс-центр', 2400, 1351),
        pic('mice-1', 'Переговорная', 1611, 2400),
        pic('mice-2', 'Рабочее пространство', 1792, 2400),
      ),
      p('В исторических зданиях комплекса оборудованы пространства для офисов разного формата для аренды.'),
      media(pic('forum', 'Офисное пространство', 2400, 1600)),
    ],
  },
];

/**
 * Two `media` blocks in a row would put two pictures one under another with no
 * prose between them, which is exactly what the longread rule forbids — they
 * should have been one block, and therefore one slider. Checked at module load
 * in DEV so the failure is a console error at the moment the table is edited,
 * rather than a layout someone notices later.
 */
if (import.meta.env.DEV) {
  for (const s of PAGE_SECTIONS) {
    s.body.forEach((b, i) => {
      const next = s.body[i + 1];
      if (b.kind === 'media' && next?.kind === 'media') {
        console.error(
          `[kresty] section "${s.id}": two media blocks in a row at ${i}. ` +
            `Pictures with no paragraph between them must be ONE block, so they ` +
            `collapse into a slider — see SectionBlock.`,
        );
      }
    });
  }
}

/**
 * The contact form's field, and the darkest point of the run (Figma 727:26).
 *
 * NOT `T.bgDarkMain`, deliberately: that resolves to ink-1000, which is ALSO
 * `bg-hotels`, so the form would become the exact colour of the FIRST section
 * with three sections between them — the run would read as a return rather
 * than a descent. Kept as a project exemption (`--field-form` in tokens.css)
 * with the question filed for the designer.
 */
export const FORM_BG = '#050b1d';

/**
 * ROUND 24 MOVED `DAWN_MID` and `MAIN_BG` to `page/seamColors.ts`, with their
 * reasoning. They were section-run constants when «О Крестах» was the only page
 * that seamed into the main screen; four more pages do now and none of them has
 * sections, so the colours belong to the seam rather than to the run that
 * happened to own them first. Re-exported here so existing readers are unmoved.
 */
export { MAIN_BG, DAWN_MID } from '../../page/seamColors';
