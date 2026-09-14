import { SectionRun } from './sectionRun';
import { ContactForm } from '../../page/contactForm';
import { MainHandoff } from '../../page/mainHandoff';
import { PageBackground } from '../../page/pageBackground';
import { FORM_BG } from './pageSections';
import { getPerfTier } from '../../shared/performanceTier';
import { MOTION, applyMotionCss } from './motionParams';

/**
 * Everything below the map on «О Крестах»: the section run, the contact form,
 * the handoff into the main screen, the page's colour, and the one ray-field
 * canvas that lights the section icons.
 *
 * It exists as its own file so `ConceptScreen.ts` — already past 600 lines —
 * does not grow further; the whole page is one `update()` from its frame loop.
 *
 * CANVAS BUDGET. Two GPU contexts exist on this page — Three.js's map and this
 * one ray field — and NEVER MORE THAN ONE RENDERS IN A FRAME. The map is gated
 * on `mapVisible` (already true at HEAD); the light is gated off whenever the
 * map is up. A second ray-field canvas would not merely be a second canvas: on
 * WebGPU it is a second `requestAdapter()`/`requestDevice()`, i.e. a second
 * `GPUDevice`, swapchain and copy of every mask texture. That is the whole
 * reason the handoff replaced a 1:1 footer.
 *
 * PER FRAME this does arithmetic only — no GPU work, no layout reads. At most
 * one background write and at most one transform+opacity write, each guarded on
 * the string actually changing. A reader holding still writes no style at all,
 * and inside the sticky hold phase the icon's y is constant, so even the
 * transform write is suppressed. That is strictly cheaper than round 16.
 */

/**
 * The section light's render scale. ROUND 25 RAISES IT 1 → 2, closing the
 * standing open issue about Retina softness.
 *
 * Round 16.1 capped it at 1 and measured the trade: cap 2 costs a 70–117 ms bake
 * for 100 % sharpness, 1.5 costs 57 ms for 63 %, 1 has no bake over 30 ms at
 * 53 %. The client's report — the icons look "clunky, low fidelity, too grainy"
 * — is that 53 % seen from the other side, and the two are literally the same
 * measurement: at cap 1 on a 2× display the canvas renders one device pixel per
 * CSS pixel and the compositor doubles it, so `hash21(fragPx)`, which seeds from
 * ABSOLUTE fragment position, becomes a 2×2 smear per speck. The dither is the
 * grain, and the upscale is what makes it visible.
 *
 * The hitch is paid for by throttling instead — see `bakePointer()`. Bakes are
 * suppressed while the page is scrolling, so the expensive frame lands on a
 * still page where 100 ms is a delay rather than a stutter.
 */
const LIGHT_RENDER_SCALE_MAX = renderScaleOverride() ?? 2;

/**
 * `?ls=<k>` — the live override TUNING_LOG has documented since round 16.1 and
 * which never actually existed (nothing read `ls`; the log also placed the
 * constant in `ConceptScreen.ts`, and it is here). It is the A/B tool for a
 * designer eye on sharpness-versus-hitch, and the way back to 1 on a slow
 * machine without a rebuild.
 */
function renderScaleOverride(): number | null {
  const raw = new URLSearchParams(location.search).get('ls');
  if (raw === null) return null;
  const k = Number(raw);
  return Number.isFinite(k) && k > 0 ? Math.min(k, 3) : null;
}

/** warm the GPU this far ahead of the first section, in viewports */
const WARM_VH = 1.5;

/**
 * ROUND 25: the cursor moves the light again, in 5 × 4 = 20 quantised positions.
 *
 * THE POINT IS WHAT IS *NOT* HERE. Round 16.1's fix was that scrolling must cost
 * zero GPU work — the canvas is two viewports tall with the icon baked at its
 * middle and moved by `translate3d` alone, which is why 60 scrolling frames make
 * 0 submissions. A live per-frame pointer would undo that outright. Quantising
 * to 20 cells means the whole viewport costs at most 20 bakes, a bake happens
 * only when the cursor crosses a cell boundary, and scroll still costs nothing.
 *
 * `render()`'s `lastKey` already included the rounded pointer, so the dedupe for
 * this existed from the start and was simply never fed a moving cursor — the
 * trigger in `update()` only ever compared the station and the icon box.
 */
const BUCKETS_X = 5;
const BUCKETS_Y = 4;

