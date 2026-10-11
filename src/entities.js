// Enemies, hazards and power-ups.
import { THREE, CFG, Q, scene, terrainHeight, seededRandom, MAT, player, addScore, hurt, say, playSfx, synth, showToast, isInvincible, respawnSafe, emit, mods } from './core.js';
import { pipes, lavaPools, addPlatform, movePlatform } from './world.js';

export const enemies = [];     // patrolling walkers: goomba | spiky
export const bats = [];
export const plants = [];
export const cannons = [];
export const bullets = [];
export const firebars = [];
export const thwomps = [];
export const spikes = [];
export const powerups = [];
export const movers = [];      // moving platforms

const tmp = new THREE.Vector3();
const now = () => performance.now() / 1000;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
function makeGoomba() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), MAT.goomba); body.scale.set(1, 0.85, 1); body.position.y = 0.5;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.78, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), MAT.goombaCap); cap.position.y = 0.72;
  const spotGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (const [sx, sz] of [[0.35, 0.45], [-0.4, 0.3], [0.1, -0.55], [-0.3, -0.4]]) { const s = new THREE.Mesh(spotGeo, MAT.spot); s.position.set(sx, 0.95, sz); s.scale.y = 0.4; g.add(s); }
  for (const sx of [-0.2, 0.2]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), MAT.spot); e.position.set(sx, 0.55, 0.47); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), MAT.eye); p.position.set(sx, 0.56, 0.56); g.add(p);
  }
  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.6), MAT.eye); feet.position.y = 0.1;
  g.add(body, cap, feet);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeSpiky() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), MAT.red); shell.position.y = 0.35; g.add(shell);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.35, 16), MAT.goombaCap); body.position.y = 0.2; g.add(body);
  const spikeGeo = new THREE.ConeGeometry(0.1, 0.45, 6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = i < 1 ? 0 : 0.38, el = i < 1 ? Math.PI / 2 : 0.9;
    const s = new THREE.Mesh(spikeGeo, MAT.spike);
    s.position.set(Math.cos(a) * r, 0.35 + Math.sin(el) * 0.55, Math.sin(a) * r);
    s.lookAt(s.position.clone().multiplyScalar(3).setY(3));
    s.rotateX(Math.PI / 2);
    g.add(s);
  }
  for (const sx of [-0.18, 0.18]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), MAT.eye); e.position.set(sx, 0.3, 0.52); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeBat() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), MAT.bat); g.add(body);
  const ears = [-0.15, 0.15].map((x) => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), MAT.bat); e.position.set(x, 0.35, 0); return e; });
  g.add(...ears);
  for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), MAT.fire); e.position.set(sx, 0.05, 0.28); g.add(e); }
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.5, 3, 1);
  const wl = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a4a, side: THREE.DoubleSide, roughness: 0.9 })); wl.position.set(-0.65, 0, 0);
  const wr = wl.clone(); wr.position.x = 0.65;
  g.add(wl, wr); g.userData.wings = [wl, wr];
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makePlant() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 10), MAT.plant); stem.position.y = 1.1; g.add(stem);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), MAT.plantHead); head.position.y = 2.4; g.add(head);
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), MAT.white); const a = i * 0.9; s.position.set(Math.cos(a) * 0.5, 2.4 + Math.sin(a) * 0.5, 0.3); g.add(s); }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), MAT.white); mouth.position.set(0, 2.2, 0.55); g.add(mouth);
  const leafGeo = new THREE.ConeGeometry(0.3, 0.9, 5);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(leafGeo, MAT.plant); l.position.set(sx * 0.45, 1.0, 0); l.rotation.z = -sx * 1.1; g.add(l); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeCannon(x, z) {
  const y0 = terrainHeight(x, z);
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), MAT.metal); base.position.y = 0.6; g.add(base);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.6, 16), MAT.cannon); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.3, 1.5, 0); g.add(barrel);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), MAT.white); skull.position.set(-0.6, 1.5, 0); g.add(skull);
  g.position.set(x, y0, z);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  return g;
}

