// Cam's Shut Up World — a Mario-style 3D open-world platformer starring Cam.
// Three.js, no build step. Assets live in /public. Designed for phones first.

// Absolute ESM URLs (jsDelivr "+esm" rewrites the loader's bare `three` import to the same module), so no import map is required.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch');

const CFG = {
  modelUrl: './public/models/cam.glb',
  modelHeight: 1.4,          // Cam is ~1.4 units tall in-game
  modelYawOffset: 0,         // rotate if the GLB faces the wrong way
  // Voice lines. "shutup" = the real takes from the video; the others are cloned from his voice.
  lines: {
    shutup: ['./public/audio/shutup_1.mp3', './public/audio/shutup_2.mp3', './public/audio/shutup_3.mp3', './public/audio/shutup_4.mp3'],
    yay: ['./public/audio/yay.mp3'],
    ooh: ['./public/audio/ooh.mp3'],
    ohyeah: ['./public/audio/ohyeah.mp3'],
    ohno: ['./public/audio/ohno.mp3'],
    woohoo: ['./public/audio/woohoo.mp3'],
  },
  lineText: { shutup: 'SHUT UP!', yay: 'YAY!', ooh: 'OOH!', ohyeah: 'OH YEAH!', ohno: 'OH NO!', woohoo: 'WOO HOO!' },
  musicUrl: './public/audio/music_overworld.m4a',
  coinSfx: './public/audio/coin.mp3',
  stompSfx: './public/audio/stomp.mp3',
  worldSize: 240,
  gravity: 24,
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 10.5,
  runShoutEvery: 1.4,        // seconds between "shut up"s while moving
  // mobile performance
  pixelRatio: IS_TOUCH ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 2),
  shadowSize: IS_TOUCH ? 1024 : 2048,
  treeCount: IS_TOUCH ? 70 : 110,
  cloudCount: IS_TOUCH ? 16 : 26,
  fogNear: IS_TOUCH ? 55 : 70,
  fogFar: IS_TOUCH ? 150 : 190,
};

// ---------------------------------------------------------------------------
// DOM / HUD
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = { coins: $('coins'), lives: $('lives'), score: $('score'), shutups: $('shutups') };
const bubble = $('bubble');
const toast = $('toast');
const overlay = $('overlay');
const loadStatus = $('loadStatus');

function showToast(text, ms = 1600) {
  toast.textContent = text;
  toast.style.opacity = 1;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.style.opacity = 0), ms);
}

// ---------------------------------------------------------------------------
// Audio — Web Audio for voice/SFX (low latency on phones), <audio> for music
// ---------------------------------------------------------------------------
const audio = {
  ctx: null,
  unlocked: false,
  musicOn: true,
  buffers: {},          // url -> AudioBuffer
  lineIdx: {},          // kind -> next index
  music: null,
  voiceGain: null,
  sfxGain: null,
  currentVoice: null,   // currently playing voice source (cut when a new line starts)
  bubbleUntil: 0,
  lastShout: 0,
  count: 0,
};

async function loadBuffer(url) {
  if (audio.buffers[url]) return audio.buffers[url];
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await audio.ctx.decodeAudioData(arr);
    audio.buffers[url] = buf;
    return buf;
  } catch (e) {
    console.warn('audio load failed', url, e);
    return null;
  }
}

function initAudio() {
  audio.music = new Audio(CFG.musicUrl);
  audio.music.loop = true;
  audio.music.volume = 0.28;
  audio.music.preload = 'auto';
  // Decoding needs an AudioContext; create it now (suspended) and resume on first gesture.
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    audio.ctx = new AC();
    audio.voiceGain = audio.ctx.createGain(); audio.voiceGain.gain.value = 1.0; audio.voiceGain.connect(audio.ctx.destination);
    audio.sfxGain = audio.ctx.createGain(); audio.sfxGain.gain.value = 0.55; audio.sfxGain.connect(audio.ctx.destination);
    const urls = [CFG.coinSfx, CFG.stompSfx, ...Object.values(CFG.lines).flat()];
    urls.forEach((u) => loadBuffer(u));
  }
}

function unlockAudio() {
  if (audio.unlocked) return;
  audio.unlocked = true;
  if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
  if (audio.musicOn) audio.music.play().catch(() => {});
}

function playBuffer(url, gainNode, rate = 1, cutPrevious = false) {
  if (!audio.unlocked || !audio.ctx) return null;
  const buf = audio.buffers[url];
  if (!buf) return null;
  if (cutPrevious && audio.currentVoice) { try { audio.currentVoice.stop(); } catch (_) {} }
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(gainNode);
  src.start();
  return src;
}

function playSfx(url) { playBuffer(url, audio.sfxGain, 0.97 + Math.random() * 0.06); }

