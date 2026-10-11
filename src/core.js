// Shared state for Cam's Shut Up World: config, DOM, audio, renderer, textures, materials, player data.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';

export { THREE };

export const IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch');

export const urlParams = new URLSearchParams(location.search);

export const CFG = {
  modelUrl: './public/models/cam.glb',
  modelB64Url: './public/models/cam.glb.b64.txt',
  modelHeight: 1.4,
  modelYawOffset: 0,
  lines: {
    shutup: ['./public/audio/shutup_1.mp3', './public/audio/shutup_2.mp3', './public/audio/shutup_3.mp3', './public/audio/shutup_4.mp3'],
    yay: ['./public/audio/yay.mp3'],
    ooh: ['./public/audio/ooh.mp3'],
    ohyeah: ['./public/audio/ohyeah.mp3'],
    ohno: ['./public/audio/ohno.mp3'],
    woohoo: ['./public/audio/woohoo.mp3'],
  },
  lineText: { shutup: 'SHUT UP!', yay: 'YAY!', ooh: 'OOH!', ohyeah: 'OH YEAH!', ohno: 'OH NO!', woohoo: 'WOO HOO!' },
  musicUrl: './public/audio/music_overworld.mp3',
  coinSfx: './public/audio/coin.mp3',
  stompSfx: './public/audio/stomp.mp3',
  textures: {
    grass: './public/textures/grass.jpg',
    dirt: './public/textures/dirt.jpg',
    brick: './public/textures/brick.jpg',
    stone: './public/textures/stone.jpg',
    bark: './public/textures/bark.jpg',
    water: './public/textures/water.jpg',
    lava: './public/textures/lava.jpg',
    metal: './public/textures/metal.jpg',
  },
  worldSize: 240,
  gravity: 24,
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 10.5,
  runShoutEvery: 1.4,
  pitch: { x: -70, z: 30, w: 40, d: 26 },   // football pitch centre + size (length along X)
};

// Quality: 'high' on desktop, 'low' on phones unless overridden in the Mods panel.
export const quality = { level: IS_TOUCH ? 'low' : 'high' };
try { const q = localStorage.getItem('cam_quality'); if (q === 'low' || q === 'high') quality.level = q; } catch (_) {}
if (urlParams.get('q') === 'low' || urlParams.get('q') === 'high') quality.level = urlParams.get('q');
export const Q = () => quality.level === 'high';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
export const $ = (id) => document.getElementById(id);
export const hud = { coins: $('coins'), lives: $('lives'), score: $('score'), shutups: $('shutups') };
export const bubble = $('bubble');
const toast = $('toast');

export function showToast(text, ms = 1600) {
  toast.textContent = text;
  toast.style.opacity = 1;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.style.opacity = 0), ms);
}

// ---------------------------------------------------------------------------
// Audio — Web Audio for voice/SFX, <audio> element for music
// ---------------------------------------------------------------------------
export const audio = { ctx: null, unlocked: false, musicOn: true, buffers: {}, lineIdx: {}, music: null, voiceGain: null, sfxGain: null, currentVoice: null, bubbleUntil: 0, lastShout: 0, count: 0 };
try { audio.musicOn = localStorage.getItem('cam_music') !== 'off'; } catch (_) {}

async function loadBuffer(url) {
  if (audio.buffers[url]) return audio.buffers[url];
  try {
    const res = await fetch(url);
    const buf = await audio.ctx.decodeAudioData(await res.arrayBuffer());
    audio.buffers[url] = buf;
    return buf;
  } catch (e) { console.warn('audio load failed', url, e); return null; }
}

export function initAudio() {
  audio.music = new Audio(CFG.musicUrl);
  audio.music.loop = true;
  audio.music.volume = 0.28;
  audio.music.preload = 'auto';
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    audio.ctx = new AC();
    audio.voiceGain = audio.ctx.createGain(); audio.voiceGain.gain.value = 1.0; audio.voiceGain.connect(audio.ctx.destination);
    audio.sfxGain = audio.ctx.createGain(); audio.sfxGain.gain.value = 0.55; audio.sfxGain.connect(audio.ctx.destination);
    [CFG.coinSfx, CFG.stompSfx, ...Object.values(CFG.lines).flat()].forEach((u) => loadBuffer(u));
  }
  updateMusicButton();
}

