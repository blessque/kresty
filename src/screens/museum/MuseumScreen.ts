import { ContentScreen } from '../../page/ContentScreen';
import { buildPageHead } from '../../page/pageHead';
import { getPerfTier } from '../../shared/performanceTier';
import * as governor from '../../shared/frameGovernor';
import { perfHud } from '../../shared/perfHud';
import { Spring, clamp01 } from '../../shared/easing';
import { MUSEUM_LOOK } from '../../shared/lightLook';
import type { ColorStop } from '../../page/pageBackground';
import { TOUCH_LIGHT, TouchLightInput } from '../../page/touchLight';
import { MuseumRun } from './museumRun';
import { MuseumLight } from './museumLight';
import { buildVectorCross } from './museumCross';
import { MuseumInk } from './museumInk';
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
 * ROUND 31: THE CURSOR IS EASED, NOT QUANTISED — the main screen's feel. The
 * 20-cell grid it replaces was a leftover of the baked light: it bounded how
 * often a dedupe key could change. The light has redrawn every frame since
 * 28.1, so the grid bought nothing and made the light jump between 20 poses.
 * `SmoothPointer`'s tau, so «disturbed dust» reads the same on both pages —
 * inertia, never a hard follow.
 */
const POINTER_TAU = 0.4;

/** how far ahead of the first section the GPU context is warmed, in viewports */
const WARM_VH = 1.5;

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
const NARROW = matchMedia('(max-width: 1160px)');
/* `NARROW_LIGHT` (0.45) is the lab's `phoneGlow` since round 34, raised to 0.75
   alongside the brighter cross — see `MUSEUM_LOOK` in shared/lightLook.ts. The
   lab also moves the convergence point down here (`phoneX`/`phoneY`), because a
   phone is read in one band of its height, not across all of it. */

/**
 * ROUND 34: ON A PHONE THE ROTATION HAS WEIGHT. Geared straight to `scrollTop`,
 * the emblem stopped dead the instant the finger did and turned only a few
 * degrees a screen on the long one-column page — it read as a background. On a
 * touch device the angle follows its scroll target through a spring, so a flick
 * glides on and settles. Desktop keeps the direct mapping.
 *
 * 34.2: CRITICALLY DAMPED, AND NO TWIST. Round 34 shipped ζ 0.75 plus ~7° of
 * extra turn per full scroll gust, released when the page stopped — the user:
 * "too hard back bounce". ζ 1 is the fastest settle that never overshoots, so
 * the glide stays and nothing swings back.
 */
