import logoSvg from '../../assets/logo.svg?raw';
import alsLogoSvg from '../../assets/als-logo.svg?raw';
import signSvg from '../../assets/sign.svg?raw';
import {
  STAGE_W,
  STAGE_H,
  CENTER_X,
  CENTER_Y,
  NAV_LINKS,
  LOGO_DESCRIPTOR,
  CONTACT_CTA,
  stageScale,
} from './layout';
import { asset } from '../../shared/assetUrl';
import { bindShortWords } from '../../shared/ruTypography';
import { VARIANTS, variantIndexFromUrl, SWITCHER_COUNT } from './variants';
import { Showreel } from './Showreel';
import { PhotoSlider } from './PhotoSlider';
import { selectBackend } from '../../gpu/capabilities';
import { lerpParams } from '../../gpu/rayFieldTypes';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';
import { SmoothPointer } from '../../shared/pointer';
import { getPerfTier } from '../../shared/performanceTier';
import { rasterizeMask } from '../../shared/rasterizeMask';

/** Variants whose look is the logo-slit light (drive slitMix + the burst). */
const SLIT_IDS = new Set(['siyanie', 'prorez', 'slider']);

/**
 * The shader's link slots are a vec4 and the nav is no longer four links long.
 * This truncates (or zero-pads) to the four the procedural field can carry —
 * which the shipped variant discards anyway. See rayFieldTypes.ts.
 */
function quad(a: number[]): [number, number, number, number] {
  return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0];
}

/**
 * Slow continuous rotation of the whole light cross, rad/s (round 7).
 * ~0.6°/s — a quarter turn in ≈2.5 min: alive, never distracting. Drives the
 * slit-mask sampling (signRot) AND the procedural beam base angles, so every
 * variant turns in lockstep; cursor wind/parallax stay screen-true on top.
 */
const ROT_SPEED = 0.0105;

/**
 * Length of the light's dip on a slide throw, seconds. A half-sine, so it peaks
 * at half this — which must coincide with the cross-fade's midpoint. Mirrors
 * `FADE_DELAY + FADE_MS / 2` in PhotoSlider.ts (round 9: 150 + 400 = 550ms).
 */
const SLIDE_DIP_S = 1.1;

export class MainScreen {
  el: HTMLElement;
  onNavigate: (to: 'concept' | 'contacts') => void = () => {};

  private canvas!: HTMLCanvasElement;
  private stage!: HTMLElement;
  private renderer: RayFieldRenderer | null = null;
  private pointer = new SmoothPointer();
  private showreel!: Showreel;
  private photoSlider!: PhotoSlider;
  /** seconds since the last slide throw — drives the light dip (round 8) */
  private slideT = 10;
  private tier = getPerfTier();

  private raf = 0;
  private running = false;
  private lastT = 0;
  private timeSec = 0;

  private variantIndex = variantIndexFromUrl();
  private params: RayFieldParams = { ...VARIANTS[this.variantIndex].params };
  /** segmented-control crossfade between variant presets */
  private paramsFrom: RayFieldParams | null = null;
  private paramsTo: RayFieldParams | null = null;
  private paramsBlend = 1;
  private fxButtons: HTMLButtonElement[] = [];
  private fxSwitch!: HTMLDivElement;

  /** 0..1 transition converge amount, driven by TransitionController */
  converge = 0;
  private corners!: HTMLElement;
  /**
   * 0..1 — how much of the screen exists at all. 1 is normal and short-circuits
   * every path below, so this costs nothing when the seam is not running.
   */
  private reveal = 1;

