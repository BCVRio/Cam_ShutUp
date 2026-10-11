// Football: four arenas (stadium, cage, park, green), one real ball each, goals, keepers, bots, matches.
import { THREE, CFG, scene, MAT, TEX, player, say, shutUp, synth, showToast, feed, emit, addScore, $ } from './core.js';
import { Ball, BALL_R } from './ball.js';
import { terrainHeight, groundAt, addFlatZone, findPitch, pitchRect, addSegment, addCircle, collideCircle } from './map.js';

export const arenas = [];
export let activeArena = null;
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

// ---------------------------------------------------------------------------
// Pitch furniture
// ---------------------------------------------------------------------------
function lineMesh(ax, az, bx, bz, y, w = 0.12) {
  const len = Math.hypot(bx - ax, bz - az); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), MAT.white);
  m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(bz - az, bx - ax); m.position.set((ax + bx) / 2, y, (az + bz) / 2); m.receiveShadow = true; return m;
}
function pitchLines(r, y, full = true) {
  const g = new THREE.Group();
  const L = r.len / 2, W = r.wid / 2;
  const P = (u, v) => { const [x, z] = rot(u, v, r.ang); return [r.x + x, r.z + z]; };
  const seg = (u0, v0, u1, v1) => { const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1); g.add(lineMesh(ax, az, bx, bz, y)); };
  seg(-L, -W, L, -W); seg(-L, W, L, W); seg(-L, -W, -L, W); seg(L, -W, L, W); seg(0, -W, 0, W);
  const circ = new THREE.Mesh(new THREE.RingGeometry(Math.min(W * 0.4, 9) - 0.12, Math.min(W * 0.4, 9), 48), MAT.white); circ.rotation.x = -Math.PI / 2; circ.position.set(r.x, y, r.z); g.add(circ);
  if (full) for (const s of [-1, 1]) { const bl = Math.min(L * 0.3, 16.5), bw = Math.min(W * 0.75, 20); seg(s * L, -bw, s * (L - bl), -bw); seg(s * L, bw, s * (L - bl), bw); seg(s * (L - bl), -bw, s * (L - bl), bw); const [px, pz] = P(s * (L - bl * 0.66), 0); const spot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), MAT.white); spot.rotation.x = -Math.PI / 2; spot.position.set(px, y, pz); g.add(spot); }
  scene.add(g); return g;
}
// Goal facing -u (goal line at u = gu, opening toward the pitch centre). width w, height h, depth dp.
function makeGoal(r, y, side, w, h, dp, postR = 0.06) {
  const g = new THREE.Group();
  const gu = side * r.len / 2;
  const P = (u, v, yy = 0) => { const [x, z] = rot(u, v, r.ang); return new THREE.Vector3(r.x + x, y + yy, r.z + z); };
  const postMat = MAT.white;
  const posts = [];
  for (const sv of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, h, 10), postMat); const pos = P(gu, sv * w / 2, h / 2); p.position.copy(pos); p.castShadow = true; g.add(p); posts.push({ x: pos.x, z: pos.z }); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, w + postR * 2, 10), postMat); bar.position.copy(P(gu, 0, h)); bar.rotation.z = Math.PI / 2; bar.rotation.y = -r.ang; g.add(bar);
  // net frame (back + sides) as wireframe boxes
  const net = new THREE.Mesh(new THREE.BoxGeometry(dp, h, w, 3, 4, 8), MAT.net); const c = P(gu + side * dp / 2, 0, h / 2); net.position.copy(c); net.rotation.y = -r.ang; g.add(net);
  for (const sv of [-1, 1]) { const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h * 0.6, 6), postMat); bp.position.copy(P(gu + side * dp, sv * w / 2, h * 0.3)); g.add(bp); }
  scene.add(g);
  // ball-only walls: back and sides of the net (low restitution)
  const a = P(gu + side * dp, -w / 2), b = P(gu + side * dp, w / 2), c1 = P(gu, -w / 2), c2 = P(gu, w / 2);
  const walls = [[a.x, a.z, b.x, b.z], [c1.x, c1.z, a.x, a.z], [c2.x, c2.z, b.x, b.z]];
  const ln = P(gu, -w / 2), ln2 = P(gu, w / 2);
  return { side, w, h, dp, posts, barY: y + h, walls, line: [ln.x, ln.z, ln2.x, ln2.z], mouth: P(gu, 0), inward: (() => { const [dx, dz] = rot(-side, 0, r.ang); return [dx, dz]; })(), mesh: g };
}
function stand(r, y, sideV, rows = 7) {
  const g = new THREE.Group();
  const L = r.len + 10, depth = rows * 1.1;
  const base = r.wid / 2 + 4;
  for (let i = 0; i < rows; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(L, 0.55 + i * 0.5, 1.1), i % 2 ? MAT.concrete : MAT.seats);
    const uv = step.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * L / 4, uv.getY(k));
    const [x, z] = rot(0, sideV * (base + i * 1.1 + 0.55), r.ang);
    step.position.set(r.x + x, y + (0.55 + i * 0.5) / 2, r.z + z); step.rotation.y = -r.ang; step.castShadow = step.receiveShadow = true; g.add(step);
  }
  const wallH = rows * 0.5 + 1.2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(L, wallH, 0.4), MAT.navy); { const [x, z] = rot(0, sideV * (base + depth + 0.2), r.ang); back.position.set(r.x + x, y + wallH / 2, r.z + z); back.rotation.y = -r.ang; back.castShadow = true; g.add(back); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.3, depth + 3), MAT.metal); { const [x, z] = rot(0, sideV * (base + depth / 2 + 0.5), r.ang); roof.position.set(r.x + x, y + wallH + 1.8, r.z + z); roof.rotation.y = -r.ang; roof.rotation.x = sideV * 0.08; roof.castShadow = true; g.add(roof); }
  for (let i = 0; i <= 4; i++) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, wallH + 2, 8), MAT.navy); const [x, z] = rot(-L / 2 + i * L / 4, sideV * (base + depth + 1.2), r.ang); col.position.set(r.x + x, y + (wallH + 2) / 2, r.z + z); g.add(col); }
  // crest banner on the back wall
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), MAT.crest); { const [x, z] = rot(0, sideV * (base + depth - 0.05), r.ang); banner.position.set(r.x + x, y + wallH * 0.55, r.z + z); banner.rotation.y = -r.ang + (sideV > 0 ? Math.PI : 0); g.add(banner); }
  scene.add(g);
  // collision: the front of the stand is a wall
  const [ax, az] = rot(-L / 2, sideV * base, r.ang), [bx, bz] = rot(L / 2, sideV * base, r.ang);
  addSegment(r.x + ax, r.z + az, r.x + bx, r.z + bz, 4, 'stand');
}
function floodlight(x, z, y, h = 18) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 10), MAT.fenceGrey); mast.position.set(x, y + h / 2, z); mast.castShadow = true; scene.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.4), MAT.botDark); head.position.set(x, y + h + 0.5, z); scene.add(head);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 0.1), MAT.lampGlow); glow.position.set(x, y + h + 0.5, z); scene.add(glow); glow.userData.head = head;
  addCircle(x, z, 0.5, h);
  return { head, glow };
}
function boards(r, y, text = 'BOSCO FC') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#14275e'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#f2c233'; g.font = 'bold 84px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(text).width; if (tw > 440) g.font = `bold ${Math.floor(84 * 440 / tw)}px Oswald, Impact, sans-serif`;
  for (let i = 0; i < 2; i++) g.fillText(text, 256 + i * 512, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }); const back = new THREE.MeshStandardMaterial({ color: 0x14275e, roughness: 0.8 });
  const L = r.len + 6, W = r.wid + 6;
  for (const [u0, v0, u1, v1] of [[-L / 2, -W / 2, L / 2, -W / 2], [-L / 2, W / 2, L / 2, W / 2], [-L / 2, -W / 2, -L / 2, W / 2], [L / 2, -W / 2, L / 2, W / 2]]) {
    const [ax, az] = rot(u0, v0, r.ang), [bx, bz] = rot(u1, v1, r.ang); const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), mat); m.material.map.repeat.set(len / 8, 1);
    m.position.set(r.x + (ax + bx) / 2, y + 0.45, r.z + (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax);
    // face the text toward the pitch (plane normal is +z after rotation)
    const nx = Math.sin(m.rotation.y), nz = Math.cos(m.rotation.y); if ((r.x - m.position.x) * nx + (r.z - m.position.z) * nz < 0) m.rotation.y += Math.PI;
    scene.add(m);
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), back); bk.position.copy(m.position); bk.rotation.y = m.rotation.y + Math.PI; scene.add(bk);
    addSegment(r.x + ax, r.z + az, r.x + bx, r.z + bz, 0.9, 'board');
  }
}
function cageFence(r, y, h = 3.6, gapU = 0) {
  // green weld-mesh cage around the rect; the two short ends have goal openings handled by goals' walls
  const g = new THREE.Group();
  const L = r.len / 2 + 1, W = r.wid / 2 + 1;
  const wire = new THREE.MeshStandardMaterial({ color: 0x2f7a3e, roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const edges = [[-L, -W, L, -W], [-L, W, L, W], [-L, -W, -L, W], [L, -W, L, W]];
  for (const [u0, v0, u1, v1] of edges) {
    const [ax, az] = rot(u0, v0, r.ang), [bx, bz] = rot(u1, v1, r.ang); const len = Math.hypot(bx - ax, bz - az);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, h, Math.ceil(len), 6), wire); panel.position.set(r.x + (ax + bx) / 2, y + h / 2, r.z + (az + bz) / 2); panel.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(panel);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(len, h, Math.ceil(len * 2), Math.ceil(h * 2)), new THREE.MeshBasicMaterial({ color: 0x1f5c2c, wireframe: true, transparent: true, opacity: 0.5 })); grid.position.copy(panel.position); grid.rotation.copy(panel.rotation); g.add(grid);
    for (let t = 0; t <= len; t += 3) { const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), MAT.fenceGreen); post.position.set(r.x + x, y + h / 2, r.z + z); g.add(post); }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), MAT.fenceGreen); top.position.set(r.x + (ax + bx) / 2, y + h, r.z + (az + bz) / 2); top.rotation.z = Math.PI / 2; top.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(top);
    addSegment(r.x + ax, r.z + az, r.x + bx, r.z + bz, h, 'cage');
  }
  scene.add(g);
}

