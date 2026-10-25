// Player: model/outfit loading, controller, over-the-shoulder camera, input (keyboard, mouse, touch).
import { THREE, CFG, IS_TOUCH, $, player, camera, sun, clamp, say, shutUp, synth, urlParams, canvas, showToast } from './core.js';
import { nearestShop } from './shops.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { groundAt, collideCircle, terrainHeight } from './map.js';
import { applyLocker, updateAccessories } from './locker.js';

export const input = { ix: 0, iz: 0, run: false, jumpHeld: false, jumpPressed: false, kickHeld: false, kickReleased: false, camFx: 0, camFz: 1, strafe: 0 };
export const keys = new Set();
export const cam = { yaw: Math.PI, pitch: 0.24, dist: 4.6, dragging: false, dragId: null, lastX: 0, lastY: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0, downX: 0, downY: 0, moved: false, downT: 0 };
const PR = 0.42, PH = CFG.modelHeight;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
function pickClip(clips, words) { for (const w of words) { const c = clips.find((cl) => cl.name.toLowerCase().includes(w)); if (c) return c; } return null; }
export function setClip(name, fade = 0.18) {
  const clip = player.clips[name]; if (!player.mixer || !clip || player.current === clip) return;
  const next = player.mixer.clipAction(clip); next.enabled = true;
  if (name === 'jump') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else { next.setLoop(THREE.LoopRepeat, Infinity); next.clampWhenFinished = false; }
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (player.current) player.mixer.clipAction(player.current).fadeOut(fade);
  player.current = clip;
}
async function loadModel(loader, url) {
  if (!urlParams.has('b64')) { try { return await loader.loadAsync(url); } catch (e) { console.warn('GLB load failed, trying base64 copy', e); } }
  const res = await fetch(url + CFG.modelB64Suffix); if (!res.ok) throw new Error('base64 model missing: ' + res.status);
  const bin = atob((await res.text()).trim()); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
let loading = false;
export async function loadOutfit(def, status) {
  if (loading) return; loading = true;
  if (status) status(`Loading ${def.name}…`);
  const loader = new GLTFLoader(); let model, anims = [];
  try { const gltf = await loadModel(loader, def.url); model = gltf.scene; anims = gltf.animations || []; }
  catch (err) { console.warn('outfit failed', def.id, err); loading = false; if (player.model) { showToast('OUTFIT NOT AVAILABLE', 1000); return; } model = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: 0x1d2a6b })); m.position.y = 0.7; model.add(m); }
  if (player.model) { player.root.remove(player.model); if (player.mixer) player.mixer.stopAllAction(); }
  player.bones = {}; player.current = null; player.mixer = null;
  const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
  model.scale.setScalar(CFG.modelHeight / Math.max(size.y, 0.001)); box.setFromObject(model);
  model.position.y -= box.min.y; model.position.x -= (box.min.x + box.max.x) / 2; model.position.z -= (box.min.z + box.max.z) / 2;
  model.traverse((o) => {
    if (o.isBone || o.type === 'Bone' || (o.name && /Head|Spine|Hips|Hand|neck/i.test(o.name))) player.bones[o.name] = o;
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { o.material.side = THREE.DoubleSide; if (o.material.transparent && o.material.opacity > 0.95) o.material.transparent = false; if (o.material.map) o.material.map.anisotropy = 8; } }
  });
  if (anims.length) {
    player.mixer = new THREE.AnimationMixer(model);
    player.clips.idle = pickClip(anims, ['idle', 'stand']) || anims[0]; player.clips.run = pickClip(anims, ['run', 'jog', 'walk']); player.clips.jump = pickClip(anims, ['jump', 'leap']); player.clips.dance = pickClip(anims, ['dance', 'night']);
    setClip('idle', 0);
  } else player.clips = { idle: null, run: null, jump: null, dance: null };
  player.model = model; player.root.add(model); model.userData.baseY = model.position.y;
  applyLocker();
  if (status) status('Cam is ready!');
  loading = false;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
