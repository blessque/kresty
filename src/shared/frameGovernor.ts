/**
 * THE LIGHT'S QUALITY GOVERNOR (round 31) — measured frame time picks how many
 * pixels and how many god-ray steps the ray-field shader gets.
 *
 * The light is pure fill rate: round 12.1 measured frame time scaling EXACTLY
 * with pixel count, and render scale 2 on a Retina 1440×900 at 33 ms / 30 fps
 * even on an M1. Intel Macs in every browser, and Safari on M1, could not hold
 * it. The shipped look is `dissolve: 1` — no crisp core, all soft light, with the
 * grain a separate full-res CSS layer (`#grain`) — so fewer pixels and fewer
 * steps read as the same light. Nothing is baked; the client rejected that.
 *
 * WHY MEASURE INSTEAD OF DETECT. A GPU name is a guess — Safari reports "Apple
 * GPU" on every Mac, M1 or Intel — and the rest of the page (photo slider,
 * transitions, Three.js on «О Крестах») spends the same frame budget. The guess
 * only picks the STARTING rung; frame time decides from there.
 *
 * WHY STEPPING UP IS A PROBE. On a 60 Hz display rAF intervals never go below
 * 16.7 ms however idle the GPU is, so "frames are fast" is unobservable and a
 * rule like "step up under 13 ms" never fires. Instead: after STEP_UP_CALM_MS
 * with no slow frames, try one rung up. A probe that has to be undone locks the
 * governor for the session (one bad window, ever), and so do MAX_DOWNS
 * step-downs of any kind.
 *
 * Pure: imports nothing internal, reads only browser globals.
 */

export interface QualityRung {
  /** internal canvas pixels per CSS pixel, before the DPR / consumer caps */
  renderScale: number;
  /** god-ray march steps (`RayFieldState.raySteps`) */
  raySteps: number;
}

/**
 * Best first. Rung 2 is the default desktop start (was an implicit rung 0) —
 * MEASURED: at rung 1 the main screen dropped 4–10 frames a second on an M1
 * Retina (0 at rung 2, 0 with the light off), and the two look the same.
 *
 * PIXELS GO BEFORE STEPS, and that order was measured, not assumed. Cost is
 * roughly pixels × steps, but the two degrade differently: a lower render scale
 * only softens a light that is soft anyway, while fewer steps turn the march's
 * per-pixel jitter into a visible STIPPLE in the rays. At scale 0.6, 12 steps
 * read as a noisy, lifted field and 24 as the light; at scale 1, 28 was visibly
 * cleaner than 20. So steps never fall below 20 and scale carries the descent.
 */
export const LADDER: readonly QualityRung[] = [
  { renderScale: 2, raySteps: 32 },
  { renderScale: 1.5, raySteps: 32 },
  { renderScale: 1.25, raySteps: 28 },
  { renderScale: 1, raySteps: 24 },
  { renderScale: 0.75, raySteps: 24 },
  { renderScale: 0.6, raySteps: 20 },
];

const WINDOW = 60; // frames per verdict
const SLOW_MS = 20; // a frame the display could not show at ≥ 50 fps
/**
 * > 10% slow in a window → step down. Was 25%, and the live «О Крестах» light
 * showed why that is too tolerant: it dropped a steady 7% of frames while
 * scrolling at rung 1 (0% at rung 3, 0% with the light off) — visible
 * micro-stutter the governor never reacted to. Six slow frames a second is
 * jank; one or two is a GC pause or a photo decode, and still passes.
 */
const SLOW_SHARE = 0.1;
const WARMUP = 30; // frames ignored after a (re)start: layout, decode, JIT
const HITCH_MS = 250; // a tab switch or a GC pause, not a verdict on the GPU
const STEP_UP_CALM_MS = 5000;
const MAX_DOWNS = 2;
const MIN_GAP_MS = 2000; // between two changes: a resize is not free
/**
 * Probes never climb above the DEFAULT rung. A probe exists to recover a device
 * that started low (Intel, mobile) or stepped down on a transient — not to
 * chase sharpness nobody can see: rungs 0–2 are indistinguishable on a light
 * this soft (frozen-frame A/B). Measured on an M1 Retina, each probe above rung
 * 2 cost a ~2 s burst of 4–8 dropped frames a second before it was undone, on
 * every page, every session. `?rung=0|1` still reach them.
 */
const PROBE_CEILING = 2;

