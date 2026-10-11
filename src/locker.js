// The Locker: outfits (separate GLBs), hats, back bling, pickaxe styles, gliders and auras.
import { THREE, scene, MAT, player, synth, showToast, $ } from './core.js';

export const OUTFITS = [
  { id: 'original', name: 'Original Cam', desc: 'The tracksuit from the video', url: './public/models/cam.glb', thumb: './public/art/cam_apose_a.png' },
  { id: 'street', name: 'Street Drip', desc: 'Black hoodie, neon green', url: './public/models/cam_street.glb', thumb: './public/art/outfit_street.png' },
  { id: 'knight', name: 'Cyber Knight', desc: 'Silver armour, blue lights', url: './public/models/cam_knight.glb', thumb: './public/art/outfit_knight.png' },
  { id: 'astro', name: 'Moon Cam', desc: 'Orange and white space suit', url: './public/models/cam_astro.glb', thumb: './public/art/outfit_astro.png' },
  { id: 'striker', name: 'Striker 9', desc: 'Red and white football kit', url: './public/models/cam_striker.glb', thumb: './public/art/outfit_striker.png' },
];
export const HATS = [
  { id: 'none', name: 'No hat' }, { id: 'cap', name: 'Backwards cap' }, { id: 'crown', name: 'Gold crown' }, { id: 'headphones', name: 'Headphones' }, { id: 'halo', name: 'Halo' }, { id: 'beanie', name: 'Beanie' }, { id: 'tophat', name: 'Top hat' },
];
export const BACKS = [
  { id: 'none', name: 'Nothing' }, { id: 'backpack', name: 'Backpack' }, { id: 'wings', name: 'Angel wings' }, { id: 'balloon', name: 'Balloon' }, { id: 'shield', name: 'Knight shield' }, { id: 'llama', name: 'Mini llama' },
];
export const PICKAXES = [
  { id: 'standard', name: 'Standard' }, { id: 'neon', name: 'Neon' }, { id: 'gold', name: 'Gold' }, { id: 'candy', name: 'Candy' }, { id: 'ice', name: 'Ice' },
];
export const GLIDERS = [
  { id: 'umbrella', name: 'Rainbow umbrella' }, { id: 'wing', name: 'Bat wing' }, { id: 'balloons', name: 'Balloons' },
];
export const AURAS = [
  { id: 'none', name: 'None' }, { id: 'gold', name: 'Gold' }, { id: 'blue', name: 'Electric blue' }, { id: 'rainbow', name: 'Rainbow' }, { id: 'fire', name: 'Fire' },
];

export const locker = { outfit: 'original', hat: 'none', back: 'none', pickaxe: 'standard', glider: 'umbrella', aura: 'none', name: 'Cam' };
try { Object.assign(locker, JSON.parse(localStorage.getItem('cam_locker') || '{}')); } catch (_) {}
export function saveLocker() { try { localStorage.setItem('cam_locker', JSON.stringify(locker)); } catch (_) {} }
export const outfitDef = () => OUTFITS.find((o) => o.id === locker.outfit) || OUTFITS[0];

// ---------------------------------------------------------------------------
// Accessory meshes
// ---------------------------------------------------------------------------
const std = (o) => new THREE.MeshStandardMaterial(o);
function makeHat(id) {
  const g = new THREE.Group();
  if (id === 'cap') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xd62828, roughness: 0.8 })); g.add(dome);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.2), std({ color: 0xd62828, roughness: 0.8 })); brim.position.set(0, 0.0, -0.22); g.add(brim);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), MAT.white); btn.position.y = 0.19; g.add(btn);
  } else if (id === 'crown') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12, 1, true), std({ color: 0xffd700, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide })); ring.position.y = 0.08; g.add(ring);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), ring.material); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.17, 0.19, Math.sin(a) * 0.17); g.add(sp); const gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), std({ color: [0xff2a55, 0x2af0ff, 0x7cff3f][i % 3], emissive: 0x222222 })); gem.position.set(Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17); g.add(gem); }
  } else if (id === 'headphones') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 24, Math.PI), std({ color: 0x222222, roughness: 0.5 })); band.rotation.z = 0; band.position.y = 0.02; g.add(band);
    for (const sx of [-0.19, 0.19]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), std({ color: 0x39ff14, roughness: 0.4 })); cup.rotation.z = Math.PI / 2; cup.position.set(sx, -0.02, 0); g.add(cup); }
  } else if (id === 'halo') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), std({ color: 0xffe680, emissive: 0xffd000, emissiveIntensity: 1.5 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  } else if (id === 'beanie') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x1e4fbf, roughness: 0.95 })); dome.scale.y = 1.2; g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 20), std({ color: 0x1e4fbf, roughness: 0.95 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; g.add(rim);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.white); pom.position.y = 0.27; g.add(pom);
  } else if (id === 'tophat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), std({ color: 0x111111, roughness: 0.6 })); g.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 20), brim.material); top.position.y = 0.17; g.add(top);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.06, 20), MAT.red); ribbon.position.y = 0.05; g.add(ribbon);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeBack(id) {
  const g = new THREE.Group();
  if (id === 'backpack') {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), std({ color: 0x2b7bd6, roughness: 0.9 })); g.add(bag);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.06), std({ color: 0xffd23f, roughness: 0.9 })); pocket.position.set(0, -0.08, -0.12); g.add(pocket);
  } else if (id === 'wings') {
    const m = std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8, 2, 3), m); w.position.set(s * 0.35, 0.1, -0.05); w.rotation.y = s * 0.5; w.rotation.z = s * 0.25; g.add(w); }
  } else if (id === 'balloon') {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.8, 4), MAT.white); line.position.y = 0.4; g.add(line);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), std({ color: 0xff4fa3, roughness: 0.3 })); b.position.y = 0.95; b.scale.y = 1.15; g.add(b);
  } else if (id === 'shield') {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.06, 6), std({ color: 0xcfd4da, metalness: 0.8, roughness: 0.3 })); sh.rotation.x = Math.PI / 2; g.add(sh);
    const em = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.02), MAT.red); em.position.z = -0.04; g.add(em);
  } else if (id === 'llama') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.16), MAT.llama[0]); g.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), MAT.llama[1]); neck.position.set(0.12, 0.18, 0); g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), MAT.llama[2]); head.position.set(0.17, 0.32, 0); g.add(head);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeGlider(id) {
  const g = new THREE.Group();
  if (id === 'wing') {
    const shape = new THREE.Shape(); shape.moveTo(0, 0.6); shape.lineTo(-2.2, -0.4); shape.lineTo(-1.2, -0.7); shape.lineTo(0, -0.3); shape.lineTo(1.2, -0.7); shape.lineTo(2.2, -0.4); shape.lineTo(0, 0.6);
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), std({ color: 0x3a2a4a, roughness: 0.9, side: THREE.DoubleSide })); wing.rotation.x = -Math.PI / 2; wing.position.y = 2.1; g.add(wing);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), MAT.metal); bar.position.y = 1.5; g.add(bar);
  } else if (id === 'balloons') {
    const cols = [0xff4fa3, 0x4fd0ff, 0xffd84f, 0x7cff4f, 0xb04fff];
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), std({ color: cols[i], roughness: 0.3 })); const a = i / 5 * Math.PI * 2; b.position.set(Math.cos(a) * 0.5, 2.6 + (i % 2) * 0.3, Math.sin(a) * 0.5); b.scale.y = 1.15; g.add(b); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.3, 4), MAT.white); s.position.set(Math.cos(a) * 0.25, 1.75, Math.sin(a) * 0.25); g.add(s); }
  } else {
    const cols = [0xff3f3f, 0xffa500, 0xffe03f, 0x3fd03f, 0x3f8fff, 0x8f3fff, 0xff3fa3, 0x3fe0ff];
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8, 1, false, i * Math.PI / 4, Math.PI / 4), std({ color: cols[i], roughness: 0.7, side: THREE.DoubleSide }));
      seg.position.y = 2.45; g.add(seg);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), MAT.metal); pole.position.y = 1.65; g.add(pole);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), MAT.botDark); handle.position.y = 1.05; g.add(handle);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------
