// Street life: people walking the pavements, the odd car that stops for them (and for Cam), cats, birds, pigeons.
import { THREE, CFG, scene, MAT, player, Q, QU, playSfx, setupObject, seededRandom } from './core.js';
import { world, groundAt, terrainHeight, surfaceAt, SURF, inStadium } from './map.js';
import { loadNpc, makeNpc, npcPlay } from './npc.js';
import { loadProp, propClone } from './props.js';

const rnd = seededRandom(1234);
export const walkers = [], cars = [], cats = [], flocks = [], pigeons = [];
let roads = [], roadGraph = null;

// ---------------------------------------------------------------------------
// Roads as a walkable / drivable graph
// ---------------------------------------------------------------------------
function buildGraph(d) {
  roads = d.roads.filter((r) => r.k !== 'steps' && r.p.length >= 2 && !r.p.every(([x, z]) => inStadium(x, z, 4)));
  // endpoints joined when within 6 m
  const ends = [];
  roads.forEach((r, i) => { ends.push({ r: i, end: 0, x: r.p[0][0], z: r.p[0][1] }); ends.push({ r: i, end: 1, x: r.p[r.p.length - 1][0], z: r.p[r.p.length - 1][1] }); });
  roadGraph = { ends, next: (ri, end) => { const e = ends.find((q) => q.r === ri && q.end === end); const near = ends.filter((q) => q.r !== ri && Math.hypot(q.x - e.x, q.z - e.z) < 6); return near.length ? near[Math.floor(rnd() * near.length)] : null; } };
}
function roadLen(r) { let l = 0; for (let i = 1; i < r.p.length; i++) l += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]); return l; }
// position + heading along a road at distance s from its start (or from its end when dir = -1)
function along(r, s, dir) {
  const pts = dir > 0 ? r.p : [...r.p].reverse(); let acc = 0;
  for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i]; const l = Math.hypot(bx - ax, bz - az); if (acc + l >= s || i === pts.length - 1) { const t = l > 0 ? Math.min(1, Math.max(0, (s - acc) / l)) : 0; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (l || 1), dz: (bz - az) / (l || 1) }; } acc += l; }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}
function pickRoad(nearX, nearZ, radius, minW, maxW) {
  const c = []; roads.forEach((r, i) => { if (r.w < minW || r.w > maxW) return; const [x, z] = r.p[0]; if (Math.hypot(x - nearX, z - nearZ) < radius) c.push(i); });
  return c.length ? c[Math.floor(rnd() * c.length)] : -1;
}

// ---------------------------------------------------------------------------
// Walkers (pedestrians)
// ---------------------------------------------------------------------------
const WALKER_N = QU() ? 26 : Q() ? 18 : 10;
function spawnWalker(nearX, nearZ) {
  const ri = pickRoad(nearX, nearZ, 140, 2, 12); if (ri < 0) return null;
  const r = roads[ri]; const dir = rnd() < 0.5 ? 1 : -1; const len = roadLen(r);
  const kind = rnd() < 0.5 ? 'man' : 'woman';
  const w = { ri, dir, s: rnd() * len, len, side: rnd() < 0.5 ? 1 : -1, speed: 1.15 + rnd() * 0.5, kind, mesh: makeNpc(kind), wait: 0, t: rnd() * 10, state: 'walk' };
  placeWalker(w); scene.add(w.mesh); walkers.push(w); return w;
}
function placeWalker(w) { const r = roads[w.ri]; const pad = r.w <= 2 ? 0 : r.w / 2 + 1.5; const p = along(r, w.s, w.dir); const x = p.x - p.dz * pad * w.side, z = p.z + p.dx * pad * w.side; w.mesh.position.set(x, groundAt(x, z).y, z); w.mesh.rotation.y = Math.atan2(p.dx, p.dz); }
function stepWalker(w, dt) {
  const r = roads[w.ri]; const pad = r.w <= 2 ? 0 : r.w / 2 + 1.5;
  // pause for Cam or a car
  const d = Math.hypot(w.mesh.position.x - player.pos.x, w.mesh.position.z - player.pos.z);
  const facingCam = d < 1.6; let blocked = facingCam;
  if (!blocked) for (const c of cars) if (Math.hypot(w.mesh.position.x - c.mesh.position.x, w.mesh.position.z - c.mesh.position.z) < 3.2) { blocked = true; break; }
  if (blocked) { npcPlay(w.mesh, 'idle'); if (facingCam) { w.mesh.rotation.y = Math.atan2(player.pos.x - w.mesh.position.x, player.pos.z - w.mesh.position.z); } return; }
  npcPlay(w.mesh, 'walk');
  w.s += w.speed * dt;
  if (w.s >= w.len) {
    const nx = roadGraph.next(w.ri, w.dir > 0 ? 1 : 0);
    if (nx && roads[nx.r].w <= 12) { w.ri = nx.r; w.dir = nx.end === 0 ? 1 : -1; w.len = roadLen(roads[w.ri]); w.s = 0; } else { w.dir = -w.dir; w.s = 0; }
  }
  const p = along(roads[w.ri], w.s, w.dir); const nx = -p.dz, nz = p.dx;
  const x = p.x + nx * pad * w.side, z = p.z + nz * pad * w.side;
  w.mesh.position.set(x, groundAt(x, z).y, z); w.mesh.rotation.y = Math.atan2(p.dx, p.dz);
}