const ROT_OMEGA = 9;
const ROT_ZETA = 1;

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
  private ink: MuseumInk;
  private raf = 0;
  private warmed = false;
  /** window coordinates, as the light wants them — the canvas is never moved */
  private pointer: [number, number] = [-9999, -9999];
  /** the eased cursor the light actually sees; null until the first frame */
  private smoothPtr: [number, number] | null = null;
  /** a phone's cursor: tilt and scroll, never the finger (page/touchLight.ts) */
  private touch = new TouchLightInput();
  private rotSpring = new Spring(ROT_OMEGA, ROT_ZETA);
  private lastRotDeg = '';
  private lastCentre = '';
  /** when the light's clock started — see the frame loop */
  private t0 = 0;
  /** previous rAF timestamp — the frame governor's input */
  private lastFrame = 0;

  constructor(el: HTMLElement) {
    super(el, 'museum-page');
    this.ink = new MuseumInk(el);
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
    // Round 28 called `run.fitFrames()` first, on the rule that a frame's height
    // is part of its section's height and every stop is a section's `offsetTop`.
    // That rule still holds; there is just nothing left to fit — round 29's
    // slides derive their width from a definite height, so a picture block is
    // `--ms-h` tall from first layout and never moves a stop.
    this.shell.setStops(this.stops());
    this.light.setViewport(this.shell.scroller.clientWidth, this.shell.scroller.clientHeight);
  }

  start(restore?: number) {
    super.start(restore);
    this.remeasure();
    governor.reset();
    this.lastFrame = 0;
    this.rotSpring.reset();
    if (TOUCH_LIGHT.matches) this.touch.attach();
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    super.stop();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.touch.detach();
    // `--grain-k` is shared with MainScreen's reveal ramp; leave it as we found
    // it so a page that never drives it is not stuck at whatever we last wrote.
    document.documentElement.style.removeProperty('--grain-k');
  }

  /** `?perf`: what this light costs here, for a person to read off the screen */
  private hud() {
    const s = governor.stats;
    perfHud({
      fps: s.medianMs ? (1000 / s.medianMs).toFixed(0) : '…',
      median: `${s.medianMs.toFixed(1)} ms`,
      p95: `${s.p95Ms.toFixed(1)} ms`,
      slow: `${(s.slowShare * 100).toFixed(0)}% > 20 ms`,
      backend: this.light.backend,
      gpu: governor.gpuName || '?',
      dpr: devicePixelRatio,
      scale: this.light.scale,
      canvas: this.light.canvasSize,
      rays: this.light.rays,
      steps: this.light.steps,
      rung: `${governor.rungIndex()}${governor.isLocked() ? ' (locked)' : ''}`,
      light: governor.LIGHT_OFF ? 'OFF' : governor.FIELD_FORCED ? 'field forced' : 'on',
    });
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer = [e.clientX, e.clientY];
  };

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // round 31: measured frame time picks the light's resolution and steps —
    // only once the light is live, since the frames before it are not its cost
    const dtMs = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    if (this.light.ready && dtMs && governor.frame(dtMs)) this.light.refreshQuality();
    if (governor.PERF_HUD) this.hud();
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
    const phone = TOUCH_LIGHT.matches;
    const viewW = sc.clientWidth;
    // the phone's cursor runs every frame, so the gust is live before the light is
    const pointer = phone ? this.touch.update(dtMs, top, viewW, viewH) : this.easedPointer(dtMs);
    const narrow = NARROW.matches;
    const centre = this.centre(narrow, viewW, viewH);
    // ROUND 34.1: A CROSS ON THE RIGHT TURNS THE OTHER WAY. The user moved the
    // phone's convergence point to the bottom-right corner; the page then shows
    // the emblem's LEFT half, a mirror of the desktop composition, and its spin
    // has to mirror too. Derived from where the centre is, not hard-coded to
    // phones, so moving it back left in the lab restores the original turn. The
    // vector cross reads the same signed angle, so the white handover follows.
    // (34.2: the flick's extra twist is gone, so this negates the spring alone.)
    const turn = centre[0] > viewW / 2 ? -1 : 1;
    const rot =
      ROT_PIN ??
      turn *
        (phone
          ? this.rotSpring.step(progress * TOTAL_ROT, dtMs)
          : progress * TOTAL_ROT);

    // Both the light and the cross belong to the CONTENT. They ramp to nothing
    // across the first viewport of the handoff, which is the same viewport
    // HANDOFF_VH reserves for "the last line clears the frame BEFORE the colour
    // starts moving" — so the page's last painted frames are flat blue with
    // nothing on them, which is the whole basis of the seam being undetectable.
    const fade = 1 - clamp01((top - handoffTop) / viewH);
    const white = this.whiteness();

    if (this.light.ready) {
      const ceiling = narrow ? MUSEUM_LOOK.phoneGlow : 1;
      this.light.setOpacity((1 - white) * fade * ceiling);
      // The clock starts when the light does, not at page load: a reader who
      // spends a minute on «О Крестах» first should not arrive mid-breath.
      if (!this.t0) this.t0 = performance.now();
      this.light.render({ rot, pointer, timeSec: (performance.now() - this.t0) / 1000, centre });
    }

    // the vector cross sits on the light's centre — one source, so the white
    // handover lands on the same point wherever the lab has moved it
    const c = `${centre[0].toFixed(1)}px|${centre[1].toFixed(1)}px`;
    if (c !== this.lastCentre) {
      this.lastCentre = c;
      this.cross.style.setProperty('--mus-cx', `${centre[0].toFixed(1)}px`);
      this.cross.style.setProperty('--mus-cy', `${centre[1].toFixed(1)}px`);
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

    this.ink.apply(white);
  };

  /* ROUND 29 DELETED `fadeEras()` — the era crossfade existed only for PINNED
   * titles. Why, and what it would take to bring back: MUSEUM.md, "a section". */

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

  /**
   * The convergence point, viewport px. Desktop: a touch off the left edge at
   * mid-height — `deskX` −0.056, i.e. −80 px at 1440, a fraction of the width so
   * it scales with the screen (34.2: "not exactly on the page's 0 X"). Below the
   * breakpoint the lab's `phoneX`/`phoneY` place it (round 34).
   */
  private centre(narrow: boolean, w: number, h: number): [number, number] {
    return narrow
      ? [MUSEUM_LOOK.phoneX * w, MUSEUM_LOOK.phoneY * h]
      : [MUSEUM_LOOK.deskX * w, h / 2];
  }

  /** the cursor, eased toward the pointer — see POINTER_TAU. Centre until one arrives. */
  private easedPointer(dtMs: number): [number, number] {
    const w = this.shell.scroller.clientWidth;
    const h = this.shell.scroller.clientHeight;
    const [x, y] = this.pointer;
    const target: [number, number] = x < 0 || y < 0 ? [w / 2, h / 2] : [x, y];
    if (!this.smoothPtr) this.smoothPtr = target;
    const k = 1 - Math.exp(-Math.min(dtMs, 50) / 1000 / POINTER_TAU);
    this.smoothPtr = [
      this.smoothPtr[0] + (target[0] - this.smoothPtr[0]) * k,
      this.smoothPtr[1] + (target[1] - this.smoothPtr[1]) * k,
    ];
    return this.smoothPtr;
  }
}
