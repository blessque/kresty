/**
 * ROUND 21 — the client's rule, made mechanical:
 *
 *   "Headings only visible when photo visible."
 *
 * So the assertion is not "does it look right", it is an INVARIANT sampled every
 * frame across the slider's exit and its next idle wake:
 *
 *   headline ≤ photo + TOL,  where headline = parentOpacity × max(word opacity)
 *
 * Stated that way it passes the two moments that are CORRECT and must not be
 * flagged: on the exit the block melts over 540ms while the photo layer takes
 * 1100ms, so the headline is strictly ahead of its photo the whole way down; on
 * the entrance the words rise 950ms after the layer started fading in, by which
 * time it is at ~0.97. A cruder rule ("words visible => photo > 0.5") flags both.
 *
 * Three measurement traps, all load-bearing here:
 *
 *  - IT IS A PRODUCT, NOT THE WORDS ALONE. `.slider-headline.out .word` pins
 *    every span at opacity 1 on purpose — the exit is a block melt, so only the
 *    PARENT's opacity falls. Sampling the spans by themselves reads a flat 1.000
 *    across the entire exit and cannot see anything.
 *  - AND NOT THE PARENT ALONE. `.slider-headline` sits at opacity 1 with no
 *    `.show` class and no children at all, so a probe that reads only the parent
 *    reports a confident 1.000 before anything has happened (round 18.3 shipped
 *    that mistake first).
 *  - MOVE THE MOUSE EXACTLY ONCE, and not onto a nav link. A second pointermove
 *    re-arms the idle countdown and moves the window this probe is looking at;
 *    landing on a link takes the `hoverBlocked` path instead of the ordinary
 *    idle wake, which is a different bug with the same symptom.
 *
 * Needs `npm run dev` on :5199. Exit code 1 = the invariant was violated.
 */
import { chromium } from 'playwright-core';

const URL = 'http://localhost:5199/?fx=slider';

/* MIRRORS `IDLE_MS` in src/screens/main/PhotoSlider.ts — keep them in step.
 * Both waits below are that delay plus the throw (FADE_DONE 950) plus the word
 * reveal (700 + 4 x 80 stagger ≈ 1020), rounded up. Sampling too early makes the
 * setup guard trip rather than pass vacuously, which is the failure mode to
 * prefer — but it still has to be told. Round 22 took this 1000 → 2000. */
const IDLE_MS = 2000;
const SETTLE_MS = IDLE_MS + 2500; // slider takes over, headline finishes rising
const WATCH_MS = IDLE_MS + 2500; // the exit, the idle wake, and the reveal after it
const TOL = 0.05; // both tracks land on 1.0 at rest; float + frame skew only

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(SETTLE_MS);

const armed = await page.evaluate(() => {
  const words = document.querySelectorAll('.slider-headline .word');
  return {
    sliderOn: document.querySelector('#screen-main')?.classList.contains('slider-on'),
    words: words.length,
    maxWord: Math.max(0, ...[...words].map((w) => +getComputedStyle(w).opacity)),
  };
});
if (!armed.sliderOn || armed.words === 0 || armed.maxWord < 0.9) {
  console.error('SETUP FAILED — the slider was not up before the probe:', armed);
  await browser.close();
  process.exit(2);
}

// start the sampler, then wake the screen with ONE move, away from every link
await page.evaluate((ms) => {
  const w = /** @type {any} */ (window);
  w.__samples = [];
  const t0 = performance.now();
  const slider = document.querySelector('.photo-slider');
  const block = document.querySelector('.slider-headline');
  const tick = () => {
    const t = performance.now() - t0;
    const words = document.querySelectorAll('.slider-headline .word');
    const word = Math.max(0, ...[...words].map((el) => +getComputedStyle(el).opacity));
    const par = +getComputedStyle(block).opacity;
    w.__samples.push({
      t: Math.round(t),
      word,
      par,
      head: par * word,
      photo: +getComputedStyle(slider).opacity,
      n: words.length,
    });
    if (t < ms) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, WATCH_MS);

await page.mouse.move(120, 700); // bottom-left: no nav link, no CTA, no corner mark
await page.waitForTimeout(WATCH_MS + 300);

const samples = await page.evaluate(() => /** @type {any} */ (window).__samples);
await browser.close();

const bad = samples.filter((s) => s.head > s.photo + TOL);

console.log(`sampled ${samples.length} frames over ${WATCH_MS}ms`);
const show = (s) =>
  `  t=${String(s.t).padStart(4)}ms  headline=${s.head.toFixed(3)} (par ${s.par.toFixed(
    2,
  )} x word ${s.word.toFixed(2)})  photo=${s.photo.toFixed(3)}  spans=${s.n}`;
console.log('timeline (every ~8th frame):');
samples.filter((_, i) => i % 8 === 0).forEach((s) => console.log(show(s)));

if (errors.length) console.log('page errors:', errors);

if (bad.length) {
  console.log(
    `\nINVARIANT VIOLATED on ${bad.length} frames — headline more present than its photo:`,
  );
  console.log(show(bad[0]) + '   <- first');
  const peak = bad.reduce((a, b) => (b.head - b.photo > a.head - a.photo ? b : a));
  console.log(show(peak) + '   <- worst');
  console.log(show(bad[bad.length - 1]) + '   <- last');
  console.log(`window: ${bad[0].t}–${bad[bad.length - 1].t}ms`);
  process.exit(1);
}
console.log('\nOK — the headline was never more present than its photo.');
