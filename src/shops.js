// Shops: ten real shops from the map get a shopkeeper at the door, a beacon you can see from streets away, a doorway
// that opens the counter when you step in, and a counter screen where you buy packs, swap duplicates and have a chat.
import { THREE, CFG, scene, MAT, player, $, addScore, showToast, feed, playSfx, say, synth, emit } from './core.js';
import { world, groundAt, terrainHeight, addCircle } from './map.js';
import { makeNpc, npcUpdate } from './npc.js';
import { openPack, showPack, album, ALL_CARDS, duplicates, missing, swapRandom, swapFor, cardCount, drawCard } from './cards.js';

export const shops = [];
export const talk = { open: false, shop: null, tab: 'buy', options: [], lock: 0, left: true };
const KEEPER_NAMES = ['Mo', 'Dev', 'Ayesha', 'Tony', 'Grace', 'Kwame', 'Sam', 'Lena', 'Raj', 'Bea', 'Yusuf', 'Pat'];
const NICE = ['convenience', 'newsagent', 'supermarket', 'bakery', 'greengrocer', 'kiosk', 'butcher', 'seafood', 'deli', 'toys', 'books', 'sports', 'gift', 'cafe'];

function nearestRoad(d, x, z) {
  let best = 1e9, px = x, pz = z;
  for (const r of d.roads) { if (r.w < 4) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const cx = ax + dx * t, cz = az + dz * t; const dd = Math.hypot(x - cx, z - cz); if (dd < best) { best = dd; px = cx; pz = cz; } } }
  return { px, pz, dist: best };
}
function iconTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#14275e'; g.beginPath(); g.roundRect(8, 8, 112, 112, 22); g.fill(); g.strokeStyle = '#f2c233'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#f2c233'; g.font = 'bold 72px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S', 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let iconTex = null;
export function buildShops() {
  const d = world.data;
  const cands = d.pois.filter((p) => p.n && (p.k.startsWith('shop:') || p.k === 'cafe')).map((p) => { const kind = p.k.replace('shop:', ''); return { ...p, kind, score: (NICE.includes(kind) ? 2 : 0) + (p.k.startsWith('shop:convenience') ? 2 : 0) + Math.random() }; });
  cands.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of cands) { if (picked.length >= 10) break; if (picked.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 60)) continue; picked.push(c); }
  iconTex = iconTex || iconTexture();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xf2c233, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  picked.forEach((p, i) => {
    const road = nearestRoad(d, p.x, p.z); const ang = Math.atan2(road.px - p.x, road.pz - p.z);   // toward the road
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const out = Math.max(1.5, Math.min(road.dist - 2.2, 3.5));
    const x = p.x + dx * out, z = p.z + dz * out;   // the doorway, pavement side
    const y = terrainHeight(x, z);
    const keeper = makeNpc('shopkeeper'); keeper.position.set(x + dx * 0.4 - dz * 1.1, groundAt(x, z).y, z + dz * 0.4 + dx * 1.1); keeper.rotation.y = ang; scene.add(keeper);
    // doorway: a gold mat on the pavement you walk onto
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xf2c233, transparent: true, opacity: 0.55, depthWrite: false })); mat.rotation.x = -Math.PI / 2; mat.rotation.z = -ang; mat.position.set(x + dx * 1.3, y + 0.03, z + dz * 1.3); scene.add(mat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(mat.position); ring.position.y += 0.01; scene.add(ring);
    // beacon: a tall soft beam of gold light and a floating shop icon, visible from streets away
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 60, 12, 1, true), beamMat); beam.position.set(x, y + 30, z); scene.add(beam);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex, transparent: true, depthTest: false })); icon.scale.set(2.6, 2.6, 1); icon.position.set(x, y + 6.5, z); icon.renderOrder = 5; scene.add(icon);
    const halo = new THREE.Sprite(MAT.glowSprite); halo.scale.set(4, 3, 1); halo.position.set(x, y + 2.8, z); scene.add(halo);
    // name board + awning over the door
    const sign = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#14275e'; g.fillRect(0, 0, 1024, 160); g.fillStyle = '#f2c233'; g.fillRect(0, 0, 1024, 10); g.fillRect(0, 150, 1024, 10); g.font = 'bold 86px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; let s = 86; while (g.measureText(p.n.toUpperCase()).width > 960 && s > 30) { s -= 4; g.font = `bold ${s}px Oswald, Impact, sans-serif`; } g.fillText(p.n.toUpperCase(), 512, 80); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return new THREE.Mesh(new THREE.PlaneGeometry(5, 0.8), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0x222222, emissiveMap: t, emissiveIntensity: 0.3 })); })();
    sign.position.set(p.x + dx * 0.6, y + 3.3, p.z + dz * 0.6); sign.rotation.y = ang; scene.add(sign);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 1.4), i % 2 ? MAT.red : MAT.navy); awn.position.set(p.x + dx * 1.2, y + 2.85, p.z + dz * 1.2); awn.rotation.y = ang; awn.rotation.x = 0.18; awn.castShadow = true; scene.add(awn);
    const shop = { id: 'shop' + i, name: p.n, kind: p.kind, x: mat.position.x, z: mat.position.z, doorX: x, doorZ: z, keeper, keeperName: KEEPER_NAMES[i % KEEPER_NAMES.length], ring, icon, visits: 0 };
    addCircle(keeper.position.x, keeper.position.z, 0.35, 1.8);
    shops.push(shop); world.signs.push({ x, z, n: p.n, k: 'shop' });
  });
  world.shops = shops;
}

