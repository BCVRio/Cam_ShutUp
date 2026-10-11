// Cam's Shut Up World — main module: player, input, camera, HUD panels, missions, loop.
import {
  THREE, CFG, IS_TOUCH, Q, quality, $, hud, bubble, showToast, audio, initAudio, unlockAudio, toggleMusic, setMusic, playSfx, synth, say, shutUp,
  canvas, renderer, scene, camera, sun, applyQuality, applyViewport, terrainHeight, clamp, buildMaterials, MAT, TEX,
  player, mods, saveMods, bus, emit, addScore, hurt, respawnSafe, addLife, isInvincible, urlParams,
} from './core.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { buildWorld, updateWorld, platforms, coins, trunks, flag, addCoin, lavaPools, pond } from './world.js';
import { populate, updateEntities, resetEntities, POWER, setShake, givePower } from './entities.js';
import { buildPitch, updateFootball, resetFootball, match, inPitch } from './football.js';

const overlay = $('overlay');
const loadStatus = $('loadStatus');

// ---------------------------------------------------------------------------
// Player model
// ---------------------------------------------------------------------------
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
  for (const w of words) { const c = clips.find((cl) => cl.name.toLowerCase().includes(w)); if (c) return c; }
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

async function loadModel(loader) {
  const forceB64 = urlParams.has('b64');
  if (!forceB64) {
    try { return await loader.loadAsync(CFG.modelUrl); } catch (e) { console.warn('GLB load failed, trying base64 copy', e); }
  }
  const res = await fetch(CFG.modelB64Url);
  if (!res.ok) throw new Error('base64 model missing: ' + res.status);
  const b64 = await res.text();
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}

const playerMats = [];   // materials on Cam, for star/rainbow tinting
let jetpackMesh = null, flames = [], jetLight = null;

function buildJetpack() {
  const g = new THREE.Group();
  for (const sx of [-0.17, 0.17]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 12), MAT.jetpack); t.position.set(sx, 0.95, -0.28); g.add(t);
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 12), MAT.metal); n.position.set(sx, 0.62, -0.28); n.rotation.x = Math.PI; g.add(n);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 10), new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.9 }));
    fl.position.set(sx, 0.2, -0.28); fl.rotation.x = Math.PI; fl.visible = false; g.add(fl); flames.push(fl);
  }
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.08), MAT.metal); strap.position.set(0, 0.95, -0.2); g.add(strap);
  jetLight = new THREE.PointLight(0xff9a3c, 0, 5, 2); jetLight.position.set(0, 0.3, -0.3); g.add(jetLight);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.visible = false;
  player.root.add(g);
  jetpackMesh = g;
}

async function loadPlayer() {
  const loader = new GLTFLoader();
  let model;
  try {
    const gltf = await loadModel(loader);
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    model.scale.setScalar(CFG.modelHeight / Math.max(size.y, 0.001));
    box.setFromObject(model);
    model.position.y -= box.min.y;
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.rotation.y = CFG.modelYawOffset;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (o.material) {
          o.material.side = THREE.DoubleSide;
          if (o.material.transparent && o.material.opacity > 0.95) o.material.transparent = false;
          if (o.material.map) o.material.map.anisotropy = 8;
          if (o.material.emissive) playerMats.push(o.material);
        }
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
  buildJetpack();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyM') toggleMusic();
  if (e.code === 'Escape') closePanel();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); if (audio.music) audio.music.pause(); }
  else if (audio.unlocked && audio.musicOn && audio.music) audio.music.play().catch(() => {});
});

function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) { try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
}

