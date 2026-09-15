import type { MediaItem } from '../../page/mediaSlider';
import type { Category } from './newsData';

/**
 * The article at `#news/1` (Figma `854:185`).
 *
 * ROUND 27: A BLOCK LIST, NOT A SCHEMA. This was one object with fifteen named
 * fields — `lead`, `h2`, `body2`, `h3`, `body3`, `gallery`, `listLead`, `list`,
 * `quote`, `closing`, `closingImage` — rendered in exactly that order by
 * exactly one hard-coded template. It could describe one article shaped one way.
 * A second article with two quotes, or a picture between its first two
 * paragraphs, was not something the data could say.
 *
 * The longread solved this in round 26 and the article simply never got the fix.
 * The shape below is that one, widened to the kinds an article needs: ORDER IS
 * THE DATA. A `media` block with two or more items renders as a slider, one with
 * a single item renders as a figure, and two pictures can therefore only stack
 * if something is written between them — a rule the renderer no longer has to
 * police because the list cannot express the violation.
 */
export type ArticleBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'list'; lead?: string; items: string[] }
  | { kind: 'quote'; text: string; by: string }
  | { kind: 'media'; items: MediaItem[] };

export interface Article {
  date: string;
  category: Category;
  title: string;
  body: ArticleBlock[];
}

/** shorthands, so the copy below reads as copy rather than as scaffolding */
const p = (text: string): ArticleBlock => ({ kind: 'p', text });
const h2 = (text: string): ArticleBlock => ({ kind: 'h2', text });
const h3 = (text: string): ArticleBlock => ({ kind: 'h3', text });
const media = (...items: MediaItem[]): ArticleBlock => ({ kind: 'media', items });
const pic = (src: string, alt: string, w: number, h: number): MediaItem => ({
  src: `/resources/${src}.webp`,
  alt,
  w,
  h,
});

export const ARTICLE: Article = {
  date: '12 августа',
  category: 'Строительство',
  title: 'Завершена реконструкция дома надзирателей',
  body: [
    p(
      'Дом надзирателей был возведён в конце XIX века по проекту архитектора Антония ' +
        'Томишко в составе знаменитого тюремного ансамбля на Арсенальной набережной. Здание ' +
        'использовалось как административно-жилое: здесь размещались квартиры старших ' +
        'служащих тюрьмы, канцелярия и комнаты для дежурных смен. После закрытия «Крестов» ' +
        'в 2017 году дом надзирателей, как и другие постройки комплекса, перешёл в ведение ' +
        'городских структур, однако долгое время оставался законсервированным.',
    ),
    // a picture between two paragraphs — the thing the old shape could not say
    media(pic('main-entrance', 'Главный вход после реставрации', 2400, 1600)),
    p(
      'Реконструкция началась в 2023 году. За два года специалисты укрепили фундамент ' +
        'и несущие стены, восстановили исторические фасады с характерными элементами ' +
        'кирпичного стиля, заменили перекрытия и инженерные коммуникации.',
    ),
    h2('Что происходило на площадке'),
    p(
      'Работы шли последовательно, корпус за корпусом. Сначала стены укрепляли снаружи, ' +
        'чтобы кладка XIX века приняла новую нагрузку, и только затем приступали ' +
        'к интерьерам.',
    ),
    // two adjacent pictures ARE one block, and one block with two items IS a
    // slider — the client's rule, made unexpressible-wrongly
    media(
      pic('temple-passage', 'Проход к храму', 2400, 1611),
      pic('temple-from-mice', 'Храм со стороны корпусов', 2400, 1611),
      pic('overview', 'Общий вид комплекса', 2400, 1611),
    ),
    {
      kind: 'quote',
      text: 'Восстановили исторические фасады с характерными элементами кирпичного стиля',
      by: 'Василий Петров',
    },
    h3('Что откроется первым'),
    {
      kind: 'list',
      lead:
        'Теперь в здании разместится экспозиция «Тюрьма и власть», рассказывающая ' +
        'о повседневной жизни дореволюционной пенитенциарной системы:',
      items: [
        'Планируется также открыть лекторий, сувенирную лавку и кафе',
        'Полное открытие музейного комплекса «Кресты» для посетителей ожидается в следующем году',
        'На время работ будет предусмотрен проход через главный вход',
      ],
    },
    p(
      'Дом надзирателей был возведён в конце XIX века по проекту архитектора Антония ' +
        'Томишко в составе знаменитого тюремного ансамбля на Арсенальной набережной. Здание ' +
        'использовалось как административно-жилое: здесь размещались квартиры старших ' +
        'служащих тюрьмы, канцелярия и комнаты для дежурных смен.',
    ),
    media(pic('embankment-night', 'Набережная ночью', 2400, 1019)),
  ],
};

/**
 * Dev-only: two `media` blocks in a row would render as two sliders with nothing
 * between them, which is precisely the composition the block list exists to
 * prevent. Silent in production, loud in development.
 */
export function assertArticle(a: Article) {
  if (!import.meta.env.DEV) return;
  a.body.forEach((b, i) => {
    const next = a.body[i + 1];
    if (b.kind === 'media' && next?.kind === 'media') {
      console.error(
        `articleData: blocks ${i} and ${i + 1} are both media — adjacent pictures are ` +
          `ONE media block (which renders as a slider), not two.`,
      );
    }
  });
}