// Cam speaks. kind: 'shutup' | 'yay' | 'ooh' | 'ohyeah' | 'ohno' | 'woohoo'
function say(kind, force = false) {
  const now = performance.now() / 1000;
  if (!force && now - audio.lastShout < 0.25) return;
  audio.lastShout = now;
  if (kind === 'shutup') { audio.count++; hud.shutups.textContent = audio.count; }
  audio.bubbleUntil = now + 0.75;
  bubble.textContent = CFG.lineText[kind] || kind.toUpperCase();
  bubble.style.opacity = 1;
  const list = CFG.lines[kind] || CFG.lines.shutup;
  const i = (audio.lineIdx[kind] || 0) % list.length;
  audio.lineIdx[kind] = i + 1;
  const src = playBuffer(list[i], audio.voiceGain, 0.94 + Math.random() * 0.14, true);
  if (src) audio.currentVoice = src;
}
const shutUp = (force = false) => say('shutup', force);

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(CFG.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5ec8ff);
scene.fog = new THREE.Fog(0x9fe0ff, CFG.fogNear, CFG.fogFar);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const hemi = new THREE.HemisphereLight(0xe8f7ff, 0x6db84a, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4d6, 2.2);
sun.position.set(40, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(CFG.shadowSize, CFG.shadowSize);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

function applyViewport() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 60;      // portrait phones see a bit more
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', applyViewport);
window.addEventListener('orientationchange', () => setTimeout(applyViewport, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', applyViewport);
applyViewport();

// ---------------------------------------------------------------------------
// Materials (one palette, Nintendo-bright)
// ---------------------------------------------------------------------------
const MAT = {
  brick: new THREE.MeshStandardMaterial({ color: 0xc8692b, roughness: 0.9 }),
  brickDark: new THREE.MeshStandardMaterial({ color: 0x8e4418, roughness: 0.9 }),
  question: new THREE.MeshStandardMaterial({ color: 0xffc81a, roughness: 0.55 }),
  used: new THREE.MeshStandardMaterial({ color: 0x9a6a3b, roughness: 0.9 }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffd400, metalness: 0.65, roughness: 0.25, emissive: 0x3a2a00 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0xe8402a, roughness: 0.5 }),
  pipeDark: new THREE.MeshStandardMaterial({ color: 0xb02f1e, roughness: 0.5 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 }),
  leaf: [0x5ad04a, 0x3fbf5a, 0x7fe06a, 0x49c98f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
  cloud: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  goomba: new THREE.MeshStandardMaterial({ color: 0x9c5a2e, roughness: 0.9 }),
  goombaCap: new THREE.MeshStandardMaterial({ color: 0xc9834a, roughness: 0.9 }),
  spot: new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.9 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
  castle: new THREE.MeshStandardMaterial({ color: 0xf2e9dc, roughness: 0.9 }),
  castleRoof: new THREE.MeshStandardMaterial({ color: 0xe8402a, roughness: 0.7 }),
  pole: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5, roughness: 0.4 }),
  flag: new THREE.MeshStandardMaterial({ color: 0x3bd36a, roughness: 0.8, side: THREE.DoubleSide }),
  water: new THREE.MeshStandardMaterial({ color: 0x3aa8ff, roughness: 0.2, transparent: true, opacity: 0.85 }),
  grassPlat: new THREE.MeshStandardMaterial({ color: 0x55c84a, roughness: 0.95 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0xa5683a, roughness: 1 }),
};

// ---------------------------------------------------------------------------
// Terrain: rolling candy hills with a flat spawn meadow
// ---------------------------------------------------------------------------
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const flat = smoothstep(7, 18, d);
  let h = 2.2 * Math.sin(x * 0.07) * Math.cos(z * 0.055)
        + 1.1 * Math.sin(x * 0.19 + 1.3) * Math.sin(z * 0.13 + 0.4)
        + 0.5 * Math.sin((x + z) * 0.31)
        + 3.0 * Math.sin(x * 0.03 + 0.8) * Math.sin(z * 0.027 + 2.1);
  return h * flat;
}

function buildTerrain() {
  const size = CFG.worldSize;
  const seg = IS_TOUCH ? 120 : 160;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(0x7be35d);
  const cMid = new THREE.Color(0x4fc44a);
  const cLow = new THREE.Color(0x2fa94d);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);
    const t = smoothstep(-4, 5, y);
    const c = t < 0.5 ? cLow.clone().lerp(cMid, t * 2) : cMid.clone().lerp(cTop, (t - 0.5) * 2);
    const chk = ((Math.floor(x / 4) + Math.floor(z / 4)) % 2 === 0) ? 1.0 : 0.94;
    colors[i * 3] = c.r * chk; colors[i * 3 + 1] = c.g * chk; colors[i * 3 + 2] = c.b * chk;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  const water = new THREE.Mesh(new THREE.CircleGeometry(16, 40), MAT.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(52, -2.0, 38);
  scene.add(water);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(size / 2 + 8, 6, 8, 64), MAT.dirt);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1;
  scene.add(ring);
}

// ---------------------------------------------------------------------------
// World objects
// ---------------------------------------------------------------------------
const platforms = [];
const coins = [];
const enemies = [];
const trunks = [];
const clouds = [];
let flag = null;

