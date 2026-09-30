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
 *  2. «АРЕНДА» — since round 32.2 the designer's five tabs, each a panel of
 *     cards in one column — and its heading columns, including the stacked layout below 1160
 *     where an explicit `grid-column` would conjure implicit columns. Round 29
 *     took the pinning off every heading, so that it stays off is asserted too.
 *
 *  3. THE MAP DRAWER against the designer's frame `1268:340`.
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

  // Jump to FOUR viewports above the bottom first — above the 3-viewport zone,
  // so the crossing below is still a real scroll. ROUND 32.1 made «Аренда» ~2×
  // taller, and walking all of it at 0.8 viewport a step reached the seam AFTER
  // the sampler's 1s window had closed: it recorded the resting stage and read
  // 0.0px for both formulas, which looks exactly like a dead probe.
  await page.evaluate(() => {
    const s = document.querySelector('.screen:not(.hidden) .page-scroll');
    s.scrollTop = Math.max(0, s.scrollHeight - s.clientHeight * 5);
  });
  await page.waitForTimeout(300);

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

/** until the page's scroller has held still for 300ms */
async function settle(page) {
  await page.waitForFunction(
    () =>
      new Promise((res) => {
        const s = document.querySelector('.screen:not(.hidden) .page-scroll');
        let last = s.scrollTop;
        let still = 0;
        const tick = () => {
          still = s.scrollTop === last ? still + 1 : 0;
          last = s.scrollTop;
          if (still >= 18) res(true);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    null,
    { timeout: 8000 },
  );
}

async function rentPass(size) {
  const stacked = size.width < 1160;
  const page = await browser.newPage({ viewport: size });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errs.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(BASE + '#rent', { waitUntil: 'domcontentloaded' });
  // ROUND 32.2: the designer's page — five tabs, a panel of cards per tab, one
  // shown. A mixed building is a card in each tab it serves: 15 offers, 20 cards
  await page.waitForFunction(() => document.querySelectorAll('.rent-card').length > 0, null,
                             { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  console.log(`\n── «Аренда» @ ${size.width}×${size.height}${stacked ? ' (stacked)' : ''} ──────────────`);

  const state = await page.evaluate(() => {
    const root = document.querySelector('.rent-page');
    const tabs = [...root.querySelectorAll('.rent-tab')];
    const panels = [...root.querySelectorAll('.rent-panel')];
    return {
      ids: tabs.map((t) => t.id.replace('rent-tab-', '')),
      selected: tabs.map((t) => t.getAttribute('aria-selected')),
      tabindex: tabs.map((t) => t.tabIndex),
      counts: panels.map((p) => p.querySelectorAll('.rent-card').length),
      hidden: panels.map((p) => p.hasAttribute('hidden')),
      slugs: new Set([...root.querySelectorAll('.rent-card')].map((c) => c.dataset.slug)).size,
      // the litera is the heritage survey's index and says nothing to a tenant
      litera: /Литер|\bЛит\b/.test(root.textContent),
      // round 32.2 took the aerial and the steps off
      gone: root.querySelectorAll('.rent-terr, .rent-pin, .rent-steps, .rent-cat').length,
    };
  });
  ok(state.ids.join() === 'food,office,retail,wellness,events', `five tabs — ${state.ids.join(' ')}`);
  ok(state.counts.join() === '6,9,1,1,3' && state.slugs === 15, `cards per tab ${state.counts.join('/')}, 15 offers`);
  ok(state.selected[0] === 'true' && state.selected.slice(1).every((v) => v === 'false'), 'the first tab is selected, aria tracks it');
  ok(state.tabindex[0] === 0 && state.tabindex.slice(1).every((v) => v === -1), 'roving tabindex: one tab stop');
  ok(!state.hidden[0] && state.hidden.slice(1).every(Boolean), 'one panel shown, four hidden');
  ok(!state.litera, 'no litera anywhere on the page');
  ok(state.gone === 0, 'no aerial, no steps, no category rows');

  // every tab: its cards are one column, every photo a reserved 3:2 box (the
  // round-26 trap), and no card or fact overflows — Russian min-content
  for (const id of state.ids) {
    await page.click(`#rent-tab-${id}`);
    await page.waitForTimeout(250);
    const p = await page.evaluate((id) => {
      const panel = document.querySelector(`#rent-panel-${id}`);
      const cards = [...panel.querySelectorAll('.rent-card')];
      const col = panel.getBoundingClientRect();
      return {
        shown: !panel.hidden && document.querySelectorAll('.rent-panel:not([hidden])').length === 1,
        lefts: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size,
        boxes: cards.map((c) => { const r = c.querySelector('.rent-photo').getBoundingClientRect(); return r.height ? r.width / r.height : 0; }),
        over: [...panel.querySelectorAll('.rent-card, .rent-card__size, .rent-card__fact dd')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > col.right + 1).length,
      };
    }, id);
    ok(p.shown && p.lefts === 1, `${id}: its panel alone, cards in one column`);
    ok(p.boxes.every((b) => Math.abs(b - 1.5) < 0.02), `${id}: every photo a reserved 3:2 box (${p.boxes.length})`);
    ok(p.over === 0, `${id}: nothing overflows the column`);
  }

  // keyboard: arrows move selection and focus, Home returns
  await page.click('#rent-tab-food');
  await page.focus('#rent-tab-food');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const afterKey = await page.evaluate(() => ({ on: document.querySelector('.rent-tab.on')?.id, focused: document.activeElement?.id }));
  ok(afterKey.on === 'rent-tab-office' && afterKey.focused === 'rent-tab-office', 'ArrowDown moves selection and focus');
  await page.keyboard.press('End');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelector('.rent-tab.on')?.id)) === 'rent-tab-events', 'End goes to the last tab');

  // THE HEADING COLUMNS, WHICH NO LONGER PIN (round 29).
  //
  // Round 28 asserted the opposite here: four `[data-sticky-head]` blocks, every
  // column computing as `sticky`, a measured per-block `--sec-pin`, and
  // «Помещения» holding the frame for 60 % of a 500px scroll. The client took the
  // pinning off every heading on the site, so what this now guards is that it
  // STAYS off — and that the four headings still agree with each other, which was
  // round 28's actual complaint (three headings of one rank behaving three ways).
  //
  // Kept rather than deleted, because the rule it protects is invisible when it
  // breaks: `concept.css` is imported globally and its `.sec-col { position:
  // sticky }` reaches any content page that grows one.
  const heads = await page.evaluate(() => {
    return [...document.querySelectorAll('.rent-page .page-block, .rent-page .contact-form')]
      .map((b) => b.querySelector('.col-aside'))
      .filter(Boolean)
      .map((col) => ({
        heading: col.querySelector('h2')?.textContent.trim() ?? '(none)',
        position: getComputedStyle(col).position,
        align: getComputedStyle(col).textAlign,
      }));
  });
  ok(heads.length === 4, `four heading columns — ${heads.map((h) => h.heading).join(' · ')}`);
  ok(heads.every((h) => h.position === 'static'), 'no heading column pins');
  ok(
    heads.every((h) => h.align === 'start' || h.align === 'left'),
    `every heading is left-aligned (${[...new Set(heads.map((h) => h.align))].join(', ')})`,
  );
  // and the column TRAVELS with its body rather than holding the frame — the
  // direct measurement, because `position: static` is the mechanism and this is
  // the behaviour. Measured on the tab block, the tallest on the page.
  const travel = await page.evaluate(() => {
    const sc = document.querySelector('.rent-page .page-scroll');
    const block = document.querySelector('.rent-dir');
    const col = block.querySelector('.col-aside');
    sc.scrollTop = block.offsetTop;
    const s0 = sc.scrollTop;
    const t0 = col.getBoundingClientRect().top;
    sc.scrollTop = block.offsetTop + 500;
    const out = { scrolled: sc.scrollTop - s0, moved: t0 - col.getBoundingClientRect().top };
    sc.scrollTop = 0;
    return out;
  });
  ok(
    travel.moved > travel.scrolled * 0.95,
    `the heading travels with its body, pinned nowhere (${travel.moved.toFixed(0)}/${travel.scrolled}px)`,
  );

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

  // «Обсудить помещение» reaches the form, which already names the space
  const before = await page.evaluate(() => document.querySelector('.rent-page .page-scroll').scrollTop);
  await page.click('#rent-tab-office');
  await page.waitForTimeout(200);
  await page.click('#rent-panel-office .rent-card[data-slug="b"] .rent-card__cta');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const s = document.querySelector('.rent-page .page-scroll');
    const f = document.querySelector('.rent-page .contact-form').getBoundingClientRect();
    return {
      top: s.scrollTop,
      formTop: f.top,
      viewH: innerHeight,
      msg: document.querySelector('.rent-page textarea').value,
    };
  });
  ok(after.top !== before, `«Обсудить помещение» scrolled (${before} → ${after.top})`);
  ok(Math.abs(after.formTop) < after.viewH * 0.5, `the form is in frame (top ${after.formTop.toFixed(0)}px)`);
  ok(
    after.msg.includes('Особняк на набережной') && !/литер/i.test(after.msg),
    `the message names the space, not its litera — «${after.msg.slice(0, 48)}…»`,
  );

  // a deep link lands on its card — the map drawer's «Аренда» uses it
  await page.goto(BASE + '#rent/m1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.rent-card--flash'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const deep = await page.evaluate(() => {
    const c = document.querySelector('.rent-card--flash');
    return { slug: c.dataset.slug, top: c.getBoundingClientRect().top, viewH: innerHeight, tab: document.querySelector('.rent-tab.on')?.id };
  });
  // М1's first role is the restaurant, so its address opens the food tab
  ok(deep.slug === 'm1' && deep.tab === 'rent-tab-food', `#rent/m1 opens «рестораны» and marks М1 (${deep.tab})`);
  // BOTH bounds: a card scrolled far ABOVE the frame is negative, and a
  // one-sided `top < viewH` passed at −2894px before the hash handler scrolled
  ok(deep.top > -deep.viewH * 0.5 && deep.top < deep.viewH, `…and lands on it (card top ${deep.top.toFixed(0)}px)`);

  // an address in ANOTHER tab switches to it — the SPA is the 5★ hotel's «Аренда»
  await page.goto(BASE + '#rent/e1-spa', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const spa = await page.evaluate(() => {
    const c = document.querySelector('#rent-panel-wellness .rent-card[data-slug="e1-spa"]');
    const r = c.getBoundingClientRect();
    return { tab: document.querySelector('.rent-tab.on')?.id, visible: r.height > 0 && r.bottom > 0 && r.top < innerHeight };
  });
  ok(spa.tab === 'rent-tab-wellness' && spa.visible, `#rent/e1-spa opens «СПА и фитнес» on its card (${spa.tab})`);

  ok(errs.length === 0, `no console errors${errs.length ? ' — ' + errs[0] : ''}`);
  await page.close();
}

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1100, height: 800 }]) {
  await rentPass(size);
}

