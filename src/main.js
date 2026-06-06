import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { encodeState, ACTION_NAMES } from './mdp.js';
import { createQTable, selectAction, updateQ, bestAction } from './qlearning.js';
import { TrafficEnvironment } from './trafficEnvironment.js';

const LANE_WIDTH = 3.05;
const laneWorldX = (lane) => (lane - 1.5) * LANE_WIDTH;
/** Fixed world road along Z (group stays at origin; only cars move). */
const ROAD_PATCH_LEN = 1400;
const ROAD_PATCH_HALF = ROAD_PATCH_LEN / 2;
const ASPHALT_W = LANE_WIDTH * 4;

const traffic = new TrafficEnvironment();
traffic.reset();

/** Smoothed poses for rendering (sim stays discrete). */
const carVisual = [];

function ensureCarVisual() {
  while (carVisual.length < traffic.cars.length) {
    carVisual.push({ z: 0, laneF: 0, targZ: 0, targLane: 0 });
  }
  while (carVisual.length > traffic.cars.length) {
    carVisual.pop();
  }
}

function syncVisualTargetsFromSim() {
  ensureCarVisual();
  for (let i = 0; i < traffic.cars.length; i++) {
    const c = traffic.cars[i];
    const v = carVisual[i];
    v.targZ = c.z;
    v.targLane = c.lane;
  }
}

function snapVisualToSim() {
  ensureCarVisual();
  for (let i = 0; i < traffic.cars.length; i++) {
    const c = traffic.cars[i];
    const v = carVisual[i];
    v.z = c.z;
    v.laneF = c.lane;
    v.targZ = c.z;
    v.targLane = c.lane;
  }
}

function tickCarVisuals(dt) {
  const tz = 1 - Math.exp(-10 * dt);
  for (let i = 0; i < traffic.cars.length; i++) {
    const v = carVisual[i];
    const dz = v.targZ - v.z;
    if (Math.abs(dz) > 55) {
      v.z = v.targZ;
    } else {
      v.z += dz * tz;
    }
    v.laneF = v.targLane;
  }
}

snapVisualToSim();

const q = createQTable();

let episodes = 0;
let steps = 0;
let collisions = 0;
let episodeSteps = 0;
let sumSurvivalSteps = 0;
let training = true;

let epsilon = 0.25;
let alpha = 0.1;
let gamma = 0.9;

let renderHeadway = traffic.getObservation().headwayMeters;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a8c4);
scene.fog = new THREE.Fog(0xb8c9d9, 100, 420);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  240
);
camera.position.set(0, 8.5, -10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.zIndex = '2';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 20);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 6;
controls.maxDistance = 92;

const hemi = new THREE.HemisphereLight(0xdfefff, 0x3d5c3a, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e6, 1.05);
sun.position.set(-28, 42, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(3072, 3072);
sun.shadow.bias = -0.00025;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 85;
sun.shadow.camera.bottom = -35;
scene.add(sun);

const roadWorld = new THREE.Group();
roadWorld.position.set(0, 0, 0);
scene.add(roadWorld);

function addDashedStripe(parent, x, z0, z1, dash, gap, mat) {
  let z = z0;
  let on = true;
  while (z < z1) {
    const len = on ? dash : gap;
    if (on) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, len), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.035, z + len / 2);
      parent.add(m);
    }
    z += len;
    on = !on;
  }
}

