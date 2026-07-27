/**
 * Source of truth for the main-screen composition — the 1440×800 Figma frame
 * (file xtd3isfSuz1gnWxTClA2Vs, node 58:410). The stage is scaled to fit the
 * viewport; the flat background hides the letterbox.
 *
 * The rotation values orient the *glyphs* along the rays; the actual beam
 * angles are measured from rendered DOM rects at runtime (Nav.ts).
 */
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
  route: 'concept' | null;
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
  { id: 'kontakty', label: 'Контакты', x: 937, y: 644, rot: 45.29, route: null },
];

export const NEWS_HEADLINES = [
  'Проведена реконструкция дома для надзирателей',
  'Открыт причал «Кресты» на Арсенальной набережной',
  'Началась реставрация церкви Александра Невского',
  'Музей истории «Крестов» откроется в 2027 году',
];

export const SHOWREEL_IMAGES = [
  '/resources/main-1a.png',
  '/resources/main-2a.png',
  '/resources/main-3a.png',
  '/resources/main-4a.png',
].map((p) => encodeURI(p));

/**
 * «Слайдер» slides — one full-bleed nadir photo per slide (round 7: the star
 * mask is gone; the four distinct top-down shots each match their headline).
 * Headlines from Figma frames slider01..04 (node 252:39).
 */
export interface SliderSlide {
  photo: string;
  headline: string;
}

export const SLIDER_SLIDES: SliderSlide[] = [
  {
    photo: '/resources/main-1a.png',
    headline: 'Игровые площадки вместо закрытой территории',
  },
  {
    photo: '/resources/main-2a.png',
    headline: 'Объединение вместо заключения',
  },
  {
    photo: '/resources/main-3a.png',
    headline: 'Открытые лекции вместо закрытых замков',
  },
  {
    photo: '/resources/main-4a.png',
    headline: 'Уютные кафе вместо темных коридоров',
  },
].map((s) => ({ ...s, photo: encodeURI(s.photo) }));

export function stageScale(): number {
  return Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
}
