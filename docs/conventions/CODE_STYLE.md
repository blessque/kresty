# Code Style

## Naming

- **Files:** `PascalCase.ts` for classes (screens, renderers, controllers),
  `camelCase.ts` for modules/utilities, `.glsl`/`.wgsl` for shaders
- **Classes:** PascalCase named exports; one main class per file
- **Shader uniforms:** `u_camelCase` in GLSL; struct fields in WGSL

## File size limit

- Max ~250 lines per file. Screens (`MainScreen.ts`, `ConceptScreen.ts`) may exceed this
  while they own their DOM + loop, but split before they reach ~350.

## Import rules

- Follow `.claude/rules/architecture.md` directions strictly
- No barrel `index.ts` files — import directly from the source file
- Shaders imported via Vite `?raw`; assets that need inlining live in `src/assets/`
  (public/ cannot be `?raw`-imported)

## TypeScript

- Strict mode ON — no `any`, no `@ts-ignore`
- Prefer `interface` for object shapes; unions for modes
- `import type` for type-only imports

## CSS

- Plain CSS files per screen (`main.css`, `concept.css`) + `global.css`, `fonts.css`
- No CSS frameworks, no preprocessors
- The 1440×800 stage is the only place with fixed px positioning — everything else
  is viewport-relative

## Shaders

- GLSL and WGSL are mirrored twins — same math, same function names, same section order
- Constants that a variant might want to change belong in `RayFieldParams`, not in
  shader literals
- Every magic number that survived tuning gets a comment saying what it does visually