// ---------------------------------------------------------------------------
// Cars: drive on the left, stop for anyone in the road ahead
// ---------------------------------------------------------------------------
const CAR_COLORS = [0xd8d8d8, 0x2a2a2e, 0x8a1c1c, 0x1f3f8a, 0x4b6b3a, 0xc0c0c8, 0xe0a020];
function makeCar(color) {
  const g = new THREE.Group();
  // modelled car when the prop has loaded (long axis x → turned so +z is forward), tinted per car
  const kind = rnd() < 0.8 ? 'hatchback' : 'van';
  const model = propClone(kind);
  if (model) { model.rotation.y = Math.PI / 2; model.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (kind === 'hatchback') o.material.color.setHex(color).lerp(new THREE.Color(0xffffff), 0.35); } }); setupObject(model); g.add(model); return g; }
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 }); setupObject({ traverse: (f) => f({ material: paint }) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 4.1), paint); body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.0), paint); cabin.position.set(0, 1.07, -0.2); g.add(cabin);
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fb4d8, roughness: 0.15, metalness: 0.3 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.36, 1.9), glass); win.position.set(0, 1.1, -0.2); g.add(win);
  for (const [sx, sz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14), MAT.eye); wh.rotation.z = Math.PI / 2; wh.position.set(sx, 0.33, sz); g.add(wh); }
  for (const sx of [-0.6, 0.6]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), MAT.lampGlow); hl.position.set(sx, 0.62, 2.06); g.add(hl); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), MAT.red); tl.position.set(sx, 0.62, -2.06); g.add(tl); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const CAR_N = QU() ? 8 : Q() ? 6 : 3;
