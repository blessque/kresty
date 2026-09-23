/**
 * THE HEADING BANDS DO NOT OVERFLOW THEIR MEASURE — swept, at every width that
 * matters. `npm run probe:heads`. Exits non-zero on the first overflow.
 *
 * Round 29 turned three pages' section headings into a ten-column FACTOID band
 * (72/110%) and turned `hyphens: auto` OFF with them. That second half is the
 * part that needs a guard. Hyphenation was load-bearing while H2 was a FLAT 40px
 * in a four-column column — the type stopped shrinking below 1440 while the
 * column kept going, so the headroom evaporated. The band changes both terms:
 * the measure is ten columns and `--fs-factoid` is fluid again,
 * `clamp(60px, 5vw, 72px)`. Measured worst clearance at the time of writing:
 *
 *   width   1440   1366   1309   1280   1240   1200   1180   1165
 *   concept  −4.0   −3.5   −3.8   −3.6   −3.2   −2.8   −8.2   −5.6
 *   museum  −244   −232   −222   −217   −210   −203   −187   −175
 *   article  −38.6  −36.4  −35.2  −34.3  −33.0  −31.7  −15.7   −3.7
 *
 * Negative is clearance. «О Крестах» runs on 3px of it, so a copy edit to any
 * `PAGE_SECTIONS.h2` can break this — which is why it is a script and not a
 * paragraph in the tuning log.
 *
 * TWO MEASUREMENT TRAPS, both of which gave a wrong answer to this exact
 * question before:
 *
 * - NOT `scrollWidth − clientWidth`. concept.css records a sweep that came back
 *   clean on a layout overflowing by 83px: the heading was centred, so the
 *   excess hung out both sides and scrollWidth under-reported it.
 *   `Range.getClientRects()` sees it either way, and still will if the band is
 *   ever centred again.
 * - NOT ESTIMATED FROM THE CLAMP. Scaling the 1440 line width by the ratio of
 *   the two clamp values predicts a 28px overflow just above the breakpoint.
 *   There isn't one: each heading re-wraps as the measure narrows, so WHICH
 *   heading is worst changes with the width (note the concept row switching from
 *   «Остановиться…» to «Позаботиться…» at 1180). Only rendering knows.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 5399;
const WIDTHS = [1440, 1366, 1309, 1280, 1240, 1200, 1180, 1165];
const ROUTES = [
  ['#concept', '.sec-h2'],
  ['#museum', '.mus-era'],
  ['#news/1', '.article-body > h2'],
];

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => {
  vite.stdout.on('data', (b) => String(b).includes('ready in') && r());
  setTimeout(r, 8000);
});

let failures = 0;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [hash, sel] of ROUTES) {
    console.log(`\n── ${hash}   ${sel}`);
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/${hash}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const rows = await page.evaluate((sel) => {
        const out = [];
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          const box =
            el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const r = document.createRange();
          r.selectNodeContents(el);
          let widest = 0;
          for (const rect of r.getClientRects()) widest = Math.max(widest, rect.width);
          out.push({
            text: (el.textContent || '').slice(0, 22),
            over: +(widest - box).toFixed(1),
            fs: cs.fontSize,
            box: +box.toFixed(1),
          });
        }
        return out;
      }, sel);
      await page.close();
      if (!rows.length) {
        console.log(`  ${width}  (no match)`);
        continue;
      }
      const worst = rows.reduce((a, b) => (b.over > a.over ? b : a));
      if (worst.over > 0) failures++;
      const flag = worst.over > 0 ? `OVERFLOW +${worst.over}` : `ok ${worst.over}`;
      console.log(
        `  ${String(width).padEnd(5)} fs=${worst.fs.padEnd(5)} box=${String(worst.box).padEnd(7)} ${flag.padEnd(16)} «${worst.text}…»`,
      );
    }
  }
} finally {
  await browser.close();
  vite.kill();
}

if (failures) {
  console.error(
    `\n${failures} heading/width combination(s) overflow the ten-column measure.\n` +
      `The lever is usually the COPY, not the type: shorten the heading, or take an\n` +
      `NBSP out with bindShortWords. If a single long word is genuinely the cause,\n` +
      `re-enable \`hyphens: auto\` — and note hyphenate-limit-chars counts the NBSP\n` +
      `RUN, not the word, so «в исторических» is 14 characters and not 12.`,
  );
  process.exit(1);
}
console.log('\nheading bands: no overflow at any swept width');