// ---------------------------------------------------------------------------
// Bots (footballers)
// ---------------------------------------------------------------------------
function makeFootballer(kit) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 12), kit); body.position.y = 0.95; g.add(body);
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.3, 12), MAT.white); shorts.position.y = 0.6; g.add(shorts);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), MAT.skin); head.position.y = 1.5; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), MAT.botDark); hair.position.y = 1.53; g.add(hair);
  const legs = [];
  for (const sx of [-0.12, 0.12]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), MAT.skin); leg.position.set(sx, 0.3, 0); g.add(leg); legs.push(leg); const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), kit); sock.position.set(sx, 0.2, 0); leg.add(sock); sock.position.set(0, -0.2, 0); const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), MAT.eye); boot.position.set(0, -0.37, 0.04); leg.add(boot); }
  for (const sx of [-0.33, 0.33]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), MAT.skin); arm.position.set(sx, 0.95, 0); g.add(arm); }
  g.userData.legs = legs;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Arena creation
// ---------------------------------------------------------------------------
function makeArena(opts) {
  const a = { id: opts.id, name: opts.name, rect: opts.rect, y: opts.y, goals: [], bots: [], ball: null, match: null, mode: opts.mode, walls: [], homeSide: -1, targets: [] };
  a.ball = new Ball(opts.rect.x, opts.y + 1.5, opts.rect.z);
  a.ball.home.set(opts.rect.x, opts.y + 1, opts.rect.z);
  arenas.push(a);
  return a;
}
export function buildArenas() {
  const W = Object.fromEntries(CFG.worlds.map((w) => [w.id, w]));
  // --- Bosco FC Stadium (the real pitch by St Thomas the Apostle College) ---
  {
    const w = W.stadium; const pitch = findPitch(w.x, w.z, 80, (p) => p.sport === 'soccer' || p.sport === 'football');
    let r = pitch ? pitchRect(pitch.p) : { x: w.x, z: w.z, ang: 0, len: 60, wid: 36 };
    r.len = Math.max(r.len, 58); r.wid = Math.max(r.wid, 34);
    const y = addFlatZone(r.x, r.z, Math.max(r.len, r.wid) / 2 + 24, 30) + 0.1;
    const a = makeArena({ id: 'stadium', name: 'Bosco FC Stadium', rect: r, y, mode: 'match' });
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(r.len + 8, r.wid + 8), MAT.astro); turf.geometry.attributes.uv.array.forEach((v, i, arr) => (arr[i] = v * (i % 2 ? (r.wid + 8) / 4 : (r.len + 8) / 4))); turf.rotation.x = -Math.PI / 2; turf.rotation.z = -r.ang; turf.position.set(r.x, y - 0.02, r.z); turf.receiveShadow = true; scene.add(turf);
    pitchLines(r, y + 0.01, true);
    for (const s of [-1, 1]) a.goals.push(makeGoal(r, y, s, 6.4, 2.2, 1.8));
    stand(r, y, -1, 8); stand(r, y, 1, 8);
    boards(r, y, 'BOSCO FC   ·   TEAM BOSCO   ·   SHUT UP FC');
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [x, z] = rot(su * (r.len / 2 + 8), sv * (r.wid / 2 + 14), r.ang); floodlight(r.x + x, r.z + z, y, 20); }
    // dugouts + centre crest
    const crest = new THREE.Mesh(new THREE.CircleGeometry(4, 32), MAT.crest); crest.rotation.x = -Math.PI / 2; crest.rotation.z = -r.ang; crest.position.set(r.x, y + 0.015, r.z); scene.add(crest);
    a.teamHome = 'BOSCO FC'; a.teamAway = 'NUNHEAD ROVERS';
  }
  // --- The Cage at Edmund Waller ---
  {
    const w = W.cage; const pitch = findPitch(w.x, w.z, 90, (p) => p.k === 'pitch' && (p.surface === 'asphalt' || p.sport === 'multi' || p.sport === 'basketball'));
    let r = pitch ? pitchRect(pitch.p) : { x: w.x, z: w.z, ang: 0, len: 30, wid: 16 };
    r.len = Math.max(r.len, 28); r.wid = Math.max(r.wid, 15);
    const y = addFlatZone(r.x, r.z, Math.max(r.len, r.wid) / 2 + 8, 14) + 0.1;
    const a = makeArena({ id: 'cage', name: 'The Cage', rect: r, y, mode: 'cage' });
    const courtMat = MAT.tarmac.clone(); courtMat.map = MAT.tarmac.map.clone(); courtMat.map.repeat.set((r.len + 2) / 6, (r.wid + 2) / 6); courtMat.map.needsUpdate = true; courtMat.color.setHex(0xb9bcc2);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(r.len + 2, r.wid + 2), courtMat); court.rotation.x = -Math.PI / 2; court.rotation.z = -r.ang; court.position.set(r.x, y - 0.02, r.z); court.receiveShadow = true; scene.add(court);
    pitchLines(r, y + 0.01, false);
    for (const s of [-1, 1]) a.goals.push(makeGoal(r, y, s, 3.6, 1.8, 1.0, 0.05));
    cageFence(r, y, 3.6);
    for (const [su, sv] of [[-1, -1], [1, 1]]) { const [x, z] = rot(su * (r.len / 2 + 2.5), sv * (r.wid / 2 + 2.5), r.ang); floodlight(r.x + x, r.z + z, y, 9); }
    a.teamHome = 'CAM'; a.teamAway = 'YEAR 6';
  }
  // --- Dr Harold Moody Park ---
  {
    const w = W.park; const r = { x: w.x + 6, z: w.z - 10, ang: 0.3, len: 36, wid: 22 };
    const y = addFlatZone(r.x, r.z, 26, 16) + 0.1;
    const a = makeArena({ id: 'park', name: 'Dr Harold Moody Park', rect: r, y, mode: 'free' });
    for (const s of [-1, 1]) a.goals.push(makeGoal(r, y, s, 4.4, 1.9, 1.2, 0.05));
    // cones as touchline markers
    for (let i = -2; i <= 2; i++) for (const sv of [-1, 1]) { const [x, z] = rot(i * r.len / 4, sv * r.wid / 2, r.ang); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xff7a00 })); cone.position.set(r.x + x, y + 0.2, r.z + z); scene.add(cone); }
    a.teamHome = 'CAM'; a.teamAway = 'PARK KEEPER';
  }
  // --- Nunhead Green: street football + target boards ---
  {
    const w = W.nunhead; const r = { x: w.x + 4, z: w.z + 8, ang: -0.6, len: 26, wid: 16 };
    const y = addFlatZone(r.x, r.z, 20, 14) + 0.1;
    const a = makeArena({ id: 'nunhead', name: 'Nunhead Green', rect: r, y, mode: 'targets' });
    a.goals.push(makeGoal(r, y, 1, 3.6, 1.8, 1.0, 0.05));
    // three target boards to knock down at the other end
    for (let i = -1; i <= 1; i++) {
      const [x, z] = rot(-r.len / 2 + 1, i * 4, r.ang);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: [0xff3b5c, 0xffd83d, 0x2fb0ff][i + 1], roughness: 0.6 }));
      board.position.set(r.x + x, y + 0.6, r.z + z); board.rotation.y = -r.ang; board.castShadow = true; scene.add(board);
      a.targets.push({ mesh: board, x: r.x + x, z: r.z + z, up: true, t: 0 });
    }
    a.teamHome = 'CAM'; a.teamAway = 'TARGETS';
  }
}