function addPlatform(x, y, z, w, h, d, type = 'brick') {
  let mesh;
  if (type === 'question') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.question);
    const q = makeQuestionMark();
    q.position.set(0, 0, d / 2 + 0.01);
    mesh.add(q);
    const q2 = q.clone(); q2.rotation.y = Math.PI; q2.position.set(0, 0, -d / 2 - 0.01); mesh.add(q2);
  } else if (type === 'grass') {
    mesh = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), MAT.grassPlat);
    top.position.y = h / 2 - 0.25;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, h - 0.5, d - 0.3), MAT.dirt);
    body.position.y = -0.25;
    top.castShadow = top.receiveShadow = body.castShadow = body.receiveShadow = true;
    mesh.add(top, body);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.brick);
    const lines = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), MAT.brickDark);
    mesh.add(lines);
  }
  mesh.position.set(x, y, z);
  mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(mesh);
  const p = { mesh, type, used: false, w, h, d, min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2), baseY: y, bump: 0 };
  platforms.push(p);
  return p;
}

function makeQuestionMark() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const bar = (w, h, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), m); b.position.set(x, y, 0); g.add(b); };
  bar(0.36, 0.08, 0, 0.3); bar(0.08, 0.16, 0.14, 0.18); bar(0.2, 0.08, 0.04, 0.06); bar(0.08, 0.12, 0, -0.04); bar(0.1, 0.1, 0, -0.26);
  return g;
}

const coinGeo = (() => { const g = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20); g.rotateX(Math.PI / 2); return g; })();
function addCoin(x, y, z) {
  const mesh = new THREE.Mesh(coinGeo, MAT.coin);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  const c = { mesh, taken: false, base: new THREE.Vector3(x, y, z), spin: Math.random() * Math.PI * 2 };
  coins.push(c);
  return c;
}

function addPipe(x, z, height = 3) {
  const y0 = terrainHeight(x, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, height, 24), MAT.pipe);
  body.position.set(x, y0 + height / 2 - 0.3, z);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.7, 24), MAT.pipeDark);
  rim.position.set(x, y0 + height - 0.3, z);
  body.castShadow = rim.castShadow = body.receiveShadow = rim.receiveShadow = true;
  scene.add(body, rim);
  const top = y0 + height + 0.05;
  platforms.push({ mesh: body, type: 'pipe', used: true, w: 2.6, h: height + 0.4, d: 2.6, min: new THREE.Vector3(x - 1.3, y0 - 0.5, z - 1.3), max: new THREE.Vector3(x + 1.3, top, z + 1.3), baseY: body.position.y, bump: 0 });
}

function addTree(x, z) {
  const y0 = terrainHeight(x, z);
  const g = new THREE.Group();
  const h = 2 + Math.random() * 2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, h, 8), MAT.trunk);
  trunk.position.y = h / 2;
  g.add(trunk);
  const leaf = MAT.leaf[Math.floor(Math.random() * MAT.leaf.length)];
  const r = 1.4 + Math.random() * 1.2;
  const blob = (dx, dy, dz, s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), leaf); m.position.set(dx, h + dy, dz); m.castShadow = true; g.add(m); };
  blob(0, r * 0.6, 0, r);
  blob(r * 0.6, r * 0.2, 0.2, r * 0.7);
  blob(-r * 0.5, r * 0.3, -0.3, r * 0.65);
  blob(0.1, r * 1.1, 0.4, r * 0.55);
  trunk.castShadow = true;
  g.position.set(x, y0 - 0.2, z);
  scene.add(g);
  trunks.push({ x, z, r: 0.5 });
}

function addCloud(x, y, z) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = 1.6 + Math.random() * 1.6;
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), MAT.cloud);
    m.position.set(i * 2.2 - n, Math.random() * 0.8, Math.random() * 1.2 - 0.6);
    g.add(m);
  }
  g.position.set(x, y, z);
  scene.add(g);
  clouds.push({ group: g, speed: 0.6 + Math.random() * 0.8 });
}

function makeGoomba() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), MAT.goomba);
  body.scale.set(1, 0.85, 1);
  body.position.y = 0.5;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.78, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.goombaCap);
  cap.position.y = 0.72;
  const spotGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (const [sx, sz] of [[0.35, 0.45], [-0.4, 0.3], [0.1, -0.55], [-0.3, -0.4]]) {
    const s = new THREE.Mesh(spotGeo, MAT.spot); s.position.set(sx, 0.95, sz); s.scale.y = 0.4; g.add(s);
  }
  for (const sx of [-0.2, 0.2]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), MAT.spot); e.position.set(sx, 0.55, 0.47); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), MAT.eye); p.position.set(sx, 0.56, 0.56); g.add(p);
  }
  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.6), MAT.eye);
  feet.position.y = 0.1;
  g.add(body, cap, feet);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function addEnemy(ax, az, bx, bz) {
  const group = makeGoomba();
  scene.add(group);
  const e = { group, a: new THREE.Vector3(ax, 0, az), b: new THREE.Vector3(bx, 0, bz), t: Math.random(), dir: 1, alive: true, squash: 0, speed: 0.12 + Math.random() * 0.1 };
  enemies.push(e);
  return e;
}

