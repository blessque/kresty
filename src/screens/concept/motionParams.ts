/**
 * «О Крестах» page motion — every dial in one place (round 23).
 *
 * The same arrangement `waterParams.ts` uses, and for the same reason: the
 * shipped values are a constant the panel edits in memory, so tuning costs no
 * recompile and a verdict is one Copy-paste back into `MOTION_DEFAULTS`.
 *
 * ── why this exists ─────────────────────────────────────────────────────────
 * The icon swap was reported as "rude", and the cause is not one number. Three
 * things stack:
 *
 *  1. `iconY` is `min(max(flowing, pinned), pushed)` — piecewise linear with two
 *     hard corners, so d(iconY)/d(scrollTop) jumps −1 → 0 → −1. The light
 *     glides, freezes dead, then lurches. `envelope()` is smooth *in position*,
 *     so it inherits both corners: the opacity's RATE changes instantaneously.
 *     → `follow` rounds the corners off.
 *  2. `track()` picks the owner by nearest-to-centre with no hysteresis, so the
 *     station can flip back and forth on a slow scroll.  → `hysteresis`.
 *  3. There is ONE canvas and ONE mask, so a crossfade is impossible by
 *     construction — the design relies on both icons being at envelope 0 at the
 *     handoff. That is what `edge` and `curve` control.
 *
 * Anything here that is NOT a taste dial stays a hard constant in its own file:
 * `REF_COVERAGE` (a measurement), `CANVAS_VH` (an exact requirement).
 */

/** how `envelope()` shapes its ramp. Index into `CURVES` in pageLight.ts. */
export const CURVE_NAMES = ['linear', 'smoothstep', 'smootherstep', 'cosine', 'pow'] as const;

export interface MotionParams {
  // ── envelope: how the light arrives and leaves ────────────────────────────
  /** ramp width as a fraction of the viewport, per edge. Was a hard 0.2. */
  edge: number;
  /** index into CURVE_NAMES */
  curve: number;
  /** exponent for the `pow` curve only */
  gamma: number;
  /** −1 = all ramp on the way in, +1 = all on the way out, 0 = symmetric */
  asymmetry: number;

  /**
   * THE SWAP DIP — how far the light falls while it changes icon, 0..1.
   *
   * MEASURED, and it is the headline finding of round 23: `envelope()` NEVER
   * reaches 0 between sections. Scanning the whole run at a 900px viewport, the
   * light ramps 0 → 1 over scrollTop 1760–1880 and then reads exactly 1.000
   * across all four station boundaries. The reason is the pin: it holds every
   * icon at u ≈ 0.22 of the viewport, just inside the envelope's flat top, so
   * the roll-off only ever engages on the first entrance and the last exit.
   *
   * `pageLight.ts` states the intent as "the light fades out as its own icon
   * leaves the frame and the swap happens at zero". That is not what happens —
   * the mask is replaced at FULL BRIGHTNESS, which is the rudeness.
   *
   * So this reuses «Слайдер»'s shipped rule, which the same file already cites:
   * *the light dips, it never flashes*. 0 = off = exactly what shipped, so the
   * dial is opt-in and can be compared against the current behaviour.
   */
  swapDip: number;
  /** the dip's full duration, ms. The icon changes at its lowest point. */
  swapMs: number;

  // ── motion: the corners, not the fade ─────────────────────────────────────
  /**
   * Seconds of smoothing on the icon's tracked position. 0 = off.
   *
   * ROUND 24 ships 0.01 — the designer's pick, and deliberately tiny: it takes
   * the hard corner off `iconY`'s slope change without introducing visible lag.
   *
   * Not free: above 0 the light writes a transform every frame while the column
   * is pinned, which is exactly the per-frame compositor work conceptPage's
   * header celebrates suppressing. Watch the frame cost, do not assume it.
   */
  follow: number;
  /** deadband on the owner test, as a fraction of the viewport */
  hysteresis: number;
  /** cursor push on the light */
  parallax: number;

