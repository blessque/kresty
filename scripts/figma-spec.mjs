/**
 * FIGMA SPEC — the running build, measured, at exactly 1440.
 *
 * Six content routes are walked at 1440×900 and every box, computed style and
 * text line is written to JSON. That file is the contract the Figma frames are
 * built from and diffed back against (`scripts/figma-diff.mjs`).
 *
 * ── why this exists rather than reading the CSS ─────────────────────────────
 * This layout has already produced two confidently-wrong numbers from careful
 * reading. Round 23 rejected a twelve-column grid on correct arithmetic against
 * the wrong margin constant. And `pages.css` + `NewsScreen.ts` both state that
 * the air between the news photograph and its headline "is the skipped column
 * 6" — but `.col-media` is `2 / span 5`, i.e. columns 2–6, so the real gap is
 * one 24px gutter and `grid.css`'s own header table says so. Prose drifts from
 * the rendered box; only the box is evidence.
 *
 * ── the two traps this script is written around ─────────────────────────────
 * 1. A DEV SERVER ON THE DEFAULT PORT MAY BELONG TO ANOTHER CHECKOUT. Round 28
 *    lost a whole pass to one, silently serving stale code. So this spawns its
 *    own vite on 5299 with `--strictPort` (it fails rather than attaches) and
 *    then verifies the bytes it is being served are this worktree's.
 * 2. MEASURING BEFORE THE WEBFONT ARRIVES GIVES THE FALLBACK'S METRICS. The
 *    concept page measured its columns at 458px under the fallback against
 *    506px under Chromius for two rounds. Every read here waits on
 *    `document.fonts.ready` AND asserts Chromius actually loaded.
 *
 * Usage:  node scripts/figma-spec.mjs [--out DIR] [--port 5299] [--keep]
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('out', path.join(ROOT, '.figma-spec')));
const PORT = Number(arg('port', '5299'));
const KEEP = argv.includes('--keep');

/** The design frame. 1440×900 is the stage every number in the docs is quoted at. */
const VIEW = { width: 1440, height: 900 };

/**
 * route → hash + the screen element it drives. Taken from `router.ts`'s HASHES
 * and `main.ts`'s registry, which disagree in one place worth stating: `#contacts`
 * is the REAL page (`#screen-contacts-page`), while `#screen-contacts` is the
 * round-12 icon showcase now parked at `#icons`.
 */
const ROUTES = [
  { key: 'concept', hash: '#concept', el: 'screen-concept', title: 'О «Крестах»' },
  { key: 'news', hash: '#news', el: 'screen-news', title: 'События / Новости' },
  { key: 'article', hash: '#news/1', el: 'screen-article', title: 'Новость' },
  { key: 'rent', hash: '#rent', el: 'screen-rent', title: 'Аренда' },
  { key: 'contacts', hash: '#contacts', el: 'screen-contacts-page', title: 'Контакты' },
  { key: 'museum', hash: '#museum', el: 'screen-museum', title: 'Музей' },
];

/* ── the dev server ───────────────────────────────────────────────────────── */

async function startVite() {
  const proc = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));

  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/index.html`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (proc.exitCode !== null) {
      throw new Error(
        `vite exited before serving — port ${PORT} is probably taken by another ` +
          `checkout, which is exactly what --strictPort is here to catch.\n${log}`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // IT IS NOT ENOUGH THAT SOMETHING ANSWERS ON THE PORT. Prove the bytes are ours.
  const served = await (await fetch(`${base}/src/styles/tokens.gen.css`)).text();
  const local = await readFile(path.join(ROOT, 'src/styles/tokens.gen.css'), 'utf8');
  const fingerprint = '--ref-blue: #56b7e6';
  if (!served.includes(fingerprint) || !local.includes(fingerprint)) {
    throw new Error(`the server on ${PORT} is not serving this worktree's tokens.gen.css`);
  }
  return { proc, base };
}

/* ── the walker, injected into the page ───────────────────────────────────── */

/**
 * Serialised in the browser. Emits one node per element under the scroller,
 * with its box expressed in SCROLLER CONTENT coordinates so a Figma frame can
 * use the numbers directly.
 *
 * Sticky elements are captured at `scrollTop = 0`, i.e. at their FLOW position —
 * which is the "rest" state the tall frames are drawn in. Pinned states are
 * captured separately as screenshots.
 */
