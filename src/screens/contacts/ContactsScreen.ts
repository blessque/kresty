import logoSvg from '../../assets/logo.svg?raw';
import { asset } from '../../shared/assetUrl';
import { rasterizeMask, maskCoverage } from '../../shared/rasterizeMask';
import { SmoothPointer } from '../../shared/pointer';
import { getPerfTier } from '../../shared/performanceTier';
import { selectBackend } from '../../gpu/capabilities';
import { VARIANTS } from '../main/variants';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';

/**
 * TEMPORARY — «Контакты» as an icon showcase.
 *
 * Not a designed screen. It exists so the client's own icons can be shot for a
 * presentation wearing the main screen's light: a black page, one icon per full
 * viewport, scroll-snapped so the live icon is always dead centre.
 *
 * How it reuses the hero rather than imitating it:
 *
 * - `slitLight()` never referenced the emblem. It reads a three-channel mask
 *   through `signMask`/`signMaskSoft`/`signMaskRay`, and `setSignMask()` takes
 *   any `TexImageSource` — so the effect transfers with ZERO shader changes.
 * - The «Сияние» preset is read back out of `VARIANTS` verbatim, so `signSize`,
 *   `falloffL`, `godrays`, `bloom`, `ca` and the rest cannot drift from the
 *   shipped hero. Apparent size is set by ONE dial (`ICON_PX`) via `scale`,
 *   which moves everything together: this is the main screen zoomed, not the
 *   main screen re-tuned.
 * - ONE canvas, not one per icon. The scroll position picks which icon is live
 *   and the mask is swapped on the boundary, so "the lights must not overlap"
 *   is true by construction, and there are not seven GPU contexts.
 *
 * Three deliberate departures from the hero, all requested:
 *   `signRot` 0  — the cross's ~0.6°/s rotation reads as a bug on a bed
 *   `modeMix` 0  — the warm amber register is driven by the idle showreel,
 *                  which this page does not have ("not going warm on delay")
 *   no burst      — steady state, so a screenshot is the same every time
 */

/** Icon order, top to bottom. Files live in `public/resources/`. */
const ICONS = [
  'Bed-640.svg',
  'Cup-640.svg',
  'Office-640.svg',
  'Park-640.svg',
  'Restaurant-640.svg',
  'SPA-640.svg',
  'Window-640.svg',
];

/** Apparent size of an icon's ink, CSS px. `?px=` overrides. */
const ICON_PX = 640;

/**
 * Fraction of the mask an icon's ink should span — matched to `sign.svg`, which
 * carries ~14.7% margin inside its own viewBox. The supplied icons range from
 * 4.4% (Park) to 12.5% (Window), so without normalising they would render at
 * visibly different sizes AND the tight ones would have their bloom cut along a
 * straight line where `signMask()` hard-zeros outside the footprint.
 */
const CONTENT_FRAC = 0.706;

/**
 * Mean ink coverage of `sign.svg`'s mask — MEASURED, not guessed (0.0806).
 *
 * This is the exposure the «Сияние» preset is tuned against. The emblem is a
 * starburst of thin slivers; the supplied icons are solid silhouettes averaging
 * 0.17–0.29, and because the god-ray march is linear in coverage they render
 * 2.1–3.6× too hot on the identical uniforms — a white-out, not a light. Every
 * icon's `godrays`/`bloom` are divided by its own coverage ratio so the LIGHT
 * matches the hero even though the artwork does not.
 */
const REF_COVERAGE = 0.0806;

/**
 * Trim applied on top of the coverage normalisation. Coverage corrects for how
 * much INK a shape has; it cannot correct for the aperture being wider than the
 * hero's (500 → 906 ref px for a 640px icon), which lengthens the part of every
 * god-ray march that runs inside the footprint. Tuned by measuring the rendered
 * frame, not by eye. `?exp=` overrides.
 */
const EXPOSURE_TRIM = 1;

/** the «Сияние» preset, read back rather than copied, so it cannot drift */
const SIYANIE: RayFieldParams = VARIANTS.find((v) => v.id === 'siyanie')!.params;

