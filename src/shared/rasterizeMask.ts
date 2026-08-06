/**
 * Rasterizes an SVG into the three-channel mask texture sampled by the ray
 * field's slit path (`slitLight()` in both shader twins):
 *
 *   R = crisp antialiased shape  — the «Прорезь» readable core
 *   G = a round blur             — feeds the bloom halo
 *   B = a RADIAL smear           — the shape drawn at several scales about the
 *                                  centre and averaged; feeds the god-ray march
 *
 * Why three channels: a handful of sparse jittered taps against a hard-edged
 * mask has huge per-pixel variance (heavy stipple noise), but a round pre-blur
 * also melts the razor-sharp tangential edges of the light trails. The march
 * integrates the mask RADIALLY, so smearing only along that direction removes
 * the variance the march sees while keeping the trail edges razor sharp — and
 * the smear length grows with radius exactly like the march step does.
 *
 * Opaque black background (no premultiply concerns), and the shape must end up
 * centred: the shader maps the TEXTURE CENTRE to the convergence point, so an
 * off-centre drawing throws the light off-centre.
 *
 * This was `MainScreen.rasterizeSign()` until the «Контакты» showcase needed
 * the same pipeline for arbitrary icons. It lives in `shared/` because it
 * imports nothing internal. **Called with no options it is byte-identical to
 * the original**: the placement rect below degenerates to the full canvas and
 * every draw call is the one it always was. The main screen depends on that.
 */

export interface RasterizeMaskOptions {
  /** `src` is SVG markup to be blob-URL'd, rather than a URL to fetch */
  raw?: boolean;
  /** texture edge, px */
  size?: number;
  /**
   * Fit the drawing's MEASURED content box to this fraction of the texture,
   * centred on its own ink rather than on its viewBox. Omit to draw the source
   * edge-to-edge (what `sign.svg` wants — it carries its own margin).
   *
   * Needed for arbitrary icons for two reasons. `signMask()` returns a hard 0
   * outside [0,1] (a deliberate guard so CLAMP_TO_EDGE cannot smear), so a
   * shape sitting near its viewBox edge gets its bloom cut along a straight
   * line. And icons authored with different margins otherwise render at
   * visibly different optical sizes.
   */
  contentFrac?: number;
  /**
   * Draw the source vertically mirrored.
   *
   * BOTH renderers upload this texture with a Y-flip
   * (`UNPACK_FLIP_Y_WEBGL = true` / `flipY: true`), which puts the canvas's
   * BOTTOM row at v=0 — while the shader samples with `uv0 = 0.5 + p/S` where
   * `p.y` runs DOWNWARD. Screen-top therefore reads texture-bottom and every
   * mask renders vertically mirrored, `sign.svg` included; it went unnoticed
   * because a mirrored starburst still looks like a starburst.
   *
   * Setting this pre-mirrors the source so the two flips cancel. Default false
   * keeps the hero byte-identical — correcting the renderers instead would
   * re-orient the emblem on a branch awaiting the client's verdict.
   *
   * Note this is a MIRROR, not a 180° rotation: rotating would move an
   * asymmetric detail (Cup's handle, Bed's headboard) to the wrong side.
   */
  flipY?: boolean;
}

/** where the source image is drawn inside the texture, px */
interface Placement {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

function loadImage(src: string, raw: boolean): Promise<HTMLImageElement> {
  const url = raw ? URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' })) : src;
  const img = new Image();
  const done = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`mask source failed to load: ${raw ? '<raw svg>' : src}`));
    img.src = url;
  });
  // the blob URL is only needed until decode finishes; a plain URL is not ours
  return raw ? done.finally(() => URL.revokeObjectURL(url)) : done;
}

function makeCtx(size: number): CanvasRenderingContext2D {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  return ctx;
}

/**
 * Measures the drawn ink box and returns the placement that scales it to
 * `frac` of the texture and centres it. Falls back to full-bleed if the
 * drawing is empty (nothing to measure — better a mask than an exception).
 */
function fitToContent(img: HTMLImageElement, size: number, frac: number): Placement {
  const full: Placement = { dx: 0, dy: 0, dw: size, dh: size };
  const ctx = makeCtx(size);
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // white-on-black, so the red channel IS the coverage; the threshold skips
  // the antialiasing dust that would otherwise inflate the box by a pixel
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return full;

  // preserve aspect: the LONGER side spans `frac`, so a wide icon and a tall
  // one read at the same optical size
  const span = Math.max(maxX - minX + 1, maxY - minY + 1);
  const k = (frac * size) / span;
  const dw = size * k;
  const dh = size * k;
  // put the ink's centre — not the viewBox's — on the texture centre
  const cx = (minX + maxX + 1) / 2 / size;
  const cy = (minY + maxY + 1) / 2 / size;
  return { dx: size / 2 - cx * dw, dy: size / 2 - cy * dh, dw, dh };
}