// ---------------------------------------------------------------------------
// Match control
// ---------------------------------------------------------------------------
const HUD = {};
function hud() { if (!HUD.el) { HUD.el = $('matchHud'); HUD.home = $('mhHome'); HUD.away = $('mhAway'); HUD.time = $('mhTime'); HUD.names = $('mhNames'); } return HUD; }
// where Cam lands when he picks a world: on the touchline (or just inside the cage), facing the ball
export function arenaSpawn(id) {
  const a = arenas.find((q) => q.id === id); if (!a) return null;
  const r = a.rect; const inside = a.mode === 'cage';
  const [ox, oz] = rot(inside ? -r.len / 2 + 7 : 0, inside ? 0 : r.wid / 2 - 2.5, r.ang);
  const x = r.x + ox, z = r.z + oz; const dx = r.x - x, dz = r.z - z;
  return { x, z, yaw: Math.atan2(-dx, -dz) };
}
function inRect(a, x, z, pad = 2) { const [u, v] = rot(x - a.rect.x, z - a.rect.z, -a.rect.ang); return Math.abs(u) < a.rect.len / 2 + pad && Math.abs(v) < a.rect.wid / 2 + pad; }

function spawnBots(a) {
  for (const b of a.bots) scene.remove(b.mesh); a.bots.length = 0;
  const r = a.rect;
  const add = (kit, u, v, role, team) => { const mesh = makeFootballer(kit); const [x, z] = rot(u, v, r.ang); const b = { mesh, x: r.x + x, z: r.z + z, role, team, vx: 0, vz: 0, cool: 0, home: [u, v], phase: Math.random() * 6 }; a.bots.push(b); return b; };
  if (a.mode === 'match') {
    add(MAT.kitKeeper, -r.len / 2 + 1.2, 0, 'keeper', 'home');          // Cam's keeper (home attacks +u side)
    add(MAT.kitHome, -r.len * 0.2, 6, 'mate', 'home');
    add(MAT.kitKeeper, r.len / 2 - 1.2, 0, 'keeper', 'away');
    add(MAT.kitAway, r.len * 0.15, -5, 'out', 'away'); add(MAT.kitAway, r.len * 0.3, 6, 'out', 'away');
  } else if (a.mode === 'cage') {
    add(MAT.kitAway, r.len * 0.2, -3, 'out', 'away'); add(MAT.kitAway, r.len * 0.3, 3, 'out', 'away');
  } else if (a.mode === 'free') {
    add(MAT.kitKeeper, r.len / 2 - 1.2, 0, 'keeper', 'away');
  }
}

