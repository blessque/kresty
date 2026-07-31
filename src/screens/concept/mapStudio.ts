import * as THREE from 'three';
import { MAP_BG } from './mapLooks';

/**
 * The studio the «Концепция» map is shot in: light rig, environment probe and
 * ground plate. Separated from mapLooks.ts (which owns the material) because
 * this is the room, not the object.
 */

/** ground plate radial vignette: centre → rim. Deliberately higher contrast
 *  than the background — the glass refracts this plate, so its gradient is the
 *  tonal variation you see THROUGH the buildings. A flat plate makes every
 *  volume read as one dead tone. */
/* Round 9.1: sampled from the designer's snapshot. This plate IS the site's
   ground — the GLB carries no surface for the site itself, only for the river,
   the streets and the neighbouring blocks — so its tone sets what the buildings
   stand on, and the plan's ramp is calibrated against it. */
const GROUND_CENTRE = '#dde6e9';
const GROUND_RIM = '#dde6e9';

// ---------------------------------------------------------------- light rig

/**
 * World-fixed key/fill/rim. These are added to the SCENE, not the shear group,
 * so as the model leans the revealed walls turn into and out of the key —
 * lighting that responds to the interaction instead of riding along with it.
 * Screen mapping under this camera: +X = right, −Z = up.
 */
export function buildLights(): THREE.Light[] {
  // RAKING key, ~24° elevation. The previous rig sat at (-220, 320, -180) —
  // above 50° — so light arrived almost perpendicular to every roof and no
  // face had a lit side or a shadow side. Low and lateral makes walls and
  // pitched slopes split sharply, while keeping enough height that flat roofs
  // still receive real light instead of going dead.
  // Intensity has to COMPETE with the environment probe, which is the real
  // reason roofs read flat: buildStudioEnv's base luminance is 3.5 and it is
  // omnidirectional, so it floods every face equally. A key below that value
  // just tints an already-flooded surface. This is the dial to raise if the
  // model still looks flat — not the angle.
  const key = new THREE.DirectionalLight(0xfff6e8, 4.2);
  key.position.set(-300, 170, -230);

  // Fill is deliberately weak: it exists to keep the shadow side from crushing
  // to black, NOT to even the scene out. Too strong and it washes the raking
  // contrast straight back out — which is what made the roofs read flat.
  const fill = new THREE.DirectionalLight(0xbcd9f5, 0.4);
  fill.position.set(260, 120, 190);

  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(40, 55, 300); // grazing from screen-bottom, catches edges

  return [key, fill, rim];
}

// ---------------------------------------------------------------- environment

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Studio environment probe, authored as an HDR DataTexture.
 *
 * It MUST be float data, not a canvas: the bright sources carry values well
 * above 1.0, and that overdrive is what makes speculars blow out white instead
 * of reading as light grey. A CanvasTexture clamps at 1.0 and can only ever
 * produce the soft, flat shading the previous gradient probe gave.
 *
 * Two source shapes:
 * - rectangular "softboxes" — the crisp streaks of a studio glass render;
 * - CROSS-shaped emitters — the project's own motif (the prison is cross-
 *   shaped, the hero screen is light through a cross grille), so the glass
 *   throws cross glints echoing the reference's X-streaks.
 *
 * Note under this camera: an orthographic top-down view gives every FLAT roof
 * the same reflection vector, so flat roofs sample one texel and stay evenly
 * toned. The sources show up on pitched roofs, curved surfaces, creased detail
 * and the walls the shear reveals — which is where the geometry reads anyway.
 */
export function buildStudioEnv(): THREE.DataTexture {
  const W = 256;
  const H = 128;
  const data = new Float32Array(W * H * 4);

  // base: bright near-white overhead falling off toward the nadir
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // 0 = zenith
    const t = Math.pow(v, 0.85);
    const lum = 3.5 * (1 - t) + 0.3 * t;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = lum * 0.97;
      data[i + 1] = lum * 0.99;
      data[i + 2] = lum;
      data[i + 3] = 1;
    }
  }

  /** additive soft-edged rectangle in (u, v) space; u wraps */
  const rect = (
    cu: number, cv: number,
    hu: number, hv: number,
    gain: number,
    tint: [number, number, number] = [1, 1, 1]
  ) => {
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      const dv = Math.abs(v - cv);
      if (dv > hv) continue;
      const wy = 1 - smoothstep(hv * 0.55, hv, dv);
      for (let x = 0; x < W; x++) {
        const u = x / W;
        let du = Math.abs(u - cu);
        if (du > 0.5) du = 1 - du; // wrap around the seam
        if (du > hu) continue;
        const wx = 1 - smoothstep(hu * 0.55, hu, du);
        const w = wx * wy * gain;
        const i = (y * W + x) * 4;
        data[i] += w * tint[0];
        data[i + 1] += w * tint[1];
        data[i + 2] += w * tint[2];
      }
    }
  };

  /** additive cross/plus emitter — the Кресты motif, thrown as a glint */
  const cross = (
    cu: number, cv: number,
    arm: number, thick: number,
    gain: number,
    tint: [number, number, number] = [1, 1, 1]
  ) => {
    rect(cu, cv, arm, thick, gain, tint);
    rect(cu, cv, thick, arm, gain, tint);
  };

  // Placement is dictated by what this camera can actually see reflected:
  // - a FLAT roof reflects exactly the zenith (v = 0), so sources there would
  //   brighten every roof identically rather than glint — the zenith stays
  //   plain base gradient;
  // - pitched roofs and creased detail sample a ring a few degrees off zenith;
  // - a wall tilted by the shear (atan 0.8 ≈ 39°) reflects to just BELOW the
  //   horizon, so that band is what makes revealed walls flash.
  cross(0.18, 0.09, 0.075, 0.016, 30);
  cross(0.68, 0.15, 0.055, 0.012, 20);
  rect(0.42, 0.24, 0.05, 0.045, 15);
  // the wall band — strongest sources, this is where the geometry reveals
  cross(0.86, 0.56, 0.06, 0.014, 22, [1, 0.99, 0.96]);
  rect(0.06, 0.58, 0.05, 0.03, 16, [0.94, 0.97, 1]);
  rect(0.5, 0.53, 0.04, 0.022, 12);

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  // float data is authored in LINEAR values — do NOT tag it sRGB
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// --------------------------------------------------------------------- ground

/**
 * Opaque plate under the model — the only thing the glass can actually
 * refract, since transmissive meshes are invisible to each other. A flat
 * colour would bend indistinguishably from the background, so it carries a
 * radial vignette. Unlit so the key light cannot burn a hotspot into it.
 */
export function buildGround(size: number): THREE.Mesh {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, GROUND_CENTRE);
  g.addColorStop(0.5, GROUND_RIM);
  g.addColorStop(1, '#' + MAP_BG.toString(16).padStart(6, '0'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    // toneMapped:false for the same reason as the plan surfaces (groundPlan.ts):
    // NeutralToneMapping would darken this plate while MAP_BG, written as the
    // clear colour, is untouched — putting the ground and the field in two
    // different tonal spaces. That is exactly why the old #ffffff plate read as
    // a mid grey on screen.
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.5; // just under the model base
  return mesh;
}
