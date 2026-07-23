import starSvg from '../../assets/star.svg?raw';
import { SLIDER_SLIDES, CENTER_X, CENTER_Y, STAGE_W, STAGE_H } from './layout';
import { IdleWatcher } from '../../shared/idle';

/** Figma slider01 (node 252:47): star 1000×1000 centered at (784, 400). */
const STAR_SIZE = 1000;
const STAR_CX = 784;
const STAR_CY = 400;

const IDLE_MS = 4200; // same delay as the old showreel
const HOLD_MS = 7000; // per-slide dwell, measured from throw start
const STAR_IN_MS = 1200; // soft bloom out of the light centre
const STAR_OUT_MS = 600; // gentle recede back into it
const SWAP_GAP_MS = 120; // beat between recede end and the next throw
const HEADLINE_IN_MS = 660; // headline enters while the star is still landing
/** the star rests at this scale between slides (also the CSS base scale) */
const COLLAPSED_K = 0.35;
/** long-tail ease-out for appearances — airy, no snap at either end */
const CURVE_IN = 'cubic-bezier(0.22, 0.9, 0.32, 1)';
/** symmetric soft in-out for the recede */
const CURVE_OUT = 'cubic-bezier(0.6, 0, 0.35, 1)';

/** occlusion-mask texture: star drawn 1000px in a padded square, feathered */
const MASK_TEX = 1280;
const MASK_FEATHER = 10; // px at star scale — the soft light rim on the contour
const MASK_PAD = MASK_TEX / STAR_SIZE;

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
 *
 * The light is OCCLUDED by the star, not dimmed: while the slider shows, the
 * ray canvas gets a two-layer CSS mask (full-white gradient minus a feathered
 * star, `mask-composite: exclude`) whose position/size are transitioned with
 * the same duration+curve as the star's transform — the star reads as a
 * physical surface in front of the light, full-intensity beams breaking
 * around its contour. Both mask-size and mask-position are linear in the
 * scale factor k, so equal timing functions keep the mask glued to the star.
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
  private starWrap: HTMLElement;
  private starImg: HTMLImageElement;
  private headline: HTMLElement;
  private idle: IdleWatcher;
  private screenEl: HTMLElement;
  private rayCanvas: HTMLElement;
  private current = 0;
  private timers: number[] = [];
  private maskTimer: number | undefined;
  private active = false;
  private raf = 0;
  private preloaded = false;
  private stageS = 1;
  private maskDataUrl = '';

  constructor(screenEl: HTMLElement, stageEl: HTMLElement, rayCanvas: HTMLElement) {
    this.screenEl = screenEl;
    this.rayCanvas = rayCanvas;
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
    this.stageS = scale;
    this.starStage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    // re-anchor the occlusion mask on resize (snap to the star's rest state)
    if (this.active) this.setMask(this.starWrap.classList.contains('in') ? 1 : COLLAPSED_K, 0);
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
    void this.buildOcclusionMask();
  }

  /**
   * Feathered star texture for occluding the ray canvas: the star, blurred a
   * touch, centered in a padded transparent square. Used as mask layer 2 and
   * subtracted from a full-white layer 1 (`mask-composite: exclude`) — light
   * disappears inside the star, survives at full intensity outside, and the
   * feather makes the contour read as a lit physical edge.
   */
  private async buildOcclusionMask() {
    const url = URL.createObjectURL(new Blob([starSvg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('star.svg failed to load'));
        img.src = url;
      });
      const cv = document.createElement('canvas');
      cv.width = MASK_TEX;
      cv.height = MASK_TEX;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.filter = `blur(${MASK_FEATHER}px)`;
      const o = (MASK_TEX - STAR_SIZE) / 2;
      ctx.drawImage(img, o, o, STAR_SIZE, STAR_SIZE);
      this.maskDataUrl = cv.toDataURL();
    } catch {
      // no mask texture → the light simply stays unoccluded (never blank)
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** star rect (padded to the mask texture) in viewport px at scale k */
  private maskGeom(k: number) {
    const s = this.stageS;
    // the star scales about the light centre (CENTER_X/Y), same as the CSS
    // transform-origin; stage → viewport via the centered stage transform
    const left0 = CENTER_X + (STAR_CX - STAR_SIZE / 2 - CENTER_X) * k;
    const top0 = CENTER_Y + (STAR_CY - STAR_SIZE / 2 - CENTER_Y) * k;
    const size = STAR_SIZE * k;
    const pad = (size * (MASK_PAD - 1)) / 2;
    return {
      left: innerWidth / 2 + (left0 - STAGE_W / 2) * s - pad,
      top: innerHeight / 2 + (top0 - STAGE_H / 2) * s - pad,
      size: size * MASK_PAD * s,
    };
  }

  private applyMask() {
    if (!this.maskDataUrl) return;
    clearTimeout(this.maskTimer);
    const st = this.rayCanvas.style;
    const image = `linear-gradient(#fff, #fff), url(${this.maskDataUrl})`;
    for (const p of ['mask-image', '-webkit-mask-image']) st.setProperty(p, image);
    for (const p of ['mask-repeat', '-webkit-mask-repeat']) st.setProperty(p, 'no-repeat');
    // legacy webkit keyword for "exclude" is "xor"; set the standard one last
    // so it wins wherever the two spellings alias to the same property
    st.setProperty('-webkit-mask-composite', 'xor');
    st.setProperty('mask-composite', 'exclude');
  }

  /** move the occlusion cutout to scale k, animated in sync with the star */
  private setMask(k: number, durMs: number, curve = CURVE_IN) {
    if (!this.maskDataUrl) return;
    const st = this.rayCanvas.style;
    const g = this.maskGeom(k);
    st.transition = durMs
      ? ['mask-position', 'mask-size', '-webkit-mask-position', '-webkit-mask-size']
          .map((p) => `${p} ${durMs}ms ${curve}`)
          .join(', ')
      : '';
    const pos = `0 0, ${g.left.toFixed(1)}px ${g.top.toFixed(1)}px`;
    const size = `100% 100%, ${g.size.toFixed(1)}px ${g.size.toFixed(1)}px`;
    for (const p of ['mask-position', '-webkit-mask-position']) st.setProperty(p, pos);
    for (const p of ['mask-size', '-webkit-mask-size']) st.setProperty(p, size);
  }

  private clearMask() {
    const st = this.rayCanvas.style;
    for (const p of [
      'mask-image',
      '-webkit-mask-image',
      'mask-repeat',
      '-webkit-mask-repeat',
      'mask-composite',
      '-webkit-mask-composite',
      'mask-position',
      '-webkit-mask-position',
      'mask-size',
      '-webkit-mask-size',
    ]) {
      st.removeProperty(p);
    }
    st.transition = '';
  }

  private activate() {
    this.active = true;
    this.screenEl.classList.add('slider-on');
    this.root.classList.add('active');
    this.applyMask();
    this.setMask(COLLAPSED_K, 0); // start the cutout at the rest scale…
    this.showSlide(this.current); // …the reflow inside animates it out
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

    this.starImg.src = slide.star;
    this.headline.textContent = slide.headline;
    this.onFlash();
    void this.starWrap.offsetWidth; // restart the .in transition reliably
    this.starWrap.classList.add('in');
    this.setMask(1, STAR_IN_MS, CURVE_IN);
    this.setTimer(() => this.headline.classList.add('show'), HEADLINE_IN_MS);
    this.setTimer(() => this.advance(), HOLD_MS);
  }

  /** recede into the light, then throw the next slide */
  private advance() {
    if (!this.active) return;
    this.headline.classList.remove('show');
    this.starWrap.classList.remove('in'); // base transition = the recede
    this.setMask(COLLAPSED_K, STAR_OUT_MS, CURVE_OUT);
    this.current = (this.current + 1) % SLIDER_SLIDES.length;
    this.setTimer(() => this.showSlide(this.current), STAR_OUT_MS + SWAP_GAP_MS);
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
    // let the light close over the receding star, then drop the mask
    this.setMask(COLLAPSED_K, STAR_OUT_MS, CURVE_OUT);
    clearTimeout(this.maskTimer);
    this.maskTimer = window.setTimeout(() => this.clearMask(), STAR_OUT_MS + 100);
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