function spawnCar(nearX, nearZ) {
  const ri = pickRoad(nearX, nearZ, 220, 5, 12); if (ri < 0) return null;
  const r = roads[ri]; const len = roadLen(r); if (len < 30) return null;
  const c = { ri, dir: rnd() < 0.5 ? 1 : -1, s: rnd() * len, len, v: 0, vmax: 6 + rnd() * 3, mesh: makeCar(CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]), passed: false, x: 0, z: 0, dx: 1, dz: 0 };
  scene.add(c.mesh); cars.push(c); return c;
}
function stepCar(c, dt) {
  const r = roads[c.ri];
  // anything in the road ahead? (Cam, walkers, other cars) — brake and wait
  let stop = false;
  const aheadOf = (x, z, range, half) => { const rx = x - c.x, rz = z - c.z; const f = rx * c.dx + rz * c.dz, s = -rx * c.dz + rz * c.dx; return f > -1 && f < range && Math.abs(s) < half; };
  if (aheadOf(player.pos.x, player.pos.z, 9, 2.6)) stop = true;
  if (!stop) for (const w of walkers) if (aheadOf(w.mesh.position.x, w.mesh.position.z, 8, 2.4)) { stop = true; break; }
  if (!stop) for (const o of cars) if (o !== c && aheadOf(o.mesh.position.x, o.mesh.position.z, 7, 1.6)) { stop = true; break; }
  if (!stop) for (const k of cats) if (aheadOf(k.mesh.position.x, k.mesh.position.z, 7, 2.4)) { stop = true; break; }
  const target = stop ? 0 : c.vmax;
  c.v += (target - c.v) * Math.min(1, (stop ? 4 : 1.2) * dt);
  if (c.v < 0.05) c.v = 0;
  c.s += c.v * dt;
  if (c.s >= c.len) {
    const nx = roadGraph.next(c.ri, c.dir > 0 ? 1 : 0);
    if (nx && roads[nx.r].w >= 5) { c.ri = nx.r; c.dir = nx.end === 0 ? 1 : -1; c.len = roadLen(roads[c.ri]); c.s = 0; } else { c.dir = -c.dir; c.s = 0; }
  }
  const p = along(roads[c.ri], c.s, c.dir); const nx = -p.dz, nz = p.dx;
  const off = Math.min(1.6, r.w / 4);   // keep left
  c.x = p.x - nx * off; c.z = p.z - nz * off; c.dx = p.dx; c.dz = p.dz;
  c.mesh.position.set(c.x, groundAt(c.x, c.z).y + 0.02, c.z); c.mesh.rotation.y = Math.atan2(p.dx, p.dz);
  // whoosh when it passes Cam
  const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
  if (d < 14 && c.v > 3 && !c.passed) { c.passed = true; playSfx(CFG.sfx.carPass, 0.5); } else if (d > 30) c.passed = false;
}

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------
function makeCat() {
  const g = new THREE.Group(); const fur = new THREE.MeshStandardMaterial({ color: [0x2b2b2b, 0xd98b3c, 0xbdbdbd, 0xf2f2f2][Math.floor(rnd() * 4)], roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 10), fur); body.rotation.z = Math.PI / 2; body.position.y = 0.22; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), fur); head.position.set(0, 0.3, 0.24); g.add(head);
  for (const sx of [-0.05, 0.05]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 6), fur); ear.position.set(sx, 0.39, 0.22); g.add(ear); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.3, 6), fur); tail.position.set(0, 0.3, -0.25); tail.rotation.x = -0.7; g.add(tail); g.userData.tail = tail;
  for (const [sx, sz] of [[-0.07, 0.12], [0.07, 0.12], [-0.07, -0.12], [0.07, -0.12]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), fur); leg.position.set(sx, 0.1, sz); g.add(leg); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function spawnCat(nearX, nearZ) {
  const ri = pickRoad(nearX, nearZ, 160, 3, 12); if (ri < 0) return null;
  const r = roads[ri]; const len = roadLen(r);
  const c = { ri, dir: 1, s: rnd() * len, len, side: rnd() < 0.5 ? 1 : -1, mesh: makeCat(), state: 'sit', timer: 2 + rnd() * 6, meowCool: 0, x: 0, z: 0 };
  { const p = along(r, c.s, 1); const pad = r.w / 2 + 2.6; c.x = p.x - p.dz * pad * c.side; c.z = p.z + p.dx * pad * c.side; c.mesh.position.set(c.x, groundAt(c.x, c.z).y, c.z); }
  scene.add(c.mesh); cats.push(c); return c;
}
function stepCat(c, dt, t) {
  const r = roads[c.ri]; const pad = r.w / 2 + 2.6;
  c.timer -= dt; c.meowCool -= dt;
  if (c.timer <= 0) { c.state = c.state === 'walk' ? 'sit' : 'walk'; c.timer = c.state === 'walk' ? 4 + rnd() * 8 : 3 + rnd() * 6; if (c.state === 'walk' && rnd() < 0.3) c.dir = -c.dir; }
  const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
  if (d < 2.2 && c.meowCool <= 0) { c.meowCool = 12 + rnd() * 20; playSfx(CFG.sfx.meow, 0.6); c.state = 'walk'; c.timer = 3; }
  if (c.state === 'walk') { c.s += 0.8 * dt; if (c.s >= c.len) { c.dir = -c.dir; c.s = 0; } }
  const p = along(r, c.s, c.dir); const nx = -p.dz, nz = p.dx;
  c.x = p.x + nx * pad * c.side; c.z = p.z + nz * pad * c.side;
  c.mesh.position.set(c.x, groundAt(c.x, c.z).y, c.z);
  if (c.state === 'walk') c.mesh.rotation.y = Math.atan2(p.dx * c.dir, p.dz * c.dir);
  c.mesh.userData.tail.rotation.z = Math.sin(t * 2.5 + c.s) * 0.4;
}