function buildCastle(x, z) {
  const y0 = terrainHeight(x, z);
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 10), MAT.castle); main.position.y = 5; g.add(main);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.3), MAT.eye); door.position.set(0, 2.5, 5.1); g.add(door);
  for (const [tx, tz] of [[-7, 4.5], [7, 4.5], [-7, -4.5], [7, -4.5], [0, 0]]) {
    const th = tx === 0 ? 18 : 13;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, th, 16), MAT.castle); t.position.set(tx, th / 2, tz); g.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.5, 16), MAT.castleRoof); roof.position.set(tx, th + 1.7, tz); g.add(roof);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, y0 - 0.5, z);
  scene.add(g);
  platforms.push({ mesh: main, type: 'castle', used: true, w: 16, h: 10, d: 10, min: new THREE.Vector3(x - 8, y0 - 1, z - 5), max: new THREE.Vector3(x + 8, y0 + 9.5, z + 5), baseY: 0, bump: 0 });
}

function buildFlag(x, z) {
  const y0 = terrainHeight(x, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), MAT.brickDark); base.position.set(x, y0 + 0.5, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 8), MAT.pole); pole.position.set(x, y0 + 5.5, z);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), MAT.coin); ball.position.set(x, y0 + 10.6, z);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), MAT.flag); cloth.position.set(x + 1.25, y0 + 9.4, z);
  [base, pole, ball, cloth].forEach((m) => { m.castShadow = true; scene.add(m); });
  flag = { x, z, y: y0, cloth, reached: false };
}

function seededRandom(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

function buildWorld() {
  buildTerrain();
  const rnd = seededRandom(1234567);

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
    { start: [-50, 40], dir: [-0.8, 0.6], n: 5, rise: 0.9 },
    { start: [30, 60], dir: [1, 0.8], n: 6, rise: 1.2 },
  ];
  for (const t of trails) {
    let [x, z] = t.start;
    let y = terrainHeight(x, z) + 2.5;
    for (let i = 0; i < t.n; i++) {
      const w = 2 + Math.floor(rnd() * 3) * 2;
      const type = rnd() < 0.2 ? 'question' : (rnd() < 0.5 ? 'grass' : 'brick');
      addPlatform(x, y, z, w, 1.6, 2, type);
      for (let c = 0; c < w / 2; c++) addCoin(x - w / 2 + 1 + c * 2, y + 1.9, z);
      x += t.dir[0] * (w / 2 + 3.2); z += t.dir[1] * (w / 2 + 3.2);
      y = Math.max(y + t.rise, terrainHeight(x, z) + 2.4);
    }
  }

  for (let k = 0; k < 14; k++) {
    const cx = (rnd() - 0.5) * 180, cz = (rnd() - 0.5) * 180;
    for (let i = 0; i < 7; i++) {
      const x = cx + (i - 3) * 1.3, z = cz;
      addCoin(x, terrainHeight(x, z) + 1.2 + Math.sin((i / 6) * Math.PI) * 3.2, z);
    }
  }

  for (const [x, z, h] of [[-12, -18, 3], [26, 8, 4], [-40, 20, 3.5], [60, -40, 5], [-70, -60, 4], [10, 70, 3], [75, 50, 4.5], [-80, 70, 3]]) addPipe(x, z, h);

  for (let i = 0; i < CFG.treeCount; i++) {
    const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
    if (Math.hypot(x, z) < 12) continue;
    if (Math.hypot(x - 52, z - 38) < 18) continue;
    if (Math.hypot(x, z + 95) < 16) continue;
    addTree(x, z);
  }

  for (let i = 0; i < CFG.cloudCount; i++) addCloud((rnd() - 0.5) * 300, 26 + rnd() * 14, (rnd() - 0.5) * 300);

  const spots = [[10, 2], [-10, 6], [18, -20], [-22, -16], [28, 30], [-36, 34], [48, -22], [-60, -30], [70, 28], [-66, 62], [6, 50], [-18, -58], [90, -70], [-90, 10], [40, 80], [-45, -85]];
  for (const [x, z] of spots) addEnemy(x - 4, z, x + 4, z + (rnd() - 0.5) * 6);

  buildCastle(0, -96);
  buildFlag(0, -80);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
const player = {
  root: new THREE.Group(),
  model: null,
  mixer: null,
  clips: { idle: null, run: null, jump: null },
  current: null,
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  yaw: 0,
  grounded: false,
  jumpHeld: false,
  coins: 0,
  lives: 3,
  score: 0,
  hurtUntil: 0,
  moveTimer: 0,
  wasMoving: false,
  spin: 0,
  spinning: false,
  procBob: 0,
  dead: false,
};
scene.add(player.root);

function makePlaceholder() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf1c7a3, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1d2a6b, roughness: 0.8 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x3b3027, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x9a6a3b, roughness: 0.9 });
  const sock = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.5, 0.45, 0.3), shorts, 0, 0.5, 0);
  add(new THREE.BoxGeometry(0.56, 0.5, 0.34), jacket, 0, 0.95, 0);
  add(new THREE.BoxGeometry(0.16, 0.45, 0.16), jacket, -0.36, 0.95, 0);
  add(new THREE.BoxGeometry(0.16, 0.45, 0.16), jacket, 0.36, 0.95, 0);
  add(new THREE.BoxGeometry(0.18, 0.3, 0.18), sock, -0.14, 0.15, 0);
  add(new THREE.BoxGeometry(0.18, 0.3, 0.18), sock, 0.14, 0.15, 0);
  add(new THREE.SphereGeometry(0.3, 16, 14), skin, 0, 1.45, 0);
  add(new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), hair, 0, 1.5, -0.02);
  const glass = new THREE.MeshStandardMaterial({ color: 0x111111 });
  add(new THREE.BoxGeometry(0.5, 0.03, 0.04), glass, 0, 1.47, 0.29);
  add(new THREE.TorusGeometry(0.09, 0.02, 6, 16), glass, -0.12, 1.46, 0.3);
  add(new THREE.TorusGeometry(0.09, 0.02, 6, 16), glass, 0.12, 1.46, 0.3);
  return g;
}