/**
 * How long the cursor must REST in a new cell before that cell is baked, ms.
 *
 * Cell-crossing alone is not enough throttling at render scale 2, and this was
 * measured rather than assumed. Sweeping the cursor across the viewport with a
 * bake on every crossing:
 *
 *   scale 1    median 16.7ms   p95 18.8   max 18.9   frames >30ms:  0 / 109
 *   scale 1.5  median 16.6ms   p95 18.8   max 19.1   frames >30ms:  0 / 101
 *   scale 2    median 16.6ms   p95 67.0   max 71.8   frames >30ms: 28 / 65
 *
 * A fast sweep must therefore not bake the cells it passes THROUGH, only the one
 * it stops in. After the settle, on the same 2880×3600 canvas:
 *
 *   fast flick, ~12 cells in 360ms   0 bakes during, 1 after   0 / 38 frames >30ms
 *   reader, 4 deliberate moves       4 bakes                   0 / 98 frames >30ms
 *
 * THE SECOND ROW IS THE INTERESTING ONE: four full-resolution bakes, spaced by a
 * reader's own pauses, cost nothing measurable. So the hitch was never the price
 * of ONE bake — it was back-to-back bakes arriving faster than they complete.
 * Spacing them is what makes full sharpness affordable, not making them cheaper.
 *
 * This is the lever to reach for if the hitch is ever reported again, together
 * with `?ls=`. Lowering the render scale is the other end of the same trade.
 */
const CURSOR_SETTLE_MS = 90;

export class ConceptPage {
  readonly sections: SectionRun;
  readonly form: ContactForm;
  readonly handoff: MainHandoff;
  private bg: PageBackground;
  private tier = getPerfTier();
  private viewW = 0;
  private viewH = 0;
  private warmed = false;
  /** smoothed icon y, and its clock. `null` = not following (see smoothY) */
  private lightY: number | null = null;
  private lightT = 0;
  /** which icon is on screen (lags `idx` by half a dip), and which is queued */
  private shownIdx = -1;
  private pendingIdx = -1;
  private dipStart = 0;
  private lastBakeIdx = -1;
  private lastBakePx = 0;
  /** the quantised cursor cell the current bake was rendered for (see BUCKETS) */
  private lastBakeCell = -1;
  /** the cell the cursor is in now, and when it entered — see CURSOR_SETTLE_MS */
  private hoverCell = -1;
  private hoverSince = 0;
  /** previous scrollTop, so a bake can be suppressed while the page is moving */
  private lastScrollTop = -1;

  constructor(screen: HTMLElement, scroller: HTMLElement) {
    // ROUND 23: push the layout dials into CSS before anything measures. The
    // stylesheet's fallbacks ARE these defaults, so the page is correct without
    // this call — it exists so the two can never disagree once the panel has
    // written a stored value, and so `measure()` never reads a stale box.
    applyMotionCss();
    this.bg = new PageBackground(screen);
    this.sections = new SectionRun(scroller);
    this.form = new ContactForm(scroller);
    // ROUND 24: the form is a sixth light station. Registered AFTER its own
    // constructor has appended it, because `measure()` reads `offsetTop` in
    // document order and the form must already sit below the five sections.
    this.sections.addStation(this.form.el);
    this.handoff = new MainHandoff(scroller);

    // The light canvas is viewport-pinned and composites with `screen`, so it
    // is a SIBLING of the scroller, never inside it: a scroll container's
    // absolutely-positioned children scroll with its content, and a `fixed`
    // canvas nested in a scroller breaks the moment an ancestor gains a
    // transform. It also may never live inside the sticky column — `position:
    // sticky` creates a stacking context, which would isolate the `screen`
    // blend from `.page-bg` and kill it outright.
    screen.appendChild(this.sections.light.canvas);

    this.form.onResize = () => this.measure(this.viewW, this.viewH);
  }

  measure(viewW: number, viewH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
    if (!viewH) return;
    this.sections.measure(viewH);
    this.sections.light.setViewport(viewW, viewH);
    this.bg.setStops([
      ...this.sections.stops(),
      { top: this.form.top, color: FORM_BG },
      ...this.handoff.stops(viewH),
    ]);
  }

