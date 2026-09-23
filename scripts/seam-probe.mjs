/**
 * ROUND 28. Two things no colour check and no screenshot diff can catch:
 *
 *  1. THE LIGHT'S CENTRE ACROSS THE SEAM. `setReveal` writes a shrunken scale
 *     into `.stage`'s transform; a centre re-derived from the full `stageScale()`
 *     therefore lands `720·s·0.045·(1−k)` px to the RIGHT and slides into place
 *     over the 900 ms reveal. This samples the LIVE transform every frame and
 *     evaluates both formulas against the true viewport centre — the transform is
 *     what it always was, so the "old" column is exactly what the old build drew.
 *     A screenshot centroid corroborates it end to end.
 *
 *  2. THE «АРЕНДА» SEGMENTED CONTROL and the sticky heading columns, including
 *     the stacked layout below 1160 where an explicit `grid-column` would conjure
 *     implicit columns and a sticky column has nowhere to travel.
 *
 * Usage: `npx vite --port 5199 --strictPort` in one shell, `node scripts/seam-probe.mjs`
 * in another. OUT=dir to keep the screenshots.
 */
import { chromium } from 'playwright-core';

const OUT = process.env.OUT ?? null;
/** PORT= so this can run beside another checkout's dev server — a stale one on
 *  the default port silently probes the WRONG BUILD, which cost this round a pass */
const BASE = `http://localhost:${process.env.PORT ?? 5199}/`;
const STAGE_W = 1440;
const STAGE_H = 800;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/* ── 1. the seam's centre ─────────────────────────────────────────────────── */

/**
 * Both formulas, sampled off the same live rect:
 *   old = left + 720·stageScale()      ← re-derived from the RESTING scale
 *   new = left + 720·(width/1440)      ← the scale actually on screen
 * reported as a signed distance from the true centre, innerWidth/2.
 */
const SAMPLER = `
  (() => {
    const stage = document.querySelector('.stage');
    if (!stage) return Promise.resolve(null);
    const s = Math.min(innerWidth / ${STAGE_W}, innerHeight / ${STAGE_H});
    const out = { old: [], now: [], reveal: [] };
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = () => {
        const r = stage.getBoundingClientRect();
        if (r.width > 0) {
          out.old.push(r.left + (${STAGE_W} / 2) * s - innerWidth / 2);
          out.now.push(r.left + (${STAGE_W} / 2) * (r.width / ${STAGE_W}) - innerWidth / 2);
          out.reveal.push(Number(getComputedStyle(stage).opacity));
        }
        if (performance.now() - t0 < 1000) requestAnimationFrame(frame);
        else resolve(out);
      };
      requestAnimationFrame(frame);
    });
  })()
`;

/** luminance centroid of the brightest pixels, computed in-page off a screenshot */
async function centroid(page) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    // createImageBitmap off a blob, not `new Image().src = dataURL` — the latter
    // rejects with a bare Event that says nothing and cannot cross the bridge
    // atob → Blob, NOT `fetch('data:…')`: the dev page's connect-src refuses a
    // data URL and the failure arrives as a bare "Failed to fetch"
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    // downscale: the centroid does not need full resolution and this keeps the
    // whole pass under a frame
    const W = (c.width = 360);
    const H = (c.height = Math.round((img.height / img.width) * 360));
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const luma = new Float32Array(W * H);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < W * H; i++) {
      const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
      luma[i] = l;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
    // the field is a flat blue; only the light's core clears this
    const cut = lo + 0.85 * (hi - lo);
    let sx = 0;
    let sw = 0;
    for (let i = 0; i < W * H; i++) {
      if (luma[i] < cut) continue;
      const w = luma[i] - cut;
      sx += (i % W) * w;
      sw += w;
    }
    return sw > 0 ? { x: (sx / sw / W) * innerWidth, centre: innerWidth / 2, px: sw } : null;
  }, b64);
}