interface IconMask {
  canvas: HTMLCanvasElement;
  /** hero-matching exposure multiplier for godrays/bloom */
  exposure: number;
}

export class ContactsScreen {
  el: HTMLElement;
  onNavigate: (to: 'main') => void = () => {};

  private canvas!: HTMLCanvasElement;
  private scroller!: HTMLElement;
  private renderer: RayFieldRenderer | null = null;
  private rendererPending = false;
  private masks: (IconMask | null)[] = ICONS.map(() => null);
  private activeIdx = -1;
  /** exposure of the mask currently uploaded (1 until the first one lands) */
  private exposure = 1;

  private pointer = new SmoothPointer();
  private tier = getPerfTier();
  private running = false;
  private raf = 0;
  private lastT = 0;
  private timeSec = 0;

  /** dev overrides, mirroring the project's `?fx=` / `?ob=` convention */
  private iconPx = ICON_PX;
  private dissolve = SIYANIE.dissolve;
  /** extra exposure trim on top of the coverage normalisation, `?exp=` */
  private trim = EXPOSURE_TRIM;

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.classList.add('hidden');
    this.build();

    const q = new URLSearchParams(location.search);
    const px = Number(q.get('px'));
    if (Number.isFinite(px) && px > 0) this.iconPx = px;
    const d = Number(q.get('dissolve'));
    if (Number.isFinite(d) && q.has('dissolve')) this.dissolve = Math.max(0, Math.min(1, d));
    const t = Number(q.get('exp'));
    if (Number.isFinite(t) && t > 0) this.trim = t;
  }

  private build() {
    this.el.id = this.el.id || 'screen-contacts';
    this.el.classList.add('contacts');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    this.el.appendChild(this.canvas);

    this.scroller = document.createElement('div');
    this.scroller.className = 'fx-scroll';
    for (const name of ICONS) {
      const section = document.createElement('section');
      section.className = 'fx-section';
      section.dataset.icon = name;
      this.scroller.appendChild(section);
    }
    this.el.appendChild(this.scroller);

    const home = document.createElement('a');
    home.className = 'fx-home';
    home.href = '#';
    home.innerHTML = logoSvg;
    home.setAttribute('aria-label', 'На главную');
    home.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('main');
    });
    this.el.appendChild(home);
  }

  /**
   * Lazy: a second WebGPU device / WebGL2 context is only worth paying for if
   * the page is actually visited. Idempotent — the render loop simply draws
   * nothing until this resolves.
   */
  private async ensureRenderer(): Promise<void> {
    if (this.renderer || this.rendererPending) return;
    this.rendererPending = true;
    try {
      const backend = await selectBackend();
      if (backend === 'webgpu') {
        try {
          const { WebGPURayFieldRenderer } = await import('../../gpu/webgpu/WebGPURayFieldRenderer');
          const r = new WebGPURayFieldRenderer();
          await r.init(this.canvas);
          this.renderer = r;
        } catch (err) {
          console.warn('[kresty] contacts: WebGPU init failed, falling back to WebGL2', err);
        }
      }
      if (!this.renderer) {
        const { WebGL2RayFieldRenderer } = await import('../../gpu/webgl2/WebGL2RayFieldRenderer');
        const r = new WebGL2RayFieldRenderer();
        await r.init(this.canvas);
        this.renderer = r;
      }
      console.info(`[kresty] contacts backend: ${this.renderer.backend}`);
      this.layout();
      // force the first mask upload on the next frame
      this.activeIdx = -1;
    } finally {
      this.rendererPending = false;
    }
  }

  /** rasterized once, then cached — the upload only happens on a snap boundary */
  private async maskFor(i: number): Promise<IconMask | null> {
    const cached = this.masks[i];
    if (cached) return cached;
    try {
      const canvas = await rasterizeMask(asset(`/resources/${ICONS[i]}`), {
        contentFrac: CONTENT_FRAC,
      });
      const coverage = maskCoverage(canvas);
      const m: IconMask = {
        canvas,
        exposure: coverage > 0 ? REF_COVERAGE / coverage : 1,
      };
      this.masks[i] = m;
      return m;
    } catch (err) {
      console.warn(`[kresty] contacts: mask failed for ${ICONS[i]}`, err);
      return null;
    }
  }

  private layout = () => {
    const w = Math.round(innerWidth * this.tier.renderScale);
    const h = Math.round(innerHeight * this.tier.renderScale);
    this.renderer?.resize(w, h);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.el.classList.remove('hidden');
    this.pointer.attach();
    addEventListener('resize', this.layout);
    void this.ensureRenderer();

    // `?icon=N` jumps straight to one section — the hook a headless screenshot
    // pass uses, so the deck assets are reproducible
    const want = Number(new URLSearchParams(location.search).get('icon'));
    if (Number.isFinite(want) && want >= 0 && want < ICONS.length) {
      requestAnimationFrame(() => {
        this.scroller.scrollTop = want * this.scroller.clientHeight;
      });
    }

    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.timeSec += dt;
      this.pointer.update(dt);
      this.update();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    this.pointer.detach();
    removeEventListener('resize', this.layout);
  }

  private update() {
    if (!this.renderer) return;
    const sectionH = this.scroller.clientHeight;
    if (sectionH <= 0) return;

    // which icon is live: nearest section centre to the viewport centre
    const scrollTop = this.scroller.scrollTop;
    const idx = Math.max(
      0,
      Math.min(ICONS.length - 1, Math.round(scrollTop / sectionH)),
    );
    if (idx !== this.activeIdx) {
      this.activeIdx = idx;
      void this.maskFor(idx).then((m) => {
        // a slow rasterize could land after another snap — only upload if the
        // section is still the live one
        if (!m || this.activeIdx !== idx) return;
        this.renderer?.setSignMask(m.canvas);
        this.exposure = m.exposure;
      });
    }

    const rs = this.tier.renderScale;
    // the light rides with its section, so scrolling translates it rather than
    // cutting between two stationary lights
    const cx = this.scroller.clientWidth / 2;
    const cy = idx * sectionH + sectionH / 2 - scrollTop;

    // exposure normalisation: a solid silhouette carries 2–3.6× the ink of the
    // emblem, and the march is linear in that, so the preset's own numbers
    // would white out. See REF_COVERAGE.
    const p: RayFieldParams = { ...SIYANIE, dissolve: this.dissolve };
    p.godrays *= this.exposure * this.trim;
    p.bloom *= this.exposure * this.trim;
    p.coreIntensity *= this.exposure * this.trim; // inert at dissolve 1; matters via ?dissolve=

    // Reference px are CSS px here, so `falloffL` and friends keep their HERO
    // MAGNITUDE and the light decays inside the frame exactly as it does on the
    // main screen. Only the aperture grows to make the icon the requested size.
    //
    // The rejected alternative was scaling everything together (`scale =
    // iconPx / (signSize·CONTENT_FRAC)`): that is "the hero zoomed 1.8×", which
    // also stretches the 780px falloff to ~1414px — past the corner of a
    // 1440×900 frame — so the rays never decay and the whole page reads as grey
    // fog instead of light on black. Measured, not guessed.
    const scale = rs;
    p.signSize = this.iconPx / CONTENT_FRAC;

    const state: RayFieldState = {
      timeSec: this.timeSec,
      centerPx: [cx * rs, cy * rs],
      pointerPx: [this.pointer.smooth.x * rs, this.pointer.smooth.y * rs],
      scale,
      signRot: 0,
      // inert: «Сияние» runs the procedural field at zero intensity, but the
      // fields are required and must stay finite (linkDist divides)
      beamAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkDist: [400, 400, 400, 400],
      linkHalfAng: [0.1, 0.1, 0.1, 0.1],
      beamHover: [0, 0, 0, 0],
      bgMix: 0,
      sceneDim: 0,
      modeMix: 0, // never warms — there is no showreel here
      slitMix: 1,
      layers: this.tier.layers,
      octaves: this.tier.octaves,
      params: p,
    };
    this.renderer.render(state);
  }
}
