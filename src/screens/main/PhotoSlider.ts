import { SLIDER_SLIDES } from './layout';
import { IdleWatcher } from '../../shared/idle';
import { bindShortWords } from '../../shared/ruTypography';

const IDLE_MS = 7000; // idle delay before the slider takes over
const WORD_STAGGER_MS = 80; // per-word reveal delay

/* ── the slide-change timeline (round 9) ──────────────────────────────────────
   Six numbers, pushed to CSS customs once in the constructor so JS is the single
   source of truth and there is no JS↔CSS duration mirror to keep in step.

   The beats OVERLAP. That is the whole change from round 8.2, which staged them
   in sequence (open → effect → close = 3050ms on the default) and so left a beat
   in the middle where the text was already gone, the scrim was already open, and
   the photos had not started moving yet. That gap is what read as lag; it was
   not the effects themselves.

     0.00s  ┌ heading melts up ────┐            OUT_MS
            ┌ scrim 0.40 → 0 ──────┐            OPEN_MS
     0.15s       ┌ photo cross-fade ─────────┐   FADE_DELAY + FADE_MS
     0.55s       ·  midpoint — scrim fully open, photo unobstructed
     0.95s       └ fade done ────────────────┘   = FADE_DONE
     0.95s       ┌ scrim 0 → 0.40 ──────┐        CLOSE_MS
                 ┌ new heading rises ───────┐
     ~1.7s  settled
     6.00s  next throw                          HOLD_MS

   No sample of that timeline has nothing moving. */
const OUT_MS = 600; // the old headline melts upward
const OPEN_MS = 600; // scrim 0.40 → 0, under the exit
const FADE_DELAY = 150; // the text leaves first, then the photos start
const FADE_MS = 800; // the cross-fade itself
const CLOSE_MS = 750; // scrim 0 → 0.40, under the entrance
const HOLD_MS = 6000; // throw-to-throw; also the drift's duration

/** the new photo is fully resolved — scrim closes and the new headline rises */
const FADE_DONE = FADE_DELAY + FADE_MS;

/**
 * «Слайдер» idle show: one full-bleed photo per slide + a left-column headline
 * that reveals word by word. Armed only while the «Слайдер» tab is active (the
 * old Showreel serves the other tabs), and only while the pointer is not on a
 * nav link. Any pointer/key activity = full exit back to flat blue.
 *
 * Layering (bottom → top): photo layers (z:1, `.photo-slider`) → the scrim
 * overlay → the screen-blended ray canvas (z:3) → the stage with nav + headline
 * (z:4).
 *
 * ── the handoff (round 9) ─────────────────────────────────────────────────
 * ONE transition: a plain cross-fade. The round-8.2 picker and its three specs
 * («Наплыв» / «Створ» / «Сдвиг») are deleted, as is the round-8 voronoi
 * dissolve before them. Do not rebuild either.
 *
 * The incoming photo goes UNDERNEATH at opacity 1 from frame one; the outgoing
 * sits on top and fades 1 → 0. One animated element, one compositor-only
 * property — no mask, no clip-path, no blur, nothing that can touch the paint
 * thread. Two consequences worth keeping in mind before changing this:
 *
 *  - the flat blue `#56b7e6` is structurally unreachable, because the lower
 *    layer is opaque and covers the frame for the whole handoff. Fading BOTH
 *    layers would sum to < 1 at the midpoint and flash the backdrop through;
 *  - there is no mid-transition dip or bloom for the same reason.
 *
 * The scrim choreography is the round-8.1 one and is unchanged in shape: it
 * FOLLOWS the headline — resting at the Figma 0.40 while text is up, opening as
 * the text melts away, closing as the new text rises. Round 8.0 dipped DARKER
 * than 0.40 while the old text was already gone and nothing was moving; the
 * client read that as lag. Nothing on this track is ever darker than 0.40.
 */
export class PhotoSlider {
  /** 0..1 presence — MainScreen reads it for bgMix */
  mix = 0;
  /** fired at each slide throw — MainScreen rides its light dip off this */
  onSlideStart: () => void = () => {};

