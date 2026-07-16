import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import logoSvg from '../../assets/logo.svg?raw';
import { getPerfTier } from '../../shared/performanceTier';

/**
 * Plan-oblique («military») projection: the camera is PERMANENTLY straight
 * top-down and never rotates. Cursor/touch tilt drives a pure shear on the
 * model instead:
 *
 *   x' = x + sx·y      z' = z + sz·y      (y untouched)
 *
 * Every horizontal section — every roof, at any height, of any shape — keeps
 * its exact undistorted plan drawing at all times; walls extrude as
 * parallelograms on the opposite side (reference:
 * references/perspective-guide.png). Depth stays = height, so the z-buffer
 * resolves the oblique view's occlusion exactly. No geometry processing,
 * no shader patches.
 */
/** max shear (wall reveal per unit height) when the cursor is at the edge;
 *  ?ob=<k> URL override for tuning */
const MAX_SHEAR = 0.55;
/** cursor deadzone around the center — inside it the view is a flat plan */
const DEADZONE = 0.08;
const CAMERA_DIST = 400;
const MODEL_SPAN = 300; // model normalized to this max dimension

export class ConceptScreen {
  el: HTMLElement;
  onNavigate: (to: 'main') => void = () => {};

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.OrthographicCamera;
  private shearGroup = new THREE.Group();
  private maxShear = MAX_SHEAR;
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
    const ob = parseFloat(new URLSearchParams(location.search).get('ob') ?? '');
    if (Number.isFinite(ob)) this.maxShear = ob;
    this.buildDom();
    this.buildScene();
  }

  private buildDom() {
    this.el.innerHTML = '';

    const tier = getPerfTier();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(tier.mapPixelRatio);
    this.renderer.setClearColor(0x000000, 0);
    this.el.appendChild(this.renderer.domElement);

    const home = document.createElement('a');
    home.className = 'concept-home';
    home.href = '#';
    home.innerHTML = logoSvg;
    home.setAttribute('aria-label', 'На главную');
    home.addEventListener('click', (e) => {
      e.preventDefault();
      this.onNavigate('main');
    });
    this.el.appendChild(home);

    const title = document.createElement('div');
    title.className = 'concept-title';
    title.textContent = 'Концепция';
    this.el.appendChild(title);

    const hint = document.createElement('div');
    hint.className = 'concept-hint';
    hint.textContent = 'Отведите курсор от центра, чтобы наклонить план';
    this.el.appendChild(hint);

    this.el.addEventListener('pointermove', (e) => {
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
  }

  private buildScene() {
    // lights for whatever materials the GLB carries
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8fc4e2, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(180, 320, 120);
    this.scene.add(sun);

    this.shearGroup.matrixAutoUpdate = false;
    this.scene.add(this.shearGroup);

    const loader = new GLTFLoader();
    loader.load(
      encodeURI('/resources/scene.glb'),
      (gltf) => {
        const root = gltf.scene;

        // normalize: center on origin, base at y=0, span = MODEL_SPAN
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = MODEL_SPAN / Math.max(size.x, size.z);
        root.scale.setScalar(scale);
        root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        this.shearGroup.add(root);
        this.primeFrame();
      },
      undefined,
      (err) => console.error('[kresty] GLB load failed', err)
    );

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1500);
    this.camera.up.set(0, 0, -1); // north up on screen when looking straight down
    this.camera.position.set(0, CAMERA_DIST, 0);
    this.camera.lookAt(0, 0, 0);
    this.resize();
  }

  resize = () => {
    this.renderer.setSize(innerWidth, innerHeight);
    const aspect = innerWidth / innerHeight;
    const halfH = MODEL_SPAN * 0.62;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
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
      this.update(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    removeEventListener('resize', this.resize);
  }

  /** render a single frame even when paused (transition priming) */
  primeFrame() {
    this.updateShear();
    this.renderer.render(this.scene, this.camera);
  }

  private update(dt: number) {
    const k = 1 - Math.exp(-dt / 0.25);
    this.smX += (this.inputX - this.smX) * k;
    this.smY += (this.inputY - this.smY) * k;
    this.updateShear();
    this.renderer.render(this.scene, this.camera);
  }

  private updateShear() {
    // deadzone: flat plan until the cursor leaves the center
    const mag = Math.hypot(this.smX, this.smY);
    const eased = Math.max(0, mag - DEADZONE) / (1 - DEADZONE);
    const amt = Math.min(1, eased) * this.maxShear;
    // roofs lean TOWARD the cursor → walls reveal on the far side
    // (screen x → world x, screen y → world z; guide: mouse up ⇒ bottom walls)
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
