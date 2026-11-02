import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { asset } from './assets.js';

// Characters face +Z. heading = atan2(dirX, dirZ) sets rotation.y directly.
// Each character kind tries assets/models/<kind>.glb (Higgsfield / Meshy rigged export);
// if the file is missing or fails, a procedural low-poly avatar in the same kit is built instead.

export const KINDS = {
  cam:    { height: 1.4,  yaw: 0, skin: 0xf1c7a6, shirt: 0x6ec6ff, shorts: 0x6ec6ff, socks: 0x6ec6ff, hair: 0x7a4a20, glasses: true, boots: 0x111111, name: 'Cam' },
  mia:    { height: 1.38, yaw: 0, skin: 0xc68642, shirt: 0x6ec6ff, shorts: 0x6ec6ff, socks: 0x6ec6ff, hair: 0x2a1a10, curly: true, boots: 0x111111, name: 'Mia' },
  zombie: { height: 1.75, yaw: 0, skin: 0x9fb78f, shirt: 0xe63946, shorts: 0xe63946, socks: 0xe63946, hair: 0x1b1b1b, zombie: true, boots: 0x111111 },
  elf:    { height: 1.5,  yaw: 0, skin: 0xf4d1b0, shirt: 0xe63946, shorts: 0xe63946, socks: 0x2ec27e, hair: 0x3a2a1a, elf: true, boots: 0x1f7a3a },
  keeper: { height: 1.9,  yaw: 0, skin: 0xf0c9a8, shirt: 0x1f6b3a, shorts: 0x222222, socks: 0x1f6b3a, hair: 0x3a2a1a, elf: true, gloves: true, boots: 0x111111 },
};

const loader = new GLTFLoader();
const modelCache = {};
function loadGLB(kind) {
  if (modelCache[kind]) return modelCache[kind];
  modelCache[kind] = new Promise((resolve) => {
    const url = asset(`assets/models/${kind}.glb`);
    if (/\.zip($|\?)/.test(url)) {
      // GLB packed in an uncompressed (stored) zip: skip the local file header and parse the raw bytes.
      fetch(url).then((r) => r.arrayBuffer()).then((buf) => {
        const dv = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x04034b50) throw new Error('not a zip');
        const n = dv.getUint16(26, true), m = dv.getUint16(28, true), size = dv.getUint32(22, true);
        const start = 30 + n + m;
        loader.parse(buf.slice(start, start + size), '', (g) => resolve(g), () => resolve(null));
      }).catch(() => resolve(null));
      return;
    }
    loader.load(url, (g) => resolve(g), undefined, () => resolve(null));
  });
  return modelCache[kind];
}


// World-space bounds of a (possibly skinned) model in its rest pose.
export function skinnedBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  return box;
}

let modelsEnabled = true;
export function setModelsEnabled(v) { modelsEnabled = v; }

function box(w, h, d, color, flat = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: flat }));
  m.castShadow = true; return m;
}
function sphere(r, color, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true; return m;
}

function buildProcedural(cfg) {
  const h = cfg.height;
  const g = new THREE.Group();
  const leg = h * 0.45, torso = h * 0.3, headR = h * 0.1;
  const hipY = leg;
  const mk = () => {
    const parts = {};
    // legs (pivot at hip)
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * h * 0.07, hipY, 0);
      const thigh = box(h * 0.1, leg * 0.55, h * 0.1, cfg.skin); thigh.position.y = -leg * 0.3; pivot.add(thigh);
      const shortsM = box(h * 0.12, leg * 0.3, h * 0.12, cfg.shorts); shortsM.position.y = -leg * 0.12; pivot.add(shortsM);
      const sock = box(h * 0.09, leg * 0.45, h * 0.09, cfg.socks); sock.position.y = -leg * 0.75; pivot.add(sock);
      const boot = box(h * 0.1, leg * 0.1, h * 0.17, cfg.boots); boot.position.set(0, -leg * 0.95, h * 0.03); pivot.add(boot);
      g.add(pivot); parts[side < 0 ? 'legL' : 'legR'] = pivot;
    }
    // torso
    const body = box(h * 0.26, torso, h * 0.14, cfg.shirt); body.position.y = hipY + torso / 2; g.add(body); parts.body = body;
    if (cfg.zombie) { const tear = box(h * 0.1, torso * 0.3, h * 0.145, cfg.skin); tear.position.set(h * 0.05, hipY + torso * 0.35, 0); g.add(tear); }
    // arms (pivot at shoulder)
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * h * 0.16, hipY + torso * 0.9, 0);
      const sleeve = box(h * 0.07, torso * 0.35, h * 0.07, cfg.shirt); sleeve.position.y = -torso * 0.17; pivot.add(sleeve);
      const arm = box(h * 0.06, torso * 0.55, h * 0.06, cfg.skin); arm.position.y = -torso * 0.6; pivot.add(arm);
      if (cfg.gloves) { const glove = box(h * 0.09, h * 0.09, h * 0.07, 0xe63946); glove.position.y = -torso * 0.92; pivot.add(glove); }
      if (cfg.zombie) pivot.rotation.x = -Math.PI / 2.2; // arms out front
      g.add(pivot); parts[side < 0 ? 'armL' : 'armR'] = pivot;
    }
    // head
    const headG = new THREE.Group(); headG.position.y = hipY + torso + headR * 0.9;
    const head = sphere(headR, cfg.skin); headG.add(head);
    const hair = sphere(headR * 1.02, cfg.hair); hair.scale.set(1, 0.6, 1); hair.position.y = headR * 0.45; headG.add(hair);
    if (cfg.curly) { hair.scale.set(1.25, 0.9, 1.25); hair.position.y = headR * 0.3; const tail = sphere(headR * 0.5, cfg.hair); tail.position.set(0, headR * 0.2, -headR * 1.1); headG.add(tail); }
    // eyes
    for (const side of [-1, 1]) { const eye = sphere(headR * 0.13, 0x111111, 6); eye.position.set(side * headR * 0.35, headR * 0.1, headR * 0.9); headG.add(eye); }
    if (cfg.zombie) { const eye = sphere(headR * 0.22, 0xffffff, 6); eye.position.set(headR * 0.35, headR * 0.1, headR * 0.85); headG.add(eye); }
    if (cfg.glasses) {
      const gm = new THREE.MeshLambertMaterial({ color: 0x111111 });
      for (const side of [-1, 1]) {
        const frame = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.3, headR * 0.05, 6, 12), gm);
        frame.position.set(side * headR * 0.36, headR * 0.1, headR * 0.95); headG.add(frame);
      }
      const bridge = box(headR * 0.2, headR * 0.06, headR * 0.06, 0x111111); bridge.position.set(0, headR * 0.1, headR * 0.95); headG.add(bridge);
    }
    if (cfg.elf) {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.95, headR * 2.2, 10), new THREE.MeshLambertMaterial({ color: 0x1f8a4a, flatShading: true }));
      hat.position.y = headR * 1.4; hat.rotation.z = 0.25; hat.castShadow = true; headG.add(hat);
      const pom = sphere(headR * 0.25, 0xe63946, 6); pom.position.set(-headR * 0.55, headR * 2.35, 0); headG.add(pom);
      for (const side of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.22, headR * 0.7, 5), new THREE.MeshLambertMaterial({ color: cfg.skin })); ear.position.set(side * headR * 1.0, headR * 0.1, 0); ear.rotation.z = side * -Math.PI / 2; headG.add(ear); }
    }
    g.add(headG); parts.head = headG;
    return parts;
  };
  const parts = mk();
  return { group: g, parts, procedural: true };
}

