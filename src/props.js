// Props: Higgsfield/Meshy-generated GLB models placed many times over the map (trees, house modules, parked cars,
// benches, bins, shelters, playgrounds). Each prop becomes one InstancedMesh per material so a thousand trees is a few draw calls.
import { THREE, CFG, scene, urlParams, setupObject, Q, QU } from './core.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';

// name -> { url, size: target height in metres (or width when 'w'), yaw: extra rotation so the model's front faces +z }
export const PROPS = {
  plane: { url: './public/models/prop_tree_plane.glb', size: 13, jitter: 0.3 },
  oak: { url: './public/models/prop_tree_oak.glb', size: 11, jitter: 0.3 },
  cherry: { url: './public/models/prop_tree_cherry.glb', size: 6, jitter: 0.25 },
  houseVic: { url: './public/models/prop_house_victorian.glb', size: 9.5, fit: 'box' },
  houseEdw: { url: './public/models/prop_house_edwardian.glb', size: 9.5, fit: 'box' },
  hatchback: { url: './public/models/prop_car_hatchback.glb', size: 4.1, dim: 'x' },
  van: { url: './public/models/prop_car_van.glb', size: 5.2, dim: 'x' },
  bench: { url: './public/models/prop_bench.glb', size: 1.8, dim: 'x' },
  bin: { url: './public/models/prop_bin.glb', size: 1.0 },
  shelter: { url: './public/models/prop_bus_shelter.glb', size: 4.2, dim: 'x' },
  playground: { url: './public/models/prop_playground.glb', size: 3.0 },
  flowers: { url: './public/models/prop_flowerbed.glb', size: 2.6, dim: 'x' },
  // locker accessories: normalised to 1 m tall here, scaled to the item's real size in locker.js
  acc_cap: { url: './public/models/acc_cap.glb', size: 1 }, acc_crown: { url: './public/models/acc_crown.glb', size: 1 }, acc_headphones: { url: './public/models/acc_headphones.glb', size: 1 },
  acc_beanie: { url: './public/models/acc_beanie.glb', size: 1 }, acc_halo: { url: './public/models/acc_halo.glb', size: 1, dim: 'x' }, acc_bag: { url: './public/models/acc_bag.glb', size: 1 },
  acc_wings: { url: './public/models/acc_wings.glb', size: 1 }, acc_balloons: { url: './public/models/acc_balloons.glb', size: 1 }, acc_shield: { url: './public/models/acc_shield.glb', size: 1 },
  acc_jetpack: { url: './public/models/acc_jetpack.glb', size: 1 }, acc_cat: { url: './public/models/acc_cat.glb', size: 1 },
};
const loaded = {};     // name -> { meshes: [{geometry, material}], box, scale }
const pools = {};      // name -> { inst: [InstancedMesh], cap, n, matrices: [] }
const pending = {};    // name -> queued placements before the model arrived
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();

