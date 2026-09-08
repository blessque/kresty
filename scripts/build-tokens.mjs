#!/usr/bin/env node
/**
 * tokens/  →  src/styles/tokens.gen.css  +  src/styles/tokens.gen.ts
 *
 * The designer authors in Figma and exports with Token Studio; this turns that
 * export into the two forms the app can consume. No dependencies — the whole
 * job is a merge, a reference resolve and two string builders.
 *
 * WHY TWO OUTPUTS. CSS covers stylesheets; the TS module covers the places that
 * write colour from script — `pageSections.ts`'s five section fields and
 * `MAIN_BG`, which must equal `#screen-main`'s field exactly or the round-19
 * scroll seam becomes visible.
 *
 * WHY NOT `getComputedStyle(root).getPropertyValue('--x')` FOR THE JS SIDE.
 * Vite injects CSS asynchronously in dev, so a module-scope read can return an
 * empty string — `MAIN_BG` would silently become `''` and the seam would break
 * with no error. `pageBackground.mixRgb` also does `parseInt(a.slice(1), 16)`,
 * which yields NaN on a computed `rgb(…)` form. A generated module is checked
 * by `tsc` instead.
 *
 * WHY THE OUTPUT IS COMMITTED. `vite dev` must work with no pre-step, and a
 * re-export should show up as a readable diff rather than a silent behaviour
 * change. `--check` regenerates into memory and fails if the committed files
 * differ, and it runs in `npm run build` and in the Stop hook.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'tokens');
const OUT_CSS = join(ROOT, 'src/styles/tokens.gen.css');
const OUT_TS = join(ROOT, 'src/styles/tokens.gen.ts');

/**
 * The tokens are authored against a 16px root. THIS SITE'S ROOT IS 21px
 * (`global.css`, and body copy inherits it), so emitting the rem values
 * directly would render every size ~31 % oversized.
 *
 * We emit px and leave the document base alone. The alternative — re-homing the
 * root to 16 and keeping rem — was rejected because only the TYPE would then
 * respond to the browser's root font-size, inside a layout that does not: the
 * stage is a fixed 1440×800 box, the nav positions derive from a hard radius of
 * 272, and `mapLabels` solves caption placement from `offsetWidth`. Type that
 * scales alone inside fixed geometry is a bug, not accessibility.
 *
 * Each emitted declaration carries its source rem value, so if the root is ever
 * re-homed the comment is the check.
 */
const REM_ROOT_PX = 16;

/**
 * ALS Chromius's `wght` axis is min 50 / default 120 / max 232 — Regular is
 * 120 and Medium is 150. Figma reports these as the words below and, over the
 * REST API, as 400/500; BOTH of those clamp to 232 = Black on this font.
 * Never pass a Figma weight through. See src/styles/fonts.css.
 */
const CHROMIUS_WEIGHT = { Regular: 120, Medium: 150 };

/** the only family on the site — round 10 removed ALS Hauss at the designer's
 *  request and it must not return. Asserted at generation time. */
const ONLY_FAMILY = 'ALS Chromius';

/** which size token each text style binds — confirmed against Figma's own
 *  variable bindings, which Token Studio flattened to positional fontSize.N */
const STYLE_SIZE = {
  H1: 'fs-h1',
  H2: 'fs-h2',
  H3: 'fs-lead',
  'Base Text': 'fs-base',
  'Caption Big': 'fs-base',
  'Caption Small': 'fs-small',
};

/** the CSS custom-property stem for each style */
const STYLE_STEM = {
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  'Base Text': 'base',
  'Caption Big': 'caption-big',
  'Caption Small': 'caption-sm',
};

const die = (msg) => {
  console.error(`\n[build-tokens] ${msg}\n`);
  process.exit(1);
};

// ── load ────────────────────────────────────────────────────────────────────
const meta = JSON.parse(readFileSync(join(SRC, '$metadata.json'), 'utf8'));
const sets = new Map();
for (const name of meta.tokenSetOrder) {
  try {
    sets.set(name, JSON.parse(readFileSync(join(SRC, `${name}.json`), 'utf8')));
  } catch {
    die(`set "${name}" is listed in $metadata.json but ${name}.json is missing`);
  }
}

