import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import logoSvg from '../../assets/logo.svg?raw';
import { getPerfTier } from '../../shared/performanceTier';
import { MAP_BG } from './mapLooks';
import { buildStudioEnv, buildGround, buildLights } from './mapStudio';
import { buildEdgeLines } from './edgeLines';
import { splitConnectedParts } from './buildingSplit';
import { BuildingPicker } from './buildingPicker';
import { MapCamera } from './mapCamera';
import { BuildingDrawer } from './BuildingDrawer';

/**
 * Plan-oblique («military») projection: the camera is PERMANENTLY straight
 * top-down and never rotates. Cursor/touch input drives a pure shear instead:
 *
 *   x' = x + sx·y      z' = z + sz·y      (y untouched)
 *
 * Every horizontal section — every roof, at any height, of any shape — keeps
 * its exact undistorted plan drawing at all times; walls extrude as
 * parallelograms on the opposite side (references/perspective-guide.png).
 * Depth stays = height, so the z-buffer resolves the oblique view exactly.
 *
 * Buildings are recovered from the single-mesh GLB by connected-component
 * splitting (buildingSplit.ts) so each can be hovered and clicked.
 * Materials in mapLooks.ts, studio in mapStudio.ts; TUNING_LOG map rounds 4–7.
 */

const MODEL_GLB = '/resources/map.glb';
/** max shear (wall reveal per unit height) at the screen edge; ?ob=<k> */
const MAX_SHEAR = 0.55;
/** cursor deadzone around the center — inside it the view is a flat plan */
const DEADZONE = 0;
/** steepness of the shear onset: higher = full lean on a smaller cursor move,
 *  still hard-clamped at MAX_SHEAR */
const RESPONSE_GAIN = 5;
/** cursor smoothing time constant (s) — small = snappy follow */
const SMOOTH_TAU = 0.12;
/** breathing room around the worst-case (fully sheared) extent; ?fit=<k> */
const FIT_MARGIN = 0.95;
const CAMERA_DIST = 400;
const MODEL_SPAN = 300; // model normalized to this max horizontal dimension
const GROUND_SIZE = MODEL_SPAN * 5;

/** dihedral angle above which the exporter's smoothed normals are re-hardened.
 *  map.glb ships primitive 1 at 73.9% smooth-shaded — normals averaged across
 *  architectural corners — which is the main reason the geometry read mushy. */
const CREASE_DEG = 35;

export class ConceptScreen {
  el: HTMLElement;
  onNavigate: (to: 'main') => void = () => {};

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private mapCam = new MapCamera();
  private shearGroup = new THREE.Group();

  private model?: THREE.Object3D;
  private picker = new BuildingPicker();
  private drawer!: BuildingDrawer;

  private maxShear = MAX_SHEAR;
  private fitMargin = FIT_MARGIN;
  private raf = 0;
  private running = false;

