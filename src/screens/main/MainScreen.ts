import logoSvg from '../../assets/logo.svg?raw';
import signSvg from '../../assets/sign.svg?raw';
import {
  STAGE_W,
  STAGE_H,
  CENTER_X,
  CENTER_Y,
  NAV_LINKS,
  stageScale,
} from './layout';
import { VARIANTS, variantIndexFromUrl, SWITCHER_COUNT } from './variants';
import { NewsTicker } from './NewsTicker';
import { Showreel } from './Showreel';
import { StarSlider } from './StarSlider';
import { selectBackend } from '../../gpu/capabilities';
import { lerpParams } from '../../gpu/rayFieldTypes';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';
import { SmoothPointer } from '../../shared/pointer';
import { getPerfTier } from '../../shared/performanceTier';

/** Variants whose look is the logo-slit light (drive slitMix + the burst). */
const SLIT_IDS = new Set(['siyanie', 'prorez', 'slider']);

export class MainScreen {
  el: HTMLElement;
  onNavigate: (to: 'concept') => void = () => {};

  private canvas!: HTMLCanvasElement;
  private stage!: HTMLElement;
  private renderer: RayFieldRenderer | null = null;
  private pointer = new SmoothPointer();
  private ticker!: NewsTicker;
  private showreel!: Showreel;
  private starSlider!: StarSlider;
  /** seconds since the slider last threw a slide — the projector flash */
  private sliderFlashT = 10;
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

  private hoverTarget = [0, 0, 0, 0];
  private hover = [0, 0, 0, 0];
  /** bisector directions between adjacent links — beams strike BETWEEN links */
  private baseBeamAngles: [number, number, number, number] = [0, 0, 0, 0];
  private beamAngles: [number, number, number, number] = [0, 0, 0, 0];
  /** measured link directions, index-aligned with linkEls/hover */
  private linkAngles: [number, number, number, number] = [0, 0, 0, 0];
  private linkDist: [number, number, number, number] = [0, 0, 0, 0];
  private linkHalfAng: [number, number, number, number] = [0, 0, 0, 0];
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

  private buildDom() {
    this.el.innerHTML = '';

    this.showreel = new Showreel(this.el);

    // hover "gallery dark" scene: black drop + per-section image under the light
    this.hoverScene = document.createElement('div');
    this.hoverScene.className = 'hover-scene';
    const dark = document.createElement('div');
    dark.className = 'hover-dark';
    this.hoverScene.appendChild(dark);
    const hoverImages = [
      '/resources/main-1a.png', // История
      '/resources/main-2a.png', // Концепция
      '/resources/main-3a.png', // Аренда
      '/resources/main-4a.png', // Контакты
    ];
    for (const src of hoverImages) {
      const img = document.createElement('img');
      img.src = encodeURI(src);
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

    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = logoSvg;
    logo.setAttribute('aria-label', 'Кресты');
    this.stage.appendChild(logo);

    NAV_LINKS.forEach((spec, i) => {
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.id = `nav-${spec.id}`;
      a.href = spec.route ? '#concept' : '#';
      a.style.left = `${spec.x}px`;
      a.style.top = `${spec.y}px`;
      a.innerHTML = `<span class="nav-rot" style="transform: rotate(${spec.rot}deg)">${spec.label}</span>`;
      a.addEventListener('pointerenter', () => {
        this.hoverTarget[i] = 1;
        this.lastHovered = i;
      });
      a.addEventListener('pointerleave', () => (this.hoverTarget[i] = 0));
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (spec.route === 'concept') this.onNavigate('concept');
      });
      this.stage.appendChild(a);
      this.linkEls.push(a);
    });

    const news = document.createElement('div');
    news.className = 'news';
    this.stage.appendChild(news);
    this.ticker = new NewsTicker(news);

    const mark = document.createElement('div');
    mark.className = 'corner-mark';
    mark.textContent = 'КРЕСТЫ · 2026';
    this.stage.appendChild(mark);

    // «Слайдер» idle show (armed only on its tab; headline goes in the stage)
    this.starSlider = new StarSlider(this.el, this.stage);
    this.starSlider.onFlash = () => (this.sliderFlashT = 0);

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

