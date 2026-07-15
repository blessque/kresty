import logoSvg from '../../assets/logo.svg?raw';
import {
  STAGE_W,
  STAGE_H,
  CENTER_X,
  CENTER_Y,
  NAV_LINKS,
  stageScale,
} from './layout';
import { VARIANTS, variantIndexFromUrl } from './variants';
import { NewsTicker } from './NewsTicker';
import { Showreel } from './Showreel';
import { selectBackend } from '../../gpu/capabilities';
import type { RayFieldParams, RayFieldRenderer, RayFieldState } from '../../gpu/rayFieldTypes';
import { SmoothPointer } from '../../shared/pointer';
import { getPerfTier } from '../../shared/performanceTier';

export class MainScreen {
  el: HTMLElement;
  onNavigate: (to: 'concept') => void = () => {};

  private canvas!: HTMLCanvasElement;
  private stage!: HTMLElement;
  private renderer: RayFieldRenderer | null = null;
  private pointer = new SmoothPointer();
  private ticker!: NewsTicker;
  private showreel!: Showreel;
  private tier = getPerfTier();

  private raf = 0;
  private running = false;
  private lastT = 0;
  private timeSec = 0;

  private params: RayFieldParams = { ...VARIANTS[variantIndexFromUrl()].params };

  /** 0..1 transition converge amount, driven by TransitionController */
  converge = 0;

  private hoverTarget = [0, 0, 0, 0];
  private hover = [0, 0, 0, 0];
  /** bisector directions between adjacent links — beams strike BETWEEN links */
  private baseBeamAngles: [number, number, number, number] = [0, 0, 0, 0];
  private beamAngles: [number, number, number, number] = [0, 0, 0, 0];
  /** measured link directions, index-aligned with linkEls/hover */
  private linkAngles: [number, number, number, number] = [0, 0, 0, 0];
  private linkEls: HTMLElement[] = [];
  private hoverScene!: HTMLElement;
  private hoverImgs: HTMLImageElement[] = [];
  private lastHovered = 0;
  private sceneDim = 0;

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
      '/resources/reference-light-3.png',
      '/resources/карта.png',
      '/resources/reference-light-5.png',
      '/resources/reference-light-4.png',
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

    this.layout();
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
      this.linkAngles[i] = Math.atan2(r.top + r.height / 2 - cy, r.left + r.width / 2 - cx);
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
    this.layout();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.el.classList.remove('hidden');
    this.pointer.attach();
    this.showreel.attach();
    this.ticker.start();
    addEventListener('resize', this.layout);
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
    this.ticker.stop();
    removeEventListener('resize', this.layout);
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

    if (!this.renderer) return;

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
      beamHover: [this.hover[0], this.hover[1], this.hover[2], this.hover[3]],
      bgMix: this.showreel.mix,
      sceneDim: this.sceneDim,
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