export function unlockAudio() {
  if (audio.unlocked) return;
  audio.unlocked = true;
  if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
  if (audio.musicOn) audio.music.play().catch(() => {});
}

export function setMusic(on) {
  audio.musicOn = on;
  try { localStorage.setItem('cam_music', on ? 'on' : 'off'); } catch (_) {}
  if (audio.music) { if (on && audio.unlocked) audio.music.play().catch(() => {}); else audio.music.pause(); }
  updateMusicButton();
}
export function toggleMusic() { setMusic(!audio.musicOn); showToast(audio.musicOn ? 'MUSIC ON' : 'MUSIC OFF', 900); }
function updateMusicButton() {
  const b = $('musicBtn'); if (!b) return;
  b.classList.toggle('off', !audio.musicOn);
  b.setAttribute('aria-pressed', audio.musicOn ? 'true' : 'false');
  b.title = audio.musicOn ? 'Music: on (tap to mute)' : 'Music: off (tap to play)';
}

function playBuffer(url, gainNode, rate = 1, cutPrevious = false) {
  if (!audio.unlocked || !audio.ctx) return null;
  const buf = audio.buffers[url];
  if (!buf) return null;
  if (cutPrevious && audio.currentVoice) { try { audio.currentVoice.stop(); } catch (_) {} }
  const src = audio.ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate; src.connect(gainNode); src.start();
  return src;
}
export function playSfx(url) { playBuffer(url, audio.sfxGain, 0.97 + Math.random() * 0.06); }

// Synth SFX (no files needed): kick, whistle, boom, zap, thwomp
export function synth(kind) {
  if (!audio.unlocked || !audio.ctx) return;
  const c = audio.ctx, t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(audio.sfxGain);
  const env = (a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  switch (kind) {
    case 'kick': o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12); env(0.005, 0.9, 0.15); break;
    case 'whistle': o.type = 'square'; o.frequency.setValueAtTime(2200, t); o.frequency.setValueAtTime(2600, t + 0.12); o.frequency.setValueAtTime(2200, t + 0.24); env(0.01, 0.25, 0.4); break;
    case 'boom': o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); env(0.005, 0.8, 0.45); break;
    case 'zap': o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.2); env(0.005, 0.4, 0.2); break;
    case 'thwomp': o.type = 'square'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25); env(0.005, 0.9, 0.3); break;
    case 'power': o.type = 'sine'; o.frequency.setValueAtTime(440, t); o.frequency.setValueAtTime(660, t + 0.08); o.frequency.setValueAtTime(880, t + 0.16); o.frequency.setValueAtTime(1320, t + 0.24); env(0.01, 0.5, 0.45); break;
    case 'jet': o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(180, t + 0.1); env(0.01, 0.12, 0.12); break;
    default: o.type = 'sine'; o.frequency.setValueAtTime(600, t); env(0.005, 0.3, 0.1);
  }
  o.start(t); o.stop(t + 0.8);
}

// Cam speaks. kind: shutup | yay | ooh | ohyeah | ohno | woohoo
export function say(kind, force = false) {
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
export const shutUp = (force = false) => say('shutup', force);

// ---------------------------------------------------------------------------
// Renderer / scene / lights
// ---------------------------------------------------------------------------
export const canvas = $('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9ff);
scene.fog = new THREE.Fog(0xbfe3ff, 60, 210);

export const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

export const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4f7a33, 0.55);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(40, 70, 30);
sun.castShadow = true;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42; sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);

export function applyQuality() {
  const high = Q();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
  const s = high ? (IS_TOUCH ? 2048 : 4096) : 1024;
  if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.fog.near = high ? 70 : 50; scene.fog.far = high ? 230 : 150;
}

