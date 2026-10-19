import * as governor from '../shared/frameGovernor';
import { detailScale } from '../gpu/exactLight';
import type { RayFieldParams } from '../gpu/rayFieldTypes';

/**
 * How many canvas pixels per CSS pixel a light gets this frame (round 33) — the
 * one decision every light used to make for itself, and the one that made the
 * old light grainy everywhere but an M1: a jittered estimate rendered at 1.25 on
 * a 2× screen, or at 1 on a 3× phone, has every noisy pixel stretched into a
 * 1.6–3× blotch by the compositor.
 *
 * The exact light has no noise to stretch, so its scale is set by what it can
 * SHOW: `detailScale` (native wherever a crisp core or a small emblem needs it),
 * times the governor's rung, under an allocation ceiling — «О Крестах»'s canvas
 * is two viewports tall, which at native 5K would be 118 MB a buffer. The old
 * march keeps its own cap (`marchCap`), so `?rays=march` is today, unchanged.
 *
 * `dither`: below ~0.75 of the screen's density the compositor's upscale
 * averages the dither down, so it is raised to keep long gradients unbanded.
 */
export function lightScale(o: {
  /** the emblem's span, CSS px */
  spanCss: number;
  params: Pick<RayFieldParams, 'dissolve' | 'rayEdge' | 'penumbra'>;
  /** the canvas's CSS size, its full height included */
  cssW: number;
  cssH: number;
  /** the march's ceiling — tier and page caps, as before round 33 */
  marchCap: number;
  /** a page's own dev override (`?ls=`), absolute */
  override?: number | null;
  maskSize?: number;
}): { scale: number; dither: number } {
  const q = governor.quality();
  const dpr = devicePixelRatio || 1;
  let scale: number;
  const abs = o.override ?? q.absScale;
  if (abs !== null && abs !== undefined) scale = abs;
  else if (q.mode === 'exact') {
    scale =
      detailScale({
        spanCss: o.spanCss,
        dpr,
        dissolve: o.params.dissolve,
        maskSize: o.maskSize ?? 640,
        rayEdge: o.params.rayEdge,
        penumbra: o.params.penumbra,
      }) * q.renderScale;
  } else scale = Math.min(q.renderScale, o.marchCap);
  const maxPx = governor.maxMegapixels() * 1e6;
  scale = Math.min(scale, Math.sqrt(maxPx / Math.max(1, o.cssW * o.cssH)));
  return { scale, dither: scale < 0.75 * dpr ? 1.5 : 1 };
}
