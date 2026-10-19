/**
 * The film grain (round 33). Its default is the user's pick from the light lab
 * (`GRAIN_DEFAULTS`): 0.015 moving in 33.1, OFF again in 33.2 — at 0 no tile is
 * ever built and the layer is `display: none`. Size and motion keep 33.1's
 * values, so switching it back on in the lab starts from there.
 *
 * WHAT IT REPLACES, AND WHY: `#grain` was one 128×128 random tile at CSS-pixel
 * size, static, 0.07 overlay. Measured on the user's own screenshots it repeated
 * EXACTLY every 256 device px (autocorrelation 0.59 there, 0.02 beside it) — the
 * "mechanical grid" — and each speck was 2×2 device px on a 2× screen, 3×3 on a
 * phone: big grain. The user's brief for the new one: none by default, and when
 * on it must look right on every screen from a phone to a TV.
 *
 * So:
 *  - speck size is set in CSS px — the unit browsers keep at a roughly constant
 *    visual angle from phone to laptop to TV — and rendered at DEVICE resolution:
 *    white noise per device pixel, gaussian-blurred to the requested size. Soft
 *    specks, never a magnified square of pixels;
 *  - three tiles with PRIME edges (509 / 761 / 1021 device px) averaged with
 *    equal weight: each repeats on its own period, their sum repeats every
 *    509·761·1021 px — never on any screen — and no single period carries more
 *    than a third of the pattern;
 *  - `film` re-positions the layer 24 times a second by whole device pixels, on
 *    the compositor (a transform), like grain that changes every frame of film;
 *    `prefers-reduced-motion` keeps it still.
 *
 * Amount 0 removes the layer (`display: none`) — which also takes a full-screen
 * overlay blend off every frame, a real cost on a 5K screen.
 *
 * Pure: imports nothing internal.
 */

export interface GrainSettings {
  /** overlay opacity, 0 = off */
  amount: number;
  /** speck size, CSS px (≈ constant visual angle across screens) */
  size: number;
  /** re-randomise 24 times a second */
  film: boolean;
}

const TILES = [509, 761, 1021];
/** the layer is this much larger than the screen on every side, CSS px — room for film jitter */
const OVERSCAN = 64;

/** the shipped grain — the user's pick (33.2: off; 33.1 was 0.015, moving) */
export const GRAIN_DEFAULTS: GrainSettings = { amount: 0, size: 1, film: true };

let el: HTMLElement | null = null;
let current: GrainSettings = { ...GRAIN_DEFAULTS };
let builtFor = '';
let urls: string[] = [];
let timer = 0;
let dprQuery: MediaQueryList | null = null;

/**
 * The first build waits out the light's entrance: building the tiles is real
 * main-thread work, and at load it would land on the main screen's burst.
 * At 1.5 % opacity, grain arriving a second late is invisible.
 */
const FIRST_BUILD_MS = 1500;

export function initGrain(element: HTMLElement): void {
  el = element;
  window.setTimeout(() => void apply(), FIRST_BUILD_MS);
}

export function setGrain(s: Partial<GrainSettings>): void {
  current = { ...current, ...s };
  void apply();
}

export function grainSettings(): GrainSettings {
  return { ...current };
}

async function apply() {
  if (!el) return;
  if (!(current.amount > 0)) {
    el.style.display = 'none';
    stopFilm();
    return;
  }
  const dpr = devicePixelRatio || 1;
  const key = `${dpr}|${current.size}`;
  if (key !== builtFor) {
    builtFor = key;
    await build(dpr, current.size);
    watchDpr();
  }
  el.style.display = 'block';
  el.style.setProperty('--grain-amt', String(current.amount));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (current.film && !reduced) startFilm();
  else stopFilm();
}

/** the window moved to a screen of another density: rebuild at its pixels */
function watchDpr() {
  dprQuery?.removeEventListener('change', onDpr);
  dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onDpr);
}
function onDpr() {
  builtFor = '';
  void apply();
}