export function applyViewport() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 60;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function seededRandom(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const P = CFG.pitch;
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  let flat = smoothstep(7, 18, d);
  // flatten the football pitch (with a soft apron)
  const px = Math.abs(x - P.x) - P.w / 2, pz = Math.abs(z - P.z) - P.d / 2;
  const pd = Math.max(px, pz);
  const pitchMask = smoothstep(2, 10, pd);
  flat *= pitchMask;
  const h = 2.2 * Math.sin(x * 0.07) * Math.cos(z * 0.055)
        + 1.1 * Math.sin(x * 0.19 + 1.3) * Math.sin(z * 0.13 + 0.4)
        + 0.5 * Math.sin((x + z) * 0.31)
        + 3.0 * Math.sin(x * 0.03 + 0.8) * Math.sin(z * 0.027 + 2.1);
  const pitchBase = -0.8;
  return h * flat + pitchBase * (1 - pitchMask);
}

// ---------------------------------------------------------------------------
// Textures + materials (flat colours first, texture maps swap in as they load)
// ---------------------------------------------------------------------------
const texLoader = new THREE.TextureLoader();
export const TEX = {};
export function loadTexture(name, repeat = 1, onReady) {
  const url = CFG.textures[name];
  const t = texLoader.load(url, (tex) => { if (onReady) onReady(tex); }, undefined, () => console.warn('texture missing', url));
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;   // hides any seam the generator left
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  TEX[name] = t;
  return t;
}

export const MAT = {};
export function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.terrain = std({ vertexColors: true, roughness: 0.95, map: loadTexture('grass', 48) });
  MAT.brick = std({ color: 0xffffff, roughness: 0.85, map: loadTexture('brick', 1) });
  MAT.brickDark = std({ color: 0x5a2b12, roughness: 0.9 });
  MAT.stone = std({ color: 0xffffff, roughness: 0.9, map: loadTexture('stone', 2) });
  MAT.dirt = std({ color: 0xffffff, roughness: 1, map: loadTexture('dirt', 2) });
  MAT.bark = std({ color: 0xffffff, roughness: 1, map: loadTexture('bark', 1) });
  MAT.metal = std({ color: 0xffffff, roughness: 0.45, metalness: 0.8, map: loadTexture('metal', 1) });
  MAT.water = std({ color: 0xffffff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, map: loadTexture('water', 6) });
  MAT.lava = std({ color: 0x331100, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 1.4, emissiveMap: loadTexture('lava', 3) });
  MAT.question = std({ color: 0xffc81a, roughness: 0.45, metalness: 0.15 });
  MAT.used = std({ color: 0x8a5a2b, roughness: 0.9 });
  MAT.coin = std({ color: 0xffd400, metalness: 0.9, roughness: 0.18, emissive: 0x442f00 });
  MAT.pipe = std({ color: 0xd9341f, roughness: 0.35, metalness: 0.25 });
  MAT.pipeDark = std({ color: 0xa8261a, roughness: 0.35, metalness: 0.25 });
  MAT.leaf = [0x3f9e3a, 0x2f8a46, 0x5bb448, 0x3a9a63].map((c) => std({ color: c, roughness: 0.95 }));
  MAT.cloud = std({ color: 0xffffff, roughness: 1 });
  MAT.goomba = std({ color: 0x8a4a22, roughness: 0.9 });
  MAT.goombaCap = std({ color: 0xb8713d, roughness: 0.9 });
  MAT.spot = std({ color: 0xfff1d6, roughness: 0.9 });
  MAT.eye = std({ color: 0x111111, roughness: 0.4 });
  MAT.red = std({ color: 0xd62828, roughness: 0.5 });
  MAT.spike = std({ color: 0xcfd4da, roughness: 0.3, metalness: 0.8 });
  MAT.fire = std({ color: 0xff7a00, emissive: 0xff4500, emissiveIntensity: 2.2, roughness: 1 });
  MAT.castleRoof = std({ color: 0xc8302a, roughness: 0.7 });
  MAT.pole = std({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 });
  MAT.flag = std({ color: 0x3bd36a, roughness: 0.8, side: THREE.DoubleSide });
  MAT.grassPlat = std({ color: 0xffffff, roughness: 0.95, map: TEX.grass });
  MAT.white = std({ color: 0xf4f4f4, roughness: 0.6 });
  MAT.net = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 });
  MAT.bat = std({ color: 0x3a2a4a, roughness: 0.9 });
  MAT.plant = std({ color: 0x2e8b3d, roughness: 0.9 });
  MAT.plantHead = std({ color: 0xd62828, roughness: 0.7 });
  MAT.cannon = std({ color: 0x222222, roughness: 0.6, metalness: 0.6 });
  MAT.bullet = std({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.5 });
  MAT.jetpack = std({ color: 0xff8c00, roughness: 0.4, metalness: 0.6 });
  MAT.boots = std({ color: 0x1e90ff, roughness: 0.5 });
  MAT.spring = std({ color: 0x8fff5a, roughness: 0.4, metalness: 0.5 });
  MAT.star = std({ color: 0xfff200, emissive: 0xffd000, emissiveIntensity: 1.2, roughness: 0.4 });
  MAT.giant = std({ color: 0xff3fa4, emissive: 0x80104a, emissiveIntensity: 0.6, roughness: 0.5 });
  MAT.thwomp = std({ color: 0xffffff, roughness: 0.9, map: TEX.stone });
}

