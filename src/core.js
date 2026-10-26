// Cam's Shut Up: SE London — shared core (config, audio, renderer, materials, player state).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js/+esm';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js/+esm';
import { GTAOPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/GTAOPass.js/+esm';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm';
import { SMAAPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/SMAAPass.js/+esm';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js/+esm';
import { CSM } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/csm/CSM.js/+esm';
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
  sfx: { crowdLoop: './public/audio/crowd_stadium_loop.mp3', crowdGoal: './public/audio/crowd_stadium_goal.mp3', groan: './public/audio/crowd_stadium_groan.mp3', chant: './public/audio/crowd_penalty_chant.mp3', kidsCheer: './public/audio/crowd_kids_cheer.mp3', parkClap: './public/audio/crowd_park_clap.mp3', playground: './public/audio/amb_playground.mp3', meow: './public/audio/cat_meow.mp3', pigeons: './public/audio/pigeons.mp3', carPass: './public/audio/car_pass.mp3', whistle: './public/audio/ref_whistle.mp3', bell: './public/audio/shop_bell.mp3', shopHi1: './public/audio/shop_hi1.mp3', shopHi2: './public/audio/shop_hi2.mp3', shopHi3: './public/audio/shop_hi3.mp3', shopBye: './public/audio/shop_bye.mp3' },
  coinSfx: './public/audio/coin.mp3',
  textures: {
    grass: './public/textures/grass.jpg', dirt: './public/textures/dirt.jpg', brick: './public/textures/brick.jpg', stone: './public/textures/stone.jpg', bark: './public/textures/bark.jpg',
    water: './public/textures/water.jpg', metal: './public/textures/metal.jpg', planks: './public/textures/planks.jpg', concrete: './public/textures/concrete.jpg',
    terrace: './public/textures/facade_terrace.jpg', flats: './public/textures/facade_flats.jpg', slate: './public/textures/slate.jpg', tarmac: './public/textures/tarmac.jpg',
    victorian: './public/textures/facade_victorian.jpg', edwardian: './public/textures/facade_edwardian.jpg', shopfront: './public/textures/facade_shop.jpg',
    shopInterior: './public/art/shop_interior.jpg',
    sky: './public/textures/sky.jpg', foliage: './public/textures/foliage.jpg', crowd: './public/textures/crowd.jpg', ball: './public/textures/ball.jpg', cloud: './public/textures/cloud.png', glow: './public/textures/glow.png',
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

// low: phones that struggle · high: PBR materials, image-based lighting, bloom, anti-aliasing · ultra: + cascaded shadows, ambient occlusion, grass
export const LEVELS = ['low', 'high', 'ultra'];
export const quality = { level: IS_TOUCH ? 'high' : 'ultra' };
try { const q = localStorage.getItem('cam_quality'); if (LEVELS.includes(q)) quality.level = q; } catch (_) {}
if (LEVELS.includes(urlParams.get('q'))) quality.level = urlParams.get('q');
export const Q = () => quality.level !== 'low';
export const QU = () => quality.level === 'ultra';

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
    [CFG.coinSfx, ...Object.values(CFG.lines).flat(), ...Object.values(CFG.sfx)].forEach((u) => loadBuffer(u));
    audio.ambGain = audio.ctx.createGain(); audio.ambGain.gain.value = 0; audio.ambGain.connect(audio.ctx.destination);
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
export function playSfx(url, vol = 1) {
  if (!audio.unlocked || !audio.ctx) return; const buf = audio.buffers[url]; if (!buf) return;
  const src = audio.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.97 + Math.random() * 0.06;
  const g = audio.ctx.createGain(); g.gain.value = vol; src.connect(g); g.connect(audio.sfxGain); src.start();
}
// one looping ambience bed at a time (crowd murmur, playground), cross-faded
const amb = { url: null, src: null, target: 0 };
export function setAmbience(url, vol) {
  if (!audio.ctx) return;
  if (url !== amb.url) {
    if (amb.src) { try { amb.src.stop(audio.ctx.currentTime + 1.2); } catch (_) {} amb.src = null; }
    amb.url = url;
    if (url && audio.unlocked && audio.buffers[url]) { const s = audio.ctx.createBufferSource(); s.buffer = audio.buffers[url]; s.loop = true; s.connect(audio.ambGain); s.start(); amb.src = s; }
    else if (url) amb.url = null;   // not loaded yet, retry next call
  }
  const g = audio.ambGain.gain; const want = url ? vol : 0;
  if (Math.abs(amb.target - want) > 0.01) { amb.target = want; g.cancelScheduledValues(audio.ctx.currentTime); g.setTargetAtTime(want * 0.6, audio.ctx.currentTime, 0.8); }
}
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
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q(), powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe9f3, 160, 520);
export const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1400);
export const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5f6f4a, Q() ? 0.35 : 0.65); scene.add(hemi);
export const SUN_DIR = new THREE.Vector3(60, 90, 40).normalize();
export const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(60, 90, 40); sun.castShadow = true;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);