  private root: HTMLElement;
  private layers: HTMLElement[] = [];
  private bgs: HTMLImageElement[] = [];
  private overlay: HTMLElement;
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
  private firstThrow = true;
  private warmed = new Set<string>();
  /** the idle delay has elapsed — but see `hoverBlocked` */
  private idleElapsed = false;
  /** the pointer is resting on a nav link: the slider must not take over */
  private hoverBlocked = false;

  constructor(screenEl: HTMLElement, stageEl: HTMLElement) {
    this.screenEl = screenEl;
    this.root = document.createElement('div');
    this.root.className = 'photo-slider';
    // wrapper + img per layer: the wrapper runs the dwell-long drift, the img
    // runs the cross-fade. Both want their own `animation` shorthand and one
    // element cannot host two. See the note in main.css.
    for (let i = 0; i < 2; i++) {
      const layer = document.createElement('div');
      layer.className = 'bg-layer';
      const img = document.createElement('img');
      img.className = 'bg';
      img.alt = '';
      img.decoding = 'async';
      layer.appendChild(img);
      this.root.appendChild(layer);
      this.layers.push(layer);
      this.bgs.push(img);
    }
    this.overlay = document.createElement('div');
    this.overlay.className = 'photo-overlay';
    this.root.appendChild(this.overlay);

    // the headline lives in the real stage (z above the light)
    this.headline = document.createElement('p');
    this.headline.className = 'slider-headline';
    stageEl.appendChild(this.headline);

    // The timeline, handed to CSS once. Keyframe percentages cannot be
    // var-driven but `animation-duration`/`-delay` can, which is what lets the
    // constants above stay authoritative with no JS↔CSS mirror.
    // Set on the SCREEN, not on `this.root`: the headline lives in the stage
    // (z above the light), outside the slider subtree, and it needs `--tr-out`.
    const s = screenEl.style;
    s.setProperty('--tr-out', `${OUT_MS}ms`);
    s.setProperty('--tr-open', `${OPEN_MS}ms`);
    s.setProperty('--tr-fade-delay', `${FADE_DELAY}ms`);
    s.setProperty('--tr-fade', `${FADE_MS}ms`);
    s.setProperty('--tr-close', `${CLOSE_MS}ms`);
    s.setProperty('--tr-hold', `${HOLD_MS}ms`);

    screenEl.appendChild(this.root);
    this.idle = new IdleWatcher(
      IDLE_MS,
      () => {
        this.idleElapsed = true;
        this.tryActivate();
      },
      () => {
        this.idleElapsed = false;
        this.deactivate();
      },
    );
  }

  /**
   * Hovering a nav link is the hero interaction — the slider must never take the
   * screen while the pointer is parked on one, however long it rests there.
   * Called from MainScreen's pointerenter/leave handlers.
   *
   * The `idleElapsed` latch keeps the whole activation decision in one place
   * (`tryActivate`) instead of half here and half inside `activate`. In practice
   * leaving a link also fires `pointermove`, which resets the idle timer, so the
   * countdown restarts — that is correct, moving the cursor IS activity.
   */
  setHoverBlocked(blocked: boolean) {
    if (blocked === this.hoverBlocked) return;
    this.hoverBlocked = blocked;
    if (blocked) this.deactivate();
    else this.tryActivate();
  }

  private tryActivate() {
    if (this.active || this.hoverBlocked || !this.idleElapsed) return;
    this.activate();
  }

  attach() {
    // only the first two slides up front — eight ~400KB photos eagerly is 3MB
    // for nothing. Each throw then warms the next one, 6s ahead of need.
    this.warm(0);
    this.warm(1);
    this.idle.attach();
  }

  detach() {
    this.idle.detach();
    this.deactivate();
  }

  private warm(i: number) {
    const src = SLIDER_SLIDES[i % SLIDER_SLIDES.length].photo;
    if (this.warmed.has(src)) return;
    this.warmed.add(src);
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
  }

  private activate() {
    this.active = true;
    this.firstThrow = true;
    clearTimeout(this.cleanupTimer);
    this.headline.classList.remove('show', 'out');
    // An interrupted cycle can leave a layer mid-fade. Reset BOTH to hidden
    // while the whole layer is still faded out — in particular the old front
    // must lose `visible`, or it would sit opaque on the upper layer with its
    // fade stripped and cover the incoming photo. (`src` is left alone so
    // nothing has to re-decode.)
    this.bgs.forEach((img) => img.classList.remove('leaving', 'visible'));
    this.layers.forEach((l) => l.classList.remove('drifting'));
    this.bgSrc = '';
    this.screenEl.classList.add('slider-on');
    this.root.classList.add('active');
    this.showSlide(this.current);
    this.animateMix(1);
  }

