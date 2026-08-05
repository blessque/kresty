# «Слайдер» Star Photo Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 4th switcher tab «Слайдер» where, after 4.2 s idle, a photo slider takes over: zenith photo full-bleed, nadir photo inside a star mask thrown out of the light center, per-slide headline — with the «Сияние» light acting as the projector (flash on each slide change, ember between).

**Architecture:** New DOM/CSS component `StarSlider` (z:1, under the screen-blended ray canvas) + a stage-transform mirror for stage-coordinate star placement; headline lives in the real stage (z:4, above the light). Light choreography is CPU-side param modulation in `MainScreen.update` (same pattern as `converge`/burst) — **zero shader changes, zero new uniforms**.

**Tech Stack:** Vite + vanilla TS (strict), CSS masks/transitions, playwright-core headless verification. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-23-star-slider-design.md`

**Testing note:** This prototype has NO unit-test framework (and must not gain one — no new deps). The project's verification convention is `npm run build` (runs `tsc --noEmit`) + headless-Chrome screenshot scripts against `npm run dev` on :5199. Tasks below follow that convention instead of TDD.

**Git rules (hard):** NEVER add AI co-author lines to commits. NEVER commit `CLAUDE.md`.

---

### Task 1: Assets — real photos in, placeholders out

**Files:**
- Create: `src/assets/star.svg` (moved from `public/resources/Star 1.svg`)
- Delete: `public/resources/карта.png`, `public/resources/reference-light-3.png`, `public/resources/reference-light-4.png`, `public/resources/reference-light-5.png`, `public/resources/Screenshot 2026-07-15 at 14.40.43 1.png`, `public/resources/Star 1.svg`, plus stray non-asset files
- Modify: `.gitignore`

- [ ] **Step 1: Move the star SVG into src/assets**

```bash
mv "public/resources/Star 1.svg" src/assets/star.svg
```

- [ ] **Step 2: Delete the old placeholder photos and stray files**

`public/resources/` currently also holds stray files from the user's photo drop (`23 июл. 2026 г., 15_43_52 1.png`, several `ChatGPT Image*.png`, `image 32.png`) — per the user, everything that is not fonts/`scene.glb`/`main-*.png` goes.

```bash
cd public/resources
rm "карта.png" "reference-light-3.png" "reference-light-4.png" "reference-light-5.png" "Screenshot 2026-07-15 at 14.40.43 1.png"
rm -f "23 июл. 2026 г., 15_43_52 1.png" ChatGPT*.png "image 32.png"
ls
```

Expected remaining: 5 font files, `scene.glb`, `main-1a.png`, `main-1b+3b.png`, `main-2a.png`, `main-2b.png`, `main-3a.png`, `main-4a.png`, `main-4b.png` (and `.DS_Store`, ignored).

**IMPORTANT — check before deleting stray files:** if any `ChatGPT Image*.png` / `image 32.png` names appear in `SLIDER` naming (they should not — the user renamed the real ones to `main-*`), stop and ask. `main-3b.png` does not exist by design (slide 3 shares `main-1b+3b.png`).

- [ ] **Step 3: Drop the placeholder block from .gitignore**

In `.gitignore`, delete these lines (the placeholder era ends; new photos ARE committed):

```
# placeholder showreel & hover photos — real content TBD from client.
# Kept locally so `npm run dev` renders them; not committed (see README).
/public/resources/карта.png
/public/resources/reference-light-3.png
/public/resources/reference-light-4.png
/public/resources/reference-light-5.png
/public/resources/Screenshot 2026-07-15 at 14.40.43 1.png
```

- [ ] **Step 4: Verify git sees exactly the right files**

```bash
git status --short
```

Expected: modified `.gitignore`; untracked `src/assets/star.svg` + the 7 `public/resources/main-*.png`. Nothing else.

- [ ] **Step 5: Commit**

```bash
git add .gitignore src/assets/star.svg "public/resources/main-1a.png" "public/resources/main-1b+3b.png" "public/resources/main-2a.png" "public/resources/main-2b.png" "public/resources/main-3a.png" "public/resources/main-4a.png" "public/resources/main-4b.png"
git commit -m "Assets: real slider photos (nadir/zenith pairs) + star mask; placeholders removed"
```

---

### Task 2: Slide data + re-point showreel/hover images

**Files:**
- Modify: `src/screens/main/layout.ts` (SHOWREEL_IMAGES + new SLIDER_SLIDES)
- Modify: `src/screens/main/MainScreen.ts:88-93` (hover image list)

- [ ] **Step 1: Replace SHOWREEL_IMAGES and add SLIDER_SLIDES in layout.ts**

Replace the existing `SHOWREEL_IMAGES` block with:

```ts
export const SHOWREEL_IMAGES = [
  '/resources/main-1a.png',
  '/resources/main-2a.png',
  '/resources/main-3a.png',
  '/resources/main-4a.png',
].map((p) => encodeURI(p));

