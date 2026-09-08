#!/usr/bin/env node
/**
 * Design-token drift check. No dependencies — this project does not install
 * one without asking, and the whole check is a scan over six stylesheets.
 *
 * WHAT IT ENFORCES, and why only this much:
 *
 *   colour       STRICT. A raw hex outside tokens.css is how eight different
 *                blues happened. High signal, no legitimate exceptions.
 *   font-size    STRICT. Same argument; the Figma text styles are the scale.
 *   line-height  STRICT when it carries a px/unitless literal.
 *   spacing      NOT CHECKED, deliberately. `translate(-50%)`, optical nudges
 *                and one-off geometry are legitimate and numerous, and a check
 *                that cries wolf is a check that gets ignored. Spacing is
 *                single-sourced by review, not by grep.
 *
 * Layout constants (max-widths, the grid, the 32/40 corner rule) are NOT tokens
 * and are not checked here — they are decisions that live in code beside their
 * reasoning. See the header of src/styles/tokens.css.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts/token-baseline.json');

/**
 * THE BASELINE IS WHY THIS CHECK SURVIVES.
 *
 * The design system arrived after ~1,900 lines of CSS, so on day one there were
 * 73 raw values in screens that are shipped and client-approved. A check that
 * fails on all of them is a check that gets disabled within a week, and
 * rewriting «Контакты» and the map to satisfy it would change approved pixels
 * for no one's benefit.
 *
 * So the baseline records the debt by CONTENT, not by line number — a file
 * shifting by ten lines must not resurface 20 fake violations, and a genuinely
 * new raw value must not hide by landing on a blessed line. Adding a token to
 * an old file removes its entry and the total only ever falls.
 *
 * `--update` re-records it. Do that when the count DROPS; if it rises, that is
 * the check working.
 */

/** files whose raw values are the vocabulary itself, or are not ours */
const EXEMPT = [/styles\/tokens\.css$/, /styles\/fonts\.css$/, /waterPanel\.css$/];

/**
 * `?admin` dev panels are exempt: they are debug furniture, never in a client
 * demo's bundle, and holding them to the design system would be busywork.
 */
function cssFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

const RULES = [
  {
    id: 'colour',
    // a hex literal anywhere in a declaration
    re: /#[0-9a-fA-F]{3,8}\b/g,
    hint: 'use a colour token from tokens.css',
  },
  {
    id: 'font-size',
    re: /font-size:\s*([^;]+);/g,
    // `\s*` BACKTRACKS, so a `(?!var\()` lookahead right after it silently
    // passes on `font-size: var(--x)` — it matched at the space. Test the
    // captured value instead of trying to exclude it in the pattern.
    ok: (v) => v.startsWith('var(') || v === 'inherit',
    hint: 'use --type-*-size (the Figma text styles)',
  },
  {
    id: 'line-height',
    re: /line-height:\s*([^;]+);/g,
    ok: (v) => v.startsWith('var(') || v === 'inherit' || v === 'normal',
    hint: 'use --type-*-lh',
  },
];

const baseline = existsSync(BASELINE)
  ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).entries)
  : new Set();
const update = process.argv.includes('--update');

const found = [];
let violations = 0;
const byFile = new Map();

for (const file of cssFiles(SRC)) {
  if (EXEMPT.some((r) => r.test(file))) continue;
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // a line that is entirely a comment is not a declaration
    if (/^\s*(\/\*|\*|\/\/)/.test(line)) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(line);
      if (!m) continue;
      if (rule.ok && rule.ok((m[1] ?? '').trim())) continue;
      // keyed on file + rule + the offending text, never the line number
      const key = `${rel}|${rule.id}|${m[0].trim()}`;
      found.push(key);
      if (baseline.has(key) && !update) continue;
      violations++;
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push(`  ${String(i + 1).padStart(4)}  ${rule.id.padEnd(11)} ${m[0].trim()}   → ${rule.hint}`);
    }
  });
}

if (update) {
  const entries = [...new Set(found)].sort();
  writeFileSync(BASELINE, JSON.stringify({ entries }, null, 2) + '\n');
  console.log(`design tokens: baseline re-recorded — ${entries.length} known raw value(s)`);
  process.exit(0);
}

// debt that has since been paid off: report it, never fail on it
const stale = [...baseline].filter((k) => !found.includes(k));

if (violations === 0) {
  const debt = baseline.size - stale.length;
  console.log(
    `design tokens: clean` +
      (debt ? ` (${debt} known raw value(s) in pre-token screens — run with --update after paying any off)` : ''),
  );
  process.exit(0);
}

console.error(`\ndesign-token drift: ${violations} NEW raw value(s) outside tokens.css\n`);
for (const [file, rows] of byFile) {
  console.error(file);
  for (const r of rows) console.error(r);
  console.error('');
}
console.error(
  'Each of these is a value that should have a name. Add a token to\n' +
    'src/styles/tokens.css and reference it — or, if it genuinely is not a\n' +
    'design value, add the file to EXEMPT in scripts/lint-tokens.mjs and say why.\n',
);
process.exit(1);