async function seamPass(route, size) {
  const page = await browser.newPage({ viewport: size });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  // Chrome's console message for a failed subresource names no URL, so the
  // RESPONSE is what gets recorded. `favicon.ico` is the browser's own request
  // and this prototype ships none.
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errs.push(`HTTP ${r.status()} ${r.url()}`);
  });
  // NOT 'load'. «Контакты» embeds the Yandex Maps iframe — a third-party request
  // that need never complete — so 'load' can hang for the full timeout. The app
  // being on screen is the real readiness signal.
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('.screen:not(.hidden) .page-scroll'), null,
                             { timeout: 15000 });
  await page.waitForTimeout(1200);

  // scroll the page's own scroller to the bottom; the seam fires on an INTERIOR
  // line, so this must be a real scroll, repeated (the zone is 3 viewports tall)
  const sampling = page.evaluate(SAMPLER).catch(() => null);
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const s = document.querySelector('.screen:not(.hidden) .page-scroll');
      if (!s) return true; // already swapped
      s.scrollTop = Math.min(s.scrollTop + s.clientHeight * 0.8, s.scrollHeight);
      return false;
    });
    if (done) break;
    await page.waitForTimeout(60);
  }

  const hash = await page.evaluate(() => location.hash);
  ok(hash === `#main-from-${route.replace(/^#/, '').split('/')[0]}` || hash.startsWith('#main-from-'),
     `${route} @ ${size.width}×${size.height}: seam fired → ${hash || '(none)'}`);

  const s = await sampling;
  if (s && s.now.length) {
    const peak = (a) => a.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
    const oldPeak = peak(s.old);
    const nowPeak = peak(s.now);
    console.log(
      `       old formula peaked at ${oldPeak.toFixed(1)}px off centre, ` +
        `new at ${nowPeak.toFixed(1)}px (${s.now.length} frames)`,
    );
    ok(Math.abs(nowPeak) <= 2, `${route}: light stays centred (|Δ| ${Math.abs(nowPeak).toFixed(2)}px ≤ 2)`);
    ok(Math.abs(oldPeak) > 8, `${route}: the old formula really was off (${Math.abs(oldPeak).toFixed(1)}px) — probe is live`);
  } else {
    ok(false, `${route}: no stage samples captured`);
  }

  const c = await centroid(page).catch((e) => {
    console.log(`       (centroid unavailable: ${String(e).split('\n')[0]})`);
    return null;
  });
  if (c) {
    // CORROBORATION, NOT THE TEST, and the bound is loose on purpose. The
    // screenshot lands at an arbitrary point in the 900ms reveal, where the light
    // is still faint and its bloom asymmetric, so the brightest-pixel centroid
    // wanders by ±25px between runs on identical code. Tightening it would buy a
    // flaky gate, not a better check — the per-frame transform sampling above is
    // exact and discriminating. This only has to rule out a gross displacement.
    const off = c.x - c.centre;
    console.log(`       rendered light centroid ${off.toFixed(1)}px from centre`);
    ok(Math.abs(off) < 60, `${route}: rendered light is not grossly displaced (${off.toFixed(1)}px)`);
  }
  if (OUT) await page.screenshot({ path: `${OUT}/seam-${route.replace(/[#/]/g, '')}-${size.width}.png` });
  ok(errs.length === 0, `${route}: no console errors${errs.length ? ' — ' + errs[0] : ''}`);
  await page.close();
}

console.log('\n── the seam centres the cross ───────────────────────────────');
for (const size of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  for (const route of ['#rent', '#contacts', '#news', '#news/1']) {
    await seamPass(route, size);
  }
}

/* ── 2. «Аренда» ──────────────────────────────────────────────────────────── */

