import { asset } from '../../shared/assetUrl';
import { rasterizeMask, maskCoverage } from '../../shared/rasterizeMask';
import { selectBackend } from '../../gpu/capabilities';
import { VARIANTS } from '../main/variants';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';

/**
 * The hero light, lighting one resident-section icon at a time.
 *
 * ROUND 16. «Контакты» (round 12/13) already proved this whole mechanism: the
 * shader's `slitLight()` never referenced the emblem — it reads a three-channel
 * mask and `setSignMask()` takes any `TexImageSource`, so the hero light IS
 * whatever mask you hand it, with ZERO shader changes. What arrives here is
 * that finding plus the designer's own dialled-in numbers.
 *
 * WHY THIS DUPLICATES PART OF ContactsScreen
 * ------------------------------------------
 * `ContactsScreen.ts` is a shipped, approved page with twenty live panel
 * handles wired through its own `ControlValues`. Refactoring it into a shared
 * base to save ~50 lines would put an approved page at risk for no gain the
 * client can see, so it is left exactly as it is. The genuinely expensive
 * pieces — mask rasterization, coverage measurement, the flip cancellation —
 * are NOT duplicated: they already live in `shared/rasterizeMask.ts`, extracted
 * and proven byte-identical in round 12.
 *
 * ONE canvas, not one per section: the scroll position picks which icon is
 * live and the mask is swapped on the way past, so section count does not
 * enter the per-frame cost at all and there is never more than one GPU context
 * here. See `IconLight.envelope` for why the swap is invisible.
 */

/** the «Сияние» preset, read back out of the shipped variants so it cannot drift */
const SIYANIE: RayFieldParams = VARIANTS.find((v) => v.id === 'siyanie')!.params;

/**
 * Fraction of the mask an icon's ink should span — matched to `sign.svg`, which
 * carries ~14.7 % margin inside its own viewBox. Same value «Контакты» uses;
 * changing it changes the optical size of every icon at once.
 */
const CONTENT_FRAC = 0.706;

/**
 * Mean ink coverage of `sign.svg`'s mask — MEASURED (0.0806), not guessed.
 *
 * The «Сияние» preset is tuned against that exposure. The client's icons are
 * solid silhouettes averaging 0.17–0.29, and the god-ray march is LINEAR in
 * coverage, so on identical uniforms they render 2.1–3.6× too hot — a white-out
 * rather than a light. Every icon's godrays/bloom/core are divided by its own
 * coverage ratio. This is not a taste dial and must not be dropped.
 */
const REF_COVERAGE = 0.0806;

/**
 * The designer's own «Контакты» settings, handed over verbatim as a "Copy URL"
 * link in round 13 and reused here rather than re-derived.
 *
 * `freeze` is not represented: there is no clock to stop, because the light is
 * redrawn only when the scroll or the cursor actually moves it. `breathe` and
 * `shimmer` are therefore inert by construction, exactly as they were on the
 * page these numbers were dialled on.
 */
const LIGHT = {
  dissolve: 0.36,
  core: 0.45,
  godrays: 1.75,
  bloom: 1.05,
  falloff: 1010,
  exposure: 1.3,
  ca: 0.028,
  /** apparent size of the icon ink, CSS px */
  px: 220,
  parallax: 2,
} as const;

interface IconMask {
  canvas: HTMLCanvasElement;
  /** hero-matching exposure multiplier for godrays/bloom/core */
  exposure: number;
}

export class IconLight {
  readonly canvas = document.createElement('canvas');

  private renderer: RayFieldRenderer | null = null;
  private pending = false;
  private masks: (IconMask | null)[];
  private activeIdx = -1;
  private exposure = 1;
  private renderScale = 1;
  private lastKey = '';

  constructor(private icons: string[]) {
    this.canvas.className = 'res-light';
    this.masks = icons.map(() => null);
  }

  /**
   * Lazy: a second GPU context alongside Three.js is only worth paying for once
   * the reader actually scrolls past the map. Idempotent — `draw` simply does
   * nothing until this resolves.
   */
  async ensure(renderScale: number): Promise<void> {
    if (this.renderer || this.pending) return;
    this.pending = true;
    this.renderScale = renderScale;
    try {
      const backend = await selectBackend();
      if (backend === 'webgpu') {
        try {
          const { WebGPURayFieldRenderer } = await import('../../gpu/webgpu/WebGPURayFieldRenderer');
          const r = new WebGPURayFieldRenderer();
          await r.init(this.canvas);
          this.renderer = r;
        } catch (err) {
          console.warn('[kresty] sections: WebGPU init failed, falling back to WebGL2', err);
        }
      }
      if (!this.renderer) {
        const { WebGL2RayFieldRenderer } = await import('../../gpu/webgl2/WebGL2RayFieldRenderer');
        const r = new WebGL2RayFieldRenderer();
        await r.init(this.canvas);
        this.renderer = r;
      }
      console.info(`[kresty] sections backend: ${this.renderer.backend}`);
      this.resize();
      this.activeIdx = -1; // force the first mask upload
    } finally {
      this.pending = false;
    }
  }

  get ready(): boolean {
    return this.renderer !== null;
  }

  get backend(): string {
    return this.renderer?.backend ?? 'none';
  }

