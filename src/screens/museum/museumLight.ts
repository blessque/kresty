import signSvg from '../../assets/sign.svg?raw';
import { rasterizeMask } from '../../shared/rasterizeMask';
import { selectBackend } from '../../gpu/capabilities';
import { VARIANTS } from '../main/variants';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';
import type { PerfTier } from '../../shared/performanceTier';
import * as governor from '../../shared/frameGovernor';

/**
 * «Музей»'s light: ONE cross, pinned to the left edge, turning as you read.
 *
 * ── why this is not `screens/concept/pageLight.ts` ──────────────────────────
 * That class is mostly a solution to TRAVEL. Its icon slides past the frame, so
 * the light has to slide with it, and re-running the shader every frame to
 * achieve that would not be affordable — hence a canvas two viewports tall, a
 * measured station table, an envelope, a hysteresis test and a `translate3d`
 * that moves a baked image on the compositor. The assertion it protects is
 * "0 GPU submissions across 60 scrolling frames".
 *
 * This cross does not travel. Its convergence point is fixed at (0, viewH/2) —
 * x = 0 so the emblem is bisected by the frame edge and only its right half is
 * on screen, which is the brief. So every one of those mechanisms is dropped
 * and the canvas is one viewport.
 *
 * ── IT IS LIVE, NOT BAKED (round 28.1) ──────────────────────────────────────
 * The first cut froze `timeSec` at 0 and redrew only when the scroll or the
 * cursor moved it, inheriting the concept page's "a still reader submits
 * nothing" budget. That budget is the right one THERE, where a second GPU
 * context runs beside Three.js and six stations each want their own mask. Here
 * it bought nothing anybody could see and cost the thing worth having: with the
 * clock stopped, `breathe`, `shimmer`, the dust drift, the fiber comb and the
 * slow `vnoise` gate on the god-rays are all inert by construction, so the
 * light was a photograph of the hero rather than the hero.
 *
 * **There is exactly one glowing element on this page and nothing else on the
 * GPU**, so it runs every frame with a real clock, like the main screen. That
 * is one full-viewport pass at render scale 1.5 — measured 60 fps — and the
 * page is idle-free only while it is the visible screen, because the rAF stops
 * with the route.
 *
 * ── the emblem ──────────────────────────────────────────────────────────────
 * `assets/sign.svg`, the same file the hero rasterizes, with the same options —
 * `{ raw: true }` and no `contentFrac`, because it carries its own margin. So
 * this is the hero's cross, not a lookalike.
 *
 * The blue vector that takes over on the white section is a DIFFERENT drawing
 * of the same motif (`assets/cross-vector.svg`, the designer's own), because
 * measured against each other the two are not the same proportions — see
 * `museumCross.ts`. The crossfade works because the emblems share a centre, an
 * angle and a footprint, not because they share a file.
 */

/** «Сияние» — the hero's own preset, reused verbatim as the concept light does */
const SIYANIE: RayFieldParams = VARIANTS.find((v) => v.id === 'siyanie')!.params;

/**
 * ONE number, and «Сияние» is otherwise used VERBATIM.
 *
 * ── the mistake this replaces ───────────────────────────────────────────────
 * Round 28 built this light by copying `screens/concept/pageLight.ts`, because
 * that was the nearest precedent for "the hero light, on a page". It was the
 * wrong parent. That class does not use «Сияние» either — it overrides seven of
 * its params from «О Крестах»'s `MOTION` set, which was dialled for ~200 px
 * silhouettes that have to read as objects, and it additionally ships
 * `grain: 0` and `octaves: 0`. Inherited here, the divergence was:
 *
 *     dissolve   1    → 0.41   «Сияние» IS the dissolved logo; 0.41 is «Прорезь»
 *     grain      0.06 → 0      the register is "grainy, sculptural" — a rule
 *     octaves    4    → 0      the fbm dust switched off entirely
 *     layers     3    → 4
 *     godrays/bloom/core, falloff, parallax   all re-tuned
 *
 * `octaves: 0` is the one that did the visible damage: it is what feeds the
 * volumetric noise, so the light had no dust in it at all and read as a smooth
 * pre-rendered gradient. Which is what "why does it look baked?" was pointing
 * at, and no clock was ever going to fix it.
 *
 * So the preset is now spread untouched and the tier supplies `layers` and
 * `octaves`, exactly as `MainScreen` does. The composition forces three things
 * to differ — `centerPx`, `signSize` and `signRot` — and nothing else may.
 *
 * ── why a gain is still needed ──────────────────────────────────────────────
 * The emblem is ~4× the hero's (the client asked for the vector's size) and the
 * emission terms are not normalised for it, so at the preset's own intensities
 * the field washes out. This is ONE multiplier on the four emissive terms —
 * a scale correction, not a second opinion about what the light should look
 * like. Every other number is «Сияние»'s.
 *
 * Sanity-checked against the frame's own hero render (its open field reads
 * ~rgb(37,37,33)); `?exp=` moves it. Note that single-pixel sampling is no
 * longer a stable measurement now that `grain` and the clock are live — every
 * frame differs, which is the point. Compare regions, or just look.
 */
