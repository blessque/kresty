import { SectionRun } from './sectionRun';
import { ContactForm } from './contactForm';
import { MainHandoff } from './mainHandoff';
import { PageBackground } from './pageBackground';
import { FORM_BG } from './pageSections';
import { getPerfTier } from '../../shared/performanceTier';

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
  private lastBakeIdx = -1;
  private lastBakePx = 0;

  constructor(screen: HTMLElement, scroller: HTMLElement) {
    this.bg = new PageBackground(screen);
    this.sections = new SectionRun(scroller);
    this.form = new ContactForm(scroller);
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

    // 1. the colour, applied
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
        // bake only on a station change — never on scroll (round 16.1)
        // re-bake on a station change OR when the icon box resizes (it flexes
        // with viewport height); `render()`'s lastKey dedupe absorbs the rest
        if (t.idx !== this.lastBakeIdx || t.px !== this.lastBakePx) {
          this.lastBakeIdx = t.idx;
          this.lastBakePx = t.px;
          light.bake(t.idx, t.x, pointer, t.px);
        }
        light.position(t.y, t.opacity);
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

  /** where a return from the main screen lands: past the dawn, disarmed */
  restoreTop(viewH: number): number {
    return this.handoff.restoreTop(viewH);
  }

  hide() {
    this.sections.light.hide();
  }
}
