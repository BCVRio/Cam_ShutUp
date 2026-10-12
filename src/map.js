// Map renderer: builds the SE London open world from public/maps/selondon.json (OpenStreetMap + elevation).
import { THREE, CFG, Q, scene, MAT, TEX, seededRandom, clamp, QU, setupMaterial } from './core.js';
import { circleSegmentPush } from './ball.js';

export const world = { data: null, grid: null, surface: null, flat: [], signs: [], lamps: [], bounds: { x0: -940, x1: 940, z0: -780, z1: 780 } };
const CELL = 24;
const segGrid = new Map(), polyGrid = new Map(), circleGrid = new Map();
const key = (cx, cz) => cx * 100000 + cz;
const cellOf = (v) => Math.floor(v / CELL);
function gridAdd(grid, minx, minz, maxx, maxz, item) {
  for (let cx = cellOf(minx); cx <= cellOf(maxx); cx++) for (let cz = cellOf(minz); cz <= cellOf(maxz); cz++) { const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(item); }
}
export const segments = [];   // {ax,az,bx,bz, h, kind}
export const circles = [];    // {x,z,r, h}
export const polys = [];      // building footprints {p, minx.., h, y}

// ---------------------------------------------------------------------------
// Elevation (bilinear) + flattened zones + surface raster
// ---------------------------------------------------------------------------
let E = null;
export function terrainRaw(x, z) {
  if (!E) return 0;
  const u = clamp((x - E.x0) / (E.x1 - E.x0), 0, 1) * (E.cols - 1), v = clamp((z - E.z0) / (E.z1 - E.z0), 0, 1) * (E.rows - 1);
  const i = Math.min(E.cols - 2, Math.floor(u)), j = Math.min(E.rows - 2, Math.floor(v)), fu = u - i, fv = v - j;
  // rows are south→north in the source (row 0 = lat0 = south); z0 is the north edge, so flip
  const row = (jj) => E.rows - 1 - jj;
  const h00 = E.elev[row(j) * E.cols + i], h10 = E.elev[row(j) * E.cols + i + 1], h01 = E.elev[row(j + 1) * E.cols + i], h11 = E.elev[row(j + 1) * E.cols + i + 1];
  return (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv - E.base;
}
export function terrainHeight(x, z) {
  let y = terrainRaw(x, z);
  for (const f of world.flat) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.blend) { const t = d < f.r ? 1 : 1 - (d - f.r) / f.blend; const s = t * t * (3 - 2 * t); y = y * (1 - s) + f.y * s; }
  }
  return y;
}
export function addFlatZone(x, z, r, blend = 18) { const y = terrainRaw(x, z); world.flat.push({ x, z, r, blend, y }); return y; }

