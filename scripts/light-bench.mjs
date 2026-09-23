/**
 * WHAT THE LIGHT COSTS THE GPU, per rung — `npm run bench:light` (round 31).
 *
 * Browser frame time is vsync-capped: at 60 Hz every rung under 16.7 ms reads
 * as "16.7 ms", which is how round 12.1's table ended up with three identical
 * rows. This times the SHADER instead: each of N renders of the real renderer
 * is followed by a forced sync (a 1-px `readPixels` on WebGL2,
 * `onSubmittedWorkDone` on WebGPU), and the mean is reported. Absolute numbers
 * are this machine's; the RATIOS between rows are what carry to other GPUs.
 *
 * SYNC EVERY FRAME, NOT ONCE AT THE END — the first version did the latter and
 * WebGL2 came back at 1.1 ms for 5 MPx, which is impossible at ~109 fetches a
 * pixel. Apple GPUs are tile-based with hidden-surface removal: forty opaque
 * full-screen draws in ONE render pass shade only the last. A readback ends the
 * pass, so every frame is really drawn. The sync's own round trip is included,
 * which slightly flatters the cheap rungs' ratio — it never hides a cost.
 *
 * `field` = `slitMix 0.9985`, just under the shader's skip threshold: the full
 * procedural field is computed and blended at 0.15% — the pre-round-31 cost.
 *
 * Own port and strict, like head-sweep: it must measure THIS checkout.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 5397;
const FRAMES = 40;
const VIEW = [1440, 900];

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => {
  vite.stdout.on('data', (b) => String(b).includes('ready in') && r());
  setTimeout(r, 8000);
});

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  // a route with no live light of its own, so nothing else competes for the GPU
  await page.goto(`http://127.0.0.1:${PORT}/#news`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const rows = await page.evaluate(
    async ({ FRAMES, VIEW }) => {
      const { WebGL2RayFieldRenderer } = await import('/src/gpu/webgl2/WebGL2RayFieldRenderer.ts');
      const { WebGPURayFieldRenderer } = await import('/src/gpu/webgpu/WebGPURayFieldRenderer.ts');
      const { VARIANTS } = await import('/src/screens/main/variants.ts');
      const { LADDER } = await import('/src/shared/frameGovernor.ts');
      const { rasterizeMask } = await import('/src/shared/rasterizeMask.ts');
      const sign = (await import('/src/assets/sign.svg?raw')).default;
      const mask = await rasterizeMask(sign, { raw: true });
      const P = VARIANTS.find((v) => v.id === 'siyanie').params;
      const hasGPU = 'gpu' in navigator && !!(await navigator.gpu.requestAdapter());
      const out = [];
      for (const [Cls, name] of [
        [WebGL2RayFieldRenderer, 'webgl2'],
        ...(hasGPU ? [[WebGPURayFieldRenderer, 'webgpu']] : []),
      ]) {
        for (let i = 0; i < LADDER.length; i++) {
          for (const field of i <= 1 ? [true, false] : [false]) {
            const { renderScale: rs, raySteps } = LADDER[i];
            const W = Math.round(VIEW[0] * rs), H = Math.round(VIEW[1] * rs);
            const c = document.createElement('canvas');
            const r = new Cls();
            await r.init(c);
            r.setSignMask(mask);
            r.resize(W, H);
            const st = (t) => ({
              timeSec: t, centerPx: [W / 2, H / 2], pointerPx: [W * 0.6, H * 0.4], scale: rs,
              signRot: t * 0.01, beamAngles: [0.3, 1.9, 3.4, 5.0], linkAngles: [0.3, 1.9, 3.4, 5.0],
              linkDist: [300, 300, 300, 300], linkHalfAng: [0.1, 0.1, 0.1, 0.1], beamHover: [0, 0, 0, 0],
              hoverDir: [0, 0], hoverAmt: 0, bgMix: 0, sceneDim: 0, modeMix: 0,
              slitMix: field ? 0.9985 : 1, layers: 3, octaves: 4, raySteps, params: P,
            });
            const sync = async () => {
              if (name === 'webgl2') {
                const gl = c.getContext('webgl2');
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
              } else {
                await r.device.queue.onSubmittedWorkDone();
              }
            };
            for (let k = 0; k < 5; k++) {
              r.render(st(k));
              await sync();
            }
            const t0 = performance.now();
            for (let k = 0; k < FRAMES; k++) {
              r.render(st(k * 0.016));
              await sync();
            }
            const ms = (performance.now() - t0) / FRAMES;
            r.destroy();
            out.push({ name, rung: i, rs, raySteps, field, mpx: (W * H) / 1e6, ms });
          }
        }
      }
      return out;
    },
    { FRAMES, VIEW },
  );
  console.log(`GPU time per frame, ${VIEW[0]}×${VIEW[1]} viewport, «Сияние», ${FRAMES} frames\n`);
  console.log('backend  rung  scale  steps  MPx    field      ms/frame');
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(8)} ${String(r.rung).padEnd(5)} ${String(r.rs).padEnd(6)} ${String(r.raySteps).padEnd(6)} ` +
        `${r.mpx.toFixed(2).padEnd(6)} ${(r.field ? 'computed' : 'skipped').padEnd(10)} ${r.ms.toFixed(2)}`,
    );
  }
} finally {
  await browser.close();
  vite.kill();
}