function walkerSource() {
  const SKIP_CHILDREN = new Set(['SVG', 'CANVAS', 'IFRAME', 'IMG', 'BR']);
  const GRID_ROLES = ['col-lead', 'col-aside', 'col-media', 'col-main', 'col-full'];

  function role(el) {
    for (const r of GRID_ROLES) if (el.classList.contains(r)) return r;
    return null;
  }

  function round(n) {
    return Math.round(n * 1000) / 1000;
  }

  /** the line boxes of a text-bearing element, via Range — see DESIGN_SYSTEM:
   *  `scrollWidth − clientWidth` cannot see overflow in centred text. */
  function lineBoxes(el, ox, oy) {
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(node);
      for (const rect of r.getClientRects()) {
        out.push({
          x: round(rect.left - ox),
          y: round(rect.top - oy),
          w: round(rect.width),
          h: round(rect.height),
        });
      }
    }
    return out;
  }

  function styleOf(el) {
    const s = getComputedStyle(el);
    const o = {
      font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      color: s.color,
      textAlign: s.textAlign,
      display: s.display,
      position: s.position,
    };
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') o.background = s.backgroundColor;
    if (s.backgroundImage !== 'none') o.backgroundImage = s.backgroundImage;
    const pad = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
    if (pad.some((p) => p !== '0px')) o.padding = pad.join(' ');
    const mar = [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft];
    if (mar.some((m) => m !== '0px')) o.margin = mar.join(' ');
    if (s.borderBottomWidth !== '0px') o.borderBottom = `${s.borderBottomWidth} ${s.borderBottomColor}`;
    if (s.opacity !== '1') o.opacity = s.opacity;
    if (s.aspectRatio !== 'auto') o.aspectRatio = s.aspectRatio;
    if (s.objectFit !== 'fill') o.objectFit = s.objectFit;
    if (s.gap && s.gap !== 'normal') o.gap = s.gap;
    if (s.position === 'sticky') o.stickyTop = s.top;
    if (s.overflow !== 'visible') o.overflow = s.overflow;
    if (s.mixBlendMode !== 'normal') o.mixBlendMode = s.mixBlendMode;
    return o;
  }

  function describe(el, ox, oy, depth) {
    const rect = el.getBoundingClientRect();
    const node = {
      tag: el.tagName.toLowerCase(),
      cls: el.className && typeof el.className === 'string' ? el.className : undefined,
      role: role(el) || undefined,
      x: round(rect.left - ox),
      y: round(rect.top - oy),
      w: round(rect.width),
      h: round(rect.height),
      style: styleOf(el),
    };

    if (el.tagName === 'IMG') {
      node.img = {
        src: el.getAttribute('src'),
        currentSrc: el.currentSrc,
        attrW: el.getAttribute('width'),
        attrH: el.getAttribute('height'),
        naturalW: el.naturalWidth,
        naturalH: el.naturalHeight,
        alt: el.alt,
      };
    }
    if (el.tagName === 'IFRAME') node.iframe = { src: el.getAttribute('src') };

    // THE TEXT IS CAPTURED WITH ITS NBSPs INTACT. `bindShortWords` binds short
    // Russian words with U+00A0 and that is what decides where the lines break;
    // normalising them away would make Figma wrap somewhere else.
    const direct = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
      .trim();
    if (direct) {
      node.text = direct;
      node.textEscaped = direct.replace(/ /g, '<NBSP>');
      node.lines = lineBoxes(el, ox, oy);
    }

    if (!SKIP_CHILDREN.has(el.tagName) && depth < 14) {
      const all = [...el.children];
      const kept = all.filter((c) => {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        return cs.display !== 'none' && (r.width > 0 || r.height > 0);
      });
      // A SILENT DROP IS THE FAILURE MODE THIS SPEC EXISTS TO PREVENT. Anything
      // skipped is counted, so "the frame is missing a photograph" is visible in
      // the data rather than only in the finished Figma frame.
      if (kept.length !== all.length) node.droppedChildren = all.length - kept.length;
      const kids = kept.map((c) => describe(c, ox, oy, depth + 1));
      if (kids.length) node.children = kids;
    }
    return node;
  }

  return { describe, round };
}

/* ── one route ────────────────────────────────────────────────────────────── */