export const SURF = { urban: 0, park: 1, road: 2, pavement: 3, astro: 4, court: 5, cemetery: 6, water: 7, school: 8, rail: 9 };
const SURF_NAME = ['grass', 'grass', 'hard', 'hard', 'astro', 'hard', 'grass', 'water', 'hard', 'hard'];
const RASTER = 2;   // metres per cell
let RW = 0, RH = 0, raster = null;
function rasterIndex(x, z) { const i = Math.floor((x - world.bounds.x0) / RASTER), j = Math.floor((z - world.bounds.z0) / RASTER); if (i < 0 || j < 0 || i >= RW || j >= RH) return -1; return j * RW + i; }
export function surfaceAt(x, z) { const i = rasterIndex(x, z); return i < 0 ? 0 : raster[i]; }
export function groundAt(x, z) {
  const s = surfaceAt(x, z);
  const raise = s === SURF.road ? 0.06 : s === SURF.pavement ? 0.04 : s === SURF.astro || s === SURF.court ? 0.08 : 0;
  return { y: terrainHeight(x, z) + raise, surface: SURF_NAME[s] };
}
function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
  return inside;
}
function rasterPoly(p, code) {
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  for (const [x, z] of p) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  for (let z = minz; z <= maxz; z += RASTER) for (let x = minx; x <= maxx; x += RASTER) if (pointInPoly(x, z, p)) { const i = rasterIndex(x, z); if (i >= 0) raster[i] = code; }
}
function rasterLine(p, w, code) {
  const hw = w / 2;
  for (let s = 0; s < p.length - 1; s++) {
    const [ax, az] = p[s], [bx, bz] = p[s + 1];
    const minx = Math.min(ax, bx) - hw, maxx = Math.max(ax, bx) + hw, minz = Math.min(az, bz) - hw, maxz = Math.max(az, bz) + hw;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    for (let z = minz; z <= maxz; z += RASTER) for (let x = minx; x <= maxx; x += RASTER) {
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); const cx = ax + dx * t, cz = az + dz * t;
      if (Math.hypot(x - cx, z - cz) <= hw) { const i = rasterIndex(x, z); if (i >= 0) raster[i] = code; }
    }
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function mergeGeometries(list) {
  // minimal merge (positions, normals, uvs, colors optional)
  let vcount = 0, icount = 0, hasColor = false;
  for (const g of list) { vcount += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; if (g.attributes.color) hasColor = true; }
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2), col = hasColor ? new Float32Array(vcount * 3) : null, idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    if (col) { if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + n) * 3); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; else for (let i = 0; i < n; i++) idx[io + i] = i + vo;
    io += g.index ? g.index.count : n; vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function addMerged(list, mat, shadow = true, receive = true) {
  if (!list.length) return null;
  const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = shadow; m.receiveShadow = receive; m.frustumCulled = true; scene.add(m); return m;
}
// quad strip ribbon along a polyline at terrain height + lift; uv u along length/uvLen, v 0..1
function ribbon(p, w, lift, uvLen = 4, yFn = null, flatY = null) {
  const hw = w / 2; const positions = [], normals = [], uvs = [], index = [];
  let dist = 0;
  for (let i = 0; i < p.length; i++) {
    const [x, z] = p[i];
    let dx, dz;
    if (i === 0) { dx = p[1][0] - x; dz = p[1][1] - z; } else if (i === p.length - 1) { dx = x - p[i - 1][0]; dz = z - p[i - 1][1]; }
    else { const ax = x - p[i - 1][0], az = z - p[i - 1][1], bx = p[i + 1][0] - x, bz = p[i + 1][1] - z; const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; dx = ax / la + bx / lb; dz = az / la + bz / lb; }
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    if (i > 0) dist += Math.hypot(x - p[i - 1][0], z - p[i - 1][1]);
    for (const s of [-1, 1]) {
      const vx = x + nx * hw * s, vz = z + nz * hw * s;
      const y = flatY !== null ? flatY : (yFn ? yFn(vx, vz) : terrainHeight(vx, vz)) + lift;
      positions.push(vx, y, vz); normals.push(0, 1, 0); uvs.push(dist / uvLen, s < 0 ? 0 : 1);
    }
    if (i > 0) { const b = i * 2; index.push(b - 2, b - 1, b, b - 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(index);
  return g;
}
function disc(x, z, r, lift, segs = 10) {
  const g = new THREE.CircleGeometry(r, segs); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(x + pos.getX(i), z + pos.getZ(i)) + lift);
  g.translate(x, 0, z);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r / 2, uv.getY(i) * r / 2);
  return g;
}
function polygonFlat(p, y, uvScale = 0.25) {
  const shape = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  return g;
}
function boxBetween(ax, ay, az, bx, by, bz, w, h) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 0.01;
  const g = new THREE.BoxGeometry(len, h, w);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 2, uv.getY(i) * h / 2);
  g.rotateY(-Math.atan2(dz, dx)); g.translate((ax + bx) / 2, (ay + by) / 2 + h / 2, (az + bz) / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
function buildTerrain() {
  const b = world.bounds; const W = b.x1 - b.x0, H = b.z1 - b.z0;
  const step = Q() ? 4 : 8; const sx = Math.round(W / step), sz = Math.round(H / step);
  const geo = new THREE.PlaneGeometry(W, H, sx, sz); geo.rotateX(-Math.PI / 2); geo.translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const cUrban = new THREE.Color(0x8fb06a), cPark = new THREE.Color(0x7fc25a), cRoad = new THREE.Color(0x56585c), cPave = new THREE.Color(0x9b9c9e), cAstro = new THREE.Color(0x3fbf4a), cCourt = new THREE.Color(0x6d7378), cCem = new THREE.Color(0x5f8f55), cWater = new THREE.Color(0x3e7fcf), cSchool = new THREE.Color(0x9a9a92), cRail = new THREE.Color(0x7d7668);
  const table = [cUrban, cPark, cRoad, cPave, cAstro, cCourt, cCem, cWater, cSchool, cRail];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    c.copy(table[surfaceAt(x, z)]);
    const n = 0.94 + ((Math.sin(x * 0.37) * Math.cos(z * 0.29)) * 0.5 + 0.5) * 0.1; c.multiplyScalar(n);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 3, uv.getY(i) * H / 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, MAT.ground); m.receiveShadow = true; scene.add(m);
  // outer skirt so the edge of the map doesn't show the void
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, H * 4), new THREE.MeshStandardMaterial({ color: 0x86a862, roughness: 1 }));
  let minY = 1e9; const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) minY = Math.min(minY, pa.getY(i));
  skirt.rotation.x = -Math.PI / 2; skirt.position.y = minY - 0.6; skirt.receiveShadow = true; scene.add(skirt);
}

function buildRoads(d) {
  const roads = [], paves = [], foot = [], marks = [], discsR = [], discsP = [];
  for (const r of d.roads) {
    if (r.p.length < 2) continue;
    if (r.k === 'steps') continue;
    if (r.p.every(([x, z]) => inStadium(x, z, 4))) continue;
    if (r.w <= 2) { foot.push(ribbon(r.p, 2.2, 0.05, 3)); continue; }
    roads.push(ribbon(r.p, r.w, 0.06, 5));
    paves.push(ribbon(r.p, r.w + 3.2, 0.04, 2));
    for (let i = 1; i < r.p.length - 1; i++) { discsR.push(disc(r.p[i][0], r.p[i][1], r.w / 2, 0.061, 10)); discsP.push(disc(r.p[i][0], r.p[i][1], (r.w + 3.2) / 2, 0.041, 10)); }
    if (r.w >= 7) {
      // dashed centre line
      for (let s = 0; s < r.p.length - 1; s++) {
        const [ax, az] = r.p[s], [bx, bz] = r.p[s + 1]; const len = Math.hypot(bx - ax, bz - az); const n = Math.floor(len / 6);
        for (let k = 0; k < n; k++) { const t0 = (k * 6 + 1) / len, t1 = (k * 6 + 4) / len; marks.push(ribbon([[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]], 0.18, 0.075, 4)); }
      }
    }
    // lamp posts along residential streets
    if (r.w >= 6 && r.k !== 'service') for (let s = 0; s < r.p.length - 1; s++) {
      const [ax, az] = r.p[s], [bx, bz] = r.p[s + 1]; const len = Math.hypot(bx - ax, bz - az); const dx = (bx - ax) / (len || 1), dz = (bz - az) / (len || 1);
      for (let t = 12, k = 0; t < len; t += 34, k++) { const side = k % 2 ? -1 : 1; world.lamps.push([ax + dx * t - dz * (r.w / 2 + 1.25) * side, az + dz * t + dx * (r.w / 2 + 1.25) * side]); }
    }
  }
  addMerged(paves.concat(discsP), MAT.pavement, false, true);
  addMerged(roads.concat(discsR), MAT.tarmac, false, true);
  addMerged(foot, MAT.pavement, false, true);
  const mk = addMerged(marks, new THREE.MeshStandardMaterial({ color: 0xf2f2e8, roughness: 0.9 }), false, false);
}