export class Character {
  constructor(kind) {
    this.kind = kind; this.cfg = KINDS[kind];
    this.root = new THREE.Group();           // world transform (position + heading)
    this.tilt = new THREE.Group();           // used for leaning / lying down
    this.root.add(this.tilt);
    this.phase = 0; this.speed = 0; this.mixer = null; this.action = null;
    this.model = buildProcedural(this.cfg); this.tilt.add(this.model.group);
    this.ready = modelsEnabled ? loadGLB(kind).then((g) => { if (g) this._useGLB(g); }) : Promise.resolve();
  }
  _useGLB(gltf) {
    // Meshy rigged exports arrive in metres with feet at y=0 and the figure centred, facing +Z,
    // so no bounding-box normalisation is needed (bbox maths is unreliable on skinned meshes).
    const scene = gltf.scene;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { o.material.side = THREE.DoubleSide; o.material.transparent = false; o.material.alphaTest = 0; o.material.depthWrite = true; } } });
    const wrap = new THREE.Group(); wrap.add(scene);
    // Fit to the configured height using the SKINNED bounds (plain geometry bounds ignore the armature scale).
    const box = skinnedBounds(scene);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = size.y > 0.01 ? this.cfg.height / size.y : 1;
    scene.scale.setScalar(s);
    const c = new THREE.Vector3(); box.getCenter(c);
    scene.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    wrap.rotation.y = this.cfg.yaw;
    if (gltf.animations && gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(scene);
      this.action = this.mixer.clipAction(gltf.animations[0]); this.action.play();
    }
    this.tilt.remove(this.model.group);
    this.model = { group: wrap, parts: null, procedural: false };
    this.tilt.add(wrap);
  }
  get position() { return this.root.position; }
  setHeading(dx, dz) { if (Math.abs(dx) + Math.abs(dz) > 1e-4) this.root.rotation.y = Math.atan2(dx, dz); }
  update(dt, speed) {
    this.speed = speed;
    if (this.mixer) {
      const ts = speed > 0.3 ? THREE.MathUtils.clamp(speed / 5, 0.35, 1.8) : 0.0;
      this.mixer.update(dt * ts);
      return;
    }
    const p = this.model.parts; if (!p) return;
    this.phase += dt * Math.max(speed, 0) * 2.6;
    const amp = THREE.MathUtils.clamp(speed / 6, 0, 1) * 0.9;
    const s = Math.sin(this.phase);
    p.legL.rotation.x = s * amp; p.legR.rotation.x = -s * amp;
    if (!this.cfg.zombie) { p.armL.rotation.x = -s * amp * 0.8; p.armR.rotation.x = s * amp * 0.8; }
    else { p.armL.rotation.x = -Math.PI / 2.2 + s * 0.2; p.armR.rotation.x = -Math.PI / 2.2 - s * 0.2; }
    p.body.position.y = this.cfg.height * 0.45 + this.cfg.height * 0.3 / 2 + Math.abs(s) * amp * 0.03;
  }
  // Lie down (slide tackle / knocked out). amount 0..1
  setDown(amount, backwards = false) {
    this.tilt.rotation.x = (backwards ? -1 : 1) * amount * Math.PI / 2 * 0.95;
    this.tilt.position.y = amount * 0.15;
  }
}
