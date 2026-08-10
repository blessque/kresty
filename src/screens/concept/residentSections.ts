import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { RESIDENT_GROUPS, collectGroup, type ResidentGroup } from './residentGroups';
import { IconLight } from './iconLight';

/**
 * The resident sections below the map, and the scroll track that drives them.
 *
 * ROUND 16. One full viewport per group, scrolled normally — NO snapping. The
 * «Контакты» showcase this borrows its icons from is scroll-snapped, and that
 * snapping is load-bearing THERE (every presentation still frames identically)
 * and wrong HERE: this is a page you read.
 *
 * Everything that moves is a pure function of `scrollTop`: the background
 * colour, which icon is lit, where its light sits, how bright it is, and which
 * of the two renderers is allowed to run. There is no scroll-driven state, so
 * there is nothing to get out of sync — see `track()`.
 *
 * Section geometry is MEASURED off the DOM rather than computed from `100vh`.
 * A section whose resident list outgrows the viewport grows with it (the CSS
 * says `min-height`, not `height`), and a track built on the assumed height
 * would then drift a little further out of step with every section below it.
 */

/**
 * Where an icon's centre sits inside its section, as fractions of the section.
 *
 * This is the client's own layout, carried over from «Контакты»: divide the
 * frame into 4 columns × 3 rows and put the icon on the FIRST gridline of each
 * axis. It leaves the lower two thirds for the text, which the light then
 * spills across — which is the point of putting them in the same frame.
 */
const ICON_FX = 1 / 4;
const ICON_FY = 1 / 3;

/**
 * White breathing room between the map and the first section, as a fraction of
 * the viewport.
 *
 * MEASURED, not chosen for looks. Three things have to happen in order — the
 * map leaves, white is actually seen, then the colour turns — and the gap is
 * what buys room for the middle one. The map's canvas is OPAQUE and covers its
 * whole stage, so any crossfade that starts while the map is still on screen
 * happens behind it and is simply lost; the reader then meets an
 * already-coloured page the instant the map clears.
 *
 * With the blend band centred on the first section's top, the fade begins at
 * `top0 − viewH·(0.5 + BAND_VH/2)`. Requiring that to fall after the map has
 * gone (`scrollTop = stageH`) gives `gap > 0.5 + BAND_VH/2` = 0.8 viewports.
 * The same figure independently clears the light: section 0's icon enters the
 * frame at `top0 − viewH·(1 − ICON_FY)`, which at 0.8 also lands after the map.
 *
 * So one number satisfies both, and it is the smallest one that does.
 */
const GAP_VH = 0.8;

/**
 * The colour crossfade band, as a fraction of the viewport.
 *
 * The user's brief was explicit that the background is a PURE colour that
 * changes smoothly — not a gradient. So each section holds its exact hex across
 * almost all of its height and the blend happens only around the seam.
 *
 * The sample point is the viewport CENTRE, which is what makes the band the
 * right size: when a boundary sits at the centre the screen is exactly half
 * each section and the mix is exactly 50/50. Anywhere outside the band the
 * colour is that section's own value, unmixed.
 */
const BAND_VH = 0.6;

/** what the map and the gap sit on, and the colour the first section blends up from */
const LEAD_COLOR = '#ffffff';

export interface TrackState {
  /** CSS colour for the page background */
  bg: string;
  /** which group's icon is closest to the viewport centre */
  idx: number;
  /** that icon's centre, CSS px within the viewport */
  center: [number, number];
  /** 0…1 — the light's envelope; 0 exactly at a mask swap */
  opacity: number;
  /**
   * Where the live icon sits when its section is at rest, CSS px down the
   * viewport — i.e. `center[1]` at `scrollTop === tops[idx]`.
   *
   * This is the reference the light's cursor-parallax is baked against, so it
   * must use the section's OWN measured height: `res-section` is `min-height`,
   * and two of the seven outgrow the viewport (839 and 890 against 800), where
   * `viewH · ICON_FY` is wrong by up to 30 px.
   */
  restY: number;
  /**
   * Is the page currently dark enough that the chrome has to invert?
   *
   * The logo is authored `#123a5c` for the near-white map and disappears on a
   * deep section; white would in turn disappear against the white gap. So this
   * is derived from the background's own luminance rather than from "are we
   * past the map", which would flip it in the middle of the white gap.
   */
  dark: boolean;
}

export class ResidentSections {
  readonly light = new IconLight(RESIDENT_GROUPS.map((g) => g.icon));
  readonly bgEl = document.createElement('div');

  private sections: HTMLElement[] = [];
  private gap = document.createElement('div');
  /** measured section tops within the scroller, refreshed on resize */
  private tops: number[] = [];
  private heights: number[] = [];
  private mixSupported = true;

  constructor(screen: HTMLElement, scroller: HTMLElement) {
    this.bgEl.className = 'res-bg';
    this.bgEl.style.background = LEAD_COLOR;
    // BEHIND the scroller, and behind the light. The map's canvas is opaque and
    // covers the whole stage, so this is only ever seen through the gap and the
    // sections, which are themselves transparent.
    screen.prepend(this.bgEl);

    this.gap.className = 'res-gap';
    this.gap.style.setProperty('--gap-vh', String(GAP_VH));
    scroller.appendChild(this.gap);

    for (const g of RESIDENT_GROUPS) {
      const el = this.buildSection(g);
      this.sections.push(el);
      scroller.appendChild(el);
    }

    // the light canvas is viewport-pinned and composites with `screen`, so it
    // is a sibling of the scroller, never inside it
    screen.appendChild(this.light.canvas);

    // one probe, not one per frame. Two deep saturated colours lerped in sRGB
    // pass through a muddy neutral; oklab keeps the path clean, and the project
    // has already been caught once assuming a linear ratio is the ratio you see
    // (water round 11).
    this.mixSupported =
      typeof CSS !== 'undefined' &&
      CSS.supports?.('color', 'color-mix(in oklab, #000 50%, #fff)');
  }