// ---------------------------------------------------------------------------
// Player state (data), scoring, damage. The model/physics live in game.js.
// ---------------------------------------------------------------------------
export const player = {
  root: new THREE.Group(), model: null, mixer: null, clips: { idle: null, run: null, jump: null }, current: null,
  pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, grounded: false, jumpHeld: false,
  coins: 0, lives: 3, score: 0, hurtUntil: 0, moveTimer: 0, wasMoving: false, spin: 0, spinning: false, procBob: 0, dead: false,
  safePos: new THREE.Vector3(0, 0, 0), scale: 1, running: false,
  power: null,          // { kind, until }
  jetThrust: 0,
  stats: { stomps: 0, bonks: 0, goals: 0, flyTime: 0, flag: false, powerups: 0 },
};
scene.add(player.root);

export const mods = { jetpack: false, moon: false, giant: false, rainbow: false, speed: false };
try { Object.assign(mods, JSON.parse(localStorage.getItem('cam_mods') || '{}')); } catch (_) {}
export function saveMods() { try { localStorage.setItem('cam_mods', JSON.stringify(mods)); } catch (_) {} }

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export function addScore(n) { player.score += n; hud.score.textContent = player.score; }

export function isInvincible() {
  const now = performance.now() / 1000;
  return now < player.hurtUntil || now < (player.safeUntil || 0) || (player.power && (player.power.kind === 'star' || player.power.kind === 'giant')) || mods.giant;
}

export function hurt(kind = 'ooh', knock = null) {
  const now = performance.now() / 1000;
  if (player.dead || isInvincible()) return false;
  player.hurtUntil = now + 1.6;
  player.lives--;
  hud.lives.textContent = Math.max(0, player.lives);
  player.vel.y = 6;
  if (knock) { player.vel.x = knock.x; player.vel.z = knock.z; }
  say(kind, true);
  if (player.lives <= 0) {
    player.dead = true;
    showToast('GAME OVER', 2500);
    setTimeout(() => say('ohno', true), 700);
    setTimeout(() => emit('reset'), 2600);
  } else {
    showToast('OUCH!', 700);
  }
  return true;
}

export function respawnSafe() {
  player.pos.copy(player.safePos);
  player.pos.y += 0.5;
  player.vel.set(0, 0, 0);
}

export function addLife() { player.lives++; hud.lives.textContent = player.lives; showToast('1-UP!'); say('woohoo', true); }
