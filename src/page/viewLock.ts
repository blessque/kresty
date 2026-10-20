/**
 * Glue an element's vertical position to another element's passage through its
 * scroller — ON THE COMPOSITOR (round 34).
 *
 * The «О Крестах» icon light is a canvas OUTSIDE the scroller (its `screen`
 * blend has to reach `.page-bg`), so it cannot simply scroll with the icon it
 * draws. On desktop that never showed: the icon's column is sticky, it holds
 * still, and the per-frame `translate3d` barely changes. Below 1160 the column
 * flows, the transform chases the scroll on EVERY frame, and on a phone the
 * main thread trails the compositor's scroll by a frame or two — 30–70 px at
 * flick speed. The user saw it as the icons "parallaxing": lagging, then
 * jumping to catch up. Round 16.1's rule again: nothing that must track the
 * scroll goes on the main thread.
 *
 * A `ViewTimeline` hands the transform to the browser's animation engine with
 * the subject's own scroll progress as the playhead, which runs on the
 * compositor (Chrome; Safari since 26.4, "threaded scroll-driven animations").
 * It is `mediaSlider`'s `animation-timeline: view()`, in WAAPI form because
 * the animated element is not inside the subject's scroller.
 *
 * The subject's progress is 0 when its top edge meets the scrollport's bottom
 * and 1 when its bottom edge meets the top, so it travels `viewH + subjectH`
 * across the range and the keyframes are a straight line between those two
 * positions. Being relative to the subject, it survives anything above it
 * changing height — a picture loading, the form growing — with no re-measure.
 *
 * Returns null where `ViewTimeline` does not exist (Firefox, iOS < 26.4); the
 * caller keeps writing its own transform there.
 */

/** TS 5.9's lib.dom has no `ViewTimeline` yet */
type ViewTimelineCtor = new (o: { subject: Element; axis?: 'block' | 'inline' }) => AnimationTimeline;

const VT = (globalThis as unknown as { ViewTimeline?: ViewTimelineCtor }).ViewTimeline;

export const CAN_LOCK_TO_VIEW = typeof VT === 'function';

/**
 * Animate `el`'s `translateY` from `fromPx` (subject entering at the bottom) to
 * `toPx` (subject gone off the top), linearly, on `subject`'s view timeline.
 */
export function lockToView(el: HTMLElement, subject: Element, fromPx: number, toPx: number): Animation | null {
  if (!VT) return null;
  try {
    return el.animate(
      [
        { transform: `translate3d(0, ${fromPx.toFixed(2)}px, 0)` },
        { transform: `translate3d(0, ${toPx.toFixed(2)}px, 0)` },
      ],
      { timeline: new VT({ subject, axis: 'block' }), fill: 'both', easing: 'linear' },
    );
  } catch (err) {
    console.warn('[kresty] view lock unavailable, falling back to the rAF transform', err);
    return null;
  }
}