/**
 * Mean ink coverage of a finished mask, 0..1 — the quantity the god-ray march
 * actually integrates.
 *
 * The march accumulates `signMaskRay` along each ray and divides by the step
 * count, so its output is very nearly LINEAR in this number. That makes the
 * light's brightness a property of how much ink the artwork has, not of the
 * preset: `sign.svg` is a starburst of thin slivers averaging 0.081, while a
 * solid icon silhouette averages 0.17–0.29 and therefore renders 2–3.6× too
 * hot on the same uniforms. Divide the preset's `godrays`/`bloom` by the ratio
 * to put an arbitrary shape back at the hero's exposure.
 */
export function maskCoverage(cv: HTMLCanvasElement): number {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 1;
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i];
  return sum / (data.length / 4) / 255;
}

/**
 * Draws the source at `p`, optionally mirrored about the texture's horizontal
 * centre line. Safe to combine with `contentFrac`: that path always lands the
 * ink's centre ON the texture centre, and mirroring about that same centre
 * leaves it there — so measuring before flipping is correct.
 */
function drawSource(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: Placement,
  size: number,
  flipY: boolean,
) {
  if (!flipY) {
    ctx.drawImage(img, p.dx, p.dy, p.dw, p.dh);
    return;
  }
  ctx.save();
  ctx.translate(0, size);
  ctx.scale(1, -1);
  ctx.drawImage(img, p.dx, p.dy, p.dw, p.dh);
  ctx.restore();
}

/**
 * The mask's R channel IS the crisp, normalised, centred artwork — so the
 * showcase's "show me the actual SVG on top" overlay is built from it rather
 * than from the source file. That makes the overlay align with the light BY
 * CONSTRUCTION (same footprint, same centre) instead of having to re-derive
 * each icon's viewBox margin. Returns a white image whose alpha is the ink.
 */
export function maskToOverlayUrl(cv: HTMLCanvasElement): string {
  const src = cv.getContext('2d', { willReadFrequently: true });
  if (!src) return '';
  const { data } = src.getImageData(0, 0, cv.width, cv.height);
  const out = document.createElement('canvas');
  out.width = cv.width;
  out.height = cv.height;
  const octx = out.getContext('2d');
  if (!octx) return '';
  const img = octx.createImageData(cv.width, cv.height);
  for (let i = 0; i < data.length; i += 4) {
    img.data[i] = 255;
    img.data[i + 1] = 255;
    img.data[i + 2] = 255;
    img.data[i + 3] = data[i]; // alpha from the crisp channel
  }
  octx.putImageData(img, 0, 0);
  return out.toDataURL('image/png');
}

/** the placement scaled about the TEXTURE centre — the radial smear's axis */
function scaledAboutCentre(p: Placement, size: number, s: number): Placement {
  const c = size / 2;
  return {
    dx: c + (p.dx - c) * s,
    dy: c + (p.dy - c) * s,
    dw: p.dw * s,
    dh: p.dh * s,
  };
}

export async function rasterizeMask(
  src: string,
  opts: RasterizeMaskOptions = {},
): Promise<HTMLCanvasElement> {
  const size = opts.size ?? 640;
  const img = await loadImage(src, opts.raw ?? false);

  const place: Placement =
    opts.contentFrac !== undefined
      ? fitToContent(img, size, opts.contentFrac)
      : { dx: 0, dy: 0, dw: size, dh: size };

  const flipY = opts.flipY ?? false;
  const draw = (blurPx: number) => {
    const ctx = makeCtx(size);
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    drawSource(ctx, img, place, size, flipY);
    return ctx.getImageData(0, 0, size, size);
  };
  // radial smear: K scaled copies about the centre, additively averaged
  // (a tiny fixed blur keeps a smoothing floor near the centre, where the
  // scale steps barely move the strokes)
  const smearDraw = () => {
    const ctx = makeCtx(size);
    const K = 13;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 / K;
    ctx.filter = 'blur(1.5px)';
    for (let k = 0; k < K; k++) {
      const s = 0.965 + (0.07 * k) / (K - 1); // 0.965 .. 1.035
      const q = scaledAboutCentre(place, size, s);
      drawSource(ctx, img, q, size, flipY);
    }
    return ctx.getImageData(0, 0, size, size);
  };

  const crisp = draw(0);
  const soft = draw(6);
  const smear = smearDraw();
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const out = ctx.createImageData(size, size);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = crisp.data[i]; // R: crisp shape (core)
    out.data[i + 1] = soft.data[i]; // G: round blur (bloom halo)
    out.data[i + 2] = smear.data[i]; // B: radial smear (god-ray march)
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return cv;
}