function buildRail(d) {
  const ballast = [], rails = [], decks = [];
  for (const r of d.rail) {
    if (r.p.length < 2) continue;
    const lift = r.b ? 5.5 : 0.3;
    if (r.b) { decks.push(ribbon(r.p, 9, lift - 0.9, 4)); decks.push(ribbon(r.p, 9.4, lift - 1.4, 4)); }
    ballast.push(ribbon(r.p, 7, lift, 4));
    const off = (p, o) => p.map(([x, z], i) => { const q = p[Math.min(p.length - 1, i + 1)], pr = p[Math.max(0, i - 1)]; let dx = q[0] - pr[0], dz = q[1] - pr[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; return [x - dz * o, z + dx * o]; });
    for (const o of [-0.72, 0.72]) rails.push(ribbon(off(r.p, o), 0.14, lift + 0.22, 4));
  }
  addMerged(ballast, MAT.ballast, false, true); addMerged(rails, MAT.rail, false, false); addMerged(decks, MAT.concrete, true, true);
}

function buildBuildings(d) {
  const lists = { terrace: [], terraceB: [], terraceC: [], shopfront: [], flats: [], brick: [], concrete: [], stone: [] }; const roofs = [];
  const shopPts = d.pois.filter((p) => p.n && (p.k.startsWith('shop:') || p.k === 'cafe' || p.k === 'restaurant' || p.k === 'pub' || p.k === 'fast_food')); let styleSeed = 0;
  const rnd = seededRandom(42);
  const tint = new THREE.Color();
  for (const b of d.buildings) {
    const p = b.p; if (p.length < 3) continue;
    if (anyIn(p, 6)) continue;
    let minY = 1e9; for (const [x, z] of p) minY = Math.min(minY, terrainHeight(x, z));
    const base = minY - 2.5, top = minY + b.h;
    let matKey = b.k === 'flats' ? 'flats' : b.k === 'terrace' || b.k === 'commercial' ? 'terrace' : b.k === 'church' ? 'stone' : b.k === 'school' || b.k === 'civic' ? 'brick' : b.k === 'shed' ? 'concrete' : 'concrete';
    if (matKey === 'terrace') {
      // shops get a shopfront; the rest of the terraces alternate between three street styles so rows don't repeat
      const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
      const isShop = b.k === 'commercial' || shopPts.some((q) => Math.hypot(q.x - cx, q.z - cz) < Math.max(9, Math.sqrt(b.a || 60) * 0.7));
      matKey = isShop ? 'shopfront' : ['terrace', 'terraceB', 'terraceC'][(styleSeed++) % 3];
    }
    const positions = [], normals = [], uvs = [], index = [], colors = [];
    const warm = rnd(); tint.setHSL(0.09 + warm * 0.04, 0.35 + rnd() * 0.25, 0.5 + rnd() * 0.22);
    let vi = 0;
    for (let i = 0; i < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) continue;
      const nx = (bz - az) / len, nz = -(bx - ax) / len;   // outward for CCW in x/z with z south? we fix via doubleSide-free test below
      const uw = len / 7.6, vh = (top - base) / 6.6, v0 = -2.5 / 6.6;
      positions.push(ax, base, az, bx, base, bz, bx, top, bz, ax, top, az);
      for (let k = 0; k < 4; k++) { normals.push(nx, 0, nz); colors.push(tint.r, tint.g, tint.b); }
      uvs.push(0, v0, uw, v0, uw, vh + v0, 0, vh + v0);
      index.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
    }
    // roof cap
    try {
      const tri = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
      const rv = vi; for (const [x, z] of p) { positions.push(x, top, z); normals.push(0, 1, 0); colors.push(1, 1, 1); uvs.push(x / 3, z / 3); }
      for (const t of tri) index.push(rv + t[0], rv + t[2], rv + t[1]);
      vi += p.length;
    } catch (_) {}
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(index);
    lists[matKey].push(g);
    // pitched slate roofs with chimney stacks on the terraces; flat slab where the footprint is too irregular
    if (b.k === 'terrace' || b.k === 'commercial') { if (!(Q() && gableRoof(p, top, roofs, lists, tint))) roofs.push(polygonFlat(p, top + 0.02, 0.3)); }
    // collision
    let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9; for (const [x, z] of p) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    const poly = { p, minx, minz, maxx, maxz, top, name: b.n, k: b.k };
    polys.push(poly); gridAdd(polyGrid, minx, minz, maxx, maxz, poly);
  }
  const mats = { terrace: MAT.terrace, flats: MAT.flats, brick: MAT.brick, concrete: MAT.concrete, stone: MAT.stone };
  mats.terraceB = MAT.terraceB; mats.terraceC = MAT.terraceC; mats.shopfront = MAT.shopfront;
  for (const k in lists) { const m = addMerged(lists[k], mats[k], true, true); if (m) m.material.side = THREE.DoubleSide; }
  addMerged(roofs, MAT.slate, false, true);
}

