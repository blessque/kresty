import starSvg from '../../assets/star.svg?raw';
import { SLIDER_SLIDES, CENTER_X, CENTER_Y } from './layout';
import { IdleWatcher } from '../../shared/idle';

/** Figma slider01 (node 252:47): star 1000×1000 centered at (784, 400). */
const STAR_SIZE = 1000;
const STAR_CX = 784;
const STAR_CY = 400;

const IDLE_MS = 4200; // same delay as the old showreel
const HOLD_MS = 7000; // per-slide dwell, measured from throw start
const STAR_IN_MS = 1600; // restrained bloom out of the light centre
const DISSOLVE_MS = 1200; // the old star melts into the air
const NEXT_DELAY_MS = 600; // new star starts while the old one is half-gone
const HEADLINE_IN_MS = 900; // headline enters while the star is still landing

/**
 * «Слайдер» idle show: full-bleed zenith photo behind, nadir photo inside a
 * star mask blooming out of the light centre, per-slide headline. Armed only
 * while the «Слайдер» tab is active (the old Showreel serves the other tabs).
 * Any pointer/key activity = full exit back to flat blue.
 *
 * The star sits in stage coordinates, but the slider layer lives BELOW the
 * ray canvas (z:1) while the stage is above it (z:4) — so `.star-stage`
 * mirrors the stage transform (fed via layout()), and the headline element
 * is appended into the real stage so the light never washes the text. The
 * light itself is left alone — it shines over the whole composition.
 *
 * Slide change never scales down: the outgoing star DISSOLVES in place
 * (transparency + a slight further scale-up + blur — smoke in the air) on
 * one of two double-buffered wraps, while the next star blooms up behind it.
 */
export class StarSlider {
  /** 0..1 presence — MainScreen reads it for bgMix */
  mix = 0;
  /** fired at each slide throw — MainScreen resets its flash clock */
  onFlash: () => void = () => {};

  private root: HTMLElement;
  private bgs: HTMLImageElement[] = [];
  private bgFront = 0;
  private starStage: HTMLElement;
  private starWraps: HTMLElement[] = [];
  private starImgs: HTMLImageElement[] = [];
  private starFront = 0;
  private headline: HTMLElement;
  private idle: IdleWatcher;
  private screenEl: HTMLElement;
  private current = 0;
  private timers: number[] = [];
  private cleanupTimer: number | undefined;
  private active = false;
  private raf = 0;
  private preloaded = false;

  constructor(screenEl: HTMLElement, stageEl: HTMLElement) {
    this.screenEl = screenEl;
    this.root = document.createElement('div');
    this.root.className = 'star-slider';
    for (let i = 0; i < 2; i++) {
      const img = document.createElement('img');
      img.className = 'bg';
      img.alt = '';
      this.root.appendChild(img);
      this.bgs.push(img);
    }
    const overlay = document.createElement('div');
    overlay.className = 'star-overlay';
    this.root.appendChild(overlay);

    this.starStage = document.createElement('div');
    this.starStage.className = 'star-stage';
    this.root.appendChild(this.starStage);

    // two star wraps: one blooms while the other dissolves — no scale-down
    const maskUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(starSvg)}")`;
    for (let i = 0; i < 2; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'star-wrap';
      for (const prop of ['mask-image', '-webkit-mask-image']) {
        wrap.style.setProperty(prop, maskUrl);
      }
      // geometry: top-left from the Figma centre; scale origin = the light
      // convergence point in star-local coords, so the star grows exactly
      // out of the light yet lands exactly on the mockup position
      wrap.style.left = `${STAR_CX - STAR_SIZE / 2}px`;
      wrap.style.top = `${STAR_CY - STAR_SIZE / 2}px`;
      wrap.style.transformOrigin = `${CENTER_X - (STAR_CX - STAR_SIZE / 2)}px ${CENTER_Y - (STAR_CY - STAR_SIZE / 2)}px`;
      this.starStage.appendChild(wrap);
      const img = document.createElement('img');
      img.className = 'star';
      img.alt = '';
      wrap.appendChild(img);
      this.starWraps.push(wrap);
      this.starImgs.push(img);
    }