// Cascaded shadow maps (ultra): crisp shadows from Cam's feet to the far end of the street
export let csm = null;
export function initLighting() {
  if (!QU()) return;
  try {
    csm = new CSM({ camera, parent: scene, cascades: 3, maxFar: 240, mode: 'practical', shadowMapSize: 2048, shadowBias: -0.00025, lightDirection: SUN_DIR.clone().negate(), lightIntensity: 2.4, lightNear: 1, lightFar: 600, lightMargin: 120, fade: true });
    for (const l of csm.lights) { l.color.setHex(0xfff0d8); l.shadow.normalBias = 0.05; }
    sun.visible = false; sun.castShadow = false;
  } catch (e) { console.warn('CSM unavailable', e); csm = null; }
}
export function setupMaterial(m) { if (csm && m && m.isMeshStandardMaterial && !m.userData.csm) { csm.setupMaterial(m); m.userData.csm = true; } return m; }
export function setupObject(root) { if (!csm) return; root.traverse((o) => { if (o.material) { if (Array.isArray(o.material)) o.material.forEach(setupMaterial); else setupMaterial(o.material); } }); }

// Image-based lighting from the Higgsfield sky panorama
export function loadEnvironment() {
  if (!Q()) return;
  new THREE.TextureLoader().load(CFG.textures.sky, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t; scene.backgroundIntensity = 1.0;
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(t).texture; scene.environmentIntensity = 0.7; pm.dispose();
  });
}

// Post-processing: ambient occlusion (ultra), bloom, filmic output, SMAA
export let composer = null; let gtao = null, bloom = null, smaa = null;
export function initPost() {
  if (!Q()) return;
  try {
    const w = window.innerWidth, h = window.innerHeight;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    if (QU() && !IS_TOUCH) {
      gtao = new GTAOPass(scene, camera, w, h); gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85; composer.addPass(gtao);
    }
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.5, 0.93); composer.addPass(bloom);
    composer.addPass(new OutputPass());
    smaa = new SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); composer.addPass(smaa);
  } catch (e) { console.warn('post-processing unavailable', e); composer = null; }
}
export function render() { if (csm) csm.update(); if (composer) composer.render(); else renderer.render(scene, camera); }

