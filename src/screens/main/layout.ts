/**
 * Source of truth for the main-screen composition — the 1440×800 Figma frame
 * (file xtd3isfSuz1gnWxTClA2Vs, node 58:410). The stage is scaled to fit the
 * viewport; the flat background hides the letterbox.
 *
 * The rotation values orient the *glyphs* along the rays; the actual beam
 * angles are measured from rendered DOM rects at runtime (Nav.ts).
 */
import { asset } from '../../shared/assetUrl';

export const STAGE_W = 1440;
export const STAGE_H = 800;

/**
 * Convergence point of the light — the EXACT stage center (round 7 / Figma
 * node 257:116). The stage is scale-to-fit centered in the viewport, so this
 * puts the light at the exact screen center on any device.
 */
export const CENTER_X = STAGE_W / 2;
export const CENTER_Y = STAGE_H / 2;

export interface NavLinkSpec {
  id: string;
  label: string;
  x: number; // stage px, element center
  y: number;
  rot: number; // deg
  route: 'concept' | 'contacts' | null;
}

/**
 * Nav links re-centered around the light (Figma node 306:113): centers sit on
 * the ±45° diagonals from the stage center, so the measured bisector beams
 * form an exactly upright cross.
 */
export const NAV_LINKS: NavLinkSpec[] = [
  { id: 'istoria', label: 'История', x: 480, y: 167, rot: 45.29, route: null },
  { id: 'kontseptsia', label: 'Концепция', x: 955, y: 175, rot: -44.71, route: 'concept' },
  { id: 'arenda', label: 'Аренда', x: 465, y: 645, rot: -44.71, route: null },
  // TEMPORARY: «Контакты» hosts the icon-showcase page used to shoot the
  // presentation stills. Not a designed screen — see screens/contacts/.
  { id: 'kontakty', label: 'Контакты', x: 937, y: 644, rot: 45.29, route: 'contacts' },
];

/**
 * News ticker items (Figma node 338:48 + the loose headlines at 349:715..717).
 * The block is three rows — date, headline, «Все новости» — and the date row
 * swaps together with its headline. Dates ascend; the KVS purchase keeps the
 * one date the mockup supplied, the rest are placeholder 2026.
 */
export interface NewsItem {
  date: string;
  text: string;
}

export const NEWS_ITEMS: NewsItem[] = [
  { date: '1 ноября 2025', text: 'Застройщик KVS выкупил территорию бывшей тюрьмы «Кресты»' },
  { date: '12 февраля 2026', text: 'Застройщик начал работы по демонтажу аварийных конструкций' },
  { date: '28 апреля 2026', text: 'Прошла презентация концепции отельного комплекса Cosmos' },
  { date: '16 июля 2026', text: 'Подписаны последние акты для начала строительства' },
];

export const SHOWREEL_IMAGES = [
  '/resources/skies.webp',
  '/resources/atrium-roof.webp',
  '/resources/forum.webp',
  '/resources/pool.webp',
].map((p) => asset(encodeURI(p)));

/**
 * «Слайдер» slides — one full-bleed photo per slide. Round 8: the client's
 * final renders, each HARD-BOUND to the headline it was framed for (Figma
 * section 366:92, slide frames 306:152 · 340:81 · 340:250 · 340:162 · 340:210 ·
 * 340:231 · 342:653 · 342:677, in that canvas order). Do not reorder or
 * re-pair — the photo is the headline's illustration, not decoration.
 *
 * `concept-plan.webp` is deliberately absent: it is the «Концепция» nav-hover
 * image only (Figma 340:594), never a slide.
 */
export interface SliderSlide {
  photo: string;
  headline: string;
}

export const SLIDER_SLIDES: SliderSlide[] = [
  {
    photo: '/resources/skies.webp',
    headline: 'Парковые зоны и веранды вместо колючей проволоки',
  },
  {
    photo: '/resources/atrium-roof.webp',
    headline: 'Пространство для объединения вместо заключения',
  },
  {
    photo: '/resources/atrium-floor.webp',
    headline: 'Место встречи вместо точки наблюдения',
  },
  {
    photo: '/resources/kids-playground.webp',
    headline: 'Детские площадки вместо тюремных заграждений',
  },
  {
    photo: '/resources/forum.webp',
    headline: 'Открытые лекции вместо темных подвалов',
  },
  {
    photo: '/resources/table.webp',
    headline: 'Уютные кафе вместо холодных стен',
  },
  {
    photo: '/resources/glass-roof.webp',
    headline: 'Атмосфера сотрудничества вместо принуждения',
  },
  {
    photo: '/resources/pool.webp',
    headline: 'Свобода быть собой и заботиться о душе и теле',
  },
].map((s) => ({ ...s, photo: asset(encodeURI(s.photo)) }));

export function stageScale(): number {
  return Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
}