/**
 * «Слайдер» slides — real client photos, paired by filename: `Na` = nadir
 * (top-down, inside the star mask), `Nb` = zenith (ground-up, full-bleed
 * background). Slides 1 and 3 share the sky background `main-1b+3b.png`.
 * Headlines from Figma frames slider01..04 (node 252:39).
 */
export interface SliderSlide {
  star: string;
  bg: string;
  headline: string;
}

export const SLIDER_SLIDES: SliderSlide[] = [
  {
    star: '/resources/main-1a.png',
    bg: '/resources/main-1b+3b.png',
    headline: 'Игровые площадки вместо закрытой территории',
  },
  {
    star: '/resources/main-2a.png',
    bg: '/resources/main-2b.png',
    headline: 'Объединение вместо заключения',
  },
  {
    star: '/resources/main-3a.png',
    bg: '/resources/main-1b+3b.png',
    headline: 'Открытые лекции вместо закрытых замков',
  },
  {
    star: '/resources/main-4a.png',
    bg: '/resources/main-4b.png',
    headline: 'Уютные кафе вместо темных коридоров',
  },
].map((s) => ({ ...s, star: encodeURI(s.star), bg: encodeURI(s.bg) }));
```

(`encodeURI` keeps `+` literal — correct for a URL *path*; matches the existing pattern.)

- [ ] **Step 2: Re-point the hover-scene images in MainScreen.buildDom**

In `MainScreen.ts`, replace the `hoverImages` array (currently `reference-light-3.png`, `карта.png`, `reference-light-5.png`, `reference-light-4.png`):

```ts
    const hoverImages = [
      '/resources/main-1a.png', // История
      '/resources/main-2a.png', // Концепция
      '/resources/main-3a.png', // Аренда
      '/resources/main-4a.png', // Контакты
    ];
```

(Index-aligned with `NAV_LINKS` order.)

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/screens/main/layout.ts src/screens/main/MainScreen.ts
git commit -m "Main: slide data (nadir/zenith pairs + headlines); showreel/hover re-pointed at real photos"
```

---

### Task 3: The «Слайдер» variant in variants.ts

**Files:**
- Modify: `src/screens/main/variants.ts`

- [ ] **Step 1: Extract the «Сияние» params into a named const and add the slider variant**

In `variants.ts`, above `export const VARIANTS`, lift the siyanie params object out (verbatim from the current `VARIANTS[0].params` literal):

```ts
/** «Сияние» params — shared verbatim by the «Слайдер» tab (same light,
 *  different idle behavior: the star slider instead of the old showreel). */
const siyanieParams: RayFieldParams = {
  ...base,
  dissolve: 1,
  signSize: 500,
  godrays: 1.2,
  bloom: 1.1,
  coreIntensity: 0.5,
  coreRadius: 70,
  crossSize: 460, // fallback cross glyph if the mask fails to load
  crossIntensity: 1.2,
  primaryIntensity: 0,
  secCount: 0,
  secIntensity: 0,
  dustAmount: 0.25,
  moteAmount: 0,
  grain: 0.06,
  ca: 0.03,
  hazeBase: 0.05,
  rotSpeed: 0.008,
  parallax: 1.0,
  breathe: 0.25,
  refraction: 0,
  shimmer: 0.3,
  fiberDrift: 0,
  angleWarp: 0,
  ghosting: 0,
  shadow: 0,
  hoverMode: 0,
};
```

