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
 * The copy is the client's own — `references/texts.txt` until round 30, the
 * docx `references/О Крестах.docx` since; each `lead` and paragraph verbatim. The main screen states the same five topics in one line each
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
 * ROUND 27: `MediaItem` MOVED TO `page/mediaSlider.ts` and is re-exported here.
 * It was defined in this file and imported by the shared slider, which made
 * `src/page/` — furniture every page uses — depend on one screen's data module.
 * With the news article as a second consumer that stopped being a curiosity: the
 * type belongs to the component that renders it.
 */
import type { MediaItem } from '../../page/mediaSlider';
export type { MediaItem };

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
  /**
   * The section's opening statement, set as the 72px `.loud`.
   *
   * ROUND 29.2 RENAMED THIS FROM `h2`, and the rename is the point rather than
   * tidying: every one of these is a PROPOSITION — «Остановиться в роскошном
   * отеле…», «Позаботиться о душе и теле…» — a sentence beginning with a verb,
   * not a title. Calling the field `h2` is what led to it being emitted as one,
   * which made the site's H2 mean 72px here and 40px on «Аренда». It renders as
   * a `<p>`; see `.loud` in styles/pages.css.
   */
  lead: string;
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
  // ROUND 30: the copy is the client's `references/О Крестах.docx` (2026-09-23),
  // verbatim. Its `------` rules mark where pictures go.
  //
  // THREE SLIDERS ON THIS PAGE, NO MORE, AND NEVER TWO IN ONE SCREEN (round
  // 30.1, the client's rule). Rooms, restaurants, excursion routes — one in the
  // first, third and fourth section, so a whole section of prose always sits
  // between two strips. Every other picture is a single figure. Guarded by
  // `npm run probe:sliders`.
  {
    id: 'hotel',
    icon: 'Bed-640.svg',
    lead: 'Остановиться в роскошном отеле в исторических зданиях-крестах',
    bg: T.bgHotels, // ink-1000  #031721   7.1% lightness
    body: [
      p('В исторических зданиях-крестах откроются отели категорий 4 и 5 звёзд. Уникальная возможность остановиться внутри одного из самых узнаваемых архитектурных ансамблей Петербурга — с современным уровнем комфорта и совершенно особой атмосферой.'),
      p('Днём — город, встречи, гастрономия, культура. Вечером — отдых в пространстве, история которого насчитывает больше века.'),
      // pictures with no prose between them are ONE block and render as a
      // slider. That is the rule, expressed as data.
      media(
        pic('room-3', 'Номер в историческом здании', 2400, 1611),
        pic('room-4', 'Номер со сводчатым потолком', 1715, 2000),
        pic('hotel', 'Вход в отель', 1600, 1280),
      ),
      p('Из номеров открываются виды на Неву, окрестности и обновленную территорию открытого культурного кластера.'),
      media(pic('embankment-night', '«Кресты» со стороны Невы зимней ночью', 2400, 1019)),
      p('В центре каждого исторического корпуса, под сводчатым куполом, появится лобби. Когда-то отсюда расходились коридоры закрытого мира. Теперь это новая точка притяжения — узнаваемая архитектура, открытая для всех постояльцев отелей.'),
      media(pic('atrium-roof', 'Купол над лобби в центре креста', 2400, 1600)),
    ],
  },
  {
    id: 'spa',
    icon: 'SPA-640.svg',
    lead: 'Позаботиться о душе и теле в СПА-комплексе с бассейном',
    bg: T.bgWellness, // amethyst  #783c96  41.2% — above the light's ceiling
    body: [
      p('Рядом с пятизвёздочным отелем появится SPA-комплекс — место для отдыха, восстановления и тишины.'),
      media(pic('spa-interior', 'СПА-комплекс с бассейном', 2400, 1340)),
      p('Вода, приглушённый свет и спокойный ритм создадут атмосферу, в которой забота о себе естественно становится частью городского маршрута.'),
    ],
  },
  {
    id: 'restaurant',
    icon: 'Restaurant-640.svg',
    lead: 'Пробовать авторскую кухню и новые прочтения знаковых блюд',
    bg: T.bgFood, // garnet    #78141e  27.5% — marginal
    body: [
      p('Панорамный ресторан с видом на Неву — гастрономическое путешествие в мир вкусов в авторских блюдах шеф-повара.'),
      media(
        pic('restaurant-litera-o', 'Ресторан в литере О', 2400, 1611),
        pic('restaurant-level-1', 'Ресторан, первый уровень', 2400, 1611),
        pic('restaurant-embankment', 'Ресторан с видом на Арсенальную набережную', 2400, 1600),
      ),
      p('Гастрономический кластер с камерными форматами кофеен, стрит-фуда нового поколения и уютными винными барами.'),
      media(pic('main-entrance', 'Кафе у главного входа', 2400, 1600)),
      p('Для особого вечера, деловой встречи или обеда по пути через город — каждый найдёт свой формат.'),
    ],
  },
  {
    id: 'museum',
    // the window grille is the project's own north-star motif, and round 16
    // already picked it for culture over `Culture-640.svg`
    icon: 'Window-640.svg',
    lead: 'Посмотреть иначе',
    bg: T.bgCulture, // navy      #081b5a  19.2%
    body: [
      p('Музей «Крестов» рассказывает историю через две центральные линии — человека и систему. Архитектура, правила, устройство тюрьмы и подлинные предметы прошлого здесь встречаются с историями людей, их повседневностью, отношениями и попытками сохранить себя.'),
      // «подлинные предметы прошлого» — the museum's own exhibit photograph
      media(pic('museum-cell-wall', 'Стена камеры с экспозиционными панелями', 1280, 826)),
      p('Экскурсионные маршруты позволят увидеть «Кресты» с разных сторон — через события, людей и детали, которые обычно остаются за кадром.'),
      media(
        pic('temple', 'Храм на территории комплекса', 2400, 1611),
        pic('temple-from-mice', 'Вид на храм со стороны конгресс-центра', 2400, 1611),
        pic('temple-square', 'Площадь перед храмом', 2000, 1117),
        pic('temple-passage', 'Демонтированный переход между храмом и крестом', 2400, 1611),
      ),
      p('А ещё на территории кластера появится музей под открытым небом. Но о нём — позже.'),
    ],
  },
  {
    id: 'office',
    icon: 'Office-640.svg',
    lead: 'Работать в истории',
    bg: T.bgOffices, // emerald   #004b3c  14.7%
    body: [
      p('В исторических зданиях «Крестов» появятся офисы и коворкинг для команд разного формата.'),
      media(pic('mice-3', 'Конгресс-центр', 2400, 1351)),
      p('Городская инфраструктура, архитектура с характером, вид на Неву и всё необходимое для комфортной работы — в одном из самых необычных культурных кластеров России.'),
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
