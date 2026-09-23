/**
 * `?perf` — the numbers a person on a slow machine can read off the screen and
 * send back (round 31). Everything the light's cost depends on, in one corner:
 * frame time, which backend, which GPU, DPR, the live render scale and steps.
 *
 * Off unless the URL asks; built lazily on the first call. Throttled to four
 * updates a second — a HUD that rewrote itself every frame would be measuring
 * its own layout cost.
 */
let el: HTMLElement | null = null;
let last = 0;

export function perfHud(rows: Record<string, string | number>): void {
  const now = performance.now();
  if (now - last < 250) return;
  last = now;
  if (!el) {
    el = document.createElement('pre');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:8px 10px;' +
      'font:11px/1.45 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.72);' +
      'border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(el);
  }
  el.textContent = Object.entries(rows)
    .map(([k, v]) => `${k.padEnd(8)} ${v}`)
    .join('\n');
}
