import { T } from '../../styles/tokens.gen';

/**
 * The ink, the chrome and the grain — the three things besides the light and
 * the cross that follow `whiteness()` (see `MuseumScreen`). Split out of the
 * screen in round 34 to keep it under the file-size line; the logic is
 * unchanged. Every write is guarded on the string changing, so a still reader
 * writes no style at all.
 */
export class MuseumInk {
  private lastInk = '';
  private lastChrome = '';

  constructor(private el: HTMLElement) {}

  apply(white: number) {
    const ink = mixHex(INK_DARKFIELD, INK_LIGHTFIELD, white);
    if (ink !== this.lastInk) {
      this.lastInk = ink;
      this.el.style.setProperty('--mus-ink', ink);
    }

    // THE CHROME RUNS THE OTHER WAY TO THE INK. The wordmark and the slider
    // chevrons are the site's blue on a light field — that is the sitewide
    // "blue means interactive" rule and the four white pages all do it — but on
    // this page's dark fields blue on #081b5a is the one thing on screen with no
    // contrast. So they are white while the field is dark and become the link
    // blue as it turns white, which satisfies both: interactive everywhere it
    // can be read as interactive, legible everywhere else.
    const chrome = mixHex(INK_DARKFIELD, LINK, white);
    if (chrome !== this.lastChrome) {
      this.lastChrome = chrome;
      this.el.style.setProperty('--mus-chrome', chrome);
    }
    document.documentElement.style.setProperty('--grain-k', (1 - white).toFixed(3));
  }
}

/* The two ends of the ink ramp — on-dark main and on-light main, the same two
   the rest of the site switches between. Read from the token MODULE rather than
   the cascade: `getComputedStyle` at module scope returns '' in dev, because
   Vite injects CSS asynchronously. */
const INK_DARKFIELD = T.textOndarkMain;
const INK_LIGHTFIELD = T.textOnlightMain;
const LINK = T.link;

/**
 * Component-wise sRGB mix of two `#rrggbb` strings.
 *
 * sRGB rather than oklab, deliberately: `PageBackground` needs oklab because two
 * deep saturated colours lerped in sRGB pass through a muddy neutral, and this
 * ramp is white to near-black — an achromatic path with no hue to muddy, on
 * text, where a `color-mix()` string per frame would be parsed per frame.
 */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const m = (sh: number) => {
    const ca = (pa >> sh) & 255;
    const cb = (pb >> sh) & 255;
    return Math.round(ca + (cb - ca) * t);
  };
  return `rgb(${m(16)}, ${m(8)}, ${m(0)})`;
}