async function rentPass(size) {
  const stacked = size.width < 1160;
  const page = await browser.newPage({ viewport: size });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errs.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(BASE + '#rent', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.rent-tab').length === 5, null,
                             { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  console.log(`\n── «Аренда» @ ${size.width}×${size.height}${stacked ? ' (stacked)' : ''} ──────────────`);

  const state = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.rent-tab')];
    const panels = [...document.querySelectorAll('.rent-space')];
    return {
      names: tabs.map((t) => t.textContent.trim()),
      on: tabs.map((t) => t.classList.contains('on')),
      selected: tabs.map((t) => t.getAttribute('aria-selected')),
      tabindex: tabs.map((t) => t.tabIndex),
      hidden: panels.map((p) => p.hasAttribute('hidden')),
    };
  });
  ok(state.names.length === 5, `five tabs — ${state.names.join(' · ')}`);
  ok(state.on[0] && state.on.filter(Boolean).length === 1, '«Западный крест» is the one active tab');
  ok(state.selected[0] === 'true' && state.selected.slice(1).every((v) => v === 'false'), 'aria-selected tracks it');
  ok(state.tabindex[0] === 0 && state.tabindex.slice(1).every((v) => v === -1), 'roving tabindex: one tab stop');
  ok(!state.hidden[0] && state.hidden.slice(1).every(Boolean), 'one panel visible, four hidden');

  // every panel: the photo must render at its native 3:2, not a crop
  for (let i = 0; i < 5; i++) {
    if (i > 0) await page.click(`#rent-tab-${i}`);
    await page.waitForTimeout(450);
    const p = await page.evaluate((n) => {
      const panel = document.querySelector(`#rent-panel-${n}`);
      const img = panel.querySelector('.rent-photo');
      const r = img.getBoundingClientRect();
      return {
        visible: !panel.hasAttribute('hidden'),
        others: [...document.querySelectorAll('.rent-space')].filter((q) => !q.hasAttribute('hidden')).length,
        box: r.width / r.height,
        natural: img.naturalWidth / img.naturalHeight,
        loaded: img.naturalWidth > 0,
        prose: panel.querySelector('.page-prose').textContent.slice(0, 28),
      };
    }, i);
    ok(p.visible && p.others === 1, `tab ${i}: exactly this panel is shown`);
    ok(p.loaded && Math.abs(p.box - 1.5) < 0.02, `tab ${i}: photo box is 3:2 (${p.box.toFixed(3)})`);
    ok(p.loaded && Math.abs(p.natural - p.box) < 0.02, `tab ${i}: box matches the source — nothing cropped`);
    if (OUT) await page.screenshot({ path: `${OUT}/rent-${size.width}-tab${i}.png`, fullPage: false });
  }

  // keyboard: arrows move selection
  await page.click('#rent-tab-0');
  await page.focus('#rent-tab-0');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const afterKey = await page.evaluate(() => ({
    on: document.querySelector('.rent-tab.on')?.id,
    focused: document.activeElement?.id,
  }));
  ok(afterKey.on === 'rent-tab-1' && afterKey.focused === 'rent-tab-1', 'ArrowDown moves selection and focus');
  await page.keyboard.press('Home');
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => document.querySelector('.rent-tab.on')?.id)) === 'rent-tab-0', 'Home returns to the first');

  // the sticky heading columns
  const heads = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-sticky-head]')].map((b) => {
      const col = b.querySelector('.sticky-head, .sec-col');
      return {
        heading: col?.querySelector('h2')?.textContent.trim() ?? '(none)',
        position: col ? getComputedStyle(col).position : '(no col)',
        pin: b.style.getPropertyValue('--sec-pin'),
        align: col ? getComputedStyle(col).textAlign : '',
      };
    });
  });
  ok(heads.length === 4, `four managed blocks — ${heads.map((h) => h.heading).join(' · ')}`);
  // DOES IT ACTUALLY PIN, rather than merely compute as `position: sticky`.
  //
  // MEASURED ON «Помещения», NOT on the first block. Sticky travel is capped by
  // the element's own grid area, so a SHORT block releases its heading almost at
  // once — «Общая информация» is 532px tall and can only hold its heading for
  // ~110px of a 400px scroll. That is the clamp working as designed, not a
  // failure, and measuring it would set the bar at noise. The spaces block is the
  // one with runway and the one a reader actually scrolls.
  //
  // Below 1160 the keyword test is meaningless in the other direction: every grid
  // item becomes its own row, so the column still computes as `sticky` while
  // having (almost) nowhere to travel. Only the travel is worth asserting.
  const travel = await page.evaluate(() => {
    const sc = document.querySelector('.rent-page .page-scroll');
    const block = document.querySelectorAll('.rent-page [data-sticky-head]')[1];
    const col = block.querySelector('.sticky-head');
    sc.scrollTop = block.offsetTop;
    const s0 = sc.scrollTop;
    const t0 = col.getBoundingClientRect().top;
    sc.scrollTop = block.offsetTop + 500;
    const out = { scrolled: sc.scrollTop - s0, moved: t0 - col.getBoundingClientRect().top };
    sc.scrollTop = 0;
    return out;
  });
  const held = travel.scrolled - travel.moved;
  if (stacked) {
    ok(heads.every((h) => h.position === 'static'), 'stacked: the heading columns stop sticking');
    ok(heads.every((h) => h.pin === ''), 'stacked: stickyHeads strips the stale --sec-pin');
    ok(travel.moved > travel.scrolled * 0.95,
       `stacked: the heading travels with its body (${travel.moved.toFixed(0)}/${travel.scrolled}px)`);
  } else {
    ok(held > travel.scrolled * 0.6,
       `«Помещения» holds the frame while its body scrolls (held ${held.toFixed(0)} of ${travel.scrolled}px)`);
    ok(heads.every((h) => h.position === 'sticky'), 'every heading column is sticky');
    ok(heads.every((h) => h.pin && h.pin !== '14vh'), `per-block pins — ${heads.map((h) => h.pin).join(' · ')}`);
    ok(new Set(heads.map((h) => h.align)).size === 1, `one alignment for all four (${heads[0].align})`);
  }

  // the grid stacks cleanly below 1160 — template AND placement
  const grid = await page.evaluate(() => {
    const g = document.querySelector('.rent-page .page-block.page-grid');
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length;
    const placed = [...g.children].filter((c) => getComputedStyle(c).gridColumnStart !== 'auto').length;
    return { cols, placed };
  });
  if (stacked) {
    ok(grid.cols === 1, `one column below 1160 (${grid.cols})`);
    ok(grid.placed === 0, 'no surviving grid-column — no implicit columns');
  } else {
    ok(grid.cols === 12, `twelve columns (${grid.cols})`);
  }

  // «Связаться» reaches the form
  const before = await page.evaluate(() => document.querySelector('.rent-page .page-scroll').scrollTop);
  await page.click('.rent-space:not([hidden]) .rent-cta');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const s = document.querySelector('.rent-page .page-scroll');
    const f = document.querySelector('.rent-page .contact-form').getBoundingClientRect();
    return { top: s.scrollTop, formTop: f.top, viewH: innerHeight };
  });
  ok(after.top > before, `«Связаться» scrolled (${before} → ${after.top})`);
  ok(Math.abs(after.formTop) < after.viewH * 0.5, `the form is in frame (top ${after.formTop.toFixed(0)}px)`);

  ok(errs.length === 0, `no console errors${errs.length ? ' — ' + errs[0] : ''}`);
  await page.close();
}

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1100, height: 800 }]) {
  await rentPass(size);
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