async function loadGlb(url) {
  const loader = new GLTFLoader();
  if (!urlParams.has('b64')) { try { return await loader.loadAsync(url); } catch (e) { /* fall through */ } }
  const res = await fetch(url + CFG.modelB64Suffix); if (!res.ok) throw new Error('prop missing ' + url);
  const bin = atob((await res.text()).trim()); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
export function loadProp(name) {
  if (loaded[name]) return loaded[name];
  const def = PROPS[name]; if (!def) return null;
  loaded[name] = loadGlb(def.url).then((gltf) => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root); const size = new THREE.Vector3(); box.getSize(size);
    const dim = def.dim === 'x' ? size.x : def.dim === 'z' ? size.z : size.y;
    const scale = def.size / Math.max(dim, 0.001);
    // bake world transforms so every mesh shares one origin: centre x/z on the footprint, feet at y=0
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); g.scale(scale, scale, scale);
      const mat = o.material; if (mat && mat.map) mat.map.anisotropy = 4; if (mat) { mat.side = THREE.FrontSide; if (mat.transparent && mat.opacity > 0.95) mat.transparent = false; }
      meshes.push({ geometry: g, material: mat });
    });
    const info = { meshes, scale, width: size.x * scale, depth: size.z * scale, height: size.y * scale };
    loaded[name] = info;
    if (pending[name]) { const q = pending[name]; delete pending[name]; ensurePool(name, q.length); for (const p of q) placeProp(name, ...p); }
    return info;
  }).catch((e) => { console.warn('prop unavailable', name, e && e.message); loaded[name] = null; return null; });
  return loaded[name];
}
function ensurePool(name, cap) {
  const info = loaded[name]; if (!info || !info.meshes) return null;
  let pool = pools[name];
  if (pool && pool.cap >= cap) return pool;
  const old = pool; const newCap = Math.max(cap, old ? old.cap * 2 : 16);
  pool = { inst: [], cap: newCap, n: 0 };
  for (const { geometry, material } of info.meshes) {
    const im = new THREE.InstancedMesh(geometry, material, newCap); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    setupObject(im); scene.add(im); pool.inst.push(im);
  }
  if (old) { for (let i = 0; i < old.n; i++) { old.inst[0].getMatrixAt(i, _m); for (const im of pool.inst) im.setMatrixAt(i, _m); } pool.n = old.n; for (const im of old.inst) { scene.remove(im); } }
  for (const im of pool.inst) { im.count = pool.n; im.instanceMatrix.needsUpdate = true; }
  pools[name] = pool; return pool;
}
// place one instance now (or queue it until the model has loaded). yaw in radians, scale multiplier.
export function placeProp(name, x, y, z, yaw = 0, scale = 1, tilt = 0) {
  const info = loaded[name];
  if (!info || info.then) { (pending[name] = pending[name] || []).push([x, y, z, yaw, scale, tilt]); if (!info) loadProp(name); return -1; }
  if (!info.meshes) return -1;
  const pool = ensurePool(name, (pools[name] ? pools[name].n : 0) + 1); if (!pool) return -1;
  _e.set(tilt, yaw, 0); _q.setFromEuler(_e); _s.set(scale, scale, scale); _v.set(x, y, z); _m.compose(_v, _q, _s);
  const i = pool.n++;
  for (const im of pool.inst) { im.setMatrixAt(i, _m); im.count = pool.n; im.instanceMatrix.needsUpdate = true; }
  return i;
}
// a scaled instance (per-axis), used for house modules that must fit a footprint
export function placePropFit(name, x, y, z, yaw, sx, sy, sz) {
  const info = loaded[name];
  if (!info || info.then) { (pending[name] = pending[name] || []).push([x, y, z, yaw, 1, 0]); if (!info) loadProp(name); return -1; }
  if (!info.meshes) return -1;
  const pool = ensurePool(name, (pools[name] ? pools[name].n : 0) + 1); if (!pool) return -1;
  _e.set(0, yaw, 0); _q.setFromEuler(_e); _s.set(sx, sy, sz); _v.set(x, y, z); _m.compose(_v, _q, _s);
  const i = pool.n++;
  for (const im of pool.inst) { im.setMatrixAt(i, _m); im.count = pool.n; im.instanceMatrix.needsUpdate = true; }
  return i;
}
export function propInfo(name) { const i = loaded[name]; return i && i.meshes ? i : null; }
export function propCount(name) { return pools[name] ? pools[name].n : 0; }
export function resetPool(name) { const p = pools[name]; if (p) { p.n = 0; for (const im of p.inst) { im.count = 0; im.instanceMatrix.needsUpdate = true; } } }
// a single standalone clone (locker accessories, one-offs)
export function propClone(name) {
  const info = loaded[name]; if (!info || !info.meshes) return null;
  const g = new THREE.Group(); for (const { geometry, material } of info.meshes) { const m = new THREE.Mesh(geometry, material); m.castShadow = true; g.add(m); } return g;
}