function pickClip(clips, words) {
  for (const w of words) {
    const c = clips.find((cl) => cl.name.toLowerCase().includes(w));
    if (c) return c;
  }
  return null;
}

function setClip(name, fade = 0.18) {
  const clip = player.clips[name];
  if (!player.mixer || !clip) return;
  if (player.current === clip) return;
  const next = player.mixer.clipAction(clip);
  next.enabled = true;
  if (name === 'jump') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (player.current) player.mixer.clipAction(player.current).fadeOut(fade);
  player.current = clip;
}

async function loadPlayer() {
  const loader = new GLTFLoader();
  let model;
  try {
    const gltf = await loader.loadAsync(CFG.modelUrl);
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = CFG.modelHeight / Math.max(size.y, 0.001);
    model.scale.setScalar(s);
    box.setFromObject(model);
    model.position.y -= box.min.y;
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.rotation.y = CFG.modelYawOffset;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (o.material) { o.material.side = THREE.DoubleSide; if (o.material.transparent && o.material.opacity > 0.95) { o.material.transparent = false; } }
      }
    });
    if (gltf.animations && gltf.animations.length) {
      player.mixer = new THREE.AnimationMixer(model);
      const anims = gltf.animations;
      player.clips.idle = pickClip(anims, ['idle', 'stand', 'breath']) || anims[0];
      player.clips.run = pickClip(anims, ['run', 'jog', 'walk', 'sprint']);
      player.clips.jump = pickClip(anims, ['jump', 'leap', 'hop']);
      setClip('idle', 0);
      console.log('Cam clips:', anims.map((a) => a.name));
    }
    loadStatus.textContent = 'Cam is ready!';
  } catch (err) {
    console.warn('Could not load Cam GLB, using placeholder', err);
    model = makePlaceholder();
    loadStatus.textContent = 'Cam model not found — using stand-in (see README to add cam.glb).';
  }
  player.model = model;
  player.root.add(model);
}

// ---------------------------------------------------------------------------
// Input: keyboard, mouse orbit, touch stick + jump + look-drag
// ---------------------------------------------------------------------------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyM') toggleMusic();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); if (audio.music) audio.music.pause(); }
  else if (audio.unlocked && audio.musicOn && audio.music) audio.music.play().catch(() => {});
});

function toggleMusic() {
  audio.musicOn = !audio.musicOn;
  if (!audio.music) return;
  if (audio.musicOn && audio.unlocked) audio.music.play().catch(() => {}); else audio.music.pause();
  $('musicBtn').style.opacity = audio.musicOn ? 1 : 0.45;
  showToast(audio.musicOn ? 'MUSIC ON' : 'MUSIC OFF', 900);
}
$('musicBtn').addEventListener('click', toggleMusic);

function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) { try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
}
$('fsBtn').addEventListener('click', goFullscreen);

const urlParams = new URLSearchParams(location.search);
const cam = { yaw: Math.PI, pitch: 0.36, dist: Number(urlParams.get('dist')) || 6.5, dragging: false, dragId: null, lastX: 0, lastY: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
if (urlParams.has('yaw')) cam.yaw = Number(urlParams.get('yaw'));

// Mouse drag anywhere, or touch drag on the canvas (the stick/jump button capture their own pointers).
canvas.addEventListener('pointerdown', (e) => {
  if (cam.dragging) return;
  cam.dragging = true; cam.dragId = e.pointerId; cam.lastX = e.clientX; cam.lastY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
const endDrag = (e) => { if (e.pointerId === cam.dragId) { cam.dragging = false; cam.dragId = null; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointermove', (e) => {
  if (!cam.dragging || e.pointerId !== cam.dragId) return;
  const k = e.pointerType === 'touch' ? 0.009 : 0.006;
  cam.yaw -= (e.clientX - cam.lastX) * k;
  cam.pitch = Math.min(1.2, Math.max(0.1, cam.pitch + (e.clientY - cam.lastY) * k * 0.7));
  cam.lastX = e.clientX; cam.lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => { cam.dist = Math.min(14, Math.max(4, cam.dist + e.deltaY * 0.01)); }, { passive: true });

const touch = { active: false, id: null, dx: 0, dy: 0, jump: false };
const stick = $('stick'), knob = $('knob'), jumpBtn = $('jumpBtn');
stick.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.active = true; touch.id = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (_) {} moveStick(e); });
stick.addEventListener('pointermove', (e) => { if (touch.active && e.pointerId === touch.id) moveStick(e); });
const endStick = (e) => { if (e.pointerId === touch.id) { touch.active = false; touch.dx = touch.dy = 0; knob.style.transform = ''; } };
stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick); stick.addEventListener('lostpointercapture', endStick);
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
  touch.dx = dx; touch.dy = dy;
  const px = r.width * 0.3;
  knob.style.transform = `translate(${dx * px}px, ${dy * px}px)`;
}
jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.jump = true; jumpBtn.classList.add('down'); try { jumpBtn.setPointerCapture(e.pointerId); } catch (_) {} });
const endJump = () => { touch.jump = false; jumpBtn.classList.remove('down'); };
jumpBtn.addEventListener('pointerup', endJump); jumpBtn.addEventListener('pointercancel', endJump); jumpBtn.addEventListener('lostpointercapture', endJump);
// stop iOS from scrolling/zooming the page under the controls
['touchstart', 'touchmove'].forEach((t) => document.addEventListener(t, (e) => { if (e.target.closest('#overlay')) return; e.preventDefault(); }, { passive: false }));
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------
const PLAYER_R = 0.38;
const PLAYER_H = CFG.modelHeight;
const tmp = { v: new THREE.Vector3(), v2: new THREE.Vector3() };