    // the headline lives in the real stage (z above the light)
    this.headline = document.createElement('p');
    this.headline.className = 'slider-headline';
    stageEl.appendChild(this.headline);

    screenEl.appendChild(this.root);
    this.idle = new IdleWatcher(IDLE_MS, () => this.activate(), () => this.deactivate());
  }

  /** mirror the real stage transform (called from MainScreen.layout) */
  layout(scale: number) {
    this.starStage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  attach() {
    this.preload();
    this.idle.attach();
  }

  detach() {
    this.idle.detach();
    this.deactivate();
  }

  private preload() {
    if (this.preloaded) return;
    this.preloaded = true;
    for (const s of SLIDER_SLIDES) {
      for (const src of [s.star, s.bg]) {
        const im = new Image();
        im.decoding = 'async';
        im.src = src;
      }
    }
  }

  private activate() {
    this.active = true;
    clearTimeout(this.cleanupTimer);
    for (const w of this.starWraps) w.classList.remove('in', 'dissolve');
    this.headline.classList.remove('show', 'out');
    this.screenEl.classList.add('slider-on');
    this.root.classList.add('active');
    this.showSlide(this.current);
    this.animateMix(1);
  }

  /** throw the slide: bg crossfade + star blooming out of the light centre */
  private showSlide(i: number) {
    const slide = SLIDER_SLIDES[i];
    const back = 1 - this.bgFront;
    this.bgs[back].src = slide.bg;
    this.bgs[back].classList.add('visible');
    this.bgs[this.bgFront].classList.remove('visible');
    this.bgFront = back;

    const wrap = this.starWraps[this.starFront];
    this.starImgs[this.starFront].src = slide.star;
    this.onFlash();
    void wrap.offsetWidth; // commit the base state so the bloom animates
    wrap.classList.add('in');
    this.setTimer(() => {
      this.headline.classList.remove('out');
      this.headline.textContent = slide.headline;
      void this.headline.offsetWidth;
      this.headline.classList.add('show');
    }, HEADLINE_IN_MS);
    this.setTimer(() => this.advance(), HOLD_MS);
  }

  /** the old star + text dissolve in the air; the next one blooms behind */
  private advance() {
    if (!this.active) return;
    const front = this.starWraps[this.starFront];
    front.classList.remove('in');
    front.classList.add('dissolve');
    this.headline.classList.remove('show');
    this.headline.classList.add('out');
    // once fully dissolved, snap the wrap back to its hidden base state
    // (base has no transition) so it can host the slide after next
    this.setTimer(() => front.classList.remove('dissolve'), DISSOLVE_MS + 100);
    this.current = (this.current + 1) % SLIDER_SLIDES.length;
    this.starFront = 1 - this.starFront;
    this.setTimer(() => this.showSlide(this.current), NEXT_DELAY_MS);
  }

  /** full exit — the star dissolves while the whole layer fades */
  private deactivate() {
    if (!this.active) return;
    this.active = false;
    this.clearTimers();
    this.screenEl.classList.remove('slider-on');
    this.root.classList.remove('active');
    const front = this.starWraps[this.starFront];
    front.classList.remove('in');
    front.classList.add('dissolve');
    this.headline.classList.remove('show');
    this.headline.classList.add('out');
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = window.setTimeout(() => {
      for (const w of this.starWraps) w.classList.remove('in', 'dissolve');
      this.headline.classList.remove('out');
    }, DISSOLVE_MS + 100);
    this.animateMix(0);
  }

  private setTimer(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private animateMix(target: number) {
    cancelAnimationFrame(this.raf);
    const step = () => {
      this.mix += (target - this.mix) * 0.07;
      if (Math.abs(this.mix - target) > 0.005) this.raf = requestAnimationFrame(step);
      else this.mix = target;
    };
    this.raf = requestAnimationFrame(step);
  }
}