Then the siyanie entry becomes (keeping its existing doc comment):

```ts
  {
    id: 'siyanie',
    label: 'Сияние',
    params: { ...siyanieParams },
  },
```

And **after the `prism` entry** (so switcher order is Сияние · Прорезь · Призма · Слайдер), add:

```ts
  {
    id: 'slider',
    label: 'Слайдер',
    // «Проектор»: the «Сияние» light + the star photo slider as the idle
    // show — the light throws each slide out of its own centre, then
    // retreats to an ember (modulated CPU-side in MainScreen).
    params: { ...siyanieParams },
  },
```

- [ ] **Step 2: Bump SWITCHER_COUNT**

```ts
/** How many of VARIANTS (from the top) appear in the segmented control. */
export const SWITCHER_COUNT = 4;
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. (The `?fx=slider` URL override works automatically via `variantIndexFromUrl`.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/main/variants.ts
git commit -m "Main: 4th switcher tab «Слайдер» — «Сияние» params, own idle behavior"
```

---

### Task 4: StarSlider component + CSS

**Files:**
- Create: `src/screens/main/StarSlider.ts`
- Modify: `src/screens/main/main.css`

- [ ] **Step 1: Create src/screens/main/StarSlider.ts**

```ts
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
```

- [ ] **Step 2: Add the CSS to main.css** (after the `.showreel` blocks, before `.hover-scene`)

```css
/* «Слайдер»: zenith photo full-bleed + nadir photo in a star mask, thrown
   out of the light centre. Sits in the showreel's z-slot (only one of the
   two idle shows is ever armed). The headline is NOT here — it lives in the
   stage (z:4) so the screen-blended light never washes the text. */
.star-slider {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  transition: opacity 0.7s ease;
  pointer-events: none;
}
.star-slider.active {
  opacity: 1;
}
.star-slider img.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.8s ease;
}
.star-slider img.bg.visible {
  opacity: 1;
}
/* flat legibility overlay (user dial: 0.2; Figma mockup had 0.41) */
.star-slider .star-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
}
/* mirror of .stage — the star is positioned in 1440×800 stage px */
.star-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1440px;
  height: 800px;
  transform-origin: center;
  /* transform set from JS: translate(-50%,-50%) scale(s) */
}
/* base state = collapsed into the light centre; base transition = the
   collapse (ease-in). .in overrides with the explosive expo-out throw.
   mask-image + geometry set from TS (star.svg data URI, Figma numbers). */
.star-wrap {
  position: absolute;
  width: 1000px;
  height: 1000px;
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  transform: scale(0.05);
  opacity: 0;
  transition:
    transform 0.25s cubic-bezier(0.7, 0, 0.84, 0),
    opacity 0.1s linear 0.15s;
  will-change: transform;
}
.star-wrap.in {
  transform: scale(1);
  opacity: 1;
  transition:
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.15s ease;
}
.star-wrap img.star {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

And add the headline + nav-dim styles after the `.nav-link` blocks:

```css
/* per-slide headline (Figma slider01: Chromius Medium 64, w 692, x 784, y 294) */
.slider-headline {
  position: absolute;
  left: 784px;
  top: 294px;
  transform: translateX(-50%);
  width: 692px;
  text-align: center;
  font-family: 'ALS Chromius', 'ALS Hauss Next', sans-serif;
  font-size: 64px;
  font-weight: 500;
  font-variation-settings: 'wght' 500;
  line-height: normal;
  color: #fff;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.slider-headline.show {
  opacity: 1;
}