function groundAt(x, z, feetY, vy) {
  let g = terrainHeight(x, z);
  for (const p of platforms) {
    if (x + PLAYER_R < p.min.x || x - PLAYER_R > p.max.x || z + PLAYER_R < p.min.z || z - PLAYER_R > p.max.z) continue;
    const top = p.max.y;
    if (feetY >= top - 0.35 && vy <= 0.01 && top > g) g = top;
  }
  return g;
}

function resolveSolids(pos, vy, dt) {
  const feet = pos.y, head = pos.y + PLAYER_H;
  for (const p of platforms) {
    const inX = pos.x + PLAYER_R > p.min.x && pos.x - PLAYER_R < p.max.x;
    const inZ = pos.z + PLAYER_R > p.min.z && pos.z - PLAYER_R < p.max.z;
    if (!inX || !inZ) continue;
    const overlapY = head > p.min.y + 0.05 && feet < p.max.y - 0.3;
    if (!overlapY) continue;
    if (vy > 0 && head - vy * dt <= p.min.y + 0.05 && head > p.min.y) {
      pos.y = p.min.y - PLAYER_H - 0.01;
      hitBlock(p);
      player.vel.y = -1;
      continue;
    }
    const dxL = (pos.x + PLAYER_R) - p.min.x, dxR = p.max.x - (pos.x - PLAYER_R);
    const dzL = (pos.z + PLAYER_R) - p.min.z, dzR = p.max.z - (pos.z - PLAYER_R);
    const m = Math.min(dxL, dxR, dzL, dzR);
    if (m === dxL) pos.x = p.min.x - PLAYER_R; else if (m === dxR) pos.x = p.max.x + PLAYER_R; else if (m === dzL) pos.z = p.min.z - PLAYER_R; else pos.z = p.max.z + PLAYER_R;
  }
  for (const t of trunks) {
    const dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz), r = t.r + PLAYER_R;
    if (d < r && d > 0.0001 && feet < terrainHeight(t.x, t.z) + 2.5) { pos.x = t.x + (dx / d) * r; pos.z = t.z + (dz / d) * r; }
  }
  const lim = CFG.worldSize / 2 - 2;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
}

function hitBlock(p) {
  p.bump = 1;
  if (p.type === 'question' && !p.used) {
    p.used = true;
    p.mesh.material = MAT.used;
    p.mesh.children.forEach((c) => (c.visible = false));
    const c = addCoin(p.mesh.position.x, p.max.y + 0.6, p.mesh.position.z);
    collectCoin(c, true);
    say('ohyeah', true);
  } else {
    if (p.type === 'brick') addScore(10);
    say('ooh', true);
  }
}

function addScore(n) { player.score += n; hud.score.textContent = player.score; }

function collectCoin(c, fromBlock = false) {
  if (c.taken) return;
  c.taken = true;
  player.coins++;
  hud.coins.textContent = player.coins;
  addScore(100);
  playSfx(CFG.coinSfx);
  if (!fromBlock) say('yay');
  if (player.coins % 25 === 0) { player.lives++; hud.lives.textContent = player.lives; showToast('1-UP!'); say('woohoo', true); }
  c.mesh.userData.flyT = 0;
}

function hurt(kind = 'ooh') {
  const now = performance.now() / 1000;
  if (now < player.hurtUntil || player.dead) return;
  player.hurtUntil = now + 1.6;
  player.lives--;
  hud.lives.textContent = Math.max(0, player.lives);
  player.vel.y = 6;
  say(kind, true);
  if (player.lives <= 0) {
    player.dead = true;
    showToast('GAME OVER', 2500);
    setTimeout(() => { say('ohno', true); }, 700);
    setTimeout(resetGame, 2600);
  } else {
    showToast('OUCH!', 700);
  }
}

