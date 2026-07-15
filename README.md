# Кресты — Prototype

2-screen concept prototype for the Kresty redevelopment promo site: a live crossing-light
key visual (WebGPU + WebGL2 fallback), cursor-reactive, as full-screen navigation, and an
interactive top-down site map («Концепция»).

## Run

```bash
npm install
npm run dev
```

- Force a backend: `?backend=webgl2` or `?backend=webgpu`
- Концепция page deep link: `#concept`
- `?fx=` overrides the ray-field preset for dev comparisons (see `src/screens/main/variants.ts`);
  the shipped experience always runs `cross-flare`

## Assets

`public/resources/` ships only what the build needs: 5 font files + `scene.glb`. A few
placeholder photos used by the idle showreel and the hover state are kept locally but are
gitignored (real client photography TBD) — a fresh clone will show those two features
without images; everything else (rays, nav, transition, map) is unaffected. The full
mood-board archive (reference photography, plan screenshots, `.blend` files) lives in the
gitignored top-level `references/` folder.

## Verify

```bash
npm run build                # typecheck + production build
node scripts/interact-test.mjs   # needs dev server on :5199 and installed Chrome
```

## Docs

Architecture and effect-tuning docs live in `docs/`.