// Camera orbit: mouse drag anywhere on the canvas, or touch drag (stick/jump capture their own pointers).
const cam = { yaw: Math.PI, pitch: 0.36, dist: Number(urlParams.get('dist')) || 6.5, dragging: false, dragId: null, lastX: 0, lastY: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0 };
if (urlParams.has('yaw')) cam.yaw = Number(urlParams.get('yaw'));
setShake((amt) => { cam.shake = Math.max(cam.shake, amt); });

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
  cam.pitch = clamp(cam.pitch + (e.clientY - cam.lastY) * k * 0.7, 0.1, 1.2);
  cam.lastX = e.clientX; cam.lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.01, 4, 14); }, { passive: true });

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
  knob.style.transform = `translate(${dx * r.width * 0.3}px, ${dy * r.width * 0.3}px)`;
}
jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.jump = true; jumpBtn.classList.add('down'); try { jumpBtn.setPointerCapture(e.pointerId); } catch (_) {} });
const endJump = () => { touch.jump = false; jumpBtn.classList.remove('down'); };
jumpBtn.addEventListener('pointerup', endJump); jumpBtn.addEventListener('pointercancel', endJump); jumpBtn.addEventListener('lostpointercapture', endJump);
// Stop iOS scrolling/zooming under the game controls, but never on buttons/panels (that would swallow their clicks).
['touchstart', 'touchmove'].forEach((t) => document.addEventListener(t, (e) => { if (e.target.closest('#overlay, .btns, #panel, button, select, label, input')) return; e.preventDefault(); }, { passive: false }));
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// HUD buttons (click works on touch because we don't preventDefault on buttons)
$('musicBtn').addEventListener('click', () => { unlockAudio(); toggleMusic(); });
$('fsBtn').addEventListener('click', goFullscreen);
$('modsBtn').addEventListener('click', () => openPanel('mods'));
$('missionsBtn').addEventListener('click', () => openPanel('missions'));
$('panelClose').addEventListener('click', closePanel);
$('panel').addEventListener('click', (e) => { if (e.target === $('panel')) closePanel(); });

// ---------------------------------------------------------------------------
// Panels: Mods + Missions
// ---------------------------------------------------------------------------
const MOD_DEFS = [
  { key: 'jetpack', label: 'Infinite jetpack', desc: 'Hold jump in the air to fly, forever.' },
  { key: 'moon', label: 'Moon gravity', desc: 'Float like it is 1969.' },
  { key: 'giant', label: 'Giant Cam', desc: 'Twice the size, crushes anything he touches.' },
  { key: 'speed', label: 'Speed demon', desc: 'Everything is faster. Good luck stopping.' },
  { key: 'rainbow', label: 'Rainbow mode', desc: 'Cam glows through every colour.' },
];

const MISSIONS = [
  { id: 'coins50', label: 'Collect 50 coins', goal: 50, ev: 'coin', reward: 500 },
  { id: 'stomp10', label: 'Squash 10 enemies', goal: 10, ev: 'stomp', reward: 500 },
  { id: 'bonk5', label: 'Bonk 5 question blocks', goal: 5, ev: 'bonk', reward: 300 },
  { id: 'goals3', label: 'Score 3 goals in one football match', goal: 3, ev: 'goal', reward: 800, perMatch: true },
  { id: 'fly20', label: 'Fly with a jetpack for 20 seconds', goal: 20, ev: 'fly', reward: 400 },
  { id: 'summit', label: 'Climb the Sky Tower', goal: 1, ev: 'summit', reward: 1000 },
  { id: 'flag', label: 'Reach the castle flag', goal: 1, ev: 'flag', reward: 1000 },
  { id: 'power5', label: 'Grab 5 power-ups', goal: 5, ev: 'power', reward: 300 },
];
const progress = {};
try { Object.assign(progress, JSON.parse(localStorage.getItem('cam_missions') || '{}')); } catch (_) {}
function saveProgress() { try { localStorage.setItem('cam_missions', JSON.stringify(progress)); } catch (_) {} }

