/**
 * The page's background colour, as a pure function of scroll position.
 *
 * ROUND 19, recovered near-verbatim from round 16's `residentSections.track()`.
 * The mechanism was right and the reasoning below is its own; what changed is
 * the input — round 16 read the section table directly, welding "what colours
 * the page" to "what is lit". This page has stops with no light at all (the
 * contact form, the handoff into the main screen), so the two are separate
 * lists now. That decoupling is what makes the ending expressible.
 *
 * The brief was explicit that the background is a PURE colour that changes
 * smoothly — NOT a gradient. So each stop holds its exact hex across almost all
 * of its height and the blend happens only around the seam.
 */

/**
 * The colour crossfade band, as a fraction of the viewport.
 *
 * The sample point is the viewport CENTRE, which is what makes the band the
 * right size: when a boundary sits at the centre the screen is exactly half
 * each section and the mix is exactly 50/50. Anywhere outside the band the
 * colour is that stop's own value, unmixed.
 */
export const BAND_VH = 0.6;

/** what the map and the gap sit on, and the colour the first section blends up from */
export const LEAD_COLOR = '#ffffff';

export interface ColorStop {
  /** scroll position within the scroller at which this colour takes over */
  top: number;
  color: string;
  /** band width in viewports; defaults to BAND_VH. Wider = slower crossing. */
  band?: number;
}

export class PageBackground {
  readonly el = document.createElement('div');

  private stops: ColorStop[] = [];
  private mixSupported = true;
  private last = '';
  /** true when the emitted colour is one stop's exact hex, no blend running */
  pure = true;
  /** index of the stop currently owning the frame; −1 is the lead-in white */
  index = -1;

  constructor(screen: HTMLElement) {
    this.el.className = 'page-bg';
    this.el.style.background = LEAD_COLOR;
    // BEHIND the scroller and behind the light. The map's canvas is opaque and
    // covers its whole stage, so this is only ever seen through the gap and the
    // sections, which are themselves transparent.
    screen.prepend(this.el);

    // One probe, not one per frame. Two deep saturated colours lerped in sRGB
    // pass through a muddy neutral; oklab keeps the path clean, and this project
    // has already been caught once assuming a linear ratio is the ratio you see
    // (water round 11).
    this.mixSupported =
      typeof CSS !== 'undefined' &&
      CSS.supports?.('color', 'color-mix(in oklab, #000 50%, #fff)');
  }

  setStops(stops: ColorStop[]) {
    this.stops = stops;
  }

  /**
   * Compute and apply the colour for a scroll position.
   *
   * Returns the emitted CSS colour. `pure` and `index` are updated as a side
   * effect — the handoff reads `pure` to guarantee it only ever fires while the
   * page is showing one exact colour and no blend is mid-flight.
   */
  update(scrollTop: number, viewH: number): string {
    const n = this.stops.length;
    if (!n) return this.last;
    const sample = scrollTop + viewH / 2;

    // -1 is the lead-in colour, i.e. the map and the gap
    let cur = -1;
    for (let i = 0; i < n; i++) if (sample >= this.stops[i].top) cur = i;

    // Bands never overlap (each is < 1 section), so at most one of these can be
    // the active blend and the pair below fully describes the colour.
    let from = this.colorOf(cur);
    let to = from;
    let t = 0;
    const next = cur + 1;
    if (next < n) {
      const band = viewH * (this.stops[next].band ?? BAND_VH);
      if (sample > this.stops[next].top - band / 2) {
        to = this.colorOf(next);
        t = smoothstep(this.stops[next].top - band / 2, this.stops[next].top + band / 2, sample);
      }
    }
    if (t === 0 && cur >= 0) {
      const band = viewH * (this.stops[cur].band ?? BAND_VH);
      if (sample < this.stops[cur].top + band / 2) {
        from = this.colorOf(cur - 1);
        to = this.colorOf(cur);
        t = smoothstep(this.stops[cur].top - band / 2, this.stops[cur].top + band / 2, sample);
      }
    }

    this.index = cur;
    this.pure = t <= 0 || t >= 1;
    const bg = t <= 0 ? from : t >= 1 ? to : this.mix(from, to, t);
    if (bg !== this.last) {
      this.last = bg;
      this.el.style.background = bg;
    }
    return bg;
  }

  private colorOf(i: number): string {
    return i < 0 ? LEAD_COLOR : this.stops[i].color;
  }

  /** `t` = 0 gives `a`, 1 gives `b` */
  private mix(a: string, b: string, t: number): string {
    if (this.mixSupported) {
      return `color-mix(in oklab, ${b} ${(t * 100).toFixed(2)}%, ${a})`;
    }
    const [r, g, bl] = mixRgb(a, b, t);
    return `rgb(${r}, ${g}, ${bl})`;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** component-wise sRGB mix of two `#rrggbb` strings — the `color-mix` fallback */
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