  private buildSection(g: ResidentGroup): HTMLElement {
    const el = document.createElement('section');
    el.className = 'res-section';
    el.dataset.group = g.id;

    const rows = collectGroup(g)
      .map((e) => {
        const count = e.count > 1 ? `<span class="res-count">${e.count}</span>` : '';
        const label = escapeHtml(bindShortWords(e.label));
        const body = e.brand
          ? `<a class="res-link" href="${escapeHtml(e.brand.url)}" target="_blank" rel="noopener">${label}<span class="res-cta">${escapeHtml(e.brand.cta)}</span></a>`
          : `<span class="res-name">${label}</span>`;
        return `<li class="res-row${e.invented ? ' res-row--placeholder' : ''}">${body}${count}</li>`;
      })
      .join('');

    el.innerHTML =
      `<div class="res-body">` +
      `<h2 class="res-title">${escapeHtml(bindShortWords(g.title))}</h2>` +
      `<p class="res-lead">${escapeHtml(bindShortWords(g.lead))}</p>` +
      `<ul class="res-list">${rows}</ul>` +
      `</div>`;
    return el;
  }

  /** re-measure the section geometry; call on resize and after a font swap */
  measure() {
    this.tops = this.sections.map((el) => el.offsetTop);
    this.heights = this.sections.map((el) => el.offsetHeight);
  }

  /** where the first section starts, for deciding when to warm the light up */
  get firstTop(): number {
    if (!this.tops.length) this.measure();
    return this.tops[0] ?? Infinity;
  }

  /**
   * Everything the sections do, as a function of scroll position.
   *
   * `mapVisible` short-circuits the light: the map is above the sections and
   * the two renderers are never both wanted, so this is also what stops the
   * page ever paying for Three.js and the ray field in the same frame.
   */
  track(scrollTop: number, viewW: number, viewH: number, mapVisible: boolean): TrackState {
    if (!this.tops.length) this.measure();
    const n = this.tops.length;
    const sample = scrollTop + viewH / 2;
    const band = viewH * BAND_VH;

    // ---- background: pure everywhere except within `band` of a seam
    // -1 is the lead-in colour, i.e. the map and the gap
    let cur = -1;
    for (let i = 0; i < n; i++) if (sample >= this.tops[i]) cur = i;

    // Bands never overlap (BAND_VH < 1 section), so at most one of these can be
    // the active blend and the pair below fully describes the colour.
    let from = this.colorOf(cur);
    let to = from;
    let t = 0;
    const next = cur + 1;
    if (next < n && sample > this.tops[next] - band / 2) {
      to = this.colorOf(next);
      t = smoothstep(this.tops[next] - band / 2, this.tops[next] + band / 2, sample);
    } else if (cur >= 0 && sample < this.tops[cur] + band / 2) {
      from = this.colorOf(cur - 1);
      t = smoothstep(this.tops[cur] - band / 2, this.tops[cur] + band / 2, sample);
    }
    const bg = t <= 0 ? from : this.mix(from, to, t);
    // The chrome's own decision is taken on a NUMERIC mix even when the emitted
    // colour is a `color-mix()` string, which is unparseable — the two travel
    // slightly differently through the blend, and a luminance that is roughly
    // right is all a black-or-white choice needs.
    const dark = luminance(mixRgb(from, to, t)) < 0.55;

    // ---- the light: the icon nearest the viewport centre wins
    let idx = 0;
    let bestDist = Infinity;
    let bestY = 0;
    for (let i = 0; i < n; i++) {
      const y = this.tops[i] + this.heights[i] * ICON_FY - scrollTop;
      const d = Math.abs(y - viewH / 2);
      if (d < bestDist) {
        bestDist = d;
        idx = i;
        bestY = y;
      }
    }
    // the map is opaque and paints over this canvas anyway; suppressing it
    // outright is also what keeps the two renderers off the same frame. The
    // gap is sized so the icon never wants to be lit while the map is up, so
    // this gate never cuts a visible light — see GAP_VH.
    const opacity = mapVisible ? 0 : IconLight.envelope(bestY / viewH);

    return {
      bg,
      idx,
      center: [viewW * ICON_FX, bestY],
      opacity,
      dark,
      restY: (this.heights[idx] ?? viewH) * ICON_FY,
    };
  }

  private colorOf(i: number): string {
    return i < 0 ? LEAD_COLOR : RESIDENT_GROUPS[i].bg;
  }

  /** `t` = 0 gives `a`, 1 gives `b` */
  private mix(a: string, b: string, t: number): string {
    if (this.mixSupported) {
      return `color-mix(in oklab, ${b} ${(t * 100).toFixed(2)}%, ${a})`;
    }
    const [r, g, bl] = mixRgb(a, b, t);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  apply(s: TrackState) {
    this.bgEl.style.background = s.bg;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** component-wise sRGB mix of two `#rrggbb` strings */
function mixRgb(a: string, b: string, t: number): [number, number, number] {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const m = (sh: number) => {
    const ca = (pa >> sh) & 255;
    const cb = (pb >> sh) & 255;
    return Math.round(ca + (cb - ca) * t);
  };
  return [m(16), m(8), m(0)];
}

/** Rec. 709 relative luminance, 0…1, on the sRGB components as authored.
 *  A perceptual threshold for a two-way choice, not a photometric measurement. */
function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