function bump(ev, amount = 1) {
  for (const m of MISSIONS) {
    if (m.ev !== ev) continue;
    const p = progress[m.id] || (progress[m.id] = { n: 0, done: false });
    if (p.done) continue;
    p.n = m.perMatch ? match.goals : Math.min(m.goal, p.n + amount);
    if (p.n >= m.goal) {
      p.done = true; p.n = m.goal;
      addScore(m.reward);
      showToast('MISSION COMPLETE!', 1800);
      say('woohoo', true);
      synth('power');
    }
  }
  saveProgress();
  if (panelMode === 'missions') renderPanel();
}
['coin', 'stomp', 'bonk', 'goal', 'flag', 'power', 'summit'].forEach((ev) => bus.addEventListener(ev, () => bump(ev)));

let panelMode = null;
function openPanel(mode) { panelMode = mode; renderPanel(); $('panel').hidden = false; }
function closePanel() { panelMode = null; $('panel').hidden = true; }

function renderPanel() {
  const body = $('panelBody'), title = $('panelTitle');
  body.innerHTML = '';
  if (panelMode === 'mods') {
    title.textContent = 'MODS';
    for (const d of MOD_DEFS) {
      const row = document.createElement('label'); row.className = 'row';
      row.innerHTML = `<span><b>${d.label}</b><small>${d.desc}</small></span><input type="checkbox" id="mod_${d.key}" ${mods[d.key] ? 'checked' : ''}><i class="sw"></i>`;
      row.querySelector('input').addEventListener('change', (e) => { mods[d.key] = e.target.checked; saveMods(); synth('power'); if (d.key === 'giant' && !mods.giant && !(player.power && player.power.kind === 'giant')) { /* shrink handled in update */ } });
      body.appendChild(row);
    }
    const q = document.createElement('label'); q.className = 'row';
    q.innerHTML = `<span><b>Graphics quality</b><small>High: 4K shadows, dense grass, more trees. Low is kinder to phones. World detail applies after a restart.</small></span><select id="qualitySel"><option value="high">High</option><option value="low">Low</option></select>`;
    q.querySelector('select').value = quality.level;
    q.querySelector('select').addEventListener('change', (e) => { quality.level = e.target.value; try { localStorage.setItem('cam_quality', quality.level); } catch (_) {} applyQuality(); showToast(quality.level === 'high' ? 'HIGH QUALITY' : 'LOW QUALITY', 900); });
    body.appendChild(q);
    const m = document.createElement('label'); m.className = 'row';
    m.innerHTML = `<span><b>Music</b><small>Overworld theme on or off (also the M key or the note button).</small></span><input type="checkbox" id="mod_music" ${audio.musicOn ? 'checked' : ''}><i class="sw"></i>`;
    m.querySelector('input').addEventListener('change', (e) => { unlockAudio(); setMusic(e.target.checked); });
    body.appendChild(m);
  } else {
    title.textContent = 'MISSIONS';
    for (const m of MISSIONS) {
      const p = progress[m.id] || { n: 0, done: false };
      const n = m.perMatch && !p.done ? match.goals : p.n;
      const row = document.createElement('div'); row.className = 'row mission' + (p.done ? ' done' : '');
      row.innerHTML = `<span><b>${p.done ? '&#10004; ' : ''}${m.label}</b><small>${p.done ? 'Done! +' + m.reward : n + ' / ' + m.goal + ' · reward ' + m.reward}</small></span><i class="bar"><i style="width:${Math.min(100, (n / m.goal) * 100)}%"></i></i>`;
      body.appendChild(row);
    }
    const info = document.createElement('p'); info.className = 'note';
    info.textContent = 'Find the football pitch to the west, the Sky Tower spiral to the north-east, and the castle flag to the north. Power-ups respawn after 40 seconds.';
    body.appendChild(info);
  }
}

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------
const PR = () => 0.38 * player.scale;
const PH = () => CFG.modelHeight * player.scale;
const tmp = { v: new THREE.Vector3(), v2: new THREE.Vector3() };
let safeTimer = 0, jetSoundT = 0, summitDone = false;