const GAIN = 0.22;

/**
 * Texture span of the emblem, in viewport heights.
 *
 * 2.2 = the vector's own 1400px ink on the 900px-tall frame it was drawn on, so
 * the glowing cross and the blue one on the white section are THE SAME SIZE —
 * which is what makes the handover between them read as one object changing
 * medium rather than two props being swapped.
 *
 * It shipped at 0.46 first, sized like the hero's 380-on-1440, on the reasoning
 * that `signSize` is the slit and the rays' reach comes from `falloffL`. That
 * reasoning is correct and the result was still wrong: a small slit makes thin
 * needles, and both the frame's own light-beam renders and the vector draw WIDE
 * soft wedges. The emblem's size sets the rays' WIDTH even though it does not
 * set their length — so it has to match, and `exposure` is what stops a big
 * slit washing the field out. The two are a pair; do not move one alone.
 */
const SIGN_VH = 2.2;

/**
 * Internal pixels per CSS pixel, capped.
 *
 * Lower than the concept light's 2. That light bakes and then costs nothing, so
 * it can afford the sharpest texture available; this one re-renders on the same
 * frames the reader is scrolling text and decoding photographs, and the pixel
 * count is quadratic in this number. 1.5 against 2 is 44 % fewer pixels per
 * pass for a full-frame diffuse light with no readable edge to lose. `?ls=`
 * overrides, exactly as on «О Крестах».
 */
const RENDER_SCALE_MAX = 1.5;


export class MuseumLight {
  readonly canvas = document.createElement('canvas');

  private renderer: RayFieldRenderer | null = null;
  private pending = false;
  private maskReady = false;
  private renderScale = 1;
  private viewW = 0;
  private viewH = 0;
  private lastOpacity = '';
  /** what was last asked for, so a late mask upload can repeat it */
  private lastArgs: { rot: number; pointer: [number, number]; timeSec: number } | null = null;
  private signVh = numParam('sign', SIGN_VH, 0.05, 6);
  private gain = numParam('exp', GAIN, 0, 4);
  /** the perf tier's own dust settings, exactly as the main screen uses them */
  private layers = 3;
  private octaves = 4;
  /** the tier's ceilings on render scale and ray steps; the governor moves below them */
  private tierScale = 1;
  private tierSteps = 32;
  /** shader runs since load — the per-frame-cost assertion reads this */
  renderCount = 0;

  constructor() {
    this.canvas.className = 'museum-light';
  }

  get ready(): boolean {
    return this.renderer !== null;
  }

  get backend(): string {
    return this.renderer?.backend ?? 'none';
  }

