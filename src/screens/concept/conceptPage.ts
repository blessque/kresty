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
 * The section light's render scale, capped at 1 — round 16.1's shipped trade,
 * kept as a NAMED policy rather than a literal buried in `pageLight.ts`.
 *
 * Measured then: cap 2 costs a 70–117 ms bake hitch at every section boundary
 * for 100 % sharpness; 1.5 costs 57 ms for 63 %; 1 has no hitch over 30 ms at
 * 53 %. The hitch matters because a bake lands near a colour crossfade, and a
 * stutter there is visible in a way softness is not.
 *
 * This is the dial for the standing open issue about Retina softness.
 */
const LIGHT_RENDER_SCALE_MAX = 1;

/** warm the GPU this far ahead of the first section, in viewports */
const WARM_VH = 1.5;

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

        // bake only on a station change — never on scroll (round 16.1)
        // re-bake on a station change OR when the icon box resizes (it flexes
        // with viewport height); `render()`'s lastKey dedupe absorbs the rest
        if (shown !== this.lastBakeIdx || t.px !== this.lastBakePx) {
          this.lastBakeIdx = shown;
          this.lastBakePx = t.px;
          light.bake(shown, t.x, pointer, t.px);
        }
        light.position(this.smoothY(t.y), t.opacity * dip);
      } else {
        light.hide();
      }
    } else {
      light.hide();
    }

    // 3. the handoff — AFTER the colour is applied, in the same task. See
    //    MainHandoff.update: reversed, a hard flick paints one frame of the
    //    intermediate colour, and that is the only way this seam can flash.
    this.handoff.update(scrollTop, viewH, this.bg.pure, busy);
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
