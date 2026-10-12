// The Locker: outfits (separate rigged GLBs), hats and back bling (Higgsfield/Meshy props), auras (sprite effects).
import { THREE, scene, MAT, TEX, player, synth, showToast, $, setupObject } from './core.js';
import { loadProp, propClone, propInfo } from './props.js';

export const OUTFITS = [
  { id: 'original', name: 'Original Cam', desc: 'The tracksuit from the video', url: './public/models/cam.glb', thumb: './public/art/cam_apose_a.png' },
  { id: 'bosco', name: 'Bosco FC Home', desc: 'Sky blue, number 9', url: './public/models/cam_bosco.glb', thumb: './public/art/outfit_bosco.png' },
  { id: 'street', name: 'Street Drip', desc: 'Black hoodie, neon green', url: './public/models/cam_street.glb', thumb: './public/art/outfit_street.png' },
  { id: 'knight', name: 'Cyber Knight', desc: 'Silver armour, blue lights', url: './public/models/cam_knight.glb', thumb: './public/art/outfit_knight.png' },
  { id: 'astro', name: 'Moon Cam', desc: 'Orange and white space suit', url: './public/models/cam_astro.glb', thumb: './public/art/outfit_astro.png' },
  { id: 'striker', name: 'Striker 9', desc: 'Red and white football kit', url: './public/models/cam_striker.glb', thumb: './public/art/outfit_striker.png' },
];
// prop: name in props.js PROPS · size: metres along dim · lift: metres above the head bone (hats) · back: offset behind the spine · yaw: model facing fix
export const HATS = [
  { id: 'none', name: 'No hat', desc: 'Just the hair' },
  { id: 'cap', name: 'Bosco cap', desc: 'Red snapback, worn backwards', prop: 'acc_cap', thumb: './public/art/acc/cap.jpg', size: 0.27, dim: 'x', lift: 0.02, yaw: Math.PI },
  { id: 'crown', name: 'Gold crown', desc: 'King of Nunhead', prop: 'acc_crown', thumb: './public/art/acc/crown.jpg', size: 0.25, dim: 'x', lift: 0.14, yaw: 0 },
  { id: 'headphones', name: 'Headphones', desc: 'Navy and gold, bass heavy', prop: 'acc_headphones', thumb: './public/art/acc/headphones.jpg', size: 0.3, dim: 'x', lift: -0.02, yaw: 0 },
  { id: 'beanie', name: 'Beanie', desc: 'Navy, sky stripe, gold bobble', prop: 'acc_beanie', thumb: './public/art/acc/beanie.jpg', size: 0.27, dim: 'x', lift: 0.06, yaw: 0 },
  { id: 'halo', name: 'Halo', desc: 'Pure gold, obviously', prop: 'acc_halo', thumb: './public/art/acc/halo.jpg', size: 0.36, dim: 'x', lift: 0.34, yaw: 0, spin: true, glow: 0xffd36a },
];
export const BACKS = [
  { id: 'none', name: 'Nothing', desc: 'Travel light' },
  { id: 'bag', name: 'Bosco kit bag', desc: 'Drawstring, ball in the pocket', prop: 'acc_bag', thumb: './public/art/acc/bag.jpg', size: 0.42, dim: 'y', back: 0.17, drop: 0.3, yaw: Math.PI },
  { id: 'wings', name: 'Angel wings', desc: 'Feathers and gold shimmer', prop: 'acc_wings', thumb: './public/art/acc/wings.jpg', size: 1.15, dim: 'x', back: 0.14, drop: 0.05, yaw: Math.PI, flap: true },
  { id: 'balloons', name: 'Balloons', desc: 'Sky blue, gold and navy', prop: 'acc_balloons', thumb: './public/art/acc/balloons.jpg', size: 1.0, dim: 'y', back: 0.12, drop: -0.25, yaw: 0, bob: true },
  { id: 'shield', name: 'Knight shield', desc: 'Navy, gold lion', prop: 'acc_shield', thumb: './public/art/acc/shield.jpg', size: 0.55, dim: 'y', back: 0.16, drop: 0.1, yaw: Math.PI },
  { id: 'jetpack', name: 'Jetpack', desc: 'Chrome, sky blue vents', prop: 'acc_jetpack', thumb: './public/art/acc/jetpack.jpg', size: 0.48, dim: 'y', back: 0.2, drop: 0.08, yaw: Math.PI, thrust: true },
  { id: 'cat', name: 'Nunhead cat', desc: 'Rides on your back', prop: 'acc_cat', thumb: './public/art/acc/cat.jpg', size: 0.34, dim: 'y', back: 0.2, drop: 0.12, yaw: Math.PI },
];
export const AURAS = [
  { id: 'none', name: 'None' }, { id: 'gold', name: 'Gold', col: 0xffc83a }, { id: 'blue', name: 'Electric blue', col: 0x4fb8ff }, { id: 'rainbow', name: 'Rainbow', col: 0xff4fa3 }, { id: 'fire', name: 'Fire', col: 0xff6a1a },
];

