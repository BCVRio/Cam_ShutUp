// Exports the live browser-game world to Unreal-ready GLB files, one per area, plus world.json.
//
// This module runs INSIDE the game page: tools/export.html loads index.html in an iframe and injects this script into
// it, so it shares the game's Three.js instance, scene, materials, textures and map data (the import URLs below resolve
// to the same module records the game uses). Nothing here changes the game sources.
//
// Output (through tools/export_server.py, or as downloads when no upload endpoint answers):
//   unreal/exports/<area>.glb   nunhead, stadium, cage, park, streets  (metres, Y up, as Three.js has them)
//   unreal/exports/world.json   areas, arenas, roads, pavements, crossings, lamp posts, shop doors
//
// Every exported node carries userData.area (-> glTF extras.area). Merged meshes that span several areas (terrain,
// roads, pavements, building rows) are cut by triangle so each GLB holds only its own area. Instanced props come out as
// one node per instance sharing one mesh, so Unreal can instance them again.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { GLTFExporter } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/exporters/GLTFExporter.js/+esm';
import { CFG, MAT, scene, player } from '../src/core.js';
import { world, terrainHeight, groundAt, inStadium } from '../src/map.js';
import { ROAD_LIFT, PAVE_LIFT } from '../src/streets.js';
import { updateScenery } from '../src/scenery.js';
import { PROPS, propInfo, loadProp } from '../src/props.js';
import { walkers, cars, cats, flocks, pigeons } from '../src/life.js';
import { shops } from '../src/shops.js';
import { arenas } from '../src/football.js';
import { interior } from '../src/interior.js';

const OPT = Object.assign({ areas: null, upload: true, uploadUrl: new URL('/__export/', location.href).href, grid: 150 }, window.__exportOptions || {});
const AREAS = CFG.worlds.map((w) => ({ id: w.id, name: w.name, sub: w.sub, x: w.x, z: w.z, r: w.radius }));
const AREA_IDS = [...AREAS.map((a) => a.id), 'streets'];
// MAT key -> texture family name, so Unreal's build script can match materials to public/textures by name
const FAMILY = { ground: 'grass', terrace: 'facade_terrace', terraceB: 'facade_victorian', terraceC: 'facade_edwardian', shopfront: 'facade_shop', flats: 'facade_flats', terraceFar: 'facade_victorian', slateFar: 'slate' };
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap'];

const post = (type, data) => { try { window.parent.postMessage({ type, ...data }, '*'); } catch (_) {} };
const log = (msg) => { console.log('[export] ' + msg); post('export-log', { msg }); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const R2 = (v) => Math.round(v * 100) / 100;
const P3 = (x, y, z) => [R2(x), R2(y), R2(z)];
async function waitFor(fn, ms, what) { const t0 = performance.now(); while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await new Promise((r) => setTimeout(r, 100)); } }
function areaOf(x, z) { for (const a of AREAS) if (Math.hypot(x - a.x, z - a.z) < a.r) return a.id; return 'streets'; }
function materialsOf(o) { return Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; }
function triCount(g) { return Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3); }