export function startMatch(a) {
  if (a.match && a.match.active) return;
  a.match = { active: true, time: a.mode === 'match' ? 180 : a.mode === 'cage' ? 90 : 0, home: 0, away: 0, kickoffT: 0, celebrate: 0, half: 1 };
  spawnBots(a);
  a.ball.reset(a.rect.x, a.y + 0.5, a.rect.z);
  const h = hud(); h.el.hidden = false; h.names.textContent = `${a.teamHome}  v  ${a.teamAway}`;
  synth('whistle'); say('woohoo', true);
  showToast(a.mode === 'match' ? 'KICK OFF!' : a.mode === 'cage' ? 'CAGE MATCH!' : a.mode === 'targets' ? 'KNOCK DOWN THE TARGETS' : 'KICKABOUT', 1600);
  feed(`${a.name}: ${a.mode === 'match' ? '3 minutes, first to the Rovers goal' : a.mode === 'cage' ? '90 seconds in the cage' : 'free play'}`);
  emit('match', a.id);
}
function endMatch(a) {
  if (!a.match || !a.match.active) return;
  a.match.active = false;
  const h = hud(); setTimeout(() => { if (!activeArena || !activeArena.match || !activeArena.match.active) h.el.hidden = true; }, 3500);
  synth('whistle'); setTimeout(() => synth('whistle'), 250); setTimeout(() => synth('whistle'), 500);
  const won = a.match.home > a.match.away;
  showToast(a.match.home === a.match.away ? `FULL TIME  ${a.match.home}-${a.match.away}` : won ? `BOSCO WIN ${a.match.home}-${a.match.away}!` : `LOST ${a.match.home}-${a.match.away}`, 3200);
  say(won ? 'woohoo' : 'ooh', true);
  if (won) { addScore(1000); emit('win', a.id); }
  for (const b of a.bots) scene.remove(b.mesh); a.bots.length = 0;
  emit('fulltime', a.id);
}
function goalScored(a, forHome) {
  const m = a.match;
  if (forHome) { m.home++; player.goals++; addScore(500); say('ohyeah', true); showToast('GOAL!!!', 1600); synth('crowd'); feed(`GOAL! Cam scores for ${a.teamHome}`); emit('goal', a.id); }
  else { m.away++; say('ohno', true); showToast(`${a.teamAway} SCORE`, 1400); feed(`${a.teamAway} score`); }
  m.celebrate = 2.2;
}