function groundAt(x, z, feetY, vy) {
  let g = terrainHeight(x, z);
  const r = PR();
  for (const p of platforms) {
    if (x + r < p.min.x || x - r > p.max.x || z + r < p.min.z || z - r > p.max.z) continue;
    const top = p.max.y;
    if (feetY >= top - 0.35 && vy <= 0.01 && top > g) g = top;
  }
  return g;
}

function resolveSolids(pos, vy, dt) {
  const r = PR(), h = PH();
  const feet = pos.y, head = pos.y + h;
  for (const p of platforms) {
    const inX = pos.x + r > p.min.x && pos.x - r < p.max.x;
    const inZ = pos.z + r > p.min.z && pos.z - r < p.max.z;
    if (!inX || !inZ) continue;
    const overlapY = head > p.min.y + 0.05 && feet < p.max.y - 0.3;
    if (!overlapY) continue;
    if (vy > 0 && head - vy * dt <= p.min.y + 0.05 && head > p.min.y) {
      pos.y = p.min.y - h - 0.01;
      hitBlock(p);
      player.vel.y = -1;
      continue;
    }
    const dxL = (pos.x + r) - p.min.x, dxR = p.max.x - (pos.x - r);
    const dzL = (pos.z + r) - p.min.z, dzR = p.max.z - (pos.z - r);
    const m = Math.min(dxL, dxR, dzL, dzR);
    if (m === dxL) pos.x = p.min.x - r; else if (m === dxR) pos.x = p.max.x + r; else if (m === dzL) pos.z = p.min.z - r; else pos.z = p.max.z + r;
  }
  for (const t of trunks) {
    const dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz), rr = t.r + r;
    if (d < rr && d > 0.0001 && feet < terrainHeight(t.x, t.z) + 2.5) { pos.x = t.x + (dx / d) * rr; pos.z = t.z + (dz / d) * rr; }
  }
  const lim = CFG.worldSize / 2 - 2;
  pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
}

function hitBlock(p) {
  if (p.type === 'castle' || p.type === 'pipe') return;
  p.bump = 1;
  if (p.type === 'question' && !p.used) {
    p.used = true; player.stats.bonks++;
    p.mesh.material = MAT.used;
    p.mesh.children.forEach((c) => (c.visible = false));
    const c = addCoin(p.mesh.position.x, p.max.y + 0.6, p.mesh.position.z);
    collectCoin(c, true);
    say('ohyeah', true);
    emit('bonk');
  } else {
    if (p.type === 'brick') addScore(10);
    say('ooh', true);
  }
}

function collectCoin(c, fromBlock = false) {
  if (c.taken) return;
  c.taken = true;
  player.coins++;
  hud.coins.textContent = player.coins;
  addScore(100);
  playSfx(CFG.coinSfx);
  if (!fromBlock) say('yay');
  if (player.coins % 25 === 0) addLife();
  c.mesh.userData.flyT = 0;
  emit('coin');
}

function resetGame() {
  player.lives = 3; player.coins = 0; player.score = 0; player.dead = false;
  hud.lives.textContent = 3; hud.coins.textContent = 0; hud.score.textContent = 0;
  player.pos.set(0, terrainHeight(0, 0) + 0.5, 0); player.safePos.set(0, terrainHeight(0, 0), 0);
  player.vel.set(0, 0, 0);
  for (const c of coins) { c.taken = false; c.mesh.visible = true; c.mesh.position.copy(c.base); c.mesh.scale.setScalar(1); }
  for (const p of platforms) if (p.type === 'question') { p.used = false; p.mesh.material = MAT.question; p.mesh.children.forEach((c) => (c.visible = true)); }
  if (flag) flag.reached = false;
  resetEntities();
  resetFootball();
}
bus.addEventListener('reset', resetGame);