function makeThwomp() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), MAT.thwomp); g.add(body);
  for (const sx of [-0.5, 0.5]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.1), MAT.eye); e.position.set(sx, 0.5, 1.22); e.rotation.z = sx > 0 ? 0.4 : -0.4; g.add(e); }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.1), MAT.eye); mouth.position.set(0, -0.4, 1.22); g.add(mouth);
  const spikeGeo = new THREE.ConeGeometry(0.12, 0.35, 5);
  for (let i = -1; i <= 1; i++) for (const side of [-1, 1]) { const s = new THREE.Mesh(spikeGeo, MAT.spike); s.position.set(side * 1.35, i * 0.8, 0); s.rotation.z = -side * Math.PI / 2; g.add(s); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const ballGeo = new THREE.SphereGeometry(0.42, 14, 10);
function makeBullet() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 10), MAT.bullet); b.rotation.z = Math.PI / 2; g.add(b);
  for (const sz of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), MAT.white); e.position.set(0.3, 0.1, sz); g.add(e); }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), MAT.white); arm.position.set(-0.1, -0.3, 0); g.add(arm);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------
// Spawners
// ---------------------------------------------------------------------------
export function addEnemy(kind, ax, az, bx, bz) {
  const group = kind === 'spiky' ? makeSpiky() : makeGoomba();
  scene.add(group);
  const e = { kind, group, a: new THREE.Vector3(ax, 0, az), b: new THREE.Vector3(bx, 0, bz), t: Math.random(), dir: 1, alive: true, squash: 0, speed: (kind === 'spiky' ? 0.18 : 0.12) + Math.random() * 0.1 };
  enemies.push(e);
  return e;
}

export function addBat(x, z) {
  const group = makeBat(); scene.add(group);
  bats.push({ group, cx: x, cz: z, a: Math.random() * 6, alive: true, swoop: 0, squash: 0, y: terrainHeight(x, z) + 4.5 });
}

export function addPlant(pipe) {
  const group = makePlant();
  group.position.set(pipe.x, pipe.top - 2.9, pipe.z);
  scene.add(group);
  plants.push({ group, pipe, phase: Math.random() * 5, up: 0 });
}

export function addCannon(x, z) {
  const group = makeCannon(x, z);
  cannons.push({ group, x, z, y: terrainHeight(x, z) + 1.5, cooldown: Math.random() * 2 });
}

export function addFirebar(x, z, n = 5, speed = 1.2) {
  const y0 = terrainHeight(x, z);
  const pivot = addPlatform(x, y0 + 2.6, z, 1.2, 1.2, 1.2, 'metal');
  const balls = [];
  for (let i = 1; i <= n; i++) {
    const m = new THREE.Mesh(ballGeo, MAT.fire); m.scale.setScalar(0.75); scene.add(m);
    balls.push(m);
  }
  const light = new THREE.PointLight(0xff6600, 1.8, 10, 2); scene.add(light);
  firebars.push({ x, z, y: y0 + 2.6, balls, angle: Math.random() * 6, speed, light });
}

export function addThwomp(x, z, height = 7) {
  const group = makeThwomp();
  const y0 = terrainHeight(x, z);
  group.position.set(x, y0 + height, z);
  scene.add(group);
  thwomps.push({ group, x, z, top: y0 + height, bottom: y0 + 1.3, y: y0 + height, state: 'wait', vy: 0, timer: 0 });
}

export function addSpikes(platform) {
  const p = platform;
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(0.16, 0.5, 6);
  const nx = Math.max(1, Math.floor(p.w / 0.5)), nz = Math.max(1, Math.floor(p.d / 0.5));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const s = new THREE.Mesh(geo, MAT.spike);
    s.position.set(p.min.x + 0.25 + i * 0.5, p.max.y + 0.25, p.min.z + 0.25 + j * 0.5);
    g.add(s);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  spikes.push({ p });
}

export function addMover(x, y, z, w, d, dx, dz, dy, period) {
  const p = addPlatform(x, y, z, w, 0.6, d, 'metal');
  movers.push({ p, x, y, z, dx, dz, dy, period, phase: Math.random() * 6 });
}

export const POWER = {
  jetpack: { label: 'JETPACK', secs: 18, mat: 'jetpack' },
  boots: { label: 'SPEED BOOTS', secs: 14, mat: 'boots' },
  spring: { label: 'SUPER SPRING', secs: 14, mat: 'spring' },
  star: { label: 'STAR POWER', secs: 10, mat: 'star' },
  giant: { label: 'GIANT CAM', secs: 14, mat: 'giant' },
};

