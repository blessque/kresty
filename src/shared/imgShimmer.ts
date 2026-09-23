/**
 * Loading placeholders for content photographs (round 31.5).
 *
 * An `<img class="shimmer">` shows a moving sheen (global.css) until it loads,
 * a still tint if it fails. This marks the outcome — `is-loaded` / `is-failed`
 * — so the CSS can stop the animation: a shimmer left running behind a photo
 * keeps repainting, and around an `object-fit: contain` slide it is VISIBLE
 * in the letterbox.
 *
 * ONE capture listener for the whole document, because `load` and `error` do
 * not bubble but do capture — every page, every lazy image, no per-component
 * wiring. The MutationObserver is the other half and it is not optional: an
 * image can finish while it is still DETACHED (a slider strip is built before
 * it is inserted), and a detached element's `load` never reaches the document.
 * So whatever arrives already `complete` is marked on insertion.
 *
 * Pure: imports nothing internal.
 */
function mark(img: HTMLImageElement) {
  if (!img.complete) return;
  img.classList.add(img.naturalWidth > 0 ? 'is-loaded' : 'is-failed');
}

export function watchImageLoads(): void {
  const onEvent = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.classList.contains('shimmer')) {
      t.classList.add(e.type === 'load' ? 'is-loaded' : 'is-failed');
    }
  };
  document.addEventListener('load', onEvent, true);
  document.addEventListener('error', onEvent, true);

  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n instanceof HTMLImageElement && n.classList.contains('shimmer')) mark(n);
        for (const img of n.querySelectorAll<HTMLImageElement>('img.shimmer')) mark(img);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
