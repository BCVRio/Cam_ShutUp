// Shops you can walk into and people you can talk to. Ten shops from the real map get a shopkeeper at the door,
// a glowing step, and a three-option chat (randomised each visit): cards, a drink, directions, banter.
import { THREE, CFG, scene, MAT, player, $, addScore, showToast, feed, playSfx, say, synth, emit } from './core.js';
import { world, groundAt, terrainHeight, addCircle } from './map.js';
import { makeNpc, npcUpdate } from './npc.js';
import { openPack, showPack, album } from './cards.js';

export const shops = [];
export const talk = { open: false, shop: null, options: [], prompt: null };
const KEEPER_NAMES = ['Mo', 'Dev', 'Ayesha', 'Tony', 'Grace', 'Kwame', 'Sam', 'Lena', 'Raj', 'Bea', 'Yusuf', 'Pat'];
const NICE = ['convenience', 'newsagent', 'supermarket', 'bakery', 'greengrocer', 'kiosk', 'butcher', 'seafood', 'deli', 'toys', 'books', 'sports', 'gift', 'cafe'];

function nearestRoad(d, x, z) {
  let best = 1e9, px = x, pz = z;
  for (const r of d.roads) { if (r.w < 4) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const cx = ax + dx * t, cz = az + dz * t; const dd = Math.hypot(x - cx, z - cz); if (dd < best) { best = dd; px = cx; pz = cz; } } }
  return { px, pz, dist: best };
}
export function buildShops() {
  const d = world.data;
  const cands = d.pois.filter((p) => p.n && (p.k.startsWith('shop:') || p.k === 'cafe')).map((p) => { const kind = p.k.replace('shop:', ''); return { ...p, kind, score: (NICE.includes(kind) ? 2 : 0) + (p.k.startsWith('shop:convenience') ? 2 : 0) + Math.random() }; });
  cands.sort((a, b) => b.score - a.score);
  // spread them out: no two within 60 m, up to ten
  const picked = [];
  for (const c of cands) { if (picked.length >= 10) break; if (picked.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 60)) continue; picked.push(c); }
  picked.forEach((p, i) => {
    const road = nearestRoad(d, p.x, p.z); const ang = Math.atan2(road.px - p.x, road.pz - p.z);   // toward the road
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const x = p.x + dx * Math.min(road.dist - 2.2, 3.5), z = p.z + dz * Math.min(road.dist - 2.2, 3.5);   // the doorway, on the pavement side
    const y = terrainHeight(x, z);
    const keeper = makeNpc('shopkeeper'); keeper.position.set(x + dx * 0.4, groundAt(x + dx * 0.4, z + dz * 0.4).y, z + dz * 0.4); keeper.rotation.y = ang; scene.add(keeper);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 32), new THREE.MeshBasicMaterial({ color: 0xf2c233, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(x + dx * 1.6, y + 0.03, z + dz * 1.6); scene.add(ring);
    const halo = new THREE.Sprite(MAT.glowSprite); halo.scale.set(3, 2.2, 1); halo.position.set(x, y + 2.6, z); scene.add(halo);
    // awning + shop sign over the door
    const sign = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#14275e'; g.fillRect(0, 0, 1024, 160); g.fillStyle = '#f2c233'; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 150, 1024, 10); g.font = 'bold 86px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; let s = 86; while (g.measureText(p.n.toUpperCase()).width > 960 && s > 30) { s -= 4; g.font = `bold ${s}px Oswald, Impact, sans-serif`; } g.fillText(p.n.toUpperCase(), 512, 80); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return new THREE.Mesh(new THREE.PlaneGeometry(5, 0.8), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0x222222, emissiveMap: t, emissiveIntensity: 0.3 })); })();
    sign.position.set(p.x + dx * 0.6, y + 3.3, p.z + dz * 0.6); sign.rotation.y = ang; scene.add(sign);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 1.4), i % 2 ? MAT.red : MAT.navy); awn.position.set(p.x + dx * 1.2, y + 2.85, p.z + dz * 1.2); awn.rotation.y = ang; awn.rotation.x = 0.18; awn.castShadow = true; scene.add(awn);
    const shop = { id: 'shop' + i, name: p.n, kind: p.kind, x, z, keeper, keeperName: KEEPER_NAMES[i % KEEPER_NAMES.length], ring, visits: 0 };
    addCircle(keeper.position.x, keeper.position.z, 0.35, 1.8);
    shops.push(shop); world.signs.push({ x, z, n: p.n, k: 'shop' });
  });
}

