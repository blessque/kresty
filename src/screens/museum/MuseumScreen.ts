import { ContentScreen } from '../../page/ContentScreen';
import { buildPageHead } from '../../page/pageHead';
import { getPerfTier } from '../../shared/performanceTier';
import { T } from '../../styles/tokens.gen';
import type { ColorStop } from '../../page/pageBackground';
import { MuseumRun } from './museumRun';
import { MuseumLight } from './museumLight';
import { buildVectorCross } from './museumCross';
import { MUSEUM_SECTIONS, MUSEUM_LEAD, MUSEUM_TITLE, WHITE_SECTION } from './museumSections';

/**
 * «Музей» — four eras, one cross, and a field that goes from near-black to white.
 *
 * Extends `ContentScreen` rather than hand-rolling the router contract the way
 * `ConceptScreen` does: `PageShell` already owns the scroller, the wordmark, the
 * colour track, the handoff and — the part that matters — the ordering contract
 * between them, which is the only place this site can visibly flash. The two
 * things added on top are a rAF (the shell deliberately has none) and a canvas.
 *
 * ── the ending is one number ────────────────────────────────────────────────
 * The last field is white, where the shader light is not faint but absent:
 * the canvas composites `screen`, which cannot darken. So four things have to
 * change together across that one boundary —
 *
 *     the canvas fades out · the vector cross fades in
 *     the ink inverts      · the film grain goes
 *
 * — and if any of them lags, the page shows white text on a white field. They
 * are all driven from `whiteness()`, which reads the blend factor
 * `PageBackground` ACTUALLY PAINTED WITH rather than recomputing the same
 * smoothstep here. A second copy of that arithmetic would agree today and drift
 * the first time a band width or a stop moved, and the failure mode is invisible
 * copy rather than an error.
 */

/** the brief's own number: accent blue, 30 % */
const CROSS_OPACITY = 0.3;

/**
 * Total rotation across the page. The reader turns the light half a revolution
 * between «Экономическая свобода» and «Свобода личности» — mapped over the
 * CONTENT, not the scroller, so the full sweep is spent on the part that is
 * read and the emblem is already at 180° when the handoff zone begins.
 */
const TOTAL_ROT = Math.PI;

/**
 * The cursor's quantisation grid. 20 cells across the viewport, which is what
 * keeps «disturbed dust» from becoming a render storm: the light's dedupe key
 * only sees the cell centre, so crossing the page changes it 20 times and not
 * once per pointermove.
 *
 * «О Крестах» also needs a 90 ms settle timer on top of this; that is because a
 * bake there can pull a 70–90 ms mask rasterize with it. There is one mask here
 * and it never changes, so a re-render is just a draw and the timer would be
 * latency bought for nothing.
 */
const BUCKETS_X = 5;
const BUCKETS_Y = 4;

/** how far ahead of the first section the GPU context is warmed, in viewports */
const WARM_VH = 1.5;

/**
 * Fraction of the half-frame over which an era title holds full strength before
 * it starts fading out toward the edge. 0.45 keeps it solid while it is in the
 * cross and spends the outer half of the travel on the fade — see `fadeEras()`.
 */
const ERA_HOLD = 0.45;

/**
 * Below the site's 1160 breakpoint the grid collapses to one column, and the
 * body copy moves under the cross's brightest region — the convergence point is
 * at the left EDGE, and at that width there is no left edge to spare. The light
 * stays (it is the page's atmosphere, not an ornament) but at less than half
 * strength, which keeps it behind the text rather than in it.
 *
 * The query is duplicated from `museum.css` rather than read out of the
 * cascade: `getComputedStyle` at module scope returns '' in dev because Vite
 * injects CSS asynchronously, and a `matchMedia` on the same number is the
 * honest version of the coupling.
 */
const NARROW = '(max-width: 1160px)';
const NARROW_LIGHT = 0.45;

/**
 * `?rot=<deg>` pins the emblem's angle instead of deriving it from scroll.
 *
 * Two media draw this cross and they have to turn the same way: the shader
 * rotates the coordinates it SAMPLES the mask with (so the image turns the
 * opposite way to the number) and additionally uploads the texture Y-flipped,
 * while CSS `rotate()` turns the drawing itself. Whether those compose to the
 * same direction is not something to reason about — it is something to look at,
 * and comparing them inside a crossfade where one is at 0.07 opacity is not
 * looking at it. This holds both still at a known angle so they can be.
 */
const ROT_PIN = (() => {
  const raw = new URLSearchParams(location.search).get('rot');
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? (v * Math.PI) / 180 : null;
})();

