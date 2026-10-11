// Cam's Shut Up: SE London — shared core (config, audio, renderer, materials, player state).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
export { THREE };

export const IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch');
export const urlParams = new URLSearchParams(location.search);
export const $ = (id) => document.getElementById(id);

export const CFG = {
  mapUrl: './public/maps/selondon.json',
  modelHeight: 1.4,
  modelB64Suffix: '.b64.txt',
  lines: {
    shutup: ['./public/audio/shutup_1.mp3', './public/audio/shutup_2.mp3', './public/audio/shutup_3.mp3', './public/audio/shutup_4.mp3'],
    yay: ['./public/audio/yay.mp3'], ooh: ['./public/audio/ooh.mp3'], ohyeah: ['./public/audio/ohyeah.mp3'], ohno: ['./public/audio/ohno.mp3'], woohoo: ['./public/audio/woohoo.mp3'],
  },
  musicUrl: './public/audio/music_overworld.mp3',
  coinSfx: './public/audio/coin.mp3',
  textures: {
    grass: './public/textures/grass.jpg', dirt: './public/textures/dirt.jpg', brick: './public/textures/brick.jpg', stone: './public/textures/stone.jpg', bark: './public/textures/bark.jpg',
    water: './public/textures/water.jpg', metal: './public/textures/metal.jpg', planks: './public/textures/planks.jpg', concrete: './public/textures/concrete.jpg',
    terrace: './public/textures/facade_terrace.jpg', flats: './public/textures/facade_flats.jpg', slate: './public/textures/slate.jpg', tarmac: './public/textures/tarmac.jpg',
    pavement: './public/textures/pavement.jpg', astro: './public/textures/astro.jpg', seats: './public/textures/seats.jpg', crest: './public/art/crest_bosco.png',
  },
  gravity: 24, walkSpeed: 5.5, runSpeed: 9.5, jumpSpeed: 8.5, runShoutEvery: 1.6,
  // the four worlds (local metres: x east, z south). Centres from OpenStreetMap.
  worlds: [
    { id: 'nunhead', name: 'Nunhead', sub: 'Nunhead Green & the station', x: -294, z: 412, radius: 170, card: './public/art/pc_nunhead.jpg' },
    { id: 'stadium', name: 'Bosco FC Stadium', sub: 'Home of Team Bosco', x: -108, z: -193, radius: 110, card: './public/art/keyart_bosco.jpg' },
    { id: 'cage', name: 'The Cage', sub: 'Edmund Waller School, Telegraph Hill', x: 298, z: -252, radius: 120, card: './public/art/pc_cage.jpg' },
    { id: 'park', name: 'Dr Harold Moody Park', sub: 'Consort Road, Nunhead', x: -455, z: 158, radius: 120, card: './public/art/pc_park.jpg' },
  ],
};

export const quality = { level: IS_TOUCH ? 'low' : 'high' };
try { const q = localStorage.getItem('cam_quality'); if (q === 'low' || q === 'high') quality.level = q; } catch (_) {}
if (urlParams.get('q') === 'low' || urlParams.get('q') === 'high') quality.level = urlParams.get('q');
export const Q = () => quality.level === 'high';

export function showToast(text, ms = 1600) {
  const t = $('toast'); if (!t) return;
  t.textContent = text; t.style.opacity = 1;
  clearTimeout(showToast._t); showToast._t = setTimeout(() => (t.style.opacity = 0), ms);
}
export function feed(text, ms = 3200) {
  const f = $('feed'); if (!f) return;
  const row = document.createElement('div'); row.className = 'feedRow'; row.textContent = text; f.appendChild(row);
  while (f.children.length > 4) f.removeChild(f.firstChild);
  setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 400); }, ms);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