  /** throw the slide: open the scrim, cross-fade, close on the new text */
  private showSlide(i: number) {
    const slide = SLIDER_SLIDES[i];
    const back = 1 - this.bgFront;
    const incoming = this.bgs[back];
    const incomingLayer = this.layers[back];
    const outgoing = this.bgs[this.bgFront];
    const outgoingLayer = this.layers[this.bgFront];
    const handoff = !this.firstThrow && !!this.bgSrc;

    // ── t=0: the old text leaves and the scrim opens together, so the photo is
    // already unobstructed by the time the text is gone.
    this.retireHeadline();
    restartAnim(this.overlay, this.firstThrow ? 'scrim-open-first' : 'scrim-open', [
      'scrim-open',
      'scrim-open-first',
      'scrim-close',
    ]);

    // The incoming photo goes UNDERNEATH and is simply there, opaque, from this
    // frame on — it needs no animation of its own. That is what keeps the flat
    // blue unreachable for the whole handoff.
    incomingLayer.style.zIndex = '1';
    outgoingLayer.style.zIndex = '2';
    incoming.classList.remove('leaving');
    incoming.src = slide.photo;
    incoming.classList.add('visible');
    restartAnim(incomingLayer, 'drifting');

    if (handoff) {
      // the only animated element in the whole transition
      restartAnim(outgoing, 'leaving');
      this.setTimer(() => {
        outgoing.classList.remove('visible', 'leaving');
        outgoing.removeAttribute('src');
      }, FADE_DONE + 60);
    }

    this.bgSrc = slide.photo;
    this.bgFront = back;
    this.firstThrow = false;

    this.onSlideStart();
    this.warm(i + 1);

    // ── the scrim closes and the new text rises with it, the instant the fade
    // lands — no gap between the photo settling and the text arriving.
    this.setTimer(() => {
      restartAnim(this.overlay, 'scrim-close', [
        'scrim-open',
        'scrim-open-first',
        'scrim-close',
      ]);
      this.setHeadline(slide.headline);
      this.headline.classList.remove('out');
      void this.headline.offsetWidth; // commit the base state so words animate
      this.headline.classList.add('show');
    }, FADE_DONE);
    this.setTimer(() => this.advance(), HOLD_MS);
  }

  /**
   * Rebuild the headline as staggered word spans. Each word rises out of blur
   * on its own delay; a plain-text separator preserves the wrapping (the CSS
   * `.word` is inline-block so it never splits mid-word).
   */
  private setHeadline(text: string) {
    this.headline.textContent = '';
    const words = bindShortWords(text).split(' ');
    words.forEach((w, i) => {
      if (i > 0) this.headline.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w;
      span.style.transitionDelay = `${i * WORD_STAGGER_MS}ms`;
      this.headline.appendChild(span);
    });
  }

  /** the text leaves ahead of the photos, so the fade starts on a clean frame */
  private retireHeadline() {
    this.headline.classList.remove('show');
    this.headline.classList.add('out');
  }

  private advance() {
    if (!this.active) return;
    this.current = (this.current + 1) % SLIDER_SLIDES.length;
    this.showSlide(this.current);
  }

  /** full exit — the headline melts up while the whole layer fades */
  private deactivate() {
    if (!this.active) return;
    this.active = false;
    this.clearTimers();
    this.screenEl.classList.remove('slider-on');
    this.root.classList.remove('active');
    this.retireHeadline();
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = window.setTimeout(() => {
      this.headline.classList.remove('out');
      // stop the drift so a re-entry starts from a known scale
      this.layers.forEach((l) => l.classList.remove('drifting'));
    }, OUT_MS + 100);
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

/**
 * Restart a CSS animation driven by a class. Dropping and re-adding the class
 * in one task is a no-op — the style change has to be flushed in between, which
 * is what reading `offsetWidth` forces.
 */
function restartAnim(el: HTMLElement, cls: string, siblings: string[] = [cls]) {
  el.classList.remove(...siblings);
  void el.offsetWidth;
  el.classList.add(cls);
}
