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
 * ROUND 33: the exact light's rows come first. `c still` = the polar passes are
 * skipped (their key is unchanged: «Музей» or an icon at rest); `c moving` = they
 * rebuild every frame (the main screen, whose cross turns). Its `steps` column is
 * N_ref, the decay it is matched to — it marches nothing. Its rows run the
 * SHIPPED look (the preset through `applyLook`); `bare` is the preset alone.
 * Measured on the M1 (2026-10-20): exact at NATIVE 2×, moving, costs 4.1–4.2 ms
 * with 33.2's look (= bare: no rainbow, no haze; 33.1's rainbow + haze added
 * 0.4–0.8), under the march's own M1 default rung (1.25×, 6.4–7.1 ms) — so the
 * canvas no longer has to shrink to afford it.
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
      const { buildLightMask } = await import('/src/shared/lightMask.ts');
      const { applyLook } = await import('/src/shared/lightLook.ts');
      const sign = (await import('/src/assets/sign.svg?raw')).default;
      const mask = await rasterizeMask(sign, { raw: true });
      // round 33: the exact light's data; rows with `rays: 'exact'` use it
      const data = buildLightMask(mask, { dissolve: 1 });
      const P = VARIANTS.find((v) => v.id === 'siyanie').params;
      // round 33.1: what ships is the preset THROUGH the look (rainbow + haze on)
      const SHIPPED = applyLook(P);
      const hasGPU = 'gpu' in navigator && !!(await navigator.gpu.requestAdapter());
      const out = [];
      for (const [Cls, name] of [
        [WebGL2RayFieldRenderer, 'webgl2'],
        ...(hasGPU ? [[WebGPURayFieldRenderer, 'webgpu']] : []),
      ]) {
        // round 33: the exact light at native (2), ¾ and 1 (≈ its detail cap on the
        // main screen at 1440) — then the old march's own ladder, as before
        const rows = [
          ...[2, 1.5, 1].flatMap((rs) => [
            { rs, raySteps: 28, field: false, rays: 'exact', moving: false, look: true },
            { rs, raySteps: 28, field: false, rays: 'exact', moving: true, look: true },
          ]),
          // the bare preset (rainbow and haze off) at native, for the look's own cost
          { rs: 2, raySteps: 28, field: false, rays: 'exact', moving: true, look: false },
          ...LADDER.flatMap((r, i) =>
            (i <= 1 ? [true, false] : [false]).map((field) => ({ rs: r.renderScale, raySteps: r.raySteps, field, rays: 'march', moving: false, rung: i })),
          ),
        ];
        for (const row of rows) {
          const { rs, raySteps, field, rays, moving, look } = row;
          const i = row.rung ?? '-';
          {
            const W = Math.round(VIEW[0] * rs), H = Math.round(VIEW[1] * rs);
            const c = document.createElement('canvas');
            const r = new Cls();
            await r.init(c);
            r.setSignMask(mask, data);
            r.resize(W, H);
            // `moving`: the cursor moves and the cross turns every frame, so the polar
            // passes rebuild — the main screen's case. Still = «Музей» or an icon at
            // rest: both held, since c = 0.5 − R·par/S moves with the rotation too
            const st = (t) => ({
              timeSec: t, centerPx: [W / 2, H / 2], pointerPx: [W * (0.6 + (moving ? t * 0.3 : 0)), H * 0.4], scale: rs, rays,
              signRot: moving ? t * 0.01 : 0, beamAngles: [0.3, 1.9, 3.4, 5.0], linkAngles: [0.3, 1.9, 3.4, 5.0],
              linkDist: [300, 300, 300, 300], linkHalfAng: [0.1, 0.1, 0.1, 0.1], beamHover: [0, 0, 0, 0],
              hoverDir: [0, 0], hoverAmt: 0, bgMix: 0, sceneDim: 0, modeMix: 0,
              slitMix: field ? 0.9985 : 1, layers: 3, octaves: 4, raySteps, params: look ? SHIPPED : P,
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
            out.push({ name, rung: i, rs, raySteps, field, rays, moving, look, mpx: (W * H) / 1e6, ms });
          }
        }
      }
      return out;
    },
    { FRAMES, VIEW },
  );
  console.log(`GPU time per frame, ${VIEW[0]}×${VIEW[1]} viewport, «Сияние», ${FRAMES} frames\n`);
  console.log('backend  rays    rung  scale  steps  MPx    field / c         ms/frame');
  for (const r of rows) {
    const what = r.rays === 'exact'
      ? `${r.moving ? 'c moving' : 'c still'}${r.look ? '' : ', bare'}`
      : r.field ? 'computed' : 'skipped';
    console.log(
      `${r.name.padEnd(8)} ${r.rays.padEnd(7)} ${String(r.rung).padEnd(5)} ${String(r.rs).padEnd(6)} ${String(r.raySteps).padEnd(6)} ` +
        `${r.mpx.toFixed(2).padEnd(6)} ${what.padEnd(17)} ${r.ms.toFixed(2)}`,
    );
  }
} finally {
  await browser.close();
  vite.kill();
}