// ---------------------------------------------------------------------------
// Per-frame
// ---------------------------------------------------------------------------
const PR = 0.42;
let touchCool = 0, lastHeader = 0;
export function updateFootball(dt, t, input) {
  // active arena = the one whose rect (padded) contains Cam, else nearest ball within 70 m for free kicks
  let near = null, nd = 1e9;
  for (const a of arenas) { const d = Math.hypot(a.ball.pos.x - player.pos.x, a.ball.pos.z - player.pos.z); if (d < nd) { nd = d; near = a; } }
  let inside = null; for (const a of arenas) if (inRect(a, player.pos.x, player.pos.z, 3)) inside = a;
  const prev = activeArena;
  activeArena = inside || (nd < 70 ? near : null);
  if (inside && (!inside.match || !inside.match.active) && player.grounded) startMatch(inside);
  if (prev && prev !== activeArena && prev.match && prev.match.active && prev.mode !== 'match') { /* leaving a free arena keeps it running */ }

  for (const a of arenas) {
    const ball = a.ball;
    const far = Math.hypot(ball.pos.x - player.pos.x, ball.pos.z - player.pos.z) > 140;
    if (far && ball.sleep > 2) continue;   // asleep far away: skip physics
    // --- player ↔ ball ---
    if (a === activeArena) playerBall(a, dt, t, input);
    // --- physics ---
    ball.step(dt, groundAt, (b) => worldBounce(a, b));
    // --- goals / nets / targets ---
    for (const g of a.goals) ballGoal(a, g, ball);
    for (const tg of a.targets) { if (tg.up && Math.hypot(ball.pos.x - tg.x, ball.pos.z - tg.z) < BALL_R + 0.8 && ball.pos.y < a.y + 1.4 && ball.vel.length() > 3) { tg.up = false; tg.t = 0; addScore(150); say('ohyeah', true); synth('post'); feed('Target down!'); ball.vel.multiplyScalar(0.3); if (a.targets.every((q) => !q.up)) { showToast('ALL TARGETS DOWN!', 2000); say('woohoo', true); addScore(500); emit('targets'); setTimeout(() => a.targets.forEach((q) => { q.up = true; q.mesh.rotation.x = 0; }), 4000); } } if (!tg.up) { tg.t += dt; tg.mesh.rotation.x = -Math.min(1.5, tg.t * 6); } }
    // --- lost ball: bring it back after a while ---
    if (!inRect(a, ball.pos.x, ball.pos.z, a.mode === 'match' ? 14 : 40) && ball.sleep > 4) { ball.reset(ball.home.x, ball.home.y + 1, ball.home.z); feed('Ball back on the pitch'); }
    // --- bots + match ---
    if (a.match && a.match.active) updateMatch(a, dt, t);
  }
  // HUD
  if (activeArena && activeArena.match && activeArena.match.active) {
    const h = hud(), m = activeArena.match;
    if (activeArena.mode === 'targets') { h.home.textContent = activeArena.targets.filter((q) => !q.up).length; h.away.textContent = activeArena.targets.length; h.time.textContent = 'DOWN'; return; }
    h.home.textContent = m.home; h.away.textContent = m.away;
    h.time.textContent = m.time > 0 ? `${Math.floor(m.time / 60)}:${String(Math.ceil(m.time % 60) % 60).padStart(2, '0')}` : 'FREE';
  }
}

