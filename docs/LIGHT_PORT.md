# Porting the light 1:1

For the developers of the production site. This is how to get the light through the cross —
main screen, «Музей», «О Крестах» icons — to render **exactly** as in this prototype: the same
pixels for the same moment, on every device.

**The rule that makes it 1:1: copy the engine verbatim and feed it the same state.** Every file
in §1 is copied byte for byte, in the same relative layout (imports are relative), and never
edited. If something has to change, it changes here first and is copied again. Everything that
can differ between two sites lives in §2, and §2 says exactly how we do it.

What the light is, and why it is built this way: `docs/architecture/RAY_FIELD.md` («The exact
light»). Why each decision was made: `docs/effects/TUNING_LOG.md`, round 33.

## 1. Copy verbatim — do not edit a line

Record the commit you copied from (`git rev-parse HEAD` in this repo) next to the copy.

**The engine — `src/gpu/`, the whole folder (17 files).** Two renderers with identical output:
WebGPU first, WebGL2 when WebGPU is missing or fails.

| file | what it is |
|---|---|
| `rayFieldTypes.ts` | the contract: `RayFieldParams`, `RayFieldState`, the renderer interface |
| `capabilities.ts` | picks the backend |
| `exactLight.ts` | the CPU half of the exact light (light centre, kernel fit, LODs, detail cap) |
| `hazeNoise.ts` | the living haze's noise texture |
| `webgl2/WebGL2RayFieldRenderer.ts`, `glProgram.ts`, `glTextures.ts`, `polarPasses.ts` | the WebGL2 renderer |
| `webgl2/rayField.vert.glsl`, `rayField.frag.glsl`, `rayPolar.frag.glsl` | its shaders |
| `webgpu/WebGPURayFieldRenderer.ts`, `gpuTextures.ts`, `polarPasses.ts` | the WebGPU renderer |
| `webgpu/rayField.wgsl`, `rayPolar.wgsl` | its shaders |

**The mask, the resolution policy and the look:**

| file | what it is |
|---|---|
| `src/shared/rasterizeMask.ts` | draws the emblem SVG into the three-channel light mask |
| `src/shared/lightMask.ts` | the mask's mips and the baked bloom (`buildLightMask`) |
| `src/shared/frameGovernor.ts` | measures frame time, picks the quality rung |
| `src/shared/performanceTier.ts` | the device tier (`layers`, `octaves`, `low`) |
| `src/page/lightScale.ts` | the canvas resolution, from the light's own detail |
| `src/shared/lightLook.ts` | **the shipped look** (`LOOK_DEFAULTS`) and `applyLook` |
| `src/shared/filmGrain.ts` | the film grain (`GRAIN_DEFAULTS`) |
| `src/shared/pointer.ts` | `SmoothPointer`, the cursor's inertia (main screen) |
| `src/shared/assetUrl.ts` | `asset()` — the icon light loads its SVGs through it |
| `src/screens/main/variants.ts` | the «Сияние» preset every light starts from |
| `src/screens/concept/motionParams.ts` | the «О Крестах» icons' overrides (`MOTION`) |
| `src/assets/sign.svg` | the emblem the cross is cut from |
| `public/resources/{Bed,SPA,Restaurant,Window,Office}-640.svg` | the «О Крестах» icons — the `icon:` of each section in `src/screens/concept/pageSections.ts` |

**Optional — the designer's panel (`?lab`):** `src/screens/lab/lightLab.ts`, `lightLab.css`,
`src/shared/controlPanel.ts`, `src/styles/controlPanel.css`, and the `?lab` block in
`src/main.ts` (a dynamic import, so a normal visit never downloads the panel). Worth keeping:
it is how the look gets tuned on the live site, without a developer.

**Build requirements.** No runtime dependencies. The renderers import their shaders as text
(`import src from './rayField.frag.glsl?raw'`): Vite does that natively; with webpack use
`type: 'asset/source'` for `.glsl`/`.wgsl`/`.svg`. TypeScript strict; `@webgpu/types` for the
WebGPU typings (dev only).

## 2. Wire it — the same state, every frame

Three reference consumers show the whole wiring. Reproduce them; do not re-derive them.

| page | reference | notes |
|---|---|---|
| «Музей» | `src/screens/museum/museumLight.ts` | self-contained, one canvas — copy it nearly as is |
| «О Крестах» icons | `src/screens/concept/pageLight.ts` (+ `conceptPage.ts`) | a 2-viewport canvas + `scissorPx`, so the light never lags the scroll |
| main | `src/screens/main/MainScreen.ts` | `initRenderer()`, `layout()`, `update()`, `stageCentre()`, `setReveal()` |