/* while the slider shows, the nav yields (Figma: 50%) */
#screen-main.slider-on .nav-link {
  opacity: 0.5;
}
```

Also extend the existing `.nav-link` transition line so the dim eases:

```css
  transition: text-shadow 0.25s ease, color 0.25s ease, opacity 0.5s ease;
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean (StarSlider is not yet imported anywhere — that's Task 5).

Note: `npm run build` would flag an unused file only via linting, which this project doesn't have; typecheck-clean is enough here.

- [ ] **Step 4: Commit**

```bash
git add src/screens/main/StarSlider.ts src/screens/main/main.css
git commit -m "Main: StarSlider component — star-masked nadir/zenith slides, stage-mirror geometry"
```

---

### Task 5: MainScreen integration — arming + «Проектор» light choreography

**Files:**
- Modify: `src/screens/main/MainScreen.ts`

- [ ] **Step 1: Import + fields**

Add import:

```ts
import { StarSlider } from './StarSlider';
```

Add to `SLIT_IDS` (the slider renders the «Сияние» slit light):

```ts
const SLIT_IDS = new Set(['siyanie', 'prorez', 'slider']);
```

Add fields next to `private showreel!: Showreel;`:

```ts
  private starSlider!: StarSlider;
  /** seconds since the slider last threw a slide — the projector flash */
  private sliderFlashT = 10;
```

- [ ] **Step 2: Construct in buildDom**

In `buildDom()`, right after the `corner-mark` block (the stage exists by then, and before the final `this.layout()` call):

```ts
    // «Слайдер» idle show (armed only on its tab; headline goes in the stage)
    this.starSlider = new StarSlider(this.el, this.stage);
    this.starSlider.onFlash = () => (this.sliderFlashT = 0);
```

- [ ] **Step 3: Mirror the stage transform in layout()**

In the `layout` arrow function, after `this.stage.style.transform = ...`:

```ts
    this.starSlider.layout(s);
```

- [ ] **Step 4: Arm exactly one idle show per tab**

Add a private method:

```ts
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
```

In `start()`, replace `this.showreel.attach();` with `this.armIdleShow();`.
In `stop()`, after `this.showreel.detach();` add `this.starSlider.detach();`.
In `setVariant()`, after the `fxButtons` line, add `this.armIdleShow();`.

- [ ] **Step 5: The «Проектор» modulation in update()**

Right after the appearance-burst block (`if (this.burstT < 1.2 && this.slitMix > 0.01) { ... }`), add:

```ts
    // «Проектор» (round 6): while the star slider shows, the light retreats
    // to an ember — no blown core behind the headline, faint god-rays leaking
    // from behind the star's points — and flashes to throw each slide out of
    // its centre. CPU-side param modulation only (same pattern as converge
    // and the burst): zero shader changes.
    const sm = this.starSlider.mix;
    if (sm > 0.001 || this.sliderFlashT < 1.2) {
      p = { ...p };
      p.coreIntensity *= 1 - 0.92 * sm;
      p.bloom *= 1 - 0.7 * sm;
      p.godrays *= 1 - 0.55 * sm;
      p.dustAmount *= 1 - 0.6 * sm;
      if (this.sliderFlashT < 1.2) {
        const k = Math.exp(-this.sliderFlashT / 0.15);
        p.godrays *= 1 + 3.5 * k;
        p.bloom *= 1 + 2.5 * k;
        p.coreIntensity *= 1 + 2.0 * k;
      }
    }
    this.sliderFlashT += dt;
```

(Note `p = { ...p }` may clone twice in a frame alongside the burst block — negligible, and keeps each block self-contained.)

- [ ] **Step 6: Feed bgMix from either show**

In the `RayFieldState` literal, change:

```ts
      bgMix: Math.max(this.showreel.mix, this.starSlider.mix),
```

The slider must NOT touch `modeMix` — check that the `modeTarget` line still reads `Math.max(this.sceneDim, this.showreel.dark)` (white/holographic light stays over the naturally-exposed photos; dusty amber remains the hover/old-showreel mechanic).

Also update the stale comment above the fx-switch builder (`// segmented control: «Прорезь» (logo-slit) + «Призма»`) to:

```ts
    // segmented control: Сияние · Прорезь · Призма · Слайдер
```

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected: `tsc --noEmit` clean + Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/screens/main/MainScreen.ts
git commit -m "Main: «Проектор» — slider armed per tab, ember + flash light choreography"
```

---

### Task 6: End-to-end verification (both backends)

**Files:**
- Create: `<scratchpad>/slider-check.mjs` (temporary — NOT committed, lives outside the repo)

- [ ] **Step 1: Start the dev server** (background)

```bash
npm run dev -- --port 5199 --strictPort
```

- [ ] **Step 2: Write the headless check script** to the session scratchpad directory (pattern copied from `scripts/interact-test.mjs`)

```js
import { chromium } from 'playwright-core';

const out = process.env.OUT ?? '.';
const url = process.env.URL ?? 'http://localhost:5199/?fx=slider';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/s1-rest.png` }); // flat blue + «Сияние»

// idle fires at 4200 ms; catch the star mid-throw, then settled
await page.waitForTimeout(3200);
await page.screenshot({ path: `${out}/s2-entry.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/s3-slide1.png` }); // star+headline+dim links

// first advance: collapse -> flash -> next slide
await page.waitForTimeout(5800);
await page.screenshot({ path: `${out}/s4-slide2.png` });

// wake up: full exit back to flat blue
await page.mouse.move(700, 400);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/s5-wake-mid.png` });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/s6-awake.png` });

console.log('LOGS:', JSON.stringify(logs, null, 1));
await browser.close();
```