function makePowerupMesh(kind) {
  const g = new THREE.Group();
  const m = MAT[POWER[kind].mat];
  if (kind === 'jetpack') {
    for (const sx of [-0.25, 0.25]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.8, 12), m); t.position.set(sx, 0, 0); g.add(t); const n = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 12), MAT.metal); n.position.set(sx, -0.5, 0); n.rotation.x = Math.PI; g.add(n); }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.1), MAT.metal); strap.position.z = -0.1; g.add(strap);
  } else if (kind === 'boots') {
    for (const sx of [-0.22, 0.22]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.55), m); b.position.set(sx, 0, 0.05); g.add(b); const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), MAT.white); w.position.set(sx, 0.2, -0.1); g.add(w); }
  } else if (kind === 'spring') {
    const s = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.07, 48, 8, 1, 6), m); g.add(s);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), MAT.metal); top.position.y = 0.45; g.add(top);
  } else if (kind === 'star') {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.22 : 0.5, a = (i / 10) * Math.PI * 2 - Math.PI / 2; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const s = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04 }), m); s.position.z = -0.09; g.add(s);
    for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), MAT.eye); e.position.set(sx, 0.05, 0.2); g.add(e); }
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); cap.position.y = 0.05; g.add(cap);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.35, 12), MAT.white); stem.position.y = -0.15; g.add(stem);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), MAT.white); const a = i * 1.3; s.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3); s.scale.y = 0.4; g.add(s); }
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  halo.rotation.x = Math.PI / 2; g.add(halo); g.userData.halo = halo;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function addPowerup(kind, x, z, y = null) {
  const group = makePowerupMesh(kind);
  const baseY = y ?? terrainHeight(x, z) + 1.3;
  group.position.set(x, baseY, z);
  scene.add(group);
  powerups.push({ kind, group, x, z, baseY, taken: false, respawn: 0 });
}

// ---------------------------------------------------------------------------
// World population
// ---------------------------------------------------------------------------
export function populate() {
  const rnd = seededRandom(987654);
  const P = CFG.pitch;
  const far = (x, z) => Math.hypot(x, z) > 9 && !(Math.abs(x - P.x) < P.w / 2 + 6 && Math.abs(z - P.z) < P.d / 2 + 6);

  const goombaSpots = [[10, 2], [-10, 6], [18, -20], [-22, -16], [28, 30], [-36, 34], [48, -22], [-60, -30], [70, 28], [-66, 62], [6, 50], [-18, -58], [90, -70], [-90, 10], [40, 80], [-45, -85], [60, 60], [-30, 80], [85, -30], [15, -90]];
  for (const [x, z] of goombaSpots) if (far(x, z)) addEnemy('goomba', x - 4, z, x + 4, z + (rnd() - 0.5) * 6);
  const spikySpots = [[24, -4], [-28, 14], [52, 18], [-52, -48], [0, 58], [78, -52], [-84, 40], [30, 96], [-12, -96], [96, 44]];
  for (const [x, z] of spikySpots) if (far(x, z)) addEnemy('spiky', x - 5, z, x + 5, z + (rnd() - 0.5) * 8);
  const batSpots = [[34, 24], [-30, -36], [44, -44], [-50, 50], [70, 6], [-6, 76], [92, 80], [-80, -78], [36, -70]];
  for (const [x, z] of batSpots) if (far(x, z)) addBat(x, z);

  // piranha plants in every other pipe
  pipes.forEach((p, i) => { if (i % 2 === 0) addPlant(p); });

  for (const [x, z] of [[20, -36], [-34, -4], [56, 40], [-62, 20], [8, 92], [88, -14]]) if (far(x, z)) addCannon(x, z);
  for (const [x, z, n, s] of [[-8, 24, 5, 1.3], [34, 8, 6, -1.1], [-46, -44, 5, 1.6], [62, -24, 7, 0.9], [-72, 84, 5, -1.4]]) if (far(x, z)) addFirebar(x, z, n, s);
  for (const [x, z] of [[12, -26], [-26, 40], [50, -6], [-58, -62], [24, 52], [-90, -40]]) if (far(x, z)) addThwomp(x, z);

  // spike-topped platforms along a gauntlet + moving platforms
  const gx = 46, gz = 30;
  for (let i = 0; i < 6; i++) {
    const x = gx + i * 4.5, z = gz + Math.sin(i) * 2, y = terrainHeight(x, z) + 2.4 + i * 0.5;
    const p = addPlatform(x, y, z, 3, 0.8, 3, i % 2 ? 'metal' : 'grass');
    if (i % 2) addSpikes(p);
    else addPowerup('boots', x, z, y + 1.4);
  }
  addMover(-16, terrainHeight(-16, 40) + 3, 40, 3, 3, 10, 0, 0, 6);
  addMover(26, terrainHeight(26, -48) + 3, -48, 3, 3, 0, 12, 0, 7);
  addMover(-40, terrainHeight(-40, -20) + 3, -20, 3, 3, 0, 0, 6, 5);
  addMover(70, terrainHeight(70, 70) + 4, 70, 3, 3, 8, 8, 2, 8);

  // power-ups spread around
  const pu = [['jetpack', 6, 12], ['jetpack', -44, 30], ['jetpack', 60, -70], ['jetpack', 36, -34, terrainHeight(36, -34) + 2.5 + 14 * 1.5 + 2.6], ['boots', -12, -12], ['boots', 80, 30], ['spring', 14, -6], ['spring', -70, -70], ['spring', 30, 70], ['star', -30, -60], ['star', 66, 10], ['star', -86, 74], ['giant', 0, 40], ['giant', 90, -60], ['giant', -60, -10]];
  for (const [k, x, z, y] of pu) addPowerup(k, x, z, y ?? null);
}

