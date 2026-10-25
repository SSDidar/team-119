import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { RoadPoint, Snapshot, Twin } from '../types';

export type CameraView = 'overview' | 'spiral' | 'bottom' | 'crusher';
type Props = {
  snapshot: Snapshot;
  route: RoadPoint[];
  selected: string | null;
  onSelect: (id: string) => void;
  cameraView: CameraView;
  showRoad: boolean;
  showLabels: boolean;
  heatmap: boolean;
};

type Runtime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  objects: Map<string, THREE.Group>;
  road: THREE.Group;
  labels: THREE.Group;
  weather: THREE.Group;
  selection: THREE.Mesh;
  setCamera: (view: CameraView) => void;
};

const YELLOW = 0xe8b64c;
const CYAN = 0x57d7d0;
const tmpVector = new THREE.Vector3();

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function material(color: number, roughness = 0.82, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTruck() {
  const group = new THREE.Group();
  group.name = 'КАМАЗ-65805';
  group.add(box(2.65, 0.35, 9.8, 0x252b2d, 0, 1.25, 0));
  group.add(box(2.75, 2.4, 2.3, YELLOW, 0, 2.65, 3.45));
  group.add(box(2.4, 0.85, 0.08, 0x89b5bd, 0, 3.1, 4.61));
  group.add(box(2.85, 0.28, 0.4, 0x252b2d, 0, 1.45, 4.7));
  const bed = box(3.15, 1.75, 5.7, 0xc98f32, 0, 2.55, -1.15);
  bed.rotation.x = -0.055;
  group.add(bed);
  group.add(box(2.7, 0.15, 5.2, 0x4b3d2c, 0, 3.43, -1.15));
  const tireMat = material(0x15191a, 0.96);
  const hubMat = material(0x798082, 0.45, 0.6);
  [-3.5, -2.25, -1.0, 1.9, 3.35].forEach((z, axle) => {
    [-1, 1].forEach((side) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(axle < 3 ? 0.72 : 0.67, axle < 3 ? 0.72 : 0.67, 0.48, 14), tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.47, 0.82, z);
      wheel.castShadow = true;
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12), hubMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      group.add(hub);
    });
  });
  const payload = box(2.55, 0.65, 4.65, 0x72523a, 0, 3.65, -1.25);
  payload.name = 'payload';
  group.add(payload);
  group.scale.setScalar(1.08);
  return group;
}

function beamBetween(a: THREE.Vector3, b: THREE.Vector3, width: number, color: number) {
  const midpoint = a.clone().add(b).multiplyScalar(0.5);
  const beam = box(width, a.distanceTo(b), width, color);
  beam.position.copy(midpoint);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return beam;
}

function createExcavator() {
  const group = new THREE.Group();
  group.add(box(5.4, 1.0, 7.2, 0x23292a, 0, 0.6, 0));
  group.add(box(4.6, 2.4, 5.3, YELLOW, 0, 2.15, 0));
  group.add(box(2.1, 2.0, 2.3, 0x8fb5ba, 1.25, 3.6, 1.0));
  const boom = new THREE.Group();
  boom.name = 'boom';
  boom.add(beamBetween(new THREE.Vector3(0, 3.1, 1.4), new THREE.Vector3(0, 8.5, 7.0), 0.75, YELLOW));
  boom.add(beamBetween(new THREE.Vector3(0, 8.5, 7.0), new THREE.Vector3(0, 2.0, 11.0), 0.58, YELLOW));
  boom.add(box(3.2, 2.0, 2.7, 0x9d6c28, 0, 1.2, 11.4));
  group.add(boom);
  group.scale.setScalar(1.0);
  return group;
}

function createCrusher() {
  const group = new THREE.Group();
  group.add(box(16, 2, 14, 0x343c3e, 0, 1, 0));
  group.add(box(11, 9, 9, 0x596366, 0, 6.2, 0));
  group.add(box(13, 1.2, 11, 0xd4a33e, 0, 11.2, 0));
  group.add(box(4.2, 13, 4.2, 0x424b4e, 4.2, 9, -3.5));
  const conveyor = box(3.2, 1.0, 24, 0x2c3335, -10, 5, 4);
  conveyor.rotation.x = -0.28;
  conveyor.rotation.y = -0.5;
  group.add(conveyor);
  return group;
}