function updatePlayer(dt) {
  const now = performance.now() / 1000;
  // power-up expiry
  if (player.power && now > player.power.until) { player.power = null; showToast('POWER DOWN', 700); }
  const pk = player.power ? player.power.kind : null;
  const jetOn = pk === 'jetpack' || mods.jetpack;
  const targetScale = (pk === 'giant' || mods.giant) ? 2 : 1;
  player.scale += (targetScale - player.scale) * Math.min(1, 6 * dt);
  player.root.scale.setScalar(player.scale);

  // --- input ---
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
  player.running = running;
  let speedMul = 1;
  if (pk === 'boots') speedMul *= 1.7;
  if (mods.speed) speedMul *= 1.6;
  if (player.scale > 1.3) speedMul *= 1.15;
  const speed = (running ? CFG.runSpeed : CFG.walkSpeed) * speedMul;
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
    let d = target - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, 14 * dt);
  }

  // --- jump / jetpack ---
  const jumpPressed = keys.has('Space') || touch.jump;
  let jumpMul = 1;
  if (pk === 'spring') jumpMul *= 1.5;
  if (mods.moon) jumpMul *= 0.85;
  // jump buffering (press up to 0.15s before landing) + coyote time (0.12s after stepping off an edge)
  if (jumpPressed && !player.jumpHeld) player.jumpBufferT = 0.15;
  player.jumpBufferT = Math.max(0, (player.jumpBufferT || 0) - dt);
  player.coyoteT = player.grounded ? 0.12 : Math.max(0, (player.coyoteT || 0) - dt);
  let jumpedNow = false;
  if (player.jumpBufferT > 0 && player.coyoteT > 0 && !player.dead) {
    player.vel.y = CFG.jumpSpeed * (running ? 1.08 : 1) * jumpMul;
    player.grounded = false; player.coyoteT = 0; player.jumpBufferT = 0; jumpedNow = true;
    player.spinning = !player.clips.jump;
    player.spin = 0;
    shutUp(true);
  }
  let thrusting = false;
  if (jetOn && jumpPressed && !player.grounded && !jumpedNow && !player.dead && player.jumpHeld) {
    thrusting = true;
    player.vel.y = Math.min(player.vel.y + 42 * dt, 9.5);
    player.stats.flyTime += dt;
    bump('fly', 0); // keep panel fresh; progress added below
    const fp = progress.fly20 || (progress.fly20 = { n: 0, done: false });
    if (!fp.done) { fp.n = Math.min(20, fp.n + dt); if (fp.n >= 20) bump('fly', 1); }
    jetSoundT -= dt; if (jetSoundT <= 0) { synth('jet'); jetSoundT = 0.12; }
  } else if (!jumpPressed && player.vel.y > 3 && !player.grounded) player.vel.y = 3;
  player.jumpHeld = jumpPressed;
  player.jetThrust += ((thrusting ? 1 : 0) - player.jetThrust) * Math.min(1, 12 * dt);

  const g = CFG.gravity * (mods.moon ? 0.38 : 1);
  player.vel.y -= g * dt;
  player.vel.y = Math.max(player.vel.y, -30);
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  resolveSolids(player.pos, player.vel.y, dt);

  const gy = groundAt(player.pos.x, player.pos.z, player.pos.y, player.vel.y);
  const snapRange = player.grounded ? 0.45 : 0.08;
  if (player.pos.y <= gy || (player.vel.y <= 0 && player.pos.y - gy < snapRange)) {
    player.pos.y = gy; player.vel.y = 0; player.grounded = true; player.spinning = false;
  } else player.grounded = false;

  // pond
  if (player.pos.y < -3.2 && Math.hypot(player.pos.x - pond.x, player.pos.z - pond.z) < pond.r) { if (hurt('ohno')) respawnSafe(); else { player.pos.copy(player.safePos); player.pos.y += 0.5; } }

  // remember a safe spot (solid ground, no lava, no water)
  safeTimer -= dt;
  if (player.grounded && safeTimer <= 0) {
    const onLava = lavaPools.some((l) => Math.hypot(player.pos.x - l.x, player.pos.z - l.z) < l.r + 1.5);
    const nearPond = Math.hypot(player.pos.x - pond.x, player.pos.z - pond.z) < pond.r + 1.5;
    if (!onLava && !nearPond) { player.safePos.copy(player.pos); safeTimer = 0.5; }
  }

  // summit check
  if (!summitDone && player.grounded) {
    for (const p of platforms) if (p.summit && player.pos.x > p.min.x && player.pos.x < p.max.x && player.pos.z > p.min.z && player.pos.z < p.max.z && Math.abs(player.pos.y - p.max.y) < 0.2) {
      summitDone = true; addScore(1000); showToast('SKY TOWER CLEARED!', 2500); say('woohoo', true); emit('summit');
    }
  }

  // --- animation ---
  const hspeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.mixer) {
    if (!player.grounded) setClip(player.clips.jump ? 'jump' : 'idle');
    else if (hspeed > 0.8) setClip(player.clips.run ? 'run' : 'idle');
    else setClip('idle');
    if (player.current) {
      const act = player.mixer.clipAction(player.current);
      act.timeScale = (player.grounded && hspeed > 0.8 && player.current === player.clips.run) ? Math.max(0.8, hspeed / (CFG.walkSpeed * player.scale)) : 1;
    }
    player.mixer.update(dt);
  }
  if (player.model) {
    const m = player.model;
    let bob = 0, lean = 0;
    if (player.grounded && hspeed > 0.8 && !player.clips.run) { player.procBob += dt * hspeed * 2.2; bob = Math.abs(Math.sin(player.procBob)) * 0.12; lean = 0.12; }
    if (player.spinning) player.spin += dt * 9;
    m.rotation.y = CFG.modelYawOffset + (player.spinning ? player.spin : 0);
    m.rotation.x = lean + (thrusting ? 0.25 : 0);
    m.position.y = bob + (m.userData.baseY ?? (m.userData.baseY = m.position.y));
    m.visible = now < player.hurtUntil ? Math.floor(now * 16) % 2 === 0 : true;
  }
  // jetpack visuals
  if (jetpackMesh) {
    jetpackMesh.visible = jetOn;
    const f = player.jetThrust;
    flames.forEach((fl, i) => { fl.visible = f > 0.05; fl.scale.set(1, f * (0.8 + Math.sin(now * 40 + i) * 0.3), 1); });
    jetLight.intensity = f * 3;
  }
  // star / rainbow tint
  const starOn = pk === 'star' || mods.rainbow;
  if (playerMats.length) {
    for (const mat of playerMats) {
      if (starOn) { mat.emissive.setHSL((now * 1.5) % 1, 1, 0.5); mat.emissiveIntensity = 0.45; }
      else if (mat.emissiveIntensity !== 0) { mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0; }
    }
  }

  player.root.position.copy(player.pos);
  player.root.rotation.y = player.yaw;
}