function resetGame() {
  player.lives = 3; player.coins = 0; player.score = 0; player.dead = false;
  hud.lives.textContent = 3; hud.coins.textContent = 0; hud.score.textContent = 0;
  player.pos.set(0, terrainHeight(0, 0) + 0.5, 0);
  player.vel.set(0, 0, 0);
  for (const c of coins) { c.taken = false; c.mesh.visible = true; c.mesh.position.copy(c.base); c.mesh.scale.setScalar(1); }
  for (const e of enemies) { e.alive = true; e.squash = 0; e.group.visible = true; e.group.scale.setScalar(1); }
  for (const p of platforms) if (p.type === 'question') { p.used = false; p.mesh.material = MAT.question; p.mesh.children.forEach((c) => (c.visible = true)); }
  if (flag) flag.reached = false;
}

function updatePlayer(dt) {
  const now = performance.now() / 1000;
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (touch.active) { ix += touch.dx; iz += touch.dy; }
  if (keys.has('KeyQ')) cam.yaw += 1.8 * dt;
  if (keys.has('KeyE')) cam.yaw -= 1.8 * dt;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight') || (touch.active && len > 0.7);
  const speed = running ? CFG.runSpeed : CFG.walkSpeed;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const wx = (fx * -iz + rx * ix), wz = (fz * -iz + rz * ix);
  const moving = len > 0.08 && !player.dead;

  const accel = player.grounded ? 40 : 18;
  const tx = moving ? wx * speed * Math.min(1, len * 1.2) : 0;
  const tz = moving ? wz * speed * Math.min(1, len * 1.2) : 0;
  player.vel.x += (tx - player.vel.x) * Math.min(1, accel * dt / speed);
  player.vel.z += (tz - player.vel.z) * Math.min(1, accel * dt / speed);

  if (moving && !player.wasMoving) { shutUp(); player.moveTimer = 0; }
  if (moving) { player.moveTimer += dt; if (player.moveTimer >= CFG.runShoutEvery) { shutUp(); player.moveTimer = 0; } }
  player.wasMoving = moving;

  if (moving) {
    const target = Math.atan2(wx, wz);
    let d = target - player.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, 14 * dt);
  }

  const jumpPressed = keys.has('Space') || touch.jump;
  if (jumpPressed && !player.jumpHeld && player.grounded && !player.dead) {
    player.vel.y = CFG.jumpSpeed * (running ? 1.08 : 1);
    player.grounded = false;
    player.spinning = !player.clips.jump;
    player.spin = 0;
    shutUp(true);
  }
  if (!jumpPressed && player.vel.y > 3 && !player.grounded) player.vel.y = 3;
  player.jumpHeld = jumpPressed;

  player.vel.y -= CFG.gravity * dt;
  player.vel.y = Math.max(player.vel.y, -30);
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  resolveSolids(player.pos, player.vel.y, dt);

  const g = groundAt(player.pos.x, player.pos.z, player.pos.y, player.vel.y);
  const snapRange = player.grounded ? 0.45 : 0.08;
  if (player.pos.y <= g || (player.vel.y <= 0 && player.pos.y - g < snapRange)) {
    player.pos.y = g;
    player.vel.y = 0;
    player.grounded = true;
    player.spinning = false;
  } else {
    player.grounded = false;
  }

  if (player.pos.y < -3.2 && Math.hypot(player.pos.x - 52, player.pos.z - 38) < 16) { hurt('ohno'); player.pos.set(52 - 18, terrainHeight(34, 38) + 0.5, 38); player.vel.set(0, 0, 0); }

  const hspeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.mixer) {
    if (!player.grounded) setClip(player.clips.jump ? 'jump' : 'idle');
    else if (hspeed > 0.8) setClip(player.clips.run ? 'run' : 'idle');
    else setClip('idle');
    if (player.current) {
      const act = player.mixer.clipAction(player.current);
      act.timeScale = (player.grounded && hspeed > 0.8 && player.current === player.clips.run) ? Math.max(0.8, hspeed / CFG.walkSpeed) : 1;
    }
    player.mixer.update(dt);
  }
  if (player.model) {
    const m = player.model;
    let bob = 0, lean = 0;
    if (player.grounded && hspeed > 0.8 && !player.clips.run) { player.procBob += dt * hspeed * 2.2; bob = Math.abs(Math.sin(player.procBob)) * 0.12; lean = 0.12; }
    if (player.spinning) { player.spin += dt * 9; }
    m.rotation.y = CFG.modelYawOffset + (player.spinning ? player.spin : 0);
    m.rotation.x = lean;
    m.position.y = bob + (m.userData.baseY ?? (m.userData.baseY = m.position.y));
  }
  if (player.model) player.model.visible = now < player.hurtUntil ? Math.floor(now * 16) % 2 === 0 : true;

  player.root.position.copy(player.pos);
  player.root.rotation.y = player.yaw;
}