  /**
   * Lazy, and idempotent. A GPU context is only worth paying for once the reader
   * has actually committed to the page — `MuseumScreen` warms it a viewport and
   * a half ahead of the first section, never at build time.
   */
  async ensure(tier: PerfTier): Promise<void> {
    if (this.renderer || this.pending) return;
    this.pending = true;
    this.tierScale = Math.min(tier.renderScale, renderScaleOverride() ?? RENDER_SCALE_MAX);
    this.tierSteps = tier.raySteps;
    this.renderScale = this.liveScale();
    // THE TIER'S OWN NUMBERS, like MainScreen. Round 28 hard-coded `layers: 4,
    // octaves: 0` — copied from the concept light — and `octaves` is what feeds
    // the volumetric noise, so the light had no dust in it at all.
    this.layers = tier.layers;
    this.octaves = tier.octaves;
    try {
      const backend = await selectBackend();
      if (backend === 'webgpu') {
        try {
          const { WebGPURayFieldRenderer } = await import('../../gpu/webgpu/WebGPURayFieldRenderer');
          const r = new WebGPURayFieldRenderer();
          await r.init(this.canvas);
          this.renderer = r;
        } catch (err) {
          console.warn('[kresty] museum light: WebGPU init failed, falling back to WebGL2', err);
        }
      }
      if (!this.renderer) {
        const { WebGL2RayFieldRenderer } = await import('../../gpu/webgl2/WebGL2RayFieldRenderer');
        const r = new WebGL2RayFieldRenderer();
        await r.init(this.canvas);
        this.renderer = r;
      }
      console.info(`[kresty] museum light backend: ${this.renderer.backend}`);
      governor.seed(this.renderer.gpuName, tier.low);
      this.renderScale = this.liveScale();
      this.applySize();
      void this.uploadMask();
    } finally {
      this.pending = false;
    }
  }

  /**
   * One mask, rasterized once. There is no `prewarm` chain here because there is
   * nothing to chain — the concept light pays a 70–90 ms frame per icon and has
   * six of them; this page has one and it is the only thing it ever draws.
   */
  private async uploadMask() {
    if (!this.renderer) return;
    try {
      // `{ raw: true }` and no `contentFrac` — byte-identical to the hero's call
      // in `MainScreen`, which is what makes this the same cross and not a
      // near-miss of it. Coverage normalisation is therefore also a no-op:
      // `sign.svg` IS the reference coverage the concept light divides by.
      const mask = await rasterizeMask(signSvg, { raw: true });
      this.renderer.setSignMask(mask);
      this.maskReady = true;
      if (this.lastArgs) this.render(this.lastArgs.rot, this.lastArgs.pointer, this.lastArgs.timeSec);
    } catch (err) {
      console.warn('[kresty] museum light: sign mask failed', err);
    }
  }

  /**
   * The viewport this light lives in. Takes the SCROLLER's box, never
   * `innerWidth/innerHeight` — the scroller is the element the light is sized
   * against and the two differ whenever a scrollbar or a browser chrome inset
   * does.
   */
  setViewport(w: number, h: number) {
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.applySize();
  }

  /**
   * Round 31: the frame governor's rung, under this page's own ceilings (the
   * tier's DPR/mobile cap, `RENDER_SCALE_MAX`, `?ls=`). Called when the rung
   * moves; resizes only if the number actually changed.
   */
  refreshQuality() {
    const rs = this.liveScale();
    if (rs === this.renderScale) return;
    this.renderScale = rs;
    this.applySize();
  }

  private liveScale(): number {
    return Math.min(governor.quality().renderScale, this.tierScale);
  }

  get scale(): number {
    return this.renderScale;
  }

  get steps(): number {
    return Math.min(governor.quality().raySteps, this.tierSteps);
  }

  get canvasSize(): string {
    return `${this.canvas.width}×${this.canvas.height}`;
  }

  private applySize() {
    if (!this.renderer || !this.viewW || !this.viewH) return;
    const rs = this.renderScale;
    this.renderer.resize(Math.round(this.viewW * rs), Math.round(this.viewH * rs));
    // the canvas just lost its contents; redraw what was on it
    if (this.lastArgs) this.render(this.lastArgs.rot, this.lastArgs.pointer, this.lastArgs.timeSec);
  }