- [ ] **Step 3: Run on WebGPU and inspect the screenshots**

```bash
OUT=<scratchpad> node <scratchpad>/slider-check.mjs
```

Read each PNG and check: `s1` flat blue with full «Сияние»; `s2` star mid-throw with flash-bright rays; `s3` settled slide 1 (sky bg + playground star + «Игровые площадки…» headline + links at 50% + ember light — NO blown core behind the text); `s4` slide 2 (ceiling bg + atrium star + «Объединение…»); `s5/s6` clean return to flat blue, links opaque, no leftover headline/star. LOGS must contain `ray field backend: webgpu` and no PAGEERROR.

- [ ] **Step 4: Run on WebGL2**

```bash
URL='http://localhost:5199/?fx=slider&backend=webgl2' OUT=<scratchpad>/gl node <scratchpad>/slider-check.mjs
```

Expected: same composition (the slider is DOM/CSS; only the light differs per backend, and it must match WebGPU). LOGS contain `ray field backend: webgl2`.

- [ ] **Step 5: Regression — tabs 1–3 + hover + transition still work**

```bash
OUT=<scratchpad>/reg node scripts/interact-test.mjs
```

Check: hover scene shows the NEW photos; the switcher walk still lands on «Сияние»; transition to the map and back is intact. Also click the 4th button manually in one extra check if the script doesn't cover it (`.fx-switch button:nth-child(4)`).

- [ ] **Step 6: Fix anything found, re-run until clean, then commit fixes** (if any)

---

### Task 7: Docs

**Files:**
- Modify: `docs/effects/TUNING_LOG.md` (append round-6 section before «Open issues»; add a row note in the variants table area)
- Modify: `docs/CHANGELOG.md` (new session entry)
- Modify: `CLAUDE.md` (local only — NEVER commit it)

- [ ] **Step 1: TUNING_LOG round-6 entry**

Append before `## Open issues` (adapt if implementation deviated):