function buildAreas(d) {
  const grass = [], cem = [], hard = [], water = [], astro = [], court = [];
  for (const a of d.areas) {
    const y = a.p.reduce((s, [x, z]) => s + terrainHeight(x, z), 0) / a.p.length;
    if (a.k === 'water') water.push(polygonFlat(a.p, y + 0.05, 0.05));
  }
  for (const pt of d.pitches) {
    if (pt.k === 'playground') continue;
    const y = pt.p.reduce((s, [x, z]) => s + terrainHeight(x, z), 0) / pt.p.length;
    const g = polygonFlat(pt.p, y + 0.09, 0.5);
    if (pt.surface === 'artificial_turf' || pt.sport === 'soccer' || pt.sport === 'football') astro.push(g); else court.push(g);
  }
  addMerged(water, MAT.water, false, false); addMerged(astro, MAT.astro, false, true); addMerged(court, MAT.hard, false, true);
}

function buildFences(d) {
  const metal = [], walls = [], hedges = [], posts = [];
  for (const f of d.fences) {
    if (f.p.length < 2) continue;
    if (anyIn(f.p, 4)) continue;
    const h = clamp(f.h || 1.8, 0.6, 3.5);
    for (let i = 0; i < f.p.length - 1; i++) {
      const [ax, az] = f.p[i], [bx, bz] = f.p[i + 1]; const ay = terrainHeight(ax, az), by = terrainHeight(bx, bz);
      const seg = { ax, az, bx, bz, h, kind: f.k };
      segments.push(seg); gridAdd(segGrid, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), seg);
      if (f.k === 'wall' || f.k === 'retaining_wall') walls.push(boxBetween(ax, ay, az, bx, by, bz, 0.3, h));
      else if (f.k === 'hedge') hedges.push(boxBetween(ax, ay, az, bx, by, bz, 0.8, Math.min(h, 2)));
      else { metal.push(boxBetween(ax, ay + h * 0.45, az, bx, by + h * 0.45, bz, 0.05, 0.06)); metal.push(boxBetween(ax, ay + h - 0.06, az, bx, by + h - 0.06, bz, 0.05, 0.06)); const len = Math.hypot(bx - ax, bz - az); for (let t = 0; t <= len; t += 2.5) { const x = ax + (bx - ax) * t / (len || 1), z = az + (bz - az) * t / (len || 1); const g = new THREE.BoxGeometry(0.08, h, 0.08); g.translate(x, terrainHeight(x, z) + h / 2, z); posts.push(g); } }
    }
  }
  addMerged(walls, MAT.wallBrick, true, true); addMerged(hedges, MAT.hedge, true, true); addMerged(metal.concat(posts), MAT.fenceGrey, true, false);
}

