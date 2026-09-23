/**
 * FIGMA SHOTS — the surfaces Figma cannot draw.
 *
 * Four things on this site are WebGL or a third-party embed and have no vector
 * form: «О Крестах»'s Three.js map, the ray-field light that lights its section
 * icons, «Музей»'s shader cross, and the Yandex map widget. They go into the
 * frames as flagged image layers.
 *
 * ── the light is captured ALONE, on black, and that is not a shortcut ───────
 * Both light canvases composite with `mix-blend-mode: screen`, i.e.
 * `1 − (1−a)(1−b)`. Black is the identity for that operation, so a PNG of the
 * canvas by itself, placed in Figma with blend mode SCREEN over the same field,
 * reproduces the real composite exactly rather than approximating it. Capturing
 * the whole viewport instead bakes one background into the picture and the layer
 * could never be moved onto another field.
 *
 * ── one PAGE per route, not one navigation per route ───────────────────────
 * «Музей» and «О Крестах» run a rAF loop against a WebGL context, and under the
 * software rasteriser that keeps the renderer busy enough that `page.goto` never
 * settles — even `about:blank` timed out. Tearing the page down and opening a
 * fresh one is reliable and costs a second.
 *
 * Usage: node scripts/figma-shots.mjs [--out DIR] [--port 5299]
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = path.resolve(arg('out', path.join(ROOT, '.figma-spec/shots')));
const PORT = Number(arg('port', '5299'));

async function startVite() {
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(`${base}/index.html`)).ok) break; } catch { /* waiting */ }
    if (proc.exitCode !== null) throw new Error(`vite exited — port ${PORT} taken?\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  const served = await (await fetch(`${base}/src/styles/tokens.gen.css`)).text();
  const local = await readFile(path.join(ROOT, 'src/styles/tokens.gen.css'), 'utf8');
  if (!served.includes('--ref-blue: #56b7e6') || !local.includes('--ref-blue: #56b7e6')) {
    throw new Error(`the server on ${PORT} is not serving this worktree`);
  }
  return { proc, base };
}

const { proc, base } = await startVite();
await mkdir(OUT, { recursive: true });

// WebGL in headless needs the software rasteriser spelled out, or both ray-field
// canvases come back empty and the "light" in these frames is a blank plate.
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl'],
});
const logs = [];
const shots = [];
let page = null;

async function open(hash, screenId) {
  if (page) { await page.close().catch(() => {}); page = null; }
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await page.goto(`${base}/${hash}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); },
    screenId, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
}

/** hide everything but the light and paint the field black — see the header */
async function isolate(on) {
  await page.evaluate((flag) => {
    document.getElementById('__isolate-light')?.remove();
    if (!flag) return;
    const s = document.createElement('style');
    s.id = '__isolate-light';
    s.textContent =
      `.page-scroll, .concept-scroll, .page-home, #grain, .museum-cross { visibility: hidden !important }
       .page-bg { background: #000 !important }`;
    document.head.appendChild(s);
  }, on);
  await page.waitForTimeout(600);
}

/** clip rather than element-screenshot: the light sits at opacity 0 until warm,
 *  and Playwright's element path refuses an "invisible" node */
async function shot(selector, name) {
  const el = page.locator(selector).first();
  if (!(await el.count())) { logs.push(`MISSING ${selector} → ${name}`); return; }
  const i = await el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             opacity: getComputedStyle(n).opacity, blend: getComputedStyle(n).mixBlendMode };
  });
  if (i.w < 1 || i.h < 1) { logs.push(`ZERO BOX ${selector} → ${name}`); return; }
  try {
    await page.screenshot({
      path: path.join(OUT, `${name}.png`), timeout: 90000, animations: 'disabled',
      clip: { x: Math.max(0, i.x), y: Math.max(0, i.y),
              width: Math.min(i.w, 1440 - Math.max(0, i.x)),
              height: Math.min(i.h, 900 - Math.max(0, i.y)) },
    });
    shots.push({ name, opacity: i.opacity, blend: i.blend,
                 box: { w: Math.round(i.w * 1000) / 1000, h: Math.round(i.h * 1000) / 1000 } });
  } catch (e) { logs.push(`FAILED ${name}: ${e.message.split('\n')[0]}`); }
}