// ---------------------------------------------------------------------------
// Birds: flocks circling above the parks, pigeons on the grass that scatter
// ---------------------------------------------------------------------------
function makeBird(dark = true) {
  const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: dark ? 0x202020 : 0x6e6e72, side: THREE.DoubleSide });
  const wing = () => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.05, -0.08, 0.32, 0.05, 0.08], 3)); geo.computeVertexNormals(); return new THREE.Mesh(geo, m); };
  const l = wing(), rr = wing(); rr.scale.x = -1; g.add(l, rr); g.userData.wings = [l, rr];
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), m); body.scale.set(1, 0.8, 2.2); g.add(body);
  return g;
}
function spawnFlock(cx, cz, y) {
  const f = { cx, cz, y, r: 14 + rnd() * 12, birds: [], phase: rnd() * 6.28, speed: 0.35 + rnd() * 0.2 };
  const n = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) { const b = makeBird(true); b.userData.off = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; b.userData.flap = rnd() * 6; scene.add(b); f.birds.push(b); }
  flocks.push(f); return f;
}
function spawnPigeons(cx, cz) {
  const group = { cx, cz, birds: [], up: 0 };
  for (let i = 0; i < 5; i++) { const b = makeBird(false); b.userData.gx = cx + (rnd() - 0.5) * 6; b.userData.gz = cz + (rnd() - 0.5) * 6; b.userData.h = 0; b.rotation.y = rnd() * 6.28; b.position.set(b.userData.gx, terrainHeight(b.userData.gx, b.userData.gz) + 0.05, b.userData.gz); scene.add(b); group.birds.push(b); }
  pigeons.push(group); return group;
}