export class MuseumScreen extends ContentScreen {
  private run: MuseumRun | null = null;
  private light = new MuseumLight();
  private cross = buildVectorCross();
  private tier = getPerfTier();
  private raf = 0;
  private warmed = false;
  /** window coordinates, as the light wants them — the canvas is never moved */
  private pointer: [number, number] = [-9999, -9999];
  private lastRotDeg = '';
  private lastInk = '';
  private lastChrome = '';
  /** when the light's clock started — see the frame loop */
  private t0 = 0;

  constructor(el: HTMLElement) {
    super(el, 'museum-page');
  }

  protected build() {
    // NOTHING TO DECLARE ABOUT THE DAWN. Round 27's `MainHandoff.setFrom()`
    // reads the luminance of the colour the zone is leaving and drops it above
    // 0.2; `PageShell` passes this page's last stop, which is white. A `dawn`
    // flag here would be a second, manual answer to a question already
    // answered — and one that could disagree with the track it is describing.

    this.shell.add(
      buildPageHead({
        title: MUSEUM_TITLE,
        lead: MUSEUM_LEAD,
        dark: true, // the masthead opens on #031721
        cta: 'Связаться', // the frame's own label on this page
        onPartner: () => this.onNavigate('contacts'),
      }),
    );

    this.run = new MuseumRun((el) => this.shell.add(el));
    this.run.onMediaResize = () => this.remeasure();

    // Both are VIEWPORT-PINNED and siblings of the scroller, never children of
    // it: a scroll container's absolutely-positioned children scroll with its
    // content. The canvas additionally may never sit inside anything sticky —
    // `position: sticky` creates a stacking context, which would isolate its
    // `screen` blend from `.page-bg` and kill the light outright.
    this.el.appendChild(this.light.canvas);
    this.el.appendChild(this.cross);

    this.el.addEventListener('pointermove', this.onPointer, { passive: true });
  }

  /** one stop per era, the first at 0 so the masthead sits on the first field */
  protected stops(): ColorStop[] {
    const tops = this.run?.tops() ?? [];
    return MUSEUM_SECTIONS.map((s, i) => ({
      top: i === 0 ? 0 : (tops[i] ?? 0),
      color: s.bg,
    }));
  }

  /**
   * Every section top moves when the layout does, and the stops are built from
   * them — so this page re-derives its run rather than re-measuring a cached
   * one. `ContentScreen`'s default just calls `shell.measure()`, which would
   * keep colours pinned to the widths they were first measured at.
   */
  protected remeasure() {
    // BEFORE the stops: a frame's height is part of its section's height, and
    // every stop is a section's `offsetTop`.
    this.run?.fitFrames();
    this.shell.setStops(this.stops());
    this.light.setViewport(this.shell.scroller.clientWidth, this.shell.scroller.clientHeight);
  }

  start(restore?: number) {
    super.start(restore);
    this.remeasure();
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    super.stop();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    // `--grain-k` is shared with MainScreen's reveal ramp; leave it as we found
    // it so a page that never drives it is not stuck at whatever we last wrote.
    document.documentElement.style.removeProperty('--grain-k');
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer = [e.clientX, e.clientY];
  };

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    const sc = this.shell.scroller;
    const viewH = sc.clientHeight;
    const run = this.run;
    if (!viewH || !run) return;

    // Colour first, then the handoff — the shell's own contract, run here so the
    // light reads the blend factor from the SAME frame it was painted in.
    this.shell.update();

    const top = sc.scrollTop;
    const handoffTop = this.shell.handoff.top;

    if (!this.warmed && top > run.firstTop - WARM_VH * viewH) {
      this.warmed = true;
      void this.light.ensure(this.tier);
    }

    // 0…1 across the content, then held. The emblem reaches 180° exactly where
    // the reader stops reading.
    const progress = clamp01(top / Math.max(1, handoffTop - viewH));
    const rot = ROT_PIN ?? progress * TOTAL_ROT;

    // Both the light and the cross belong to the CONTENT. They ramp to nothing
    // across the first viewport of the handoff, which is the same viewport
    // HANDOFF_VH reserves for "the last line clears the frame BEFORE the colour
    // starts moving" — so the page's last painted frames are flat blue with
    // nothing on them, which is the whole basis of the seam being undetectable.
    const fade = 1 - clamp01((top - handoffTop) / viewH);
    const white = this.whiteness();

