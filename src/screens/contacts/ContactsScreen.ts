import logoSvg from '../../assets/logo.svg?raw';
import { asset } from '../../shared/assetUrl';
import { rasterizeMask, maskCoverage, maskToOverlayUrl } from '../../shared/rasterizeMask';
import { SmoothPointer } from '../../shared/pointer';
import { getPerfTier } from '../../shared/performanceTier';
import { selectBackend } from '../../gpu/capabilities';
import { VARIANTS } from '../main/variants';
import { ControlPanel, type ControlSpec, type ControlValues } from './ControlPanel';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';

/**
 * TEMPORARY — «Контакты» as an icon showcase, with an admin panel.
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
 * - The «Сияние» preset is read back out of `VARIANTS`, so the panel's defaults
 *   start from the shipped hero rather than from invented numbers.
 * - ONE canvas, not one per icon. The scroll position picks which icon is live
 *   and the mask is swapped on the boundary, so "the lights must not overlap"
 *   is true by construction, there are not seven GPU contexts, and **icon count
 *   does not enter the per-frame cost at all** — seven icons cost exactly what
 *   one costs. The expense is fill rate (~109 texture fetches per pixel), which
 *   is why `rs` (render scale) and `steps` are panel handles.
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
 * Where the icon's centre sits inside its slide, as fractions of the slide.
 *
 * `corner` comes from the client's layout: it divides a slide into 4 columns ×
 * 3 rows and puts the icon on the FIRST gridline of each axis — the col-1/col-2
 * seam and the row-1/row-2 seam, i.e. the upper-left third. `center` is the
 * original composition and stays the default.
 *
 * Fractions rather than px because a slide is one viewport and every viewport is
 * a different size. Both numbers feed `centerPx` (the shader's convergence
 * point) AND the DOM overlay, so the crisp icon and its light cannot drift apart.
 */
const ICON_POS: Record<string, readonly [number, number]> = {
  center: [1 / 2, 1 / 2],
  corner: [1 / 4, 1 / 3],
};

/**
 * `#rrggbb` → the shader's per-channel light multiplier.
 *
 * NORMALISED so the brightest channel is 1: the wheel is a HUE dial, and
 * `exposure` stays the only brightness dial. Un-normalised, picking a deep
 * blue would also dim the page by ~60% and the obvious suspect is the wrong
 * slider. Saturation still costs light in the OTHER channels, which is correct
 * — that is what makes a colour a colour.
 *
 * The components are used as authored, NOT gamma-decoded to linear. This is a
 * designer's dial, not a photometric one: dragging to a mid-blue should give a
 * mid-blue light, and sRGB→linear would land it much darker and more saturated
 * than the swatch it was picked from.
 */
function lightTint(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  const rgb: [number, number, number] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  // pure black would extinguish the light entirely and read as a broken page
  if (peak <= 0) return [1, 1, 1];
  return [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak];
}

/** the «Сияние» preset, read back rather than copied, so it cannot drift */
const SIYANIE: RayFieldParams = VARIANTS.find((v) => v.id === 'siyanie')!.params;

/**
 * The panel schema.
 *
 * EVERY handle here is live. At `slitMix: 1` the shader builds the procedural
 * field and then discards it (`col = mix(field, slit, 1)`), so `dustAmount`,
 * `dustScale`, `moteAmount`, `hazeBase`, `primaryIntensity`, `primaryK`,
 * `sec*`, `channelDark`, `refraction`, `fiberDrift`, `angleWarp`, `ghosting`,
 * `shadow`, `rotSpeed`, `coreRadius`, `crossSize` and `crossIntensity` do
 * NOTHING on this page and are deliberately absent — dead sliders are worse
 * than no panel.
 *
 * Keys double as URL params, so `?dissolve=0&px=800` still works and simply
 * seeds the panel.
 */