  /*
   * ROUND 11: these are sized from NAV_LINKS, not fixed 4-tuples. The link
   * count is a product decision that has now changed once; the shader's
   * `vec4` beam slots are a rendering constraint that has NOT changed. Keeping
   * them separate is what let five links land without touching the beam math —
   * see `measureBeams()`.
   */
  private hoverTarget = NAV_LINKS.map(() => 0);
  private hover = NAV_LINKS.map(() => 0);
  /**
   * Bisector directions between adjacent links — beams strike BETWEEN links.
   * Still exactly BEAM_COUNT of them regardless of how many links there are.
   */
  private baseBeamAngles: [number, number, number, number] = [0, 0, 0, 0];
  private beamAngles: [number, number, number, number] = [0, 0, 0, 0];
  /** measured link directions, index-aligned with linkEls/hover */
  private linkAngles = NAV_LINKS.map(() => 0);
  private linkDist = NAV_LINKS.map(() => 0);
  private linkHalfAng = NAV_LINKS.map(() => 0);
  /** CPU-side reduction of the hover lean over ALL links — see rayFieldTypes */
  private hoverDir: [number, number] = [0, 0];
  private hoverAmt = 0;
  private linkEls: HTMLElement[] = [];
  private hoverScene!: HTMLElement;
  private hoverImgs: HTMLImageElement[] = [];
  private lastHovered = 0;
  private sceneDim = 0;
  /** 0 holographic white/rainbow (blue bg) → 1 dusty amber (dark scene) */
  private modeMix = 0;
  /** 0 procedural field («Призма») → 1 logo-slit light («Сияние»/«Прорезь») */
  private slitMix = SLIT_IDS.has(VARIANTS[this.variantIndex].id) ? 1 : 0;
  /** seconds since a slit variant became active — drives the appearance burst */
  private burstT = 0;

  constructor(container: HTMLElement) {
    this.el = container;
    this.buildDom();
  }

  /**
   * The slider must not take the screen while the pointer rests on a nav link —
   * the hover "gallery dark" scene is the hero interaction and owns that moment.
   */
  private syncSliderHoverGate() {
    this.photoSlider?.setHoverBlocked(this.hoverTarget.some((v) => v > 0));
  }