function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; }
function gableRoof(p, top, roofs, lists, tint) {
  const r = pitchRect(p); if (r.wid < 4 || r.wid > 17 || r.len < 4) return false;
  if (polyArea(p) / (r.len * r.wid) < 0.72) return false;
  const ca = Math.cos(r.ang), sa = Math.sin(r.ang);
  const P = (u, v, y) => [r.x + u * ca - v * sa, y, r.z + u * sa + v * ca];
  const L = r.len / 2 + 0.25, W = r.wid / 2 + 0.35, rh = Math.min(r.wid * 0.42, 3.2), ey = top - 0.08, ry = top + rh;
  const pos = [], uv = [], idx = []; let vi = 0;
  const quad = (a, b, c, d, us, vs) => { pos.push(...a, ...b, ...c, ...d); uv.push(0, 0, us, 0, us, vs, 0, vs);
    // wind so the face points up (outside), whatever the building's orientation
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); else idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4; };
  const slope = Math.hypot(W, rh);
  quad(P(-L, -W, ey), P(L, -W, ey), P(L, 0, ry), P(-L, 0, ry), L / 1.3, slope / 1.3);
  quad(P(L, W, ey), P(-L, W, ey), P(-L, 0, ry), P(L, 0, ry), L / 1.3, slope / 1.3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); roofs.push(g);
  // gable ends in the house brick
  const gp = [], gc = [], gn = [], gu = [], gi = [];
  for (const su of [-1, 1]) { const a = P(su * (L - 0.25), -W + 0.3, ey), b = P(su * (L - 0.25), W - 0.3, ey), c = P(su * (L - 0.25), 0, ry - 0.05); const base = gp.length / 3; gp.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { gc.push(tint.r, tint.g, tint.b); gn.push(su * ca, 0, su * sa); } gu.push(0, 0, r.wid / 7.6, 0, r.wid / 15.2, rh / 6.6); gi.push(base, base + (su > 0 ? 1 : 2), base + (su > 0 ? 2 : 1)); }
  const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); ge.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2)); ge.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3)); ge.setIndex(gi); lists.terrace.push(ge);
  // chimney stacks along the ridge, one per house (~6 m), with two pots each
  const n = Math.max(1, Math.round(r.len / 6.5));
  for (let i = 0; i < n; i++) {
    const u = -r.len / 2 + (i + 0.5) * (r.len / n); const [cx, , cz] = P(u, 0.25, 0);
    const box = new THREE.BoxGeometry(0.9, 1.5, 0.75); box.rotateY(-r.ang); box.translate(cx, ry + 0.45, cz); lists.brick.push(box);
    for (const dv of [-0.2, 0.2]) { const pot = new THREE.CylinderGeometry(0.11, 0.13, 0.5, 8); const [px, , pz] = P(u, 0.25 + dv, 0); pot.translate(px, ry + 1.4, pz); lists.concrete.push(pot); }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Grass carpet: a few thousand wind-blown blades that follow Cam around on grass (ultra)
// ---------------------------------------------------------------------------
let grassMesh = null, grassMat = null, grassLast = null; const GRASS_N = 4200, GRASS_R = 30;
function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 9; i++) { const x0 = 8 + i * 14 + (Math.random() - 0.5) * 6, w = 5 + Math.random() * 4, h = 70 + Math.random() * 56, lean = (Math.random() - 0.5) * 30; const grd = g.createLinearGradient(0, 128, 0, 128 - h); grd.addColorStop(0, '#3e7a2a'); grd.addColorStop(1, '#9ed45e'); g.fillStyle = grd; g.beginPath(); g.moveTo(x0 - w / 2, 128); g.quadraticCurveTo(x0 + lean * 0.3, 128 - h * 0.6, x0 + lean, 128 - h); g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.3, 128 - h * 0.6, x0 + w / 2, 128); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function buildGrass() {
  if (!QU()) return;
  const q1 = new THREE.PlaneGeometry(0.9, 0.6); q1.translate(0, 0.3, 0); const q2 = q1.clone(); q2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([q1, q2]);
  grassMat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: 0xffffff });
  setupMaterial(grassMat);
  const prev = grassMat.onBeforeCompile; grassMat.userData.time = { value: 0 };
  grassMat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uTime = grassMat.userData.time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float sway = sin(uTime * 1.6 + instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.5) * 0.09 * uv.y; transformed.x += sway; transformed.z += sway * 0.5; }');
  };
  grassMesh = new THREE.InstancedMesh(geo, grassMat, GRASS_N); grassMesh.frustumCulled = false; grassMesh.receiveShadow = true;
  grassMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS_N * 3), 3);
  scene.add(grassMesh);
}
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), _gv = new THREE.Vector3(), _gc = new THREE.Color();
export function updateGrass(px, pz, t) {
  if (!grassMesh) return;
  grassMat.userData.time.value = t;
  if (grassLast && Math.hypot(px - grassLast[0], pz - grassLast[1]) < 5) return;
  grassLast = [px, pz];
  const cx = Math.round(px), cz = Math.round(pz); let i = 0;
  for (let gz = cz - GRASS_R; gz <= cz + GRASS_R && i < GRASS_N; gz += 1) for (let gx = cx - GRASS_R; gx <= cx + GRASS_R && i < GRASS_N; gx += 1) {
    if ((gx - cx) * (gx - cx) + (gz - cz) * (gz - cz) > GRASS_R * GRASS_R) continue;
    const h = ((gx * 73856093) ^ (gz * 19349663)) >>> 0; const r1 = (h % 1000) / 1000, r2 = ((h >> 10) % 1000) / 1000, r3 = ((h >> 20) % 1000) / 1000;
    if (r3 < 0.35) continue;   // thin it out
    const x = gx + r1 - 0.5, z = gz + r2 - 0.5; const sf = surfaceAt(x, z); if (sf !== SURF.park && sf !== SURF.cemetery && sf !== SURF.urban) continue;
    const y = terrainHeight(x, z);
    _gv.set(x, y - 0.02, z); _gq.setFromAxisAngle(_gs.set(0, 1, 0), r1 * 6.28); const sc = 0.7 + r2 * 0.7; _gs.set(sc, sc * (0.8 + r3 * 0.5), sc); _gm.compose(_gv, _gq, _gs); grassMesh.setMatrixAt(i, _gm);
    _gc.setHSL(0.24 + r2 * 0.05, 0.5, 0.45 + r3 * 0.15); grassMesh.setColorAt(i, _gc); i++;
  }
  for (; i < GRASS_N; i++) { _gs.set(0, 0, 0); _gm.compose(_gv, _gq, _gs); grassMesh.setMatrixAt(i, _gm); }
  grassMesh.instanceMatrix.needsUpdate = true; if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
}

