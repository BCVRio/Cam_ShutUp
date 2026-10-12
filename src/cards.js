// Collectible cards: the Bosco FC Year 6 squad plus a few Nunhead legends. Album saved on the device.
// Rename the squad here (name, position, number) — the art is drawn from these fields.
import { THREE, $, addScore, showToast, feed, say, synth, emit } from './core.js';

export const SQUAD = [
  { id: 'cam', name: 'Cam', pos: 'ST', num: 9, rating: 91, rarity: 'legendary', face: './public/art/cam_apose_a.png' },
  { id: 'p2', name: 'Alfie', pos: 'GK', num: 1, rating: 84, rarity: 'rare' },
  { id: 'p3', name: 'Theo', pos: 'RB', num: 2, rating: 79, rarity: 'common' },
  { id: 'p4', name: 'Jayden', pos: 'CB', num: 4, rating: 82, rarity: 'rare' },
  { id: 'p5', name: 'Isaac', pos: 'CB', num: 5, rating: 80, rarity: 'common' },
  { id: 'p6', name: 'Oscar', pos: 'LB', num: 3, rating: 78, rarity: 'common' },
  { id: 'p7', name: 'Freddie', pos: 'CM', num: 6, rating: 85, rarity: 'rare' },
  { id: 'p8', name: 'Marcus', pos: 'CM', num: 8, rating: 86, rarity: 'epic' },
  { id: 'p9', name: 'Leo', pos: 'RW', num: 7, rating: 83, rarity: 'rare' },
  { id: 'p10', name: 'Zane', pos: 'LW', num: 11, rating: 88, rarity: 'epic' },
];
export const LEGENDS = [
  { id: 'l1', name: 'The Ref', pos: 'REF', num: 0, rating: 70, rarity: 'rare', team: 'NUNHEAD LEGENDS' },
  { id: 'l2', name: 'Nunhead Cat', pos: 'CAT', num: 13, rating: 99, rarity: 'legendary', team: 'NUNHEAD LEGENDS' },
  { id: 'l3', name: 'Shopkeeper Mo', pos: 'SHOP', num: 24, rating: 75, rarity: 'common', team: 'NUNHEAD LEGENDS' },
  { id: 'l4', name: 'The Keeper', pos: 'GK', num: 1, rating: 81, rarity: 'rare', team: 'NUNHEAD ROVERS' },
  { id: 'l5', name: 'Rovers Captain', pos: 'CM', num: 10, rating: 84, rarity: 'epic', team: 'NUNHEAD ROVERS' },
];
export const ALL_CARDS = [...SQUAD.map((c) => ({ team: 'BOSCO FC · YEAR 6', ...c })), ...LEGENDS];
const RARITY = { common: { w: 60, col: '#8d9199', pts: 100 }, rare: { w: 26, col: '#2b7fe0', pts: 200 }, epic: { w: 10, col: '#9b4fd8', pts: 400 }, legendary: { w: 4, col: '#f2c233', pts: 800 } };

export const album = { have: {}, packs: 0 };
try { Object.assign(album, JSON.parse(localStorage.getItem('cam_album') || '{}')); } catch (_) {}
function save() { try { localStorage.setItem('cam_album', JSON.stringify(album)); } catch (_) {} }
export function cardCount() { return Object.keys(album.have).length; }

function draw(card) {
  const n = ALL_CARDS.find((c) => c.id === card.id) || card;
  const w = 1.5 - (n.rarity === 'legendary' ? 0 : 0);
  let pool = ALL_CARDS; const r = Math.random() * 100; let acc = 0; let rar = 'common';
  for (const [k, v] of Object.entries(RARITY)) { acc += v.w * w; if (r < acc) { rar = k; break; } }
  const cands = pool.filter((c) => c.rarity === rar); return cands[Math.floor(Math.random() * cands.length)] || pool[0];
}
// open a pack: `premium` packs can't roll common cards
export function openPack(premium = false) {
  const got = []; album.packs++;
  for (let i = 0; i < 3; i++) {
    let c; do { c = draw({ id: '' }); } while (premium && c.rarity === 'common');
    const fresh = !album.have[c.id]; album.have[c.id] = (album.have[c.id] || 0) + 1;
    got.push({ ...c, fresh });
    addScore(fresh ? RARITY[c.rarity].pts : 20);
  }
  save();
  const fresh = got.filter((g) => g.fresh);
  if (fresh.length) { say(fresh.some((g) => g.rarity === 'legendary' || g.rarity === 'epic') ? 'ohyeah' : 'yay', true); feed(`New card${fresh.length > 1 ? 's' : ''}: ${fresh.map((g) => g.name).join(', ')}`); } else feed('All duplicates — swap them at school');
  if (cardCount() === ALL_CARDS.length && !album.complete) { album.complete = true; save(); addScore(1000); showToast('ALBUM COMPLETE! +1000', 2500); emit('album'); }
  return got;
}

