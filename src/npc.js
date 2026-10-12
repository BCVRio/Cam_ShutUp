// Non-player characters: rigged Higgsfield/Meshy models (one base per kind), cloned per instance, with a procedural stand-in until the model arrives.
import { THREE, CFG, scene, MAT, urlParams, setupObject } from './core.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { clone as skeletonClone } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js/+esm';

export const NPC_MODELS = {
  man: { url: './public/models/npc_man.glb', height: 1.78 },
  woman: { url: './public/models/npc_woman.glb', height: 1.66 },
  shopkeeper: { url: './public/models/npc_shop.glb', height: 1.72 },
  referee: { url: './public/models/npc_ref.glb', height: 1.8 },
  boy: { url: './public/models/npc_boy.glb', height: 1.45 },
  boyHome: { url: './public/models/npc_boy_home.glb', height: 1.45 },
  boyAway: { url: './public/models/npc_boy_away.glb', height: 1.45 },
  boyKeeper: { url: './public/models/npc_boy_keeper.glb', height: 1.45 },
};
const cache = {};       // kind -> { scene, anims, height } or Promise
const instances = {};   // kind -> [group]

async function loadGlb(url) {
  const loader = new GLTFLoader();
  if (!urlParams.has('b64')) { try { return await loader.loadAsync(url); } catch (e) { /* fall through to base64 */ } }
  const res = await fetch(url + CFG.modelB64Suffix); if (!res.ok) throw new Error('model missing ' + url);
  const bin = atob((await res.text()).trim()); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
function pick(anims, words) { for (const w of words) { const a = anims.find((c) => c.name.toLowerCase().includes(w)); if (a) return a; } return null; }

export function loadNpc(kind) {
  if (cache[kind]) return cache[kind];
  const def = NPC_MODELS[kind]; if (!def) return null;
  cache[kind] = loadGlb(def.url).then((gltf) => {
    const model = gltf.scene; const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
    const s = def.height / Math.max(size.y, 0.001); model.scale.setScalar(s); box.setFromObject(model);
    model.position.y -= box.min.y; model.position.x -= (box.min.x + box.max.x) / 2; model.position.z -= (box.min.z + box.max.z) / 2;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) { if (o.material.transparent && o.material.opacity > 0.95) o.material.transparent = false; if (o.material.map) o.material.map.anisotropy = 4; } } });
    setupObject(model);
    const anims = gltf.animations || [];
    const base = { model, anims, idle: pick(anims, ['idle', 'stand']) || anims[0] || null, walk: pick(anims, ['walk', 'run', 'jog']) || null, run: pick(anims, ['run', 'jog', 'walk']) || null };
    cache[kind] = base;
    // upgrade any stand-ins already placed
    for (const g of instances[kind] || []) attach(g, base);
    return base;
  }).catch((e) => { console.warn('npc model unavailable', kind, e && e.message); cache[kind] = null; return null; });
  return cache[kind];
}
function standIn(kind) {
  const g = new THREE.Group(); const tall = kind === 'boy' || kind.startsWith('boy') ? 1.35 : 1.75;
  const kit = kind === 'boyHome' ? new THREE.MeshStandardMaterial({ color: 0x6ab4ee, roughness: 0.7 }) : kind === 'boyAway' ? MAT.kitAway : kind === 'boyKeeper' ? MAT.kitKeeper : kind === 'referee' ? MAT.botDark : kind === 'woman' ? new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.8 }) : kind === 'shopkeeper' ? new THREE.MeshStandardMaterial({ color: 0x7a2a3a, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * tall / 1.75, 0.5 * tall / 1.75, 4, 10), kit); body.position.y = 0.62 * tall; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11 * tall / 1.35, 12, 10), MAT.skin); head.position.y = 0.92 * tall; g.add(head);
  for (const sx of [-0.09, 0.09]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32 * tall / 1.75, 4, 8), MAT.botDark); leg.position.set(sx * tall / 1.75, 0.22 * tall, 0); g.add(leg); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.standIn = true;
  return g;
}
function attach(g, base) {
  if (!base || !base.model) return;
  for (const c of [...g.children]) g.remove(c);
  const m = skeletonClone(base.model); g.add(m); g.userData.standIn = false;
  if (base.anims.length) { const mixer = new THREE.AnimationMixer(m); g.userData.mixer = mixer; g.userData.clips = { idle: base.idle, walk: base.walk, run: base.run }; g.userData.current = null; npcPlay(g, g.userData.wanted || 'idle', 0); }
}
export function makeNpc(kind) {
  const g = new THREE.Group(); g.userData.kind = kind; g.userData.wanted = 'idle';
  (instances[kind] = instances[kind] || []).push(g);
  const base = cache[kind];
  if (base && base.model) attach(g, base); else { g.add(standIn(kind)); if (base === undefined) loadNpc(kind); }
  return g;
}
export function npcPlay(g, name, fade = 0.25) {
  g.userData.wanted = name;
  const mixer = g.userData.mixer; if (!mixer) return;
  const clip = g.userData.clips[name] || g.userData.clips.idle; if (!clip || g.userData.current === clip) return;
  const next = mixer.clipAction(clip); next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (g.userData.current) mixer.clipAction(g.userData.current).fadeOut(fade);
  g.userData.current = clip;
}
export function npcUpdate(g, dt) { if (g.userData.mixer) g.userData.mixer.update(dt); }