async function waitLit(selector, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const op = await page.locator(selector).first()
      .evaluate((n) => Number(getComputedStyle(n).opacity)).catch(() => 0);
    if (op > 0.05) return op;
    await page.waitForTimeout(250);
  }
  return 0;
}
async function scrollTo(screenId, top) {
  await page.evaluate(([id, t]) => {
    const sc = document.getElementById(id).querySelector('.page-scroll, .concept-scroll');
    sc.scrollTop = t;
  }, [screenId, top]);
  await page.waitForTimeout(1100);
}

const only = arg('only', '');
const want = (k) => !only || only.split(',').includes(k);

// ── «Контакты»: the Yandex widget ────────────────────────────────────────
if (want('contacts')) {
  await open('#contacts', 'screen-contacts-page');
  await page.waitForTimeout(3000);
  await shot('.contacts-map', 'contacts-map');
}

// ── «Музей»: the shader cross, alone on black, at three angles ───────────
if (want('museum')) {
  await open('#museum', 'screen-museum');
  for (const [label, top] of [['a-dark', 1400], ['b-navy', 4200], ['c-slate', 7600]]) {
    await scrollTo('screen-museum', top);
    logs.push(`museum-light-${label}: opacity ${await waitLit('canvas.museum-light')}`);
    await isolate(true);
    await shot('canvas.museum-light', `museum-light-${label}`);
    await isolate(false);
  }
}

// ── «О Крестах»: the map stage, then the lit icon at each station ────────
if (want('concept')) {
  await open('#concept', 'screen-concept');
  await page.waitForTimeout(3000);
  await shot('.map-stage', 'concept-map');
  // the ray-field canvas is a DIRECT child of the screen; the map's canvas lives
  // inside `.map-stage`, so this picks the light and not the map
  const LIGHT = '#screen-concept > canvas';
  // THE FORM IS A SIXTH STATION (round 24 put its icon back and lit it), so it
  // belongs in this set — leaving it out puts an unlit icon box on a dark field.
  const tops = await page.evaluate(() => {
    const sc = document.querySelector('#screen-concept .concept-scroll');
    return [...sc.querySelectorAll('.sec, .contact-form')].map((s) => s.offsetTop);
  });
  logs.push(`concept station tops: ${tops.join(', ')}`);
  for (let i = 0; i < tops.length; i++) {
    await scrollTo('screen-concept', tops[i] + 450);
    logs.push(`concept-light-${i + 1}: opacity ${await waitLit(LIGHT)}`);
    await isolate(true);
    await shot(LIGHT, `concept-light-${i + 1}`);
    await isolate(false);
  }
}


// ── STATE CAPTURES ──────────────────────────────────────────────────────────
// The tall frames draw every page at REST. These are the behaviours a static
// frame cannot hold: a column pinned to the viewport centre while its body
// scrolls, the light handing over to the vector where the field turns white,
// and the seam at its fire line. Captured from the build rather than
// re-composed, and labelled as captures in Figma.
if (want('states')) {
  const STATES = [
    ['#concept', 'screen-concept', 3583, 'state-concept-pinned'],
    ['#concept', 'screen-concept', 4900, 'state-concept-crossfade'],
    ['#museum', 'screen-museum', 4200, 'state-museum-era-pinned'],
    ['#museum', 'screen-museum', 7250, 'state-museum-white-handover'],
    ['#contacts', 'screen-contacts-page', 700, 'state-contacts-sticky'],
    ['#museum', 'screen-museum', 10100, 'state-seam-fire-line'],
  ];
  let cur = null;
  for (const [hash, screenId, top, name] of STATES) {
    if (cur !== hash) { await open(hash, screenId); cur = hash; await page.waitForTimeout(2500); }
    await scrollTo(screenId, top);
    await page.waitForTimeout(1200);
    try {
      await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 90000,
                              animations: 'disabled', clip: { x: 0, y: 0, width: 1440, height: 900 } });
      shots.push({ name, scrollTop: top });
    } catch (e) { logs.push(`FAILED ${name}: ${e.message.split('\n')[0]}`); }
  }
}

if (page) await page.close().catch(() => {});
await browser.close();
proc.kill();
console.log(JSON.stringify({ out: OUT, shots, logs }, null, 2));