/* ── 3. the map drawer (round 32.1) ──────────────────────────────────────── */

/**
 * The designer's frame `1268:340`, measured at 1440×900: the column at x = 72,
 * star 360 at (87, 130.5), name at y 522.5, button at (199, 713.5), close at
 * (1368, 32). `?pick=` opens a drawer headlessly. «Аренда» appears only where
 * something is free, and the drawer never quotes a lease.
 */
async function drawerPass(id, expect) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + `?pick=${id}#concept`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bld-drawer.open', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  const d = await page.evaluate(() => {
    const box = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    };
    return {
      star: box('.bld-star'),
      name: box('.bld-name'),
      rent: box('.bld-rent'),
      close: box('.bld-close'),
      slug: document.querySelector('.bld-rent')?.dataset.rent ?? null,
      text: document.querySelector('.bld-drawer').innerText,
    };
  });
  console.log(`\n── drawer ${id} ──────────────`);
  ok(d.slug === expect.slug, `«Аренда» → ${d.slug ?? 'none'} (want ${expect.slug ?? 'none'})`);
  ok(!/Свободно для аренды|м²|машино-мест|Лит\./.test(d.text), 'no lease figures or litera in the drawer');
  ok(d.close && d.close[0] === 1368 && d.close[1] === 32, `close in the corner (${d.close})`);
  if (expect.frame) {
    ok(d.star && d.star.join() === '87,130,360,360', `star 360 at the frame's (87, 130) — ${d.star}`);
    ok(d.name && d.name[1] === 522, `name at y 522 (${d.name?.[1]})`);
    ok(d.rent && d.rent[0] === 199 && d.rent[1] === 713, `button at (199, 713) — ${d.rent}`);
  }
  ok(errs.length === 0, `no console errors${errs.length ? ' — ' + errs[0] : ''}`);
  await page.close();
}

await drawerPass('b05', { slug: 'k', frame: true }); // the frame's own building
await drawerPass('b01', { slug: 'e1-spa' }); // a hotel: wordmark, residents, and the SPA to let
await drawerPass('b00', { slug: null }); // the church: nothing to let, no button

await browser.close();
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
