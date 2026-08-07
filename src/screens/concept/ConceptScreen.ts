import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import logoSvg from '../../assets/logo.svg?raw';
import { getPerfTier } from '../../shared/performanceTier';
import { asset } from '../../shared/assetUrl';
import { MAP_BG } from './mapLooks';
import { buildStudioEnv, buildGround, buildLights } from './mapStudio';
import { buildEdgeLines } from './edgeLines';
import { splitConnectedParts } from './buildingSplit';
import { GroundPlan, FLAT_RATIO, type FlatSurface } from './groundPlan';
import { MapLabels } from './mapLabels';
import { BuildingPicker } from './buildingPicker';
import { MapCamera } from './mapCamera';
import { BuildingDrawer } from './BuildingDrawer';
import { MapInfo } from './MapInfo';
import { MapScroll, STAGE_VH } from './mapScroll';
import { ResidentSections } from './residentSections';

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

const MODEL_GLB = asset('/resources/map-w-river.glb');
/**
 * Yaw applied to the whole model, so the SITE GRID is square to the screen.
 *
 * The GLB is authored on the site's own grid, not on the compass: the Neva
 * slab lies entirely on the local −X side and both roads (Арсенальная наб.,
 * ул. Комсомола) run along local ±Y. So the model arrives with south pointing
 * up and needs a half turn. Baked into the geometry at load, so every
 * downstream bbox, centroid and axisAngle is already in the final world frame.
 *
 * ROUND 12: GEOGRAPHIC NORTH IS DELIBERATELY ABANDONED. This used to be 189°
 * = a half turn + 9° for the street grid's real bearing, which put north up
 * the screen (checked against the Yandex plan two independent ways — the
 * shoreline bearing and the axis joining the two cross blocks — agreeing to
 * under a degree). But the site grid runs 9° off north, so north-up delivered
 * the embankment and the shoreline as slightly tilted lines, and a schematic
 * wants them level. The designer measured the correction in Figma as −9.05°.
 *
 * Dropping the 9° returns the model to the grid it was drawn on, which is
 * axis-aligned by construction — which is why the answer is exactly 180.00°
 * and not 179.95°. Measured on the GLB's boundary edges (edges used by a
 * single triangle, so triangulation diagonals don't pollute the reading):
 * at 189° the Арсенальная наб. edge and the shoreline segments both sit at
 * −9.00°; at 180° both measure 0.00°. The Figma reading's 0.05 is noise.
 *
 * Dev override: ?yaw=<degrees> — ?yaw=189 restores true north.
 */
