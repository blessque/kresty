/**
 * THREE SLIDERS A PAGE AT MOST, AND NEVER TWO ON ONE SCREEN — the client's rule
 * (round 30.1). `npm run probe:sliders`. Exits non-zero on any violation.
 *
 * Round 30 topped every picture set up so none sat still, and «О Крестах»
 * ended with nine strips — two of them in frame at once, bands of photographs
 * stacked around one paragraph. The rule is now: a page carries at most
 * `MAX_SLIDERS` scroll-panned strips, and between any two there is at least one
 * full viewport of other content, so no screen ever shows two. Everything else
 * is a single figure.
 *
 * WHY A SWEEP AND NOT ONE MEASUREMENT: the gap is prose, whose height is set by
 * the WIDTH (wrapping), while the screen it must exceed is the HEIGHT. A tall
 * narrow window is the worst case, and a 1440×900 check alone would pass a
 * layout that fails at 2560×1440. Gaps are read from `getBoundingClientRect()`
 * of two blocks in the same scroller at one instant, so scroll position cancels.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 5398;
const MAX_SLIDERS = 3;
const VIEWPORTS = [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [1440, 1200],
  [2560, 1440],
];
const ROUTES = ['#concept', '#museum', '#news', '#news/1', '#rent', '#contacts'];

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
  for (const hash of ROUTES) {
    console.log(`\n── ${hash}`);
    for (const [width, height] of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`http://127.0.0.1:${PORT}/${hash}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const gaps = await page.evaluate(() => {
        // only the screen on show — every route's DOM stays mounted
        const shown = [...document.querySelectorAll('.ms--slider')]
          // `getClientRects()` is NOT enough: hidden screens keep their boxes
          .filter((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
        const r = shown.map((e) => e.getBoundingClientRect());
        return { n: shown.length, gaps: r.slice(1).map((b, i) => Math.round(b.top - r[i].bottom)) };
      });
      await page.close();
      const tight = gaps.gaps.filter((g) => g < height);
      const bad = gaps.n > MAX_SLIDERS || tight.length > 0;
      if (bad) failures++;
      console.log(
        `  ${`${width}×${height}`.padEnd(10)} sliders=${gaps.n}  gaps=[${gaps.gaps.join(', ')}]` +
          (bad ? `  FAIL${gaps.n > MAX_SLIDERS ? ` >${MAX_SLIDERS}` : ''}${tight.length ? ` gap<${height}` : ''}` : '  ok'),
      );
    }
  }
} finally {
  await browser.close();
  vite.kill();
}

if (failures) {
  console.error(
    `\n${failures} page/viewport combination(s) break the slider rule.\n` +
      `Fix it in the DATA: turn a set into a single \`media(pic(...))\`, or move it\n` +
      `so a whole section of prose separates it from its neighbour.`,
  );
  process.exit(1);
}
console.log(`\nsliders: ≤ ${MAX_SLIDERS} per page, never two on one screen, at every viewport`);
