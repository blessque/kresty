import { SLIDER_SLIDES } from './layout';
import { IdleWatcher } from '../../shared/idle';

const IDLE_MS = 7000; // idle delay before the slider takes over (round 7: longer)
const HOLD_MS = 7000; // per-slide dwell, measured from throw start
const HEADLINE_IN_MS = 500; // headline enters shortly after the photo lands
const DISSOLVE_MS = 900; // the headline melts upward on exit
const NEXT_DELAY_MS = 500; // the next slide starts while the old text is half-gone
const BG_FADE_MS = 1400; // background fade-in (mirrors the CSS transition)
const WORD_STAGGER_MS = 80; // per-word reveal delay

/**
 * «Слайдер» idle show (round 7): one full-bleed nadir photo per slide + a
 * left-column headline that reveals word by word. Armed only while the
 * «Слайдер» tab is active (the old Showreel serves the other tabs). Any
 * pointer/key activity = full exit back to flat blue.
 *
 * Layering (bottom → top): background photo (z:1, `.photo-slider`) → 20%
 * legibility overlay → the screen-blended ray canvas (z:3) → the stage with
 * nav + headline (z:4). The star mask that used to sit above the light is
 * gone; the light now shines over the photo unobstructed.
 *
 * Background photos never cross-fade both ways: the incoming photo fades in ON
 * TOP of the outgoing one (which is hidden only after being fully covered) — a
 * two-way fade lets the blue backdrop flash through at the tail.
 */
export class PhotoSlider {
  /** 0..1 presence — MainScreen reads it for bgMix */
  mix = 0;
  /** fired at each slide throw — MainScreen resets its projector-flash clock */
  onFlash: () => void = () => {};

  private root: HTMLElement;
  private bgs: HTMLImageElement[] = [];
  private bgFront = 0;
  private bgSrc = '';
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
    this.root.className = 'photo-slider';
    for (let i = 0; i < 2; i++) {
      const img = document.createElement('img');
      img.className = 'bg';
      img.alt = '';
      this.root.appendChild(img);
      this.bgs.push(img);
    }
    const overlay = document.createElement('div');
    overlay.className = 'photo-overlay';
    this.root.appendChild(overlay);

    // the headline lives in the real stage (z above the light)
    this.headline = document.createElement('p');
    this.headline.className = 'slider-headline';
    stageEl.appendChild(this.headline);

    screenEl.appendChild(this.root);
    this.idle = new IdleWatcher(IDLE_MS, () => this.activate(), () => this.deactivate());
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
      const im = new Image();
      im.decoding = 'async';
      im.src = s.photo;
    }
  }

  private activate() {
    this.active = true;
    clearTimeout(this.cleanupTimer);
    this.headline.classList.remove('show', 'out');
    // the spare bg img may have been left visible by an interrupted cycle;
    // hide it while the whole layer is still faded out
    this.bgs[1 - this.bgFront].classList.remove('visible');
    this.screenEl.classList.add('slider-on');
    this.root.classList.add('active');
    this.showSlide(this.current);
    this.animateMix(1);
  }

  /** throw the slide: bg fade-over + the word-by-word headline reveal */
  private showSlide(i: number) {
    const slide = SLIDER_SLIDES[i];
    // background: fade the incoming photo in OVER the outgoing one — never
    // fade two photos simultaneously (the blue bleeds through at the tail)
    if (slide.photo !== this.bgSrc) {
      this.bgSrc = slide.photo;
      const back = 1 - this.bgFront;
      const incoming = this.bgs[back];
      const outgoing = this.bgs[this.bgFront];
      incoming.src = slide.photo;
      incoming.style.zIndex = '2';
      outgoing.style.zIndex = '1';
      incoming.classList.add('visible');
      // the old photo is fully covered once the fade completes — release it
      // silently so it can host the next crossfade
      this.setTimer(() => outgoing.classList.remove('visible'), BG_FADE_MS + 100);
      this.bgFront = back;
    }

    this.onFlash();
    this.setTimer(() => {
      this.setHeadline(slide.headline);
      this.headline.classList.remove('out');
      void this.headline.offsetWidth; // commit the base state so words animate
      this.headline.classList.add('show');
    }, HEADLINE_IN_MS);
    this.setTimer(() => this.advance(), HOLD_MS);
  }

  /**
   * Rebuild the headline as staggered word spans. Each word rises out of blur
   * on its own delay; a plain-text separator preserves the wrapping (the CSS
   * `.word` is inline-block so it never splits mid-word).
   */
  private setHeadline(text: string) {
    this.headline.textContent = '';
    const words = text.split(' ');
    words.forEach((w, i) => {
      if (i > 0) this.headline.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w;
      span.style.transitionDelay = `${i * WORD_STAGGER_MS}ms`;
      this.headline.appendChild(span);
    });
  }

  /** hold the slide, then dissolve the text and bring in the next photo */
  private advance() {
    if (!this.active) return;
    this.headline.classList.remove('show');
    this.headline.classList.add('out');
    this.current = (this.current + 1) % SLIDER_SLIDES.length;
    this.setTimer(() => this.showSlide(this.current), NEXT_DELAY_MS);
  }

  /** full exit — the headline melts up while the whole layer fades */
  private deactivate() {
    if (!this.active) return;
    this.active = false;
    this.clearTimers();
    this.screenEl.classList.remove('slider-on');
    this.root.classList.remove('active');
    this.headline.classList.remove('show');
    this.headline.classList.add('out');
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = window.setTimeout(() => {
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