function updateCoins(dt, t) {
  const p = player.pos;
  const reach = 1.15 * player.scale;
  for (const c of coins) {
    const m = c.mesh;
    if (c.taken) {
      if (m.userData.flyT !== undefined && m.userData.flyT < 1) {
        m.userData.flyT += dt * 2.2; m.position.y += dt * 6; m.scale.setScalar(1 - m.userData.flyT); m.rotation.y += dt * 20;
        if (m.userData.flyT >= 1) m.visible = false;
      }
      continue;
    }
    if (Math.abs(m.position.x - p.x) > 20 || Math.abs(m.position.z - p.z) > 20) continue;
    m.rotation.y = t * 3 + c.spin;
    m.position.y = c.base.y + Math.sin(t * 2.5 + c.spin) * 0.12;
    const dy = m.position.y - (p.y + 0.7 * player.scale);
    if (Math.abs(dy) < 1.2 * player.scale && Math.hypot(m.position.x - p.x, m.position.z - p.z) < reach) collectCoin(c);
  }
}

function updateFlag() {
  if (!flag) return;
  if (!flag.reached && Math.hypot(player.pos.x - flag.x, player.pos.z - flag.z) < 1.6) {
    flag.reached = true; player.stats.flag = true;
    addScore(1000); say('woohoo', true); showToast('COURSE CLEAR!', 3000); emit('flag');
  }
}

