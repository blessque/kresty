import crossSvg from '../../assets/cross-vector.svg?raw';

/**
 * The light's understudy: the designer's flat vector, for the white field.
 *
 * The shader canvas composites `mix-blend-mode: screen` — `1 − (1−a)(1−b)`,
 * which can only LIGHTEN. On white there is nothing left to lighten into, so the
 * light does not merely get faint, it is mathematically absent. «О Крестах»
 * records that coupling as a constraint on its palette; this page walks into it
 * deliberately, and so it needs something to hand over to.
 *
 * ── this is NOT `sign.svg` rescaled, which was the first assumption ─────────
 * The two carry the same motif and it is tempting to reuse the hero's emblem
 * and get the crossfade for free. Measured, they are drawn to different
 * proportions: the wedges are 3.5 % of the span in `sign.svg` and 2.4 % in this
 * one, so the vector's rays are noticeably finer. Substituting the hero's file
 * put visibly fatter rays on the white section than the frame draws. The
 * designer's own asset is the one that ships.
 *
 * ── why it is re-framed rather than used as delivered ──────────────────────
 * `references/cross-vector-big.svg` is cropped to what the frame shows: a
 * `0 0 545 1135` window onto a cross whose centre sits at (−155, 435), i.e.
 * off the window's left edge. That is fine for a still image and useless here,
 * because rotating a pre-cropped half rotates its straight cut edge into view.
 *
 * `assets/cross-vector.svg` is the same nine paths, byte for byte, with the
 * viewBox opened up to the drawing's own 1400×1400 bounding box
 * (`-855 -265 1400 1400`). So the emblem is centred on its own centre, CSS puts
 * that centre on x = 0, and the VIEWPORT does the cropping — which is exactly
 * what the shader's convergence point at x = 0 does to the light.
 *
 * ── what the two DO share, and what they do not ────────────────────────────
 * Centre, footprint and direction of travel: those are what make the handover
 * read as one object changing medium. Their individual ray angles do NOT match
 * and cannot be made to — the drawings differ, and the mask is additionally
 * uploaded Y-flipped, which mirrors the light's rays about the horizontal.
 * Measured on a circle around the convergence point, the light's sit at about
 * −56/−15/−7/+11/+17° where the vector's sit at ±18/±27/±63/±72°. The crossfade
 * is therefore a dissolve between two drawings of one motif, not a morph, and
 * it runs over a 0.6-viewport band during which the angle moves ~10°.
 *
 * The DIRECTION is the part that had to be fixed rather than accepted — see the
 * negation in `MuseumScreen`'s frame loop.
 */
export function buildVectorCross(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'museum-cross';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = crossSvg;
  return el;
}