export function applyQuality() {
  const high = Q();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.5 : 1));
  const s = high ? (IS_TOUCH ? 2048 : 4096) : 1024;
  if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.fog.near = high ? 200 : 110; scene.fog.far = high ? 620 : 360;
}
export function applyViewport() {
  const w = window.innerWidth, h = window.innerHeight; camera.aspect = w / h; camera.fov = w < h ? 74 : 60; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  if (composer) composer.setSize(w, h); if (smaa) smaa.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); if (csm) csm.updateFrustums();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function seededRandom(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// ---------------------------------------------------------------------------
// Textures + materials
// ---------------------------------------------------------------------------
const texLoader = new THREE.TextureLoader();
export const TEX = {};
const PBR = new Set(['grass', 'dirt', 'brick', 'stone', 'bark', 'metal', 'planks', 'concrete', 'terrace', 'flats', 'slate', 'tarmac', 'pavement', 'astro', 'seats', 'foliage', 'ball', 'victorian', 'edwardian', 'shopfront']);
export function loadTexture(name, rx = 1, ry = rx, mirrored = true, kind = '') {
  const url = kind ? CFG.textures[name].replace(/\.(jpg|png)$/, `_${kind}.jpg`) : CFG.textures[name];
  const t = texLoader.load(url, undefined, undefined, () => console.warn('texture missing', name, kind));
  t.wrapS = t.wrapT = mirrored ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  t.repeat.set(rx, ry); if (!kind) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  TEX[name + kind] = t; return t;
}
// A physically based material: albedo + derived normal and roughness maps (high/ultra), albedo only on low
export function pbr(name, rx = 1, ry = rx, mirrored = true, extra = {}) {
  const o = { color: 0xffffff, roughness: 1, map: loadTexture(name, rx, ry, mirrored), ...extra };
  if (Q() && PBR.has(name)) { o.normalMap = loadTexture(name, rx, ry, mirrored, 'n'); o.normalScale = new THREE.Vector2(extra.bump ?? 1, extra.bump ?? 1); o.roughnessMap = loadTexture(name, rx, ry, mirrored, 'r'); }
  delete o.bump;
  return new THREE.MeshStandardMaterial(o);
}
export const MAT = {};
export const FAR_FADE = { value: 0 };   // metres: fragments of the 'far' materials closer than this to the camera are discarded
function makeFar(m, key) {
  const prev = m.onBeforeCompile;   // CSM's hook, when cascaded shadows are on
  m.onBeforeCompile = (shader, r) => {
    if (prev && m.userData.csm) prev(shader, r);
    shader.uniforms.uFade = FAR_FADE;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFarPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvFarPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFade; varying vec3 vFarPos;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uFade > 0.0 && distance(vFarPos, cameraPosition) < uFade) discard;');
  };
  m.customProgramCacheKey = () => key + (m.userData.csm ? 'csm' : '');
}
export function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.ground = pbr('grass', 1, 1, true, { vertexColors: true, bump: 0.6 });
  MAT.tarmac = pbr('tarmac', 1, 1, false, { bump: 0.8 });
  MAT.pavement = pbr('pavement', 1, 1, false, { bump: 0.9 });
  MAT.terrace = pbr('terrace', 1, 1, false, { vertexColors: true, bump: 0.8 });
  MAT.terraceB = pbr('victorian', 1, 1, false, { vertexColors: true, bump: 0.9 });
  MAT.terraceC = pbr('edwardian', 1, 1, false, { vertexColors: true, bump: 0.9 });
  MAT.shopfront = pbr('shopfront', 1, 1, false, { vertexColors: true, bump: 0.8 });
  MAT.flats = pbr('flats', 1, 1, false, { bump: 0.7 });
  MAT.brick = pbr('brick', 1, 1, false, { bump: 1.0 });
  MAT.concrete = pbr('concrete', 1, 1, false, { bump: 0.6 });
  MAT.slate = pbr('slate', 1, 1, true, { bump: 1.0 });
  MAT.stone = pbr('stone', 1, 1, false, { bump: 1.0 });
  MAT.astro = pbr('astro', 1, 1, false, { bump: 0.5 });
  MAT.seats = pbr('seats', 1, 1, false, { bump: 0.6 });
  MAT.bark = pbr('bark', 1, 1, true, { bump: 1.2 });
  MAT.metal = pbr('metal', 1, 1, true, { metalness: 0.85, bump: 0.5 });
  MAT.water = std({ color: 0xffffff, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.86, map: loadTexture('water', 40) });
  MAT.planks = pbr('planks', 1, 1, true, { bump: 0.8 });
  MAT.foliage = pbr('foliage', 1, 1, true, { bump: 1.0 });
  MAT.crowd = std({ color: 0xffffff, roughness: 0.9, map: loadTexture('crowd', 1, 1, true) });
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
  { // goal net: a real mesh texture (white cord grid with holes) instead of a wireframe box
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); g.strokeStyle = '#f4f4f4'; g.lineWidth = 5;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; TEX.net = t;
    MAT.net = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false });
  }
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
  MAT.glowSprite = new THREE.SpriteMaterial({ map: loadTexture('glow', 1, 1, false), color: 0xfff2cc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  MAT.terraceFar = MAT.terraceB.clone(); MAT.slateFar = MAT.slate.clone();   // distant versions of the modelled terraces (cut away near the camera)
  for (const v of Object.values(MAT)) { if (Array.isArray(v)) v.forEach(setupMaterial); else setupMaterial(v); }
  for (const [m, key] of [[MAT.terraceFar, 'terraceFar'], [MAT.slateFar, 'slateFar']]) makeFar(m, key);
}

// ---------------------------------------------------------------------------
// Player state (controller in player.js)
// ---------------------------------------------------------------------------
export const player = {
  root: new THREE.Group(), model: null, mixer: null, clips: { idle: null, run: null, jump: null, dance: null }, current: null, bones: {},
  pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, grounded: false, jumpHeld: false, running: false,
  moveTimer: 0, wasMoving: false, emoting: false, score: 0, goals: 0, collected: 0, world: null, kickCharge: 0, kicking: 0, boostT: 0,
};
scene.add(player.root);
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export function addScore(n) { player.score += n; const e = $('score'); if (e) e.textContent = player.score; }