export const locker = { outfit: 'original', hat: 'none', back: 'none', aura: 'none', name: 'Cam' };
try { Object.assign(locker, JSON.parse(localStorage.getItem('cam_locker') || '{}')); } catch (_) {}
if (!HATS.some((h) => h.id === locker.hat)) locker.hat = 'none';
if (!BACKS.some((b) => b.id === locker.back)) locker.back = 'none';
export function saveLocker() { try { localStorage.setItem('cam_locker', JSON.stringify(locker)); } catch (_) {} }
export const outfitDef = () => OUTFITS.find((o) => o.id === locker.outfit) || OUTFITS[0];

// ---------------------------------------------------------------------------
// Accessories: a prop clone scaled to the item's size, hung off the head or spine bone every frame
// ---------------------------------------------------------------------------
const acc = { hat: null, hatDef: null, back: null, backDef: null, aura: null, auraLight: null, sparks: null, glow: null };
const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
let applyGen = 0;
function sizedClone(def) {
  const info = propInfo(def.prop); if (!info) return null;
  const g = propClone(def.prop); if (!g) return null;
  const dim = def.dim === 'x' ? info.width : def.dim === 'z' ? info.depth : info.height;
  const s = def.size / Math.max(dim, 0.001); g.scale.setScalar(s);
  // props are normalised with their feet at y=0 and centred in x/z; hats want their base at the anchor, backs their centre
  g.userData.h = info.height * s; g.userData.w = info.width * s;
  const inner = new THREE.Group(); inner.add(g); inner.userData = g.userData; g.rotation.y = def.yaw || 0;
  if (def.id === 'halo') g.rotation.x = 0;
  setupObject(inner);
  if (def.glow) { const sp = new THREE.Sprite(MAT.glowSprite.clone()); sp.material.color.setHex(def.glow); sp.scale.set(0.9, 0.7, 1); sp.position.y = 0.04; inner.add(sp); }
  return inner;
}
async function attach(kind, def) {
  const gen = ++applyGen;
  await loadProp(def.prop);
  if (gen !== applyGen && locker[kind] !== def.id) return;   // changed again meanwhile
  const g = sizedClone(def); if (!g) return;
  if (acc[kind]) player.root.remove(acc[kind]);
  acc[kind] = g; acc[kind + 'Def'] = def; player.root.add(g);
}
function glowTexture() {
  if (TEX.glow) return TEX.glow; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (TEX.glow = new THREE.CanvasTexture(c));
}
export function applyLocker() {
  if (acc.hat) { player.root.remove(acc.hat); acc.hat = null; acc.hatDef = null; }
  if (acc.back) { player.root.remove(acc.back); acc.back = null; acc.backDef = null; }
  if (acc.aura) { player.root.remove(acc.aura); acc.aura = null; }
  if (acc.sparks) { player.root.remove(acc.sparks); acc.sparks = null; }
  if (acc.auraLight) { player.root.remove(acc.auraLight); acc.auraLight = null; }
  const hat = HATS.find((h) => h.id === locker.hat); if (hat && hat.prop) attach('hat', hat);
  const back = BACKS.find((b) => b.id === locker.back); if (back && back.prop) attach('back', back);
  const aura = AURAS.find((a) => a.id === locker.aura);
  if (aura && aura.col) {
    // a soft ring of light on the ground plus rising sparks
    const col = new THREE.Color(aura.col);
    const ringMat = new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
    acc.aura = new THREE.Group();
    for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(ringMat); sp.scale.set(0.35, 0.35, 1); sp.userData.a = i / 18 * Math.PI * 2; acc.aura.add(sp); }
    player.root.add(acc.aura);
    const n = 40, pos = new Float32Array(n * 3); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ map: glowTexture(), color: col, size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    acc.sparks = new THREE.Points(geo, pm); acc.sparks.userData.seed = Array.from({ length: n }, () => [Math.random() * 6.28, Math.random(), 0.3 + Math.random() * 0.5]); acc.sparks.frustumCulled = false; player.root.add(acc.sparks);
    acc.auraLight = new THREE.PointLight(aura.col, 1.4, 6, 2); acc.auraLight.position.y = 1; player.root.add(acc.auraLight);
  }
}
export function makeGlider() { return new THREE.Group(); }
export function setGliderVisible() {}
export function updateAccessories(t) {
  const head = player.bones.Head, spine = player.bones.Spine2 || player.bones.Spine1 || player.bones.Spine || player.bones.Hips;
  if (acc.hat && head) {
    head.getWorldPosition(tmp); player.root.worldToLocal(tmp); const d = acc.hatDef;
    acc.hat.position.set(tmp.x, tmp.y + 0.1 + (d.lift || 0) + (d.spin ? Math.sin(t * 2) * 0.02 : 0), tmp.z);
    head.getWorldQuaternion(tmpQ); acc.hat.quaternion.copy(player.root.quaternion).invert().multiply(tmpQ);
    if (d.spin) acc.hat.rotation.y = t * 1.2;
  }
  if (acc.back && spine) {
    spine.getWorldPosition(tmp); player.root.worldToLocal(tmp); const d = acc.backDef; const h = acc.back.userData.h || 0.4;
    acc.back.position.set(tmp.x, tmp.y - (d.drop || 0) - h * 0.5 + (d.bob ? Math.sin(t * 1.5) * 0.04 : 0), tmp.z - (d.back || 0.18));
    acc.back.rotation.set(0, 0, 0);
    if (d.flap) acc.back.rotation.y = Math.sin(t * 3) * 0.06;
    if (d.thrust && !player.grounded) acc.back.position.y += Math.sin(t * 40) * 0.01;
  }
  if (acc.aura) {
    const col = locker.aura === 'rainbow' ? new THREE.Color().setHSL((t * 0.35) % 1, 1, 0.6) : null;
    acc.aura.children.forEach((sp, i) => { const a = sp.userData.a + t * 1.2; sp.position.set(Math.cos(a) * 0.62, 0.06 + Math.sin(a * 3 + t * 4) * 0.03, Math.sin(a) * 0.62); });
    if (col) { acc.aura.children[0].material.color.copy(col); if (acc.sparks) acc.sparks.material.color.copy(col); if (acc.auraLight) acc.auraLight.color.copy(col); }
    if (acc.sparks) { const p = acc.sparks.geometry.attributes.position; const s = acc.sparks.userData.seed; for (let i = 0; i < s.length; i++) { const [a, ph, r] = s[i]; const life = (t * 0.6 + ph) % 1; p.setXYZ(i, Math.cos(a + t * 0.4) * r * (1 - life * 0.4), 0.05 + life * 1.9, Math.sin(a + t * 0.4) * r * (1 - life * 0.4)); } p.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
export function renderLocker(body, onOutfit) {
  const section = (title, list, key, withThumb = false) => {
    const h = document.createElement('h3'); h.textContent = title; body.appendChild(h);
    const row = document.createElement('div'); row.className = 'chips' + (withThumb ? ' thumbs' : '');
    for (const o of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (locker[key] === o.id ? ' on' : '');
      b.innerHTML = withThumb ? `${o.thumb ? `<img src="${o.thumb}" alt="">` : '<span class="nothumb">—</span>'}<span>${o.name}</span><small>${o.desc || ''}</small>` : o.name;
      b.addEventListener('click', () => {
        locker[key] = o.id; saveLocker(); synth('build');
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on');
        if (key === 'outfit') onOutfit(o); else applyLocker();
      });
      row.appendChild(b);
    }
    body.appendChild(row);
  };
  section('OUTFIT', OUTFITS, 'outfit', true);
  section('HAT', HATS, 'hat', true);
  section('BACK BLING', BACKS, 'back', true);
  section('AURA', AURAS, 'aura');
}
