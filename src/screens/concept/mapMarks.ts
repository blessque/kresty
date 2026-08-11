/**
 * The map's authored annotation layer — Figma 591:194, round 17.
 *
 * Round 16 shipped four building captions and let a solver place the river and
 * the two streets. The designer's frame replaces that with EIGHTEEN marks, and
 * almost none of them can be solved for: they name TENANTS rather than volumes
 * (three of them sit on one cross), several are turned a quarter turn to fit an
 * alley, two are white ink lying on a filled roof, and five carry an icon. Every
 * one of those is a judgement about the drawing, so every one is authored here.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 *
 * The Figma frame is a screenshot of this app with the marks drawn over it, so
 * the design is stated in screen pixels of one particular 1584×989 capture. A
 * pixel offset is worthless here — the fit changes with the window — so each
 * `at` is that offset divided by the site span, the same convention round 13
 * chose for the two cross captions and for the same reason.
 *
 * Converting the frame took one measurement. The screenshot was taken under
 * some plan-oblique lean, and the lean is `x' = x + sx·y, z' = z + sz·y`: it
 * fixes the ground plane and translates the plane at height h by exactly
 * h·(sx, sz). So displacing ONE roof of known height against a zero-lean render
 * calibrates the whole image. Patch-matching the two cross lanterns (h = 2.52)
 * gave (−45.6, −44.0) and (−48.3, −40.7) px independently, i.e. (−47, −42) to
 * within the ~3 px a centre estimate is good for, and every other anchor
 * followed from its own height with no further measurement.
 *
 * ---------------------------------------------------------------------------
 * ROUND 18: THE OFFSET IS MEASURED FROM THE FOOTPRINT, NOT FROM THE ROOF
 *
 * Round 17 measured each offset against the building's roof AS DRAWN IN THE
 * REFERENCE — i.e. against a roof already displaced by its own h·(sx, sz). That
 * reproduces the design exactly at the lean the screenshot was taken under, and
 * that is not a state anyone looks at. At rest the lean is zero, the walls
 * collapse, the drawn silhouette shrinks back to the plan — and the caption
 * keeps the whole gap. Every mark read too far out, by an amount proportional
 * to its building's height: ~47 px on the two crosses, ~2 px on the pier. The
 * client saw it immediately.
 *
 * So the offsets below are measured from the FOOTPRINT. The footprint is the
 * shear's fixed point, which makes it the only anchor for which "the design"
 * and "the resting composition" are the same statement — a roof is drawn in two
 * different places in those two frames, a footprint in one.
 *
 * The correction was one subtraction, `at − (47, 42)·h / (2.52 · 1145)`, and it
 * scales with h. That is what makes a single uniform rule safe here: the only
 * two marks that lie ON a roof rather than beside a building — «Паркинг»
 * (h = 0.43) and «Причал «Кресты»» (h = 0.09) — sit on the LOWEST volumes, so
 * they move 8 px and 2 px while the crosses move the full 47. No special case.
 *
 * The check that this is right: round 13's hand-authored `b02` x-offset was
 * 0.102, and the footprint reading re-derives it as 0.098 where the roof reading
 * gave 0.139. The corrected numbers land back on the value that was already
 * signed off; the roof reading never did.
 *
 * ---------------------------------------------------------------------------
 * TWO ANCHORS, AND WHY THE SECOND ONE IS FLAT
 *
 * `on` names the building whose ROOF the mark rides (`bbox.max.y`) — the offset
 * is measured from the footprint, but the anchor is still up on the roof, so the
 * mark travels with the volume it names. Restricted to a horizontal plane the
 * shear has no linear part left, so it is a pure translation: the mark slides
 * exactly as far as its roof and never skews, and travel proportional to height
 * is not implemented anywhere — it falls out of the anchor.
 *
 * A mark with no `on` is pinned to the site plan at y = 0 instead, offset from
 * the model's own centre. That plane is the shear's fixed point, so those marks
 * do not move with the lean at all — which is what a plan annotation should do.
 * The streets and the metro live there: round 15 straightened both roads clean
 * out of the frame, and the design answers that by lettering them in the margin
 * band above and below the plate, in the lighter tint, the way a map names a
 * feature that runs off the sheet. That retires the street solver rather than
 * re-tuning it — see TUNING_LOG map round 17.
 */