async function build(dpr: number, sizeCss: number) {
  if (!el) return;
  // blurred white noise has specks of FWHM ≈ 3.33·σ, so σ = speck / 3.33
  const sigma = Math.max(0, (sizeCss * dpr) / 3.33);
  const alphas = [1 / 3, 1 / 2, 1]; // top → bottom: equal weight in the composite
  // ONE TILE PER TASK: each `await` hands the thread back, so the light keeps its
  // frames. All three in one task (`Promise.all`) blocked the main thread for
  // 130–190 ms on an M1 — ten dropped frames at every load (round 33.1).
  const next: string[] = [];
  for (let i = 0; i < TILES.length; i++) next.push(await tileUrl(TILES[i], sigma, alphas[i], i + 1));
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = next;
  el.style.backgroundImage = urls.map((u) => `url(${u})`).join(', ');
  el.style.backgroundSize = TILES.map((n) => `${n / dpr}px ${n / dpr}px`).join(', ');
  el.style.inset = `-${OVERSCAN}px`;
}

/** one seamless tile: white noise, a circular gaussian blur, unit variance */
async function tileUrl(n: number, sigma: number, alpha: number, seed: number): Promise<string> {
  let s = (0x9e3779b9 * seed) >>> 0;
  let f: Float32Array<ArrayBuffer> = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) {
    // two uniform draws summed (a triangular distribution), the LCG inlined
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const a = s;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    f[i] = (a + s) / 4294967296 - 1;
  }
  if (sigma > 0.35) f = blurWrap(f, n, sigma);
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < f.length; i++) {
    sum += f[i];
    sum2 += f[i] * f[i];
  }
  const mean = sum / f.length;
  // √3: averaging three independent tiles divides the deviation by √3
  const k = (36 * Math.sqrt(3)) / Math.sqrt(Math.max(sum2 / f.length - mean * mean, 1e-12));
  const img = new ImageData(n, n);
  const px = img.data; // a Uint8ClampedArray: it rounds and clamps on store
  const a8 = Math.round(alpha * 255);
  for (let i = 0, j = 0; i < f.length; i++, j += 4) {
    const g = 128 + k * (f[i] - mean);
    px[j] = g;
    px[j + 1] = g;
    px[j + 2] = g;
    px[j + 3] = a8;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  cv.getContext('2d')!.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r));
  return blob ? URL.createObjectURL(blob) : cv.toDataURL();
}

/** separable gaussian with wrap-around, so the tile stays seamless */
function blurWrap(src: Float32Array<ArrayBuffer>, n: number, sigma: number): Float32Array<ArrayBuffer> {
  const r = Math.ceil(sigma * 3);
  const taps = 2 * r + 1;
  const k = new Float64Array(taps);
  let ksum = 0;
  for (let i = 0; i < taps; i++) ksum += k[i] = Math.exp(-((i - r) ** 2) / (2 * sigma * sigma));
  for (let i = 0; i < taps; i++) k[i] /= ksum;
  // rows: each copied into a line padded with its own wrapped ends, so the inner
  // loop takes no modulo — a modulo per tap was most of the old 150 ms
  const line = new Float32Array(n + 2 * r);
  const tmp = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const o = y * n;
    line.set(src.subarray(o, o + n), r);
    for (let i = 0; i < r; i++) {
      line[i] = src[o + n - r + i];
      line[n + r + i] = src[o + i];
    }
    for (let x = 0; x < n; x++) {
      let acc = 0;
      for (let i = 0; i < taps; i++) acc += k[i] * line[x + i];
      tmp[o + x] = acc;
    }
  }
  // columns, a row at a time: whole rows of `tmp`, weighted and summed, so
  // memory is read in order and the wrap is one modulo per ROW
  const out = new Float32Array(n * n);
  const acc = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    acc.fill(0);
    for (let i = 0; i < taps; i++) {
      const w = k[i];
      const o = ((y + i - r + n) % n) * n;
      for (let x = 0; x < n; x++) acc[x] += w * tmp[o + x];
    }
    out.set(acc, y * n);
  }
  return out;
}

function startFilm() {
  if (timer || !el) return;
  const dpr = devicePixelRatio || 1;
  const target = el;
  timer = window.setInterval(() => {
    // whole DEVICE pixels, so a speck never lands between two and smears
    const x = Math.floor(Math.random() * OVERSCAN * dpr) / dpr;
    const y = Math.floor(Math.random() * OVERSCAN * dpr) / dpr;
    target.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, 1000 / 24);
}

function stopFilm() {
  if (timer) clearInterval(timer);
  timer = 0;
  if (el) el.style.transform = '';
}