// ---------------------------------------------------------------------------
// Materials and textures
// ---------------------------------------------------------------------------
function nameMaterials() {
  for (const [k, v] of Object.entries(MAT)) { const list = Array.isArray(v) ? v : [v]; list.forEach((m, i) => { if (m && m.isMaterial && !m.name) m.name = (FAMILY[k] || k) + (list.length > 1 ? i : ''); }); }
  let n = 0; scene.traverse((o) => materialsOf(o).forEach((m) => { if (!m.name) m.name = 'mat_' + (n++); }));
}
function allTextures() {
  const texs = new Map();   // texture -> [{material, key}]
  scene.traverse((o) => materialsOf(o).forEach((m) => { for (const k of TEX_KEYS) { const t = m[k]; if (t && t.isTexture) { if (!texs.has(t)) texs.set(t, []); texs.get(t).push({ m, k }); } } }));
  return texs;
}
const texReady = (t) => { const im = t.image; if (!im) return false; if (im.complete !== undefined) return im.complete && im.naturalWidth > 0; return (im.width || 0) > 0; };
async function waitTextures() {
  const texs = allTextures();
  try { await waitFor(() => [...texs.keys()].every(texReady), 60000, 'textures'); } catch (e) { log('warning: ' + e.message); }
  const patches = [];
  for (const [t, uses] of texs) {
    if (!texReady(t)) { for (const { m, k } of uses) { log(`warning: texture for ${m.name}.${k} never loaded, exporting without it`); patches.push([m, k, t]); m[k] = null; } continue; }
    // keep JPEG sources as JPEG in the GLB (the exporter writes PNG unless told otherwise; props from GLBs already carry theirs)
    const src = (t.image && (t.image.currentSrc || t.image.src)) || '';
    if (!t.userData.mimeType && /\.jpe?g($|\?)/i.test(src) && uses.every((u) => u.k === 'map' || u.k === 'normalMap' || u.k === 'emissiveMap')) t.userData.mimeType = 'image/jpeg';
  }
  return patches;
}

// ---------------------------------------------------------------------------
// What stays out: the player, people, animals, vehicles, markers, sky, helpers
// ---------------------------------------------------------------------------
function skipRoots() {
  const s = new Set();
  const add = (o) => { if (o && o.isObject3D) s.add(o); };
  add(player.root);
  for (const w of walkers) add(w.mesh);
  for (const c of cars) add(c.mesh);
  for (const c of cats) add(c.mesh);
  for (const f of flocks) f.birds.forEach(add);
  for (const g of pigeons) g.birds.forEach(add);
  for (const sh of shops) { add(sh.keeper); add(sh.ring); add(sh.icon); }
  for (const a of arenas) { if (a.ball) add(a.ball.mesh); add(a.ref); for (const b of a.bots) add(b.mesh); }
  add(interior.keeper);
  return s;
}
const _bb = new THREE.Box3();
function skipReason(o, roots) {
  for (let p = o; p; p = p.parent) if (roots.has(p)) return 'actor';
  const mats = materialsOf(o); if (!mats.length) return 'no material';
  for (const m of mats) {
    if (m.isMeshBasicMaterial && m.transparent) return 'marker';          // shop beams, doorway mats, rings, cage wire grid
    if (m === MAT.crowd) return 'crowd';
    if (m.wireframe) return 'wireframe';
    if (m.isSpriteMaterial || m.isPointsMaterial) return 'sprite';
  }
  const p = o.geometry.parameters; if (p && p.width > 4000) return 'skirt';   // the void-filler plane under the map edge
  o.geometry.computeBoundingBox(); _bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
  if (_bb.min.y > 120) return 'sky';
  const b = world.bounds; if (_bb.max.x < b.x0 - 200 || _bb.min.x > b.x1 + 200 || _bb.max.z < b.z0 - 200 || _bb.min.z > b.z1 + 200) return 'off-map';   // the shop interior room
  return null;
}

