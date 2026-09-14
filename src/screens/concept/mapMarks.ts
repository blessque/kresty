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

/**
 * ---------------------------------------------------------------------------
 * ROUND 26: TWO REGISTERS, AND THE TIER DECIDES BOTH THINGS AT ONCE
 *
 * Figma 1120:30 splits the annotation into two tiers that differ in typeface,
 * size, colour, case and tracking — and, the client's own emphasis, in whether
 * they MOVE:
 *
 *   accent  Chromius Medium 20/1.2, navy, sentence case, icon above.
 *           Names a destination («Отведать авторскую кухню»). RIDES THE ROOF.
 *   plan    ALS Span Bold 12/1.2, muted violet-blue, UPPERCASE, 0.25em tracking.
 *           Names a thing that is there («Котельная», «ул. Комсомола»).
 *           WELDED TO THE FOOTPRINT — it does not move with the lean at all.
 *
 * `tier` is ONE field because those are not two decisions. "Only the Chromius
 * texts move with the roofs" is the rule as the client stated it, so the
 * typeface and the anchor height are the same choice wearing two hats; two
 * independent fields could disagree, and the first time they did it would look
 * like a rendering bug rather than a table typo.
 *
 * Rounds 17 and 18 had this half-built already and did not know it: `on` meant
 * both "which building" and "rides the roof", which is fine while every
 * building caption is a tenant name. The moment a building caption is a
 * HISTORICAL name — «Ледник», «Котельная» — the two meanings come apart, and the
 * old code would have floated both of them off their own walls.
 */

/**
 * Where an icon sits relative to the text.
 *
 * `below` is round 26's: the two entrance marks carry an ARROW, and an arrow
 * belongs on the side it points at. «Главный вход» points down into the site
 * from the top margin and «Вход с набережной» points up into it from the
 * bottom, so the same relationship puts one icon under its words and the other
 * over them.
 */
export type IconAt = 'above' | 'below' | 'before';

/**
 * Which register a mark belongs to. See the note above — this picks the
 * typeface AND the anchor height, and `mapLabels.ts` reads it for the second.
 */
export type MarkTier = 'accent' | 'plan';

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
  /**
   * `false` renders the file's own colours; the default RE-INKS it to the
   * mark's own colour by masking.
   *
   * ROUND 26 NEEDED THIS THE MOMENT THE FIELD TURNED LIGHT. Every zone icon in
   * `public/resources` is `fill="white"` — they were drawn for round 12's
   * «Контакты» showcase, which is a black field — so dropped onto the new plate
   * as `<img>` they render white on near-white and simply are not there. It is
   * not a visible bug either; it looks like an icon that failed to load.
   *
   * Masking rather than recolouring the files means the icon takes `currentColor`
   * and therefore follows its TIER: an accent icon is navy because its caption
   * is, and a `way` icon is blue because its caption is. One artwork set, both
   * registers, and a future ink change moves them together.
   *
   * `metro-group` opts out: the SPb metro logo is genuinely four-tone, and a
   * mask would flatten a real piece of identity into a silhouette.
   */
  tint?: false;
}