    if (this.light.ready) {
      const ceiling = matchMedia(NARROW).matches ? NARROW_LIGHT : 1;
      this.light.setOpacity((1 - white) * fade * ceiling);
      // The clock starts when the light does, not at page load: a reader who
      // spends a minute on «О Крестах» first should not arrive mid-breath.
      if (!this.t0) this.t0 = performance.now();
      this.light.render(rot, this.quantisedPointer(), (performance.now() - this.t0) / 1000);
    }

    this.cross.style.opacity = (white * CROSS_OPACITY * fade).toFixed(3);
    // NEGATED, and it is not a sign slip. The shader rotates the coordinates it
    // SAMPLES the mask with, so the image turns the opposite way to the number;
    // CSS `rotate()` turns the drawing itself. Measured rather than reasoned:
    // ray angles read off a circle around the convergence point moved −10° for
    // `signRot: +10°` and +40° for `rotate(40deg)`. Left unnegated the two
    // counter-rotate through the crossfade. `?rot=` pins the angle so this stays
    // checkable.
    const deg = ((-rot * 180) / Math.PI).toFixed(2);
    if (deg !== this.lastRotDeg) {
      this.lastRotDeg = deg;
      this.cross.style.setProperty('--mus-rot', `${deg}deg`);
    }

    this.fadeEras(viewH);

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
  };

  /**
   * One era at a time, in the light.
   *
   * A sticky column is on screen from the moment its section's top edge is, so
   * at every section boundary the outgoing era sits at the top of the frame
   * while the incoming one arrives at the bottom — two titles, both fully
   * opaque, which reads as a layout fault rather than a handover. «О Крестах»
   * never shows this because its light's envelope fades each station in and out
   * and the eye follows the light; there is one cross here and it never moves,
   * so the fade has to be on the titles instead.
   *
   * The envelope is distance from the frame's middle, which is also where the
   * cross's convergence point is — so an era is at full strength exactly when
   * it is inside the light, and gone by the time it reaches either edge. Four
   * rects a frame, no cached geometry: they are already in the layout the
   * browser just computed, and caching them is what would need invalidating.
   */
  private fadeEras(viewH: number) {
    const run = this.run;
    if (!run) return;
    const mid = viewH / 2;
    for (const sec of run.sections) {
      const col = sec.firstElementChild?.firstElementChild as HTMLElement | undefined;
      if (!col) continue;
      const r = col.getBoundingClientRect();
      // normalised distance of the column's centre from the frame's centre
      const d = Math.abs((r.top + r.height / 2 - mid) / mid);
      // flat across the middle half, then a smoothstep out to the edge
      const k = clamp01((1 - d) / (1 - ERA_HOLD));
      col.style.setProperty('--mus-era-op', (k * k * (3 - 2 * k)).toFixed(3));
    }
  }

  /**
   * How white the field is RIGHT NOW — 1 on the white section, falling to 0 both
   * on the way in from the slate blue and on the way out to main's blue.
   *
   * Not "progress past the white stop": the field leaves white again at the
   * seam, and a cross that only knew it had arrived would sit blue-on-blue over
   * the handoff.
   */
  private whiteness(): number {
    const { index, toIndex, blend } = this.shell.bg;
    const W = WHITE_SECTION;
    if (W < 0) return 0;
    // A blend always runs from `toIndex − 1` to `toIndex`.
    if (blend <= 0) return index === W ? 1 : 0;
    if (blend >= 1) return toIndex === W ? 1 : 0;
    if (toIndex === W) return blend; // arriving
    if (toIndex === W + 1) return 1 - blend; // leaving
    return 0;
  }

  /** the cursor, snapped to the centre of its cell — see BUCKETS_X */
  private quantisedPointer(): [number, number] {
    const w = this.shell.scroller.clientWidth;
    const h = this.shell.scroller.clientHeight;
    const [x, y] = this.pointer;
    if (x < 0 || y < 0) return [w / 2, h / 2];
    const cx = Math.min(BUCKETS_X - 1, Math.max(0, Math.floor((x / w) * BUCKETS_X)));
    const cy = Math.min(BUCKETS_Y - 1, Math.max(0, Math.floor((y / h) * BUCKETS_Y)));
    return [((cx + 0.5) / BUCKETS_X) * w, ((cy + 0.5) / BUCKETS_Y) * h];
  }
}

/* The two ends of the ink ramp — on-dark main and on-light main, the same two
   the rest of the site switches between. Read from the token MODULE rather than
   the cascade: `getComputedStyle` at module scope returns '' in dev, because
   Vite injects CSS asynchronously. */
const INK_DARKFIELD = T.textOndarkMain;
const INK_LIGHTFIELD = T.textOnlightMain;
const LINK = T.link;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

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