  /**
   * One call per frame from `ConceptScreen`'s loop.
   *
   * Runs OUTSIDE the `mapVisible` branch: the colour track must keep running in
   * the white region above the sections, because it is what holds the page at
   * `LEAD_COLOR` in the first place.
   */
  update(
    scrollTop: number,
    viewW: number,
    viewH: number,
    mapVisible: boolean,
    pointer: [number, number],
    busy: boolean,
  ) {
    if (!viewH) return;
    if (viewW !== this.viewW || viewH !== this.viewH) this.measure(viewW, viewH);

    // 1. the colour, applied. ROUND 24: the band is pushed in rather than read
    // out — `PageBackground` moved to `page/` and must not reach back into this
    // screen's tuning panel, or every page would depend on «О Крестах»'s dials.
    this.bg.bandVh = MOTION.bandVh;
    this.bg.update(scrollTop, viewH);

    // 2. the light
    const t = this.sections.track(scrollTop, viewH, mapVisible);
    const light = this.sections.light;
    if (!mapVisible) {
      // Measured against the FIRST SECTION'S OWN TOP, never `stageH − k·viewH`:
      // at STAGE_VH 1.5 that expression is negative and fires on frame one,
      // handing a second GPU context to every visitor including one who never
      // scrolls. Round 16 shipped exactly that bug.
      if (!this.warmed && scrollTop > this.sections.firstTop - WARM_VH * viewH) {
        this.warmed = true;
        void light.ensure(Math.min(this.tier.renderScale, LIGHT_RENDER_SCALE_MAX));
      }
      if (light.ready && t.opacity > 0) {
        // ROUND 23: the swap dip. `envelope()` never reaches 0 between sections
        // — measured — so without this the mask is replaced at full brightness,
        // which is the "rude" swap. The icon is held back until the dip bottoms
        // out, so the change happens at the light's lowest point, which is what
        // pageLight's header always claimed happened. `swapDip: 0` skips the
        // whole thing and reproduces the shipped behaviour exactly.
        const dip = this.swapDip(t.idx);
        const shown = MOTION.swapDip > 0 ? this.shownIdx : t.idx;

        // The smoothed y is needed TWICE now — to place the canvas, and to
        // convert the cursor into canvas-local space below. `smoothY` advances
        // its own filter, so it must be called exactly once per frame.
        const y = this.smoothY(t.y);

        // THE POINTER HAS TO BE CONVERTED, and this was a live bug: the caller
        // passes WINDOW coordinates while `render()` documents and treats them
        // as canvas-local. The canvas is 2 viewports tall and sits at
        // `translate3d(0, y − viewH, 0)`, so its top edge in window space is
        // `y − viewH` and the local point is `cursorY − (y − viewH)`. The error
        // was up to a full viewport, and it was invisible only because
        // `MOTION.parallax` was 0 — which zeroes every consumer of `q` in the
        // shader. Turning parallax on without this makes the light lean toward a
        // cursor that is nowhere near where the reader's actually is.
        const local: [number, number] = [pointer[0], pointer[1] - (y - viewH)];

        // Suppress cursor bakes while the page is moving. Scroll owns the frame
        // budget — at render scale 2 a bake is 70–117 ms, which is a delay on a
        // still page and a stutter on a scrolling one. A station change is NOT
        // suppressed: it must land on the frame it is due.
        const scrolling = scrollTop !== this.lastScrollTop;
        const cell = this.pointerCell(pointer, viewW, viewH);

        // The cursor must SETTLE in a cell before that cell is baked, or a flick
        // across the viewport bakes every cell it passes through — 28 of 65
        // frames over 30ms, measured. See CURSOR_SETTLE_MS.
        const now = performance.now();
        if (cell !== this.hoverCell) {
          this.hoverCell = cell;
          this.hoverSince = now;
        }
        const settled = now - this.hoverSince >= CURSOR_SETTLE_MS;

        const stationChanged = shown !== this.lastBakeIdx || t.px !== this.lastBakePx;
        const cursorMoved = !scrolling && settled && cell >= 0 && cell !== this.lastBakeCell;
        if (stationChanged || cursorMoved) {
          this.lastBakeIdx = shown;
          this.lastBakePx = t.px;
          this.lastBakeCell = cell;
          light.bake(shown, t.x, local, t.px);
        }
        light.position(y, t.opacity * dip);
      } else {
        light.hide();
      }
    } else {
      light.hide();
    }

    this.lastScrollTop = scrollTop;

    // 3. the handoff — AFTER the colour is applied, in the same task. See
    //    MainHandoff.update: reversed, a hard flick paints one frame of the
    //    intermediate colour, and that is the only way this seam can flash.
    this.handoff.update(scrollTop, viewH, this.bg.pure, busy);
  }