// Apply to the player: accessories follow bone world positions each frame (no bone-axis guessing)
// ---------------------------------------------------------------------------
const acc = { hat: null, back: null, aura: null, auraLight: null, glider: null };
const tmp = new THREE.Vector3();
export function applyLocker() {
  for (const k of ['hat', 'back', 'aura', 'glider']) if (acc[k]) { player.root.remove(acc[k]); acc[k] = null; }
  if (acc.auraLight) { player.root.remove(acc.auraLight); acc.auraLight = null; }
  if (locker.hat !== 'none') { acc.hat = makeHat(locker.hat); player.root.add(acc.hat); }
  if (locker.back !== 'none') { acc.back = makeBack(locker.back); player.root.add(acc.back); }
  acc.glider = makeGlider(locker.glider); acc.glider.visible = false; player.root.add(acc.glider);
  if (locker.aura !== 'none') {
    const col = { gold: 0xffd000, blue: 0x2af0ff, rainbow: 0xff00ff, fire: 0xff6a00 }[locker.aura];
    acc.aura = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
    acc.aura.rotation.x = Math.PI / 2; acc.aura.position.y = 0.08; player.root.add(acc.aura);
    acc.auraLight = new THREE.PointLight(col, 1.6, 6, 2); acc.auraLight.position.y = 1; player.root.add(acc.auraLight);
  }
  saveLocker();
}
export function setGliderVisible(v) { if (acc.glider) acc.glider.visible = v; }
export function updateAccessories(t) {
  const head = player.bones.Head, spine = player.bones.Spine2 || player.bones.Spine1 || player.bones.Spine || player.bones.Hips;
  if (acc.hat && head) { head.getWorldPosition(tmp); player.root.worldToLocal(tmp); acc.hat.position.set(tmp.x, tmp.y + 0.14, tmp.z); acc.hat.rotation.y = 0; }
  if (acc.back && spine) { spine.getWorldPosition(tmp); player.root.worldToLocal(tmp); acc.back.position.set(tmp.x, tmp.y, tmp.z - 0.22); }
  if (acc.aura) { acc.aura.rotation.z = t * 1.5; if (locker.aura === 'rainbow') { acc.aura.material.color.setHSL((t * 0.4) % 1, 1, 0.55); acc.auraLight.color.copy(acc.aura.material.color); } }
  if (acc.glider && acc.glider.visible) acc.glider.rotation.z = Math.sin(t * 2) * 0.08;
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
      b.innerHTML = withThumb ? `<img src="${o.thumb}" alt=""><span>${o.name}</span><small>${o.desc}</small>` : o.name;
      b.addEventListener('click', () => {
        locker[key] = o.id; saveLocker(); synth('build');
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on');
        if (key === 'outfit') onOutfit(o); else applyLocker();
        if (key === 'pickaxe') document.dispatchEvent(new CustomEvent('pickaxeStyle'));
      });
      row.appendChild(b);
    }
    body.appendChild(row);
  };
  section('OUTFIT', OUTFITS, 'outfit', true);
  section('HAT', HATS, 'hat');
  section('BACK BLING', BACKS, 'back');
  section('PICKAXE & BLASTER', PICKAXES, 'pickaxe');
  section('GLIDER', GLIDERS, 'glider');
  section('AURA', AURAS, 'aura');
}