const params = new URLSearchParams(location.search);
function numParam(key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** `?rung=N` pins a rung — the A/B switch, and what the bench script drives */
const PINNED = numParam('rung');
/** `?rs=` / `?steps=` override one axis of whatever rung is live */
const RS_OVERRIDE = numParam('rs');
const STEPS_OVERRIDE = numParam('steps');
/** `?light=off` skips the GPU submit: the compositor-only baseline */
export const LIGHT_OFF = params.get('light') === 'off';
/**
 * `?field=on` forces the procedural field that round 31 skips at `slitMix: 1`,
 * by nudging the mix just under the shader's 0.999 threshold. A 0.15% blend of
 * the field — invisible, and exactly the pre-31 cost, so the saving can be A/B'd.
 */
export const FIELD_FORCED = params.get('field') === 'on';
/** `?perf` shows the HUD (perfHud.ts) */
export const PERF_HUD = params.has('perf');

const clampRung = (i: number) => Math.max(0, Math.min(LADDER.length - 1, Math.round(i)));

let index = PINNED !== null ? clampRung(PINNED) : 2;
let seeded = PINNED !== null;
let downs = 0;
/** the last change was a probe up that has not yet proven itself */
let probing = false;
let lastChange = 0;
let calmSince = 0;
let warm = WARMUP;
let win: number[] = [];

/** the last window's numbers, for the HUD */
export const stats = { medianMs: 0, p95Ms: 0, slowShare: 0 };
/** what the device reported, for the HUD */
export let gpuName = '';

/**
 * Pick the starting rung from what the renderer can see. Called once, by
 * whichever light initialises first; later calls only record the name.
 * `low` is the perf tier's mobile/small-memory verdict.
 */
export function seed(name: string, low: boolean): void {
  gpuName = name;
  if (seeded) return;
  seeded = true;
  let start = 2;
  if (/intel/i.test(name)) start = 3;
  if (low) start = Math.max(start, 3);
  index = start;
}

/** the live rung, with the URL overrides applied */
export function quality(): QualityRung {
  const r = LADDER[index];
  return {
    renderScale: RS_OVERRIDE ?? r.renderScale,
    raySteps: STEPS_OVERRIDE ?? r.raySteps,
  };
}

export function rungIndex(): number {
  return index;
}

export function isLocked(): boolean {
  return downs >= MAX_DOWNS;
}

/**
 * A light (re)started — a route was entered. Clears the window and waits out
 * the warm-up, so a route transition's own work is not read as the GPU's.
 */
export function reset(): void {
  win = [];
  warm = WARMUP;
  calmSince = performance.now();
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Feed one frame's interval. Returns true when the rung changed, so the caller
 * resizes its backing store. Only the screen that owns a live light calls this.
 */
export function frame(dtMs: number): boolean {
  const now = performance.now();
  if (dtMs > HITCH_MS) {
    // not a measurement: throw the partial window away rather than let one
    // pause tip it
    win = [];
    calmSince = now;
    return false;
  }
  if (warm > 0) {
    warm--;
    return false;
  }
  win.push(dtMs);
  if (win.length < WINDOW) return false;

  const sorted = [...win].sort((a, b) => a - b);
  const slow = win.filter((d) => d > SLOW_MS).length / win.length;
  stats.medianMs = percentile(sorted, 0.5);
  stats.p95Ms = percentile(sorted, 0.95);
  stats.slowShare = slow;
  win = [];

  if (PINNED !== null || RS_OVERRIDE !== null) return false;
  if (now - lastChange < MIN_GAP_MS) return false;

  if (slow > SLOW_SHARE) {
    calmSince = now;
    if (index >= LADDER.length - 1) return false;
    index++;
    downs++;
    // a probe that has to be undone is the answer: never probe again this
    // session. One bad window, not the two MAX_DOWNS alone would allow.
    if (probing) downs = MAX_DOWNS;
    probing = false;
    lastChange = now;
    warm = WARMUP;
    return true;
  }
  // a probe that survived a few seconds of verdicts has proven itself
  if (probing && now - lastChange > 4000) probing = false;
  if (slow > 1 / WINDOW) {
    calmSince = now; // one slow frame is noise; two in a window breaks the calm
    return false;
  }
  if (index > PROBE_CEILING && downs < MAX_DOWNS && now - calmSince > STEP_UP_CALM_MS) {
    index--;
    probing = true;
    lastChange = now;
    calmSince = now;
    warm = WARMUP;
    return true;
  }
  return false;
}