function createTextSprite(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(7,13,17,.88)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 96, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(87,215,208,.65)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = '500 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#edf5f2';
  ctx.fillText(label, 256, 54, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(28, 6.1, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function createTerrain() {
  const group = new THREE.Group();
  const random = mulberry32(65805);
  const segments = 180;
  const rings = 24;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const radius = 24 + 84 * t;
    // The haul ramp is the upper envelope of the pit surface. Each bench stays
    // below that envelope, so circular bench walls can never hide the spiral.
    const benchT = THREE.MathUtils.clamp((radius - 31) / 60, 0, 1);
    const benchPosition = benchT * 5;
    const benchIndex = Math.min(4, Math.floor(benchPosition));
    const withinBench = benchPosition - benchIndex;
    const y = -60 + benchIndex * 12 + 12 * Math.pow(withinBench, 3.2);
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const strata = Math.sin(angle * 7 + r * 0.8) * 0.45 + Math.sin(angle * 17) * 0.16;
      positions.push(Math.cos(angle) * radius, y + strata, Math.sin(angle) * radius);
      const band = benchIndex % 2 === 0 ? 0 : 0.035;
      color.setHSL(0.078 + random() * 0.01, 0.28 + t * 0.07, 0.25 + t * 0.1 + band + random() * 0.018);
      colors.push(color.r, color.g, color.b);
      if (r < rings && i < segments) {
        const a = r * (segments + 1) + i;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  terrain.receiveShadow = true;
  group.add(terrain);
  const ground = new THREE.Mesh(new THREE.RingGeometry(106, 900, 160), material(0x262a26, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  group.add(ground);
  // Bench crest lines make the five mining levels legible without hiding the road.
  for (let level = 0; level < 6; level++) {
    const radius = 31 + level * 12;
    const y = -60 + level * 12 + 0.45;
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
    const points = curve.getPoints(180).map((p) => new THREE.Vector3(p.x, y, p.y));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x8c7654, transparent: true, opacity: 0.58 }));
    group.add(line);
  }
  // Sparse, seeded rock fragments: a functional trace of the active faces.
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeometry, material(0x65543f), 150);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 150; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 112 + random() * 90;
    dummy.position.set(Math.cos(angle) * radius, random() * 1.3, Math.sin(angle) * radius);
    dummy.scale.setScalar(0.4 + random() * 1.8);
    dummy.rotation.set(random(), random(), random());
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);
  return group;
}

function createRoad(route: RoadPoint[]) {
  const group = new THREE.Group();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  route.forEach((p, i) => {
    const angle = THREE.MathUtils.degToRad(p.heading_deg);
    const nx = Math.cos(angle);
    const nz = -Math.sin(angle);
    [-7.4, 7.4].forEach((width, side) => {
      positions.push(p.x + nx * width, p.y + 0.7, p.z + nz * width);
      uvs.push(side, i / route.length);
    });
    if (i < route.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, material(0x6b655a, 0.98));
  road.name = 'road-surface';
  road.receiveShadow = true;
  group.add(road);
  const centerPoints = route.map((p) => new THREE.Vector3(p.x, p.y + 0.86, p.z));
  const center = new THREE.Line(new THREE.BufferGeometry().setFromPoints(centerPoints), new THREE.LineDashedMaterial({ color: 0xf0dfaa, dashSize: 2.2, gapSize: 2.8, transparent: true, opacity: 0.82 }));
  center.computeLineDistances();
  group.add(center);
  // Low pale berms make both the route and its two traffic lanes readable.
  [0, 1].forEach((side) => {
    const edgePoints = route.map((_, i) => new THREE.Vector3().fromArray(positions, (i * 2 + side) * 3));
    edgePoints.forEach((p) => { p.y += 0.22; });
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePoints), new THREE.LineBasicMaterial({ color: 0xb9a87d, transparent: true, opacity: 0.7 }));
    group.add(edge);
  });
  return group;
}

function createWeather() {
  const group = new THREE.Group();
  const random = mulberry32(91);
  const points: number[] = [];
  for (let i = 0; i < 420; i++) {
    const x = (random() - 0.5) * 260;
    const y = random() * 110;
    const z = (random() - 0.5) * 260;
    points.push(x, y, z, x - 0.5, y - 4, z + 0.3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x93b9c6, transparent: true, opacity: 0.3 })));
  group.visible = false;
  return group;
}