import { asset } from '../../shared/assetUrl';

/** where an icon sits relative to the text */
export type IconAt = 'above' | 'before';

export interface MarkIcon {
  /** file in `public/resources`, without the extension */
  src: string;
  at: IconAt;
  /**
   * Natural size, authored rather than measured.
   *
   * Set as the `<img>` attributes so the box is correct on the very first
   * frame: a mark is positioned from its own measured extent, and an icon that
   * reports 0×0 until the SVG lands would place its whole mark wrong until then.
   */
  w: number;
  h: number;
}

export interface Mark {
  /** the building whose roof this rides; absent = pinned to the site plan */
  on?: string;
  /** one element per line — the block is a column, never a wrapped paragraph */
  lines?: string[];
  /** offset from the anchor in fractions of the site span; +x right, +z down */
  at: [number, number];
  /**
   * Which edge of the mark's box that offset addresses. Centre by default.
   *
   * The two cross captions are a left-aligned and a right-aligned block in the
   * design, mirrored so neither runs at its own cross; pinning the aligned edge
   * is what keeps that true when our text measures a pixel or two off Figma's.
   */
  align?: 'left' | 'right';
  /**
   * Quarter turn (or the parking roof's slight list), in degrees. Clockwise, so
   * 90 reads downward and −90 reads upward.
   *
   * IT TURNS THE TEXT, NEVER THE ICON. The icons were exported from Figma with
   * their placement angle already in the artwork — `parking.svg` is a 35×35 box
   * whose mask is a 32×32 chip rotated 4.47° — so turning the container too
   * would double it.
   */
  turn?: number;
  icon?: MarkIcon;
  /**
   * `muted` is the margin tint for features that run off the sheet; `white` is
   * for a mark lying on a filled roof, where the design also steps the weight up
   * to Chromius Medium. The default is the plan ink.
   */
  ink?: 'muted' | 'white';
}

/**
 * Marks welded to a building's roof.
 *
 * Several buildings carry more than one, which is the whole reason this is a
 * list and not the `Record<id, …>` round 13 used: `b02` alone is lettered three
 * times (the museum above, the hotel below, the lecture hall on its annexe),
 * and `b06` three more.
 *
 * The text is authored, NOT read from `buildingsInfo`. Round 13 deliberately
 * took the first line from `infoFor(id).name` so a rename could not leave the
 * map disagreeing with the drawer — but that invariant assumed one caption per
 * volume naming that volume. These name tenants, so there is nothing left to
 * keep in step; `b06` is one volume with three restaurants on it.
 */
export const BUILDING_MARKS: Mark[] = [
  // The west cross, lettered three times down one left edge — the museum and
  // the hotel share x 584 in the frame, which is what makes them read as one
  // column rather than two loose captions.
  { on: 'b02', lines: ['Музей Крестов'], at: [0.040, -0.067], align: 'left' },
  {
    on: 'b02',
    lines: ['Западный Крест', 'Отель Cosmos 4*'],
    at: [0.040, 0.055],
    align: 'left',
  },
  /** the annexe on the cross's lower-left; geometrically part of `b02` */
  { on: 'b02', lines: ['Лекторий'], at: [-0.162, 0.197], align: 'left' },

  // The east cross takes the mirror choice — a RIGHT-aligned block in its
  // lower-left quadrant, which is what keeps it clear of the SPA block.
  {
    on: 'b01',
    lines: ['Восточный Крест', 'Отель Cosmos 5*'],
    at: [-0.066, 0.054],
    align: 'right',
  },
  { on: 'b01', lines: ['SPA-Комплекс'], at: [0.199, -0.127], turn: 90 },

  // The office alley: two blocks lettered down their right flank, one turned to
  // fit the gap rather than shrink to it.
  { on: 'b08', lines: ['Офисы А1'], at: [0.069, -0.005], turn: 90 },
  { on: 'b11', lines: ['Офисы А2'], at: [0.069, -0.005], turn: 90 },
  { on: 'b09', lines: ['Офисы B1'], at: [-0.039, 0.066], align: 'left' },

  // The gastronomy block: two tenants read UPWARD in the alley to its left, the
  // hall reads level under its own footprint.
  { on: 'b06', lines: ['Mates Bistro'], at: [-0.085, -0.050], turn: -90 },
  { on: 'b06', lines: ['Pho Bo'], at: [-0.085, 0.037], turn: -90 },
  { on: 'b06', lines: ['Фуд-холл'], at: [-0.063, 0.098], align: 'left' },

  /** white ink ON the parking deck, which is why it also carries the P chip */
  {
    on: 'b15',
    lines: ['Паркинг'],
    at: [-0.004, 0.010],
    turn: -4.47,
    ink: 'white',
    icon: { src: 'parking', at: 'above', w: 35, h: 35 },
  },

  /**
   * «Бар «Ротонда»» is TYPE ON A CURVE in the design, following the drum it
   * names. There is no text-path here and no reason to build one for a single
   * string: the designer's own export already has the curve in its outlines, so
   * it ships as artwork with no text at all.
   */
  { on: 'b04', at: [0.014, 0.040], icon: { src: 'rotonda', at: 'above', w: 98, h: 52 } },

  /** the pier is a slab in the river, so its mark lies on it in white */
  {
    on: 'b18',
    lines: ['Причал «Кресты»'],
    at: [0.056, 0.006],
    ink: 'white',
    icon: { src: 'prichal', at: 'before', w: 32, h: 32 },
  },
];