  /**
   * Which of the BUCKETS_X × BUCKETS_Y cursor cells the pointer is in, or −1 off
   * screen. Quantised in WINDOW space rather than canvas-local, deliberately: the
   * canvas slides with the icon, so a canvas-local cell boundary would drift past
   * a stationary cursor as the page scrolls and fire a bake with nobody moving.
   */
  private pointerCell(pointer: [number, number], viewW: number, viewH: number): number {
    const [px, py] = pointer;
    if (px < 0 || py < 0 || px > viewW || py > viewH) return -1;
    const cx = Math.min(BUCKETS_X - 1, Math.floor((px / viewW) * BUCKETS_X));
    const cy = Math.min(BUCKETS_Y - 1, Math.floor((py / viewH) * BUCKETS_Y));
    return cy * BUCKETS_X + cx;
  }

  /**
   * ROUND 23: optional smoothing on the icon's tracked position — the direct
   * answer to "the swap feels rude".
   *
   * The rudeness is NOT the fade. `iconY` is `min(max(flowing, pinned), pushed)`,
   * so its slope jumps −1 → 0 → −1: the light glides at scroll speed, freezes
   * dead while the column is pinned, then lurches back into motion. `envelope()`
   * is smooth in POSITION, so it inherits both corners and the opacity's rate
   * changes instantaneously with them. A first-order lag rounds them off.
   *
   * Frame-rate independent (`1 − exp(−dt/τ)`), the same form the main screen's
   * hover lerps use — not a naive per-frame coefficient.
   *
   * `follow: 0` SHORT-CIRCUITS COMPLETELY, and that is deliberate: above 0 this
   * writes a transform every frame while the column is pinned, which is exactly
   * the per-frame compositor work this module's header celebrates suppressing.
   * The shipped default is 0, so the cost is opt-in and measurable against it.
   */
  private smoothY(target: number): number {
    const tau = MOTION.follow;
    if (tau <= 0) {
      this.lightY = null;
      return target;
    }
    const now = performance.now();
    const dt = this.lightT ? Math.min(0.05, (now - this.lightT) / 1000) : 0;
    this.lightT = now;
    if (this.lightY === null) this.lightY = target;
    // a jump of more than a viewport is a station swap or a scroll restore, not
    // motion — following it would drag the light across the screen
    else if (Math.abs(target - this.lightY) > this.viewH) this.lightY = target;
    else this.lightY += (target - this.lightY) * (1 - Math.exp(-dt / tau));
    return this.lightY;
  }

  /**
   * The swap dip: a half-sine that falls to `1 − swapDip` and back over
   * `swapMs`, with the ICON CHANGING AT THE BOTTOM. Returns the multiplier.
   *
   * The same shape «Слайдер» uses on the main screen (`SLIDE_DIP_S`), and for
   * the same stated reason — *the light dips, it never flashes*. Round 9 removed
   * a ×2.4 surge on slide change because a swap-pop fails exactly here.
   *
   * `shownIdx` lags `idx` by half the dip, which is what makes the mask change
   * invisible: at the midpoint the light is at its darkest, so the icon that
   * arrives is not seen arriving.
   */
  private swapDip(idx: number): number {
    if (MOTION.swapDip <= 0) {
      this.shownIdx = idx;
      this.dipStart = 0;
      return 1;
    }
    if (idx !== this.pendingIdx) {
      this.pendingIdx = idx;
      // a first paint is not a swap — do not dip on arrival
      if (this.shownIdx < 0) this.shownIdx = idx;
      else this.dipStart = performance.now();
    }
    if (!this.dipStart) return 1;
    const k = (performance.now() - this.dipStart) / MOTION.swapMs;
    if (k >= 1) {
      this.dipStart = 0;
      this.shownIdx = this.pendingIdx;
      return 1;
    }
    if (k >= 0.5) this.shownIdx = this.pendingIdx; // past the bottom: show the new one
    return 1 - MOTION.swapDip * Math.sin(Math.PI * k);
  }

  /** where a return from the main screen lands: past the dawn, disarmed */
  restoreTop(viewH: number): number {
    return this.handoff.restoreTop(viewH);
  }

  hide() {
    this.sections.light.hide();
  }
}
