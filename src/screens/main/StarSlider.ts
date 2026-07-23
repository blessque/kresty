import starSvg from '../../assets/star.svg?raw';
import { SLIDER_SLIDES, CENTER_X, CENTER_Y } from './layout';
import { IdleWatcher } from '../../shared/idle';

/** Figma slider01 (node 252:47): star 1000×1000 centered at (784, 400). */
const STAR_SIZE = 1000;
const STAR_CX = 784;
const STAR_CY = 400;

const IDLE_MS = 4200; // same delay as the old showreel
const HOLD_MS = 6000; // per-slide hold after the star lands
const STAR_IN_MS = 500; // explosive scale-out of the light centre
const STAR_OUT_MS = 250; // sucked back into the centre

/**
 * «Слайдер» idle show: full-bleed zenith photo behind, nadir photo inside a
 * star mask thrown out of the light centre, per-slide headline. Armed only
 * while the «Слайдер» tab is active (the old Showreel serves the other tabs).
 * Any pointer/key activity = full exit back to flat blue.
 *
 * The star must sit in stage coordinates, but the slider layer lives BELOW
 * the ray canvas (z:1) while the stage is above it (z:4) — so `.star-stage`
 * mirrors the stage transform (fed via layout()), and the headline element
 * is appended into the real stage so the light never washes the text.
 */
export class StarSlider {
  /** 0..1 presence — MainScreen reads it for bgMix + the ember modulation */
  mix = 0;
  /** fired at each slide throw — MainScreen resets its flash clock */
  onFlash: () => void = () => {};

  private root: HTMLElement;
  private bgs: HTMLImageElement[] = [];
  private bgFront = 0;
  private starStage: HTMLElement;
  private starWrap: HTMLElement;
  private starImg: HTMLImageElement;
  private headline: HTMLElement;
  private idle: IdleWatcher;
  private screenEl: HTMLElement;
  private current = 0;
  private timers: number[] = [];
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

    this.starWrap = document.createElement('div');
    this.starWrap.className = 'star-wrap';
    // star mask from the committed SVG — inlined, no runtime fetch
    const maskUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(starSvg)}")`;
    for (const prop of ['mask-image', '-webkit-mask-image']) {
      this.starWrap.style.setProperty(prop, maskUrl);
    }
    // geometry: top-left from the Figma centre; scale origin = the light
    // convergence point in star-local coords, so the star grows exactly out
    // of the light yet lands exactly on the mockup position
    this.starWrap.style.left = `${STAR_CX - STAR_SIZE / 2}px`;
    this.starWrap.style.top = `${STAR_CY - STAR_SIZE / 2}px`;
    this.starWrap.style.transformOrigin = `${CENTER_X - (STAR_CX - STAR_SIZE / 2)}px ${CENTER_Y - (STAR_CY - STAR_SIZE / 2)}px`;
    this.starStage.appendChild(this.starWrap);

    this.starImg = document.createElement('img');
    this.starImg.className = 'star';
    this.starImg.alt = '';
    this.starWrap.appendChild(this.starImg);

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

  private setTimer(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private activate() {
    this.active = true;
    this.screenEl.classList.add('slider-on');
    this.root.classList.add('active');
    this.showSlide(this.current);
    this.animateMix(1);
  }

  /** throw the slide: bg crossfade + star explodes out of the light centre */
  private showSlide(i: number) {
    const slide = SLIDER_SLIDES[i];
    const back = 1 - this.bgFront;
    this.bgs[back].src = slide.bg;
    this.bgs[back].classList.add('visible');
    this.bgs[this.bgFront].classList.remove('visible');
    this.bgFront = back;

    this.starImg.src = slide.star;
    this.headline.textContent = slide.headline;
    this.onFlash();
    void this.starWrap.offsetWidth; // restart the .in transition reliably
    this.starWrap.classList.add('in');
    this.setTimer(() => this.headline.classList.add('show'), STAR_IN_MS);
    this.setTimer(() => this.advance(), HOLD_MS);
  }

  /** collapse back into the light, then throw the next slide */
  private advance() {
    if (!this.active) return;
    this.headline.classList.remove('show');
    this.starWrap.classList.remove('in'); // base transition = the collapse
    this.current = (this.current + 1) % SLIDER_SLIDES.length;
    this.setTimer(() => this.showSlide(this.current), STAR_OUT_MS + 60);
  }

  /** full exit — any activity returns the nav-focused state */
  private deactivate() {
    if (!this.active) return;
    this.active = false;
    this.clearTimers();
    this.screenEl.classList.remove('slider-on');
    this.root.classList.remove('active');
    this.starWrap.classList.remove('in');
    this.headline.classList.remove('show');
    this.animateMix(0);
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