  /** dev shortcut: physical V key (any layout) shows/hides the variant switcher */
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'KeyV' || e.metaKey || e.ctrlKey || e.altKey) return;
    this.fxSwitch.classList.toggle('hidden');
  };

  /** the «Слайдер» tab arms the star slider; every other tab, the showreel */
  private armIdleShow() {
    if (!this.running) return;
    if (VARIANTS[this.variantIndex].id === 'slider') {
      this.showreel.detach();
      this.starSlider.attach();
    } else {
      this.starSlider.detach();
      this.showreel.attach();
    }
  }

  /** stage transform + canvas backing store */
  layout = () => {
    const s = stageScale();
    this.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    this.starSlider.layout(s);
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
      this.renderer.setSignMask(await rasterizeSign());
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
    this.ticker.start();
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
    this.starSlider.detach();
    this.ticker.stop();
    removeEventListener('resize', this.layout);
    removeEventListener('keydown', this.onKeyDown);
  }

  private update(dt: number) {
    // hover easing: 150ms in, 300ms out
    for (let i = 0; i < 4; i++) {
      const target = this.hoverTarget[i];
      const tau = target > this.hover[i] ? 0.06 : 0.13;
      this.hover[i] += (target - this.hover[i]) * (1 - Math.exp(-dt / tau));
    }
    this.pointer.update(dt);

    // living beams: slow global sway (never far from the bisectors)
    // plus small independent per-beam wander
    const t = this.timeSec;
    const sway = Math.sin((t * Math.PI * 2) / 45) * 0.14;
    for (let i = 0; i < 4; i++) {
      const wander = 0.035 * Math.sin(t * 0.23 + i * 2.1) + 0.02 * Math.sin(t * 0.11 + i * 4.7);
      this.beamAngles[i] = this.baseBeamAngles[i] + sway + wander;
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

    // «Проектор» (round 6.3): the light shines at full strength over the
    // background photos and simply disappears behind the star (plain DOM
    // stacking — see StarSlider's layering note). The only choreography
    // left is a soft breath of light on each slide throw — a swell, not a
    // punch. Gated to the slider tab so a fast tab switch can't leak the
    // tail onto another variant.
    if (this.sliderFlashT < 2 && VARIANTS[this.variantIndex].id === 'slider') {
      p = { ...p };
      const k = Math.exp(-this.sliderFlashT / 0.3);
      p.godrays *= 1 + 1.4 * k;
      p.bloom *= 1 + 1.0 * k;
      p.coreIntensity *= 1 + 0.7 * k;
    }
    this.sliderFlashT += dt;

    const s = stageScale();
    const rs = this.tier.renderScale;
    const stageRect = this.stage.getBoundingClientRect();
    const state: RayFieldState = {
      timeSec: this.timeSec,
      centerPx: [(stageRect.left + CENTER_X * s) * rs, (stageRect.top + CENTER_Y * s) * rs],
      pointerPx: [this.pointer.smooth.x * rs, this.pointer.smooth.y * rs],
      scale: s * rs,
      beamAngles: this.beamAngles,
      linkAngles: this.linkAngles,
      linkDist: this.linkDist,
      linkHalfAng: this.linkHalfAng,
      beamHover: [this.hover[0], this.hover[1], this.hover[2], this.hover[3]],
      bgMix: Math.max(this.showreel.mix, this.starSlider.mix),
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
}

/**
 * Rasterize the emblem (sign.svg) into the three-channel mask for the slit
 * path: R = crisp antialiased emblem (the «Прорезь» readable core), G = a
 * round blur (feeds the bloom halo), B = a RADIAL smear — the emblem drawn at
 * several scales about the centre and averaged (feeds the god-ray march).
 * Why: a handful of sparse jittered taps against a hard-edged mask has huge
 * per-pixel variance (heavy stipple noise), but a round pre-blur also melts
 * the razor-sharp tangential edges of the light trails. The march integrates
 * the mask RADIALLY, so smearing only along that direction removes the
 * variance the march sees while keeping the trail edges razor sharp — and the
 * smear length grows with radius exactly like the march step does.
 * Opaque black background (no premultiply concerns); the svg viewBox is
 * centered, so the emblem center lands at the texture center — where the
 * shader maps the convergence point.
 */
async function rasterizeSign(): Promise<HTMLCanvasElement> {
  const size = 640;
  const url = URL.createObjectURL(new Blob([signSvg], { type: 'image/svg+xml' }));
  let img: HTMLImageElement;
  try {
    img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('sign.svg failed to load'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  const makeCtx = () => {
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    return ctx;
  };
  const draw = (blurPx: number) => {
    const ctx = makeCtx();
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(img, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size);
  };
  // radial smear: K scaled copies about the centre, additively averaged
  // (a tiny fixed blur keeps a smoothing floor near the centre, where the
  // scale steps barely move the strokes)
  const smearDraw = () => {
    const ctx = makeCtx();
    const K = 13;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 / K;
    ctx.filter = 'blur(1.5px)';
    for (let k = 0; k < K; k++) {
      const s = 0.965 + (0.07 * k) / (K - 1); // 0.965 .. 1.035
      const d = size * s;
      ctx.drawImage(img, (size - d) / 2, (size - d) / 2, d, d);
    }
    return ctx.getImageData(0, 0, size, size);
  };
  const crisp = draw(0);
  const soft = draw(6);
  const smear = smearDraw();
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const out = ctx.createImageData(size, size);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = crisp.data[i]; // R: crisp emblem (core)
    out.data[i + 1] = soft.data[i]; // G: round blur (bloom halo)
    out.data[i + 2] = smear.data[i]; // B: radial smear (god-ray march)
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return cv;
}