  private buildDom() {
    this.el.innerHTML = '';

    this.showreel = new Showreel(this.el);

    // hover "gallery dark" scene: black drop + per-section image under the light
    this.hoverScene = document.createElement('div');
    this.hoverScene.className = 'hover-scene';
    const dark = document.createElement('div');
    dark.className = 'hover-dark';
    this.hoverScene.appendChild(dark);
    // Index-aligned with NAV_LINKS (positional coupling — keep the order, and
    // keep the LENGTH: `lastHovered` indexes straight into this, so a link
    // without an entry would hover to `undefined`).
    //
    // ROUND 21: the client re-paired all five. Round 11 had picked them by
    // "closest slide photo by meaning" and gave «О «Крестах»» the plan render
    // on the strength of Figma frame 340:594; the client's set instead reads
    // the render as the whole COMPLEX, which is what «Аренда» is letting. It is
    // a clean permutation — every photo was already in the set, and
    // `kids-playground.webp` drops out of the hover layer (it stays slide 2).
    const hoverImages = [
      '/resources/skies.webp', // Музей — sky over the water
      '/resources/atrium-roof.webp', // О «Крестах» — the cross-shaped block from above
      '/resources/table.webp', // Контакты — people around the table
      '/resources/concept-plan.webp', // Аренда — the full complex, hover-only, never a slide
      '/resources/forum.webp', // События — the speaker at a meetup
    ];
    for (const src of hoverImages) {
      const img = document.createElement('img');
      img.src = asset(encodeURI(src));
      img.alt = '';
      this.hoverScene.appendChild(img);
      this.hoverImgs.push(img);
    }
    this.el.appendChild(this.hoverScene);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ray-canvas';
    this.el.appendChild(this.canvas);

    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.el.appendChild(this.stage);

    // Corner furniture (logo, news, studio mark) is pinned to the VIEWPORT, not
    // to the stage. The stage is a fixed 1440×800 box under a contain-fit
    // `scale(s)`, so a child at `left: 32px` renders at
    // `(innerWidth − 1440·s)/2 + 32·s` from the window edge — both terms grow
    // with the window, which is why the corners crept inward on a wide monitor.
    // Only geometry that must stay locked to the light centre (the nav links,
    // the slider headline) belongs in the stage.
    const corners = document.createElement('div');
    corners.className = 'corners';
    this.corners = corners;
    this.el.appendChild(corners);

    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = logoSvg;
    logo.setAttribute('aria-label', 'Кресты');
    corners.appendChild(logo);

    // Round 11: the descriptor under the wordmark (Figma 844:125). It is a
    // sibling of the logo rather than a child, so the logo box stays the exact
    // 251.2×40 it is on every other page.
    const descriptor = document.createElement('p');
    descriptor.className = 'logo-descriptor';
    descriptor.textContent = bindShortWords(LOGO_DESCRIPTOR);
    corners.appendChild(descriptor);

    // Round 11: «Связаться», top right (Figma 840:40). `.corners` is
    // pointer-events: none, so an interactive child has to opt back in.
    const cta = document.createElement('a');
    // ROUND 21: the designer's button component (styles/button.css). `.btn`
    // alone is main·ondark — a white plate with blue ink — which is exactly what
    // this corner needs on the blue field. `.contact-cta` now carries POSITION
    // only.
    cta.className = 'btn contact-cta';
    cta.href = '#contacts';
    cta.textContent = CONTACT_CTA;
    cta.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('contacts');
    });
    corners.appendChild(cta);

    NAV_LINKS.forEach((spec, i) => {
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.id = `nav-${spec.id}`;
      a.href = spec.route ? `#${spec.route}` : '#';
      a.style.left = `${spec.x}px`;
      a.style.top = `${spec.y}px`;
      // data-label feeds the ::after engraved-echo copy on hover
      a.innerHTML = `<span class="nav-rot" data-label="${spec.label}" style="transform: rotate(${spec.rot}deg)">${spec.label}</span>`;
      a.addEventListener('pointerenter', () => {
        this.hoverTarget[i] = 1;
        this.lastHovered = i;
        this.syncSliderHoverGate();
      });
      a.addEventListener('pointerleave', () => {
        this.hoverTarget[i] = 0;
        this.syncSliderHoverGate();
      });
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (spec.route) this.onNavigate(spec.route);
      });
      this.stage.appendChild(a);
      this.linkEls.push(a);
    });

    // bottom-right studio mark (Figma node 340:574) — the ARTLEBEDEV stroke
    // logo with its "2026" line, one vector. Replaced the «КРЕСТЫ · 2026» text
    // placeholder in round 8.
    const mark = document.createElement('div');
    mark.className = 'corner-mark';
    mark.innerHTML = alsLogoSvg;
    mark.setAttribute('aria-label', 'Артлебедев, 2026');
    corners.appendChild(mark);

    // «Слайдер» idle show (armed only on its tab; headline goes in the stage).
    // NOTE built after the nav links, whose handlers call
    // `syncSliderHoverGate()` — that method guards on `photoSlider` being set.
    this.photoSlider = new PhotoSlider(this.el, this.stage);
    this.photoSlider.onSlideStart = () => (this.slideT = 0);

    // segmented control: Сияние · Прорезь · Призма · Слайдер
    // hidden by default (pitch shows «Слайдер» only); the V key reveals it
    const fx = document.createElement('div');
    fx.className = 'fx-switch hidden';
    this.fxSwitch = fx;
    VARIANTS.slice(0, SWITCHER_COUNT).forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.label;
      b.classList.toggle('active', i === this.variantIndex);
      b.addEventListener('click', () => this.setVariant(i));
      fx.appendChild(b);
      this.fxButtons.push(b);
    });
    this.el.appendChild(fx);

    this.layout();
  }

  private setVariant(i: number) {
    if (i === this.variantIndex) return;
    this.variantIndex = i;
    this.paramsFrom = { ...this.params };
    this.paramsTo = { ...VARIANTS[i].params };
    this.paramsBlend = 0;
    // slit variants appear with the explosive burst, not a polite scale-in
    if (SLIT_IDS.has(VARIANTS[i].id)) this.burstT = 0;
    this.fxButtons.forEach((b, j) => b.classList.toggle('active', j === i));
    this.armIdleShow();
  }

  /**
   * Dev shortcut, on a physical key code so it works on the Russian layout:
   *   V — the light-variant switcher (hidden by default, as since round 6)
   * Round 9 deleted the T key with the `.tr-switch` transition picker.
   */
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyV') this.fxSwitch.classList.toggle('hidden');
  };

  /** the «Слайдер» tab arms the star slider; every other tab, the showreel */
  private armIdleShow() {
    if (!this.running) return;
    if (VARIANTS[this.variantIndex].id === 'slider') {
      this.showreel.detach();
      this.photoSlider.attach();
    } else {
      this.photoSlider.detach();
      this.showreel.attach();
    }
  }

  /** stage transform + canvas backing store */
  layout = () => {
    const s = stageScale();
    this.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    const w = Math.round(innerWidth * this.tier.renderScale);
    const h = Math.round(innerHeight * this.tier.renderScale);
    this.renderer?.resize(w, h);
    this.measureBeams();
  };

  /**
   * Link angles are measured from real rendered positions; the beams sit on
   * the BISECTORS between adjacent links — the light strikes between the
   * text, forming an upright cross (the window-grille photo motif), and is
   * free to sway without ever needing to track the links.
   */
  private measureBeams() {
    const s = stageScale();
    const stageRect = this.stage.getBoundingClientRect();
    const cx = stageRect.left + CENTER_X * s;
    const cy = stageRect.top + CENTER_Y * s;
    this.linkEls.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const lx = r.left + r.width / 2 - cx;
      const ly = r.top + r.height / 2 - cy;
      this.linkAngles[i] = Math.atan2(ly, lx);
      // distance + apparent angular half-width feed the shadow-casting wedge
      const dist = Math.hypot(lx, ly);
      this.linkDist[i] = dist / s;
      this.linkHalfAng[i] = Math.atan2(Math.max(r.width, r.height) * 0.3, dist);
    });
    const sorted = [...this.linkAngles].sort((a, b) => a - b);
    for (let i = 0; i < 4; i++) {
      const a = sorted[i];
      const b = i < 3 ? sorted[i + 1] : sorted[0] + Math.PI * 2;
      this.baseBeamAngles[i] = (a + b) / 2;
    }
  }

  async initRenderer(): Promise<void> {
    const backend = await selectBackend();
    if (backend === 'webgpu') {
      try {
        const { WebGPURayFieldRenderer } = await import('../../gpu/webgpu/WebGPURayFieldRenderer');
        const r = new WebGPURayFieldRenderer();
        await r.init(this.canvas);
        this.renderer = r;
      } catch (err) {
        console.warn('[kresty] WebGPU init failed, falling back to WebGL2', err);
      }
    }
    if (!this.renderer) {
      const { WebGL2RayFieldRenderer } = await import('../../gpu/webgl2/WebGL2RayFieldRenderer');
      const r = new WebGL2RayFieldRenderer();
      await r.init(this.canvas);
      this.renderer = r;
    }
    console.info(`[kresty] ray field backend: ${this.renderer.backend}`);
    // rasterize the emblem (sign.svg) into the slit mask; on failure the
    // «Прорезь» path falls back to the procedural cross glow (never blank)
    try {
      this.renderer.setSignMask(await rasterizeMask(signSvg, { raw: true }));
    } catch (err) {
      console.warn('[kresty] sign mask failed; «Прорезь» falls back to cross glow', err);
    }
    this.layout();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.el.classList.remove('hidden');
    this.pointer.attach();
    this.armIdleShow();
    addEventListener('resize', this.layout);
    addEventListener('keydown', this.onKeyDown);
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.timeSec += dt;
      this.update(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    this.pointer.detach();
    this.showreel.detach();
    this.photoSlider.detach();
    removeEventListener('resize', this.layout);
    removeEventListener('keydown', this.onKeyDown);
  }

  private update(dt: number) {
    // hover easing: 150ms in, 300ms out — over every link, not a fixed four
    let hx = 0;
    let hy = 0;
    let ha = 0;
    for (let i = 0; i < this.hover.length; i++) {
      const target = this.hoverTarget[i];
      const tau = target > this.hover[i] ? 0.06 : 0.13;
      this.hover[i] += (target - this.hover[i]) * (1 - Math.exp(-dt / tau));
      // the slit light's lean, summed here rather than in the fragment shader
      ha += this.hover[i];
      hx += this.hover[i] * Math.cos(this.linkAngles[i]);
      hy += this.hover[i] * Math.sin(this.linkAngles[i]);
    }
    this.hoverDir = [hx, hy];
    this.hoverAmt = ha;
    this.pointer.update(dt);

    // living beams: slow continuous rotation of the whole cross (replaces the
    // old ±8° sway) plus small independent per-beam wander
    const t = this.timeSec;
    const rot = t * ROT_SPEED;
    for (let i = 0; i < 4; i++) {
      const wander = 0.035 * Math.sin(t * 0.23 + i * 2.1) + 0.02 * Math.sin(t * 0.11 + i * 4.7);
      this.beamAngles[i] = this.baseBeamAngles[i] + rot + wander;
    }

    // hover gallery-dark scene: rise 250ms, release 500ms
    const sceneTarget = Math.max(...this.hoverTarget);
    const sceneTau = sceneTarget > this.sceneDim ? 0.1 : 0.22;
    this.sceneDim += (sceneTarget - this.sceneDim) * (1 - Math.exp(-dt / sceneTau));
    this.hoverScene.style.opacity = String(this.sceneDim);
    this.hoverImgs.forEach((img, i) => img.classList.toggle('visible', i === this.lastHovered));

    // white light lives on blue only: any dark scene flips the dusty register
    const modeTarget = Math.max(this.sceneDim, this.showreel.dark);
    this.modeMix += (modeTarget - this.modeMix) * (1 - Math.exp(-dt / 0.3));

    // crossfade between the procedural field and the logo-slit light
    const slitTarget = SLIT_IDS.has(VARIANTS[this.variantIndex].id) ? 1 : 0;
    this.slitMix += (slitTarget - this.slitMix) * (1 - Math.exp(-dt / 0.4));

    // segmented-control crossfade between variant presets
    if (this.paramsBlend < 1 && this.paramsFrom && this.paramsTo) {
      this.paramsBlend = Math.min(1, this.paramsBlend + dt / 0.6);
      const e = this.paramsBlend * this.paramsBlend * (3 - 2 * this.paramsBlend);
      this.params = lerpParams(this.paramsFrom, this.paramsTo, e);
    }

    if (!this.renderer) return;
    // burst clock only runs once frames actually render (dt is clamped, so a
    // hidden tab cannot fast-forward past the flash)
    this.burstT += dt;

    // transition converge override
    let p = this.params;
    if (this.converge > 0) {
      const e = this.converge;
      p = { ...p };
      p.falloffL = p.falloffL + (85 - p.falloffL) * e;
      p.primaryIntensity *= 1 + 1.4 * e;
      p.coreRadius *= 1 + 1.8 * e;
      p.coreIntensity *= 1 + 2.0 * e;
      p.secIntensity *= 1 - e;
      p.dustAmount *= 1 - 0.6 * e;
      p.crossIntensity *= 1 + 0.8 * e;
    }

    // explosive appearance: the light smashes out of nothing — violently
    // expands from a point (~0.25 s) under a blinding flash that decays in
    // ~0.5 s. Replaces the old polite scale-in ("funny, no drama").
    if (this.burstT < 1.2 && this.slitMix > 0.01) {
      const bt = this.burstT;
      p = { ...p };
      p.signSize *= 0.25 + 0.75 * (1 - Math.exp(-bt / 0.09));
      const k = Math.exp(-bt / 0.15);
      p.godrays *= 1 + 4 * k;
      p.bloom *= 1 + 3 * k;
      p.coreIntensity *= 1 + 2.5 * k;
    }

    // Round 8: the slide throw used to SURGE (×2.4 godrays, τ 0.3s) and it
    // landed in the empty gap between headlines, which is what read as a flash
    // "at the end" of every slide. Now the light DIPS with the photos instead —
    // it joins the change and recovers as the new photo resolves.
    //
    // The window is a half-sine, so its peak sits at SLIDE_DIP_S/2; that has to
    // land on the cross-fade's midpoint, which round 9 moved to 550ms
    // (FADE_DELAY 150 + FADE_MS 800 / 2). Gated to the slider tab so a fast tab
    // switch can't leak the tail onto another variant.
    if (this.slideT < SLIDE_DIP_S && VARIANTS[this.variantIndex].id === 'slider') {
      p = { ...p };
      const k = Math.sin((this.slideT / SLIDE_DIP_S) * Math.PI); // 0 → 1 → 0
      p.godrays *= 1 - 0.22 * k;
      p.bloom *= 1 - 0.18 * k;
    }
    this.slideT += dt;

    /*
     * THE SEAM'S DARKNESS, and it has to be exact rather than merely low.
     *
     * `slitLight()` returns `core·coreIntensity + bloom·bloom + rays·godrays`,
     * all × `life`, and everything downstream in `main()` is MULTIPLICATIVE —
     * except two additive terms: `col += (g − 0.5)·u_grain` and the ±1/255
     * anti-banding dither. So zeroing the intensities is not enough on its own:
     * «Сияние» ships `grain: 0.06`, and shader noise on a flat blue field is
     * exactly the tell this seam exists to remove. `grain` is therefore in the
     * list, and with it the output is `vec3(0)` plus the dither, which is
     * sub-LSB after `mix-blend-mode: screen`.
     *
     * The procedural keys are included even though `slitMix` is 1 for the
     * shipped variant, because `slitMix` is eased and only reaches 1
     * asymptotically — this way the black is structural rather than dependent
     * on a float landing exactly on 1.0.
     */
    if (this.reveal < 1) {
      p = { ...p };
      const e = this.reveal;
      p.godrays *= e;
      p.bloom *= e;
      p.coreIntensity *= e;
      p.crossIntensity *= e;
      p.primaryIntensity *= e;
      p.secIntensity *= e;
      p.dustAmount *= e;
      p.moteAmount *= e;
      p.hazeBase *= e;
      p.grain *= e;
    }

    const s = stageScale();
    const rs = this.tier.renderScale;
    const stageRect = this.stage.getBoundingClientRect();
    const state: RayFieldState = {
      timeSec: this.timeSec,
      centerPx: [(stageRect.left + CENTER_X * s) * rs, (stageRect.top + CENTER_Y * s) * rs],
      pointerPx: [this.pointer.smooth.x * rs, this.pointer.smooth.y * rs],
      scale: s * rs,
      signRot: this.timeSec * ROT_SPEED,
      beamAngles: this.beamAngles,
      // First four links only — these feed the procedural field, which the
      // shipped variant discards at slitMix 1. See rayFieldTypes.ts.
      linkAngles: quad(this.linkAngles),
      linkDist: quad(this.linkDist),
      linkHalfAng: quad(this.linkHalfAng),
      beamHover: quad(this.hover),
      // …whereas the hero's slit light leans over EVERY link, reduced here.
      hoverDir: this.hoverDir,
      hoverAmt: this.hoverAmt,
      bgMix: Math.max(this.showreel.mix, this.photoSlider.mix),
      sceneDim: this.sceneDim,
      modeMix: this.modeMix,
      slitMix: this.slitMix,
      layers: this.tier.layers,
      octaves: this.tier.octaves,
      params: p,
    };
    this.renderer.render(state);
  }

  /** dims/scales the DOM composition during the fly-in transition */
  setStageDim(t: number) {
    this.stage.style.opacity = String(1 - 0.95 * t);
    const s = stageScale() * (1 - 0.045 * t);
    this.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  /**
   * How much of the screen exists, 0..1 — the scroll seam's own ramp.
   *
   * NOT `setStageDim`, and the difference is the whole point. `setStageDim(1)`
   * leaves the stage at opacity 0.05 and never touches `.corners` at all — the
   * wordmark, the descriptor, the «Связаться» plate and the studio mark are a
   * separate viewport-pinned layer, and at the swap they would appear fully
   * opaque over a page that is meant to look like it has not changed yet. The
   * 0.045 scale term is borrowed from `setStageDim` so the two agree.
   *
   * `--grain-k` is here because `#grain` is suppressed on «О Крестах» but sits
   * at full strength on the main screen, and over `#56b7e6` an overlay grain is
   * visible (it is a no-op only against black). Un-driven, it pops in at the
   * swap — which is precisely the tell this seam exists to remove.
   */
  setReveal(k: number) {
    this.reveal = k;
    this.stage.style.opacity = String(k);
    const s = stageScale() * (1 - 0.045 * (1 - k));
    this.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    this.corners.style.opacity = String(k);
    document.documentElement.style.setProperty('--grain-k', String(k));
  }

  /**
   * Arm the seam: fully dark, and with the entrance burst suppressed.
   *
   * `burstT` matters. On a first-ever entry it is 0, so round 5's explosive
   * appearance (×5 godrays, τ 0.09/0.15) would fire WHILE the reveal ramps —
   * two easings with different time constants overlapping, which reads as a
   * stutter rather than as drama. The reveal curve is the only beat here.
   */
  beginReveal() {
    this.burstT = 99;
    this.setReveal(0);
    this.converge = 1;
  }

  /**
   * Render one frame right now, so the canvas is never showing a stale image.
   *
   * `start()` does not draw synchronously, so between the swap and the next
   * rAF the canvas still holds the last frame from before the reader navigated
   * away — a full light, on a page that is supposed to look unchanged. The
   * router already does exactly this for «О Крестах» in the other direction.
   */
  primeFrame() {
    this.layout();
    this.update(0);
  }
}

/* The mask rasterizer moved to `shared/rasterizeMask.ts` — the «Контакты»
   showcase feeds the same slit path with arbitrary icons. Called with no
   options it is byte-identical to the version that lived here. */
