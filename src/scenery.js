// Scenery built from Higgsfield/Meshy props: real trees, house modules on the terraces near Cam, parked cars,
// bus shelters, benches, bins, playgrounds and flower beds. Procedural stand-ins stay for the low preset.
import { THREE, CFG, scene, player, Q, QU, seededRandom, FAR_FADE } from './core.js';
import { world, terrainHeight, groundAt, inStadium, addCircle } from './map.js';
import { PROPS, loadProp, placeProp, placePropFit, propInfo, resetPool } from './props.js';

const rnd = seededRandom(99);
let treesDone = false;

export function buildScenery() {
  if (!Q()) return;
  const d = world.data;
  // --- trees: swap the procedural canopies for the modelled ones once they arrive ---
  Promise.all([loadProp('plane'), loadProp('oak'), loadProp('cherry')]).then(([a, b, c]) => {
    if (!a && !b && !c) return;
    const kinds = [a && 'plane', a && 'plane', b && 'oak', b && 'oak', c && 'cherry'].filter(Boolean);
    treePlan = (world.treeList || []).map(([x, z]) => ({ x, z, k: kinds[Math.floor(rnd() * kinds.length)], s: 0.8 + rnd() * 0.45, yaw: rnd() * 6.28 }));
    treesDone = true; lastTree = null;
  });
  // --- street furniture ---
  const stops = d.pois.filter((p) => p.k === 'bus_stop');
  for (const p of stops) {
    if (inStadium(p.x, p.z, 6)) continue;
    const nd = nearestRoadDir(d, p.x, p.z); if (nd.dist > 12) continue;
    const yaw = Math.atan2(nd.dir[0], nd.dir[1]);
    // set the shelter back onto the pavement, parallel to the road, opening toward the road
    const nx = -nd.dir[1] / (Math.hypot(...nd.dir) || 1), nz = nd.dir[0] / (Math.hypot(...nd.dir) || 1);
    const side = Math.sign((p.x - nd.px) * nx + (p.z - nd.pz) * nz) || 1;
    const x = nd.px + nx * side * (nd.w / 2 + 2.6), z = nd.pz + nz * side * (nd.w / 2 + 2.6);
    placeProp('shelter', x, terrainHeight(x, z), z, yaw + Math.PI / 2 + (side > 0 ? Math.PI : 0));
    addCircle(x, z, 1.2, 2.6);
    const bx = x + nd.dir[0] / (Math.hypot(...nd.dir) || 1) * 3.2, bz = z + nd.dir[1] / (Math.hypot(...nd.dir) || 1) * 3.2;
    placeProp('bin', bx, terrainHeight(bx, bz), bz, rnd() * 6.28, 0.9);
  }
  // --- parked cars on the residential streets (left-hand kerb) ---
  let carN = 0; const carMax = QU() ? 160 : 90;
  for (const r of d.roads) {
    if (r.w < 5 || r.w > 9 || !r.n || r.p.length < 2) continue;
    for (let i = 0; i < r.p.length - 1 && carN < carMax; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const len = Math.hypot(bx - ax, bz - az); if (len < 14) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len; const nx = -dz, nz = dx;
      for (let s = 7; s < len - 7; s += 11 + rnd() * 9) {
        if (rnd() > 0.42) continue;
        const side = rnd() < 0.5 ? 1 : -1;
        const x = ax + dx * s + nx * side * (r.w / 2 - 1.05), z = az + dz * s + nz * side * (r.w / 2 - 1.05);
        if (inStadium(x, z, 8)) continue;
        if (world.signs && world.signs.some((q) => Math.hypot(q.x - x, q.z - z) < 7)) continue;
        const kind = rnd() < 0.8 ? 'hatchback' : 'van';
        const yaw = Math.atan2(dx, dz) - Math.PI / 2 + (side > 0 ? 0 : Math.PI);   // the car models are long along x, nose toward -x
        placeProp(kind, x, groundAt(x, z).y, z, yaw); addCircle(x, z, 1.0, 1.5); carN++;
      }
    }
  }
  // --- parks: benches, flower beds, bins; playgrounds on the playground polygons ---
  for (const a of d.areas) {
    if ((a.k !== 'grass' && a.k !== 'cemetery') || !a.c || a.a < 1500) continue;
    const n = Math.min(6, Math.max(1, Math.round(a.a / 4000)));
    for (let i = 0; i < n; i++) {
      const ang = rnd() * 6.28, rr = Math.sqrt(a.a) * (0.12 + rnd() * 0.22); const x = a.c[0] + Math.cos(ang) * rr, z = a.c[1] + Math.sin(ang) * rr;
      if (!pointInPoly(x, z, a.p) || inStadium(x, z, 4)) continue;
      placeProp('bench', x, terrainHeight(x, z), z, ang); addCircle(x, z, 0.8, 1);
      if (i % 2 === 0) { const bx = x + Math.cos(ang + 1.3) * 2, bz = z + Math.sin(ang + 1.3) * 2; placeProp('bin', bx, terrainHeight(bx, bz), bz, rnd() * 6.28, 0.9); }
    }
    if (a.k === 'grass' && a.a > 6000) for (let i = 0; i < 2; i++) { const ang = rnd() * 6.28, rr = Math.sqrt(a.a) * 0.08 * (i + 1); const x = a.c[0] + Math.cos(ang) * rr, z = a.c[1] + Math.sin(ang) * rr; if (pointInPoly(x, z, a.p)) { placeProp('flowers', x, terrainHeight(x, z), z, rnd() * 6.28); addCircle(x, z, 1.4, 0.8); } }
  }
  for (const p of d.pitches) if (p.k === 'playground' && p.c && !inStadium(p.c[0], p.c[1], 6)) { placeProp('playground', p.c[0], terrainHeight(p.c[0], p.c[1]), p.c[1], rnd() * 6.28); addCircle(p.c[0], p.c[1], 2.2, 2.5); }
  // --- house modules: plan now, place near Cam as he moves ---
  Promise.all([loadProp('houseVic'), loadProp('houseEdw')]).then(() => { housesReady = !!(propInfo('houseVic') || propInfo('houseEdw')); FAR_FADE.value = housesReady ? HOUSE_FADE : 0; lastHouse = null; });
}
function pointInPoly(x, z, p) { let inside = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; }
function nearestRoadDir(d, x, z) {
  let best = 1e9, dir = [1, 0], px = x, pz = z, w = 6;
  for (const r of d.roads) { if (r.w < 4) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const cx = ax + dx * t, cz = az + dz * t; const dd = Math.hypot(x - cx, z - cz); if (dd < best) { best = dd; dir = [dx, dz]; px = cx; pz = cz; w = r.w; } } }
  return { dir, px, pz, dist: best, w };
}