function buildTrees(d) {
  const rnd = seededRandom(7);
  const extra = [];
  // extra trees in parks/cemetery so the green spaces feel full
  for (const a of d.areas) if (a.k === 'grass' || a.k === 'cemetery') {
    const n = Math.min(60, Math.floor(a.a / (a.k === 'cemetery' ? 900 : 1600)));
    let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9; for (const [x, z] of a.p) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) { const x = minx + rnd() * (maxx - minx), z = minz + rnd() * (maxz - minz); if (pointInPoly(x, z, a.p) && surfaceAt(x, z) !== SURF.astro && surfaceAt(x, z) !== SURF.court) { extra.push([x, z]); i++; } }
  }
  const all = d.trees.concat(extra).filter(([x, z]) => !inStadium(x, z, 6));
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, Q() ? 9 : 7); trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1, Q() ? 2 : 0);
  if (Q()) { // roughen the canopy silhouette so it reads as foliage, not a ball
    const pa = canopyGeo.attributes.position; const vv = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { vv.fromBufferAttribute(pa, i); const n = 1 + 0.16 * Math.sin(vv.x * 5.1 + vv.y * 3.3) * Math.cos(vv.z * 4.7 - vv.y * 2.1) + 0.08 * Math.sin(vv.y * 9.0 + vv.x * 2.0); vv.multiplyScalar(n); pa.setXYZ(i, vv.x, vv.y, vv.z); }
    canopyGeo.computeVertexNormals();
  }
  const lobes = Q() ? 3 : 2;
  const trunks = new THREE.InstancedMesh(trunkGeo, MAT.bark, all.length), canopies = new THREE.InstancedMesh(canopyGeo, Q() ? MAT.foliage : new THREE.MeshStandardMaterial({ roughness: 0.95 }), all.length * lobes);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color(); let ci = 0;
  all.forEach(([x, z], i) => {
    const y = terrainHeight(x, z), h = 3 + rnd() * 4, r = 1.6 + rnd() * 2.2;
    v.set(x, y - 0.3, z); s.set(1, h, 1); q.identity(); m.compose(v, q, s); trunks.setMatrixAt(i, m);
    for (let k = 0; k < lobes; k++) { v.set(x + (rnd() - 0.5) * r * 0.7, y + h + r * (0.35 + k * 0.42), z + (rnd() - 0.5) * r * 0.7); const rr = r * (k === 0 ? 1 : k === 1 ? 0.8 : 0.62); s.set(rr, rr * 0.85, rr); q.setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6.3, rnd() * 0.6)); m.compose(v, q, s); canopies.setMatrixAt(ci, m); if (Q()) c.setHSL(0.25 + rnd() * 0.07, 0.35 + rnd() * 0.25, 0.42 + rnd() * 0.2); else c.setHSL(0.27 + rnd() * 0.08, 0.5 + rnd() * 0.3, 0.3 + rnd() * 0.15); canopies.setColorAt(ci, c); ci++; }
    const circ = { x, z, r: 0.4, h }; circles.push(circ); gridAdd(circleGrid, x - 1, z - 1, x + 1, z + 1, circ);
  });
  trunks.castShadow = true; canopies.castShadow = true; canopies.receiveShadow = true; trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true; canopies.instanceColor.needsUpdate = true;
  scene.add(trunks, canopies);
}

