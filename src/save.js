// Persistent progress: coins, stars per level, unlocked skins.
const KEY = 'camXmasSoccerRush.v1';

export const SKINS = [
  { id: 'classic', name: 'Classic Leather', price: 0,   desc: 'The Nunhead park ball.' },
  { id: 'bauble',  name: 'Red Bauble',      price: 150, desc: 'Glossy. Jingles when you dribble (not really).' },
  { id: 'snow',    name: 'Snowball',        price: 250, desc: 'Cold hands, warm heart.' },
  { id: 'gold',    name: 'Golden Boot Ball', price: 400, desc: 'Shiny, like a trophy.' },
  { id: 'comet',   name: 'Eternal Comet',   price: 800, desc: 'Always on fire. Heat fades 50% slower.' },
];

const defaults = () => ({ coins: 0, stars: [0, 0, 0, 0, 0], owned: ['classic'], skin: 'classic', best: [0, 0, 0, 0, 0] });

let state = null;
function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch (e) { state = defaults(); }
  return state;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode etc. */ }
}

export const Save = {
  get() { return load(); },
  addCoins(n) { load().coins = Math.max(0, load().coins + n); persist(); },
  setStars(level, n) { const s = load(); s.stars[level] = Math.max(s.stars[level] || 0, n); persist(); },
  isUnlocked(level) { const s = load(); return level === 0 || (s.stars[level - 1] || 0) > 0; },
  buy(id) {
    const s = load(); const sk = SKINS.find(k => k.id === id);
    if (!sk || s.owned.includes(id) || s.coins < sk.price) return false;
    s.coins -= sk.price; s.owned.push(id); s.skin = id; persist(); return true;
  },
  select(id) { const s = load(); if (s.owned.includes(id)) { s.skin = id; persist(); } },
  reset() { state = defaults(); persist(); },
};
