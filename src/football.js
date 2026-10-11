// Football mode: a pitch in the world, a ball you kick by running into it, two keepers, a 60-second match.
import { THREE, CFG, scene, terrainHeight, MAT, player, addScore, say, shutUp, synth, showToast, emit, $ } from './core.js';

const P = CFG.pitch;
const GROUND = -0.8;             // pitch surface height (see terrainHeight)
const BALL_R = 0.45;
const GOAL_W = 7, GOAL_H = 2.6;

export const match = { active: false, time: 0, goals: 0, cooldown: 0, best: 0 };
export const ball = { mesh: null, pos: new THREE.Vector3(P.x, GROUND + BALL_R, P.z), vel: new THREE.Vector3(), lastKick: 0, resetTimer: 0 };
const keepers = [];
const particles = [];
let hudEl, hudGoals, hudTime;

function soccerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#151515';
  const hex = (x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) hex(32 + x * 96 + (y % 2) * 48, 40 + y * 84, 22);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function line(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), MAT.white);
  m.position.set(x, GROUND + 0.03, z); m.receiveShadow = true; scene.add(m);
}

function makeGoal(side) {
  const gx = P.x + side * P.w / 2;
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.1, 0.1, GOAL_H, 10);
  for (const sz of [-GOAL_W / 2, GOAL_W / 2]) { const p = new THREE.Mesh(postGeo, MAT.white); p.position.set(0, GOAL_H / 2, sz); p.castShadow = true; g.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, GOAL_W + 0.2, 10), MAT.white); bar.rotation.x = Math.PI / 2; bar.position.set(0, GOAL_H, 0); bar.castShadow = true; g.add(bar);
  const depth = 2.2;
  const net = new THREE.Mesh(new THREE.BoxGeometry(depth, GOAL_H, GOAL_W, 6, 7, 16), MAT.net); net.position.set(side * depth / 2, GOAL_H / 2, 0); g.add(net);
  g.position.set(gx, GROUND, P.z);
  scene.add(g);
}

function makeKeeper(side) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.8, 4, 12), MAT.boots); body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), MAT.spot); head.position.y = 1.85; g.add(head);
  const gloveGeo = new THREE.SphereGeometry(0.22, 10, 8);
  for (const sz of [-0.9, 0.9]) { const gl = new THREE.Mesh(gloveGeo, MAT.question); gl.position.set(0, 1.25, sz); g.add(gl); }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.8), MAT.boots); arm.position.y = 1.25; g.add(arm);
  for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), MAT.eye); e.position.set(-side * 0.3, 1.9, sx); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const x = P.x + side * (P.w / 2 - 1.2);
  g.position.set(x, GROUND, P.z);
  scene.add(g);
  keepers.push({ group: g, side, x, z: P.z, speed: 4.5 });
}

export function buildPitch() {
  const y = GROUND;
  const w = P.w, d = P.d;
  // outline + halfway + centre circle + boxes
  line(P.x, P.z - d / 2, w, 0.12); line(P.x, P.z + d / 2, w, 0.12); line(P.x - w / 2, P.z, 0.12, d); line(P.x + w / 2, P.z, 0.12, d); line(P.x, P.z, 0.12, d);
  const circle = new THREE.Mesh(new THREE.RingGeometry(3.8, 3.95, 48), MAT.white); circle.rotation.x = -Math.PI / 2; circle.position.set(P.x, y + 0.03, P.z); scene.add(circle);
  for (const s of [-1, 1]) { const bx = P.x + s * (w / 2 - 3); line(bx, P.z, 0.12, 12); line(P.x + s * (w / 2 - 1.5), P.z - 6, 3, 0.12); line(P.x + s * (w / 2 - 1.5), P.z + 6, 3, 0.12); }
  // low advertising boards around the pitch keep the ball in (Cam can jump them)
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.6 });
  const mk = (x, z, bw, bd) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.7, bd), boardMat); m.position.set(x, y + 0.35, z); m.castShadow = m.receiveShadow = true; scene.add(m); };
  mk(P.x, P.z - d / 2 - 2, w + 4, 0.2); mk(P.x, P.z + d / 2 + 2, w + 4, 0.2);
  for (const s of [-1, 1]) { mk(P.x + s * (w / 2 + 2), P.z - (d / 4 + GOAL_W / 4 + 1), 0.2, d / 2 - GOAL_W / 2 + 0.5); mk(P.x + s * (w / 2 + 2), P.z + (d / 4 + GOAL_W / 4 + 1), 0.2, d / 2 - GOAL_W / 2 + 0.5); }
  // corner flags
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), MAT.pole); pole.position.set(P.x + sx * w / 2, y + 0.8, P.z + sz * d / 2); scene.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), MAT.red); fl.position.set(P.x + sx * w / 2 + 0.25, y + 1.45, P.z + sz * d / 2); scene.add(fl);
  }
  makeGoal(-1); makeGoal(1);
  makeKeeper(-1); makeKeeper(1);
  // floodlights
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 8), MAT.metal); mast.position.set(P.x + sx * (w / 2 + 4), y + 4.5, P.z + sz * (d / 2 + 4)); mast.castShadow = true; scene.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.3), MAT.white); head.position.set(P.x + sx * (w / 2 + 4), y + 9.2, P.z + sz * (d / 2 + 4)); scene.add(head);
  }
  // ball
  ball.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 18), new THREE.MeshStandardMaterial({ map: soccerTexture(), roughness: 0.45 }));
  ball.mesh.castShadow = true;
  scene.add(ball.mesh);
  resetBall();
  hudEl = $('footballHud'); hudGoals = $('fbGoals'); hudTime = $('fbTime');
}

