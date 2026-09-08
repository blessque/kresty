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
 * ROUND 11: five links, not four (Figma frame 720:57).
 *
 * The five labels sit on ONE circle about the convergence point at EXACTLY 72°
 * apart. Measured off that frame's own pixels, the five gaps came out
 * 71.3 / 70.6 / 72.2 / 73.3 / 72.6° — 360/5 to within the width of a glyph.
 * Round 7's four links were the same idea at 90°, so this generalises the rule
 * rather than replacing it.
 *
 * The positions are DERIVED, not transcribed. The Figma file is a dirty visual
 * reference (no components, no auto-layout), and its per-label centres scatter
 * over r = 256…287 for a reason that is not design: a longer word has a longer
 * bounding box, and the centre of that box sits further out. Transcribing the
 * five radii would bake a text-length artefact into the layout as though it
 * were a decision — and it would drift the moment a label is re-worded. One
 * radius and one angle step reproduce the frame to within ~12 px everywhere.
 */
const NAV_R = 272; // stage px — mean of the five measured label radii
const NAV_A0 = -125.43; // deg, screen convention (y down); best fit over all five
const NAV_STEP = 360 / 5;

/**
 * Glyph axis = the radius, wrapped into (−90, 90] so no label reads upside
 * down. This is the same convention round 7 used for the four diagonal links —
 * «История» at −135.85° carried `rot: 45.29`, i.e. the angle plus a half turn.
 */
function glyphRot(deg: number): number {
  return ((((deg + 90) % 180) + 180) % 180) - 90;
}

function navSpec(
  i: number,
  id: string,
  label: string,
  route: NavLinkSpec['route'],
): NavLinkSpec {
  const a = NAV_A0 + i * NAV_STEP;
  const r = (a * Math.PI) / 180;
  return {
    id,
    label,
    x: Math.round(CENTER_X + NAV_R * Math.cos(r)),
    y: Math.round(CENTER_Y + NAV_R * Math.sin(r)),
    rot: Number(glyphRot(a).toFixed(2)),
    route,
  };
}

/**
 * Order is the circle's, starting at the upper-left label and running
 * clockwise. Ids are unchanged where the link survived round 10 — `kontseptsia`
 * and `kontakty` still carry the `#concept` / `#contacts` routes, so
 * scripts/interact-test.mjs keeps driving `#nav-kontseptsia`.
 *
 * «Музей», «Аренда» and «События» have no page yet, so they route nowhere. The
 * labels are Figma's own: «События» (Events), not «Новости».
 */
export const NAV_LINKS: NavLinkSpec[] = [
  navSpec(0, 'muzey', 'Музей', null),
  navSpec(1, 'kontseptsia', 'О «Крестах»', 'concept'),
  navSpec(2, 'kontakty', 'Контакты', 'contacts'),
  navSpec(3, 'arenda', 'Аренда', null),
  navSpec(4, 'sobytia', 'События', null),
];

/**
 * The descriptor under the wordmark (Figma 844:125 — 275×42 at x 32, y 92,
 * i.e. two lines starting 20 px below the 40 px-tall logo box).
 */
export const LOGO_DESCRIPTOR = 'Открытое городское пространство';

/** Top-right call to action (Figma 840:40). */
export const CONTACT_CTA = 'Связаться';

/*
 * ROUND 11 KILLED THE NEWS BLOCK on the main screen. `NEWS_ITEMS` and
 * `NewsTicker.ts` are deleted, not commented out — news now lives on its own
 * «События» page, and a second copy here would be the thing that drifts.
 */

export const SHOWREEL_IMAGES = [
  '/resources/skies.webp',
  '/resources/atrium-roof.webp',
  '/resources/forum.webp',
  '/resources/pool.webp',
].map((p) => asset(encodeURI(p)));

/**
 * «Слайдер» slides — one full-bleed photo per slide, each HARD-BOUND to the
 * headline it illustrates. Do not reorder or re-pair: the photo is the
 * headline's illustration, not decoration.
 *
 * ROUND 11 replaced the copy wholesale. The strategist's frame
 * (`references/texts.txt`) is a creative constraint, not a list of sentences:
 * the word «Свобода» is STATIC and only the rest of the line changes. So every
 * headline here begins with it, and the seven are the site's seven topics in
 * that file's order — the same seven the «О Крестах» page unwraps at length
 * under a different h2.
 *
 * `concept-plan.webp` is deliberately absent: it is a nav-hover image only
 * (Figma 340:594), never a slide.
 */
export interface SliderSlide {
  photo: string;
  headline: string;
}

export const SLIDER_SLIDES: SliderSlide[] = [
  {
    // TODO(photos): awaiting a real Причал (pier) photograph in new-photos/.
    // `skies.webp` is a stand-in — it is the only water-and-sky frame we have.
    photo: '/resources/skies.webp',
    headline: 'Свобода строить новые маршруты по воде',
  },
  {
    // TODO(photos): awaiting a real culture/events photograph in new-photos/.
    photo: '/resources/kids-playground.webp',
    headline: 'Свобода строить культурные планы на выходные',
  },
  {
    photo: '/resources/hotel.webp',
    headline: 'Свобода остановиться там, где хочется',
  },
  {
    photo: '/resources/pool.webp',
    headline: 'Свобода заботиться о душе и теле',
  },
  {
    photo: '/resources/table.webp',
    headline: 'Свобода пробовать жизнь на вкус',
  },
  {
    photo: '/resources/atrium-roof.webp',
    headline: 'Свобода открывать для себя новые смыслы',
  },
  {
    photo: '/resources/forum.webp',
    headline: 'Свобода работать в месте культурного наследия',
  },
].map((s) => ({ ...s, photo: asset(encodeURI(s.photo)) }));

export function stageScale(): number {
  return Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
}