function updateCoins(dt, t) {
  const p = player.pos;
  for (const c of coins) {
    const m = c.mesh;
    if (c.taken) {
      if (m.userData.flyT !== undefined && m.userData.flyT < 1) {
        m.userData.flyT += dt * 2.2;
        m.position.y += dt * 6;
        m.scale.setScalar(1 - m.userData.flyT);
        m.rotation.y += dt * 20;
        if (m.userData.flyT >= 1) m.visible = false;
      }
      continue;
    }
    if (Math.abs(m.position.x - p.x) > 20 || Math.abs(m.position.z - p.z) > 20) continue;
    m.rotation.y = t * 3 + c.spin;
    m.position.y = c.base.y + Math.sin(t * 2.5 + c.spin) * 0.12;
    const dy = m.position.y - (p.y + 0.7);
    if (Math.abs(dy) < 1.2 && Math.hypot(m.position.x - p.x, m.position.z - p.z) < 1.15) collectCoin(c);
  }
}

function updateEnemies(dt, now) {
  const p = player.pos;
  for (const e of enemies) {
    const g = e.group;
    if (!e.alive) {
      if (e.squash > 0) { e.squash -= dt; g.scale.set(1.4, 0.25, 1.4); if (e.squash <= 0) g.visible = false; }
      continue;
    }
    e.t += e.dir * e.speed * dt;
    if (e.t > 1) { e.t = 1; e.dir = -1; } else if (e.t < 0) { e.t = 0; e.dir = 1; }
    const x = e.a.x + (e.b.x - e.a.x) * e.t, z = e.a.z + (e.b.z - e.a.z) * e.t;
    g.position.set(x, terrainHeight(x, z), z);
    g.rotation.y = Math.atan2((e.b.x - e.a.x) * e.dir, (e.b.z - e.a.z) * e.dir);
    g.rotation.z = Math.sin(now * 10 + e.t * 50) * 0.08;
    const dx = p.x - x, dz = p.z - z, dh = Math.hypot(dx, dz);
    if (dh > 1.0) continue;
    const ey = g.position.y;
    if (p.y > ey + 0.55 && player.vel.y < 0) {
      e.alive = false; e.squash = 0.6;
      player.vel.y = 8.5;
      addScore(200);
      playSfx(CFG.stompSfx);
      say('ohyeah', true);
      showToast('STOMP!', 500);
    } else if (p.y < ey + 1.2) {
      hurt('ooh');
      player.vel.x = (dx / (dh || 1)) * 6; player.vel.z = (dz / (dh || 1)) * 6;
    }
  }
}

function updateBlocks(dt) {
  for (const p of platforms) {
    if (p.bump > 0) {
      p.bump = Math.max(0, p.bump - dt * 4);
      p.mesh.position.y = p.baseY + Math.sin(p.bump * Math.PI) * 0.35;
    }
  }
}

function updateFlag(dt, now) {
  if (!flag) return;
  flag.cloth.rotation.y = Math.sin(now * 3) * 0.25;
  if (!flag.reached && Math.hypot(player.pos.x - flag.x, player.pos.z - flag.z) < 1.4) {
    flag.reached = true;
    addScore(1000);
    say('woohoo', true);
    showToast('COURSE CLEAR!', 3000);
  }
}

function updateCamera(dt) {
  const target = player.pos;
  const cx = target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cz = target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cy = target.y + 1.2 + Math.sin(cam.pitch) * cam.dist;
  tmp.v.set(cx, Math.max(cy, terrainHeight(cx, cz) + 1.2), cz);
  cam.pos.lerp(tmp.v, Math.min(1, 7 * dt));
  tmp.v2.set(target.x, target.y + 1.1, target.z);
  cam.look.lerp(tmp.v2, Math.min(1, 10 * dt));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  sun.position.set(target.x + 40, target.y + 70, target.z + 30);
  sun.target.position.copy(target);
}

function updateBubble(now) {
  if (now > audio.bubbleUntil) { bubble.style.opacity = 0; return; }
  tmp.v.set(player.pos.x, player.pos.y + PLAYER_H + 0.35, player.pos.z).project(camera);
  const sx = (tmp.v.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-tmp.v.y * 0.5 + 0.5) * window.innerHeight;
  bubble.style.left = sx + 'px';
  bubble.style.top = sy + 'px';
  bubble.style.opacity = tmp.v.z < 1 ? 1 : 0;
}

function updateClouds(dt) {
  for (const c of clouds) {
    c.group.position.x += c.speed * dt;
    if (c.group.position.x > 160) c.group.position.x = -160;
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let started = false;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now() / 1000;
  const t = clock.elapsedTime;
  if (started) {
    updatePlayer(dt);
    updateCoins(dt, t);
    updateEnemies(dt, now);
    updateBlocks(dt);
    updateFlag(dt, now);
  } else if (player.mixer) {
    player.mixer.update(dt);
  }
  updateClouds(dt);
  updateCamera(dt);
  updateBubble(now);
  renderer.render(scene, camera);
}

async function main() {
  initAudio();
  buildWorld();
  player.pos.set(0, terrainHeight(0, 0), 0);
  cam.pos.set(0, 6, 9);
  cam.look.set(0, 1, 0);
  frame();
  await loadPlayer();
  $('startBtn').addEventListener('click', () => {
    unlockAudio();
    if (IS_TOUCH) goFullscreen();
    overlay.style.display = 'none';
    started = true;
    showToast('GO!', 800);
    shutUp(true);
  });
}

main();