// ---------------------------------------------------------------------------
// Static meshes, cut per area by triangle where they span more than one
// ---------------------------------------------------------------------------
const _v = new THREE.Vector3();
function partsByArea(o) {
  const g = o.geometry, M = o.matrixWorld;
  g.computeBoundingBox(); const bb = _bb.copy(g.boundingBox).applyMatrix4(M);
  // whole mesh inside one area circle (all four corners of its footprint in the same circle) -> no cut
  const corners = [[bb.min.x, bb.min.z], [bb.max.x, bb.min.z], [bb.min.x, bb.max.z], [bb.max.x, bb.max.z]].map(([x, z]) => areaOf(x, z));
  if (corners[0] !== 'streets' && corners.every((c) => c === corners[0])) return { [corners[0]]: g };
  const pos = g.attributes.position, idx = g.index, n = triCount(g);
  const tri = new Uint8Array(n), counts = new Array(AREA_IDS.length).fill(0);
  const pa = pos.array, st = pos.itemSize;
  for (let t = 0; t < n; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    _v.set((pa[a * st] + pa[b * st] + pa[c * st]) / 3, (pa[a * st + 1] + pa[b * st + 1] + pa[c * st + 1]) / 3, (pa[a * st + 2] + pa[b * st + 2] + pa[c * st + 2]) / 3).applyMatrix4(M);
    const ai = AREA_IDS.indexOf(areaOf(_v.x, _v.z)); tri[t] = ai; counts[ai]++;
  }
  const used = counts.filter((c) => c > 0).length;
  if (used === 1) return { [AREA_IDS[counts.findIndex((c) => c > 0)]]: g };
  const out = {};
  for (let ai = 0; ai < AREA_IDS.length; ai++) {
    if (!counts[ai]) continue;
    const remap = new Map(); const newIdx = new Uint32Array(counts[ai] * 3); let w = 0;
    const take = (vi) => { let r = remap.get(vi); if (r === undefined) { r = remap.size; remap.set(vi, r); } return r; };
    for (let t = 0; t < n; t++) { if (tri[t] !== ai) continue; for (let k = 0; k < 3; k++) { const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k; newIdx[w++] = take(vi); } }
    const sub = new THREE.BufferGeometry(); const order = [...remap.keys()];
    for (const [name, attr] of Object.entries(g.attributes)) {
      const dst = new attr.array.constructor(order.length * attr.itemSize);
      for (let i = 0; i < order.length; i++) for (let k = 0; k < attr.itemSize; k++) dst[i * attr.itemSize + k] = attr.array[order[i] * attr.itemSize + k];
      sub.setAttribute(name, new THREE.BufferAttribute(dst, attr.itemSize, attr.normalized));
    }
    sub.setIndex(new THREE.BufferAttribute(order.length > 65535 ? newIdx : new Uint16Array(newIdx), 1));
    out[AREA_IDS[ai]] = sub;
  }
  return out;
}
function collectStatics() {
  const roots = skipRoots(); const out = Object.fromEntries(AREA_IDS.map((a) => [a, []])); const skipped = {}; let n = 0;
  scene.updateMatrixWorld(true);
  const list = []; scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) list.push(o); });
  for (const o of list) {
    const why = skipReason(o, roots); if (why) { skipped[why] = (skipped[why] || 0) + 1; continue; }
    const matName = materialsOf(o)[0].name || 'mat'; const name = (o.name || 'mesh') + '_' + matName + '_' + String(n++).padStart(4, '0');
    const parts = materialsOf(o).length > 1 ? { [areaOf(_bb.getCenter(_v).x, _v.z)]: o.geometry } : partsByArea(o);
    for (const [area, geometry] of Object.entries(parts)) out[area].push({ name, geometry, material: o.material, matrix: o.matrixWorld.clone() });
  }
  log(`static meshes: ${n} kept (${AREA_IDS.map((a) => a + ' ' + out[a].length).join(', ')}); skipped ${Object.entries(skipped).map(([k, v]) => v + ' ' + k).join(', ') || 'none'}`);
  return out;
}