const CONTROLS: ControlSpec[] = [
  { key: 'dissolve', label: 'dissolve', min: 0, max: 1, step: 0.01, group: 'Light',
    hint: 'THE clarity dial. 1 deletes the crisp icon entirely and leaves only glow.' },
  { key: 'core', label: 'core', min: 0, max: 3, step: 0.05, group: 'Light',
    hint: 'Brightness of the crisp icon. Only visible below dissolve 1.' },
  { key: 'godrays', label: 'godrays', min: 0, max: 3, step: 0.05, group: 'Light',
    hint: 'Radial trails streaming out through the shape.' },
  { key: 'bloom', label: 'bloom', min: 0, max: 3, step: 0.05, group: 'Light',
    hint: 'Soft halo around the shape.' },
  { key: 'falloff', label: 'reach', min: 200, max: 2000, step: 10, group: 'Light',
    hint: 'How far light carries, px. Low = light on black; high = fog.' },
  { key: 'exp', label: 'exposure', min: 0.2, max: 3, step: 0.05, group: 'Light',
    hint: 'Trim on top of the per-icon coverage normalisation.' },
  { key: 'ca', label: 'rainbow', min: 0, max: 0.08, step: 0.002, group: 'Light',
    hint: 'Chromatic fringing on the ray edges.' },
  { key: 'light', label: 'light colour', kind: 'color', group: 'Light',
    hint: 'Colour of the light itself. Hue only — brightness stays on exposure. The hot core still blooms to white; the falloff carries the colour.' },

  // The two noise sources that actually exist on a BLACK page. The global
  // `#grain` overlay is NOT one of them and deliberately has no handle: it
  // blends with `mix-blend-mode: overlay`, and overlay against black is
  // arithmetically a no-op (b < 0.5 ⇒ 2·b·s, which is 0 at b = 0). Measured
  // Δmean 0.02 across its whole range — it reads on the blue main screen and
  // cannot read here.
  { key: 'grain', label: 'grain', min: 0, max: 0.2, step: 0.005, group: 'Noise',
    hint: 'Shader film grain added after the tone curve.' },
  { key: 'steps', label: 'march steps', min: 12, max: 32, step: 1, group: 'Noise',
    hint: 'The BIG one. Low steps = visible dither speckle in the rays; 32 = smooth, and most GPU.' },

  { key: 'pos', label: 'position', kind: 'choice', group: 'Geometry',
    options: [{ value: 'center', label: 'Center' }, { value: 'corner', label: 'Corner' }],
    hint: 'Where the icon sits in the slide. Corner = the client 4×3 grid, first gridline on each axis (upper-left third).' },
  { key: 'px', label: 'icon size', min: 200, max: 1200, step: 10, group: 'Geometry',
    hint: 'Apparent size of the icon ink, CSS px.' },
  { key: 'parallax', label: 'cursor push', min: 0, max: 2, step: 0.05, group: 'Geometry',
    hint: 'How much the cursor shifts the light behind the shape.' },

  { key: 'svg', label: 'SVG opacity', min: 0, max: 1, step: 0.01, group: 'Overlay',
    hint: 'The actual crisp icon laid over the light.' },

  { key: 'breathe', label: 'breathe', min: 0, max: 1, step: 0.02, group: 'Motion' },
  { key: 'shimmer', label: 'shimmer', min: 0, max: 1, step: 0.02, group: 'Motion' },
  { key: 'freeze', label: 'freeze', min: 0, max: 1, step: 1, group: 'Motion',
    hint: 'Stops the clock and skips redraws while nothing moves — steady stills, less GPU.' },

  { key: 'bg', label: 'page colour', kind: 'color', group: 'Page',
    hint: 'Background behind the light. Works because the canvas composites with mix-blend-mode: screen.' },

  { key: 'rs', label: 'render scale', min: 0.5, max: 2, step: 0.05, group: 'Performance',
    hint: 'THE perf dial — cost is quadratic in this. 1.0 ≈ 60fps, 2.0 ≈ 30fps.' },
];

interface IconMask {
  canvas: HTMLCanvasElement;
  /** hero-matching exposure multiplier for godrays/bloom */
  exposure: number;
  /** crisp white icon for the DOM overlay, derived from the mask's R channel */
  overlayUrl: string;
}

export class ContactsScreen {
  el: HTMLElement;
  onNavigate: (to: 'main') => void = () => {};