function worldBounce(a, b) {
  const res = collideCircle(b.pos.x, b.pos.z, BALL_R, b.pos.y - BALL_R, 0.3, (nx, nz, kind) => b.bounceOff(nx, nz, kind === 'cage' ? 0.75 : kind === 'board' ? 0.6 : 0.5, kind === 'cage' ? 'fence' : 'bounce'));
  b.pos.x = res.x; b.pos.z = res.z;
  // goal nets + posts
  for (const g of a.goals) {
    for (const [ax, az, bx, bz] of g.walls) { const r = segPush(b.pos.x, b.pos.z, BALL_R, ax, az, bx, bz); if (r && b.pos.y < g.barY + 0.4) { b.pos.x += r[0] * r[2]; b.pos.z += r[1] * r[2]; b.bounceOff(r[0], r[1], 0.15, null); b.vel.multiplyScalar(0.7); } }
    for (const p of g.posts) { const dx = b.pos.x - p.x, dz = b.pos.z - p.z, d = Math.hypot(dx, dz), rr = BALL_R + 0.06; if (d < rr && d > 1e-6 && b.pos.y < g.barY + 0.1) { b.pos.x = p.x + dx / d * rr; b.pos.z = p.z + dz / d * rr; b.bounceOff(dx / d, dz / d, 0.8, 'post'); } }
    // crossbar: a horizontal cylinder along the goal line at barY
    { const [ax, az, bx, bz] = g.line; const r = segPush(b.pos.x, b.pos.z, BALL_R + 0.06, ax, az, bx, bz); if (r && Math.abs(b.pos.y - g.barY) < BALL_R + 0.06) { const dy = b.pos.y - g.barY; const d = Math.hypot(r[2] > 0 ? (BALL_R + 0.06 - r[2]) : 0, dy); if (b.vel.y > 0 && dy < 0) { b.vel.y = -b.vel.y * 0.6; synth('post'); } else if (dy > 0 && b.vel.y < 0) { b.vel.y = -b.vel.y * 0.6; synth('post'); } } }
  }
}
import { circleSegmentPush as segPush } from './ball.js';

