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

/** convergence point of the light, in stage px (center +40, +20 per Figma) */
export const CENTER_X = STAGE_W / 2 + 40;
export const CENTER_Y = STAGE_H / 2 + 20;

export interface NavLinkSpec {
  id: string;
  label: string;
  x: number; // stage px, element center
  y: number;
  rot: number; // deg
  route: 'concept' | null;
}

export const NAV_LINKS: NavLinkSpec[] = [
  { id: 'istoria', label: 'История', x: 565, y: 140, rot: 51.8, route: null },
  { id: 'kontseptsia', label: 'Концепция', x: 1040, y: 205, rot: -38.2, route: 'concept' },
  { id: 'arenda', label: 'Аренда', x: 505, y: 615, rot: -38.2, route: null },
  { id: 'kontakty', label: 'Контакты', x: 965, y: 655, rot: 51.8, route: null },
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
 * «Слайдер» slides — real client photos, paired by filename: `Na` = nadir
 * (top-down, inside the star mask), `Nb` = zenith (ground-up, full-bleed
 * background). Slides 1 and 3 share the sky background `main-1b+3b.png`.
 * Headlines from Figma frames slider01..04 (node 252:39).
 */
export interface SliderSlide {
  star: string;
  bg: string;
  headline: string;
}

export const SLIDER_SLIDES: SliderSlide[] = [
  {
    star: '/resources/main-1a.png',
    bg: '/resources/main-1b+3b.png',
    headline: 'Игровые площадки вместо закрытой территории',
  },
  {
    star: '/resources/main-2a.png',
    bg: '/resources/main-2b.png',
    headline: 'Объединение вместо заключения',
  },
  {
    star: '/resources/main-3a.png',
    bg: '/resources/main-1b+3b.png',
    headline: 'Открытые лекции вместо закрытых замков',
  },
  {
    star: '/resources/main-4a.png',
    bg: '/resources/main-4b.png',
    headline: 'Уютные кафе вместо темных коридоров',
  },
].map((s) => ({ ...s, star: encodeURI(s.star), bg: encodeURI(s.bg) }));

export function stageScale(): number {
  return Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
}