/** flatten one set to `dotted.path -> { type, value }` */
function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && '$value' in v) {
      out.set(prefix ? `${prefix}.${k}` : k, { type: v.$type, value: v.$value });
    } else if (v && typeof v === 'object') {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

/**
 * The two typography sets are MODES of the same five names, so they are read
 * separately rather than merged — merging would let Mobile silently win.
 */
const base = new Map();
for (const [name, json] of sets) {
  if (name.startsWith('typography/')) continue;
  flatten(json, '', base);
}
const modes = {
  desktop: flatten(sets.get('typography/Desktop & Tablet') ?? {}, '', new Map()),
  mobile: flatten(sets.get('typography/Mobile') ?? {}, '', new Map()),
};

// ── resolve {refs} ──────────────────────────────────────────────────────────
function resolve(value, seen = []) {
  if (typeof value !== 'string') return value;
  const m = /^\{([^}]+)\}$/.exec(value.trim());
  if (!m) return value;
  const path = m[1];
  if (seen.includes(path)) die(`reference cycle: ${[...seen, path].join(' → ')}`);
  const hit = base.get(path);
  if (!hit) die(`unresolved reference {${path}} (from ${seen.join(' → ') || 'root'})`);
  return resolve(hit.value, [...seen, path]);
}

// ── converters, each of which is a trap if done by hand ─────────────────────
function toPx(dim, path) {
  const s = String(dim).trim();
  let m = /^(-?[\d.]+)rem$/.exec(s);
  if (m) return { px: Number(m[1]) * REM_ROOT_PX, src: s };
  m = /^(-?[\d.]+)px$/.exec(s);
  if (m) return { px: Number(m[1]), src: s };
  if (/^-?[\d.]+$/.test(s)) return { px: Number(s), src: `${s} (unitless)` };
  die(`${path}: "${s}" is not a rem or px dimension`);
}

/** `110%` → `1.1`. UNITLESS IS LOAD-BEARING, not a style preference:
 *  concept.css centres the map-mark icons with
 *  `calc((var(--mark-lh) * 1em - var(--icon-h)) / 2)`, and a px line-height
 *  makes `36.8px * 1em` invalid at computed-value time — the whole calc drops
 *  and both entrance marks jump ~5px, silently. It also makes the responsive
 *  switch five declarations instead of ten, since a ratio follows its size. */
function toRatio(lh, path) {
  const s = String(lh).trim();
  const m = /^([\d.]+)%$/.exec(s);
  if (m) return { n: Number(m[1]) / 100, src: s };
  if (/^[\d.]+$/.test(s)) return { n: Number(s), src: s };
  die(`${path}: "${s}" is not a line-height percentage`);
}

function weight(name, path) {
  const w = CHROMIUS_WEIGHT[String(name).trim()];
  if (w === undefined) {
    die(
      `${path}: font weight "${name}" is not one of ${Object.keys(CHROMIUS_WEIGHT).join('/')}. ` +
        `A numeric weight here would clamp to 232 = Black on the Chromius axis.`,
    );
  }
  return w;
}

const num = (n) => String(Number(n.toFixed(4)));
const hex = (v) => {
  const s = String(v).trim().toLowerCase();
  if (!/^#[0-9a-f]{3,8}$/.test(s)) die(`"${v}" is not a hex colour`);
  return s;
};

// ── gather ──────────────────────────────────────────────────────────────────
const primitives = [];
for (const [path, t] of base) {
  if (t.type === 'color' && !path.includes('.')) primitives.push([path, hex(t.value)]);
}

const semantics = [];
for (const [path, t] of base) {
  if (t.type !== 'color' || !path.includes('.')) continue;
  const [group, name] = path.split('.');
  const ref = /^\{([^}]+)\}$/.exec(String(t.value).trim());
  semantics.push({ group, name, value: hex(resolve(t.value, [path])), ref: ref ? ref[1] : null });
}

const styles = [];
for (const [style, sizeToken] of Object.entries(STYLE_SIZE)) {
  const t = base.get(style);
  if (!t) die(`text style "${style}" is missing from the export`);
  const v = t.value;
  const fam = resolve(v.fontFamily, [style]);
  if (fam !== ONLY_FAMILY) {
    die(
      `${style}: family "${fam}". ALS Chromius is the only typeface on this site — ` +
        `round 10 removed ALS Hauss at the designer's request (see src/styles/fonts.css).`,
    );
  }
  styles.push({
    style,
    stem: STYLE_STEM[style],
    sizeToken,
    weight: weight(resolve(v.fontWeight, [style]), style),
    lh: toRatio(resolve(v.lineHeight, [style]), style),
  });
}

const sizes = {};
for (const mode of ['desktop', 'mobile']) {
  sizes[mode] = [...modes[mode]].map(([name, t]) => [name, toPx(t.value, `${mode}.${name}`)]);
}

// ── emit CSS ────────────────────────────────────────────────────────────────
const BANNER =
  `/* GENERATED by scripts/build-tokens.mjs from tokens/ — DO NOT EDIT.\n` +
  `   Re-run \`npm run tokens\` after a Token Studio re-export.\n` +
  `   Hand-written project tokens and exemptions live in tokens.css. */\n`;