  private inputX = 0;
  private inputY = 0;
  private smX = 0;
  private smY = 0;
  private dragging = false;
  private lastDrag = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.el = container;
    const q = new URLSearchParams(location.search);
    const ob = parseFloat(q.get('ob') ?? '');
    if (Number.isFinite(ob)) this.maxShear = ob;
    const fit = parseFloat(q.get('fit') ?? '');
    if (Number.isFinite(fit)) this.fitMargin = fit;
    this.buildDom();
    this.buildScene();
  }

  private buildDom() {
    this.el.innerHTML = '';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(getPerfTier().mapPixelRatio);
    this.renderer.setClearColor(MAP_BG, 1);
    // NOT NoToneMapping: the environment probe alone lands around 3.8 linear
    // (base 3.5 × envMapIntensity), so without a shoulder every lit face clips
    // flat to white and the key light can add brightness but no gradation —
    // which is what made the roofs read flat. Neutral (Khronos PBR Neutral)
    // rolls the 1–4 range off while preserving hue.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.el.appendChild(this.renderer.domElement);

    const add = (tag: string, cls: string, html: string) => {
      const n = document.createElement(tag);
      n.className = cls;
      n.innerHTML = html;
      this.el.appendChild(n);
      return n;
    };

    const home = add('a', 'concept-home', logoSvg) as HTMLAnchorElement;
    home.href = '#';
    home.setAttribute('aria-label', 'На главную');
    home.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('main');
    });
    add('div', 'concept-title', 'Концепция');
    add('div', 'concept-hint', 'Наведите на здание, чтобы узнать о резидентах');

    this.drawer = new BuildingDrawer(this.el);
    this.drawer.onClose = () => this.setSelected(null);
    this.picker.onHoverChange = (id) => this.el.classList.toggle('picking', id !== null);

    this.el.addEventListener('pointermove', (e) => {
      this.picker.setPointer(e.clientX, e.clientY);
      // the drawer must not steer the plan: the lean maps raw cursor position
      // to shear across the whole screen and DEADZONE is 0, so without this
      // the plan keeps tilting while you read the panel
      if (this.drawer.hovered) return;
      if (e.pointerType === 'touch') {
        if (!this.dragging) return;
        this.inputX += (e.clientX - this.lastDrag.x) / 240;
        this.inputY += (e.clientY - this.lastDrag.y) / 240;
        this.inputX = Math.max(-1, Math.min(1, this.inputX));
        this.inputY = Math.max(-1, Math.min(1, this.inputY));
        this.lastDrag = { x: e.clientX, y: e.clientY };
      } else {
        this.inputX = (e.clientX / innerWidth) * 2 - 1;
        this.inputY = (e.clientY / innerHeight) * 2 - 1;
      }
    });
    this.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.dragging = true;
        this.lastDrag = { x: e.clientX, y: e.clientY };
      }
    });
    addEventListener('pointerup', () => (this.dragging = false));
    // click a building to open its drawer; click empty space to dismiss
    this.el.addEventListener('click', () => {
      if (this.drawer.hovered) return;
      this.setSelected(this.picker.hoverId);
    });
  }

  private buildScene() {
    this.scene.background = new THREE.Color(MAP_BG);
    this.shearGroup.matrixAutoUpdate = false;
    this.scene.add(this.shearGroup);

    // The environment IS most of the specular: a top-down camera makes surfaces
    // mirror the probe, so its bright sources are what produce highlights.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = buildStudioEnv();
    this.scene.environment = pmrem.fromEquirectangular(env).texture;
    env.dispose();
    pmrem.dispose();

    for (const l of buildLights()) this.scene.add(l);
    this.scene.add(buildGround(GROUND_SIZE));

    new GLTFLoader().load(
      encodeURI(MODEL_GLB),
      (gltf) => this.onModelLoaded(gltf.scene),
      undefined,
      (err) => console.error('[kresty] GLB load failed', err)
    );

    this.mapCam.setDials(this.maxShear, this.fitMargin);
    this.resize();
  }

  private onModelLoaded(root: THREE.Object3D) {
    // re-harden the exporter's averaged normals so architectural corners shade
    // as corners again; genuinely curved surfaces stay smooth
    const source: THREE.BufferGeometry[] = [];
    const dead: THREE.Mesh[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      source.push(toCreasedNormals(mesh.geometry, (CREASE_DEG * Math.PI) / 180));
      dead.push(mesh);
    });
    for (const m of dead) {
      m.geometry.dispose();
      const old = m.material;
      Array.isArray(old) ? old.forEach((x) => x.dispose()) : old.dispose();
      m.removeFromParent();
    }

    // one mesh per building, all under the model root so they inherit the
    // normalize transform and the per-frame shear unchanged
    const parts = splitConnectedParts(source);
    for (const g of source) g.dispose();
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry);
      this.picker.add(mesh, part);
      root.add(mesh);
    }
    buildEdgeLines(root, this.picker.edge);
    console.info(`[kresty] map split into ${parts.length} buildings`);

    // normalize: center on origin, base at y=0, span = MODEL_SPAN
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = MODEL_SPAN / Math.max(size.x, size.z);
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    this.picker.setModelScale(scale);

    this.mapCam.setModelExtents((size.x * scale) / 2, (size.z * scale) / 2, size.y * scale);
    root.updateMatrix();
    this.mapCam.setModelMatrix(root.matrix);

    this.model = root;
    this.shearGroup.add(root);
    this.resize(); // frustum now fits the real bounds
    this.primeFrame();
  }

  /** single entry point for selection: drawer, dimming and the camera swing */
  private setSelected(id: string | null) {
    this.picker.select(id);
    if (id) this.drawer.open(id);
    else this.drawer.close();
    // the drawer animates open, so re-read its width next frame rather than
    // framing against a panel that is still sliding in
    requestAnimationFrame(() => {
      this.mapCam.setViewport(innerWidth, innerHeight, id ? this.drawer.width : 0);
      this.mapCam.focusOn(this.picker.part(id) ?? null);
    });
    this.el.classList.toggle('focused', id !== null);
  }

  // ------------------------------------------------------------------ frame

  resize = () => {
    this.renderer.setSize(innerWidth, innerHeight);
    this.picker.setResolution(innerWidth, innerHeight);
    // the drawer's real width, so the focus framing tracks the CSS (incl. its
    // max-width: 86vw clamp on narrow viewports)
    this.mapCam.setViewport(innerWidth, innerHeight, this.drawer.width);
    this.mapCam.snap();
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.el.classList.remove('hidden');
    addEventListener('resize', this.resize);
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      this.smX += (this.inputX - this.smX) * k;
      this.smY += (this.inputY - this.smY) * k;
      this.mapCam.update(dt);
      this.updateShear();
      this.picker.update(this.scene, this.mapCam.camera);
      this.renderer.render(this.scene, this.mapCam.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    this.picker.select(null);
    this.drawer.close();
    removeEventListener('resize', this.resize);
  }

  /** render a single frame even when paused (transition priming) */
  primeFrame() {
    this.mapCam.snap();
    this.updateShear();
    this.renderer.render(this.scene, this.mapCam.camera);
  }

  private updateShear() {
    // deadzone: flat plan until the cursor leaves the center
    const mag = Math.hypot(this.smX, this.smY);
    const raw = Math.min(1, Math.max(0, mag - DEADZONE) / (1 - DEADZONE));
    // saturating response: bites hard on a small cursor move, then flattens —
    // normalized so the screen edge still lands on exactly 1.0
    const resp =
      (1 - Math.exp(-RESPONSE_GAIN * raw)) / (1 - Math.exp(-RESPONSE_GAIN));
    // Unwind as the camera rotates: shear and camera rotation compound into a
    // skewed mess if both are applied at once, so the plan flattens on the way
    // to the isometric pose (and the lean is inert while focused).
    const amt = resp * this.maxShear * (1 - this.mapCam.focus);
    // roofs lean TOWARD the cursor → walls reveal on the far side
    // (screen x → world x, screen y → world z)
    const sx = mag > 1e-4 ? (this.smX / mag) * amt : 0;
    const sz = mag > 1e-4 ? (this.smY / mag) * amt : 0;

    this.shearGroup.matrix.set(
      1, sx, 0, 0,
      0, 1, 0, 0,
      0, sz, 1, 0,
      0, 0, 0, 1
    );
    this.shearGroup.matrixWorldNeedsUpdate = true;
  }
}