  // ── layout: where the gaps actually are ───────────────────────────────────
  /**
   * Sticky offset, vh — drives `--sec-pin`.
   *
   * ROUND 24 ships 0, which is a real change of behaviour and not a disabled
   * dial: the column pins at the very top of the viewport now, so the icon's
   * hold phase sits higher and the light travels further before its successor
   * arrives. That is part of why the swap reads better than it did.
   */
  pin: number;
  /**
   * Section top padding, vh — and this is THE GAP BETWEEN SECTIONS.
   *
   * The visible gap is `padBottom + padTop`, but padBottom is one of the three
   * terms of the station invariant (`pin + colH + padBottom <= viewH`) and so
   * cannot grow far. padTop is in NEITHER the invariant nor the column, so it
   * is the free lever and the one to reach for.
   *
   * Round 23.1 took it 20 → 40 after the client reported the gaps were too
   * small; ROUND 24 took it to 70 from the designer's own panel session, which
   * with padBottom 112 gives ~82vh between one section's last line and the
   * next one's first. The values below are that session's verdict, pasted back
   * through the panel's Copy button — they are chosen, not derived.
   */
  padTop: number;
  /** section bottom padding, px — a term of the station invariant */
  padBottom: number;
  /** icon box, px */
  iconSize: number;
  /** 0 = flush to the column start, 1 = centred (the round-23 default) */
  iconAlign: number;
  /** map → first section, viewports. Coupled: must exceed 0.5 + bandVh/2 */
  gapVh: number;
  /** colour crossfade band, viewports */
  bandVh: number;

  // ── light: the designer's «Контакты» settings, handed over in round 13 ────
  dissolve: number;
  core: number;
  godrays: number;
  bloom: number;
  /** reach in px. This is why a swap pops across the WHOLE frame rather than
   *  just the icon — it belongs next to the envelope dials, not buried here. */
  falloff: number;
  exposure: number;
  ca: number;
}

export const MOTION_DEFAULTS: MotionParams = {
  edge: 0.31,
  curve: 4, // pow, at gamma 1.5
  gamma: 1.5,
  asymmetry: 0.55,
  swapDip: 0,
  swapMs: 420,

  follow: 0.01,
  hysteresis: 0,
  parallax: 0,

  pin: 0,
  padTop: 70,
  padBottom: 112,
  iconSize: 228,
  iconAlign: 1,
  gapVh: 1,
  bandVh: 1,

  dissolve: 0.41,
  core: 0.61,
  godrays: 1.75,
  bloom: 0.9,
  falloff: 990,
  exposure: 1.3,
  ca: 0.028,
};

/**
 * The live set. Mutated IN PLACE by the panel — never reassigned, because every
 * panel row closes over this object and a reassignment would leave all of them
 * bound to a detached copy (the trap `WaterPanel`'s Reset button records).
 */
export const MOTION: MotionParams = { ...MOTION_DEFAULTS };

export function cloneMotionParams(p: MotionParams): MotionParams {
  return { ...p };
}

/**
 * The station invariant, `pin + columnHeight + paddingBottom <= viewH`, which
 * `sectionRun.measure()` asserts at runtime. `pin`, `padBottom` and `iconSize`
 * are all dials now, so the panel has to re-run it on every change and show the
 * answer — a console warning nobody is looking at is not a guard rail when the
 * thing that breaks it is a slider.
 */
export function gapFloor(bandVh: number): number {
  return 0.5 + bandVh / 2;
}

/**
 * Push the layout dials into CSS. Written on the ROOT so they inherit to every
 * `.sec` at once — the alternative is walking five elements and the contact
 * form, and forgetting the form is exactly the kind of drift this file exists
 * to stop.
 *
 * Called once at startup so the shipped defaults and the stylesheet cannot
 * disagree, and again on every panel change.
 */
export function applyMotionCss(p: MotionParams = MOTION) {
  const s = document.documentElement.style;
  s.setProperty('--sec-pin', `${p.pin}vh`);
  s.setProperty('--sec-pad-top', `${p.padTop}vh`);
  s.setProperty('--sec-pad-bottom', `${p.padBottom}px`);
  s.setProperty('--sec-icon-size', `${p.iconSize}px`);
  s.setProperty('--gap-vh', String(p.gapVh));
  // `.sec-col`'s text-align and the icon's own margin have to agree, or the
  // heading centres and the light stays flush left — they are one decision
  // expressed in two properties, so they are written together and never apart.
  const centred = p.iconAlign >= 0.5;
  s.setProperty('--sec-col-align', centred ? 'center' : 'start');
  s.setProperty('--sec-icon-inline', centred ? 'auto' : '0');
}