// ---------------------------------------------------------------------------
// Talking
// ---------------------------------------------------------------------------
const GREETS = ['Alright {cam}, what can I get you?', 'Hello mate! Haven\'t seen you since the match.', 'Welcome to {shop}. Busy day?', 'Ah, Bosco\'s number nine! What\'ll it be?', 'Hiya. Mind the step, it\'s been like that for years.'];
const POOL = [
  { id: 'cards', text: 'Can I buy a pack of Top Cards? (50 pts)', cost: 50, do: (s) => { const got = openPack(false); showPack(got); return 'Here you go. Don\'t open them all at once.'; } },
  { id: 'attax', text: 'Got any Match Attax? (120 pts, no commons)', cost: 120, do: (s) => { const got = openPack(true); showPack(got); return 'Top shelf, these. Shiny ones only.'; } },
  { id: 'drink', text: 'Can I get a LucasAid? (20 pts)', cost: 20, do: (s) => { player.boostT = 40; showToast('LUCASAID! SPEED BOOST 40s', 1600); return 'Orange or original? Orange. Off you go.'; } },
  { id: 'sticker', text: 'Any chance of a free sticker?', cost: 0, do: (s) => { if (Math.random() < 0.4) { const got = openPack(false).slice(0, 1); showPack(got); return 'Go on then, just the one. Don\'t tell the others.'; } addScore(10); return 'Free? Cheeky. Here\'s a sweet instead.'; } },
  { id: 'stadium', text: 'How do I get to the Bosco stadium?', cost: 0, do: (s) => { addScore(10); return 'Follow the big floodlights by the college, you can\'t miss it. Follow the map on your pause menu.'; } },
  { id: 'cage', text: 'Where\'s the Cage?', cost: 0, do: (s) => { addScore(10); return 'Edmund Waller school, up on Telegraph Hill. The green mesh fence by the playground.'; } },
  { id: 'hi', text: 'Hi, how are you?', cost: 0, do: (s) => { addScore(10); return ['Not bad, not bad. Knees are going though.', 'Living the dream, mate.', 'Better now the sun\'s out. Say hello to your dad.'][Math.floor(Math.random() * 3)]; } },
  { id: 'score', text: 'Did you see my goal?', cost: 0, do: (s) => { addScore(10); return player.goals > 0 ? `${player.goals} goal${player.goals > 1 ? 's' : ''}? Everyone\'s talking about it.` : 'What goal? Get down the park and score one, then come back.'; } },
  { id: 'cat', text: 'Have you seen the cat?', cost: 0, do: (s) => { addScore(10); return 'The grey one? Sits on my crisps. Belongs to nobody, that cat.'; } },
  { id: 'album', text: 'How many cards am I missing?', cost: 0, do: (s) => { const n = Object.keys(album.have).length; return n >= 15 ? 'None! The full set. Get a frame for it.' : `${15 - n} to go. The Zane card is the hard one.`; } },
];
export function nearestShop() {
  let best = null, bd = 2.6;
  for (const s of shops) { const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function randomOptions() {
  const musts = POOL.filter((o) => o.id === 'cards' || o.id === 'attax'); const first = musts[Math.floor(Math.random() * musts.length)];
  const rest = POOL.filter((o) => o !== first).sort(() => Math.random() - 0.5).slice(0, 2);
  return [first, ...rest].sort(() => Math.random() - 0.5);
}
export function openTalk(shop) {
  if (talk.open) return;
  talk.open = true; talk.shop = shop; talk.options = randomOptions(); shop.visits++;
  playSfx(CFG.sfx.bell, 0.5);
  const el = $('dialog'); el.hidden = false;
  $('dlgName').textContent = `${shop.keeperName} · ${shop.name}`;
  $('dlgText').textContent = GREETS[Math.floor(Math.random() * GREETS.length)].replace('{cam}', 'Cam').replace('{shop}', shop.name);
  const box = $('dlgOptions'); box.innerHTML = '';
  talk.options.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dlgOpt'; b.innerHTML = `<span class="key">${['A', 'B', 'C'][i]}</span>${o.text}`; b.addEventListener('click', () => choose(i)); box.appendChild(b); });
  const bye = document.createElement('button'); bye.type = 'button'; bye.className = 'dlgOpt bye'; bye.innerHTML = '<span class="key">X</span>See you later'; bye.addEventListener('click', closeTalk); box.appendChild(bye);
  shop.keeper.rotation.y = Math.atan2(player.pos.x - shop.keeper.position.x, player.pos.z - shop.keeper.position.z);
  emit('talk', shop.id);
}
export function choose(i) {
  if (!talk.open) return; const o = talk.options[i]; if (!o) return;
  if (o.cost > player.score) { $('dlgText').textContent = `That's ${o.cost} points, you've got ${player.score}. Score some goals and come back.`; synth('click'); return; }
  if (o.cost) addScore(-o.cost);
  const reply = o.do(talk.shop);
  $('dlgText').textContent = reply; $('dlgOptions').innerHTML = ''; const bye = document.createElement('button'); bye.type = 'button'; bye.className = 'dlgOpt bye'; bye.innerHTML = '<span class="key">A</span>Thanks!'; bye.addEventListener('click', closeTalk); $('dlgOptions').appendChild(bye);
  talk.options = [];
  synth('click');
}
export function closeTalk() { if (!talk.open) return; talk.open = false; $('dialog').hidden = true; const pr = $('packReveal'); if (pr) pr.hidden = true; }

let promptEl = null, promptShop = null;
export function updateShops(dt, t) {
  for (const s of shops) { s.ring.rotation.z = t * 0.6; s.ring.material.opacity = 0.55 + Math.sin(t * 3) * 0.2; if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 80) npcUpdate(s.keeper, dt); }
  promptEl = promptEl || $('prompt');
  const s = talk.open ? null : nearestShop();
  if (s !== promptShop) { promptShop = s; if (promptEl) { if (s) { promptEl.innerHTML = `<b>${document.body.classList.contains('pad') ? 'A' : document.body.classList.contains('touch') ? 'A' : 'E'}</b> Talk to ${s.keeperName} · ${s.name}`; promptEl.hidden = false; } else promptEl.hidden = true; } }
  if (player.boostT > 0) player.boostT -= dt;
}
export function interact() { const s = nearestShop(); if (s && !talk.open) { openTalk(s); return true; } return false; }