```markdown
## Feedback round 6 (2026-07-23) — «Слайдер»: the star photo slider

Second hero feature: after 4.2 s idle a photo slider takes over. Each slide =
one scene from two angles: zenith shot (looking up) full-bleed behind, nadir
shot (looking down) inside the 4-pointed star mask (`src/assets/star.svg` —
points aligned with the beam bisectors). Real client photos replaced ALL
placeholders (`public/resources/main-*.png`, committed; pairs by filename,
slides 1+3 share the sky `main-1b+3b.png`). Figma: node 252:39.

- **4th switcher tab `slider`/«Слайдер»** (`SWITCHER_COUNT = 4`) — the
  «Сияние» light + the star slider as its idle behavior. Tabs 1–3 keep the
  old crossfade showreel (re-pointed at `main-1a..4a`); exactly one idle
  show is armed at a time (`armIdleShow`).
- **«Проектор» choreography** (user-chosen over constant-glow / light-off):
  the light throws each slide — flash (`k = e^(−t/0.15)`: godrays ×(1+3.5k),
  bloom ×(1+2.5k), core ×(1+2k)) synced with the star scaling out of the
  light centre (0.5 s expo-out; collapse 0.25 s ease-in; hold 6 s) — then
  retreats to an ember (core ×0.08, bloom ×0.3, godrays ×0.45, dust ×0.4 at
  mix 1). CPU-side param modulation in MainScreen.update, like converge/the
  burst: ZERO shader changes, twins untouched.
- **Star geometry** (Figma slider01): 1000×1000 centred at (784, 400) ≠ the
  light centre (760, 420); `transform-origin` is the light centre in
  star-local coords (476, 520) — grows out of the light, lands on the mockup.
  The star lives in `.star-stage`, a stage-transform mirror at z:1 (below
  the canvas); the headline (Chromius Medium 64, w 692, x 784, y 294) lives
  in the REAL stage (z:4) so the screen-blended light never washes the text.
- Photos at natural exposure + flat 0.2 black overlay (user dial; the Figma
  mockup used 0.41 — the fallback if the sky slide fights the white
  headline). The slider does NOT drive modeMix — white/holographic light
  over the photos; dusty amber stays hover/showreel-only. Links dim to 0.5.
- Wake (any pointer/key) = FULL exit (~0.7 s) back to flat blue + default
  light; nothing persists. Cursor-wind, hover shadows etc. untouched.
```

- [ ] **Step 2: CHANGELOG entry** — follow the existing format in `docs/CHANGELOG.md` (read it first), summarizing: 4th tab «Слайдер», star slider + «Проектор» light, real photos replacing all placeholders, hover/showreel re-point.

- [ ] **Step 3: CLAUDE.md updates** (local file, git-excluded): in «What This Project Is» point 1, mention the «Слайдер» tab; in «Project Structure», replace the stale «GITIGNORED but present locally: the 5 placeholder photos…» note with: `public/resources/` = fonts + scene.glb + the committed `main-*.png` client photos; fresh clones now render everything.

- [ ] **Step 4: Commit** (docs only — CLAUDE.md must NOT be staged; it is gitignored, but never `git add -f` it)

```bash
git add docs/effects/TUNING_LOG.md docs/CHANGELOG.md
git commit -m "Docs: round 6 — «Слайдер» star slider + «Проектор» light choreography"
```

---

## Self-review notes

- Spec coverage: assets (T1), slide data + re-points (T2), variant/tab (T3), component+CSS (T4), arming + ember/flash + bgMix + links dim (T5), verification incl. both backends and regression (T6), docs (T7). Spec's «?fx= maps slider» — automatic via `variantIndexFromUrl` (noted in T3).
- Type consistency: `StarSlider.mix`/`onFlash`/`attach`/`detach`/`layout(scale)` used identically in T4 (definition) and T5 (consumption); `SLIDER_SLIDES`/`SliderSlide` defined in T2, imported in T4; `CENTER_X/CENTER_Y` already exported by layout.ts.
- The one deliberate deviation from bite-size TDD: no unit tests exist in this repo (and no new deps allowed) — every task ends with typecheck/build, and T6 is the behavioral gate.