/**
 * Marks pinned to the site plan at y = 0, offset from the model's centre.
 *
 * The two entrances point INTO the site from outside it, and the streets and
 * the metro name things that are off the sheet entirely — none of which belongs
 * to a volume, and none of which should slide when the plan leans.
 */
export const SITE_MARKS: Mark[] = [
  {
    lines: ['Главный вход'],
    at: [0.004, -0.362],
    align: 'left',
    icon: { src: 'arrow-down', at: 'before', w: 30, h: 33 },
  },
  {
    lines: ['Вход', 'с набережной'],
    at: [-0.080, 0.376],
    align: 'left',
    icon: { src: 'arrow-up', at: 'before', w: 30, h: 33 },
  },
  { lines: ['ул. Комсомола'], at: [0.503, -0.397], align: 'left', ink: 'muted' },
  { lines: ['Арсенальная наб.'], at: [0.163, 0.423], align: 'left', ink: 'muted' },
  {
    lines: ['м. Площадь Ленина'],
    at: [-0.601, -0.398],
    align: 'left',
    ink: 'muted',
    icon: { src: 'metro-group', at: 'above', w: 83, h: 27 },
  },
];

/**
 * Build a mark's element.
 *
 * The icon is a sibling of the text COLUMN, not of the lines, so that a
 * `before` icon centres on the FIRST line and the second line still starts at
 * the text's own left edge — which is how the design sets «Вход / с
 * набережной». Centring the icon on the whole block instead would drop it half
 * a line, and that is visible at two lines.
 */
export function createMark(mark: Mark): HTMLElement {
  const el = document.createElement('div');
  el.className = 'map-mark';
  if (mark.align) el.classList.add(`map-mark--${mark.align}`);
  if (mark.ink) el.classList.add(`map-mark--${mark.ink}`);
  if (mark.icon) el.classList.add(`map-mark--icon-${mark.icon.at}`);

  if (mark.icon) {
    const img = document.createElement('img');
    img.className = 'map-mark__icon';
    img.src = asset(`/resources/${mark.icon.src}.svg`);
    img.width = mark.icon.w;
    img.height = mark.icon.h;
    img.alt = '';
    // the `before` offset that centres the icon on line one, as a length CSS
    // can subtract a line box from
    el.style.setProperty('--icon-h', `${mark.icon.h}px`);
    el.appendChild(img);
  }

  if (mark.lines?.length) {
    const text = document.createElement('div');
    text.className = 'map-mark__text';
    if (mark.turn) text.style.rotate = `${mark.turn}deg`;
    for (const line of mark.lines) {
      const row = document.createElement('div');
      row.textContent = line;
      text.appendChild(row);
    }
    el.appendChild(text);
  }
  return el;
}

/** the CSS translate that puts `align`'s edge of the box on the anchor */
export function alignShift(align: Mark['align']): string {
  if (align === 'left') return '0%';
  if (align === 'right') return '-100%';
  return '-50%';
}