**Boot (once per canvas)** — exactly `MainScreen.initRenderer()`:
1. `selectBackend()`; try `WebGPURayFieldRenderer`, on any error fall back to
   `WebGL2RayFieldRenderer`; `await renderer.init(canvas)`.
2. `governor.seed(renderer.gpuName, tier.low, renderer.exactAvailable)`.
3. `const cv = await rasterizeMask(signSvg, { raw: true })`, then
   `renderer.setSignMask(cv, buildLightMask(cv, { dissolve: preset.dissolve }))`. Without the
   second argument the light silently falls back to the old estimator.

**Resolution** — on resize, on a DPR change (`matchMedia('(resolution: …dppx)')`) and whenever
`governor.frame()` returns true: `const { scale, dither } = lightScale({ spanCss, params:
applyLook(preset), cssW, cssH, marchCap })`, then
`renderer.resize(Math.round(cssW × scale), Math.round(cssH × scale))`. The canvas's CSS box stays
the CSS size. `spanCss` = the emblem's on-screen span in CSS px (`signSize × stage scale` on main).

**Every frame** — exactly `MainScreen.update()`:
- `governor.frame(dtMs)` first; then `const q = governor.quality()`.
- `renderer.render(state)` with `params: applyLook(preset)`, `rays: q.rays`,
  `polarTheta: q.polarTheta`, `dither`, `scale`, `layers`/`octaves` from the device tier.
- `timeSec` is a running clock in seconds — **never frozen**: breathing, shimmer, dust and the
  rays' slow life all hang on it.
- Main: `signRot = timeSec × 0.0126` (0.72°/s); the pointer through `SmoothPointer`; hover eased
  150 ms in / 300 ms out into `hoverDir`/`hoverAmt`; the entrance burst. Every other state field
  (`bgMix`, `sceneDim`, `beamHover`…) is set the way `update()` sets it.

**Compositing.** The canvas draws light on black. CSS on it: `mix-blend-mode: screen;
pointer-events: none` (see `.ray-canvas` in `main.css`). Keep it in the same stacking context as
the background it lights: an ancestor with `opacity`, `transform`, `filter` or
`isolation: isolate` isolates the blend, and the canvas's black then covers the page.

**Film grain.** One `<div id="grain">` after the screens, the `#grain {…}` block from
`src/styles/global.css`, and `initGrain(el)` once at boot. It is hidden over the map and the
white pages (`concept.css`, `pages.css`) and ramped through `--grain-k` on «Музей»
(`MuseumScreen.ts`) and at the main screen's seam (`MainScreen.setReveal`). Do the same.

**The seam into the main screen.** The light's reveal multiplies everything it emits, so at 0 the
canvas is exact black. Keep that multiply after `applyLook` (`MainScreen.setReveal`).

## 3. Delete from the current build

- The old shader port (the pre-round-31 slit path) and its JavaScript.
- The per-frame jitter re-seed and the time-hashed shimmer — the exact light has no jitter.
- The about page's canvas at 0.22–0.48× — resolution comes from `lightScale` now.
- `.footer__light`, the CSS cross: it turns at 2.9°/s over the shader's 0.72°/s.

## 4. Check it is 1:1

1. **Byte-identical engine.** `git diff --no-index <this repo>/src/gpu <your copy>/gpu` prints
   nothing; the same for every §1 file.
2. **`?perf`** (query before the hash: `/?perf#museum`): the HUD reads `rays exact`, the same
   `polar` and `scale` as this prototype at the same window size on the same device.
3. **`?lab`**: the panel opens at the shipped values (exposure 1.05, trail 1.23, haze 0.18…). A
   look copied with Copy URL on one site reproduces on the other.
4. **`?rays=march`** brings back the old light — proof the modes route as here.
5. The engine's own proof runs in this repo: `npm run probe:light` (both backends; exits
   non-zero on any failure).

## 5. Changing the look

The designer tunes it in `?lab` and sends a Copy-URL link. To make that the default: put the
values in `LOOK_DEFAULTS` (`src/shared/lightLook.ts`) and `GRAIN_DEFAULTS`
(`src/shared/filmGrain.ts`), and bump the lab's `storeKey` in `lightLab.ts` (stored values
outrank defaults). Make the change here and copy both files again — same rule as everything
else: one source.