// ---------------------------------------------------------------------------
// Instanced things: prop pools (trees, houses, cars, furniture, garden walls) and the lamps / belisha beacons.
// The house modules, their gardens and the modelled trees only exist near the player, so the player is walked over a
// grid and every cell keeps the instances that fall inside it.
// ---------------------------------------------------------------------------
function poolName(im) {
  for (const k of Object.keys(PROPS)) { const info = propInfo(k); if (!info) continue; const j = info.meshes.findIndex((mm) => mm.geometry === im.geometry); if (j >= 0) return { prop: k, sub: j, dynamic: true }; }
  const g = im.geometry, p = g.parameters || {}, m = im.material;
  if (g.type === 'BoxGeometry' && m === MAT.brick) return { prop: 'gardenWall', sub: 0, dynamic: true };
  if (g.type === 'CylinderGeometry' && Math.abs(p.height - 6) < 1e-6) return { prop: 'lamp', sub: 0, dynamic: false };
  if (g.type === 'BoxGeometry' && m === MAT.lampGlow) return { prop: 'lamp', sub: 1, dynamic: false };
  if (g.type === 'CylinderGeometry' && Math.abs(p.height - 2.6) < 1e-6) return { prop: 'belisha', sub: 0, dynamic: false };
  if (g.type === 'SphereGeometry') return { prop: 'belisha', sub: 1, dynamic: false };
  return null;   // the grass carpet and the procedural stand-in trees
}
function scanInstanced() {
  const byProp = new Map();
  scene.traverse((o) => { if (!o.isInstancedMesh) return; const pn = poolName(o); if (!pn) return; let g = byProp.get(pn.prop); if (!g) byProp.set(pn.prop, (g = { prop: pn.prop, dynamic: pn.dynamic, ims: [] })); g.ims[pn.sub] = o; });
  return byProp;
}
const _m = new THREE.Matrix4();
function harvest(reg, g, keep) {
  const ims = g.ims.filter(Boolean); if (!ims.length) return 0;
  let r = reg.get(g.prop); if (!r) reg.set(g.prop, (r = { prop: g.prop, subs: ims.map((im) => ({ geometry: im.geometry, material: im.material })), items: [] }));
  const n = ims[0].count; let k = 0;
  for (let i = 0; i < n; i++) {
    ims[0].getMatrixAt(i, _m); const e = _m.elements; if (e[0] === 0 && e[5] === 0 && e[10] === 0) continue;   // zero-scaled slot
    const x = e[12], z = e[14]; if (!keep(x, z)) continue;
    r.items.push({ m: Float32Array.from(e), x, z }); k++;
  }
  return k;
}
async function collectInstances() {
  // the map data (terraces, park trees) runs past world.bounds (Peckham Rye Common goes 500 m south of it), so the
  // grid covers everything the scenery can place, not just the bounds
  const reg = new Map(); const G = OPT.grid; const b = { ...world.bounds };
  for (const [x, z] of world.treeList || []) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); }
  for (const m of world.modules || []) { b.x0 = Math.min(b.x0, m.x); b.x1 = Math.max(b.x1, m.x); b.z0 = Math.min(b.z0, m.z); b.z1 = Math.max(b.z1, m.z); }
  const MARGIN = 40, x0 = b.x0 - MARGIN, z0 = b.z0 - MARGIN;
  const nx = Math.ceil((b.x1 - b.x0 + 2 * MARGIN) / G), nz = Math.ceil((b.z1 - b.z0 + 2 * MARGIN) / G);
  for (const g of scanInstanced().values()) if (!g.dynamic) harvest(reg, g, () => true);
  const saved = player.pos.clone(); let wallCap = 0, visits = 0;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      player.pos.set(x0 + (ix + 0.5) * G, saved.y, z0 + (iz + 0.5) * G);
      updateScenery(0); visits++;
      const inCell = (x, z) => Math.floor((x - x0) / G) === ix && Math.floor((z - z0) / G) === iz;
      for (const g of scanInstanced().values()) {
        if (!g.dynamic) continue;
        if (g.prop === 'gardenWall' && g.ims[0].count >= g.ims[0].instanceMatrix.count) wallCap++;
        harvest(reg, g, inCell);
      }
    }
    log(`placing scenery: ${Math.round(100 * (ix + 1) / nx)}%`); await tick();
  }
  player.pos.copy(saved); updateScenery(0);
  if (wallCap) log(`warning: the garden-wall pool hit the game's cap on ${wallCap} of ${visits} visits; some front walls may be missing`);
  const trees = ['plane', 'oak', 'cherry'].reduce((s, k) => s + (reg.get(k) ? reg.get(k).items.length : 0), 0);
  log(`instances: ${[...reg.values()].map((r) => r.prop + ' ' + r.items.length).join(', ')}`);
  if (world.treeList && trees !== world.treeList.length) log(`warning: ${trees} modelled trees exported for ${world.treeList.length} planned`);
  return reg;
}