// --- card art (canvas) ---
const faces = {};
function face(url) { if (!url) return null; if (faces[url]) return faces[url]; const im = new Image(); im.src = url; faces[url] = im; return im; }
export function drawCard(ctx, c, x, y, w, h, owned = true) {
  const col = RARITY[c.rarity].col; const r = w * 0.06;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, owned ? '#1b2f6e' : '#2a2d33'); g.addColorStop(1, owned ? '#0c1838' : '#15171b'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // rarity band + sheen
  ctx.fillStyle = col; ctx.fillRect(0, 0, w, h * 0.055);
  ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.2); ctx.lineTo(w, h * 0.35); ctx.lineTo(0, h * 0.7); ctx.fill(); ctx.globalAlpha = 1;
  // portrait area
  ctx.fillStyle = owned ? '#7fc0ff' : '#3c4049'; ctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.5);
  const im = owned ? face(c.face) : null;
  if (im && im.complete && im.naturalWidth) { const s = Math.min(w * 0.84 / im.naturalWidth, h * 0.5 / (im.naturalHeight * 0.55)); const iw = im.naturalWidth * s, ih = im.naturalHeight * 0.55 * s; ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight * 0.55, w / 2 - iw / 2, h * 0.1, iw, ih); }
  else { // silhouette
    ctx.fillStyle = owned ? '#14275e' : '#23262b'; ctx.beginPath(); ctx.arc(w / 2, h * 0.27, w * 0.13, 0, 7); ctx.fill(); ctx.beginPath(); ctx.roundRect(w * 0.28, h * 0.4, w * 0.44, h * 0.24, w * 0.08); ctx.fill();
    if (owned) { ctx.fillStyle = '#f2c233'; ctx.font = `bold ${Math.round(w * 0.16)}px Oswald, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(String(c.num), w / 2, h * 0.56); }
  }
  // rating + position
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(w * 0.08, h * 0.08, w * 0.24, h * 0.17, r * 0.6); ctx.fill();
  ctx.fillStyle = '#0c1838'; ctx.font = `bold ${Math.round(w * 0.14)}px Oswald, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(owned ? String(c.rating) : '?', w * 0.2, h * 0.19); ctx.font = `bold ${Math.round(w * 0.07)}px Oswald, Impact, sans-serif`; ctx.fillText(c.pos, w * 0.2, h * 0.24);
  // name + team
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(w * 0.12)}px Oswald, Impact, sans-serif`; ctx.fillText(owned ? c.name.toUpperCase() : '? ? ?', w / 2, h * 0.73);
  ctx.fillStyle = col; ctx.font = `bold ${Math.round(w * 0.06)}px Oswald, Impact, sans-serif`; ctx.fillText(c.team || 'BOSCO FC', w / 2, h * 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `${Math.round(w * 0.055)}px Oswald, Impact, sans-serif`; ctx.fillText(c.rarity.toUpperCase() + (owned && album.have[c.id] > 1 ? `  ×${album.have[c.id]}` : ''), w / 2, h * 0.9);
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, w * 0.02); ctx.beginPath(); ctx.roundRect(1, 1, w - 2, h - 2, r); ctx.stroke();
  ctx.restore();
}
export function renderAlbum(container) {
  container.innerHTML = '';
  const head = document.createElement('p'); head.className = 'albumHead'; head.textContent = `${cardCount()} / ${ALL_CARDS.length} cards · ${album.packs} packs opened · buy packs in the shops (look for the glowing doorways)`; container.appendChild(head);
  const cv = document.createElement('canvas'); const cols = 5, cw = 200, ch = 280, gap = 14; cv.width = cols * (cw + gap) + gap; cv.height = Math.ceil(ALL_CARDS.length / cols) * (ch + gap) + gap; cv.className = 'album';
  const ctx = cv.getContext('2d');
  const paint = () => { ctx.clearRect(0, 0, cv.width, cv.height); ALL_CARDS.forEach((c, i) => drawCard(ctx, c, gap + (i % cols) * (cw + gap), gap + Math.floor(i / cols) * (ch + gap), cw, ch, !!album.have[c.id])); };
  paint(); setTimeout(paint, 600);
  container.appendChild(cv);
}
// pack reveal overlay (3 cards)
export function showPack(got) {
  const el = $('packReveal'); if (!el) return; el.hidden = false;
  const cv = el.querySelector('canvas'); const cw = 200, ch = 280, gap = 20; cv.width = got.length * (cw + gap) + gap; cv.height = ch + gap * 2; const ctx = cv.getContext('2d');
  const paint = () => { ctx.clearRect(0, 0, cv.width, cv.height); got.forEach((c, i) => { drawCard(ctx, c, gap + i * (cw + gap), gap, cw, ch, true); if (c.fresh) { ctx.fillStyle = '#f2c233'; ctx.font = 'bold 22px Oswald, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NEW!', gap + i * (cw + gap) + cw / 2, gap + 20); } }); };
  paint(); setTimeout(paint, 600);
  synth('power');
}
