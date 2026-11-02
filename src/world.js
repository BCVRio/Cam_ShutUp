import * as THREE from 'three';

export const LANES = 5, LANE_W = 3.0;
export const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;
export const HALF_W = LANES * LANE_W / 2;      // 7.5
export const WING_X = HALF_W + 1.8;            // teammate track
export const BOARD_X = HALF_W + 3.4;           // advertising boards / walls

export const LEVELS = [
  { name: 'London',    stadium: 'Arch Arena',   img: 'stadium_london',    length: 95,  defenders: 6,  elfRatio: 0.3, ring: 1.5, keeper: 1.0, reach: 1.5, fog: 0.0, tricksFor3: 5, skyTint: 0x1d2b4f },
  { name: 'Barcelona', stadium: 'Camp Gran',    img: 'stadium_barcelona', length: 115, defenders: 9,  elfRatio: 0.4, ring: 1.8, keeper: 1.25, reach: 1.6, fog: 0.0, tricksFor3: 6, skyTint: 0x2a1d3a },
  { name: 'Rio',       stadium: 'Praia Bowl',   img: 'stadium_rio',       length: 135, defenders: 12, elfRatio: 0.5, ring: 2.1, keeper: 1.5, reach: 1.7, fog: 0.0, tricksFor3: 7, skyTint: 0x0e2a3a },
  { name: 'Milan',     stadium: 'Spiral Towers', img: 'stadium_milan',    length: 155, defenders: 15, elfRatio: 0.6, ring: 2.4, keeper: 1.75, reach: 1.8, fog: 0.5, tricksFor3: 8, skyTint: 0x2a2a35 },
  { name: 'Munich',    stadium: 'Diamond Dome', img: 'stadium_munich',    length: 175, defenders: 19, elfRatio: 0.7, ring: 2.8, keeper: 2.0, reach: 1.9, fog: 0.2, tricksFor3: 10, skyTint: 0x3a1d2a },
];

const texLoader = new THREE.TextureLoader();
const texCache = {};
export function tex(name, repeat = [1, 1], srgb = true) {
  const key = name + repeat.join('x');
  if (texCache[key]) return texCache[key];
  const t = texLoader.load(name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[key] = t; return t;
}

function makeGlowSprite(color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(0.3, color + 'aa'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = makeGlowSprite('#ffffff');
export const fireTex = makeGlowSprite('#ffb347');

function stripeTexture(a = '#ffffff', b = '#e63946') {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
  ctx.fillStyle = a; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = b;
  for (let i = -64; i < 128; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 8, 0); ctx.lineTo(i + 8 + 64, 64); ctx.lineTo(i + 64, 64); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const candyTex = stripeTexture();

function lam(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }

// ---------- obstacle builders (each ~2.6 x 2.4 footprint, origin at ground centre) ----------
function present(rnd) {
  const g = new THREE.Group();
  const cols = [0xe63946, 0x2ec27e, 0x3a86ff, 0xf3c53d, 0xff70a6];
  const c = cols[Math.floor(rnd() * cols.length)];
  const h = 1.4 + rnd() * 0.5;
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.3, h, 2.0), lam(c)); b.position.y = h / 2; b.castShadow = true; b.receiveShadow = true; g.add(b);
  const rib = lam(0xfff1a8);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.34, h + 0.02, 0.35), rib); r1.position.y = h / 2; g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, h + 0.02, 2.04), rib); r2.position.y = h / 2; g.add(r2);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 6, 12), rib); bow.position.y = h + 0.25; bow.rotation.y = Math.PI / 4; g.add(bow);
  return { group: g, h };
}
function snowman(rnd) {
  const g = new THREE.Group(); const w = lam(0xffffff);
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), w); s1.position.y = 0.8; s1.castShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 10), w); s2.position.y = 1.95; s2.castShadow = true; g.add(s2);
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), w); s3.position.y = 2.8; s3.castShadow = true; g.add(s3);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), lam(0x111111)); hat.position.y = 3.35; g.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), lam(0x111111)); brim.position.y = 3.12; g.add(brim);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6), lam(0xff8c00)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.8, 0.55); g.add(nose);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 6, 12), lam(0xe63946)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 2.45; g.add(scarf);
  return { group: g, h: 3.4 };
}
function candyFence() {
  const g = new THREE.Group(); const m = new THREE.MeshLambertMaterial({ map: candyTex });
  for (let i = -1; i <= 1; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 8), m); p.position.set(i * 0.9, 0.8, 0); p.castShadow = true; g.add(p); const hook = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.14, 6, 10, Math.PI), m); hook.position.set(i * 0.9 + 0.3, 1.6, 0); g.add(hook); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), m); rail.position.y = 0.9; g.add(rail);
  const rail2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), m); rail2.position.y = 0.4; g.add(rail2);
  return { group: g, h: 1.9 };
}
function hedge() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 2.0), lam(0x1f6b3a)); b.position.y = 0.75; b.castShadow = true; g.add(b);
  for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lam(i % 2 ? 0xe63946 : 0xf3c53d)); l.position.set(-1 + i * 0.4, 1.55 - (i % 2) * 0.4, 1.02); g.add(l); }
  return { group: g, h: 1.6 };
}
export function xmasTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 7), lam(0x5a3a1a)); trunk.position.y = 0.3; g.add(trunk);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.2 - i * 0.3, 1.3, 8), lam(0x1f7a3a, { flatShading: true })); c.position.y = 0.9 + i * 0.8; c.castShadow = true; g.add(c); }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffe066 })); star.position.y = 3.35; g.add(star);
  for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: [0xff3b3b, 0x3bb2ff, 0xffe066][i % 3] })); const a = i * 2.4, y = 0.9 + (i / 10) * 2; const r = (1.15 - (y - 0.9) * 0.35); b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); g.add(b); }
  g.scale.setScalar(scale); return g;
}