const MODEL_YAW_DEG = 180;
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
  private scroll!: MapScroll;
  private sections!: ResidentSections;
  private picker = new BuildingPicker();
  private ground?: GroundPlan;
  private labels!: MapLabels;
  private drawer!: BuildingDrawer;
  private mapInfo!: MapInfo;
  private panel?: import('./WaterPanel').WaterPanel;

  private maxShear = MAX_SHEAR;
  private fitMargin = FIT_MARGIN;
  private yawDeg = MODEL_YAW_DEG;
  private stageVh = STAGE_VH;
  private raf = 0;
  private running = false;

  /** the river's own clock — an accumulator, not performance.now, so the admin
   *  panel can slow it or freeze it without the surface jumping phase */
  private waterT = 0;
  private timeScale = 1;
  private fpsFrames = 0;
  private fpsSince = 0;

  private inputX = 0;
  private inputY = 0;
  private smX = 0;
  private smY = 0;
  private dragging = false;
  private lastDrag = { x: 0, y: 0 };
  /** last cursor position in WINDOW coordinates; off-screen until the first move */
  private cursor = { x: -9999, y: -9999 };

  constructor(container: HTMLElement) {
    this.el = container;
    const q = new URLSearchParams(location.search);
    const ob = parseFloat(q.get('ob') ?? '');
    if (Number.isFinite(ob)) this.maxShear = ob;
    const fit = parseFloat(q.get('fit') ?? '');
    if (Number.isFinite(fit)) this.fitMargin = fit;
    const yaw = parseFloat(q.get('yaw') ?? '');
    if (Number.isFinite(yaw)) this.yawDeg = yaw;
    const vh = parseFloat(q.get('vh') ?? '');
    if (Number.isFinite(vh)) this.stageVh = vh;
    this.buildDom();
    this.buildScene();
    // a boolean flag, not a dial: `?admin`, `?admin=1` and `?admin=yes` all open
    // it. Only an explicit `?admin=0` keeps it shut. (`get` returns '' for the
    // bare form and null when the key is absent — the two must not be conflated.)
    const admin = q.get('admin');
    if (admin !== null && admin !== '0') void this.openAdmin();
  }

  /**
   * The water tuning panel — DYNAMICALLY imported, so Vite splits it and its
   * stylesheet into a chunk a normal load never fetches. Gating the constructor
   * behind a flag would still ship the code to every client demo.
   */
  private async openAdmin() {
    const { WaterPanel } = await import('./WaterPanel');
    this.panel = new WaterPanel(this.el, {
      apply: (p) => {
        this.ground?.river?.setParams(p);
        this.ground?.setWaterColor(p.color);
      },
      setPixelRatio: (r) => {
        this.renderer.setPixelRatio(r);
        this.resize();
      },
      setTimeScale: (k) => (this.timeScale = k),
      scrollToRiver: () => this.scroll.toBottom(),
    });
    // the GLB may still be loading, in which case `ground` did not exist above
    this.pushWaterParams();
  }

  /** re-push once the model exists, so a stored tuning survives a reload */
  private pushWaterParams() {
    const p = this.panel?.params;
    if (!p || !this.ground) return;
    this.ground.river?.setParams(p);
    this.ground.setWaterColor(p.color);
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
    // The canvas and the caption layer go INSIDE the scroller; everything else
    // built below stays a direct child of the screen and therefore stays
    // pinned. See mapScroll.ts.
    this.scroll = new MapScroll(this.el, this.stageVh);
    this.scroll.stage.appendChild(this.renderer.domElement);
    // the resident sections go INTO the scroller, after the map stage; their
    // background plate and their light canvas go outside it, pinned. Round 16.
    this.sections = new ResidentSections(this.el, this.scroll.scroller);

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
    // round 10: the «Концепция» corner title is gone at the designer's request,
    // and the standing hint moved into the left rail under the logo, where it
    // doubles as the hover read-out.
    this.mapInfo = new MapInfo(this.el);

    // in the STAGE, not the screen: a caption is welded to the map and has to
    // scroll with it
    this.labels = new MapLabels(this.scroll.stage, this.el);
    this.drawer = new BuildingDrawer(this.el);
    this.drawer.onClose = () => this.setSelected(null);
    this.picker.onHoverChange = (id) => {
      this.el.classList.toggle('picking', id !== null);
      this.mapInfo.setHovered(id);
    };

    this.el.addEventListener('pointermove', (e) => {
      // Kept in WINDOW coordinates and converted per frame (see the loop): the
      // stage scrolls under a stationary cursor, so the picked building changes
      // without a pointermove — exactly like the shear moving geometry, which
      // is why picking already runs per frame rather than per event.
      this.cursor.x = e.clientX;
      this.cursor.y = e.clientY;
      // the drawer must not steer the plan: the lean maps raw cursor position
      // to shear across the whole screen and DEADZONE is 0, so without this
      // the plan keeps tilting while you read the panel
      if (this.drawer.hovered) return;
      if (e.pointerType === 'touch') {
        if (!this.dragging) return;
        // ROUND 16: HORIZONTAL ONLY on touch. The scroller now owns vertical
        // drag (`touch-action: pan-y`) because the resident sections are below
        // the map and were otherwise unreachable on a phone. Keeping the
        // vertical term here would lean the plan while the reader scrolls past
        // it, which reads as the map fighting the page.
        this.inputX += (e.clientX - this.lastDrag.x) / 240;
        this.inputX = Math.max(-1, Math.min(1, this.inputX));
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
    // The node transform must be BAKED, not discarded. map-w-river.glb is a
    // Blender Z-up export whose entire orientation lives in the node quaternion
    // ([0.5,−0.5,0.5,0.5], i.e. local +Z → world −Y) while everything below
    // this point works in one flat local space — without this the model loads
    // on its side. (The previous map.glb happened to ship Y-up geometry, which
    // is the only reason nothing needed it before.)
    //
    // The north yaw rides in the SAME matrix on purpose: baking it means every
    // bbox, centroid and BuildingPart.axisAngle downstream is already in the
    // final world frame, so no consumer needs yaw bookkeeping. MapCamera's
    // focus azimuth in particular reads axisAngle as a world angle.
    root.updateMatrixWorld(true);
    const yaw = new THREE.Matrix4().makeRotationY((this.yawDeg * Math.PI) / 180);
    const bake = new THREE.Matrix4();

    const volumes: THREE.BufferGeometry[] = [];
    const flats: FlatSurface[] = [];
    const dead: THREE.Mesh[] = [];
    const size = new THREE.Vector3();

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      dead.push(mesh);
      const geo = mesh.geometry
        .clone()
        .applyMatrix4(bake.multiplyMatrices(yaw, mesh.matrixWorld));
      geo.computeBoundingBox();
      geo.boundingBox!.getSize(size);
      // Flatness is decided geometrically but TONED by material name: the GLB
      // ships one material per surface class, and nothing about a polygon's
      // shape says whether it is a river or a road.
      if (size.y < FLAT_RATIO * Math.max(size.x, size.z)) {
        flats.push({ materialName: materialName(mesh), geometry: geo });
      } else {
        // re-harden the exporter's averaged normals so architectural corners
        // shade as corners again; genuinely curved surfaces stay smooth
        volumes.push(toCreasedNormals(geo, (CREASE_DEG * Math.PI) / 180));
        geo.dispose();
      }
    });
    for (const m of dead) {
      m.geometry.dispose();
      const old = m.material;
      Array.isArray(old) ? old.forEach((x) => x.dispose()) : old.dispose();
      m.removeFromParent();
    }

    // Buildings and plan go in SEPARATE groups: edge lines are built by
    // traversal, and the plan must not get them — a white contour is invisible
    // on the near-white roads and far too loud on the water.
    const buildings = new THREE.Group();
    const parts = splitConnectedParts(volumes);
    for (const g of volumes) g.dispose();
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry);
      this.picker.add(mesh, part);
      buildings.add(mesh);
    }
    buildEdgeLines(buildings, this.picker.edge);
    root.add(buildings);

    this.ground = new GroundPlan(flats);
    root.add(this.ground.group);
    console.info(
      `[kresty] map: ${parts.length} buildings, ${flats.length} flat surfaces`
    );

    // Normalize on the BUILDINGS alone. The plan spans ~3× their footprint (the
    // Neva slab reaches far off-site), so measuring the whole root would
    // silently shrink the volumes to a third of the size MAX_SHEAR and
    // FIT_MARGIN were tuned against. The plan is meant to bleed off every edge.
    //
    // …and on the VOLUMES alone within that. `b18`, the pier, is a 0.09-tall
    // slab standing out in the river, far past the embankment — plan furniture
    // wearing a building's clothes. It contributed nothing to the drawing and
    // 20 % of the framed height, which is why the cluster read small with wide
    // empty margins (round 13). See FIT_HEIGHT_FRAC.
    const box = massedBox(parts);
    const bsize = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = MODEL_SPAN / Math.max(bsize.x, bsize.z);

    // The base must land on the SHEAR-INVARIANT plane y = 0 — that plane is the
    // entire mechanism keeping the plan undistorted (see groundPlan.ts). Take
    // it from the flat surfaces themselves, not from the buildings' minimum, so
    // an export whose foundations dip below grade cannot drag the plan off it.
    const groundY = flats.length
      ? new THREE.Box3().setFromObject(this.ground.group).min.y
      : box.min.y;

    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -groundY * scale, -center.z * scale);
    this.picker.setModelScale(scale);

    this.mapCam.setModelExtents(
      (bsize.x * scale) / 2,
      (bsize.z * scale) / 2,
      (box.max.y - groundY) * scale
    );
    root.updateMatrix();
    this.mapCam.setModelMatrix(root.matrix);
    // after root.updateMatrix(): the captions project world-space anchors, so
    // they need the normalize transform that is only final at this point
    this.labels.build(flats, parts, root.matrix, Math.max(bsize.x, bsize.z));

    this.model = root;
    this.shearGroup.add(root);
    this.resize(); // frustum now fits the real bounds
    // the panel may have opened before the GLB arrived — its stored tuning has
    // nothing to write to until now
    this.pushWaterParams();
    this.primeFrame();
  }

  /** single entry point for selection: drawer, dimming and the camera swing */
  private setSelected(id: string | null) {
    this.picker.select(id);
    if (id) this.drawer.open(id);
    else this.drawer.close();
    // the drawer takes over the read-out while focused, and it occupies the
    // same left column — the rail would sit underneath it
    this.mapInfo.setMuted(id !== null);
    // the isometric framing assumes the window, so pin the view to the top for
    // as long as a building is focused
    this.scroll.lock(id !== null);
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
    // Back to the top FIRST: the caption solve that follows measures the
    // window-pinned chrome as obstacles, and the resting composition is the one
    // the design is judged in.
    this.scroll.reset();
    // The canvas is the STAGE, 1.5x the window's height (mapScroll.ts) — but
    // the camera's FIT stays measured against the window, or the taller aspect
    // would silently re-zoom the map. setOverscan carries the difference.
    const { stageW, stageH } = this.scroll;
    this.renderer.setSize(stageW, stageH);
    this.picker.setResolution(stageW, stageH);
    // the drawer's real width, so the focus framing tracks the CSS (incl. its
    // max-width: 86vw clamp on narrow viewports)
    this.mapCam.setViewport(innerWidth, innerHeight, this.drawer.width);
    this.mapCam.setOverscan(this.scroll.overscan);
    this.mapCam.snap();
    // section geometry is measured, not assumed 100vh — see residentSections.ts
    this.sections.measure();
    this.sections.light.resize();
  };

  /** the canvas the captions and the picker work in — never the window */
  private get view() {
    return {
      w: this.scroll.stageW,
      h: this.scroll.stageH,
      restH: innerHeight,
      // the MAP's own scroll, clamped to the stage — past the map this stops
      // advancing rather than dragging the caption domain into the sections
      scrollTop: this.scroll.mapScrollTop,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.el.classList.remove('hidden');
    // arriving from the main screen must always land on the resting composition
    this.scroll.reset();
    addEventListener('resize', this.resize);
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      this.smX += (this.inputX - this.smX) * k;
      this.smY += (this.inputY - this.smY) * k;
      // ROUND 16. The map is above the sections, so the two renderers are never
      // both wanted; each is gated on whether the map stage is still on screen.
      // The page therefore never pays for Three.js and the ray field in the
      // same frame, however long the document gets.
      const mapVisible = this.scroll.mapVisible;
      if (mapVisible) {
        this.mapCam.update(dt);
        this.ground?.setFocus(this.mapCam.focus);
        this.waterT += dt * this.timeScale;
        this.ground?.update(this.waterT);
        this.updateShear();
        this.picker.setPointer(this.cursor.x, this.cursor.y + this.scroll.mapScrollTop);
        this.picker.update(this.scene, this.mapCam.camera);
        this.labels.update(
          this.mapCam.camera,
          this.view,
          this.mapCam.focus,
          this.shearGroup.matrix
        );
        this.renderer.render(this.scene, this.mapCam.camera);
      }
      this.updateSections(mapVisible);
      if (this.panel) this.reportStats(now);
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
    this.ground?.setFocus(this.mapCam.focus);
    this.updateShear();
    this.labels.update(
      this.mapCam.camera,
      this.view,
      this.mapCam.focus,
      this.shearGroup.matrix
    );
    this.renderer.render(this.scene, this.mapCam.camera);
  }

  /** averaged over a second: a per-frame readout is noise, and it would make
   *  the panel's header the only thing repainting every frame */
  private reportStats(now: number) {
    this.fpsFrames++;
    const span = now - this.fpsSince;
    if (span < 1000) return;
    this.panel?.setStats((this.fpsFrames * 1000) / span, span / this.fpsFrames);
    this.fpsFrames = 0;
    this.fpsSince = now;
  }

  /**
   * The resident sections: background colour, and the light on the live icon.
   *
   * Everything here is a pure function of the scroll position — there is no
   * scroll-driven state to fall out of sync, and no scroll listener either,
   * since the loop is already running.
   */
  private updateSections(mapVisible: boolean) {
    const s = this.sections.track(
      this.scroll.scrollTop,
      this.scroll.stageW,
      this.scroll.viewH,
      mapVisible
    );
    this.sections.apply(s);
    // Two different triggers on purpose. The logo follows the BACKGROUND's
    // luminance, because it has to survive both the white gap and a deep
    // section. The hover rail follows the MAP, because what it says stops being
    // true the moment there is nothing left to hover.
    this.el.classList.toggle('on-dark', s.dark);
    this.el.classList.toggle('past-map', !mapVisible);

    // Warm the second GPU context up before the sections arrive, without ever
    // creating it for a reader who stays on the map.
    //
    // Measured against the first section's OWN top, not the map's bottom:
    // `stageH − 2·viewH` is NEGATIVE at the shipped 1.5 stage, so that form
    // fired on frame one and quietly gave every visitor a second context.
    //
    // 1.5 viewports is what separates the two readers. At 800 px it warms at
    // scrollTop 640, which is past the river hint's 400 — so «посмотреть Неву»
    // stays a purely map interaction — and still leaves ~670 px of runway
    // before the first icon's envelope lifts off zero at 1306.
    if (this.scroll.scrollTop + this.scroll.viewH * 1.5 > this.sections.firstTop) {
      void this.sections.light.ensure(getPerfTier().renderScale);
    }
    if (s.opacity <= 0) {
      this.sections.light.hide();
      return;
    }
    this.sections.light.draw(s.idx, s.center, [this.cursor.x, this.cursor.y], s.opacity);
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

/**
 * The bounding box of the parts that actually have MASS, used for framing.
 *
 * Scale-free: a part counts once it stands at least this fraction of the
 * tallest volume. Measured on this model the split is unambiguous — the pier is
 * 3.3 % of the tallest building and the next-shortest part, the canopy `b17`,
 * is 7.4 % — but the test is a ratio so it survives a re-export at any units.
 *
 * Deliberately NOT a distance-from-the-cluster test: an outlier is not what is
 * wrong with the pier. A ground slab in the river is wrong for the framing
 * because it is not a volume, and that is what gets measured.
 */
const FIT_HEIGHT_FRAC = 0.05;

function massedBox(parts: { bbox: THREE.Box3 }[]): THREE.Box3 {
  let tallest = 0;
  for (const p of parts) tallest = Math.max(tallest, p.bbox.max.y - p.bbox.min.y);
  const box = new THREE.Box3();
  for (const p of parts) {
    if (p.bbox.max.y - p.bbox.min.y >= tallest * FIT_HEIGHT_FRAC) box.union(p.bbox);
  }
  // a model of nothing but slabs would leave this empty — fall back to all of it
  if (box.isEmpty()) for (const p of parts) box.union(p.bbox);
  return box;
}

/** the GLTF material name — the only per-surface identity this export carries */
function materialName(mesh: THREE.Mesh): string {
  const m = mesh.material;
  return (Array.isArray(m) ? m[0]?.name : m?.name) ?? '';
}