function resetBall() {
  ball.pos.set(P.x, GROUND + BALL_R + 1.5, P.z);
  ball.vel.set(0, 0, 0);
  ball.resetTimer = 0;
}

function burst(x, y, z, color) {
  const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 2 ? color : 0xffffff }));
    m.position.set(x, y, z);
    scene.add(m);
    particles.push({ m, vel: new THREE.Vector3((Math.random() - 0.5) * 10, 5 + Math.random() * 8, (Math.random() - 0.5) * 10), life: 1.6 + Math.random() });
  }
}

export function inPitch(x, z, pad = 0) { return Math.abs(x - P.x) < P.w / 2 + pad && Math.abs(z - P.z) < P.d / 2 + pad; }

function startMatch() {
  match.active = true; match.time = 60; match.goals = 0;
  resetBall();
  showToast('KICK OFF! 60 SECONDS', 1800);
  synth('whistle');
  say('woohoo', true);
  hudEl.hidden = false;
}

function endMatch() {
  match.active = false; match.cooldown = 3;
  match.best = Math.max(match.best, match.goals);
  showToast(`FULL TIME! ${match.goals} GOAL${match.goals === 1 ? '' : 'S'}`, 2600);
  synth('whistle'); setTimeout(() => synth('whistle'), 250); setTimeout(() => synth('whistle'), 500);
  say(match.goals >= 3 ? 'woohoo' : 'ooh', true);
  addScore(match.goals * 100);
  setTimeout(() => { if (!match.active) hudEl.hidden = true; }, 2800);
}

function goal(side) {
  match.goals++; player.stats.goals++;
  addScore(500);
  showToast('GOAL!!!', 1500);
  say('ohyeah', true);
  synth('power');
  burst(P.x + side * P.w / 2, GROUND + 2, P.z, 0xffd400);
  emit('goal');
  ball.resetTimer = 1.6;
  if (!match.active) { match.goals = 0; }
}