let kickDown = false, kickWasDown = false;
// Xbox controller (standard mapping): left stick move, right stick look, A jump, X kick (hold to charge), B ball, Y emote, RB/RT run, Menu = menu, View = map
export const pad = { on: false, id: '', ix: 0, iz: 0, jump: false, kick: false, run: false, prev: [], buttons: [] };
let padHandlers = null;
const PAD_KEYS = { 1: 'KeyB', 3: 'KeyG', 9: 'Escape', 8: 'KeyN', 0: 'KeyE' };   // A also talks when someone is in front of Cam
// --- focus navigation for menus / chats (shared with the keyboard arrows) ---
function focusables() {
  const root = [...document.querySelectorAll('#dialog, #packReveal, #menu')].find((el) => el && !el.hidden); if (!root) return [];
  return [...root.querySelectorAll('button, [data-tab], .wcard, .chips button, select, input, a.btn')].filter((el) => !el.hidden && !el.disabled && el.offsetParent !== null && el.getClientRects().length);
}
export function padNav(sx, sy) {
  const els = focusables(); if (!els.length) return;
  let cur = els.find((e) => e.classList.contains('padfocus'));
  if (!cur) { cur = els.find((e) => e.id === 'resumeBtn' || e.id === 'playBtn') || els[0]; cur.classList.add('padfocus'); }
  const cr = cur.getBoundingClientRect(); const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
  let best = null, bd = 1e9;
  for (const e of els) { if (e === cur) continue; const r = e.getBoundingClientRect(); const ex = r.left + r.width / 2, ey = r.top + r.height / 2; const dx = ex - cx, dy = ey - cy; const along = dx * sx + dy * sy; if (along < 8) continue; const perp = Math.abs(dx * sy) + Math.abs(dy * sx); const d = along + perp * 2.2; if (d < bd) { bd = d; best = e; } }
  if (best) { cur.classList.remove('padfocus'); best.classList.add('padfocus'); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
export function padActivate() {
  const cur = focusables().find((e) => e.classList.contains('padfocus')); if (!cur) return false;
  if (cur.tagName === 'SELECT') { const i = (cur.selectedIndex + 1) % cur.options.length; cur.selectedIndex = i; cur.dispatchEvent(new Event('change')); return true; }
  if (cur.tagName === 'INPUT' && cur.type === 'checkbox') { cur.checked = !cur.checked; cur.dispatchEvent(new Event('change')); return true; }
  cur.click(); return true;
}
export function clearPadFocus() { document.querySelectorAll('.padfocus').forEach((e) => e.classList.remove('padfocus')); }
export function pollPad(uiOpen) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
  for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
  if (!gp) for (const p of pads) if (p && p.connected) { gp = p; break; }
  pad.ix = pad.iz = 0; pad.jump = pad.kick = pad.run = false;
  if (!gp) { pad.buttons = []; return; }
  const b = gp.buttons.map((x) => x.pressed || x.value > 0.5); const ax = gp.axes;
  const pressed = (i) => b[i] && !pad.prev[i];
  if (!pad.on && (b.some(Boolean) || ax.some((v) => Math.abs(v) > 0.4))) { pad.on = true; pad.id = gp.id; document.body.classList.add('pad'); showToast('XBOX CONTROLLER READY', 1400); }
  if (pad.on) {
    if (uiOpen) {
      // menus and chats: d-pad / left stick moves a focus ring between the buttons, A presses, B goes back, bumpers switch tabs
      const dz = (v) => (Math.abs(v) < 0.5 ? 0 : Math.sign(v));
      const sx = dz(ax[0] || 0) || (b[15] ? 1 : b[14] ? -1 : 0), sy = dz(ax[1] || 0) || (b[13] ? 1 : b[12] ? -1 : 0);
      pad.navT = (pad.navT || 0) - 1 / 60;
      if ((sx || sy) && (pad.navT <= 0 || (sx !== pad.lastSx || sy !== pad.lastSy))) { pad.navT = 0.22; padNav(sx, sy); } else if (!sx && !sy) pad.navT = 0;
      pad.lastSx = sx; pad.lastSy = sy;
      if (pressed(0)) { if (!padActivate()) { const play = $('playBtn'), res = $('resumeBtn'); if (play && !play.hidden && !play.disabled) play.click(); else if (res && !res.hidden) res.click(); } }
      if (pressed(1) && padHandlers && padHandlers.key) padHandlers.key('Escape');
      if (pressed(2) && padHandlers && padHandlers.key) padHandlers.key('KeyX');
      if ((pressed(4) || pressed(5)) && document.querySelector('#dialog.shop:not([hidden])')) { const stabs = [...document.querySelectorAll('.stab')]; const cur = Math.max(0, stabs.findIndex((t) => t.classList.contains('on'))); const nx = stabs[(cur + (pressed(5) ? 1 : stabs.length - 1)) % stabs.length]; if (nx) nx.click(); }
      else if (pressed(4) || pressed(5)) { const tabs = [...document.querySelectorAll('[data-tab]')]; const cur = Math.max(0, tabs.findIndex((t) => t.classList.contains('on'))); const nx = tabs[(cur + (pressed(5) ? 1 : tabs.length - 1)) % tabs.length]; if (nx) nx.click(); }
    } else {
      const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      pad.ix = dz(ax[0] || 0); pad.iz = dz(ax[1] || 0);
      if (b[14]) pad.ix -= 1; if (b[15]) pad.ix += 1; if (b[12]) pad.iz -= 1; if (b[13]) pad.iz += 1;
      const lx = dz(ax[2] || 0), ly = dz(ax[3] || 0);
      cam.yaw -= lx * 0.055; cam.pitch = clamp(cam.pitch + ly * 0.03, -0.2, 1.1);
      pad.jump = b[0]; pad.kick = b[2]; pad.run = b[5] || b[7] || b[4] || Math.hypot(pad.ix, pad.iz) > 0.9;
      for (const [i, code] of Object.entries(PAD_KEYS)) if (pressed(+i) && padHandlers && padHandlers.key) padHandlers.key(code);
      if (pressed(6)) cam.dist = cam.dist > 6 ? 4.5 : 8;   // LT toggles a wider camera
    }
  }
  pad.prev = b; pad.buttons = b;
}
export function bindInput(handlers) {
  padHandlers = handlers;
  window.addEventListener('gamepadconnected', (e) => { pad.on = true; pad.id = e.gamepad.id; document.body.classList.add('pad'); showToast('XBOX CONTROLLER READY', 1400); });
  window.addEventListener('gamepaddisconnected', () => { pad.on = false; document.body.classList.remove('pad'); });
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (handlers.key) handlers.key(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  // mouse: drag = look; press/hold = kick charge, release = kick
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') { if (cam.dragging) return; cam.dragging = true; cam.dragId = e.pointerId; cam.lastX = e.clientX; cam.lastY = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} return; }
    if (e.button === 0) { kickDown = true; }
    cam.dragging = true; cam.dragId = e.pointerId; cam.lastX = cam.downX = e.clientX; cam.lastY = cam.downY = e.clientY; cam.moved = false; cam.downT = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const end = (e) => { if (e.pointerId !== cam.dragId) return; cam.dragging = false; cam.dragId = null; if (e.pointerType !== 'touch') kickDown = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointermove', (e) => {
    if (!cam.dragging || e.pointerId !== cam.dragId) return;
    const k = e.pointerType === 'touch' ? 0.009 : 0.005;
    cam.yaw -= (e.clientX - cam.lastX) * k; cam.pitch = clamp(cam.pitch + (e.clientY - cam.lastY) * k * 0.7, -0.2, 1.1);
    cam.lastX = e.clientX; cam.lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.01, 2.8, 10); }, { passive: true });
  // touch controls
  const stick = $('stick'), knob = $('knob');
  const touch = { active: false, id: null, dx: 0, dy: 0 };
  stick.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.active = true; touch.id = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (_) {} move(e); });
  stick.addEventListener('pointermove', (e) => { if (touch.active && e.pointerId === touch.id) move(e); });
  const endStick = (e) => { if (e.pointerId === touch.id) { touch.active = false; touch.dx = touch.dy = 0; knob.style.transform = ''; } };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick); stick.addEventListener('lostpointercapture', endStick);
  function move(e) { const r = stick.getBoundingClientRect(); let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } touch.dx = dx; touch.dy = dy; knob.style.transform = `translate(${dx * r.width * 0.3}px, ${dy * r.width * 0.3}px)`; }
  const btn = (id, down, up) => { const b = $(id); if (!b) return; b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); down(); try { b.setPointerCapture(e.pointerId); } catch (_) {} }); const u = () => { b.classList.remove('down'); up && up(); }; b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('lostpointercapture', u); };
  const tb = { jump: false, kick: false };
  btn('jumpBtn', () => (tb.jump = true), () => (tb.jump = false));
  btn('kickBtn', () => (tb.kick = true), () => (tb.kick = false));
  btn('emoteBtn', () => handlers.key && handlers.key('KeyG'));
  btn('ballBtn', () => handlers.key && handlers.key('KeyB'));
  ['touchstart', 'touchmove'].forEach((t) => document.addEventListener(t, (e) => { if (e.target.closest('#menu, #panel, button, select, label, input, .btns, a')) return; e.preventDefault(); }, { passive: false }));
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  input._touch = touch; input._tb = tb;
}
export function readInput() {
  const t = input._touch, tb = input._tb;
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (t && t.active) { ix += t.dx; iz += t.dy; }
  ix += pad.ix; iz += pad.iz;
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  input.ix = ix; input.iz = iz; input.strafe = ix;
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || (t && t.active && len > 0.75) || pad.run;
  const jump = keys.has('Space') || (tb && tb.jump) || (pad.jump && !nearestShop());
  input.jumpPressed = jump && !input.jumpHeld; input.jumpHeld = jump;
  const kick = keys.has('KeyF') || kickDown || (tb && tb.kick) || pad.kick;
  input.kickReleased = kickWasDown && !kick; input.kickHeld = kick; kickWasDown = kick;
  if (keys.has('KeyQ')) cam.yaw += 0.04; if (keys.has('KeyX')) cam.yaw -= 0.04;
  input.camFx = -Math.sin(cam.yaw); input.camFz = -Math.cos(cam.yaw);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
let jumpBufferT = 0, coyoteT = 0, bumpCool = 0;
export function updatePlayer(dt) {
  const { ix, iz, run } = input;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const wx = fx * -iz + rx * ix, wz = fz * -iz + rz * ix;
  const len = Math.hypot(ix, iz), moving = len > 0.08;
  const speed = (run ? CFG.runSpeed : CFG.walkSpeed) * (player.kicking > 0 ? 0.5 : 1) * (player.boostT > 0 ? 1.35 : 1);
  const accel = player.grounded ? 36 : 14;
  const tx = moving ? wx * speed * Math.min(1, len * 1.2) : 0, tz = moving ? wz * speed * Math.min(1, len * 1.2) : 0;
  player.vel.x += (tx - player.vel.x) * Math.min(1, accel * dt / speed); player.vel.z += (tz - player.vel.z) * Math.min(1, accel * dt / speed);
  player.running = run && moving;
  if (moving && player.emoting) { player.emoting = false; setClip('idle'); }
  // no shouting while running about: Cam only says it when he spawns, now and then when he leaves an area, and on the odd big shot
  player.wasMoving = moving;
  if (moving) { const target = Math.atan2(wx, wz); let d = target - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += d * Math.min(1, 14 * dt); }
  else if (input.kickHeld) { const target = cam.yaw + Math.PI; let d = target - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += d * Math.min(1, 10 * dt); }
  player.kicking = Math.max(0, player.kicking - dt);

  // jump with buffering + coyote time
  if (input.jumpHeld && !player._jumpWas) jumpBufferT = 0.15; player._jumpWas = input.jumpHeld;
  jumpBufferT = Math.max(0, jumpBufferT - dt); coyoteT = player.grounded ? 0.12 : Math.max(0, coyoteT - dt);
  if (jumpBufferT > 0 && coyoteT > 0) { player.vel.y = CFG.jumpSpeed * (run ? 1.06 : 1); player.grounded = false; coyoteT = 0; jumpBufferT = 0; player.emoting = false; }
  else if (!input.jumpHeld && player.vel.y > 3 && !player.grounded) player.vel.y = 3;

  player.vel.y -= CFG.gravity * dt; player.vel.y = Math.max(player.vel.y, -30);
  player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt; player.pos.y += player.vel.y * dt;
  // world collision
  const res = collideCircle(player.pos.x, player.pos.z, PR, player.pos.y + 0.3, PH);
  player.pos.x = res.x; player.pos.z = res.z;
  const g = groundAt(player.pos.x, player.pos.z).y;
  const snap = player.grounded ? 0.5 : 0.08;
  if (player.pos.y <= g || (player.vel.y <= 0 && player.pos.y - g < snap)) { if (!player.grounded && player.vel.y < -9) synth('bounce', 0.3); player.pos.y = g; player.vel.y = 0; player.grounded = true; } else player.grounded = false;

  // animation
  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (player.mixer) {
    if (player.emoting && player.clips.dance) setClip('dance');
    else if (!player.grounded) setClip(player.clips.jump ? 'jump' : 'idle');
    else if (hs > 0.8) setClip(player.clips.run ? 'run' : 'idle');
    else setClip('idle');
    if (player.current) { const act = player.mixer.clipAction(player.current); act.timeScale = (player.grounded && hs > 0.8 && player.current === player.clips.run) ? Math.max(0.8, hs / CFG.walkSpeed) : 1; }
    player.mixer.update(dt);
  }
  if (player.model) { player.model.rotation.x = player.kickCharge > 0 ? -0.15 * player.kickCharge : player.kicking > 0 ? 0.25 : 0; }
  player.root.position.copy(player.pos); player.root.rotation.y = player.yaw;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
export function updateCamera(dt) {
  const t = player.pos; const side = 0.6;
  const cx = t.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist + Math.cos(cam.yaw) * side, cz = t.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist - Math.sin(cam.yaw) * side;
  const cy = t.y + 1.4 + Math.sin(cam.pitch) * cam.dist;
  // keep the camera out of buildings/walls: pull it in along the ray if blocked
  let px = cx, pz = cz, py = cy;
  const r = collideCircle(cx, cz, 0.5, cy - 0.5, 1); if (r.hit) { px = t.x + (r.x - t.x) * 0.92; pz = t.z + (r.z - t.z) * 0.92; }
  _v.set(px, Math.max(py, terrainHeight(px, pz) + 0.7), pz);
  cam.pos.lerp(_v, Math.min(1, 10 * dt));
  _v2.set(t.x + Math.cos(cam.yaw) * side, t.y + 1.25, t.z - Math.sin(cam.yaw) * side);
  cam.look.lerp(_v2, Math.min(1, 12 * dt));
  camera.position.copy(cam.pos);
  if (cam.shake > 0) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake = Math.max(0, cam.shake - dt * 1.2); }
  camera.lookAt(cam.look);
  sun.position.set(t.x + 60, t.y + 90, t.z + 40); sun.target.position.copy(t);
}
export function teleport(x, z, yaw = Math.PI) {
  player.pos.set(x, groundAt(x, z).y + 0.2, z); player.vel.set(0, 0, 0); player.grounded = true;
  player.yaw = yaw + Math.PI; if (player.root) player.root.rotation.y = player.yaw;
  cam.yaw = yaw; cam.pos.set(x + Math.sin(yaw) * 5, player.pos.y + 3, z + Math.cos(yaw) * 5); cam.look.set(x, player.pos.y + 1, z);
}
export function toggleEmote() {
  if (!player.clips.dance) { showToast('NO EMOTE FOR THIS OUTFIT', 900); return; }
  if (player.emoting) { player.emoting = false; setClip('idle'); return; }
  if (!player.grounded) return;
  player.emoting = true; setClip('dance', 0.25); say('woohoo', true);
}