// house modules follow the player: every few metres the pools are refilled with the terraces within HOUSE_R
let housesReady = false, lastHouse = null; const HOUSE_R = QU() ? 170 : 120;
let treePlan = null, lastTree = null; const TREE_R = QU() ? 190 : 140, TREE_MAX = QU() ? 900 : 600;
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
function refreshTrees(px, pz) {
  if (!treePlan) return;
  if (lastTree && Math.hypot(px - lastTree[0], pz - lastTree[1]) < 14) return;
  lastTree = [px, pz];
  resetPool('plane'); resetPool('oak'); resetPool('cherry');
  const [trunks, canopies] = world.treeMeshes; const orig = world.treeOrig; const L = orig.lobes;
  // nearest first so the cap keeps the trees around Cam
  const near = []; treePlan.forEach((t, i) => { const d = Math.hypot(t.x - px, t.z - pz); if (d < TREE_R) near.push([d, i]); });
  near.sort((a, b) => a[0] - b[0]); const chosen = new Set(near.slice(0, TREE_MAX).map((q) => q[1]));
  for (let i = 0; i < treePlan.length; i++) {
    const t = treePlan[i]; const use = chosen.has(i);
    if (use) { placeProp(t.k, t.x, terrainHeight(t.x, t.z) - 0.1, t.z, t.yaw, t.s); trunks.setMatrixAt(i, _zero); for (let k = 0; k < L; k++) canopies.setMatrixAt(i * L + k, _zero); }
    else { trunks.instanceMatrix.array.set(orig.trunk.subarray(i * 16, i * 16 + 16), i * 16); for (let k = 0; k < L; k++) canopies.instanceMatrix.array.set(orig.canopy.subarray((i * L + k) * 16, (i * L + k) * 16 + 16), (i * L + k) * 16); }
  }
  trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true;
}
export const HOUSE_FADE = HOUSE_R - 15;
export function updateScenery(dt) {
  const px = player.pos.x, pz = player.pos.z;
  refreshTrees(px, pz);
  if (!housesReady || !world.modules) return;
  if (lastHouse && Math.hypot(px - lastHouse[0], pz - lastHouse[1]) < 12) return;
  lastHouse = [px, pz];
  resetPool('houseVic'); resetPool('houseEdw');
  const vic = propInfo('houseVic'), edw = propInfo('houseEdw');
  for (const m of world.modules) {
    if (Math.hypot(m.x - px, m.z - pz) > HOUSE_R) continue;
    const kind = (m.style === 1 && edw) || !vic ? 'houseEdw' : 'houseVic'; const info = kind === 'houseEdw' ? edw : vic; if (!info) continue;
    const n = Math.max(1, Math.round(m.len / 5.6)); const mw = m.len / n;
    const ca = Math.cos(m.ang), sa = Math.sin(m.ang);
    const yaw = Math.atan2(m.front[0], m.front[1]);
    const sx = mw / info.width * 1.02, sz = m.wid / info.depth * 1.02, sy = Math.min(1.35, Math.max(0.75, m.h / info.height));
    for (let i = 0; i < n; i++) {
      const u = -m.len / 2 + (i + 0.5) * mw; const x = m.x + u * ca, z = m.z + u * sa;
      placePropFit(kind, x, m.base, z, yaw, sx, sy, sz);
    }
  }
}