function textTexture(text, w = 512, h = 128, bg = '#1b3a8f', fg = '#ffffff', font = 'bold 64px Oswald, Impact, Arial Narrow, sans-serif', border = '#ffffff') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = parseInt(font.match(/(\d+)px/)[1], 10); while (g.measureText(text).width > w - 40 && size > 18) { size -= 4; g.font = font.replace(/\d+px/, size + 'px'); }
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function signPlane(tex, w, h) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide })); return m; }
function nearestRoadDir(d, x, z) {
  let best = 1e9, dir = [1, 0], px = x, pz = z;
  for (const r of d.roads) { if (r.w < 4) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); const cx = ax + dx * t, cz = az + dz * t; const dd = Math.hypot(x - cx, z - cz); if (dd < best) { best = dd; dir = [dx, dz]; px = cx; pz = cz; } } }
  return { dir, px, pz, dist: best };
}
function buildSigns(d) {
  // street names (one per name, at the road's first node), station, pubs, shops, bus stops
  const seen = new Set();
  for (const r of d.roads) {
    if (!r.n || seen.has(r.n) || r.w < 4 || r.p.length < 2) continue; seen.add(r.n);
    const mid = Math.floor(r.p.length / 2); const [ax, az] = r.p[Math.max(0, mid - 1)], [bx, bz] = r.p[mid];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1; const nx = -dz / l, nz = dx / l;
    const x = (ax + bx) / 2 + nx * (r.w / 2 + 1.2), z = (az + bz) / 2 + nz * (r.w / 2 + 1.2), y = terrainHeight(x, z);
    const s = signPlane(textTexture(r.n.toUpperCase(), 512, 96, '#ffffff', '#111111', 'bold 54px Arial, Helvetica, sans-serif', '#111111'), 2.2, 0.42);
    s.position.set(x, y + 2.3, z); s.rotation.y = Math.atan2(dx, dz) + Math.PI / 2; scene.add(s);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), MAT.pole); post.position.set(x, y + 1.15, z); scene.add(post);
  }
  for (const p of d.pois) {
    if (p.k === 'station') {
      const t = textTexture(p.n.toUpperCase(), 1024, 192, '#e8571c', '#ffffff', 'bold 120px Oswald, Impact, sans-serif', null);
      const s = signPlane(t, 8, 1.5); const y = terrainHeight(p.x, p.z); s.position.set(p.x, y + 4.5, p.z); const nd = nearestRoadDir(d, p.x, p.z); s.rotation.y = Math.atan2(nd.dir[0], nd.dir[1]) + Math.PI / 2; scene.add(s);
      for (const sx of [-3.6, 3.6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 0.2), MAT.pole); post.position.set(p.x + Math.cos(s.rotation.y) * sx, y + 2.25, p.z - Math.sin(s.rotation.y) * sx); scene.add(post); }
      world.signs.push({ x: p.x, z: p.z, n: p.n, k: 'station' });
    } else if ((p.k === 'pub' || p.k === 'cafe' || p.k === 'restaurant' || p.k.startsWith('shop:')) && p.n) {
      const nd = nearestRoadDir(d, p.x, p.z); if (nd.dist > 40) continue;
      const pub = p.k === 'pub';
      const t = textTexture(p.n, 768, 160, pub ? '#2a1a0a' : '#1e3f8a', pub ? '#f5d77a' : '#ffffff', pub ? 'bold 70px Georgia, serif' : 'bold 66px Oswald, Impact, sans-serif', pub ? '#f5d77a' : '#ffffff');
      const s = signPlane(t, pub ? 2.6 : 4, pub ? 0.55 : 0.8); const y = terrainHeight(p.x, p.z);
      // face the road
      const toRoad = Math.atan2(nd.px - p.x, nd.pz - p.z);
      s.position.set(p.x + Math.sin(toRoad) * 1.5, y + (pub ? 4.2 : 3.4), p.z + Math.cos(toRoad) * 1.5); s.rotation.y = toRoad; scene.add(s);
      if (pub) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), MAT.botDark); arm.position.set(p.x + Math.sin(toRoad) * 1.5, y + 4.6, p.z + Math.cos(toRoad) * 1.5); arm.rotation.y = toRoad + Math.PI / 2; scene.add(arm); }
    } else if (p.k === 'bus_stop') {
      const y = terrainHeight(p.x, p.z); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), MAT.pole); post.position.set(p.x, y + 1.5, p.z); scene.add(post);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), MAT.red); flag.position.set(p.x, y + 2.9, p.z); scene.add(flag);
      const disc2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), MAT.white); disc2.rotation.x = Math.PI / 2; disc2.position.set(p.x, y + 2.9, p.z + 0.04); scene.add(disc2);
    } else if (p.k === 'post_box') {
      const y = terrainHeight(p.x, p.z); const box = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 14), MAT.postbox); box.position.set(p.x, y + 0.75, p.z); box.castShadow = true; scene.add(box);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), MAT.eye); cap.position.set(p.x, y + 1.55, p.z); scene.add(cap);
    }
  }
}
function buildLamps() {
  world.lamps = world.lamps.filter(([x, z]) => !inStadium(x, z, 6));
  const n = world.lamps.length; if (!n) return;
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.09, 6, 6); poleGeo.translate(0, 3, 0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.3); headGeo.translate(0.2, 6, 0);
  const poles = new THREE.InstancedMesh(poleGeo, MAT.fenceGrey, n), heads = new THREE.InstancedMesh(headGeo, MAT.lampGlow, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  world.lamps.forEach(([x, z], i) => { v.set(x, terrainHeight(x, z), z); m.compose(v, q, s); poles.setMatrixAt(i, m); heads.setMatrixAt(i, m); const circ = { x, z, r: 0.2, h: 6 }; circles.push(circ); gridAdd(circleGrid, x - 1, z - 1, x + 1, z + 1, circ); });
  poles.castShadow = true; scene.add(poles, heads);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function loadWorld() {
  const res = await fetch(CFG.mapUrl); const d = await res.json(); world.data = d;
  E = d.elev; E.base = Math.min(...E.elev); E.x0 = d.elev.x0; E.z0 = d.elev.z0; E.x1 = d.elev.x1; E.z1 = d.elev.z1;
  // raster
  RW = Math.ceil((world.bounds.x1 - world.bounds.x0) / RASTER); RH = Math.ceil((world.bounds.z1 - world.bounds.z0) / RASTER); raster = new Uint8Array(RW * RH);
  for (const a of d.areas) { const code = a.k === 'grass' ? SURF.park : a.k === 'cemetery' ? SURF.cemetery : a.k === 'water' ? SURF.water : a.k === 'school' ? SURF.school : a.k === 'allotments' ? SURF.park : SURF.urban; if (code !== SURF.urban) rasterPoly(a.p, code); }
  for (const r of d.rail) rasterLine(r.p, 8, SURF.rail);
  for (const r of d.roads) { if (r.k === 'steps') continue; if (r.w <= 2) rasterLine(r.p, 2.2, SURF.pavement); else { rasterLine(r.p, r.w + 3.2, SURF.pavement); rasterLine(r.p, r.w, SURF.road); } }
  for (const p of d.pitches) { if (p.k === 'playground') continue; rasterPoly(p.p, (p.surface === 'artificial_turf' || p.sport === 'soccer' || p.sport === 'football') ? SURF.astro : SURF.court); }
  return d;
}
// The Bosco FC stadium footprint: a full-size pitch on the real school pitch, with a two-tier bowl around it.
// Everything the bowl sits on (houses, trees, fences, lamps) is left out of the world build.
export const STADIUM = { len: 84, wid: 54, bowl: 40 };
export function stadiumRect() {
  if (world.stadium) return world.stadium;
  const w = CFG.worlds.find((q) => q.id === 'stadium');
  const pitch = findPitch(w.x, w.z, 80, (p) => p.sport === 'soccer' || p.sport === 'football');
  const r = pitch ? pitchRect(pitch.p) : { x: w.x, z: w.z, ang: 0 };
  world.stadium = { x: r.x, z: r.z, ang: r.ang, len: STADIUM.len, wid: STADIUM.wid };
  return world.stadium;
}
export function inStadium(x, z, pad = 0) {
  const s = world.stadium; if (!s) return false;
  const dx = x - s.x, dz = z - s.z, ca = Math.cos(-s.ang), sa = Math.sin(-s.ang);
  const u = dx * ca - dz * sa, v = dx * sa + dz * ca;
  return Math.abs(u) < s.len / 2 + STADIUM.bowl + pad && Math.abs(v) < s.wid / 2 + STADIUM.bowl + pad;
}
const anyIn = (p, pad = 0) => p.some(([x, z]) => inStadium(x, z, pad));
export function buildWorld() {
  const d = world.data;
  stadiumRect();
  // the stadium apron reads as hard standing on the terrain and the minimap
  { const s = world.stadium; const R = Math.hypot(s.len / 2 + STADIUM.bowl + 6, s.wid / 2 + STADIUM.bowl + 6); for (let z = s.z - R; z <= s.z + R; z += RASTER) for (let x = s.x - R; x <= s.x + R; x += RASTER) if (inStadium(x, z, 6)) { const i = rasterIndex(x, z); if (i >= 0) raster[i] = inStadium(x, z, 6 - STADIUM.bowl) ? SURF.astro : SURF.court; } }
  buildTerrain(); buildAreas(d); buildRoads(d); buildRail(d); buildBuildings(d); buildFences(d); buildTrees(d); buildSigns(d); buildLamps();
}
export function findPitch(x, z, maxDist = 60, pred = null) {
  let best = null, bd = maxDist;
  for (const p of world.data.pitches) { if (p.k === 'playground') continue; if (pred && !pred(p)) continue; const dd = Math.hypot(p.c[0] - x, p.c[1] - z); if (dd < bd) { bd = dd; best = p; } }
  return best;
}
// oriented bounding rectangle (centre, axis angle, length, width) of a polygon by its longest edge
export function pitchRect(p) {
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length]; const l = Math.hypot(bx - ax, bz - az); if (l > best) { best = l; ang = Math.atan2(bz - az, bx - ax); } }
  const ca = Math.cos(-ang), sa = Math.sin(-ang); let minu = 1e9, maxu = -1e9, minv = 1e9, maxv = -1e9;
  for (const [x, z] of p) { const u = x * ca - z * sa, v = x * sa + z * ca; minu = Math.min(minu, u); maxu = Math.max(maxu, u); minv = Math.min(minv, v); maxv = Math.max(maxv, v); }
  const cu = (minu + maxu) / 2, cv = (minv + maxv) / 2;
  const cx = cu * Math.cos(ang) - cv * Math.sin(ang), cz = cu * Math.sin(ang) + cv * Math.cos(ang);
  return { x: cx, z: cz, ang, len: maxu - minu, wid: maxv - minv };
}
export function addSegment(ax, az, bx, bz, h, kind = 'wall') { const seg = { ax, az, bx, bz, h, kind }; segments.push(seg); gridAdd(segGrid, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), seg); return seg; }
export function addCircle(x, z, r, h = 3) { const c = { x, z, r, h }; circles.push(c); gridAdd(circleGrid, x - r, z - r, x + r, z + r, c); return c; }
export function removeSegment(seg) { const i = segments.indexOf(seg); if (i >= 0) segments.splice(i, 1); for (const [k, a] of segGrid) { const j = a.indexOf(seg); if (j >= 0) a.splice(j, 1); } }