  private canvas!: HTMLCanvasElement;
  private scroller!: HTMLElement;
  private overlay!: HTMLImageElement;
  private renderer: RayFieldRenderer | null = null;
  private rendererPending = false;
  private masks: (IconMask | null)[] = ICONS.map(() => null);
  private activeIdx = -1;
  private exposure = 1;

  /** parsed once per panel change rather than per frame — see applySideEffects */
  private tint: [number, number, number] = [1, 1, 1];

  private pointer = new SmoothPointer();
  private tier = getPerfTier();
  private panel!: ControlPanel;
  private v: ControlValues;

  private running = false;
  private raf = 0;
  private lastT = 0;
  private timeSec = 0;
  /** last rendered state signature — lets `freeze` skip redundant draws */
  private lastKey = '';

  constructor(el: HTMLElement) {
    this.el = el;
    this.el.classList.add('hidden');
    this.build();

    // The designer's own settings, dialled in on the live panel and handed over
    // verbatim as a "Copy URL" link — not re-derived here. Notable choices:
    // a much smaller icon (220 vs 640), no shader grain, no SVG overlay, and
    // `freeze` ON, which stops the clock (so `breathe`/`shimmer` sit inert
    // until freeze is turned off) and skips redraws while nothing moves.
    const defaults: ControlValues = {
      dissolve: 0.36,
      core: 0.45,
      godrays: 1.75,
      bloom: 1.05,
      falloff: 1010,
      exp: 1.3,
      ca: 0.028,
      grain: 0,
      steps: 32,
      pos: 'center',
      px: 220,
      parallax: 2,
      svg: 0,
      breathe: 1,
      shimmer: 0.6,
      freeze: 1,
      light: '#ffffff',
      bg: '#000000',
      rs: this.tier.renderScale,
    };

    this.panel = new ControlPanel(this.el, CONTROLS, defaults);
    this.v = this.panel.values;
    this.panel.onChange = (v) => {
      this.v = v;
      this.applySideEffects();
      this.lastKey = ''; // force a redraw even when frozen
    };
  }

