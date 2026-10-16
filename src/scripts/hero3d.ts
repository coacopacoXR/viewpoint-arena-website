/**
 * hero3d.ts — the 3D hero (DESIGN.md §5 `HeroModel`, §4 hero row).
 *
 * Only `hero.ts` loads this, and only after every gate has passed, so this
 * module and the three.js chunk it pulls in are never part of the page's default
 * JS (§7). three, GLTFLoader and the meshopt decoder are three separate dynamic
 * imports: that is what keeps three.js in a chunk of its own.
 *
 * The model is the app's `perf/fixtures/step-assembly-800.glb` (ASSETS.md):
 * gltfpack output with `EXT_meshopt_compression` in `extensionsRequired`, so the
 * decoder is not optional. Its 800 named part meshes share 237 geometries and
 * only 6 materials, so a hover highlight has to go on a per-object material
 * clone — setting `emissive` on the shared material would light the whole
 * assembly, which is what the app's own batched-import renderer fails to do
 * (ASSETS.md, "No selection glow on imported models").
 *
 * The gesture is the app's (`components/Scene/MobileLaser.tsx`, and
 * `ImportedModel.tsx`'s `SELECTION_HIGHLIGHT`): a dot at the hit, a thin beam to
 * it, and emissive `#0044aa` at intensity 0.5 on the part under the pointer. The
 * app fires its beam from the pointer's avatar; the hero has no avatar, and a
 * beam along the view ray projects to a single point, so the beam comes from a
 * fixed spot beside the model and its far end follows the pointer.
 */
import type * as Three from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** The app's selection highlight, copied from ImportedModel.tsx. */
const SELECTION_HIGHLIGHT = { color: 0x0044aa, intensity: 0.5 } as const;

/** Slow idle turntable (§4): about one revolution in 40 s. */
const TURNTABLE_RAD_PER_S = 0.16;
/** A hair of margin around the fitted model. */
const FRAME_PAD = 1.04;
/** The camera's 3/4 view, in radians above and around the model. */
const ELEVATION = 0.6;
const AZIMUTH = 0.5;
/** The beam's fixed end, in camera space, as a multiple of the model radius. */
const BEAM_ORIGIN = { right: 0.35, down: 0.35, forward: 0.5 } as const;