(function buildFixedRoadWorld() {
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x457a49,
    roughness: 0.95,
    metalness: 0,
  });
  for (const sx of [-1, 1]) {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(82, ROAD_PATCH_LEN + 160),
      grassMat
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(sx * (ASPHALT_W / 2 + 38), -0.05, 0);
    g.receiveShadow = true;
    roadWorld.add(g);
  }

  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0x353a40,
    roughness: 0.92,
    metalness: 0.02,
  });
  for (const sx of [-1, 1]) {
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, ROAD_PATCH_LEN + 40),
      shoulderMat
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(sx * (ASPHALT_W / 2 + 0.58), 0.01, 0);
    sh.receiveShadow = true;
    roadWorld.add(sh);
  }

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(ASPHALT_W, ROAD_PATCH_LEN),
    new THREE.MeshStandardMaterial({
      color: 0x2a2f36,
      roughness: 0.88,
      metalness: 0.04,
    })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0.02, 0);
  asphalt.receiveShadow = true;
  roadWorld.add(asphalt);

  const whiteLine = new THREE.MeshBasicMaterial({ color: 0xf5f7fa });
  const yellowEdge = new THREE.MeshBasicMaterial({ color: 0xe8c547 });

  for (const x of [-LANE_WIDTH, 0, LANE_WIDTH]) {
    addDashedStripe(
      roadWorld,
      x,
      -ROAD_PATCH_HALF + 18,
      ROAD_PATCH_HALF - 18,
      1.2,
      0.9,
      whiteLine
    );
  }

  const edgeZ0 = -ROAD_PATCH_HALF + 12;
  const edgeZ1 = ROAD_PATCH_HALF - 12;
  for (const x of [-ASPHALT_W / 2 + 0.07, ASPHALT_W / 2 - 0.07]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, edgeZ1 - edgeZ0),
      yellowEdge
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.036, (edgeZ0 + edgeZ1) / 2);
    roadWorld.add(edge);
  }

  const postMat = new THREE.MeshStandardMaterial({
    color: 0x8a9099,
    metalness: 0.35,
    roughness: 0.45,
  });
  const postGeo = new THREE.BoxGeometry(0.14, 0.78, 0.14);
  for (let z = -ROAD_PATCH_HALF + 28; z < ROAD_PATCH_HALF - 24; z += 3.2) {
    for (const sx of [-1, 1]) {
      const px = sx * (ASPHALT_W / 2 + 0.45);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 0.39, z);
      post.castShadow = true;
      post.receiveShadow = true;
      roadWorld.add(post);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 1.75),
        postMat
      );
      rail.position.set(px, 0.66, z + 1.85);
      rail.castShadow = true;
      roadWorld.add(rail);
    }
  }
})();


function makeSedan(opts) {
  const {
    bodyColor = 0x58a6ff,
    cabinColor = 0x79c0ff,
    tailLight = false,
    wheelTint = 0x1a1d21,
  } = opts;
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.42, 2.18),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.38,
      metalness: 0.35,
    })
  );
  body.position.y = 0.48;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.38, 1.12),
    new THREE.MeshStandardMaterial({ color: cabinColor, roughness: 0.45, metalness: 0.15 })
  );
  cabin.position.set(0, 0.88, -0.12);
  cabin.castShadow = true;
  g.add(cabin);

  const wMat = new THREE.MeshStandardMaterial({
    color: wheelTint,
    roughness: 0.9,
    metalness: 0.05,
  });
  const wGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.2, 18);
  for (const [wx, wz] of [
    [-0.52, 0.72],
    [0.52, 0.72],
    [-0.52, -0.72],
    [0.52, -0.72],
  ]) {
    const w = new THREE.Mesh(wGeo, wMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.29, wz);
    w.castShadow = true;
    g.add(w);
  }

  if (tailLight) {
    const tlMat = new THREE.MeshStandardMaterial({
      color: 0xff2b2b,
      emissive: 0xaa0000,
      emissiveIntensity: 0.85,
    });
    for (const tx of [-0.36, 0.36]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), tlMat);
      tl.position.set(tx, 0.52, -1.08);
      g.add(tl);
    }
  }
  return g;
}

const NPC_PALETTE = [
  0x8b949e, 0x6e7781, 0x5c6370, 0x768390, 0x9da7b3, 0x7d8590, 0x4d5566, 0xa8b0bc,
];

const trafficMeshes = [];
const MAX_DRAW = 26;
for (let i = 0; i < MAX_DRAW; i++) {
  const isEgo = i === 0;
  const g = makeSedan({
    bodyColor: isEgo ? 0x2f6feb : NPC_PALETTE[i % NPC_PALETTE.length],
    cabinColor: isEgo ? 0x6eb0ff : NPC_PALETTE[(i + 3) % NPC_PALETTE.length],
    tailLight: !isEgo && i % 4 === 1,
    wheelTint: 0x15181c,
  });
  if (isEgo) {
    const body = g.children[0];
    body.material.emissive = new THREE.Color(0x112244);
    body.material.emissiveIntensity = 0.12;
  }
  scene.add(g);
  trafficMeshes.push(g);
}

const egoGroup = trafficMeshes[0];
const egoRing = new THREE.Mesh(
  new THREE.RingGeometry(0.92, 1.32, 48),
  new THREE.MeshBasicMaterial({
    color: 0x3fb950,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  })
);
egoRing.rotation.x = -Math.PI / 2;
egoRing.position.y = 0.055;
egoRing.renderOrder = 1;
egoGroup.add(egoRing);