function ballGoal(a, g, ball) {
  const m = a.match; if (!m || !m.active || m.celebrate > 0) return;
  // ball fully past the goal line, between the posts, under the bar, moving into the goal
  const [ax, az, bx, bz] = g.line; const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const inx = g.inward[0], inz = g.inward[1];
  const depthIn = -((ball.pos.x - mx) * inx + (ball.pos.z - mz) * inz);   // >0 means behind the line
  const along = Math.abs((ball.pos.x - mx) * -inz + (ball.pos.z - mz) * inx);
  if (depthIn > BALL_R && depthIn < g.dp + 0.5 && along < g.w / 2 && ball.pos.y < g.barY) {
    // which team attacks this goal? home attacks side +1 (the far goal), away attacks side -1
    const forHome = g.side === 1;
    if (a.mode === 'targets') return;
    goalScored(a, forHome);
  }
}

function playerBall(a, dt, t, input) {
  const b = a.ball; const p = player.pos;
  const dx = b.pos.x - p.x, dz = b.pos.z - p.z, dh = Math.hypot(dx, dz);
  const feetY = p.y, ballH = b.pos.y - BALL_R;
  touchCool -= dt;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  // charge
  if (input.kickHeld) player.kickCharge = Math.min(1, player.kickCharge + dt * 1.4);
  const released = input.kickReleased;
  const reach = PR + BALL_R + 0.35;
  if (released) {
    const charge = player.kickCharge; player.kickCharge = 0; player.kicking = 0.35;
    if (dh < reach + 0.9 && ballH - feetY < 1.4) {
      // direction: facing, blended toward the camera's forward so you can aim with the camera
      let dirx = fx * 0.55 + input.camFx * 0.45, dirz = fz * 0.55 + input.camFz * 0.45; const l = Math.hypot(dirx, dirz) || 1; dirx /= l; dirz /= l;
      const speed = 7 + charge * 19;
      const loft = ballH - feetY > 0.5 ? 0.35 : 0.08 + charge * 0.3 + (input.jumpHeld ? 0.25 : 0);
      const curl = -input.strafe * (0.4 + charge * 0.6);
      b.kick(_d.set(dirx, 0, dirz), speed, loft, curl, 0.15 + charge * 0.3);
      b.lastKicker = 'cam'; b.lastTouch = t; touchCool = 0.25;
      shutUp(true); emit('kick');
      return;
    }
  }
  if (dh < reach && ballH - feetY < 0.9 && touchCool <= 0) {
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (hs > 0.8 && b.vel.length() < hs + 2) {
      // dribble: push the ball a little ahead of the run, with natural roll
      const vx = player.vel.x / hs, vz = player.vel.z / hs;
      b.vel.set(vx * (hs * 1.08 + 0.9), 0.35, vz * (hs * 1.08 + 0.9)); b.pos.x = p.x + vx * (reach - 0.05); b.pos.z = p.z + vz * (reach - 0.05);
      b.lastKicker = 'cam'; b.lastTouch = t; touchCool = 0.18; synth('tap', 0.4);
    } else if (b.vel.length() > 2.5 && (b.vel.x * dx + b.vel.z * dz) < 0) {
      // ball hits Cam: cushion it down to his feet
      b.vel.multiplyScalar(0.25); b.vel.y = 0.5; touchCool = 0.2; synth('tap', 0.5);
    } else if (dh < PR + BALL_R) {
      // standing on the ball: nudge it out
      b.pos.x = p.x + dx / (dh || 1) * (PR + BALL_R + 0.02); b.pos.z = p.z + dz / (dh || 1) * (PR + BALL_R + 0.02);
    }
  }
  // header
  if (input.jumpPressed && !player.grounded && dh < 1.1 && ballH > 1.0 && ballH < 2.2 && t - lastHeader > 0.5) {
    lastHeader = t; b.kick(_d.set(fx, 0, fz), 9, 0.2, 0, 0.1); b.vel.y = 2.5; say('ooh', true); emit('kick');
  }
}

