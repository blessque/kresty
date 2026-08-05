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
  │                     (tabs 1–3 only; «Слайдер» arms PhotoSlider instead)
  ├─ PhotoSlider      — idle 7s → 8 full-bleed photo/headline slides under canvas.
  │                     One cross-fade: only the OUTGOING photo fades, over the
  │                     opaque incoming one. Timings are constants there, pushed
  │                     to --tr-* customs on #screen-main. mix → u_bgMix;
  │                     onSlideStart → the light's dip (SLIDE_DIP_S)
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

Three.js scene: the user's GLB (`public/resources/map.glb`, normalized to span 300,
base y=0) under an orthographic camera pinned straight top-down (it never rotates).
Cursor/touch tilt (deadzone on desktop, drag deltas on touch) drives a **plan-oblique
(military) projection**: a per-frame shear matrix on a wrapper group
(`x' = x + sx·y, z' = z + sz·y`), so roof plans stay pixel-exact 2D drawings at every
angle while walls extrude on the far side (`MAX_SHEAR` const, `?ob=<k>` dev override;
see TUNING_LOG Map rounds 4–5). The shear amount runs through a saturating response
curve (`RESPONSE_GAIN`) so small cursor moves lean the plan quickly while the maximum
stays hard-clamped. The frustum is **fitted to the loaded model's measured bounds plus
worst-case shear reach** on both axes (`FIT_MARGIN`, `?fit=<k>`), so nothing leaves
frame at any cursor position or aspect ratio.

Look: **«Грани»** — an alpha-blended body plus fat white edge lines on a near-white
`#f2f6fa` studio field. Material in `mapLooks.ts`; the studio (world-fixed raking
key/fill/rim, HDR environment probe, ground plate) in `mapStudio.ts`; edge extraction in
`edgeLines.ts`. The GLB's normals are re-creased at load (`toCreasedNormals`) because the
export smooths them across hard architectural edges, and the renderer uses
`NeutralToneMapping` so the bright environment doesn't clip lit faces flat.

**Buildings are derived, not authored.** The GLB is one mesh with no per-building nodes, so
`buildingSplit.ts` recovers 19 buildings by welding vertices and flood-filling connected
geometry, absorbing slivers by footprint. `buildingPicker.ts` owns hover/selection (picked
per frame — the shear moves geometry under a stationary cursor), `buildingsInfo.ts` holds
per-building resident data keyed by the stable ids, and `BuildingDrawer.ts` is the left
panel. See TUNING_LOG map rounds 5–7 before touching any of it. `buildingsData.ts` is
legacy/unused.

## Performance tiers

`shared/performanceTier.ts` → internal canvas resolution scale, dust layers (1–3),
fbm octaves (2–4), map pixel ratio. Mobile: ray canvas capped at 1.25× CSS px.