async function measure(page, base, route) {
  await page.goto(`${base}/${route.hash}`, { waitUntil: 'load' });
  // the router builds lazily on `start()`; give it the frame it needs
  await page.waitForFunction(
    (id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden') && el.querySelector('.page-scroll, .concept-scroll');
    },
    route.el,
    { timeout: 20000 },
  );
  await page.evaluate(() => document.fonts.ready);
  // FONT ASSERTION, not a hope. A fallback face silently changes every box.
  const fontOk = await page.evaluate(() => document.fonts.check('120 24px "ALS Chromius"'));
  if (!fontOk) throw new Error(`ALS Chromius did not load on ${route.key} — every box would be wrong`);

  // EVERY IMAGE MUST BE DECODED BEFORE ANYTHING IS MEASURED, and scrolling to
  // the bottom is not enough to do it. `loading="lazy"` only fetches what comes
  // near the viewport, and one jump to the end skips everything in the middle.
  //
  // The cost is not a missing picture, it is a WRONG SPEC: a slider's inactive
  // slides are `width: auto; height: auto` capped by `--ms-h`, so before decode
  // they have no intrinsic size and measure 0×0 — the walker then drops them and
  // the surviving ones report `naturalWidth: 0`. The first pass lost four of
  // «О Крестах»'s slides that way and called nine renders 0-pixel files.
  await page.evaluate((id) => {
    const sc = document.getElementById(id).querySelector('.page-scroll, .concept-scroll');
    for (const img of sc.querySelectorAll('img')) img.loading = 'eager';
  }, route.el);
  await page.evaluate(async (id) => {
    const sc = document.getElementById(id).querySelector('.page-scroll, .concept-scroll');
    await Promise.all(
      [...sc.querySelectorAll('img')].map((i) => (i.decode ? i.decode().catch(() => {}) : null)),
    );
  }, route.el);
  // then the scroll pass anyway, so anything driven by scroll position (the
  // shell's re-measure, the slider's ResizeObserver) has run at least once
  await page.evaluate((id) => {
    const sc = document.getElementById(id).querySelector('.page-scroll, .concept-scroll');
    sc.scrollTop = sc.scrollHeight;
  }, route.el);
  await page.waitForTimeout(1200);
  await page.evaluate((id) => {
    const sc = document.getElementById(id).querySelector('.page-scroll, .concept-scroll');
    sc.scrollTop = 0;
  }, route.el);
  await page.waitForTimeout(600);

  return page.evaluate(
    ({ id, src }) => {
      const { describe, round } = new Function(`return (${src})()`)();
      const screen = document.getElementById(id);
      const sc = screen.querySelector('.page-scroll, .concept-scroll');
      const r = sc.getBoundingClientRect();
      const ox = r.left;
      const oy = r.top - sc.scrollTop;

      const blocks = [...sc.children]
        .filter((c) => getComputedStyle(c).display !== 'none')
        .map((c) => describe(c, ox, oy, 0));

      // the grid, resolved — so the spec carries the arithmetic, not just boxes
      const cs = getComputedStyle(document.documentElement);
      const px = (name) => cs.getPropertyValue(name).trim();
      const probe = document.createElement('div');
      probe.className = 'page-grid';
      probe.style.visibility = 'hidden';
      sc.appendChild(probe);
      const gridW = probe.getBoundingClientRect().width;
      const cols = getComputedStyle(probe).gridTemplateColumns.split(' ').map(parseFloat);
      probe.remove();

      const handoff = sc.querySelector('.main-handoff');

      return {
        viewport: { w: sc.clientWidth, h: sc.clientHeight },
        contentHeight: sc.scrollHeight,
        scrollerClass: sc.className,
        grid: {
          width: round(gridW),
          margin: px('--page-margin'),
          gutter: px('--grid-gutter'),
          col: px('--grid-col'),
          columns: cols.map(round),
          spacing: {
            tight: px('--sp-tight'),
            text: px('--sp-text'),
            block: px('--sp-block'),
            page: px('--sp-page'),
          },
        },
        vars: {
          secPadTop: px('--sec-pad-top'),
          secBodyLead: px('--sec-body-lead'),
          secIconSize: px('--sec-icon-size'),
          handoffVh: px('--handoff-vh'),
        },
        handoff: handoff
          ? { y: round(handoff.getBoundingClientRect().top - oy), h: round(handoff.getBoundingClientRect().height) }
          : null,
        blocks,
      };
    },
    { id: route.el, src: walkerSource.toString() },
  );
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const { proc, base } = await startVite();
await mkdir(OUT, { recursive: true });
await mkdir(path.join(OUT, 'shots'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: VIEW,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const problems = [];
page.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message));

const index = {};
for (const route of ROUTES) {
  process.stdout.write(`· ${route.key} … `);
  try {
    const spec = await measure(page, base, route);
    spec.route = route;
    await writeFile(path.join(OUT, `${route.key}.json`), JSON.stringify(spec, null, 2));
    index[route.key] = {
      title: route.title,
      contentHeight: spec.contentHeight,
      handoff: spec.handoff,
      blocks: spec.blocks.length,
      gridWidth: spec.grid.width,
    };
    console.log(`${spec.contentHeight}px tall, ${spec.blocks.length} blocks`);
  } catch (e) {
    problems.push(`${route.key}: ${e.message}`);
    console.log(`FAILED — ${e.message}`);
  }
}

await writeFile(path.join(OUT, 'index.json'), JSON.stringify({ index, problems }, null, 2));
await browser.close();
if (!KEEP) proc.kill();

console.log(`\nspec → ${OUT}`);
if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of problems) console.log('  ' + p);
  process.exitCode = 1;
}