export const audio = { ctx: null, unlocked: false, musicOn: true, buffers: {}, lineIdx: {}, music: null, voiceGain: null, sfxGain: null, currentVoice: null, lastShout: 0, count: 0 };
try { audio.musicOn = localStorage.getItem('cam_music') !== 'off'; } catch (_) {}
async function loadBuffer(url) {
  if (audio.buffers[url]) return audio.buffers[url];
  try { const res = await fetch(url); const buf = await audio.ctx.decodeAudioData(await res.arrayBuffer()); audio.buffers[url] = buf; return buf; }
  catch (e) { console.warn('audio load failed', url, e); return null; }
}
export function initAudio() {
  audio.music = new Audio(CFG.musicUrl); audio.music.loop = true; audio.music.volume = 0.18; audio.music.preload = 'auto';
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    audio.ctx = new AC();
    audio.voiceGain = audio.ctx.createGain(); audio.voiceGain.gain.value = 1.0; audio.voiceGain.connect(audio.ctx.destination);
    audio.sfxGain = audio.ctx.createGain(); audio.sfxGain.gain.value = 0.5; audio.sfxGain.connect(audio.ctx.destination);
    [CFG.coinSfx, ...Object.values(CFG.lines).flat()].forEach((u) => loadBuffer(u));
  }
}
export function unlockAudio() {
  if (audio.unlocked) return; audio.unlocked = true;
  if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
  if (audio.musicOn) audio.music.play().catch(() => {});
}
export function setMusic(on) {
  audio.musicOn = on; try { localStorage.setItem('cam_music', on ? 'on' : 'off'); } catch (_) {}
  if (audio.music) { if (on && audio.unlocked) audio.music.play().catch(() => {}); else audio.music.pause(); }
  document.querySelectorAll('[data-music]').forEach((b) => b.classList.toggle('off', !on));
}
export function toggleMusic() { setMusic(!audio.musicOn); showToast(audio.musicOn ? 'MUSIC ON' : 'MUSIC OFF', 800); }
function playBuffer(url, gainNode, rate = 1, cutPrevious = false) {
  if (!audio.unlocked || !audio.ctx) return null;
  const buf = audio.buffers[url]; if (!buf) return null;
  if (cutPrevious && audio.currentVoice) { try { audio.currentVoice.stop(); } catch (_) {} }
  const src = audio.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate; src.connect(gainNode); src.start();
  return src;
}
export function playSfx(url) { playBuffer(url, audio.sfxGain, 0.97 + Math.random() * 0.06); }
export function synth(kind, vol = 1) {
  if (!audio.unlocked || !audio.ctx) return;
  const c = audio.ctx, t = c.currentTime; const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(audio.sfxGain);
  const env = (a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  switch (kind) {
    case 'kick': o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.1); env(0.004, 0.9, 0.16); break;
    case 'tap': o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06); env(0.003, 0.35, 0.08); break;
    case 'bounce': o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.08); env(0.003, 0.3, 0.1); break;
    case 'post': o.type = 'square'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.15); env(0.002, 0.3, 0.3); break;
    case 'whistle': o.type = 'square'; o.frequency.setValueAtTime(2200, t); o.frequency.setValueAtTime(2600, t + 0.12); o.frequency.setValueAtTime(2200, t + 0.24); env(0.01, 0.25, 0.4); break;
    case 'crowd': o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(140, t + 0.8); env(0.2, 0.2, 1.4); break;
    case 'power': o.type = 'sine'; o.frequency.setValueAtTime(440, t); o.frequency.setValueAtTime(660, t + 0.08); o.frequency.setValueAtTime(880, t + 0.16); o.frequency.setValueAtTime(1320, t + 0.24); env(0.01, 0.5, 0.45); break;
    case 'click': o.type = 'square'; o.frequency.setValueAtTime(1200, t); env(0.002, 0.15, 0.05); break;
    case 'fence': o.type = 'triangle'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.2); env(0.002, 0.35, 0.25); break;
    default: o.type = 'sine'; o.frequency.setValueAtTime(600, t); env(0.005, 0.3, 0.1);
  }
  o.start(t); o.stop(t + 1.6);
}
export function say(kind, force = false) {
  const now = performance.now() / 1000;
  if (!force && now - audio.lastShout < 0.3) return;
  audio.lastShout = now;
  if (kind === 'shutup') { audio.count++; const e = $('shutups'); if (e) e.textContent = audio.count; }
  const list = CFG.lines[kind] || CFG.lines.shutup; const i = (audio.lineIdx[kind] || 0) % list.length; audio.lineIdx[kind] = i + 1;
  const src = playBuffer(list[i], audio.voiceGain, 0.94 + Math.random() * 0.14, true); if (src) audio.currentVoice = src;
}
export const shutUp = (force = false) => say('shutup', force);

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
export const canvas = $('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8e8ff, 160, 520);
export const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1400);
export const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5f6f4a, 0.65); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(60, 90, 40); sun.castShadow = true;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
export function applyQuality() {
  const high = Q();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
  const s = high ? (IS_TOUCH ? 2048 : 4096) : 1024;
  if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.fog.near = high ? 180 : 110; scene.fog.far = high ? 560 : 360;
}
export function applyViewport() { const w = window.innerWidth, h = window.innerHeight; camera.aspect = w / h; camera.fov = w < h ? 74 : 60; camera.updateProjectionMatrix(); renderer.setSize(w, h); }

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function seededRandom(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// ---------------------------------------------------------------------------
// Textures + materials
// ---------------------------------------------------------------------------
const texLoader = new THREE.TextureLoader();
export const TEX = {};
export function loadTexture(name, rx = 1, ry = rx, mirrored = true) {
  const t = texLoader.load(CFG.textures[name], undefined, undefined, () => console.warn('texture missing', name));
  t.wrapS = t.wrapT = mirrored ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  TEX[name] = t; return t;
}
export const MAT = {};
export function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.ground = std({ vertexColors: true, roughness: 0.95, map: loadTexture('grass', 1) });
  MAT.tarmac = std({ color: 0xffffff, roughness: 0.95, map: loadTexture('tarmac', 1, 1, false) });
  MAT.pavement = std({ color: 0xffffff, roughness: 0.95, map: loadTexture('pavement', 1, 1, false) });
  MAT.terrace = std({ vertexColors: true, roughness: 0.9, map: loadTexture('terrace', 1, 1, false) });
  MAT.flats = std({ color: 0xffffff, roughness: 0.85, map: loadTexture('flats', 1, 1, false) });
  MAT.brick = std({ color: 0xffffff, roughness: 0.9, map: loadTexture('brick', 1, 1, false) });
  MAT.concrete = std({ color: 0xffffff, roughness: 0.9, map: loadTexture('concrete', 1, 1, false) });
  MAT.slate = std({ color: 0xffffff, roughness: 0.95, map: loadTexture('slate', 1, 1, false) });
  MAT.stone = std({ color: 0xffffff, roughness: 0.9, map: loadTexture('stone', 1, 1, false) });
  MAT.astro = std({ color: 0xffffff, roughness: 0.9, map: loadTexture('astro', 1, 1, false) });
  MAT.seats = std({ color: 0xffffff, roughness: 0.7, map: loadTexture('seats', 1, 1, false) });
  MAT.bark = std({ color: 0xffffff, roughness: 1, map: loadTexture('bark', 1) });
  MAT.metal = std({ color: 0xffffff, roughness: 0.45, metalness: 0.8, map: loadTexture('metal', 1) });
  MAT.water = std({ color: 0xffffff, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.86, map: loadTexture('water', 40) });
  MAT.planks = std({ color: 0xffffff, roughness: 0.85, map: loadTexture('planks', 1) });
  MAT.crest = std({ color: 0xffffff, roughness: 0.7, map: loadTexture('crest', 1, 1, false) });
  MAT.grassPark = std({ color: 0x79b65a, roughness: 0.95 });
  MAT.cemetery = std({ color: 0x5d8a4e, roughness: 0.95 });
  MAT.hard = std({ color: 0x8e8f93, roughness: 0.95 });
  MAT.leaf = [0x3f9e3a, 0x2f8a46, 0x5bb448, 0x3a9a63].map((c) => std({ color: c, roughness: 0.95 }));
  MAT.fenceGreen = std({ color: 0x2f7a3e, roughness: 0.6, metalness: 0.4 });
  MAT.fenceGrey = std({ color: 0x6b7078, roughness: 0.6, metalness: 0.5 });
  MAT.hedge = std({ color: 0x3e7d32, roughness: 1 });
  MAT.wallBrick = std({ color: 0x9c6a48, roughness: 0.95 });
  MAT.white = std({ color: 0xf4f4f4, roughness: 0.6 });
  MAT.red = std({ color: 0xd62828, roughness: 0.5 });
  MAT.navy = std({ color: 0x14275e, roughness: 0.6 });
  MAT.gold = std({ color: 0xd9a21b, metalness: 0.6, roughness: 0.35 });
  MAT.eye = std({ color: 0x111111, roughness: 0.4 });
  MAT.pole = std({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 });
  MAT.net = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 });
  MAT.rail = std({ color: 0x7c7f86, metalness: 0.8, roughness: 0.4 });
  MAT.ballast = std({ color: 0x8b8578, roughness: 1 });
  MAT.botDark = std({ color: 0x2b2f36, roughness: 0.6, metalness: 0.5 });
  MAT.skin = std({ color: 0xe8b894, roughness: 0.8 });
  MAT.kitHome = std({ color: 0x14275e, roughness: 0.7 });
  MAT.kitAway = std({ color: 0xe03b3b, roughness: 0.7 });
  MAT.kitKeeper = std({ color: 0x39c26b, roughness: 0.7 });
  MAT.llama = [0xff4fa3, 0x4fd0ff, 0xffd84f, 0x7cff4f, 0xb04fff].map((c) => std({ color: c, roughness: 0.8 }));
  MAT.potion = std({ color: 0x3aa5ff, transparent: true, opacity: 0.85, roughness: 0.2 });
  MAT.collect = std({ color: 0xffd400, metalness: 0.8, roughness: 0.25, emissive: 0x3a2a00 });
  MAT.bench = std({ color: 0x5a3a1e, roughness: 0.9 });
  MAT.postbox = std({ color: 0xc8161d, roughness: 0.6 });
  MAT.lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff1c0 });
}

// ---------------------------------------------------------------------------
// Player state (controller in player.js)
// ---------------------------------------------------------------------------
export const player = {
  root: new THREE.Group(), model: null, mixer: null, clips: { idle: null, run: null, jump: null, dance: null }, current: null, bones: {},
  pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, grounded: false, jumpHeld: false, running: false,
  moveTimer: 0, wasMoving: false, emoting: false, score: 0, goals: 0, collected: 0, world: null, kickCharge: 0, kicking: 0,
};
scene.add(player.root);
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export function addScore(n) { player.score += n; const e = $('score'); if (e) e.textContent = player.score; }