  resize = () => {
    const rs = this.renderScale;
    this.renderer?.resize(Math.round(innerWidth * rs), Math.round(innerHeight * rs));
    this.lastKey = '';
  };

  /** rasterized once, then cached — the upload only happens on a section change */
  private async maskFor(i: number): Promise<IconMask | null> {
    const cached = this.masks[i];
    if (cached) return cached;
    try {
      const canvas = await rasterizeMask(asset(`/resources/${this.icons[i]}`), {
        contentFrac: CONTENT_FRAC,
        flipY: true, // cancels the renderers' Y-flipped upload; see rasterizeMask
      });
      const coverage = maskCoverage(canvas);
      const m: IconMask = {
        canvas,
        exposure: coverage > 0 ? REF_COVERAGE / coverage : 1,
      };
      this.masks[i] = m;
      return m;
    } catch (err) {
      console.warn(`[kresty] sections: mask failed for ${this.icons[i]}`, err);
      return null;
    }
  }

  /**
   * How bright the light is, given where its icon sits on screen.
   *
   * ONE canvas means one mask, so at some scroll position the mask has to be
   * swapped. The icons are exactly one viewport apart, so the outgoing and the
   * incoming icon meet at the frame edge with neither overlap nor gap — but the
   * light's ~1010 px falloff reaches far past the icon itself, so swapping at
   * full brightness pops a halo across the whole frame.
   *
   * So the light fades out as its own icon leaves the frame and the swap
   * happens at zero. `u` is the icon's centre as a fraction of the viewport
   * height: 0 at the top edge, 1 at the bottom. The envelope is flat across the
   * middle and rolls off smoothly in the outer fifth.
   *
   * This is the shipped «Слайдер» rule reused rather than a new invention —
   * *the light dips, it never flashes*. Round 9 removed a ×2.4 surge on slide
   * change for exactly the reason a swap-pop would fail here.
   */
  static envelope(u: number): number {
    const EDGE = 0.2;
    const t = Math.min(u, 1 - u) / EDGE;
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t); // smoothstep
  }

  /**
   * Draw one frame. `centerPx` is the icon's centre in CSS px within the
   * viewport; `opacity` comes from `envelope`.
   *
   * Redundant draws are skipped on a state signature rather than on a clock —
   * with nothing animating there is no reason to re-run a ~109-fetch-per-pixel
   * shader while the reader holds still.
   */
  draw(
    idx: number,
    centerPx: [number, number],
    pointerPx: [number, number],
    opacity: number
  ) {
    if (!this.renderer) return;
    this.canvas.style.opacity = String(opacity);
    if (opacity <= 0.002) return;

    if (idx !== this.activeIdx) {
      this.activeIdx = idx;
      void this.maskFor(idx).then((m) => {
        // a slow rasterize can land after another section became live
        if (!m || this.activeIdx !== idx) return;
        this.renderer?.setSignMask(m.canvas);
        this.exposure = m.exposure;
        this.lastKey = '';
      });
    }

    const key = `${idx}|${Math.round(centerPx[0])}|${Math.round(centerPx[1])}|${Math.round(
      pointerPx[0]
    )}|${Math.round(pointerPx[1])}|${opacity.toFixed(3)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const rs = this.renderScale;
    const gain = this.exposure * LIGHT.exposure;
    const p: RayFieldParams = {
      ...SIYANIE,
      dissolve: LIGHT.dissolve,
      godrays: LIGHT.godrays * gain,
      bloom: LIGHT.bloom * gain,
      coreIntensity: LIGHT.core * gain,
      falloffL: LIGHT.falloff,
      ca: LIGHT.ca,
      parallax: LIGHT.parallax,
      grain: 0,
      // Reference px ARE CSS px here, so the falloff keeps its hero magnitude
      // and the light decays inside the frame exactly as on the main screen.
      // Scaling the whole field to size the icon instead stretches the 1010 px
      // falloff past the frame corner, so nothing decays and it reads as grey
      // fog — measured in round 12, not guessed.
      signSize: LIGHT.px / CONTENT_FRAC,
    };

    const state: RayFieldState = {
      timeSec: 0,
      centerPx: [centerPx[0] * rs, centerPx[1] * rs],
      pointerPx: [pointerPx[0] * rs, pointerPx[1] * rs],
      scale: rs,
      // the cross's ~0.6°/s rotation reads as a bug on a bed or a cup
      signRot: 0,
      // inert at slitMix 1 — the procedural field is built and discarded — but
      // the fields are required and must stay finite (linkDist divides)
      beamAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkDist: [400, 400, 400, 400],
      linkHalfAng: [0.1, 0.1, 0.1, 0.1],
      beamHover: [0, 0, 0, 0],
      bgMix: 0,
      sceneDim: 0,
      modeMix: 0, // never warms: there is no idle showreel here
      slitMix: 1,
      layers: 4, // march steps = clamp(layers·8 + octaves·4, 12, 32) → 32
      octaves: 0,
      params: p,
    };
    this.renderer.render(state);
  }

  /** hide without tearing the context down — the reader may scroll back */
  hide() {
    this.canvas.style.opacity = '0';
  }

  destroy() {
    this.renderer?.destroy();
    this.renderer = null;
  }
}