// ---------------------------------------------------------------------------
// Build + update
// ---------------------------------------------------------------------------
export function buildLife() {
  const d = world.data; buildGraph(d);
  loadProp('hatchback'); loadProp('van');
  loadNpc('man'); loadNpc('woman');
  const px = player.pos.x, pz = player.pos.z;
  for (let i = 0; i < WALKER_N; i++) spawnWalker(px, pz);
  for (let i = 0; i < CAR_N; i++) spawnCar(px, pz);
  Promise.all([loadProp('hatchback'), loadProp('van')]).then(() => { for (const c of cars) { const col = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]; scene.remove(c.mesh); c.mesh = makeCar(col); scene.add(c.mesh); } });
  for (let i = 0; i < (Q() ? 6 : 3); i++) spawnCat(px, pz);
  // flocks over the bigger green spaces, pigeons on a few
  const greens = d.areas.filter((a) => (a.k === 'grass' || a.k === 'cemetery') && a.a > 6000).slice(0, Q() ? 8 : 4);
  for (const a of greens) { spawnFlock(a.c ? a.c[0] : a.p[0][0], a.c ? a.c[1] : a.p[0][1], terrainHeight(a.p[0][0], a.p[0][1]) + 18 + rnd() * 10); }
  for (const w of CFG.worlds) if (w.id === 'nunhead' || w.id === 'park') spawnPigeons(w.x - 12, w.z + 6);
}
let respawnT = 0;
export function updateLife(dt, t) {
  if (!roadGraph) return;
  const px = player.pos.x, pz = player.pos.z;
  // recycle anything that has drifted far away
  respawnT -= dt;
  if (respawnT <= 0) {
    respawnT = 2;
    for (const w of walkers) if (Math.hypot(w.mesh.position.x - px, w.mesh.position.z - pz) > 220) { const ri = pickRoad(px, pz, 120, 2, 12); if (ri >= 0) { w.ri = ri; w.len = roadLen(roads[ri]); w.s = rnd() * w.len; placeWalker(w); } }
    for (const c of cars) if (Math.hypot(c.x - px, c.z - pz) > 320) { const ri = pickRoad(px, pz, 200, 5, 12); if (ri >= 0 && roadLen(roads[ri]) > 30) { c.ri = ri; c.len = roadLen(roads[ri]); c.s = rnd() * c.len; c.v = 0; } }
    for (const k of cats) if (Math.hypot(k.x - px, k.z - pz) > 220) { const ri = pickRoad(px, pz, 140, 3, 12); if (ri >= 0) { k.ri = ri; k.len = roadLen(roads[ri]); k.s = rnd() * k.len; const p = along(roads[ri], k.s, 1); k.x = p.x; k.z = p.z; } }
  }
  for (const w of walkers) { const far = Math.hypot(w.mesh.position.x - px, w.mesh.position.z - pz) > 150; w.mesh.visible = !far; if (!far) { stepWalker(w, dt); if (w.mesh.userData.mixer) w.mesh.userData.mixer.update(dt); } }
  for (const c of cars) stepCar(c, dt);
  for (const k of cats) { const far = Math.hypot(k.x - px, k.z - pz) > 120; k.mesh.visible = !far; if (!far) stepCat(k, dt, t); }
  for (const f of flocks) {
    const far = Math.hypot(f.cx - px, f.cz - pz) > 260;
    for (const b of f.birds) { b.visible = !far; if (far) continue; const o = b.userData.off; const a = t * f.speed + f.phase + o[0] * 0.5; const r = f.r + o[1] * 4; b.position.set(f.cx + Math.cos(a) * r, f.y + o[2] * 3 + Math.sin(t * 0.7 + o[0]) * 1.5, f.cz + Math.sin(a) * r); b.rotation.y = -a; const fl = Math.sin(t * 9 + b.userData.flap) * 0.7; b.userData.wings[0].rotation.z = fl; b.userData.wings[1].rotation.z = -fl; }
  }
  for (const g of pigeons) {
    const d = Math.hypot(g.cx - px, g.cz - pz);
    if (d < 7 && g.up <= 0) { g.up = 6; playSfx(CFG.sfx.pigeons, 0.5); }
    if (g.up > 0) { g.up -= dt; for (const b of g.birds) { b.userData.h = Math.min(8, b.userData.h + dt * 6); const a = t * 1.5 + b.userData.gx; b.position.set(b.userData.gx + Math.cos(a) * b.userData.h * 0.8, terrainHeight(b.userData.gx, b.userData.gz) + 0.05 + b.userData.h, b.userData.gz + Math.sin(a) * b.userData.h * 0.8); const fl = Math.sin(t * 12 + b.userData.gx) * 0.8; b.userData.wings[0].rotation.z = fl; b.userData.wings[1].rotation.z = -fl; b.rotation.y = -a; } }
    else for (const b of g.birds) { if (b.userData.h > 0) { b.userData.h = Math.max(0, b.userData.h - dt * 3); b.position.y = terrainHeight(b.userData.gx, b.userData.gz) + 0.05 + b.userData.h; if (b.userData.h === 0) { b.position.set(b.userData.gx, terrainHeight(b.userData.gx, b.userData.gz) + 0.05, b.userData.gz); b.userData.wings[0].rotation.z = 0.2; b.userData.wings[1].rotation.z = -0.2; } } else { b.rotation.y += Math.sin(t * 0.8 + b.userData.gx) * dt * 0.3; } }
  }
}
export function lifeNear(x, z, r) { let n = 0; for (const w of walkers) if (Math.hypot(w.mesh.position.x - x, w.mesh.position.z - z) < r) n++; return n; }
