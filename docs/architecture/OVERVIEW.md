# Architecture Overview

## Two permanently-mounted screens

`index.html` holds `#screen-main` and `#screen-concept`, both always in the DOM.
The inactive one is `visibility:hidden; pointer-events:none` with its rAF loop paused
(not destroyed) — avoids GPU-context reinit flashes and lets the transition prime the
target one frame early (`ConceptScreen.primeFrame()`).

## Main screen data flow

```
MainScreen (owns rAF loop)
  ├─ layout.ts        — 1440×800 stage constants (Figma node 58:410 source of truth)
  ├─ stage scale-to-fit: transform scale(min(vw/1440, vh/800)); bg hides letterbox
  ├─ Nav links        — hover targets → beamHover[4] easing (150ms in / 300ms out);
  │                     beam angles measured from DOM rects on mount/resize
  ├─ variants.ts      — 5 presets; setVariant() cross-tweens numerics 400ms,
  │                     mode ints snap at midpoint under intensity dip
  ├─ Showreel         — idle 4.2s → photo crossfade layer under canvas; mix → u_bgMix
  ├─ SmoothPointer    — exp smoothing τ=0.4s → u_pointer
  └─ RayFieldRenderer (interface in gpu/rayFieldTypes.ts)
       ├─ WebGPURayFieldRenderer + rayField.wgsl   (primary)
       └─ WebGL2RayFieldRenderer + rayField.frag.glsl (fallback, visually identical)
```

Backend chosen by `gpu/capabilities.ts`: real `requestAdapter()` probe with 1.5s timeout,
`?backend=webgpu|webgl2` override for QA.

## Transition

`TransitionController.play(direction, swap)` — 720ms timeline on the MAIN screen's own
renderer (no third GPU context): converge (params override via `MainScreen.converge`) →
white flash div peak at t=0.46 where `swap()` toggles screens → release. Reduced-motion:
150ms crossfade. Router: no library; `navigate()` + pushState/popstate; `#concept` hash
is the deep link.

## Концепция screen

Three.js scene: extruded footprints from `buildingsData.ts` (traced approximations; two
12-point crosses), matcap + edge lines, hand-rolled orbit (cursor offset on desktop,
drag deltas on touch), reverse perspective applied per frame (see TUNING_LOG).

## Performance tiers

`shared/performanceTier.ts` → internal canvas resolution scale, dust layers (1–3),
fbm octaves (2–4), map pixel ratio. Mobile: ray canvas capped at 1.25× CSS px.