const youEl = document.createElement('div');
youEl.className = 'ego-tag';
youEl.textContent = 'YOU';
const youLabel = new CSS2DObject(youEl);
youLabel.position.set(0, 2.45, 0);
youLabel.center.set(0.5, 1);
egoGroup.add(youLabel);

let applyingCameraDistance = false;
function applyCameraDistance(distance) {
  applyingCameraDistance = true;
  const d = Math.max(
    controls.minDistance,
    Math.min(controls.maxDistance, distance)
  );
  let off = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (off.lengthSq() < 1e-6) {
    off.set(-14, 7, -10);
  }
  off.normalize().multiplyScalar(d);
  camera.position.copy(controls.target).add(off);
  applyingCameraDistance = false;
}

function syncTrafficVisuals() {
  ensureCarVisual();
  const egoZ = carVisual[0]?.z ?? traffic.getAgent().z;

  for (let i = 0; i < trafficMeshes.length; i++) {
    const mesh = trafficMeshes[i];
    if (i >= traffic.cars.length) {
      mesh.visible = false;
      continue;
    }
    const v = carVisual[i];
    if (Math.abs(v.z - egoZ) > 260) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(laneWorldX(v.laneF), 0, v.z);
    mesh.rotation.y = 0;
  }
}

function resetAfterCollision() {
  collisions += 1;
  sumSurvivalSteps += episodeSteps;
  episodes += 1;
  episodeSteps = 0;
  traffic.reset();
  snapVisualToSim();
  renderHeadway = traffic.getObservation().headwayMeters;
}

function stepRl() {
  const obs0 = traffic.getObservation();
  const s = encodeState(obs0.lane, obs0.speed, obs0.frontBin, obs0.density);
  const action = selectAction(q, s, epsilon);
  const out = traffic.step(action);

  if (out.rebaseShift) {
    snapVisualToSim();
  }

  const sNext = out.terminal
    ? s
    : encodeState(out.lane, out.speed, out.frontBin, out.density);

  updateQ(q, s, action, out.reward, sNext, gamma, alpha, out.terminal);
  steps += 1;
  episodeSteps += 1;

  if (out.terminal) {
    resetAfterCollision();
  }
}

syncVisualTargetsFromSim();
syncTrafficVisuals();

const statsEl = document.getElementById('stats');
const epsIn = document.getElementById('epsilon');
const alphaIn = document.getElementById('alpha');
const gammaIn = document.getElementById('gamma');
const speedIn = document.getElementById('speed');
const epsVal = document.getElementById('epsVal');
const alphaVal = document.getElementById('alphaVal');
const gammaVal = document.getElementById('gammaVal');
const speedVal = document.getElementById('speedVal');
const zoomEl = document.getElementById('zoom');
const zoomVal = document.getElementById('zoomVal');

let simStepsPerSec = 6;

function readZoomUi() {
  const d = Number(zoomEl.value);
  zoomVal.textContent = String(d);
  applyCameraDistance(d);
}

controls.addEventListener('change', () => {
  if (applyingCameraDistance) return;
  const d = Math.round(camera.position.distanceTo(controls.target));
  const c = Math.max(Number(zoomEl.min), Math.min(Number(zoomEl.max), d));
  zoomEl.value = String(c);
  zoomVal.textContent = String(c);
});

zoomEl.addEventListener('input', readZoomUi);
zoomEl.addEventListener('change', readZoomUi);
document.getElementById('zoomIn').addEventListener('click', () => {
  const next = Math.max(
    Number(zoomEl.min),
    Number(zoomEl.value) * 0.88 - 0.5
  );
  zoomEl.value = String(Math.round(next));
  readZoomUi();
});
document.getElementById('zoomOut').addEventListener('click', () => {
  const next = Math.min(
    Number(zoomEl.max),
    Number(zoomEl.value) * 1.12 + 0.5
  );
  zoomEl.value = String(Math.round(next));
  readZoomUi();
});

function initCameraBehindAgent() {
  ensureCarVisual();
  const v = carVisual[0];
  const ax = laneWorldX(v.laneF);
  const az = v.z;
  controls.target.set(ax, 1.35, az + 18);
  camera.position.set(ax - 13, 8.2, az - 16);
}

{
  initCameraBehindAgent();
  const d0 = Math.round(camera.position.distanceTo(controls.target));
  const c = Math.max(Number(zoomEl.min), Math.min(Number(zoomEl.max), d0));
  zoomEl.value = String(c);
  zoomVal.textContent = String(c);
}