// ---------------------------------------------------------------------------
// The counter screen
// ---------------------------------------------------------------------------
const GREETS = ['Alright Cam, what can I get you?', 'Hello mate! Haven\'t seen you since the match.', 'Welcome to {shop}. Busy day?', 'Ah, Bosco\'s number nine! What\'ll it be?', 'Hiya. Mind the step, it\'s been like that for years.'];
const CHAT = [
  { text: 'Hi, how are you?', do: () => { addScore(10); return ['Not bad, not bad. Knees are going though.', 'Living the dream, mate.', 'Better now the sun\'s out. Say hello to your dad.'][Math.floor(Math.random() * 3)]; } },
  { text: 'How do I get to the Bosco stadium?', do: () => { addScore(10); return 'Follow the big floodlights by the college. It\'s on the map in your pause menu too.'; } },
  { text: 'Where\'s the Cage?', do: () => { addScore(10); return 'Edmund Waller school, up on Telegraph Hill. The green mesh fence by the playground.'; } },
  { text: 'Did you see my goal?', do: () => { addScore(10); return player.goals > 0 ? `${player.goals} goal${player.goals > 1 ? 's' : ''}? Everyone\'s talking about it.` : 'What goal? Get down the park and score one, then come back.'; } },
  { text: 'Have you seen the cat?', do: () => { addScore(10); return 'The grey one? Sits on my crisps. Belongs to nobody, that cat.'; } },
  { text: 'Any chance of a free sticker?', do: () => { if (Math.random() < 0.4) { showPack(openPack(false).slice(0, 1)); return 'Go on then, just the one. Don\'t tell the others.'; } addScore(10); return 'Free? Cheeky. Here\'s a sweet instead.'; } },
  { text: 'How many cards am I missing?', do: () => { const n = ALL_CARDS.length - cardCount(); return n === 0 ? 'None! The full set. Get a frame for it.' : `${n} to go. The Zane card is the hard one.`; } },
];
const BUY = [
  { id: 'cards', name: 'Top Cards pack', desc: '3 cards, any rarity', cost: 50, img: './public/art/pack_cards.jpg', do: () => { showPack(openPack(false)); return 'Here you go. Don\'t open them all at once.'; } },
  { id: 'attax', name: 'Match Attax pack', desc: '3 cards, no commons', cost: 120, img: './public/art/pack_attax.jpg', do: () => { showPack(openPack(true)); return 'Top shelf, these. Shiny ones only.'; } },
  { id: 'drink', name: 'LucasAid', desc: 'Speed boost, 40 seconds', cost: 20, img: './public/art/drink.jpg', do: () => { player.boostT = 40; showToast('LUCASAID! SPEED BOOST 40s', 1600); return 'Orange or original? Orange. Off you go.'; } },
];
export function nearestShop(r = 2.6) {
  let best = null, bd = r;
  for (const s of shops) { const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
export function nearestShopAny() { let best = null, bd = 1e9; for (const s of shops) { const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z); if (d < bd) { bd = d; best = s; } } return best ? { shop: best, dist: bd } : null; }

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
export function openTalk(shop) {
  if (talk.open) return;
  talk.open = true; talk.shop = shop; talk.tab = 'buy'; shop.visits++;
  playSfx(CFG.sfx.bell, 0.5);
  const dlg = $('dialog'); dlg.hidden = false; dlg.classList.add('shop');
  $('dlgName').innerHTML = `<img class="keeperFace" src="./public/art/npc_shop.jpg" alt=""><span>${shop.keeperName} · ${shop.name}</span><span class="pts">${player.score} pts</span>`;
  $('dlgText').textContent = GREETS[Math.floor(Math.random() * GREETS.length)].replace('{shop}', shop.name);
  renderTab();
  shop.keeper.rotation.y = Math.atan2(player.pos.x - shop.keeper.position.x, player.pos.z - shop.keeper.position.z);
  emit('talk', shop.id);
}
function renderTab() {
  const box = $('dlgOptions'); box.innerHTML = ''; talk.options = [];
  const tabs = el('div', 'stabs');
  for (const [id, label] of [['buy', 'BUY'], ['swap', 'SWAP CARDS'], ['chat', 'CHAT']]) { const b = el('button', 'stab' + (talk.tab === id ? ' on' : ''), label); b.type = 'button'; b.dataset.stab = id; b.addEventListener('click', () => { talk.tab = id; synth('click'); renderTab(); }); tabs.appendChild(b); }
  box.appendChild(tabs);
  const opt = (html, fn, cls = '') => { const b = el('button', 'dlgOpt ' + cls, html); b.type = 'button'; b.addEventListener('click', fn); box.appendChild(b); talk.options.push(fn); return b; };
  const key = (i) => `<span class="key">${i + 1}</span>`;
  if (talk.tab === 'buy') {
    BUY.forEach((it, i) => opt(`${key(i)}<img class="itemImg" src="${it.img}" alt=""><span class="itemName">${it.name}<small>${it.desc}</small></span><span class="price">${it.cost} pts</span>`, () => buy(it), 'item'));
  } else if (talk.tab === 'swap') {
    const dup = duplicates(); const extra = dup.reduce((s, q) => s + q.extra, 0); const miss = missing();
    box.appendChild(el('p', 'swapInfo', `You have <b>${extra}</b> spare card${extra === 1 ? '' : 's'} to swap and <b>${miss.length}</b> missing.` + (extra ? ` Spares: ${dup.map((q) => `${q.card.name} ×${q.extra}`).join(', ')}` : '')));
    let i = 0;
    opt(`${key(i++)}Swap 2 spares for a random card you don't have`, () => { if (extra < 2) return reply('You need two spares for that, mate.'); if (!miss.length) return reply('You\'ve got the lot already!'); const c = swapRandom(2); showPack([{ ...c, fresh: true }]); reply(`Done. ${c.name} for your spares. Lovely.`); });
    opt(`${key(i++)}Swap 3 spares for a card you choose`, () => { if (extra < 3) return reply('Three spares for a pick. Come back when you\'ve got more.'); if (!miss.length) return reply('Nothing left to pick, you\'ve got them all!'); pickCard(miss); });
    opt(`${key(i++)}Sell a spare for 15 pts`, () => { if (extra < 1) return reply('No spares to sell. Open some packs first.'); const q = dup[0]; album.have[q.card.id]--; addScore(15); saveAlbumSafe(); reply(`Sold your spare ${q.card.name} for 15 points.`); renderHeader(); });
  } else {
    const picks = CHAT.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    picks.forEach((c, i) => opt(`${key(i)}${c.text}`, () => reply(c.do())));
  }
  const bye = opt('<span class="key x">X</span>See you later', closeTalk, 'bye');
}
function saveAlbumSafe() { try { localStorage.setItem('cam_album', JSON.stringify(album)); } catch (_) {} }
function renderHeader() { const p = $('dlgName').querySelector('.pts'); if (p) p.textContent = `${player.score} pts`; }
function buy(it) {
  if (it.cost > player.score) { reply(`That's ${it.cost} points, you've got ${player.score}. Score some goals and come back.`); synth('click'); return; }
  addScore(-it.cost); renderHeader(); const r = it.do(); reply(r); synth('power');
}
function pickCard(miss) {
  const box = $('dlgOptions'); box.innerHTML = ''; talk.options = [];
  box.appendChild(el('p', 'swapInfo', 'Pick the card you want for your three spares:'));
  const grid = el('div', 'pickGrid');
  miss.forEach((c, i) => {
    const b = el('button', 'pickCard'); b.type = 'button'; const cv = document.createElement('canvas'); cv.width = 120; cv.height = 168; drawCard(cv.getContext('2d'), c, 0, 0, 120, 168, true); b.appendChild(cv); b.appendChild(el('span', '', `<span class="key">${i + 1}</span>${c.name}`));
    const fn = () => { const got = swapFor(c.id, 3); if (got) { showPack([{ ...got, fresh: true }]); reply(`${got.name}, yours. Three spares in the tin, thank you.`); } else reply('That didn\'t work. Try again.'); };
    b.addEventListener('click', fn); talk.options.push(fn); grid.appendChild(b);
  });
  box.appendChild(grid);
  const back = el('button', 'dlgOpt bye', '<span class="key x">X</span>Back'); back.type = 'button'; back.addEventListener('click', renderTab); box.appendChild(back);
}
function reply(text) {
  $('dlgText').textContent = text; renderHeader();
  const box = $('dlgOptions'); box.innerHTML = ''; talk.options = [];
  const again = el('button', 'dlgOpt', '<span class="key">1</span>Anything else?'); again.type = 'button'; again.addEventListener('click', () => { $('dlgText').textContent = 'What else?'; renderTab(); }); box.appendChild(again); talk.options.push(() => again.click());
  const bye = el('button', 'dlgOpt bye', '<span class="key x">X</span>Thanks, bye'); bye.type = 'button'; bye.addEventListener('click', closeTalk); box.appendChild(bye);
  synth('click');
}
export function choose(i) { if (!talk.open) return; const fn = talk.options[i]; if (fn) fn(); }
export function nextTab(dir = 1) { if (!talk.open) return; const order = ['buy', 'swap', 'chat']; talk.tab = order[(order.indexOf(talk.tab) + dir + 3) % 3]; synth('click'); renderTab(); }
export function closeTalk() { if (!talk.open) return; talk.open = false; talk.lock = 1.0; const dlg = $('dialog'); dlg.hidden = true; dlg.classList.remove('shop'); const pr = $('packReveal'); if (pr) pr.hidden = true; }

// ---------------------------------------------------------------------------
// Per frame: doorway auto-open, prompt, compass to the nearest shop
// ---------------------------------------------------------------------------
let promptEl = null, promptShop = null, compassEl = null;
export function updateShops(dt, t) {
  for (const s of shops) { s.ring.rotation.z = t * 0.6; s.ring.material.opacity = 0.45 + Math.sin(t * 3) * 0.2; s.icon.position.y += Math.sin(t * 2) * 0.004; if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 80) npcUpdate(s.keeper, dt); }
  if (talk.lock > 0) talk.lock -= dt;
  if (player.boostT > 0) player.boostT -= dt;
  promptEl = promptEl || $('prompt'); compassEl = compassEl || $('compass');
  const s = talk.open ? null : nearestShop();
  // step onto the mat and the counter opens on its own
  if (!s || Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 2.2) talk.left = true;   // you have to step off the mat and back on for it to open again
  if (s && !talk.open && talk.lock <= 0 && talk.left && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 1.25) { talk.left = false; openTalk(s); return; }
  if (s !== promptShop) { promptShop = s; if (promptEl) { if (s) { promptEl.innerHTML = `<b>${document.body.classList.contains('pad') || document.body.classList.contains('touch') ? 'A' : 'E'}</b> Go into ${s.name}`; promptEl.hidden = false; } else promptEl.hidden = true; } }
  // compass: nearest shop, with distance, hidden while a match is on
  if (compassEl) {
    const n = nearestShopAny();
    const matchOn = document.getElementById('matchHud') && !document.getElementById('matchHud').hidden;
    if (n && !talk.open && !matchOn) {
      const dx = n.shop.x - player.pos.x, dz = n.shop.z - player.pos.z; const bearing = Math.atan2(dx, dz);
      const camYaw = (window.__cam && window.__cam.cam) ? window.__cam.cam.yaw : player.yaw;
      const rel = bearing - (camYaw + Math.PI);
      compassEl.hidden = false; compassEl.innerHTML = `<i style="transform:rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)">➤</i> ${n.shop.name} · ${Math.round(n.dist)} m`;
    } else compassEl.hidden = true;
  }
}
export function interact() { const s = nearestShop(3.2); if (s && !talk.open) { openTalk(s); return true; } return false; }