const L = [];
L.push(BANNER);
L.push(':root {');
L.push('  /* ── primitives. Named by what they ARE. The semantic layer below is');
L.push('     the only thing that may reference these — see tokens.css. ── */');
for (const [name, v] of primitives) L.push(`  --ref-${name}: ${v};`);
L.push('');
L.push('  /* ── type scale (Desktop & Tablet). Mobile overrides at the foot. ── */');
for (const [name, { px, src }] of sizes.desktop) {
  L.push(`  --${name}: ${num(px)}px; /* ${src} @ root ${REM_ROOT_PX} */`);
}
L.push('');
L.push('  /* Line-heights are UNITLESS RATIOS on purpose — a px value breaks');
L.push('     concept.css\'s `calc(var(--mark-lh) * 1em …)` icon centring, and a');
L.push('     ratio follows its size across the responsive switch for free. */');
const ratios = [...new Set(styles.map((s) => s.lh.n))].sort((a, b) => a - b);
for (const r of ratios) L.push(`  --lh-${String(r).replace('.', '-')}: ${num(r)};`);
L.push('');
L.push(`  --font-family-display: '${ONLY_FAMILY}', sans-serif;`);
L.push('  /* Chromius axis is 50/120/232 — a plain 400 or 500 clamps to Black */');
for (const [k, v] of Object.entries(CHROMIUS_WEIGHT)) {
  L.push(`  --font-weight-${k.toLowerCase()}: ${v}; /* Figma "${k}" */`);
}
L.push('');
L.push('  /* ── semantic colour. Named by what it is FOR. This is the API. ── */');
let lastGroup = '';
for (const s of semantics) {
  if (s.group !== lastGroup) {
    L.push(`  /* ${s.group} */`);
    lastGroup = s.group;
  }
  L.push(`  --color-${s.name}: var(--ref-${s.ref}); /* ${s.value} */`);
}
L.push('');
L.push('  /* ── text styles, composed. Size and leading pair per style. ── */');
for (const s of styles) {
  L.push(
    `  --type-${s.stem}-size: var(--${s.sizeToken});` +
      `  --type-${s.stem}-lh: var(--lh-${String(s.lh.n).replace('.', '-')});` +
      `  --type-${s.stem}-weight: var(--font-weight-${s.weight === 150 ? 'medium' : 'regular'});` +
      ` /* ${s.style} */`,
  );
}
L.push('}');
L.push('');
L.push('/* typography/Mobile. The token set names no breakpoint; 768 keeps the');
L.push('   set\'s own promise — it is called "Desktop & Tablet", so a tablet in');
L.push('   portrait keeps the larger scale. Note «О Крестах» collapses to one');
L.push('   column at 900, so 768–900 is single-column with desktop type; that is');
L.push('   intended, not an oversight. */');
L.push('@media (max-width: 767.98px) {');
L.push('  :root {');
for (const [name, { px, src }] of sizes.mobile) {
  L.push(`    --${name}: ${num(px)}px; /* ${src} @ root ${REM_ROOT_PX} */`);
}
L.push('  }');
L.push('}');
const css = L.join('\n') + '\n';

// ── emit TS ─────────────────────────────────────────────────────────────────
const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const T = [];
T.push(BANNER.replace(/tokens\.css/, 'tokens.css'));
T.push('/** Resolved colour values, for the places that write colour from script. */');
T.push('export const T = {');
for (const [name, v] of primitives) T.push(`  ${camel(name)}: '${v}',`);
for (const s of semantics) T.push(`  ${camel(s.name)}: '${s.value}',`);
T.push('} as const;');
T.push('');
T.push('/** the same values as Three.js integers */');
T.push('export const T_INT = {');
const asInt = (h) => `0x${h.slice(1, 7)}`;
for (const [name, v] of primitives) T.push(`  ${camel(name)}: ${asInt(v)},`);
for (const s of semantics) T.push(`  ${camel(s.name)}: ${asInt(s.value)},`);
T.push('} as const;');
const ts = T.join('\n') + '\n';

// ── write or check ──────────────────────────────────────────────────────────
const check = process.argv.includes('--check');
const outputs = [
  [OUT_CSS, css],
  [OUT_TS, ts],
];

if (check) {
  let bad = 0;
  for (const [path, want] of outputs) {
    let have = '';
    try {
      have = readFileSync(path, 'utf8');
    } catch {
      /* missing counts as a mismatch */
    }
    if (have !== want) {
      bad++;
      console.error(`[build-tokens] ${path.replace(ROOT, '')} is stale or hand-edited.`);
    }
  }
  if (bad) {
    console.error('\nRun `npm run tokens` to regenerate from tokens/.\n');
    process.exit(1);
  }
  console.log('design tokens: generated files match tokens/');
  process.exit(0);
}

for (const [path, body] of outputs) writeFileSync(path, body);
console.log(
  `design tokens: ${primitives.length} primitives, ${semantics.length} semantics, ` +
    `${styles.length} text styles → tokens.gen.css + tokens.gen.ts`,
);
