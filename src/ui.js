// Menu (opening page), HUD, minimap, panels (locker, settings, worlds).
import { THREE, CFG, $, player, audio, setMusic, toggleMusic, unlockAudio, quality, applyQuality, synth, showToast } from './core.js';
import { world } from './map.js';
import { renderLocker } from './locker.js';
import { renderAlbum } from './cards.js';
import { clearPadFocus } from './player.js';

export const ui = { open: true, mode: 'menu', onPlay: null, onWorld: null, onOutfit: null, onResume: null, onPenalties: null };
let mapCtx = null, mapT = 0, bigMapDirty = true;

export function initUI() {
  $('playBtn').addEventListener('click', () => { unlockAudio(); synth('power'); ui.onPlay && ui.onPlay(); });
  $('resumeBtn').addEventListener('click', () => { unlockAudio(); closeMenu(); });
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { unlockAudio(); synth('click'); showTab(b.dataset.tab); }));
  document.querySelectorAll('[data-music]').forEach((b) => b.addEventListener('click', () => { unlockAudio(); toggleMusic(); }));
  $('menuBtn').addEventListener('click', () => openMenu('pause'));
  $('fsBtn').addEventListener('click', goFullscreen);
  const c = $('minimap'); if (c) mapCtx = c.getContext('2d');
  // worlds grid
  const grid = $('worldsGrid'); grid.innerHTML = '';
  for (const w of CFG.worlds) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'wcard';
    card.innerHTML = `<img src="${w.card}" alt=""><span class="wname">${w.name}</span><span class="wsub">${w.sub}</span>`;
    card.addEventListener('click', () => { unlockAudio(); synth('power'); ui.onWorld && ui.onWorld(w); });
    grid.appendChild(card);
  }
  { const card = document.createElement('button'); card.type = 'button'; card.className = 'wcard pen'; card.innerHTML = `<img src="./public/art/keyart_bosco.jpg" alt=""><span class="wname">Penalty Shootout</span><span class="wsub">Five from the spot at the Bosco stadium</span>`; card.addEventListener('click', () => { unlockAudio(); synth('power'); ui.onPenalties && ui.onPenalties(); }); grid.appendChild(card); }
  // settings
  const q = $('qualitySel'); q.value = quality.level; q.addEventListener('change', () => { quality.level = q.value; try { localStorage.setItem('cam_quality', q.value); } catch (_) {} showToast('RELOADING…', 1200); setTimeout(() => location.reload(), 500); });
  const m = $('musicChk'); m.checked = audio.musicOn; m.addEventListener('change', () => { unlockAudio(); setMusic(m.checked); });
  setMusic(audio.musicOn);
  showTab('home');
}
export function showTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== 'tab_' + tab));
  if (tab === 'locker') { const body = $('lockerBody'); body.innerHTML = ''; renderLocker(body, (o) => ui.onOutfit && ui.onOutfit(o)); }
  if (tab === 'map') { bigMapDirty = true; drawBigMap(); }
  if (tab === 'cards') renderAlbum($('cardsBody'));
  // keep the controller focus on the tab button that was just pressed
  clearPadFocus(); const tb = document.querySelector(`[data-tab="${tab}"]`); if (tb && document.body.classList.contains('pad')) tb.classList.add('padfocus');
}
export function openMenu(mode = 'pause') {
  ui.open = true; ui.mode = mode; $('menu').hidden = false; $('menu').classList.toggle('pause', mode === 'pause');
  $('playBtn').hidden = mode === 'pause'; $('resumeBtn').hidden = mode !== 'pause';
  showTab('home');
}
export function closeMenu() { ui.open = false; $('menu').hidden = true; clearPadFocus(); ui.onResume && ui.onResume(); }
export function goFullscreen() {
  const el = document.documentElement; const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) { try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
}
export function setLocation(name, sub) {
  const b = $('locBanner'); if (!b) return;
  $('locName').textContent = name; $('locSub').textContent = sub || '';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

// ---------------------------------------------------------------------------
// Minimap (real map: roads, parks, pitches, buildings) — small radar + big map tab
// ---------------------------------------------------------------------------
const colors = { road: '#5a5c60', foot: '#8d8f93', park: '#66b04c', cem: '#4f8a43', astro: '#3fbf4a', court: '#7a7f85', water: '#3e7fcf', build: '#b89a7a', rail: '#6d6660', school: '#9d9d95' };
function drawMap(c, cx, cz, scale, W, H, detail) {
  const d = world.data; if (!d) return;
  const X = (x) => W / 2 + (x - cx) * scale, Z = (z) => H / 2 + (z - cz) * scale;
  c.fillStyle = '#9cbf79'; c.fillRect(0, 0, W, H);
  const vis = (minx, minz, maxx, maxz) => X(maxx) > -10 && X(minx) < W + 10 && Z(maxz) > -10 && Z(minz) < H + 10;
  const poly = (p, fill) => { c.fillStyle = fill; c.beginPath(); p.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.closePath(); c.fill(); };
  for (const a of d.areas) if (a.k !== 'hard') { const f = a.k === 'cemetery' ? colors.cem : a.k === 'water' ? colors.water : a.k === 'school' ? colors.school : colors.park; poly(a.p, f); }
  for (const p of d.pitches) if (p.k !== 'playground') poly(p.p, (p.surface === 'artificial_turf' || p.sport === 'soccer') ? colors.astro : colors.court);
  if (detail) for (const b of d.buildings) { if (!vis(b.p[0][0] - 40, b.p[0][1] - 40, b.p[0][0] + 40, b.p[0][1] + 40)) continue; poly(b.p, colors.build); }
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const r of d.rail) { c.strokeStyle = colors.rail; c.lineWidth = Math.max(1.5, 6 * scale); c.beginPath(); r.p.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke(); }
  for (const r of d.roads) { if (r.k === 'steps') continue; c.strokeStyle = r.w <= 2 ? colors.foot : colors.road; c.lineWidth = Math.max(r.w <= 2 ? 0.8 : 1.2, r.w * scale); c.beginPath(); r.p.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke(); }
  // shops
  if (world.shops) for (const s of world.shops) { c.fillStyle = '#14275e'; c.fillRect(X(s.x) - (detail ? 6 : 4), Z(s.z) - (detail ? 6 : 4), detail ? 12 : 8, detail ? 12 : 8); c.fillStyle = '#f2c233'; c.font = `bold ${detail ? 10 : 7}px Oswald, Impact, sans-serif`; c.textAlign = 'center'; c.fillText('S', X(s.x), Z(s.z) + (detail ? 4 : 3)); }
  // worlds
  c.font = `bold ${detail ? 13 : 9}px Oswald, Impact, sans-serif`; c.textAlign = 'center';
  for (const w of CFG.worlds) { c.fillStyle = '#ffd83d'; c.beginPath(); c.arc(X(w.x), Z(w.z), detail ? 7 : 4, 0, 7); c.fill(); c.strokeStyle = '#14275e'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#14275e'; c.fillText(w.name.toUpperCase(), X(w.x) + 1, Z(w.z) - (detail ? 12 : 7) + 1); c.fillStyle = '#fff'; c.fillText(w.name.toUpperCase(), X(w.x), Z(w.z) - (detail ? 12 : 7)); }
  // player
  c.save(); c.translate(X(player.pos.x), Z(player.pos.z)); c.rotate(-player.yaw + Math.PI);
  c.fillStyle = '#ff3b5c'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke(); c.restore();
}
export function updateMinimap(dt) {
  if (!mapCtx || ui.open) return;
  mapT -= dt; if (mapT > 0) return; mapT = 0.12;
  const c = mapCtx, W = c.canvas.width, H = c.canvas.height;
  c.save(); c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, 7); c.clip();
  drawMap(c, player.pos.x, player.pos.z, 0.9, W, H, true);
  c.restore();
}
export function drawBigMap() {
  const cv = $('bigmap'); if (!cv || !bigMapDirty) return; bigMapDirty = false;
  const c = cv.getContext('2d'); const W = cv.width, H = cv.height;
  const b = world.bounds; const scale = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0));
  drawMap(c, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, scale, W, H, true);
  c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '12px Oswald, Impact, sans-serif'; c.textAlign = 'left'; c.fillText('Map data © OpenStreetMap contributors', 8, H - 8);
}