function readSliders() {
  epsilon = Number(epsIn.value) / 100;
  alpha = Number(alphaIn.value) / 100;
  gamma = Number(gammaIn.value) / 100;
  simStepsPerSec = Number(speedIn.value);
  epsVal.textContent = epsilon.toFixed(2);
  alphaVal.textContent = alpha.toFixed(2);
  gammaVal.textContent = gamma.toFixed(2);
  speedVal.textContent = String(simStepsPerSec);
}
readSliders();
['input', 'change'].forEach((ev) => {
  epsIn.addEventListener(ev, readSliders);
  alphaIn.addEventListener(ev, readSliders);
  gammaIn.addEventListener(ev, readSliders);
  speedIn.addEventListener(ev, readSliders);
});

document.getElementById('toggleTrain').addEventListener('click', (e) => {
  training = !training;
  e.target.textContent = training ? 'Pause training' : 'Resume training';
});

document.getElementById('resetQ').addEventListener('click', () => {
  q.table.fill(0);
  episodes = 0;
  steps = 0;
  collisions = 0;
  episodeSteps = 0;
  sumSurvivalSteps = 0;
  traffic.reset();
  snapVisualToSim();
  renderHeadway = traffic.getObservation().headwayMeters;
  syncVisualTargetsFromSim();
  syncTrafficVisuals();
  initCameraBehindAgent();
});

const laneLabels = ['L0', 'L1', 'L2', 'L3'];
const speedNames = ['LOW', 'MED', 'HIGH'];
const frontNames = ['NEAR', 'SAFE', 'FAR'];
const densityNames = ['LOW', 'MED', 'HIGH'];

let simAccum = 0;
let lastFrameMs = performance.now();

function animate(t) {
  requestAnimationFrame(animate);

  const dtSec = Math.min(0.12, (t - lastFrameMs) / 1000);
  lastFrameMs = t;

  if (training) {
    simAccum += dtSec * simStepsPerSec;
    const maxSteps = 4;
    const n = Math.min(maxSteps, Math.floor(simAccum));
    simAccum -= n;
    for (let i = 0; i < n; i++) stepRl();
  }

  syncVisualTargetsFromSim();
  tickCarVisuals(dtSec);

  const obs = traffic.getObservation();
  renderHeadway += (obs.headwayMeters - renderHeadway) * Math.min(1, dtSec * 10);

  const wheelSpin = dtSec * (2.0 + obs.speed * 1.2);
  for (let i = 0; i < traffic.cars.length; i++) {
    const mesh = trafficMeshes[i];
    if (!mesh || !mesh.visible) continue;
    for (let j = 2; j <= 5; j++) {
      const ch = mesh.children[j];
      if (ch && ch.geometry && ch.geometry.type === 'CylinderGeometry') {
        ch.rotation.x += wheelSpin;
      }
    }
  }

  syncTrafficVisuals();

  const agent = traffic.getAgent();
  const sIdx = encodeState(obs.lane, obs.speed, obs.frontBin, obs.density);
  const pol = bestAction(q, sIdx);
  const avgLife = episodes > 0 ? sumSurvivalSteps / episodes : 0;
  statsEl.innerHTML = `
    <strong>MDP state</strong> lane ${laneLabels[obs.lane]}, ${speedNames[obs.speed]}, ${frontNames[obs.frontBin]}, traffic <b>${densityNames[obs.density]}</b><br/>
    Headway ≈ ${obs.headwayMeters.toFixed(1)} m (smoothed ${renderHeadway.toFixed(1)})<br/>
    Episodes: ${episodes} · Collisions: ${collisions} · Steps: ${steps}<br/>
    Avg survival: ${avgLife.toFixed(1)} steps/episode<br/>
    Greedy: <code>${pol}</code> ${ACTION_NAMES[pol]}
  `;

  ensureCarVisual();
  const ev = carVisual[0];
  const ax = laneWorldX(ev.laneF);
  const az = ev.z;
  const newTarget = new THREE.Vector3(ax, 1.35, az + 18);
  const prevTarget = controls.target.clone();
  const camT = 1 - Math.exp(-2.6 * dtSec);
  controls.target.lerp(newTarget, camT);
  camera.position.add(
    new THREE.Vector3().subVectors(controls.target, prevTarget)
  );

  sun.position.set(-28, 42, az + 10);

  controls.update();

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});