  /**
   * Run the shader. Called every frame.
   *
   * `rot` is the emblem's rotation in radians; `timeSec` is the live clock that
   * makes it breathe; `pointer` is in CANVAS-LOCAL px, which here is the same as
   * viewport px because the canvas is never transformed — the one simplification
   * that follows from the cross not travelling, and worth stating because the
   * concept light's equivalent comment documents a real bug from getting it
   * wrong.
   *
   * No dedupe. With a running clock every frame genuinely differs, so a key
   * would be a comparison that never matches — cost with none of the saving.
   */
  render(rot: number, pointer: [number, number], timeSec: number) {
    this.lastArgs = { rot, pointer, timeSec };
    if (!this.renderer || !this.maskReady || !this.viewH) return;

    const rs = this.renderScale;
    this.renderCount++;

    // «Сияние» VERBATIM. Only the three things the composition forces may
    // differ, plus one gain on the emissive terms because the emblem is ~4× the
    // hero's. `dissolve`, `grain`, `ca`, `parallax`, `falloffL`, `dustAmount`,
    // `hazeBase`, `breathe`, `shimmer` and `rotSpeed` all come through the
    // spread and MUST keep coming through it — each one that gets a local
    // opinion is a step back toward a lookalike.
    const g = this.gain;
    const p: RayFieldParams = {
      ...SIYANIE,
      godrays: SIYANIE.godrays * g,
      bloom: SIYANIE.bloom * g,
      coreIntensity: SIYANIE.coreIntensity * g,
      hazeBase: SIYANIE.hazeBase * g,
      // Reference px ARE CSS px here, so the preset's 780px falloff keeps its
      // hero magnitude and decays inside the frame exactly as on the main
      // screen.
      signSize: this.viewH * this.signVh,
    };

    const state: RayFieldState = {
      // THE CLOCK IS LIVE. It is what `breathe`, `shimmer`, the dust drift, the
      // fiber comb and the slow `vnoise` gate on the god-rays all read; frozen
      // at 0 they are inert by construction and the light is a still of the
      // hero rather than the hero.
      timeSec,
      // x = 0: the convergence point sits ON the left edge, so the emblem is
      // bisected by it and the page shows its right half.
      centerPx: [0, (this.viewH / 2) * rs],
      pointerPx: [pointer[0] * rs, pointer[1] * rs],
      scale: rs,
      signRot: rot,
      // inert at slitMix 1 — the procedural field is built and discarded — but
      // the fields are required and must stay finite (linkDist divides)
      beamAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkDist: [400, 400, 400, 400],
      linkHalfAng: [0.1, 0.1, 0.1, 0.1],
      beamHover: [0, 0, 0, 0],
      // there is no nav on this page, so the slit light never leans
      hoverDir: [0, 0],
      hoverAmt: 0,
      bgMix: 0,
      sceneDim: 0,
      modeMix: 0, // never warms: there is no idle showreel here
      // `?field=on` nudges under the shader's skip threshold — see frameGovernor
      slitMix: governor.FIELD_FORCED ? 0.9985 : 1,
      layers: this.layers,
      octaves: this.octaves,
      raySteps: this.steps,
      params: p,
    };
    if (!governor.LIGHT_OFF) this.renderer.render(state);
  }

  /** guarded on the string changing, so a still reader writes no style at all */
  setOpacity(o: number) {
    const s = o.toFixed(3);
    if (s === this.lastOpacity) return;
    this.lastOpacity = s;
    this.canvas.style.opacity = s;
  }

  destroy() {
    this.renderer?.destroy();
    this.renderer = null;
    this.maskReady = false;
  }
}

/** `?ls=<k>` — the same dev dial «О Крестах» carries, clamped the same way */
function renderScaleOverride(): number | null {
  const raw = new URLSearchParams(location.search).get('ls');
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(3, Math.max(0.5, v)) : null;
}

/**
 * The three dials this light was actually tuned on, live in the URL:
 * `?sign=` the emblem's span in viewport heights, `?exp=` the exposure gain,
 * `?fall=` the radial falloff in reference px. «О Крестах» has a whole panel
 * for the equivalent; three query params is the right size for three numbers,
 * and it is how the shipped values below were arrived at rather than guessed.
 */
function numParam(key: string, dflt: number, lo: number, hi: number): number {
  const raw = new URLSearchParams(location.search).get(key);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}
