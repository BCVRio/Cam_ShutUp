// World building: sky, terrain, grass, decor, platforms, coins, pipes, castle, flag.
import { THREE, CFG, Q, IS_TOUCH, scene, renderer, sun, hemi, terrainHeight, smoothstep, seededRandom, MAT, TEX, player, camera } from './core.js';
import { Sky } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/objects/Sky.js/+esm';

export const platforms = [];
export const coins = [];
export const trunks = [];
export const clouds = [];
export let flag = null;

// ---------------------------------------------------------------------------
// Sky + environment lighting
// ---------------------------------------------------------------------------
export function buildSky() {
  // Visible dome: a controlled gradient (zenith blue to pale horizon) with a sun disc, unaffected by tone mapping.
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const col = new Float32Array(geo.attributes.position.count * 3);
  const top = new THREE.Color(0x2f7fe0), mid = new THREE.Color(0x7fc1ff), hor = new THREE.Color(0xdcefff);
  const pos = geo.attributes.position; const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = THREE.MathUtils.clamp(pos.getY(i) / 450, -0.2, 1);
    if (h > 0.25) c.copy(mid).lerp(top, (h - 0.25) / 0.75); else c.copy(hor).lerp(mid, Math.max(0, h) / 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }));
  dome.renderOrder = -1;
  scene.add(dome);
  animated.push({ update: () => dome.position.copy(camera.position) });
  const sunDir = new THREE.Vector3(40, 70, 30).normalize();
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d5, fog: false, toneMapped: false, depthWrite: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(430); sunDisc.lookAt(0, 0, 0);
  dome.add(sunDisc);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.35, fog: false, toneMapped: false, depthWrite: false }));
  glow.position.copy(sunDir).multiplyScalar(432); glow.lookAt(0, 0, 0);
  dome.add(glow);
  scene.background = null;
  // environment map from the sky for soft reflections on coins, water, metal
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(2000); sky2.material.uniforms.sunPosition.value.copy(sunDir);
    sky2.material.uniforms.turbidity.value = 10; sky2.material.uniforms.rayleigh.value = 3; sky2.material.uniforms.mieCoefficient.value = 0.005; sky2.material.uniforms.mieDirectionalG.value = 0.7;
    envScene.add(sky2);
    const env = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  } catch (e) { console.warn('env map skipped', e); }
}

// ---------------------------------------------------------------------------
// Terrain (textured, vertex-tinted) + water + lava pools
// ---------------------------------------------------------------------------
export const lavaPools = [];   // {x,z,r}
export const pond = { x: 52, z: 38, r: 16 };

export function buildTerrain() {
  const size = CFG.worldSize;
  const seg = Q() ? 180 : 120;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(0xd8f0b0);
  const cMid = new THREE.Color(0xbfe09a);
  const cLow = new THREE.Color(0x8fc07a);
  const cPitch = new THREE.Color(0xa9e08a);
  const P = CFG.pitch;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);
    const t = smoothstep(-4, 5, y);
    let c = t < 0.5 ? cLow.clone().lerp(cMid, t * 2) : cMid.clone().lerp(cTop, (t - 0.5) * 2);
    const inPitch = Math.abs(x - P.x) < P.w / 2 + 1 && Math.abs(z - P.z) < P.d / 2 + 1;
    if (inPitch) { const stripe = Math.floor((x - P.x + P.w / 2) / 4) % 2 === 0 ? 1.0 : 0.86; c = cPitch.clone().multiplyScalar(stripe); }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, MAT.terrain);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // pond
  const water = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 48), MAT.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(pond.x, -2.0, pond.z);
  scene.add(water);
  animated.push({ update: (dt, t) => { if (TEX.water) TEX.water.offset.set(t * 0.01, t * 0.006); } });

  // lava pools in dips
  for (const [x, z, r] of [[-38, -62, 6], [68, -8, 7], [22, -58, 5], [-92, -22, 6]]) {
    const y = terrainHeight(x, z) + 0.15;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), MAT.lava);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    scene.add(m);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.4, 0.5, 8, 40), MAT.stone);
    rim.rotation.x = Math.PI / 2; rim.position.set(x, y - 0.1, z); rim.receiveShadow = true; scene.add(rim);
    const light = new THREE.PointLight(0xff6a00, 2.5, r * 4, 2); light.position.set(x, y + 1.5, z); scene.add(light);
    lavaPools.push({ x, z, r, y });
  }
  animated.push({ update: (dt, t) => { if (TEX.lava) TEX.lava.offset.set(Math.sin(t * 0.2) * 0.05, t * 0.02); MAT.lava.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.3; } });

  // world edge
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size / 2 + 8, 6, 8, 64), MAT.dirt);
  ring.rotation.x = Math.PI / 2; ring.position.y = -1; scene.add(ring);
}

