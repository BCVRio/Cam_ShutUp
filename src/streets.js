// Streets: carriageways, raised pavements with real kerb stones, road markings (centre dashes, double yellows,
// give-way lines, zebra crossings with belisha beacons), speed humps, manhole covers and gully drains.
// Built from the OSM road graph in selondon.json. Pavements and kerbs are cut where another road's carriageway
// runs through a junction, so side streets open onto the main road instead of a raised slab.
import { THREE, MAT, scene, Q, seededRandom, setupMaterial } from './core.js';
import { world, terrainHeight, surfaceAt, SURF, inStadium, ribbon, disc, addMerged, circles, gridAdd, circleGrid } from './map.js';

export const ROAD_LIFT = 0.06, PAVE_LIFT = 0.14;   // pavements stand 8 cm above the carriageway
const KERB_W = 0.26;
const rnd = seededRandom(7);

// --- small geometry helpers -------------------------------------------------
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
// polyline offset to the left (positive) or right of travel; mitre length is capped so sharp bends don't explode
function offsetLine(p, off) {
  const T = tangents(p); const out = [];
  for (let i = 0; i < p.length; i++) {
    let nx = -T[i][1], nz = T[i][0];
    if (i > 0 && i < p.length - 1) { const ax = p[i][0] - p[i - 1][0], az = p[i][1] - p[i - 1][1], l = Math.hypot(ax, az) || 1; const cos = (ax / l) * T[i][0] + (az / l) * T[i][1]; const k = Math.min(1.6, 1 / Math.max(0.3, Math.abs(cos))); nx *= k; nz *= k; }
    out.push([p[i][0] + nx * off, p[i][1] + nz * off]);
  }
  return out;
}
// split a polyline into runs where keep(x, z) holds, sampling every `step` metres. Only the original vertices and
// the run boundaries become vertices, so a straight road stays two points long.
function splitRuns(p, keep, step = 1.2) {
  const runs = []; let run = null;
  const close = () => { if (run && run.length >= 2) runs.push(run); run = null; };
  let prevKeep = keep(p[0][0], p[0][1]); if (prevKeep) run = [[p[0][0], p[0][1]]];
  for (let s = 0; s < p.length - 1; s++) {
    const [ax, az] = p[s], [bx, bz] = p[s + 1]; const len = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; const kp = keep(x, z);
      if (kp && !prevKeep) run = [[x, z]];
      else if (!kp && prevKeep) { if (run) { run.push([x, z]); close(); } }
      else if (kp && k === n) run.push([x, z]);
      prevKeep = kp;
    }
  }
  close(); return runs;
}
// vertical strip along a polyline between two heights (kerb face); `flip` turns the normal around
function skirt(p, lo, hi, flip = false) {
  const positions = [], normals = [], uvs = [], index = []; const T = tangents(p); let dist = 0;
  for (let i = 0; i < p.length; i++) {
    const [x, z] = p[i]; const y = terrainHeight(x, z); let nx = -T[i][1], nz = T[i][0]; if (flip) { nx = -nx; nz = -nz; }
    if (i > 0) dist += Math.hypot(x - p[i - 1][0], z - p[i - 1][1]);
    positions.push(x, y + lo, z, x, y + hi, z); normals.push(nx, 0, nz, nx, 0, nz); uvs.push(dist / 2, 0, dist / 2, 0.08);
    if (i > 0) { const b = i * 2; if (flip) index.push(b - 2, b, b - 1, b - 1, b, b + 1); else index.push(b - 2, b - 1, b, b - 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(index);
  return g;
}
function quadAt(cx, cz, dx, dz, len, wid, lift, uvRepeat = 1) {   // flat textured rectangle, long axis along (dx,dz)
  const nx = -dz, nz = dx; const pts = [[-len / 2, -wid / 2], [len / 2, -wid / 2], [len / 2, wid / 2], [-len / 2, wid / 2]];
  const positions = [], normals = [], uvs = [];
  for (const [u, v] of pts) { const x = cx + dx * u + nx * v, z = cz + dz * u + nz * v; positions.push(x, terrainHeight(x, z) + lift, z); normals.push(0, 1, 0); }
  uvs.push(0, 0, uvRepeat, 0, uvRepeat, 1, 0, 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex([0, 2, 1, 0, 3, 2]); return g;
}
// speed hump: a raised sine profile across the carriageway
function hump(cx, cz, dx, dz, len, wid, h) {
  const nx = -dz, nz = dx; const N = 9; const positions = [], normals = [], uvs = [], index = [];
  for (let i = 0; i <= N; i++) { const t = i / N; const u = (t - 0.5) * len; const y = Math.sin(t * Math.PI) * h; for (const s of [-1, 1]) { const x = cx + dx * u + nx * (wid / 2) * s, z = cz + dz * u + nz * (wid / 2) * s; positions.push(x, terrainHeight(x, z) + ROAD_LIFT + 0.012 + y, z); normals.push(0, 1, 0); uvs.push(u / 4, s < 0 ? 0 : wid / 4); } if (i > 0) { const b = i * 2; index.push(b - 2, b - 1, b, b - 1, b + 1, b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}
function along(p, dist) {   // point + direction at `dist` metres along a polyline
  let acc = 0;
  for (let s = 0; s < p.length - 1; s++) { const [ax, az] = p[s], [bx, bz] = p[s + 1]; const len = Math.hypot(bx - ax, bz - az); if (acc + len >= dist || s === p.length - 2) { const t = Math.max(0, Math.min(1, (dist - acc) / (len || 1))); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (len || 1), dz: (bz - az) / (len || 1) }; } acc += len; }
  return null;
}
function polyLength(p) { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; }

// --- canvas textures for ironwork ------------------------------------------
function ironTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#2d2d2f'; g.fillRect(0, 0, 128, 128);
  if (kind === 'manhole') {
    g.fillStyle = '#4a4a4d'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#2a2a2c'; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fill();
    g.strokeStyle = '#4e4e52'; g.lineWidth = 3; for (let r = 10; r < 54; r += 9) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.stroke(); }
    for (let a = 0; a < 12; a++) { g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a * 0.52) * 54, 64 + Math.sin(a * 0.52) * 54); g.stroke(); }
    g.fillStyle = '#5a5a5e'; g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill();
  } else {
    g.fillStyle = '#48484c'; g.fillRect(6, 6, 116, 116); g.fillStyle = '#141416'; for (let i = 0; i < 6; i++) g.fillRect(14, 14 + i * 18, 100, 9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// --- the build --------------------------------------------------------------
export function buildStreets(d) {
  const roads = [], paves = [], kerbs = [], faces = [], foot = [], white = [], yellow = [], humps = [], manholes = [], drains = [], zebra = [];
  const isRoad = (x, z) => surfaceAt(x, z) === SURF.road;
  const roadList = d.roads.filter((r) => r.p.length >= 2 && r.k !== 'steps' && !r.p.every(([x, z]) => inStadium(x, z, 4)));
  // geometric test: is (x, z) inside another road's carriageway? (the 2 m raster is too coarse for kerb lines)
  const CELL = 24; const segGrid = new Map(); const ck = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  roadList.forEach((r, ri) => { if (r.w <= 2) return; for (let s = 0; s < r.p.length - 1; s++) { const [ax, az] = r.p[s], [bx, bz] = r.p[s + 1]; const seg = { ax, az, bx, bz, hw: r.w / 2, ri }; for (let x = Math.min(ax, bx) - r.w; x <= Math.max(ax, bx) + r.w; x += CELL) for (let z = Math.min(az, bz) - r.w; z <= Math.max(az, bz) + r.w; z += CELL) { const k = ck(x, z); if (!segGrid.has(k)) segGrid.set(k, []); const l = segGrid.get(k); if (!l.includes(seg)) l.push(seg); } } });
  const inOtherRoad = (x, z, ri, pad = 0.25) => { const l = segGrid.get(ck(x, z)); if (!l) return false; for (const g of l) { if (g.ri === ri) continue; const dx = g.bx - g.ax, dz = g.bz - g.az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / l2)); if (Math.hypot(x - (g.ax + dx * t), z - (g.az + dz * t)) < g.hw + pad) return true; } return false; };
  // junction index: which road ends touch another road's vertex (shared OSM nodes)
  const key = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`; const nodes = new Map();
  roadList.forEach((r, ri) => r.p.forEach(([x, z], vi) => { const k = key(x, z); if (!nodes.has(k)) nodes.set(k, []); nodes.get(k).push([ri, vi]); }));
  const beacons = [];
  roadList.forEach((r, ri) => {
    const p = r.p; const w = r.w; const lift = ROAD_LIFT + (ri % 5) * 0.003;   // tiny stagger: overlapping junction ribbons don't flicker
    if (w <= 2) { foot.push(ribbon(p, 2.2, PAVE_LIFT - 0.02 + (ri % 5) * 0.003, 3)); return; }
    roads.push(ribbon(p, w, lift, 5));
    for (let i = 1; i < p.length - 1; i++) roads.push(disc(p[i][0], p[i][1], w / 2, lift + 0.001, 10));
    const len = polyLength(p);
    // pavements + kerbs on both sides, cut where another carriageway crosses
    for (const s of [-1, 1]) {
      const kerbLine = offsetLine(p, s * (w / 2 + 0.03)), paveLine = offsetLine(p, s * (w / 2 + 1.5)), faceLine = offsetLine(p, s * (w / 2 + 0.01));
      const keep = (x, z) => !inOtherRoad(x, z, ri, 0.5);
      // kerb stones and the face
      for (const run of splitRuns(kerbLine, keep)) kerbs.push(ribbon(run, KERB_W, PAVE_LIFT + 0.004, 1));
      for (const run of splitRuns(faceLine, keep)) faces.push(skirt(run, lift - 0.02, PAVE_LIFT + 0.004, s < 0));
      // kerb and slab band are cut with the same pad so no strip of ground shows between them at a junction
      for (const run of splitRuns(paveLine, (x, z) => !inOtherRoad(x, z, ri, 0.5))) paves.push(ribbon(run, 2.8, PAVE_LIFT, 2));
      // double yellow lines: all along the main roads, around the ends of residential streets
      if (w >= 6 && r.k !== 'service') {
        const yl = (off) => offsetLine(p, s * (w / 2 - off));
        for (const off of [0.22, 0.38]) {
          const line = yl(off); const runs = splitRuns(line, (x, z) => { const dA = Math.hypot(x - p[0][0], z - p[0][1]), dB = Math.hypot(x - p[p.length - 1][0], z - p[p.length - 1][1]); if (dA < 4.5 || dB < 4.5) return false; return w >= 7 ? true : dA < 16 || dB < 16; });
          for (const run of runs) yellow.push(ribbon(run, 0.08, lift + 0.012, 2));
        }
      }
    }
    // centre line dashes on the wider roads
    if (w >= 7) for (let s = 0; s < p.length - 1; s++) {
      const [ax, az] = p[s], [bx, bz] = p[s + 1]; const l = Math.hypot(bx - ax, bz - az); const n = Math.floor(l / 6);
      for (let k = 0; k < n; k++) { const t0 = (k * 6 + 1) / l, t1 = (k * 6 + 4) / l; white.push(ribbon([[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]], 0.15, lift + 0.012, 4)); }
    }
    // give-way dashes where this road ends on a wider or equal road
    for (const end of [0, p.length - 1]) {
      const [ex, ez] = p[end]; const others = (nodes.get(key(ex, ez)) || []).filter(([oi, vi]) => oi !== ri && roadList[oi].w >= w && roadList[oi].w > 2 && vi > 0 && vi < roadList[oi].p.length - 1);
      if (!others.length) continue;
      const wo = roadList[others[0][0]].w; const inward = end === 0 ? along(p, 0) : along(p, len);
      if (!inward) continue; const dirx = end === 0 ? inward.dx : -inward.dx, dirz = end === 0 ? inward.dz : -inward.dz;
      const dist = wo / 2 + 0.9; const cx = ex + dirx * dist, cz = ez + dirz * dist; const nx = -dirz, nz = dirx;
      const span = w - 0.6; const n = Math.max(2, Math.floor(span / 0.9));
      for (let k = 0; k < n; k++) { const u = -span / 2 + 0.3 + k * (span / n); white.push(quadAt(cx + nx * u, cz + nz * u, nx, nz, 0.55, 0.2, lift + 0.012)); }
    }
    // speed humps on residential streets, manholes and gullies on everything with a kerb
    if (w === 6 && r.k === 'residential' && len > 60) for (let t = 28; t < len - 20; t += 58) { const q = along(p, t); if (q && !isRoadJunction(q, p, nodes, key, ri)) humps.push(hump(q.x, q.z, q.dx, q.dz, 3.6, w - 0.6, 0.09)); }
    if (w >= 6) {
      for (let t = 17 + (ri % 9); t < len - 8; t += 41) { const q = along(p, t); if (!q) continue; manholes.push(quadAt(q.x - q.dz * 0.9, q.z + q.dx * 0.9, q.dx, q.dz, 0.64, 0.64, lift + 0.01)); }
      for (let t = 9 + (ri % 7), k = 0; t < len - 6; t += 23, k++) { const q = along(p, t); if (!q) continue; const s = k % 2 ? -1 : 1; const x = q.x - q.dz * (w / 2 - 0.3) * s, z = q.z + q.dx * (w / 2 - 0.3) * s; if (!isRoad(x, z)) continue; drains.push(quadAt(x, z, q.dx, q.dz, 0.48, 0.36, lift + 0.01)); }
    }
    // zebra crossings on the main roads: one per long straight, with belisha beacons on both pavements
    if (w >= 7 && r.k !== 'service') for (let s = 0; s < p.length - 1; s++) {
      const [ax, az] = p[s], [bx, bz] = p[s + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 75) continue;
      const dx = (bx - ax) / l, dz = (bz - az) / l; const cx = ax + dx * l * 0.5, cz = az + dz * l * 0.5; const nx = -dz, nz = dx;
      const n = Math.floor(w / 1.0); for (let k = 0; k < n; k++) { const u = -w / 2 + 0.5 + k * 1.0; zebra.push(quadAt(cx + nx * u, cz + nz * u, dx, dz, 2.6, 0.5, lift + 0.012)); }
      for (const side of [-1, 1]) beacons.push([cx + nx * (w / 2 + 0.6) * side, cz + nz * (w / 2 + 0.6) * side]);
    }
  });
  const mk = (o) => setupMaterial(new THREE.MeshStandardMaterial(o));
  MAT.kerb = MAT.kerb || mk({ color: 0xb8b5ad, roughness: 0.92, map: MAT.concrete.map, normalMap: MAT.concrete.normalMap || null });
  MAT.markWhite = MAT.markWhite || mk({ color: 0xece9dc, roughness: 0.85 });
  MAT.markYellow = MAT.markYellow || mk({ color: 0xe3bf3c, roughness: 0.85 });
  MAT.iron = MAT.iron || mk({ color: 0xffffff, roughness: 0.55, metalness: 0.35, map: ironTexture('manhole') });
  MAT.grate = MAT.grate || mk({ color: 0xffffff, roughness: 0.6, metalness: 0.35, map: ironTexture('drain') });
  addMerged(paves, MAT.pavement, false, true);
  addMerged(foot, MAT.pavement, false, true);
  addMerged(kerbs, MAT.kerb, false, true);
  const f = addMerged(faces, MAT.kerb, false, true); if (f) f.material = MAT.kerb;
  addMerged(roads, MAT.tarmac, false, true);
  addMerged(humps, MAT.tarmac, false, true);
  addMerged(white, MAT.markWhite, false, true); addMerged(zebra, MAT.markWhite, false, true);
  addMerged(yellow, MAT.markYellow, false, true);
  addMerged(manholes, MAT.iron, false, true); addMerged(drains, MAT.grate, false, true);
  // belisha beacons
  if (beacons.length) {
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8); pole.translate(0, 1.3, 0); const ball = new THREE.SphereGeometry(0.22, 12, 10); ball.translate(0, 2.75, 0);
    const poles = new THREE.InstancedMesh(pole, mk({ color: 0xeeeeee, roughness: 0.5 }), beacons.length), balls = new THREE.InstancedMesh(ball, new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0xff6a00, emissiveIntensity: 0.9, roughness: 0.4 }), beacons.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    beacons.forEach(([x, z], i) => { v.set(x, terrainHeight(x, z) + PAVE_LIFT, z); m.compose(v, q, sc); poles.setMatrixAt(i, m); balls.setMatrixAt(i, m); const c = { x, z, r: 0.15, h: 3 }; circles.push(c); gridAdd(circleGrid, x - 1, z - 1, x + 1, z + 1, c); });
    poles.castShadow = true; scene.add(poles, balls); world.beacons = balls;
  }
  // lamp posts along residential streets (positions consumed by buildLamps)
  for (const r of roadList) {
    if (r.w >= 6 && r.k !== 'service') for (let s = 0; s < r.p.length - 1; s++) {
      const [ax, az] = r.p[s], [bx, bz] = r.p[s + 1]; const len = Math.hypot(bx - ax, bz - az); const dx = (bx - ax) / (len || 1), dz = (bz - az) / (len || 1);
      for (let t = 12, k = 0; t < len; t += 34, k++) { const side = k % 2 ? -1 : 1; const x = ax + dx * t - dz * (r.w / 2 + 1.25) * side, z = az + dz * t + dx * (r.w / 2 + 1.25) * side; if (!inOtherRoad(x, z, -1, 0.6)) world.lamps.push([x, z]); }
    }
  }
}
function isRoadJunction(q, p, nodes, key, ri) {
  // any other road's vertex within 9 m of this point means we're at a junction
  for (let dx = -9; dx <= 9; dx += 4.5) for (let dz = -9; dz <= 9; dz += 4.5) { const l = nodes.get(key(q.x + dx, q.z + dz)); if (l && l.some(([oi]) => oi !== ri)) return true; }
  return false;
}