export async function startHero(root: HTMLElement): Promise<void> {
  const canvasEl = root.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  const frameEl = root.querySelector<HTMLElement>('[data-hero-frame]');
  const hint = root.querySelector<HTMLElement>('[data-hero-hint]');
  const glbUrl = root.dataset.glb;

  if (!canvasEl || !frameEl || !glbUrl) {
    root.dataset.hero = 'still';
    return;
  }
  /* The helpers below are hoisted declarations, and TypeScript will not carry
     this guard's narrowing into them, so they get non-nullable names. */
  const canvas: HTMLCanvasElement = canvasEl;
  const frame: HTMLElement = frameEl;

  const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = window.matchMedia('(pointer: coarse)');

  let disposed = false;
  let renderer: Three.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch {
    root.dataset.hero = 'still';
    return;
  }
  renderer.setClearColor(0x000000, 0);

  /* ------------------------------------------------------------- the scene */

  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
  scene.add(pivot, ambient, keyLight, fillLight);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  let gltf: GLTF;
  try {
    gltf = await loader.loadAsync(glbUrl);
  } catch {
    /* a missing or unreadable GLB keeps the still; nothing else changes */
    renderer.dispose();
    root.dataset.hero = 'still';
    return;
  }
  if (disposed) {
    /* navigated away while the model was in flight */
    gltf.scene.traverse(disposeNode);
    renderer.dispose();
    return;
  }

  const model = gltf.scene;
  pivot.add(model);
  model.updateMatrixWorld(true);

  const parts: Three.Mesh[] = [];
  model.traverse((object) => {
    const mesh = object as Three.Mesh;
    if (mesh.isMesh) {
      mesh.userData.base = mesh.material;
      parts.push(mesh);
    }
  });

  /* centre the assembly on the pivot, so the turntable spins it about itself */
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  const radius = size.length() / 2;

  keyLight.position.set(radius * 2, radius * 3, radius * 2.5);
  fillLight.position.set(radius * -2.5, radius * 0.5, radius * -2);

  /* --------------------------------------------------------------- camera */

  const camera = new THREE.PerspectiveCamera(32, 1, radius / 100, radius * 100);
  const beamOrigin = new THREE.Vector3();

  /**
   * Fit the camera to the model at its fixed 3/4 view, tightly but without ever
   * cropping: the eight box corners are projected at four turntable angles and
   * the distance is scaled by the worst overshoot, three passes deep. A bounding
   * sphere would leave a flat assembly swimming in empty frame.
   */
  function fitCamera(): void {
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const tanVertical = Math.tan(vertical / 2);
    const tanHorizontal = Math.tan(horizontal / 2);

    const corners: Three.Vector3[] = [];
    for (const x of [-size.x / 2, size.x / 2]) {
      for (const y of [-size.y / 2, size.y / 2]) {
        for (const z of [-size.z / 2, size.z / 2]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    const spins = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((angle) =>
      new THREE.Matrix4().makeRotationY(angle),
    );

    let distance = radius * 3;
    const toCamera = new THREE.Matrix4();
    const point = new THREE.Vector3();
    for (let pass = 0; pass < 3; pass += 1) {
      camera.position.setFromSphericalCoords(distance, Math.PI / 2 - ELEVATION, AZIMUTH);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      toCamera.copy(camera.matrixWorld).invert();
      let worst = 0;
      for (const spin of spins) {
        for (const corner of corners) {
          point.copy(corner).applyMatrix4(spin).applyMatrix4(toCamera);
          const depth = Math.max(-point.z, radius / 1000);
          worst = Math.max(
            worst,
            Math.abs(point.x) / (depth * tanHorizontal),
            Math.abs(point.y) / (depth * tanVertical),
          );
        }
      }
      distance *= worst * FRAME_PAD;
    }

    beamOrigin
      .set(BEAM_ORIGIN.right * radius, -BEAM_ORIGIN.down * radius, -distance * BEAM_ORIGIN.forward)
      .applyMatrix4(camera.matrixWorld);
  }

  /* ------------------------------------------------- laser, dot and glow */

  const laserMaterial = new THREE.LineBasicMaterial({
    color: SELECTION_HIGHLIGHT.color,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    toneMapped: false,
  });
  const laserGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const laser = new THREE.Line(laserGeometry, laserMaterial);
  laser.visible = false;
  laser.frustumCulled = false;
  laser.renderOrder = 999;

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 0.016, 0.05), 12, 12),
    new THREE.MeshBasicMaterial({
      color: SELECTION_HIGHLIGHT.color,
      depthTest: false,
      toneMapped: false,
    }),
  );
  dot.visible = false;
  dot.renderOrder = 1000;
  /* added after the model so neither is ever a raycast target: `parts` is the
     only list the raycaster is pointed at */
  scene.add(laser, dot);

  /** One glowing clone per shared base material; only the lit mesh wears it. */
  const highlights = new Map<string, Three.MeshStandardMaterial>();

  function highlightFor(material: Three.Material): Three.Material | null {
    const base = material as Three.MeshStandardMaterial;
    if (!base.isMeshStandardMaterial) return null;
    let glow = highlights.get(base.uuid);
    if (!glow) {
      glow = base.clone();
      glow.emissive = new THREE.Color(SELECTION_HIGHLIGHT.color);
      glow.emissiveIntensity = SELECTION_HIGHLIGHT.intensity;
      highlights.set(base.uuid, glow);
    }
    return glow;
  }

  let lit: Three.Mesh | null = null;
  let hovered: Three.Mesh | null = null;
  let selected: Three.Mesh | null = null;

  function relight(): void {
    const target = hovered ?? selected;
    if (target === lit) return;
    if (lit) lit.material = lit.userData.base as Three.Material;
    lit = target;
    if (lit) {
      const glow = highlightFor(lit.userData.base as Three.Material);
      if (glow) lit.material = glow;
      else lit = null;
    }
    /* which part is lit, by the name the STEP file gave it, and the highlight
       it wears — the app's SELECTION_HIGHLIGHT, so the sheet can be checked */
    root.dataset.heroPart = lit?.name ?? '';
    root.dataset.heroGlow = lit
      ? SELECTION_HIGHLIGHT.color.toString(16).padStart(6, '0')
      : '';
  }

  /* -------------------------------------------------------------- pointer */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const partCentre = new THREE.Vector3();
  let pointerInFrame = false;

  function readPointer(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** The part under the pointer; `hitPoint` is where the ray met it. */
  function pick(): Three.Mesh | null {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(parts, false)[0];
    if (!hit) return null;
    hitPoint.copy(hit.point);
    return hit.object as Three.Mesh;
  }

  function onPointerMove(event: PointerEvent): void {
    pointerInFrame = true;
    readPointer(event);
  }

  function onPointerDown(event: PointerEvent): void {
    /* a tap is the only pointing gesture touch has: it selects, and the
       selection stays lit while the turntable carries it round */
    pointerInFrame = true;
    readPointer(event);
    selected = pick();
    hovered = null;
    relight();
    if (selected) setBeam(hitPoint);
  }

  function onPointerLeave(): void {
    pointerInFrame = false;
    hovered = null;
    relight();
  }

  function setBeam(point: Three.Vector3 | null): void {
    if (point === null) {
      laser.visible = false;
      dot.visible = false;
      return;
    }
    const position = laserGeometry.getAttribute('position') as Three.BufferAttribute;
    position.setXYZ(0, beamOrigin.x, beamOrigin.y, beamOrigin.z);
    position.setXYZ(1, point.x, point.y, point.z);
    position.needsUpdate = true;
    laserGeometry.computeBoundingSphere();
    dot.position.copy(point);
    laser.visible = true;
    dot.visible = true;
  }

  /** Where a part sits now, so a held selection keeps its beam while it turns. */
  function centreOf(mesh: Three.Mesh, target: Three.Vector3): Three.Vector3 {
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const centre = geometry.boundingSphere?.center;
    return target.copy(centre ?? mesh.position).applyMatrix4(mesh.matrixWorld);
  }

  /** Pointer first, then a held selection, then no beam at all. */
  function updateBeam(): void {
    if (pointerInFrame) {
      hovered = pick();
      relight();
      if (hovered) {
        setBeam(hitPoint);
        return;
      }
    }
    if (selected) setBeam(centreOf(selected, partCentre));
    else setBeam(null);
  }

  /* ---------------------------------------------------------- render loop */

  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let inView = true;

  function tick(time: number): void {
    rafId = requestAnimationFrame(tick);
    const delta = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    pivot.rotation.y += TURNTABLE_RAD_PER_S * delta;
    pivot.updateMatrixWorld();
    updateBeam();
    renderer.render(scene, camera);
  }

  function start(): void {
    if (running || disposed) return;
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(tick);
  }

  /** §4: the turntable stops off screen and when the tab is hidden. */
  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function resize(): void {
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    fitCamera();
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------- teardown */

  function disposeNode(node: Three.Object3D): void {
    const mesh = node as Three.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    (mesh.userData.base as Three.Material | undefined)?.dispose();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stop();
    viewObserver.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pagehide', dispose);
    document.removeEventListener('visibilitychange', onVisibility);
    reduceQuery.removeEventListener('change', onReduceChange);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    model.traverse(disposeNode);
    for (const glow of highlights.values()) glow.dispose();
    highlights.clear();
    laserGeometry.dispose();
    laserMaterial.dispose();
    dot.geometry.dispose();
    (dot.material as Three.Material).dispose();
    renderer.dispose();
    if (hint) hint.hidden = true;
    root.dataset.hero = 'still';
  }

  function onVisibility(): void {
    if (document.hidden) stop();
    else if (inView) start();
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    stop();
    if (hint) hint.hidden = true;
    root.dataset.hero = 'still';
  }

  /** §4: reduced motion turned on mid-session — back to the still, live. */
  function onReduceChange(): void {
    if (reduceQuery.matches) dispose();
  }

  const viewObserver = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) start();
      else stop();
    },
    { threshold: 0 },
  );
  const resizeObserver = new ResizeObserver(resize);

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
  canvas.addEventListener('webglcontextlost', onContextLost);
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('visibilitychange', onVisibility);
  reduceQuery.addEventListener('change', onReduceChange);
  viewObserver.observe(frame);
  resizeObserver.observe(frame);

  resize();
  /* the first frame goes up before the canvas is revealed, so the cross-fade
     never shows an empty stage */
  renderer.render(scene, camera);
  root.dataset.hero = 'live';
  if (hint) {
    hint.textContent = coarseQuery.matches ? 'TAP A PART' : 'HOVER A PART';
    hint.hidden = false;
  }
  start();
}