function nearby(grid, x, z) { const out = []; const cx = cellOf(x), cz = cellOf(z); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = grid.get(key(cx + i, cz + j)); if (a) for (const it of a) out.push(it); } return out; }
// Push a circle (x,z,r) at height y out of buildings, fences and trunks. Returns {x,z,hit, nx, nz}
export function collideCircle(x, z, r, y, h, cb = null) {
  let hit = false;
  for (const poly of nearby(polyGrid, x, z)) {
    if (x + r < poly.minx || x - r > poly.maxx || z + r < poly.minz || z - r > poly.maxz) continue;
    if (y > poly.top - 0.2) continue;
    const p = poly.p;
    // inside → push to nearest edge; edge overlap → push along edge normal
    let inside = pointInPoly(x, z, p);
    let bestD = 1e9, bn = null;
    for (let i = 0; i < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length];
      const res = circleSegmentPush(x, z, inside ? 1e6 : r, ax, az, bx, bz);
      if (res) { const depth = inside ? (1e6 - res[2]) : res[2]; const dd = inside ? depth : -depth; if (dd < bestD) { bestD = dd; bn = res; } }
    }
    if (bn) {
      if (inside) { const d = 1e6 - bn[2] + r; x += bn[0] * d; z += bn[1] * d; }
      else { x += bn[0] * bn[2]; z += bn[1] * bn[2]; }
      hit = true; if (cb) cb(bn[0], bn[1], 'building');
    }
  }
  for (const s of nearby(segGrid, x, z)) {
    if (y > terrainHeight(s.ax, s.az) + s.h) continue;
    const res = circleSegmentPush(x, z, r + 0.05, s.ax, s.az, s.bx, s.bz);
    if (res) { x += res[0] * res[2]; z += res[1] * res[2]; hit = true; if (cb) cb(res[0], res[1], s.kind); }
  }
  for (const c of nearby(circleGrid, x, z)) {
    if (y > terrainHeight(c.x, c.z) + c.h) continue;
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), rr = c.r + r;
    if (d < rr && d > 1e-6) { x = c.x + (dx / d) * rr; z = c.z + (dz / d) * rr; hit = true; if (cb) cb(dx / d, dz / d, 'post'); }
  }
  return { x, z, hit };
}
export function nearestWorld(x, z) { let best = null, bd = 1e9; for (const w of CFG.worlds) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } } return { world: best, dist: bd }; }
