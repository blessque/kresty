/**
 * THE EXACT LIGHT, MEASURED — `npm run probe:light` (round 33).
 *
 * Drives the REAL renderers (both backends) in a page at frozen states, reads
 * the canvas back and asserts what "the light is computed, not estimated" has to
 * mean, without trusting anybody's eyes:
 *
 *   V1  exact ≈ a dense un-jittered reference march with the TRUE kernel
 *   V2  exact ≈ the EXPECTED VALUE of today's march (128 jitter offsets averaged)
 *       — today's look, sector by sector, minus its noise
 *   V3  noise: high-pass luminance + chroma RMS inside the rays, dither on
 *   V5  WebGL2 ≈ WebGPU (the twins), exact path
 *   V6  seam: with the reveal at 0 every canvas pixel is exactly 0
 *   M   `?rays=march` is still today's estimator (it stays noisy — liveness)
 *
 * Own strict port, like light-bench: it must measure THIS checkout (a dev server
 * on 5199 once belonged to another one and served stale code for a whole pass).
 * Exits non-zero on any failed check.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 5396;
const external = process.env.PORT_RUNNING === '1';
const vite = external
  ? null
  : spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'inherit'],
    });
if (vite) {
  await new Promise((r) => {
    vite.stdout.on('data', (b) => String(b).includes('ready in') && r());
    setTimeout(r, 8000);
  });
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(54)} ${detail}`);
  if (!ok) failures++;
};

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && console.log('console', m.text()));
  await page.addInitScript(() => {
    globalThis.__krestyProbe = true;
  });
  // a route with no live light of its own, so nothing else competes for the GPU
  await page.goto(`http://127.0.0.1:${PORT}/#news`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const res = await page.evaluate(async () => {
    const { WebGL2RayFieldRenderer } = await import('/src/gpu/webgl2/WebGL2RayFieldRenderer.ts');
    const { WebGPURayFieldRenderer } = await import('/src/gpu/webgpu/WebGPURayFieldRenderer.ts');
    const { VARIANTS } = await import('/src/screens/main/variants.ts');
    const { rasterizeMask } = await import('/src/shared/rasterizeMask.ts');
    const { buildLightMask } = await import('/src/shared/lightMask.ts');
    const sign = (await import('/src/assets/sign.svg?raw')).default;
    const cv = await rasterizeMask(sign, { raw: true });
    const t0 = performance.now();
    const data = buildLightMask(cv, { dissolve: 1 });
    const bakeMs = performance.now() - t0;
    const P0 = VARIANTS.find((v) => v.id === 'siyanie').params;

    // the NATIVE condition: «Сияние»'s 500-ref-px emblem lands on exactly 640
    // canvas px — one mask texel per pixel, as on a 2× screen at stage scale 1
    const W = 1200;
    const H = 750;
    const SCALE = 1.28;
    const state = (params, extra = {}) => ({
      timeSec: 5,
      centerPx: [W / 2, H / 2],
      pointerPx: [W * 0.66, H * 0.36],
      scale: SCALE,
      signRot: 0.37,
      beamAngles: [0.3, 1.9, 3.4, 5.0],
      linkAngles: [0.3, 1.9, 3.4, 5.0],
      linkDist: [300, 300, 300, 300],
      linkHalfAng: [0.1, 0.1, 0.1, 0.1],
      beamHover: [0, 0, 0, 0],
      hoverDir: [0, 0],
      hoverAmt: 0,
      bgMix: 0,
      sceneDim: 0,
      modeMix: 0,
      slitMix: 1,
      layers: 3,
      octaves: 4,
      raySteps: 28,
      params,
      ...extra,
    });

    async function readback(r, canvas) {
      if (r.backend === 'webgl2') {
        const gl = canvas.getContext('webgl2');
        const buf = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const out = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) out.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        return out;
      }
      const dev = r.device;
      const tex = r.ctx.getCurrentTexture();
      const bpr = Math.ceil((W * 4) / 256) * 256;
      const gbuf = dev.createBuffer({ size: bpr * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = dev.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: tex }, { buffer: gbuf, bytesPerRow: bpr }, [W, H]);
      dev.queue.submit([enc.finish()]);
      await gbuf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(gbuf.getMappedRange());
      const bgra = tex.format.startsWith('bgra');
      const out = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * bpr + x * 4;
          const o = (y * W + x) * 4;
          out[o] = src[i + (bgra ? 2 : 0)];
          out[o + 1] = src[i + 1];
          out[o + 2] = src[i + (bgra ? 0 : 2)];
          out[o + 3] = src[i + 3];
        }
      }
      gbuf.unmap();
      gbuf.destroy();
      return out;
    }

    // ── metrics ───────────────────────────────────────────────────────────
    const lum = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    /** pixels of the ray annulus, away from the blown core and the frame edge */
    const annulus = [];
    for (let y = 8; y < H - 8; y++) {
      for (let x = 8; x < W - 8; x++) {
        const r = Math.hypot(x - W / 2, y - H / 2);
        if (r > H * 0.25 && r < H * 0.48) annulus.push(y * W + x);
      }
    }
    function highpass(a, f) {
      const plane = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) plane[i] = f(a, i * 4);
      const R = 4;
      const I = new Float64Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) {
        let s = 0;
        for (let x = 0; x < W; x++) {
          s += plane[y * W + x];
          I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s;
        }
      }
      let s2 = 0;
      for (const i of annulus) {
        const x = i % W;
        const y = (i / W) | 0;
        const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
        const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        const d = plane[i] - m;
        s2 += d * d;
      }
      return Math.sqrt(s2 / annulus.length);
    }
    /** RMS of what changes between two renders that differ ONLY in their random
     *  seed, /√2 — the noise itself; edges and structure cancel out */
    function noiseOf(a, b, f) {
      let s2 = 0;
      for (const i of annulus) {
        const d = f(a, i * 4) - f(b, i * 4);
        s2 += d * d;
      }
      return Math.sqrt(s2 / annulus.length / 2);
    }
    const noise = (a, b) => noiseOf(a, b, lum);
    const chroma = (a, b) => noiseOf(a, b, (c, i) => c[i] - c[i + 1]);
    /** max/mean |Δ| over the rows [y0, y1) only */
    function diffRows(a, b, y0, y1) {
      let mx = 0;
      let sum = 0;
      let n = 0;
      for (let i = y0 * W * 4; i < y1 * W * 4; i += 4) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a[i + c] - b[i + c]);
          if (d > mx) mx = d;
          sum += d;
          n++;
        }
      }
      return { max: mx, mean: sum / n };
    }
    function diff(a, b) {
      let mx = 0;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < W * H * 4; i += 4) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a[i + c] - b[i + c]);
          if (d > mx) mx = d;
          sum += d;
          n++;
        }
      }
      return { max: mx, mean: sum / n };
    }
    /** mean luminance per (angle × radius) sector — the look, not the noise */
    function sectors(a) {
      const out = [];
      for (const rf of [0.18, 0.3, 0.42, 0.6]) {
        for (let k = 0; k < 24; k++) {
          const th = (k / 24) * Math.PI * 2;
          let s = 0;
          let n = 0;
          // the radial window spans ≥ 2 periods of the old march's half-duty
          // sampling comb (period ≈ r/28): a narrower one measures the comb — the
          // old ladders — rather than the look
          const half = Math.max(6, Math.round((rf * H) / 14));
          for (let dr = -half; dr <= half; dr++) {
            for (let dt = -3; dt <= 3; dt++) {
              const r = rf * H + dr;
              const t = th + dt * 0.004;
              const x = Math.round(W / 2 + r * Math.cos(t));
              const y = Math.round(H / 2 + r * Math.sin(t));
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              s += lum(a, (y * W + x) * 4);
              n++;
            }
          }
          if (n) out.push(s / n);
        }
      }
      return out;
    }

    const results = { bakeMs };
    for (const [Cls, name] of [[WebGL2RayFieldRenderer, 'webgl2'], [WebGPURayFieldRenderer, 'webgpu']]) {
      if (name === 'webgpu' && !('gpu' in navigator && (await navigator.gpu.requestAdapter()))) continue;
      const canvas = document.createElement('canvas');
      const r = new Cls();
      await r.init(canvas);
      r.resize(W, H);
      r.setSignMask(cv, data);
      const shot = async (s, debug = {}) => {
        r.setDebug({ ditherAmp: 1, jitOffset: 0, frame: 7, ...debug });
        r.render(s);
        return readback(r, canvas);
      };
      const o = { exactAvailable: r.exactAvailable };
      const ex = await shot(state(P0, { rays: 'exact' }), { ditherAmp: 0 });
      o.active = r.raysActive;
      const exD7 = await shot(state(P0, { rays: 'exact' }), { frame: 7 });
      const exD8 = await shot(state(P0, { rays: 'exact' }), { frame: 8 });
      // the reference is 2048 samples a pixel: a strip through the centre is enough
      const strip = [0, Math.round(H / 2 - 60), W, 120];
      // ca 0: the reference marches one channel — the rainbow is a per-channel
      // radius in the exact path, exact by construction, measured by V2 instead
      const P1 = { ...P0, ca: 0 };
      const exS = await shot(state(P1, { rays: 'exact', scissorPx: strip }), { ditherAmp: 0 });
      const ref = await shot(state(P1, { rays: 'ref', scissorPx: strip }), { ditherAmp: 0 });
      const marA = await shot(state(P0, { rays: 'march' }), { jitOffset: 0 });
      const marB = await shot(state(P0, { rays: 'march' }), { jitOffset: 0.37 });
      // E[march]: 128 jitter offsets, averaged in float. At 64 the far sectors —
      // where the old march is noisiest — kept ~1 LSB of their own residual
      const NJ = 128;
      const acc = new Float32Array(W * H * 4);
      for (let k = 0; k < NJ; k++) {
        const m = await shot(state(P0, { rays: 'march' }), { ditherAmp: 0, jitOffset: (k + 0.5) / NJ });
        for (let i = 0; i < acc.length; i++) acc[i] += m[i];
      }
      const avg = new Uint8Array(acc.length);
      for (let i = 0; i < acc.length; i++) avg[i] = Math.round(acc[i] / NJ);
      // the seam: every emissive term at 0 → exact black, dither and all
      const dark = { ...P0, godrays: 0, bloom: 0, coreIntensity: 0, crossIntensity: 0, primaryIntensity: 0, secIntensity: 0, dustAmount: 0, moteAmount: 0, hazeBase: 0, grain: 0 };
      const seam = await shot(state(dark, { rays: 'exact' }));
      let seamMax = 0;
      for (let i = 0; i < seam.length; i += 4) seamMax = Math.max(seamMax, seam[i], seam[i + 1], seam[i + 2]);

      // diagnostics: rays alone and bloom alone, exact vs E[march] (16 offsets)
      const avgOf = async (params) => {
        const a = new Float32Array(W * H * 4);
        for (let k = 0; k < 16; k++) {
          const m = await shot(state(params, { rays: 'march' }), { ditherAmp: 0, jitOffset: (k + 0.5) / 16 });
          for (let i = 0; i < a.length; i++) a[i] += m[i] / 16;
        }
        return Uint8Array.from(a, (v) => Math.round(v));
      };
      const signedByRadius = (a, b) => {
        const x = sectors(a);
        const y = sectors(b);
        return [0, 1, 2, 3].map((rr) => x.slice(rr * 24, rr * 24 + 24).reduce((acc, v, i) => acc + (v - y[rr * 24 + i]) / 24, 0));
      };
      const raysOnly = { ...P0, bloom: 0, coreIntensity: 0 };
      const bloomOnly = { ...P0, godrays: 0, coreIntensity: 0 };
      o.diag = {
        rays: signedByRadius(await shot(state(raysOnly, { rays: 'exact' }), { ditherAmp: 0 }), await avgOf(raysOnly)),
        bloom: signedByRadius(await shot(state(bloomOnly, { rays: 'exact' }), { ditherAmp: 0 }), await avgOf(bloomOnly)),
      };
      const se = sectors(ex);
      const sa = sectors(avg);
      let secMax = 0;
      let secSum = 0;
      const byRadius = [0, 0, 0, 0].map(() => ({ max: 0, mean: 0, signed: 0 }));
      se.forEach((v, i) => {
        const d = Math.abs(v - sa[i]);
        secMax = Math.max(secMax, d);
        secSum += d;
        const b = byRadius[Math.floor(i / 24)];
        b.max = Math.max(b.max, d);
        b.mean += d / 24;
        b.signed += (v - sa[i]) / 24;
      });
      o.worst = se
        .map((v, i) => ({ i, rf: [0.18, 0.3, 0.42, 0.6][Math.floor(i / 24)], deg: (i % 24) * 15, exact: v, march: sa[i], d: v - sa[i] }))
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 4);
      Object.assign(o, {
        v1: diffRows(exS, ref, strip[1], strip[1] + strip[3]),
        v2: { max: secMax, mean: secSum / se.length, byRadius },
        v3: {
          exact: noise(exD7, exD8),
          exactChroma: chroma(exD7, exD8),
          march: noise(marA, marB),
          marchChroma: chroma(marA, marB),
        },
        seamMax,
        polarBuilds: r.polarBuilds,
        exImg: Array.from(ex.subarray(0, 4)),
      });
      o.raw = ex;
      results[name] = o;
      r.destroy();
    }
    if (results.webgl2 && results.webgpu) {
      const a = results.webgl2.raw;
      const b = results.webgpu.raw;
      let mx = 0;
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a[i + c] - b[i + c]);
          mx = Math.max(mx, d);
          sum += d;
        }
      }
      results.twins = { max: mx, mean: sum / ((a.length / 4) * 3) };
    }
    for (const k of ['webgl2', 'webgpu']) if (results[k]) delete results[k].raw;
    return results;
  });

  console.log(`\nexact light probe — «Сияние», 1200×750 at scale 1.28 (1 texel/px), frozen; mask bake ${res.bakeMs.toFixed(0)} ms\n`);
  for (const name of ['webgl2', 'webgpu']) {
    const o = res[name];
    if (!o) {
      console.log(`  (no ${name})`);
      continue;
    }
    console.log(`${name}: exact available ${o.exactAvailable}, drew with '${o.active}', polar builds ${o.polarBuilds}`);
    check(o.active === 'exact', `${name} draws the exact light`, o.active);
    check(o.v1.max <= 2 && o.v1.mean <= 0.3, `${name} V1 exact vs reference march (true kernel)`, `max ${o.v1.max} mean ${o.v1.mean.toFixed(3)} LSB`);
    check(o.v2.max <= 1.5, `${name} V2 exact vs E[today's march], sector means`, `max ${o.v2.max.toFixed(2)} mean ${o.v2.mean.toFixed(2)} LSB`);
    console.log(`        by radius (0.18/0.30/0.42/0.60 H): ` + o.v2.byRadius.map((b) => `max ${b.max.toFixed(1)} mean ${b.mean.toFixed(1)} signed ${b.signed >= 0 ? '+' : ''}${b.signed.toFixed(1)}`).join(' · '));
    console.log(`        worst sectors: ` + o.worst.map((w) => `r${w.rf} ${w.deg}° exact ${w.exact.toFixed(1)} march ${w.march.toFixed(1)}`).join(' · '));
    console.log(`        signed by radius — rays only: ${o.diag.rays.map((v) => v.toFixed(2)).join(' / ')} · bloom only: ${o.diag.bloom.map((v) => v.toFixed(2)).join(' / ')}`);
    check(o.v3.exact <= 0.6, `${name} V3 noise in the rays (dither on)`, `exact ${o.v3.exact.toFixed(2)} vs march ${o.v3.march.toFixed(2)} LSB RMS`);
    // 8-bit rounding of R and G under one shared dither value flickers R−G by
    // ±½ LSB: ~0.4 is the quantization floor, not colour noise
    check(o.v3.exactChroma <= 0.5, `${name} V3 colour noise (R−G, frame to frame)`, `exact ${o.v3.exactChroma.toFixed(2)} vs march ${o.v3.marchChroma.toFixed(2)} LSB RMS`);
    check(o.v3.march >= 0.9, `${name} M  the march is still the old estimator`, `march noise ${o.v3.march.toFixed(2)} (must stay noisy)`);
    check(o.seamMax === 0, `${name} V6 seam: reveal 0 is exact black`, `max ${o.seamMax}`);
  }
  if (res.twins) check(res.twins.max <= 2 && res.twins.mean <= 0.1, 'V5 WebGL2 vs WebGPU, exact', `max ${res.twins.max} mean ${res.twins.mean.toFixed(3)} LSB`);
} finally {
  await browser.close();
  vite?.kill();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