function updateCamera(dt) {
  const target = player.pos;
  const dist = cam.dist * (0.8 + player.scale * 0.2);
  const cx = target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
  const cz = target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
  const cy = target.y + 1.2 * player.scale + Math.sin(cam.pitch) * dist;
  tmp.v.set(cx, Math.max(cy, terrainHeight(cx, cz) + 1.2), cz);
  cam.pos.lerp(tmp.v, Math.min(1, 7 * dt));
  tmp.v2.set(target.x, target.y + 1.1 * player.scale, target.z);
  cam.look.lerp(tmp.v2, Math.min(1, 10 * dt));
  camera.position.copy(cam.pos);
  if (cam.shake > 0) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.2); }
  camera.lookAt(cam.look);
  sun.position.set(target.x + 40, target.y + 70, target.z + 30);
  sun.target.position.copy(target);
}

function updateBubble(now) {
  if (now > audio.bubbleUntil) { bubble.style.opacity = 0; return; }
  tmp.v.set(player.pos.x, player.pos.y + PH() + 0.35, player.pos.z).project(camera);
  bubble.style.left = (tmp.v.x * 0.5 + 0.5) * window.innerWidth + 'px';
  bubble.style.top = (-tmp.v.y * 0.5 + 0.5) * window.innerHeight + 'px';
  bubble.style.opacity = tmp.v.z < 1 ? 1 : 0;
}

const powerBar = $('powerBar'), powerLabel = $('powerLabel'), powerFill = $('powerFill');
function updatePowerHud(now) {
  if (player.power) {
    powerBar.hidden = false;
    powerLabel.textContent = POWER[player.power.kind].label;
    powerFill.style.width = Math.max(0, (player.power.until - now) / player.power.total * 100) + '%';
  } else powerBar.hidden = true;
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
    updateEntities(dt, t);
    updateFootball(dt, t);
    updateFlag();
    updatePowerHud(now);
  } else if (player.mixer) player.mixer.update(dt);
  updateWorld(dt, t);
  updateCamera(dt);
  updateBubble(now);
  renderer.render(scene, camera);
}

async function main() {
  applyQuality();
  applyViewport();
  window.addEventListener('resize', applyViewport);
  window.addEventListener('orientationchange', () => setTimeout(applyViewport, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applyViewport);
  initAudio();
  buildMaterials();
  buildWorld();
  buildPitch();
  populate();
  player.pos.set(0, terrainHeight(0, 0), 0);
  if (urlParams.has('at')) { const [ax, az] = urlParams.get('at').split(',').map(Number); player.pos.set(ax, terrainHeight(ax, az) + 0.5, az); }
  player.safePos.copy(player.pos);
  player.grounded = true;
  cam.pos.set(player.pos.x, player.pos.y + 6, player.pos.z + 9); cam.look.set(player.pos.x, player.pos.y + 1, player.pos.z);
  frame();
  await loadPlayer();
  $('startBtn').addEventListener('click', () => {
    unlockAudio();
    if (IS_TOUCH) goFullscreen();
    overlay.style.display = 'none';
    started = true;
    player.safeUntil = performance.now() / 1000 + 3;   // a few safe seconds at spawn (no flicker)
    showToast('GO!', 800);
    shutUp(true);
  });
  // debug: ?power=jetpack, window.__cam for test probes
  if (urlParams.has('power')) setTimeout(() => givePower(urlParams.get('power')), 500);
  window.__cam = { player, keys, cam, match };
}

main();
