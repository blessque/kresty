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

export interface PageSection {
  id: string;
  /** file in public/resources — a solid white silhouette on transparent */
  icon: string;
  h2: string;
  paras: string[];
  /** page background while this section owns the frame — a semantic token */
  bg: string;
  image?: string;
  imageAlt?: string;
}

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
    paras: [
      'Для гостей и жителей города есть возможность заселиться в отели категории 4 и 5 звезд. В знаменитых зданиях можно провести время с семьей или заселиться в командировке.',
      'Из номеров открываются виды на Неву, окрестности и обновленную территорию открытого городского пространства.',
      'Атриумы каждого здания — уютное пространство лобби с выходом к ресторану с авторской кухней и к музею.',
    ],
    bg: T.bgHotels,  // ink-1000  #031721   7.1% lightness

    image: '/resources/hotel.webp',
    imageAlt: 'Атриум отеля',
  },
  {
    id: 'spa',
    icon: 'SPA-640.svg',
    h2: 'Позаботиться о душе и теле в СПА-комплексе с бассейном',
    paras: [
      'В отреставрированных исторических залах будет работать комплекс для расслабления и восстановления.',
      'Для тех, кто остался в отеле, — отдельные часы работы комплекса. Для гостей, кто заглянул на день и хочет замедлиться, комплекс работает в другие часы.',
      'Тишина, вода, приглушенный свет — все, чтобы сделать заботу о себе частью привычного городского маршрута.',
    ],
    bg: T.bgWellness,  // amethyst  #783c96  41.2% — above the light's ceiling

    image: '/resources/pool.webp',
    imageAlt: 'Бассейн СПА-комплекса',
  },
  {
    id: 'restaurant',
    icon: 'Restaurant-640.svg',
    h2: 'Пробовать авторскую кухню и новые прочтения знаковых блюд',
    paras: [
      'Панорамный ресторан с видом на Неву — гастрономическое путешествие в мир вкусов в авторских блюдах шеф-повара.',
      'Гастрономический кластер с камерными форматами кофеен, стрит-фуда нового поколения и уютными винными барами.',
      'Разнообразие форматов удовлетворит каждого: от высокой кухни для особого случая до обедов по пути через город.',
    ],
    bg: T.bgFood,  // garnet    #78141e  27.5% — marginal

    image: '/resources/table.webp',
    imageAlt: 'Ресторан с видом на Неву',
  },
  {
    id: 'museum',
    // the window grille is the project's own north-star motif, and round 16
    // already picked it for culture over `Culture-640.svg`
    icon: 'Window-640.svg',
    h2: 'Открывать новые темы для размышлений в музейном пространстве и на экскурсионных маршрутах',
    paras: [
      'Музейное пространство в одном из крыльев зданий-крестов погружает в содержание понятия «свободы» — эволюцию представления о ней в России и мире.',
      'На территории разработаны экскурсионные маршруты, которые расскажут о пространстве в истории — что здесь было, чем особенная архитектура, что прогрессивного для своего времени показало это место.',
    ],
    bg: T.bgCulture,  // navy      #081b5a  19.2%

    image: '/resources/atrium-roof.webp',
    imageAlt: 'Historic atrium roof',
  },
  {
    id: 'office',
    icon: 'Office-640.svg',
    h2: 'Арендовать офисы и коворкинг для работы',
    paras: [
      'Новый городской офисный кластер на Выборгской стороне, с удобной инфраструктурой и приятной атмосферой.',
      'В исторических зданиях комплекса оборудованы пространства для офисов разного формата для аренды.',
    ],
    bg: T.bgOffices,  // emerald   #004b3c  14.7%

    image: '/resources/forum.webp',
    imageAlt: 'Офисное пространство',
  },
];

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
 * The two stops that carry the page out of the form and into the main screen's
 * own flat blue.
 *
 * TWO stops, not one wide band, and that is the decision: the leap from a ~7 %
 * lightness form to a 62 % lightness brand blue is far more travel than any
 * seam round 16 had, and widening a single band to cover it flattens the whole
 * thing into the mush a gradient would have been. A chosen mid-tone lets two
 * ordinary bands run back to back, and oklab through a mid-tone you picked
 * beats oklab through the midpoint it would have computed.
 */
export const DAWN_MID = '#2b4a7a';

/**
 * `#screen-main`'s resting field. It and `--color-field-main` now BOTH derive
 * from the single `blue` primitive through one generator run, so they can no
 * longer drift apart — which is what the round-19 seam depends on. Verified by
 * `npm run tokens:check`.
 */
export const MAIN_BG = T.blue;