function updateMatch(a, dt, t) {
  const m = a.match, r = a.rect, b = a.ball;
  if (m.celebrate > 0) { m.celebrate -= dt; if (m.celebrate <= 0) { b.reset(r.x, a.y + 0.5, r.z); } }
  if (m.time > 0) { m.time -= dt; if (m.time <= 0) { m.time = 0; endMatch(a); return; } }
  // bots
  for (const bot of a.bots) {
    const [bu, bv] = rot(b.pos.x - r.x, b.pos.z - r.z, -r.ang);          // ball in pitch coords
    const [pu, pv] = rot(bot.x - r.x, bot.z - r.z, -r.ang);
    let tu = pu, tv = pv, speed = 4.6;
    if (bot.role === 'keeper') {
      const gu = bot.home[0]; tu = gu; tv = Math.max(-a.goals[0].w / 2 - 0.5, Math.min(a.goals[0].w / 2 + 0.5, bv));
      if (Math.abs(bu - gu) < 10 && Math.abs(bv) < 6) tu = gu + (gu < 0 ? 1 : -1) * Math.min(3, Math.abs(bu - gu) * 0.4);
      speed = 6;
    } else {
      // chase when the ball is in their half or close; else drift home
      const mine = bot.team === 'away' ? (bu > -r.len * 0.1) : (bu < r.len * 0.1);
      const close = Math.hypot(bu - pu, bv - pv) < 18;
      if (mine || close) { tu = bu; tv = bv; speed = bot.team === 'away' ? 5.2 : 4.8; } else { tu = bot.home[0] + Math.sin(t * 0.3 + bot.phase) * 4; tv = bot.home[1] + Math.cos(t * 0.4 + bot.phase) * 3; speed = 2.5; }
    }
    const ddu = tu - pu, ddv = tv - pv, dd = Math.hypot(ddu, ddv);
    const mv = Math.min(speed * dt, dd); const nu = pu + (dd > 0.01 ? ddu / dd * mv : 0), nv = pv + (dd > 0.01 ? ddv / dd * mv : 0);
    const [nx, nz] = rot(nu, nv, r.ang); bot.x = r.x + nx; bot.z = r.z + nz;
    const y = groundAt(bot.x, bot.z).y;
    bot.mesh.position.set(bot.x, y, bot.z);
    if (dd > 0.3) { const [wx, wz] = rot(ddu, ddv, r.ang); bot.mesh.rotation.y = Math.atan2(wx, wz); bot.mesh.userData.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 12 + i * Math.PI) * 0.6)); } else bot.mesh.userData.legs.forEach((l) => (l.rotation.x = 0));
    // bot touches the ball
    bot.cool -= dt;
    const bd = Math.hypot(b.pos.x - bot.x, b.pos.z - bot.z);
    if (bd < 0.45 + BALL_R + 0.1 && b.pos.y - BALL_R < 1.2 && bot.cool <= 0) {
      bot.cool = 0.6;
      if (bot.role === 'keeper') { // catch and throw out
        const outU = bot.home[0] < 0 ? 1 : -1; const [kx, kz] = rot(outU, (Math.random() - 0.5) * 0.8, r.ang); const l = Math.hypot(kx, kz) || 1;
        b.kick(_d.set(kx / l, 0, kz / l), 11, 0.3, 0, 0); b.lastKicker = 'bot'; feed('Keeper saves it!'); synth('tap');
      } else {
        // shoot toward the goal they attack (away → side -1 goal; home → side +1 goal) with a little error
        const attackU = bot.team === 'away' ? -r.len / 2 : r.len / 2;
        const [kx, kz] = rot(attackU - pu, (Math.random() - 0.5) * 3 - pv, r.ang); const l = Math.hypot(kx, kz) || 1;
        const shoot = Math.abs(attackU - pu) < r.len * 0.45;
        b.kick(_d.set(kx / l, 0, kz / l), shoot ? 13 + Math.random() * 5 : 7, shoot ? 0.12 : 0.05, (Math.random() - 0.5) * 0.4, 0.15); b.lastKicker = 'bot';
      }
    }
    // keep bots off Cam
    const pd = Math.hypot(player.pos.x - bot.x, player.pos.z - bot.z);
    if (pd < 0.8 && pd > 1e-3) { const ax = (player.pos.x - bot.x) / pd, az = (player.pos.z - bot.z) / pd; player.pos.x = bot.x + ax * 0.8; player.pos.z = bot.z + az * 0.8; }
  }
}

export function kickBallToMe() {
  const a = activeArena || arenas[0]; const b = a.ball;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  b.reset(player.pos.x + fx * 1.5, player.pos.y + 0.8, player.pos.z + fz * 1.5);
  say('shutup', true); feed('Ball!');
}
export function nearestBallDistance() { let d = 1e9; for (const a of arenas) d = Math.min(d, Math.hypot(a.ball.pos.x - player.pos.x, a.ball.pos.z - player.pos.z)); return d; }
