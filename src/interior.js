// Shop interiors: one small shop room built far off the map. Step onto a shop's doorway mat and the screen fades,
// Cam appears inside by the door, the shopkeeper greets him from behind the counter; walk up to the counter to buy
// and swap, walk back out of the door to return to the street in front of that shop.
import { THREE, CFG, scene, MAT, player, $, playSfx, setAmbience, showToast, setupObject, camera } from './core.js';
import { groundAt, addSegment } from './map.js';
import { makeNpc, npcUpdate, npcPlay } from './npc.js';
import { teleport, cam } from './player.js';
import { talk, openTalk, closeTalk } from './shops.js';

export const interior = { active: null, keeper: null, built: false, fading: false, t: 0 };
const RX = 3000, RZ = 3000;            // the room lives here, well outside the map
const W = 12, D = 11, H = 3.6;         // width (x), depth (z), height
let floorY = 0, counterMat = null, exitMat = null, lights = [], savedDist = 4.6;
const tex = (url, rx = 1, ry = 1) => { const t = new THREE.TextureLoader().load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };

export function buildInterior() {
  if (interior.built) return; interior.built = true;
  floorY = groundAt(RX, RZ).y;
  const g = new THREE.Group(); g.position.set(RX, floorY, RZ);
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1e8d2, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MAT.planks); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
  // walls (the front wall has the door gap)
  box(W, H, 0.2, wallMat, 0, H / 2, -D / 2);                       // back
  box(0.2, H, D, wallMat, -W / 2, H / 2, 0); box(0.2, H, D, wallMat, W / 2, H / 2, 0);
  box(W / 2 - 0.8, H, 0.2, wallMat, -W / 4 - 0.4, H / 2, D / 2); box(W / 2 - 0.8, H, 0.2, wallMat, W / 4 + 0.4, H / 2, D / 2);
  box(1.6, H - 2.2, 0.2, wallMat, 0, H - (H - 2.2) / 2, D / 2);   // above the door
  // the shop itself: a big photo of the stocked shelves on the back wall, shelf units down both sides, a counter
  const interiorTex = tex(CFG.textures.shopInterior);
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, H - 0.3), new THREE.MeshStandardMaterial({ map: interiorTex, roughness: 0.8 })); backdrop.position.set(0, H / 2, -D / 2 + 0.12); g.add(backdrop);
  const shelfTex = tex(CFG.textures.shopInterior, 3, 1); const shelfMat = new THREE.MeshStandardMaterial({ map: shelfTex, roughness: 0.8 });
  for (const sx of [-1, 1]) { const unit = box(0.6, 2.4, D - 3.2, shelfMat, sx * (W / 2 - 0.42), 1.2, -0.6); unit.castShadow = true; }
  // a floor island of stock in the middle so the room reads as a shop, not a hall
  box(2.4, 1.3, 1.0, shelfMat, 0, 0.65, 1.2); box(2.6, 0.08, 1.2, new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.5 }), 0, 1.34, 1.2);
  const counter = box(3.6, 1.0, 0.9, MAT.planks, 0, 0.5, -D / 2 + 1.7); counter.castShadow = true;
  const top = box(3.8, 0.08, 1.0, new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.5 }), 0, 1.04, -D / 2 + 1.7);
  for (const [img, x] of [['./public/art/pack_cards.jpg', -1.0], ['./public/art/pack_attax.jpg', 0], ['./public/art/drink.jpg', 1.0]]) {
    const t = tex(img);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); card.position.set(x, 1.42, -D / 2 + 1.7 + 0.2); card.rotation.x = -0.35; g.add(card);
  }
  // mats: counter (buy/swap) and exit (door)
  counterMat = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xf2c233, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); counterMat.rotation.x = -Math.PI / 2; counterMat.position.set(0, 0.02, -D / 2 + 1.7 + 1.2); g.add(counterMat);
  exitMat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), new THREE.MeshBasicMaterial({ color: 0xf2c233, transparent: true, opacity: 0.6, depthWrite: false })); exitMat.rotation.x = -Math.PI / 2; exitMat.position.set(0, 0.02, D / 2 - 0.3); g.add(exitMat);
  const exitSign = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const q = c.getContext('2d'); q.fillStyle = '#1b7a3a'; q.fillRect(0, 0, 256, 96); q.fillStyle = '#fff'; q.font = 'bold 60px Oswald, Impact, sans-serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('EXIT', 128, 50); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: t })); })();
  exitSign.position.set(0, 2.45, D / 2 - 0.12); exitSign.rotation.y = Math.PI; g.add(exitSign);
  // beyond the door: night-black so the void never shows
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({ color: 0x05070f })); dark.position.set(0, 1.8, D / 2 + 1.2); dark.rotation.y = Math.PI; g.add(dark);
  // lights
  for (const [x, z] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) { const l = new THREE.PointLight(0xfff1d6, 28, 14, 1.7); l.position.set(x, H - 0.3, z); g.add(l); lights.push(l); }
  setupObject(g); scene.add(g);
  // collision: the four walls (door gap in the front), the counter and the shelves
  const seg = (ax, az, bx, bz, kind = 'wall') => addSegment(RX + ax, RZ + az, RX + bx, RZ + bz, H, kind);
  seg(-W / 2, -D / 2, W / 2, -D / 2); seg(-W / 2, -D / 2, -W / 2, D / 2); seg(W / 2, -D / 2, W / 2, D / 2);
  seg(-W / 2, D / 2, -0.8, D / 2); seg(0.8, D / 2, W / 2, D / 2);
  seg(-1.8, -D / 2 + 2.15, 1.8, -D / 2 + 2.15); seg(-1.8, -D / 2 + 1.25, -1.8, -D / 2 + 2.15); seg(1.8, -D / 2 + 1.25, 1.8, -D / 2 + 2.15);
  seg(-W / 2 + 0.72, -D / 2 + 1, -W / 2 + 0.72, D / 2 - 2.2); seg(W / 2 - 0.72, -D / 2 + 1, W / 2 - 0.72, D / 2 - 2.2);
  seg(-1.2, 0.7, 1.2, 0.7); seg(-1.2, 1.7, 1.2, 1.7); seg(-1.2, 0.7, -1.2, 1.7); seg(1.2, 0.7, 1.2, 1.7);
  interior.keeper = makeNpc('shopkeeper'); interior.keeper.position.set(RX, floorY, RZ - D / 2 + 0.75); interior.keeper.rotation.y = 0; scene.add(interior.keeper);
}
function fade(on) { const f = $('fade'); if (f) f.classList.toggle('on', on); }
const HI = ['shopHi1', 'shopHi2', 'shopHi3'];
export function enterShop(shop) {
  if (interior.active || interior.fading) return;
  buildInterior(); interior.fading = true; fade(true);
  setTimeout(() => {
    interior.active = shop; document.body.classList.add('inside');
    teleport(RX, RZ + D / 2 - 2.4, 0);   // just inside the door, facing the counter
    savedDist = cam.dist; cam.dist = 2.9; cam.pitch = 0.18;
    setAmbience(null, 0); playSfx(CFG.sfx.bell, 0.5);
    setTimeout(() => playSfx(CFG.sfx[HI[Math.floor(Math.random() * HI.length)]], 1), 500);
    showToast(shop.name.toUpperCase(), 1400);
    interior.keeper.rotation.y = 0; npcPlay(interior.keeper, 'idle');
    fade(false); interior.fading = false; talk.left = false;
  }, 380);
}
export function leaveShop() {
  const shop = interior.active; if (!shop || interior.fading) return;
  interior.fading = true; fade(true); if (talk.open) closeTalk();
  setTimeout(() => {
    interior.active = null; document.body.classList.remove('inside');
    const dx = shop.doorX - shop.x, dz = shop.doorZ - shop.z, l = Math.hypot(dx, dz) || 1; const fx = dx / l, fz = dz / l;
    teleport(shop.x - fx * 2.8, shop.z - fz * 2.8, Math.atan2(-fx, -fz));   // back on the pavement in front of the shop
    cam.dist = savedDist;
    playSfx(CFG.sfx.bell, 0.4); playSfx(CFG.sfx.shopBye, 0.9);
    fade(false); interior.fading = false; talk.left = false; talk.lock = 2;
  }, 380);
}
export function updateInterior(dt, t) {
  if (!interior.active) return;
  npcUpdate(interior.keeper, dt);
  counterMat.rotation.z = t * 0.8; counterMat.material.opacity = 0.5 + Math.sin(t * 3) * 0.2;
  const px = player.pos.x - RX, pz = player.pos.z - RZ;
  const dc = Math.hypot(px - counterMat.position.x, pz - counterMat.position.z), de = Math.hypot(px - exitMat.position.x, pz - exitMat.position.z);
  if (dc > 1.6) talk.left = true;
  if (!talk.open && talk.left && talk.lock <= 0 && dc < 0.9) { talk.left = false; openTalk(interior.active); }
  // keep the camera inside the room
  cam.dist = Math.min(cam.dist, 3.2);
  cam.pos.x = Math.min(RX + W / 2 - 0.4, Math.max(RX - W / 2 + 0.4, cam.pos.x)); cam.pos.z = Math.min(RZ + D / 2 - 0.3, Math.max(RZ - D / 2 + 0.4, cam.pos.z)); cam.pos.y = Math.min(floorY + H - 0.3, Math.max(floorY + 0.5, cam.pos.y));
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  if (!talk.open && de < 0.7) leaveShop();
  // the keeper watches Cam
  interior.keeper.rotation.y = Math.atan2(player.pos.x - interior.keeper.position.x, player.pos.z - interior.keeper.position.z);
  const pr = $('prompt'); if (pr) { if (dc < 2.5 && !talk.open) { pr.innerHTML = 'Walk up to the counter to buy or swap cards'; pr.hidden = false; } else if (de < 2.2 && !talk.open) { pr.innerHTML = 'Walk out of the door to leave'; pr.hidden = false; } else pr.hidden = true; }
}