  private build() {
    this.el.id = this.el.id || 'screen-contacts';
    this.el.classList.add('contacts');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    this.el.appendChild(this.canvas);

    // the crisp icon over the light. Its source is the MASK's R channel, so it
    // shares the light's footprint and centre exactly — no per-icon margin
    // arithmetic. The mask is pre-mirrored to cancel the renderers' upload
    // flip, so the DOM copy has to be mirrored back: scaleY(-1).
    this.overlay = document.createElement('img');
    this.overlay.className = 'fx-overlay';
    this.overlay.alt = '';
    this.el.appendChild(this.overlay);

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

  /** panel values are mixed-type now (colours are strings) — read numbers here */
  private n(key: string): number {
    return Number(this.v[key]);
  }

  /** panel values that live outside the shader state */
  private applySideEffects() {
    this.layout();
    this.overlay.style.opacity = String(this.n('svg'));
    this.tint = lightTint(String(this.v.light ?? '#ffffff'));
    // The canvas composites with `mix-blend-mode: screen`, so this shows
    // through wherever the light is dark. Screen against black reduces to the
    // canvas itself, which is why turning it on changed nothing at #000000.
    this.el.style.background = String(this.v.bg ?? '#000000');
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
      this.activeIdx = -1; // force the first mask upload
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
        flipY: true, // cancels the renderers' Y-flipped upload; see rasterizeMask
      });
      const coverage = maskCoverage(canvas);
      const m: IconMask = {
        canvas,
        exposure: coverage > 0 ? REF_COVERAGE / coverage : 1,
        overlayUrl: maskToOverlayUrl(canvas),
      };
      this.masks[i] = m;
      return m;
    } catch (err) {
      console.warn(`[kresty] contacts: mask failed for ${ICONS[i]}`, err);
      return null;
    }
  }

  private layout = () => {
    const rs = this.v ? this.n('rs') : this.tier.renderScale;
    this.renderer?.resize(Math.round(innerWidth * rs), Math.round(innerHeight * rs));
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.el.classList.remove('hidden');
    this.pointer.attach();
    addEventListener('resize', this.layout);
    this.applySideEffects();
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
      if (!this.n('freeze')) this.timeSec += dt;
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
    const idx = Math.max(0, Math.min(ICONS.length - 1, Math.round(scrollTop / sectionH)));
    if (idx !== this.activeIdx) {
      this.activeIdx = idx;
      void this.maskFor(idx).then((m) => {
        // a slow rasterize could land after another snap — only upload if the
        // section is still the live one
        if (!m || this.activeIdx !== idx) return;
        this.renderer?.setSignMask(m.canvas);
        this.exposure = m.exposure;
        this.overlay.src = m.overlayUrl;
        this.lastKey = '';
      });
    }

    const rs = this.n('rs');
    // the light rides with its section, so scrolling translates it rather than
    // cutting between two stationary lights. The `sectionH * ICON_Y_FRAC` term
    // is the offset INSIDE the section, so it rides along untouched.
    const [fx, fy] = ICON_POS[String(this.v.pos)] ?? ICON_POS.center;
    const cx = this.scroller.clientWidth * fx;
    const cy = idx * sectionH + sectionH * fy - scrollTop;

    // `freeze` is not just a clock stop: with nothing moving there is no reason
    // to re-run a 109-fetch-per-pixel shader every frame. `cx` is in the key
    // only because a resize moves it without moving anything else in here.
    const key = `${idx}|${Math.round(cx)}|${Math.round(cy)}|${Math.round(this.pointer.smooth.x)}|${Math.round(this.pointer.smooth.y)}`;
    if (this.n('freeze') && key === this.lastKey) return;
    this.lastKey = key;

    const signSize = this.n('px') / CONTENT_FRAC;

    // the overlay shares the light's footprint by construction; mirror it back,
    // since the mask itself is pre-mirrored for the GPU
    this.overlay.style.width = `${signSize}px`;
    this.overlay.style.height = `${signSize}px`;
    this.overlay.style.transform =
      `translate(${cx - signSize / 2}px, ${cy - signSize / 2}px) scaleY(-1)`;

    // exposure normalisation: a solid silhouette carries 2–3.6× the ink of the
    // emblem, and the march is linear in that, so the preset's own numbers
    // would white out. See REF_COVERAGE.
    const gain = this.exposure * this.n('exp');
    const p: RayFieldParams = {
      ...SIYANIE,
      dissolve: this.n('dissolve'),
      godrays: this.n('godrays') * gain,
      bloom: this.n('bloom') * gain,
      coreIntensity: this.n('core') * gain,
      falloffL: this.n('falloff'),
      ca: this.n('ca'),
      parallax: this.n('parallax'),
      breathe: this.n('breathe'),
      shimmer: this.n('shimmer'),
      grain: this.n('grain'),
      lightR: this.tint[0],
      lightG: this.tint[1],
      lightB: this.tint[2],
      // Reference px are CSS px here, so `falloffL` and friends keep their HERO
      // MAGNITUDE and the light decays inside the frame exactly as on the main
      // screen. Only the APERTURE grows to make the icon the requested size.
      // Scaling everything instead ("the hero zoomed 1.8×") also stretches the
      // 780px falloff to ~1414px, past the corner of a 1440×900 frame, so the
      // rays never decay and the page reads as grey fog. Measured, not guessed.
      signSize,
    };

    // march steps without a shader change: N = clamp(layers·8 + octaves·4, 12,
    // 32), and at slitMix 1 layers/octaves affect nothing else on this page
    const steps = this.n('steps');

    const state: RayFieldState = {
      timeSec: this.timeSec,
      centerPx: [cx * rs, cy * rs],
      pointerPx: [this.pointer.smooth.x * rs, this.pointer.smooth.y * rs],
      scale: rs,
      signRot: 0,
      // inert: the procedural field is discarded at slitMix 1, but the fields
      // are required and must stay finite (linkDist divides)
      beamAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      linkDist: [400, 400, 400, 400],
      linkHalfAng: [0.1, 0.1, 0.1, 0.1],
      beamHover: [0, 0, 0, 0],
      bgMix: 0,
      sceneDim: 0,
      modeMix: 0, // never warms — there is no showreel here
      slitMix: 1,
      layers: steps / 8,
      octaves: 0,
      params: p,
    };
    this.renderer.render(state);
  }
}