export const animated = [];   // objects with update(dt, t)

// ---------------------------------------------------------------------------
// Instanced grass that follows the player, with a gentle wind sway
// ---------------------------------------------------------------------------
let grass = null, grassCenter = new THREE.Vector2(1e9, 1e9);
const GRASS_RADIUS = 26;
export function buildGrass() {
  const count = Q() ? 16000 : 6000;
  const blade = new THREE.PlaneGeometry(0.07, 0.28, 1, 3);
  blade.translate(0, 0.14, 0);
  // bend the blade tip
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 2.5)); p.setZ(i, y * y * 0.9); }
  const mat = new THREE.MeshStandardMaterial({ color: 0x3e8a2c, roughness: 0.95, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float sway = sin(uTime * 1.8 + instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.27) * 0.12 * position.y;
       transformed.x += sway; transformed.z += sway * 0.6;`);
    mat.userData.shader = sh;
  };
  grass = new THREE.InstancedMesh(blade, mat, count);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.castShadow = false; grass.receiveShadow = true; grass.frustumCulled = false;
  scene.add(grass);
  animated.push({ update: (dt, t) => { if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t; } });
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();
export function updateGrass() {
  if (!grass) return;
  const px = player.pos.x, pz = player.pos.z;
  if (Math.hypot(px - grassCenter.x, pz - grassCenter.y) < 12) return;
  grassCenter.set(px, pz);
  const rnd = seededRandom(Math.floor(px / 12) * 1000 + Math.floor(pz / 12));
  const P = CFG.pitch;
  for (let i = 0; i < grass.count; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * GRASS_RADIUS;
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    let y = terrainHeight(x, z);
    let hidden = Math.hypot(x - pond.x, z - pond.z) < pond.r + 1 || (Math.abs(x - P.x) < P.w / 2 + 2 && Math.abs(z - P.z) < P.d / 2 + 2);
    for (const l of lavaPools) if (Math.hypot(x - l.x, z - l.z) < l.r + 1) hidden = true;
    if (Math.hypot(x, z + 96) < 12) hidden = true;
    const sc = hidden ? 0.0001 : 0.6 + rnd() * 0.7;
    _e.set(0, rnd() * Math.PI, 0); _q.setFromEuler(_e);
    _v.set(x, y - 0.02, z); _s.set(sc, sc, sc);
    _m.compose(_v, _q, _s);
    grass.setMatrixAt(i, _m);
  }
  grass.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------
function addTree(x, z, rnd) {
  const y0 = terrainHeight(x, z);
  const g = new THREE.Group();
  const h = 2.4 + rnd() * 2.2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, h, 10), MAT.bark);
  trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
  // a couple of branches
  for (let b = 0; b < 2; b++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.2, 6), MAT.bark);
    br.position.set((b ? -1 : 1) * 0.35, h * 0.7, 0); br.rotation.z = (b ? -1 : 1) * 0.9; g.add(br);
  }
  const leaf = MAT.leaf[Math.floor(rnd() * MAT.leaf.length)];
  const r = 1.3 + rnd() * 1.1;
  const n = Q() ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const s = r * (0.55 + rnd() * 0.5);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, Q() ? 2 : 1), leaf);
    m.position.set((rnd() - 0.5) * r * 1.4, h + rnd() * r * 1.2, (rnd() - 0.5) * r * 1.4);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  g.position.set(x, y0 - 0.2, z);
  scene.add(g);
  trunks.push({ x, z, r: 0.5 });
}

function addRock(x, z, rnd) {
  const s = 0.4 + rnd() * 1.1;
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), MAT.stone);
  m.position.set(x, terrainHeight(x, z) + s * 0.35, z);
  m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  m.scale.set(1, 0.6 + rnd() * 0.5, 1);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  if (s > 0.9) trunks.push({ x, z, r: s * 0.8 });
}

function buildFlowers(rnd) {
  const count = Q() ? 1200 : 400;
  const geo = new THREE.ConeGeometry(0.14, 0.22, 5);
  geo.translate(0, 0.35, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const colors = [0xff5d8f, 0xffd23f, 0xffffff, 0xb28dff, 0xff8c42];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
    _v.set(x, terrainHeight(x, z), z); _e.set(0, rnd() * 6, 0); _q.setFromEuler(_e); _s.setScalar(0.8 + rnd() * 0.6);
    _m.compose(_v, _q, _s); mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, c.setHex(colors[Math.floor(rnd() * colors.length)]));
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

function addCloud(x, y, z, rnd) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const s = 1.8 + rnd() * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), MAT.cloud);
    m.position.set(i * 2.4 - n, rnd() * 0.9, rnd() * 1.4 - 0.7);
    g.add(m);
  }
  g.position.set(x, y, z);
  scene.add(g);
  clouds.push({ group: g, speed: 0.6 + rnd() * 0.8 });
}

// ---------------------------------------------------------------------------
// Platforms, coins, pipes, castle, flag
// ---------------------------------------------------------------------------
function makeQuestionMark() {
  const g = new THREE.Group();
  const m = MAT.white;
  const bar = (w, h, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), m); b.position.set(x, y, 0); g.add(b); };
  bar(0.36, 0.08, 0, 0.3); bar(0.08, 0.16, 0.14, 0.18); bar(0.2, 0.08, 0.04, 0.06); bar(0.08, 0.12, 0, -0.04); bar(0.1, 0.1, 0, -0.26);
  return g;
}

export function addPlatform(x, y, z, w, h, d, type = 'brick', extra = {}) {
  let mesh;
  if (type === 'question') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.question);
    const q = makeQuestionMark(); q.position.set(0, 0, d / 2 + 0.01); mesh.add(q);
    const q2 = q.clone(); q2.rotation.y = Math.PI; q2.position.set(0, 0, -d / 2 - 0.01); mesh.add(q2);
  } else if (type === 'grass') {
    mesh = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), MAT.grassPlat); top.position.y = h / 2 - 0.25;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, h - 0.5, d - 0.3), MAT.dirt); body.position.y = -0.25;
    mesh.add(top, body);
  } else if (type === 'metal') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.metal);
  } else {
    const g = new THREE.BoxGeometry(w, h, d);
    // scale brick UVs with block size so bricks keep their size
    const uv = g.attributes.uv; const sx = w / 2, sy = h / 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    mesh = new THREE.Mesh(g, MAT.brick);
  }
  mesh.position.set(x, y, z);
  mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(mesh);
  const p = { mesh, type, used: false, w, h, d, min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2), baseY: y, bump: 0, ...extra };
  platforms.push(p);
  return p;
}

export function movePlatform(p, x, y, z) {
  p.mesh.position.set(x, y, z);
  p.min.set(x - p.w / 2, y - p.h / 2, z - p.d / 2); p.max.set(x + p.w / 2, y + p.h / 2, z + p.d / 2);
}

const coinGeo = (() => { const g = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24); g.rotateX(Math.PI / 2); return g; })();
export function addCoin(x, y, z) {
  const mesh = new THREE.Mesh(coinGeo, MAT.coin);
  mesh.position.set(x, y, z); mesh.castShadow = true;
  scene.add(mesh);
  const c = { mesh, taken: false, base: new THREE.Vector3(x, y, z), spin: Math.random() * Math.PI * 2 };
  coins.push(c);
  return c;
}

export const pipes = [];
export function addPipe(x, z, height = 3) {
  const y0 = terrainHeight(x, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, height, 28), MAT.pipe);
  body.position.set(x, y0 + height / 2 - 0.3, z);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.7, 28), MAT.pipeDark);
  rim.position.set(x, y0 + height - 0.3, z);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), MAT.eye);
  hole.rotation.x = -Math.PI / 2; hole.position.set(x, y0 + height + 0.06, z);
  body.castShadow = rim.castShadow = body.receiveShadow = rim.receiveShadow = true;
  scene.add(body, rim, hole);
  const top = y0 + height + 0.05;
  platforms.push({ mesh: body, type: 'pipe', used: true, w: 2.6, h: height + 0.4, d: 2.6, min: new THREE.Vector3(x - 1.3, y0 - 0.5, z - 1.3), max: new THREE.Vector3(x + 1.3, top, z + 1.3), baseY: body.position.y, bump: 0 });
  const pipe = { x, z, top, y0 };
  pipes.push(pipe);
  return pipe;
}

function buildCastle(x, z) {
  const y0 = terrainHeight(x, z);
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 10), MAT.stone); main.position.y = 5; g.add(main);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.3), MAT.eye); door.position.set(0, 2.5, 5.1); g.add(door);
  for (const [tx, tz] of [[-7, 4.5], [7, 4.5], [-7, -4.5], [7, -4.5], [0, 0]]) {
    const th = tx === 0 ? 18 : 13;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, th, 20), MAT.stone); t.position.set(tx, th / 2, tz); g.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.5, 20), MAT.castleRoof); roof.position.set(tx, th + 1.7, tz); g.add(roof);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, y0 - 0.5, z);
  scene.add(g);
  platforms.push({ mesh: main, type: 'castle', used: true, w: 16, h: 10, d: 10, min: new THREE.Vector3(x - 8, y0 - 1, z - 5), max: new THREE.Vector3(x + 8, y0 + 9.5, z + 5), baseY: 0, bump: 0 });
}

function buildFlag(x, z) {
  const y0 = terrainHeight(x, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), MAT.stone); base.position.set(x, y0 + 0.5, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 8), MAT.pole); pole.position.set(x, y0 + 5.5, z);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), MAT.coin); ball.position.set(x, y0 + 10.6, z);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 8, 4), MAT.flag); cloth.position.set(x + 1.25, y0 + 9.4, z);
  [base, pole, ball, cloth].forEach((m) => { m.castShadow = true; scene.add(m); });
  flag = { x, z, y: y0, cloth, reached: false };
  animated.push({ update: (dt, t) => { const p = cloth.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const px = p.getX(i); p.setZ(i, Math.sin(t * 4 + px * 2) * 0.12 * (px + 1.2)); } p.needsUpdate = true; } });
}

// ---------------------------------------------------------------------------
export function buildWorld() {
  buildSky();
  buildTerrain();
  buildGrass();
  const rnd = seededRandom(1234567);

  // spawn meadow tutorial
  for (let i = 0; i < 5; i++) addPlatform(-4 + i * 2, 3.2, -8, 2, 2, 2, i === 2 ? 'question' : 'brick');
  addPlatform(8, 3.2, -8, 2, 2, 2, 'question');
  for (let i = 0; i < 7; i++) addCoin(-6 + i * 2, 1.2, -4);
  for (let i = 0; i < 7; i++) addCoin(-6 + i * 2, 1.2, 5);

  const trails = [
    { start: [12, -14], dir: [1, -0.6], n: 7, rise: 0.9 },
    { start: [-14, 10], dir: [-1, 0.5], n: 6, rise: 0.7 },
    { start: [20, 22], dir: [0.6, 1], n: 8, rise: 1.0 },
    { start: [-30, -26], dir: [-0.7, -1], n: 6, rise: 0.8 },
    { start: [0, 30], dir: [0.1, 1], n: 7, rise: 1.1 },
    { start: [40, -10], dir: [1, 0.2], n: 6, rise: 0.6 },
    { start: [-50, 60], dir: [-0.8, 0.6], n: 5, rise: 0.9 },
    { start: [30, 60], dir: [1, 0.8], n: 6, rise: 1.2 },
    { start: [60, -60], dir: [0.3, -1], n: 8, rise: 1.3 },
  ];
  for (const t of trails) {
    let [x, z] = t.start;
    let y = terrainHeight(x, z) + 2.5;
    for (let i = 0; i < t.n; i++) {
      const w = 2 + Math.floor(rnd() * 3) * 2;
      const r = rnd();
      const type = r < 0.18 ? 'question' : r < 0.3 ? 'metal' : r < 0.6 ? 'grass' : 'brick';
      addPlatform(x, y, z, w, 1.6, 2, type);
      for (let c = 0; c < w / 2; c++) addCoin(x - w / 2 + 1 + c * 2, y + 1.9, z);
      x += t.dir[0] * (w / 2 + 3.2); z += t.dir[1] * (w / 2 + 3.2);
      y = Math.max(y + t.rise, terrainHeight(x, z) + 2.4);
    }
  }

  // sky tower challenge: a spiral of small platforms up to a prize
  const tx = 36, tz = -34;
  for (let i = 0; i < 14; i++) {
    const a = i * 0.8, r = 5;
    const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r, y = terrainHeight(tx, tz) + 2.5 + i * 1.5;
    addPlatform(x, y, z, 2, 0.6, 2, i % 4 === 3 ? 'metal' : 'grass');
    if (i % 2 === 0) addCoin(x, y + 1.3, z);
  }
  addPlatform(tx, terrainHeight(tx, tz) + 2.5 + 14 * 1.5 + 1, tz, 4, 0.8, 4, 'metal', { summit: true });

  for (let k = 0; k < 16; k++) {
    const cx = (rnd() - 0.5) * 180, cz = (rnd() - 0.5) * 180;
    for (let i = 0; i < 7; i++) {
      const x = cx + (i - 3) * 1.3, z = cz;
      addCoin(x, terrainHeight(x, z) + 1.2 + Math.sin((i / 6) * Math.PI) * 3.2, z);
    }
  }

  for (const [x, z, h] of [[-12, -18, 3], [26, 8, 4], [-40, 20, 3.5], [60, -40, 5], [-70, -60, 4], [10, 70, 3], [75, 50, 4.5], [-80, 70, 3], [90, 10, 3.5], [-20, 90, 4]]) addPipe(x, z, h);

  const P = CFG.pitch;
  const treeCount = Q() ? 130 : 70;
  for (let i = 0; i < treeCount; i++) {
    const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
    if (Math.hypot(x, z) < 12) continue;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 3) continue;
    if (Math.hypot(x, z + 95) < 16) continue;
    if (Math.abs(x - P.x) < P.w / 2 + 8 && Math.abs(z - P.z) < P.d / 2 + 8) continue;
    if (lavaPools.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 3)) continue;
    addTree(x, z, rnd);
  }
  for (let i = 0; i < (Q() ? 60 : 30); i++) {
    const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
    if (Math.hypot(x, z) < 10 || (Math.abs(x - P.x) < P.w / 2 + 6 && Math.abs(z - P.z) < P.d / 2 + 6)) continue;
    addRock(x, z, rnd);
  }
  buildFlowers(rnd);
  for (let i = 0; i < (Q() ? 26 : 14); i++) addCloud((rnd() - 0.5) * 300, 28 + rnd() * 16, (rnd() - 0.5) * 300, rnd);

  buildCastle(0, -96);
  buildFlag(0, -80);
}

export function updateWorld(dt, t) {
  for (const a of animated) a.update(dt, t);
  for (const c of clouds) { c.group.position.x += c.speed * dt; if (c.group.position.x > 160) c.group.position.x = -160; }
  for (const p of platforms) {
    if (p.bump > 0) { p.bump = Math.max(0, p.bump - dt * 4); p.mesh.position.y = p.baseY + Math.sin(p.bump * Math.PI) * 0.35; }
  }
  updateGrass();
}