// ---------------------------------------------------------------------------
// Build one scene per area and export it
// ---------------------------------------------------------------------------
function buildAreaScene(id, statics, reg) {
  const root = new THREE.Scene(); root.name = 'camshutup_' + id; let nodes = 0, tris = 0; const meshes = new Set();
  for (const s of statics[id]) {
    const m = new THREE.Mesh(s.geometry, s.material); m.name = s.name; m.matrixAutoUpdate = false; m.matrix.copy(s.matrix); m.userData.area = id;
    root.add(m); nodes++; tris += triCount(s.geometry); meshes.add(s.geometry.uuid);
  }
  for (const r of reg.values()) {
    let k = 0;
    for (const it of r.items) {
      const kk = k++; if (areaOf(it.x, it.z) !== id) continue;
      const name = `inst_${r.prop}_${String(kk).padStart(5, '0')}`; _m.fromArray(it.m);
      if (r.subs.length === 1) { const m = new THREE.Mesh(r.subs[0].geometry, r.subs[0].material); m.name = name; m.matrixAutoUpdate = false; m.matrix.copy(_m); m.userData.area = id; m.userData.prop = r.prop; root.add(m); nodes++; }
      else { const g = new THREE.Group(); g.name = name; g.matrixAutoUpdate = false; g.matrix.copy(_m); g.userData.area = id; g.userData.prop = r.prop; r.subs.forEach((s, j) => { const m = new THREE.Mesh(s.geometry, s.material); m.name = `${name}_m${j}`; m.userData.area = id; g.add(m); }); root.add(g); nodes += 1 + r.subs.length; }
      for (const s of r.subs) { tris += triCount(s.geometry); meshes.add(s.geometry.uuid); }
    }
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { root, stats: { nodes, triangles: tris, uniqueMeshes: meshes.size, min: box.isEmpty() ? null : P3(box.min.x, box.min.y, box.min.z), max: box.isEmpty() ? null : P3(box.max.x, box.max.y, box.max.z) } };
}
async function exportGlb(root) {
  const exporter = new GLTFExporter();
  return exporter.parseAsync(root, { binary: true, onlyVisible: false, maxTextureSize: Infinity, includeCustomExtensions: false });
}
async function deliver(name, data, type) {
  if (OPT.upload) {
    try {
      const res = await fetch(OPT.uploadUrl + name, { method: 'POST', body: data, headers: { 'Content-Type': type } });
      if (res.ok) { const j = await res.json().catch(() => ({})); log(`wrote ${j.path || name} (${(j.bytes || data.byteLength || data.length || 0).toLocaleString()} bytes)`); return 'uploaded'; }
      log(`upload of ${name} refused (${res.status}); offering it as a download instead`);
    } catch (e) { log(`no upload endpoint for ${name} (${e.message}); offering it as a download instead`); }
  }
  post('export-file', { name, blob: new Blob([data], { type }) });
  return 'download';
}

// ---------------------------------------------------------------------------
// world.json: what Unreal needs to rebuild pedestrians, traffic and the shops
// ---------------------------------------------------------------------------
function tangents(p) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const [x, z] = p[i]; let dx, dz;
    if (p.length < 2) { dx = 1; dz = 0; }
    else if (i === 0) { dx = p[1][0] - x; dz = p[1][1] - z; } else if (i === p.length - 1) { dx = x - p[i - 1][0]; dz = z - p[i - 1][1]; }
    else { const ax = x - p[i - 1][0], az = z - p[i - 1][1], bx = p[i + 1][0] - x, bz = p[i + 1][1] - z; const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; dx = ax / la + bx / lb; dz = az / la + bz / lb; }
    const l = Math.hypot(dx, dz) || 1; out.push([dx / l, dz / l]);
  }
  return out;
}
function offsetLine(p, off) {   // same mitre-capped offset streets.js uses for kerbs and pavements
  const T = tangents(p); const out = [];
  for (let i = 0; i < p.length; i++) {
    let nx = -T[i][1], nz = T[i][0];
    if (i > 0 && i < p.length - 1) { const ax = p[i][0] - p[i - 1][0], az = p[i][1] - p[i - 1][1], l = Math.hypot(ax, az) || 1; const cos = (ax / l) * T[i][0] + (az / l) * T[i][1]; const k = Math.min(1.6, 1 / Math.max(0.3, Math.abs(cos))); nx *= k; nz *= k; }
    out.push([p[i][0] + nx * off, p[i][1] + nz * off]);
  }
  return out;
}
function buildWorldJson(files) {
  const d = world.data;
  const roadList = d.roads.map((r, osm) => ({ r, osm })).filter(({ r }) => r.k !== 'steps' && r.p.length >= 2 && !r.p.every(([x, z]) => inStadium(x, z, 4)));
  const roads = roadList.map(({ r, osm }, id) => ({ id, osmIndex: osm, name: r.n || null, kind: r.k, width: r.w, footpath: r.w <= 2, points: r.p.map(([x, z]) => P3(x, groundAt(x, z).y, z)) }));
  const pavements = [];
  roadList.forEach(({ r }, id) => {
    if (r.w <= 2) { pavements.push({ road: id, side: 0, width: 2.2, kerb: false, points: r.p.map(([x, z]) => P3(x, terrainHeight(x, z) + PAVE_LIFT - 0.02, z)) }); return; }
    for (const s of [-1, 1]) {
      pavements.push({ road: id, side: s, width: 2.8, kerb: true, kerbOffset: R2(r.w / 2 + 0.03), kerbWidth: 0.26, points: offsetLine(r.p, s * (r.w / 2 + 1.5)).map(([x, z]) => P3(x, terrainHeight(x, z) + PAVE_LIFT, z)) });
    }
  });
  const crossings = [];
  roadList.forEach(({ r }, id) => {
    if (!(r.w >= 7 && r.k !== 'service')) return;
    for (let s = 0; s < r.p.length - 1; s++) {
      const [ax, az] = r.p[s], [bx, bz] = r.p[s + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 75) continue;
      const dx = (bx - ax) / l, dz = (bz - az) / l; const cx = ax + dx * l * 0.5, cz = az + dz * l * 0.5; const nx = -dz, nz = dx;
      crossings.push({ road: id, kind: 'zebra', centre: P3(cx, terrainHeight(cx, cz) + ROAD_LIFT, cz), along: [R2(dx), R2(dz)], roadWidth: r.w, stripeLength: 2.6, beacons: [-1, 1].map((side) => { const x = cx + nx * (r.w / 2 + 0.6) * side, z = cz + nz * (r.w / 2 + 0.6) * side; return P3(x, terrainHeight(x, z) + PAVE_LIFT, z); }) });
    }
  });
  if (world.beacons && world.beacons.count !== crossings.length * 2) log(`warning: ${crossings.length} crossings computed but the game has ${world.beacons.count / 2}`);
  const lampPosts = world.lamps.map(([x, z]) => P3(x, terrainHeight(x, z), z));
  const shopList = shops.map((s) => ({ id: s.id, name: s.name, kind: s.kind, keeperName: s.keeperName, door: P3(s.doorX, terrainHeight(s.doorX, s.doorZ), s.doorZ), entryMat: P3(s.x, terrainHeight(s.x, s.z), s.z), keeper: P3(s.keeper.position.x, s.keeper.position.y, s.keeper.position.z), facingYaw: R2(s.keeper.rotation.y) }));
  const arenaList = arenas.map((a) => ({ id: a.id, name: a.name, mode: a.mode, pitch: { x: R2(a.rect.x), z: R2(a.rect.z), angle: R2(a.rect.ang), length: R2(a.rect.len), width: R2(a.rect.wid), y: R2(a.y) }, goals: a.goals.map((g) => ({ side: g.side, width: g.w, height: g.h, depth: g.dp, mouth: P3(g.mouth.x, g.mouth.y, g.mouth.z), inward: g.inward.map(R2), posts: g.posts.map((p) => [R2(p.x), R2(p.z)]) })) }));
  const areas = AREAS.map((a) => ({ id: a.id, name: a.name, sub: a.sub, centre: { x: a.x, z: a.z }, groundY: R2(terrainHeight(a.x, a.z)), radius: a.r, bounds: { x0: a.x - a.r, x1: a.x + a.r, z0: a.z - a.r, z1: a.z + a.r }, file: a.id + '.glb', exported: files[a.id] || null }));
  const b = world.bounds;
  areas.push({ id: 'streets', name: 'Streets', sub: 'everything outside the four areas', centre: { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }, groundY: R2(terrainHeight((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)), radius: null, bounds: { ...b }, file: 'streets.glb', exported: files.streets || null });
  return {
    generator: 'tools/export_world.js', generated: new Date().toISOString(), source: CFG.mapUrl, mapOrigin: d.origin || null,
    units: 'metres', up: 'Y', axes: { x: 'east', y: 'up', z: 'south', handedness: 'right-handed (Three.js); Unreal import: Z up, centimetres, Interchange converts' },
    worldBounds: { ...b },
    rules: {
      areaAssignment: 'a point belongs to the first area whose centre is within its radius, else to streets; node extras.area carries it',
      roadGraph: 'roads are the OSM ways life.js drives on (steps and the stadium footprint removed, same order and ids as life.js); two road ends within 6 m are joined',
      pedestrians: 'walk along a road at offset width/2 + 1.5 m on either side (the pavement polylines here), footpaths (width <= 2) on the centreline; roads up to 12 m wide',
      cars: 'roads 5 to 12 m wide, drive on the left at min(1.6, width/4) m from the centreline, 6 to 9 m/s, stop for anything within 8 m ahead',
      heights: 'y is the game ground at that point: terrain + 0.06 on carriageway, + 0.14 on pavements',
    },
    areas, arenas: arenaList, roads, pavements, crossings, lampPosts, shops: shopList,
  };
}
function prettyJson(obj) {   // one line per array item, so the file diffs sanely
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') parts.push(`  ${JSON.stringify(k)}: [\n${v.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]`);
    else parts.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`);
  }
  return '{\n' + parts.join(',\n') + '\n}\n';
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
export async function run() {
  const t0 = performance.now();
  log('waiting for the game to finish loading');
  await waitFor(() => window.__cam, 240000, 'the game (window.__cam)');
  log('waiting for the props');
  await Promise.all(Object.keys(PROPS).filter((k) => !k.startsWith('acc_')).map((k) => loadProp(k)));
  await tick(); await tick();
  await waitFor(() => propInfo('plane') || propInfo('oak') || propInfo('cherry'), 10000, 'tree props');
  log('waiting for the textures');
  const patches = await waitTextures();
  nameMaterials();
  const statics = collectStatics();
  const reg = await collectInstances();
  const want = OPT.areas && OPT.areas.length ? OPT.areas : AREA_IDS;
  const files = {}; const where = {};
  for (const id of AREA_IDS) {
    if (!want.includes(id)) continue;
    log(`building ${id}`); await tick();
    const { root, stats } = buildAreaScene(id, statics, reg);
    log(`exporting ${id}: ${stats.nodes} nodes, ${stats.uniqueMeshes} meshes, ${stats.triangles.toLocaleString()} triangles`); await tick();
    const buf = await exportGlb(root);
    stats.bytes = buf.byteLength; files[id] = stats;
    where[id] = await deliver(id + '.glb', buf, 'model/gltf-binary');
    root.clear(); await tick();
  }
  const json = buildWorldJson(files);
  const text = prettyJson(json);
  where.world = await deliver('world.json', text, 'application/json');
  for (const [m, k, t] of patches) m[k] = t;
  const summary = { seconds: Math.round((performance.now() - t0) / 10) / 100, files, where, roads: json.roads.length, pavements: json.pavements.length, crossings: json.crossings.length, lampPosts: json.lampPosts.length, shops: json.shops.length };
  window.__exportResult = summary;
  log(`done in ${summary.seconds} s`);
  post('export-done', { summary });
  return summary;
}
window.__export = { run, areaOf, OPT };
run().catch((e) => { console.error(e); log('FAILED: ' + (e && e.stack || e)); post('export-failed', { error: String(e && e.message || e) }); });