export function createRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class World {
  constructor(scene, levelIndex, seed) {
    this.scene = scene; this.level = LEVELS[levelIndex]; this.levelIndex = levelIndex;
    this.L = this.level.length;
    this.group = new THREE.Group(); scene.add(this.group);
    this.obstacles = []; this.coins = []; this.defenderSpawns = []; this.lights = [];
    const rnd = createRng(seed);
    this._buildPitch();
    this._buildStands();
    this._buildGoal();
    this._buildLights();
    this._buildMaze(rnd);
    this._buildDecor(rnd);
  }
  _buildPitch() {
    const L = this.L, g = this.group;
    const turf = tex('assets/textures/turf_3g.jpg', [HALF_W * 2 / 6, (L + 60) / 6]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_X * 2 + 4, L + 60), new THREE.MeshLambertMaterial({ map: turf, color: 0xdfe8ff }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, L / 2 - 10); ground.receiveShadow = true; g.add(ground);
    // snow dusting on the wings
    const snowM = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
    for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_X - HALF_W, L + 60), snowM); wing.rotation.x = -Math.PI / 2; wing.position.set(s * (HALF_W + (BOARD_X - HALF_W) / 2), 0.01, L / 2 - 10); wing.receiveShadow = true; g.add(wing); }
    // white lines
    const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); g.add(m); };
    line(0.12, L + 20, -HALF_W, L / 2 - 5); line(0.12, L + 20, HALF_W, L / 2 - 5);
    line(HALF_W * 2, 0.12, 0, L); line(HALF_W * 2, 0.12, 0, -8);
    // penalty box + 6-yard box
    line(0.12, 16.5, -HALF_W + 1.5, L - 8.25); line(0.12, 16.5, HALF_W - 1.5, L - 8.25); line(HALF_W * 2 - 3, 0.12, 0, L - 16.5);
    line(0.12, 5.5, -4.5, L - 2.75); line(0.12, 5.5, 4.5, L - 2.75); line(9, 0.12, 0, L - 5.5);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), lineM); spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.015, L - 11); g.add(spot);
    const centre = new THREE.Mesh(new THREE.RingGeometry(4.5, 4.62, 40), lineM); centre.rotation.x = -Math.PI / 2; centre.position.set(0, 0.015, 0); g.add(centre);
    // faint lane guides
    const laneM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 });
    for (let i = 1; i < LANES; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, L - 30), laneM); m.rotation.x = -Math.PI / 2; m.position.set(laneX(i) - LANE_W / 2, 0.012, (L - 30) / 2 + 12); g.add(m); }
    // advertising boards
    const crest = tex('assets/textures/bosco_crest.jpg', [(L + 60) / 4, 1]);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, L + 60), new THREE.MeshLambertMaterial({ color: 0x14244a }));
      b.position.set(s * BOARD_X, 0.5, L / 2 - 10); b.castShadow = true; g.add(b);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L + 60, 1.0), new THREE.MeshLambertMaterial({ map: crest, color: 0xffffff }));
      face.position.set(s * (BOARD_X - 0.16), 0.5, L / 2 - 10); face.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(face);
    }
    const backB = new THREE.Mesh(new THREE.BoxGeometry(BOARD_X * 2, 1.0, 0.3), new THREE.MeshLambertMaterial({ color: 0x14244a })); backB.position.set(0, 0.5, L + 6); g.add(backB);
  }
  _buildStands() {
    const L = this.L, g = this.group;
    const crowd = tex('assets/textures/crowd_navy_gold.jpg', [(L + 80) / 14, 1.6]);
    const seats = tex('assets/textures/stadium_seats.jpg', [(L + 80) / 10, 2]);
    const standM = new THREE.MeshLambertMaterial({ map: crowd, color: 0xd8e0f0, side: THREE.DoubleSide });
    const lower = new THREE.MeshLambertMaterial({ map: seats, color: 0xb8c6e0, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      // lower seating tier
      const l = new THREE.Mesh(new THREE.PlaneGeometry(L + 80, 4.5), lower);
      l.rotation.order = 'YXZ'; l.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; l.rotation.x = -0.45;
      l.position.set(s * (BOARD_X + 2.2), 2.0, L / 2 - 10); g.add(l);
      // crowd tier
      const st = new THREE.Mesh(new THREE.PlaneGeometry(L + 80, 20), standM);
      st.rotation.order = 'YXZ'; st.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; st.rotation.x = -0.55;
      st.position.set(s * (BOARD_X + 8.5), 11, L / 2 - 10); g.add(st);
      // fairy lights along the tier edge
      const pts = []; for (let z = -30; z < L + 40; z += 3) pts.push(new THREE.Vector3(s * (BOARD_X + 3.6), 4.2, z));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const lights = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.0, map: glowTex, color: s < 0 ? 0xff4d4d : 0x4dff88, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      g.add(lights);
    }
    // behind the start
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_X * 2 + 40, 20), standM); back.position.set(0, 10, -24); back.rotation.x = -0.5; g.add(back);
    // big stadium backdrop behind the goal (gently curved: three angled panels)
    const img = tex(`assets/img/${this.level.img}.jpg`, [1, 1]); img.wrapS = THREE.ClampToEdgeWrapping; img.wrapT = THREE.ClampToEdgeWrapping;
    const bw = 150, bh = bw * 576 / 1344;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh, 12, 1), new THREE.MeshBasicMaterial({ map: img, fog: false }));
    // bend the plane into a shallow arc so the ends wrap toward the camera
    const pos = backdrop.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, -Math.pow(x / (bw / 2), 2) * 28); }
    pos.needsUpdate = true; backdrop.geometry.computeVertexNormals();
    backdrop.position.set(0, bh * 0.1, L + 46); backdrop.rotation.y = Math.PI; g.add(backdrop);
    // night sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.MeshBasicMaterial({ color: this.level.skyTint, side: THREE.BackSide, fog: false }));
    sky.position.set(0, 0, L / 2); g.add(sky);
  }
  _buildGoal() {
    const L = this.L, g = this.group;
    const postM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const W = 3.66, H = 2.44, D = 1.8;
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, H, 8), postM); p.position.set(s * W, H / 2, L); p.castShadow = true; g.add(p); const back = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H * 0.8, 6), postM); back.position.set(s * W, H * 0.4, L + D); g.add(back); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, W * 2 + 0.14, 8), postM); bar.rotation.z = Math.PI / 2; bar.position.set(0, H, L); bar.castShadow = true; g.add(bar);
    const netM = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 });
    const backNet = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H * 0.8, 20, 8), netM); backNet.position.set(0, H * 0.4, L + D); g.add(backNet);
    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D, 20, 5), netM); topNet.rotation.x = -Math.PI / 2 + 0.25; topNet.position.set(0, H * 0.9, L + D / 2); g.add(topNet);
    for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H, 5, 8), netM); side.rotation.y = Math.PI / 2; side.position.set(s * W, H / 2 - 0.2, L + D / 2); g.add(side); }
    this.net = backNet;
  }
  _buildLights() {
    const g = this.group, L = this.L;
    const hemi = new THREE.HemisphereLight(0x9fb9ff, 0x1a2a3a, 1.1); g.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6); sun.position.set(25, 45, -20); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 5; sun.shadow.camera.far = 140;
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30; sun.shadow.bias = -0.0015;
    g.add(sun); g.add(sun.target); this.sun = sun;
    const fill = new THREE.DirectionalLight(0xcfe3ff, 0.9); fill.position.set(-30, 30, 40); g.add(fill);
    // floodlight pylons with glow
    const pylonM = new THREE.MeshLambertMaterial({ color: 0x9aa4b5 });
    const spots = [[-BOARD_X - 6, -14], [BOARD_X + 6, -14], [-BOARD_X - 6, L + 14], [BOARD_X + 6, L + 14]];
    for (const [x, z] of spots) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 30, 8), pylonM); p.position.set(x, 15, z); g.add(p);
      const head = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6d5 })); head.position.set(x, 30, z); head.lookAt(0, 0, L / 2); g.add(head);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      sp.scale.set(26, 26, 1); sp.position.set(x, 30, z); g.add(sp);
    }
    if (this.level.fog > 0) this.scene.fog = new THREE.Fog(0x2b3348, 30, 120 - this.level.fog * 50); else this.scene.fog = new THREE.Fog(this.level.skyTint, 80, 230);
  }
  _buildMaze(rnd) {
    const L = this.L, g = this.group;
    const builders = [present, present, snowman, candyFence, hedge];
    let path = 2;
    const rows = [];
    for (let z = 18; z < L - 24; z += 9) {
      path = Math.max(0, Math.min(LANES - 1, path + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.7 ? 1 : 0)));
      const nBlock = Math.min(3, 1 + Math.floor(rnd() * (2 + this.levelIndex * 0.5)));
      const blocked = new Set();
      while (blocked.size < nBlock) { const l = Math.floor(rnd() * LANES); if (l !== path) blocked.add(l); }
      for (const l of blocked) {
        const b = builders[Math.floor(rnd() * builders.length)](rnd);
        b.group.position.set(laneX(l), 0, z); b.group.rotation.y = (rnd() - 0.5) * 0.3; g.add(b.group);
        this.obstacles.push({ x: laneX(l), z, hw: 1.3, hd: 1.15, h: b.h, mesh: b.group });
      }
      rows.push({ z, path, blocked });
    }
    // coins in the gaps and open lanes
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      for (let l = 0; l < LANES; l++) {
        if (r.blocked.has(l)) continue;
        if (rnd() < 0.55) { for (let k = -1; k <= 1; k++) this._coin(laneX(l), r.z + k * 1.1, 1, rnd); }
        else if (rnd() < 0.12) this._coin(laneX(l), r.z, 5, rnd);
      }
      if (i < rows.length - 1 && rnd() < 0.5) { const l = Math.floor(rnd() * LANES); this._coin(laneX(l), r.z + 4.5, 1, rnd); }
    }
    // defender spawns in the gaps between rows
    const wanted = this.level.defenders; let placed = 0, tries = 0;
    const used = new Set();
    while (placed < wanted && tries < 400) {
      tries++;
      const ri = Math.floor(rnd() * rows.length); const l = Math.floor(rnd() * LANES);
      const key = ri + ':' + l; if (used.has(key)) continue;
      const z = rows[ri].z + 4.5 + (rnd() - 0.5) * 2;
      if (z > L - 26) continue;
      used.add(key); placed++;
      this.defenderSpawns.push({ x: laneX(l), z, lane: l, kind: rnd() < this.level.elfRatio ? 'elf' : 'zombie' });
    }
    this.rows = rows;
  }
  _coin(x, z, value, rnd) {
    let mesh;
    if (value === 1) { mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14), new THREE.MeshLambertMaterial({ color: 0xffd54a, emissive: 0x6b4a00 })); mesh.rotation.x = Math.PI / 2; }
    else { mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshLambertMaterial({ color: 0xfff1a8, emissive: 0x8a6a00, flatShading: true })); }
    const holder = new THREE.Group(); holder.position.set(x, 0.9, z); holder.add(mesh); this.group.add(holder);
    this.coins.push({ x, z, value, mesh: holder, taken: false, spin: rnd() * 6 });
  }
  _buildDecor(rnd) {
    const g = this.group, L = this.L;
    for (let z = -6; z < L + 4; z += 12) for (const s of [-1, 1]) { const t = xmasTree(0.9 + rnd() * 0.4); t.position.set(s * (BOARD_X + 1.6), 0, z + rnd() * 4); g.add(t); }
    // Santa's cage behind the goal
    const cage = new THREE.Group();
    const bars = new THREE.MeshLambertMaterial({ color: 0x8899aa });
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), bars); const a = i / 8 * Math.PI * 2; b.position.set(Math.cos(a) * 1.2, 1.5, Math.sin(a) * 1.2); cage.add(b); }
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 6, 16), bars); top.rotation.x = Math.PI / 2; top.position.y = 3; cage.add(top);
    const santaBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.9, 4, 10), new THREE.MeshLambertMaterial({ color: 0xd62828 })); santaBody.position.y = 1.2; cage.add(santaBody);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.08, 6, 14), new THREE.MeshLambertMaterial({ color: 0x111111 })); belt.rotation.x = Math.PI / 2; belt.position.y = 1.1; cage.add(belt);
    const santaHead = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), new THREE.MeshLambertMaterial({ color: 0xf5cfa8 })); santaHead.position.y = 2.2; cage.add(santaHead);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 10), new THREE.MeshLambertMaterial({ color: 0xffffff })); beard.scale.set(1, 0.8, 0.8); beard.position.set(0, 1.95, 0.15); cage.add(beard);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.7, 10), new THREE.MeshLambertMaterial({ color: 0xd62828 })); hat.position.y = 2.75; hat.rotation.z = 0.3; cage.add(hat);
    cage.position.set(0, 0, L + 8); g.add(cage); this.santaCage = cage;
    // fire pit / sleigh behind
    const sleigh = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.4), new THREE.MeshLambertMaterial({ color: 0xa4161a })); sleigh.position.set(6, 0.5, L + 9); g.add(sleigh);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.scene.fog = null;
  }
}