export default function MineScene(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const host = hostRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1115);
    scene.fog = new THREE.FogExp2(0x0a1115, 0.0024);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1800);
    camera.position.set(172, 134, 190);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Интерактивная 3D-модель карьера. Выберите технику щелчком или через список слева.');
    renderer.domElement.setAttribute('role', 'img');
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(10, -24, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 45;
    controls.maxDistance = 460;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xa9c6cf, 0x493b2c, 1.65));
    const sun = new THREE.DirectionalLight(0xffe1ae, 3.1);
    sun.position.set(-90, 170, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.far = 500;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x62b8c5, 0.65);
    rim.position.set(120, 40, -100);
    scene.add(rim);
    scene.add(createTerrain());
    const road = createRoad(props.route);
    scene.add(road);
    const weather = createWeather();
    scene.add(weather);

    const labels = new THREE.Group();
    const ex1 = createTextSprite('ЭК-01 · ЗАБОЙ A');
    ex1.position.set(24, -45, -18);
    labels.add(ex1);
    const ex2 = createTextSprite('ЭК-02 · ЗАБОЙ B');
    ex2.position.set(-22, -45, 20);
    labels.add(ex2);
    const crusherLabel = createTextSprite('ДЩ-01 · 3000 т/ч');
    crusherLabel.position.set(126, 22, -22);
    labels.add(crusherLabel);
    scene.add(labels);

    const selection = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.35, 40), new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    selection.rotation.x = -Math.PI / 2;
    selection.visible = false;
    scene.add(selection);
    const objects = new Map<string, THREE.Group>();
    Object.entries(props.snapshot.things).forEach(([id, twin]) => {
      if (!['truck', 'excavator', 'crusher'].includes(twin.kind)) return;
      const object = twin.kind === 'truck' ? createTruck() : twin.kind === 'excavator' ? createExcavator() : createCrusher();
      object.userData.twinId = id;
      object.traverse((child) => { child.userData.twinId = id; });
      const p = twin.features.position;
      if (p) object.position.set(Number(p.x), Number(p.y) + (twin.kind === 'truck' ? 0.75 : 0), Number(p.z));
      objects.set(id, object);
      scene.add(object);
    });

    const setCamera = (view: CameraView) => {
      const positions: Record<CameraView, [number, number, number, number, number, number]> = {
        overview: [152, 120, 164, 10, -24, 0],
        spiral: [15, 230, 15, 12, -28, 0],
        bottom: [76, -24, 92, 0, -53, 0],
        crusher: [176, 54, 52, 121, 4, -20],
      };
      const v = positions[view];
      camera.position.set(v[0], v[1], v[2]);
      controls.target.set(v[3], v[4], v[5]);
      controls.update();
    };
    runtime.current = { scene, camera, renderer, controls, objects, road, labels, weather, selection, setCamera };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const onUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...objects.values()], true)[0];
      if (hit?.object.userData.twinId) latest.current.onSelect(hit.object.userData.twinId);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let animation = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      animation = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      controls.update();
      objects.forEach((object, id) => {
        const target = object.userData.target as THREE.Vector3 | undefined;
        if (target) object.position.lerp(target, 0.18);
        const targetHeading = object.userData.targetHeading as number | undefined;
        if (targetHeading !== undefined) {
          const delta = Math.atan2(Math.sin(targetHeading - object.rotation.y), Math.cos(targetHeading - object.rotation.y));
          object.rotation.y += delta * 0.2;
        }
        const twin = latest.current.snapshot.things[id];
        if (twin?.kind === 'excavator') {
          const boom = object.getObjectByName('boom');
          if (boom) boom.rotation.y = twin.features.state?.value === 'loading' ? Math.sin(elapsed * 0.75) * 0.11 : 0;
        }
        if (twin?.kind === 'truck') {
          const payload = object.getObjectByName('payload');
          if (payload) payload.visible = Number(twin.features.payload?.value || 0) > 1;
        }
      });
      if (selection.visible) selection.material.opacity = 0.72 + Math.sin(elapsed * 3) * 0.2;
      weather.position.y = -(elapsed * 16) % 12;
      renderer.render(scene, camera);
    };
    animate();
    (window as unknown as Record<string, unknown>).__SCENE_READY__ = true;
    (window as unknown as Record<string, unknown>).__MINE_DEBUG__ = { objects, renderer, scene, routeLength: props.route.length };
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
          object.geometry?.dispose();
          const mat = object.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    Object.entries(props.snapshot.things).forEach(([id, twin]) => {
      const object = rt.objects.get(id);
      const p = twin.features.position;
      if (!object || !p) return;
      object.userData.target = new THREE.Vector3(Number(p.x), Number(p.y) + (twin.kind === 'truck' ? 0.75 : 0), Number(p.z));
      object.userData.targetHeading = THREE.MathUtils.degToRad(Number(p.heading_deg || 0));
      object.visible = twin.kind !== 'truck' || twin.features.state?.value !== 'standby';
    });
    rt.weather.visible = props.snapshot.scenario === 'rain';
    const surface = rt.road.getObjectByName('road-surface') as THREE.Mesh;
    const mat = surface.material as THREE.MeshStandardMaterial;
    mat.color.set(props.heatmap ? (props.snapshot.scenario === 'rockfall' ? 0x845446 : props.snapshot.scenario === 'rain' ? 0x405e65 : 0x617358) : 0x6b655a);
  }, [props.snapshot, props.heatmap]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    rt.road.visible = props.showRoad;
    rt.labels.visible = props.showLabels;
    const selected = props.selected ? rt.objects.get(props.selected) : null;
    rt.selection.visible = Boolean(selected?.visible);
    if (selected) rt.selection.position.copy(selected.position).add(tmpVector.set(0, 0.25, 0));
  }, [props.selected, props.showRoad, props.showLabels, props.snapshot]);

  useEffect(() => { runtime.current?.setCamera(props.cameraView); }, [props.cameraView]);

  return <div className="mine-canvas" ref={hostRef} />;
}