// ---------------------------------------------------------------------------
// Interaction helpers
// ---------------------------------------------------------------------------
function killEnemy(e, bounce = true) {
  e.alive = false; e.squash = 0.6;
  if (bounce) player.vel.y = 8.5;
  player.stats.stomps++;
  addScore(200);
  playSfx(CFG.stompSfx);
  say('ohyeah', true);
  showToast('STOMP!', 500);
  emit('stomp');
}

function touchHurt(kind, dx, dz, dh) {
  const k = dh > 0.001 ? { x: (dx / dh) * 6, z: (dz / dh) * 6 } : null;
  hurt(kind, k);
}

const PR = () => 0.38 * player.scale;
const PH = () => CFG.modelHeight * player.scale;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function updateEntities(dt, t) {
  const p = player.pos;
  const invincible = isInvincible();
  const canCrush = (player.power && (player.power.kind === 'star' || player.power.kind === 'giant')) || mods.giant;

  // walkers
  for (const e of enemies) {
    const g = e.group;
    if (!e.alive) { if (e.squash > 0) { e.squash -= dt; g.scale.set(1.4, 0.25, 1.4); if (e.squash <= 0) g.visible = false; } continue; }
    e.t += e.dir * e.speed * dt;
    if (e.t > 1) { e.t = 1; e.dir = -1; } else if (e.t < 0) { e.t = 0; e.dir = 1; }
    const x = e.a.x + (e.b.x - e.a.x) * e.t, z = e.a.z + (e.b.z - e.a.z) * e.t;
    g.position.set(x, terrainHeight(x, z), z);
    g.rotation.y = Math.atan2((e.b.x - e.a.x) * e.dir, (e.b.z - e.a.z) * e.dir);
    g.rotation.z = Math.sin(t * 10 + e.t * 50) * 0.08;
    const dx = p.x - x, dz = p.z - z, dh = Math.hypot(dx, dz);
    if (dh > 1.0 + PR()) continue;
    const ey = g.position.y;
    if (canCrush) { killEnemy(e, false); continue; }
    if (p.y > ey + 0.55 && player.vel.y < 0) {
      if (e.kind === 'spiky') { touchHurt('ooh', dx, dz, dh); player.vel.y = 7; }
      else killEnemy(e);
    } else if (p.y < ey + 1.2) touchHurt('ooh', dx, dz, dh);
  }

  // bats
  for (const b of bats) {
    const g = b.group;
    if (!b.alive) { if (b.squash > 0) { b.squash -= dt; g.scale.setScalar(Math.max(0.01, b.squash)); if (b.squash <= 0) g.visible = false; } continue; }
    const dx = p.x - g.position.x, dz = p.z - g.position.z, dh = Math.hypot(dx, dz);
    if (b.swoop <= 0 && dh < 14 && Math.random() < dt * 0.5) b.swoop = 2.2;
    if (b.swoop > 0) {
      b.swoop -= dt;
      tmp.set(p.x, p.y + 0.8, p.z).sub(g.position);
      const d = tmp.length(); if (d > 0.01) tmp.multiplyScalar(Math.min(1, 7 * dt / d));
      g.position.add(tmp);
    } else {
      b.a += dt * 0.6;
      const tx = b.cx + Math.cos(b.a) * 6, tz = b.cz + Math.sin(b.a) * 6;
      const ty = terrainHeight(tx, tz) + 4 + Math.sin(t * 2) * 0.6;
      g.position.lerp(tmp.set(tx, ty, tz), Math.min(1, 2 * dt));
    }
    g.lookAt(p.x, g.position.y, p.z);
    const flap = Math.sin(t * 18) * 0.7;
    g.userData.wings[0].rotation.z = flap; g.userData.wings[1].rotation.z = -flap;
    if (dh < 0.9 + PR() && Math.abs(p.y + 0.7 - g.position.y) < 1.2) {
      if (canCrush || (p.y + 0.3 > g.position.y && player.vel.y < 0)) { b.alive = false; b.squash = 0.4; if (!canCrush) player.vel.y = 7; player.stats.stomps++; addScore(300); playSfx(CFG.stompSfx); say('ohyeah', true); emit('stomp'); }
      else touchHurt('ooh', dx, dz, dh);
    }
  }

  // piranha plants
  for (const pl of plants) {
    const cyc = (t + pl.phase) % 6;
    const target = cyc < 2.6 ? 1 : 0;                   // up for 2.6s, hidden for 3.4s
    pl.up += (target - pl.up) * Math.min(1, 4 * dt);
    const near = Math.hypot(p.x - pl.pipe.x, p.z - pl.pipe.z) < 2.2 && p.y < pl.pipe.top + 0.5;
    if (near && pl.up < 0.2) pl.up = Math.max(0, pl.up - dt); // stays hidden if Cam is standing on the pipe
    pl.group.position.y = pl.pipe.top - 2.9 + pl.up * 2.6;
    pl.group.children[1].scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    if (pl.up > 0.5) {
      const hx = pl.pipe.x, hz = pl.pipe.z, hy = pl.group.position.y + 2.4;
      const dx = p.x - hx, dz = p.z - hz, dh = Math.hypot(dx, dz);
      if (dh < 0.9 + PR() && p.y < hy + 0.6 && p.y + PH() > hy - 0.7) {
        if (canCrush) { pl.up = 0; addScore(150); synth('zap'); }
        else touchHurt('ooh', dx, dz, dh);
      }
    }
  }

  // cannons + bullets
  for (const c of cannons) {
    c.cooldown -= dt;
    const dx = p.x - c.x, dz = p.z - c.z, dh = Math.hypot(dx, dz);
    c.group.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
    if (c.cooldown <= 0 && dh < 34 && dh > 3) {
      c.cooldown = 3.2;
      const g = makeBullet(); scene.add(g);
      const dir = tmp.set(dx, 0, dz).normalize();
      g.position.set(c.x + dir.x * 1.2, c.y, c.z + dir.z * 1.2);
      g.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
      bullets.push({ group: g, vx: dir.x * 7.5, vz: dir.z * 7.5, life: 7, alive: true });
      synth('boom');
    }
  }
  for (const b of bullets) {
    if (!b.alive) continue;
    b.life -= dt;
    b.group.position.x += b.vx * dt; b.group.position.z += b.vz * dt;
    const gy = terrainHeight(b.group.position.x, b.group.position.z) + 1.4;
    b.group.position.y += (gy - b.group.position.y) * Math.min(1, 3 * dt);
    const dx = p.x - b.group.position.x, dz = p.z - b.group.position.z, dh = Math.hypot(dx, dz);
    if (dh < 0.8 + PR() && p.y < b.group.position.y + 0.5 && p.y + PH() > b.group.position.y - 0.4) {
      if (canCrush || (p.y > b.group.position.y && player.vel.y < 0)) { b.alive = false; if (!canCrush) player.vel.y = 8; addScore(250); playSfx(CFG.stompSfx); say('ohyeah', true); player.stats.stomps++; emit('stomp'); }
      else { b.alive = false; touchHurt('ooh', dx, dz, dh); }
    }
    if (b.life <= 0) b.alive = false;
    if (!b.alive) scene.remove(b.group);
  }
  for (let i = bullets.length - 1; i >= 0; i--) if (!bullets[i].alive) bullets.splice(i, 1);

  // fire bars
  for (const f of firebars) {
    f.angle += f.speed * dt;
    f.balls.forEach((m, i) => {
      const r = 1.2 + i * 0.95;
      m.position.set(f.x + Math.cos(f.angle) * r, f.y, f.z + Math.sin(f.angle) * r);
      m.scale.setScalar(0.7 + Math.sin(t * 9 + i) * 0.1);
      if (!invincible && Math.hypot(p.x - m.position.x, p.z - m.position.z) < 0.6 + PR() && Math.abs(p.y + 0.7 - m.position.y) < 1.0) {
        touchHurt('ooh', p.x - f.x, p.z - f.z, Math.hypot(p.x - f.x, p.z - f.z));
      }
    });
    const last = f.balls[f.balls.length - 1]; f.light.position.copy(last.position);
  }

  // thwomps
  for (const th of thwomps) {
    const dx = p.x - th.x, dz = p.z - th.z, dh = Math.hypot(dx, dz);
    if (th.state === 'wait') { if (dh < 3.2 && p.y < th.top) { th.state = 'fall'; th.vy = 0; } }
    else if (th.state === 'fall') { th.vy += 40 * dt; th.y -= th.vy * dt; if (th.y <= th.bottom) { th.y = th.bottom; th.state = 'rest'; th.timer = 1.2; synth('thwomp'); if (dh < 6) shakeCamera(0.35); } }
    else if (th.state === 'rest') { th.timer -= dt; if (th.timer <= 0) th.state = 'rise'; }
    else { th.y += 2.2 * dt; if (th.y >= th.top) { th.y = th.top; th.state = 'wait'; } }
    th.group.position.y = th.y;
    th.group.rotation.z = th.state === 'wait' && dh < 5 ? Math.sin(t * 25) * 0.03 : 0;
    if (th.state === 'fall' && dh < 1.2 + PR() && p.y + PH() > th.y - 1.3 && p.y < th.y + 1.3) {
      if (!hurt('ohno')) {} else { respawnSafe(); }
    }
  }

  // spikes
  for (const s of spikes) {
    const q = s.p;
    if (p.x + PR() > q.min.x && p.x - PR() < q.max.x && p.z + PR() > q.min.z && p.z - PR() < q.max.z && Math.abs(p.y - q.max.y) < 0.15 && !player.power?.kind?.match(/star|giant/)) {
      hurt('ooh', { x: 0, z: 0 }); player.vel.y = 8;
    }
  }

  // moving platforms (carry the player)
  for (const m of movers) {
    const ph = ((t + m.phase) / m.period) * Math.PI * 2;
    const nx = m.x + Math.sin(ph) * m.dx, nz = m.z + Math.sin(ph) * m.dz, ny = m.y + Math.sin(ph) * m.dy;
    const ox = m.p.mesh.position.x, oz = m.p.mesh.position.z, oy = m.p.mesh.position.y;
    movePlatform(m.p, nx, ny, nz);
    const onTop = p.x + PR() > m.p.min.x && p.x - PR() < m.p.max.x && p.z + PR() > m.p.min.z && p.z - PR() < m.p.max.z && Math.abs(p.y - oy - 0.3) < 0.25 && player.vel.y <= 0.01;
    if (onTop) { p.x += nx - ox; p.z += nz - oz; p.y = m.p.max.y; }
  }

  // lava
  for (const l of lavaPools) {
    if (Math.hypot(p.x - l.x, p.z - l.z) < l.r - 0.3 && p.y < l.y + 0.35) {
      if (hurt('ohno')) respawnSafe();
    }
  }

  // power-ups
  for (const pu of powerups) {
    const g = pu.group;
    if (pu.taken) { pu.respawn -= dt; if (pu.respawn <= 0) { pu.taken = false; g.visible = true; } continue; }
    g.position.y = pu.baseY + Math.sin(t * 2 + pu.x) * 0.2;
    g.rotation.y = t * 1.5;
    g.userData.halo.rotation.z = t * 2;
    if (Math.hypot(p.x - pu.x, p.z - pu.z) < 1.1 + PR() && Math.abs(p.y + 0.7 - g.position.y) < 1.4) {
      pu.taken = true; pu.respawn = 40; g.visible = false;
      givePower(pu.kind);
    }
  }
}

export function givePower(kind) {
  const def = POWER[kind];
  player.power = { kind, until: now() + def.secs, total: def.secs };
  player.stats.powerups++;
  synth('power');
  say(kind === 'giant' ? 'woohoo' : 'yay', true);
  showToast(def.label + '!', 1200);
  emit('power', kind);
}

export function resetEntities() {
  for (const e of enemies) { e.alive = true; e.squash = 0; e.group.visible = true; e.group.scale.setScalar(1); }
  for (const b of bats) { b.alive = true; b.squash = 0; b.group.visible = true; b.group.scale.setScalar(1); b.swoop = 0; }
  for (const b of bullets) scene.remove(b.group);
  bullets.length = 0;
  for (const pu of powerups) { pu.taken = false; pu.group.visible = true; }
  player.power = null;
}

// camera shake hook (set by game.js)
export let shakeCamera = () => {};
export function setShake(fn) { shakeCamera = fn; }