export interface Mark {
  /**
   * Which register — and therefore whether this mark moves. See `MarkTier`.
   *
   * An `accent` mark anchors on its building's ROOF and travels with it; a
   * `plan` mark anchors at grade and is welded there, whether or not it names a
   * building.
   */
  tier: MarkTier;
  /**
   * The building this mark belongs to; absent = pinned to the site plan.
   *
   * Since round 26 this means only "which building" — the anchor HEIGHT comes
   * from `tier`, so a `plan` mark may name a volume without floating off it.
   */
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
   * An ink OVERRIDE. The default is the tier's own — navy for accent, the muted
   * violet-blue for plan — and almost every mark takes it.
   *
   * `way` is the wayfinding tier: the two entrances and the parking, which the
   * frame sets in `--ref-blue`. Sampling the render is what found this, and the
   * value is not a new colour at all — it is the main screen's own field, which
   * means round 25's site-wide rule («blue means interactive») already covers
   * it. The marks in blue are the ones that tell you where to go in.
   *
   * NOTE what is NOT in this tier, because it is the thing you would guess
   * wrong: «Причал «Кресты»» and «м. Площадь Ленина» carry icons and name
   * destinations, and both are measured at the plain plan ink. Having an icon is
   * not the rule; being a way IN to the site is.
   */
  ink?: 'way';
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
/**
 * ---------------------------------------------------------------------------
 * ROUND 26: WHERE THESE NUMBERS COME FROM, AND WHICH ONES TO TRUST
 *
 * `?parts` prints the scale and every footprint, so this is reproducible rather
 * than remembered. At the 1440 frame the plate measures 1143×718 and **one unit
 * of `at` is 893.2 px** — derived two independent ways that agree to 0.08%: from
 * the camera directly, and by solving three marks on `b02` for the linear map.
 * The site origin lands on the plate's own centre, (571.5, 359).
 *
 * The designer's frame IS the 1440 plate almost exactly (its plate is 1142 ×
 * 717.5), so a frame coordinate converts to an offset by subtracting the plate
 * origin (149, 392) and dividing by 893.2. That is how every site mark and both
 * cross captions below were set, and those are the trustworthy ones: they are
 * measured against the PLATE, which the collage did not rearrange.
 *
 * THE BUILDING MARKS ARE WEAKER, and the reason is structural rather than
 * sloppy. The frame is a collage in which buildings were moved apart — the two
 * crosses by 165px — so a caption's position in it is stated relative to a plan
 * that does not exist here. Round 26 moves the crosses to match and leaves the
 * rest, so wherever the design's gap was made BY the spread, there is no gap to
 * put a caption in. Those are placed by the client's own rule instead — a 16px
 * gap from the footprint, measured from the typography — and the three that
 * still cannot clear their neighbours are marked.
 *
 * A cross is the one place the 16px rule cannot be applied to a bounding box:
 * `b01`/`b02` are plus-shaped, so their AABB is 354×354 of which the four
 * corners are empty, and "16 from the footprint" there means 16 from an ARM.
 * Those four captions keep the frame's own relative placement.
 */
export const BUILDING_MARKS: Mark[] = [
  // ── the west cross ────────────────────────────────────────────────────────
  // Three accent blocks around it, mirrored about its own centre: the museum
  // reads back at the cross from the left, the hotel forward from the right.
  {
    tier: 'accent',
    on: 'b02',
    lines: ['Музей Кресты'],
    at: [-0.2532, -0.0301],
    align: 'right',
    icon: { src: 'Culture-640', at: 'above', w: 36, h: 36 },
  },
  {
    tier: 'accent',
    on: 'b02',
    // TODO(copy): the client asked for the hotels to lose their star ratings and
    // be "more aesthetic"; both lines here are assembled from their own approved
    // copy in references/texts.txt («Остановиться в роскошном отеле в
    // исторических зданиях-крестах») rather than invented, but the phrasing
    // itself is a proposal awaiting a verdict.
    // THREE lines, not two, and it is a collision fix rather than a taste call:
    // set as «Остановиться / в историческом отеле» this block measures 224px and
    // runs into «Отведать авторскую кухню» at x 486. The frame breaks its own
    // accent captions this short for the same reason — «Офисы / для вашего /
    // бизнеса» is three lines of one short phrase.
    lines: ['Остановиться', 'в историческом', 'отеле'],
    at: [0.0313, 0.075],
    align: 'left',
    icon: { src: 'Bed-640', at: 'above', w: 36, h: 36 },
  },
  {
    tier: 'accent',
    on: 'b02',
    // The client's own re-phrasing, and it is the one that sets the register for
    // this whole tier: infinitive verb phrases, matching references/texts.txt's
    // «Остановиться / Позаботиться / Пробовать / Открывать / Арендовать».
    //
    // TODO(verify): the frame puts the spa on the WEST cross, while
    // buildingsInfo lists the SPA-комплекс among b01's residents (east). One of
    // the two is wrong and the drawer would contradict the map. Flagged, not
    // silently reconciled.
    lines: ['Позаботиться', 'о теле и душе'],
    at: [-0.1739, 0.2319],
    icon: { src: 'SPA-640', at: 'above', w: 36, h: 36 },
  },
  { tier: 'plan', on: 'b02', lines: ['Западный', 'крест'], at: [-0.2684, 0.0684] },

  // ── the east cross ────────────────────────────────────────────────────────
  {
    tier: 'accent',
    on: 'b01',
    lines: ['Остановиться в отеле', 'с видом на Неву'], // TODO(copy) — see above
    at: [0.2263, -0.1078],
    align: 'left',
    icon: { src: 'Bed-640', at: 'above', w: 36, h: 36 },
  },
  { tier: 'plan', on: 'b01', lines: ['Восточный', 'крест'], at: [0.2263, 0.0661], align: 'left' },

  // ── the rest of the site ──────────────────────────────────────────────────
  // TODO(round 26 stage 8): every offset below the crosses is PROVISIONAL.
  // The frame is a collage — each building is a mask over its own copy of a
  // screenshot, several of them moved and two scaled non-uniformly — so it
  // states the composition, not the geometry. Only the four cross-adjacent
  // blocks above could be derived from it directly, because the cross cutout is
  // unambiguous and used twice at identical size. The rest get measured in the
  // live app AFTER the buildings move, against the footprint (round 18's rule).
  {
    tier: 'accent',
    on: 'b08',
    lines: ['Офисы', 'для вашего', 'бизнеса'],
    at: [-0.0931, -0.1146],
    icon: { src: 'Office-640', at: 'above', w: 36, h: 36 },
  },
  {
    tier: 'accent',
    on: 'b06',
    lines: ['Отведать', 'авторскую кухню'],
    at: [-0.0527, 0.1059],
    icon: { src: 'Restaurant-640', at: 'above', w: 36, h: 36 },
  },
  {
    tier: 'accent',
    on: 'b06',
    lines: ['Выпить кофе', 'и поработать'],
    at: [0.0592, 0.4306],
    icon: { src: 'Cup-640', at: 'above', w: 36, h: 36 },
  },

  /** TODO(verify): the domed church is b00 and certain; the SHORT form is what
   *  the map carries, the full one stays in the drawer. */
  { tier: 'plan', on: 'b00', lines: ['Церковь', 'св. Александра Невского'], at: [0, 0.0844] },

  /** b12 is «the chimneyed volume on the Комсомола row» — a boiler house, which
   *  is why the historical name lands here and not by a guess. Set reading
   *  downward to fit the alley, exactly as round 17's office marks did. */
  { tier: 'plan', on: 'b12', lines: ['Котельная'], at: [0.0551, 0], turn: 90 },

  /** TODO(verify): «Ледник» is a new name with no entry in buildingsInfo. b16 is
   *  the smallest real volume (59 tris, 1.07×1.38) and the frame letters this
   *  against its smallest mask (30×23), which is the match — but it is a
   *  reading, and the render is what settles it. */
  { tier: 'plan', on: 'b16', lines: ['Ледник'], at: [-0.0336, 0.0705] },

  /** The parking deck. It is no longer white type lying ON the roof — the frame
   *  sets it in the wayfinding blue beside the ₽ chip, so the `turn: -4.47` that
   *  matched the deck's own list goes with it. */
  {
    tier: 'plan',
    on: 'b15',
    lines: ['Парковка'],
    at: [0, 0.1332],
    ink: 'way',
    icon: { src: 'parking', at: 'before', w: 24, h: 24 },
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
  // The two entrances, and the only two marks the frame sets in the wayfinding
  // blue. The arrow sits ABOVE the words now rather than beside them — it points
  // into the site across the plate's edge, so it wants the vertical axis.
  {
    tier: 'plan',
    lines: ['Главный вход'],
    at: [-0.0409, -0.4113],
    ink: 'way',
    icon: { src: 'arrow-down', at: 'below', w: 24, h: 24 },
  },
  {
    tier: 'plan',
    lines: ['Вход', 'с набережной'],
    at: [-0.065, 0.4187],
    ink: 'way',
    icon: { src: 'arrow-up', at: 'above', w: 24, h: 24 },
  },

  /**
   * EACH STREET IS LETTERED TWICE, left and right of the entrance it flanks.
   *
   * That is not a duplicate to be de-duplicated: a map names a long feature
   * wherever the reader's eye lands on it, and both of these run the full width
   * of the sheet. The frame does it for both streets, and the second instance is
   * what stops «Главный вход» from reading as an interruption in a single label.
   */
  { tier: 'plan', lines: ['ул. Комсомола'], at: [0.281, -0.4355], align: 'left' },
  { tier: 'plan', lines: ['ул. Комсомола'], at: [-0.2183, -0.4355], align: 'right' },
  { tier: 'plan', lines: ['Арсенальная наб.'], at: [0.2978, 0.4355], align: 'left' },
  { tier: 'plan', lines: ['Арсенальная наб.'], at: [-0.318, 0.4355], align: 'right' },

  {
    tier: 'plan',
    lines: ['м. Площадь Ленина'],
    at: [-0.6857, -0.4404],
    align: 'left',
    // the only icon that keeps its own colours — the SPb metro mark is four-tone
    // identity, not a glyph. See MarkIcon.tint.
    icon: { src: 'metro-group', at: 'above', w: 83, h: 27, tint: false },
  },

  /**
   * The pier left the 3D model this round — it is flat white artwork on the
   * river band now (stage 6), so its caption is a SITE mark rather than a
   * building one. It was `on: 'b18'` in white ink lying on the slab; both the
   * anchor and the ink were properties of a volume that no longer renders.
   */
  {
    tier: 'plan',
    lines: ['Причал «Кресты»'],
    at: [0.2233, 0.4685],
    icon: { src: 'prichal', at: 'above', w: 24, h: 24 },
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
  // the register — typeface, size, case, tracking and ink all hang off this one
  // class, so the CSS says what the tier IS in one place
  el.classList.add(`map-mark--${mark.tier}`);
  if (mark.align) el.classList.add(`map-mark--${mark.align}`);
  if (mark.ink) el.classList.add(`map-mark--${mark.ink}`);
  if (mark.icon) el.classList.add(`map-mark--icon-${mark.icon.at}`);

  if (mark.icon) {
    const { src, w, h, tint } = mark.icon;
    const url = asset(`/resources/${src}.svg`);
    // Either way the box is authored, not measured: a mark positions itself from
    // its own extent, so an icon that reports 0×0 until the SVG lands would
    // place the whole mark wrong until then.
    let node: HTMLElement;
    if (tint === false) {
      const img = document.createElement('img');
      img.src = url;
      img.width = w;
      img.height = h;
      img.alt = '';
      node = img;
    } else {
      // a masked box filled with `currentColor` — see MarkIcon.tint
      node = document.createElement('span');
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      node.style.setProperty('--icon-src', `url("${url}")`);
    }
    node.className = 'map-mark__icon';
    // the `before` offset that centres the icon on line one, as a length CSS
    // can subtract a line box from
    el.style.setProperty('--icon-h', `${h}px`);
    el.appendChild(node);
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