const tmp = new THREE.Vector3();
export function updateFootball(dt, t) {
  const p = player.pos;
  const inside = inPitch(p.x, p.z, 1);
  if (match.cooldown > 0) match.cooldown -= dt;
  if (inside && !match.active && match.cooldown <= 0 && !player.dead) startMatch();
  if (match.active) {
    match.time -= dt;
    hudGoals.textContent = match.goals; hudTime.textContent = Math.max(0, Math.ceil(match.time));
    if (match.time <= 0) endMatch();
  }
  if (!inside && !match.active) match.cooldown = Math.min(match.cooldown, 0.5);

  // --- ball physics ---
  if (ball.resetTimer > 0) { ball.resetTimer -= dt; if (ball.resetTimer <= 0) resetBall(); }
  const b = ball;
  b.vel.y -= 20 * dt;
  b.pos.addScaledVector(b.vel, dt);
  const gy = terrainHeight(b.pos.x, b.pos.z) + BALL_R;
  if (b.pos.y < gy) {
    b.pos.y = gy;
    if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.55;
    if (Math.abs(b.vel.y) < 0.8) b.vel.y = 0;
    const f = Math.max(0, 1 - 1.6 * dt); b.vel.x *= f; b.vel.z *= f;
  }
  b.vel.multiplyScalar(Math.max(0, 1 - 0.08 * dt));
  // boards (with gaps at the goal mouths)
  const bx = P.w / 2 + 2 - BALL_R, bz = P.d / 2 + 2 - BALL_R;
  const inMouth = Math.abs(b.pos.z - P.z) < GOAL_W / 2 && b.pos.y < GOAL_H;
  if (Math.abs(b.pos.z - P.z) > bz) { b.pos.z = P.z + Math.sign(b.pos.z - P.z) * bz; b.vel.z = -b.vel.z * 0.6; }
  if (Math.abs(b.pos.x - P.x) > bx && !inMouth) { b.pos.x = P.x + Math.sign(b.pos.x - P.x) * bx; b.vel.x = -b.vel.x * 0.6; }
  // goal line
  for (const side of [-1, 1]) {
    const gl = P.x + side * P.w / 2;
    if (inMouth && b.resetTimer <= 0 && side * (b.pos.x - gl) > BALL_R * 0.5 && side * (b.pos.x - gl) < 2.3) {
      goal(side);
    }
    // back of the net
    if (inMouth && side * (b.pos.x - gl) > 2.2 - BALL_R) { b.pos.x = gl + side * (2.2 - BALL_R); b.vel.x = -b.vel.x * 0.2; b.vel.multiplyScalar(0.5); }
  }
  // crossbar / posts are decorative; ball passes through the mouth freely

  // --- kick ---
  const kickR = BALL_R + 0.45 * player.scale;
  const dx = b.pos.x - p.x, dz = b.pos.z - p.z, dh = Math.hypot(dx, dz);
  const feetY = p.y, headY = p.y + 1.4 * player.scale;
  if (dh < kickR && b.pos.y - BALL_R < headY && b.pos.y + BALL_R > feetY - 0.2 && t - b.lastKick > 0.25) {
    b.lastKick = t;
    const hs = Math.hypot(player.vel.x, player.vel.z);
    const nx = dh > 0.001 ? dx / dh : Math.sin(player.yaw), nz = dh > 0.001 ? dz / dh : Math.cos(player.yaw);
    const power = Math.max(hs, 2.5) * 1.5 + 4 + (player.scale - 1) * 6;
    b.vel.set(nx * power, player.grounded ? 1.8 + hs * 0.25 : 6.5, nz * power);
    b.pos.x = p.x + nx * (kickR + 0.05); b.pos.z = p.z + nz * (kickR + 0.05);
    synth('kick');
    shutUp(true);
  }

  // --- keepers ---
  for (const k of keepers) {
    const targetZ = THREE.MathUtils.clamp(b.pos.z, P.z - GOAL_W / 2 + 0.6, P.z + GOAL_W / 2 - 0.6);
    const near = Math.abs(b.pos.x - k.x) < 14;
    k.z += (targetZ - k.z) * Math.min(1, (near ? k.speed : 1.5) * dt);
    k.group.position.set(k.x, GROUND, k.z);
    k.group.rotation.y = Math.sin(t * 6) * 0.1;
    // ball save
    const kd = Math.hypot(b.pos.x - k.x, b.pos.z - k.z);
    if (kd < BALL_R + 0.9 && b.pos.y < GROUND + 2.6 && Math.sign(b.vel.x) === k.side) {
      b.vel.x = -Math.abs(b.vel.x) * k.side * 0.8 - k.side * 3;
      b.vel.y = 4; b.vel.z += (Math.random() - 0.5) * 4;
      b.pos.x = k.x - k.side * (BALL_R + 1.0);
      synth('zap');
      if (match.active) showToast('SAVED!', 600);
    }
    // keeper blocks Cam a little
    const pd = Math.hypot(p.x - k.x, p.z - k.z);
    if (pd < 0.9 && p.y < GROUND + 2) { const ax = (p.x - k.x) / (pd || 1), az = (p.z - k.z) / (pd || 1); p.x = k.x + ax * 0.9; p.z = k.z + az * 0.9; }
  }

  // --- visuals ---
  b.mesh.position.copy(b.pos);
  const spin = b.vel.length() / BALL_R;
  if (spin > 0.01) { tmp.set(b.vel.z, 0, -b.vel.x).normalize(); b.mesh.rotateOnWorldAxis(tmp, spin * dt); }

  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt; q.vel.y -= 14 * dt; q.m.position.addScaledVector(q.vel, dt); q.m.rotation.x += dt * 5; q.m.rotation.y += dt * 7;
    if (q.m.position.y < GROUND) { q.m.position.y = GROUND; q.vel.y = -q.vel.y * 0.3; }
    if (q.life <= 0) { scene.remove(q.m); q.m.material.dispose(); particles.splice(i, 1); }
  }
}

export function resetFootball() {
  match.active = false; match.cooldown = 2;
  if (hudEl) hudEl.hidden = true;
  resetBall();
}
