// Cam's Shut Up: SE London — main loop.
import { THREE, CFG, IS_TOUCH, $, player, renderer, scene, camera, applyQuality, applyViewport, initAudio, unlockAudio, buildMaterials, say, shutUp, synth, showToast, feed, addScore, bus, urlParams, toggleMusic } from './core.js';
import { loadWorld, buildWorld, nearestWorld, groundAt, world } from './map.js';
import { buildArenas, updateFootball, kickBallToMe, activeArena, arenas, arenaSpawn } from './football.js';
import { bindInput, readInput, updatePlayer, updateCamera, loadOutfit, teleport, toggleEmote, input, cam, keys } from './player.js';
import { locker, outfitDef, updateAccessories } from './locker.js';
import { initUI, ui, openMenu, closeMenu, setLocation, updateMinimap, goFullscreen } from './ui.js';

const status = (t) => { const e = $('loadStatus'); if (e) e.textContent = t; };
let started = false, lastWorldId = null;
const clock = new THREE.Clock();
const FAST = urlParams.has('fast'); const STEPS = FAST ? Math.max(1, Number(urlParams.get('fast')) || 1) : 1; let simT = 0, frames = 0;

function buildSky() {
  const geo = new THREE.SphereGeometry(1200, 24, 12);
  const col = new Float32Array(geo.attributes.position.count * 3); const top = new THREE.Color(0x3b86e0), mid = new THREE.Color(0x8ec5ff), hor = new THREE.Color(0xe7f0fa); const pos = geo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const h = THREE.MathUtils.clamp(pos.getY(i) / 1200, -0.2, 1); if (h > 0.25) c.copy(mid).lerp(top, (h - 0.25) / 0.75); else c.copy(hor).lerp(mid, Math.max(0, h) / 0.25); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false })); dome.renderOrder = -1; scene.add(dome);
  const sunDir = new THREE.Vector3(60, 90, 40).normalize();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d5, fog: false, toneMapped: false, depthWrite: false })); disc.position.copy(sunDir).multiplyScalar(1150); disc.lookAt(0, 0, 0); dome.add(disc);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(110, 32), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.3, fog: false, toneMapped: false, depthWrite: false })); glow.position.copy(sunDir).multiplyScalar(1155); glow.lookAt(0, 0, 0); dome.add(glow);
  scene.background = null;
  const clouds = new THREE.Group(); const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  for (let i = 0; i < 30; i++) { const g = new THREE.Group(); const n = 3 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) { const s = 8 + Math.random() * 10; const m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cm); m.position.set(k * 10 - n * 5, Math.random() * 4, Math.random() * 6 - 3); g.add(m); } g.position.set((Math.random() - 0.5) * 2200, 160 + Math.random() * 60, (Math.random() - 0.5) * 2200); clouds.add(g); }
  scene.add(clouds); return { dome, clouds };
}

function frame() {
  requestAnimationFrame(frame);
  const real = clock.getDelta();
  const dt = FAST ? 1 / 30 : Math.min(real, 0.05);
  const t = FAST ? (simT += dt) : clock.elapsedTime;
  frames++;
  if (started && !ui.open) {
    for (let s = 0; s < STEPS; s++) { if (s) { simT += dt; } readInput(); updatePlayer(dt); updateFootball(dt, FAST ? simT : t, input); }
    updateMinimap(dt);
    const pw = $('power'); if (pw) { pw.style.opacity = player.kickCharge > 0 ? 1 : 0; pw.firstElementChild.style.width = (player.kickCharge * 100).toFixed(0) + '%'; }
    // location banner
    const nw = nearestWorld(player.pos.x, player.pos.z);
    const id = nw.dist < nw.world.radius ? nw.world.id : null;
    if (id !== lastWorldId) { lastWorldId = id; if (id) { setLocation(nw.world.name, nw.world.sub); feed('Entering ' + nw.world.name); player.world = id; } }
  } else if (player.mixer) player.mixer.update(dt);
  updateAccessories(t);
  sky.dome.position.copy(camera.position);
  sky.clouds.position.x = (t * 1.5) % 200;
  updateCamera(dt);
  renderer.render(scene, camera);
}
let sky = null;

function dropAt(w) {
  const sp = arenaSpawn(w.id);
  if (sp) teleport(sp.x, sp.z, sp.yaw); else teleport(w.x + 6, w.z + 12, Math.PI + 0.3);
  closeMenu(); started = true;
  if (IS_TOUCH) goFullscreen();
  lastWorldId = null;
  showToast(w.name.toUpperCase(), 1500);
  shutUp(true);
}

async function main() {
  applyQuality(); applyViewport();
  window.addEventListener('resize', applyViewport); window.addEventListener('orientationchange', () => setTimeout(applyViewport, 150));
  initAudio(); buildMaterials(); initUI();
  status('Loading south-east London…');
  await loadWorld();
  status('Building the streets…');
  sky = buildSky();
  buildWorld();
  buildArenas();
  status('Loading Cam…');
  const w0 = CFG.worlds[0]; teleport(w0.x + 6, w0.z + 12, Math.PI + 0.3);
  frame();
  bindInput({ key: (code) => {
    if (code === 'Escape') { if (ui.open && started) closeMenu(); else openMenu('pause'); }
    if (ui.open) return;
    if (code === 'KeyM') toggleMusic();
    if (code === 'KeyG') toggleEmote();
    if (code === 'KeyB') kickBallToMe();
    if (code === 'KeyL') { openMenu('pause'); document.querySelector('[data-tab="locker"]').click(); }
    if (code === 'KeyT') { openMenu('pause'); document.querySelector('[data-tab="worlds"]').click(); }
  } });
  ui.onPlay = () => dropAt(CFG.worlds[0]);
  ui.onWorld = (w) => dropAt(w);
  ui.onOutfit = (o) => loadOutfit(o, status);
  ui.onResume = () => { started = true; };
  await loadOutfit(outfitDef(), status);
  status('Ready');
  $('playBtn').disabled = false;
  if (urlParams.has('at')) { const [ax, az] = urlParams.get('at').split(',').map(Number); teleport(ax, az); }
  if (urlParams.has('autoplay')) { const id = urlParams.get('autoplay'); dropAt(CFG.worlds.find((w) => w.id === id) || CFG.worlds[0]); }
  window.__cam = { THREE, player, keys, cam, arenas, world, ui, locker, input, renderer, scene, teleport, dropAt, openMenu, closeMenu, get frames() { return frames; }, get simT() { return simT; } };
}
main();
