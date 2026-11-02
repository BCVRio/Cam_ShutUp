import { LEVELS } from './world.js';
import { Save, SKINS } from './save.js';
import { Sfx } from './audio.js';
import { asset } from './assets.js';

const $ = (id) => document.getElementById(id);
const SKIN_CSS = { classic: 'radial-gradient(circle at 35% 30%,#fff,#bbb 60%,#333)', bauble: 'radial-gradient(circle at 35% 30%,#ff9a9a,#d62828 60%,#5a0000)', snow: 'radial-gradient(circle at 35% 30%,#fff,#dbe8ff 70%,#9fb3d6)', gold: 'radial-gradient(circle at 35% 30%,#fff3b0,#ffc83d 60%,#8a5a00)', comet: 'radial-gradient(circle at 35% 30%,#fff3b0,#ff8800 50%,#ff2200)' };

export class UI {
  constructor() {
    this.screens = ['s-title', 's-levels', 's-shop', 's-howto', 's-pause', 's-result', 's-win'];
    this._toastT = null; this._tipT = null;
  }
  bind(game) {
    this.game = game;
    const show = (id) => this.show(id);
    $('btn-play').onclick = () => { this.renderLevels(); show('s-levels'); };
    $('btn-shop').onclick = () => { this.renderShop(); show('s-shop'); };
    $('btn-howto').onclick = () => show('s-howto');
    $('btn-levels-back').onclick = () => show('s-title');
    $('btn-shop-back').onclick = () => show('s-title');
    $('btn-howto-back').onclick = () => show('s-title');
    $('btn-pause').onclick = () => { game.pause(true); show('s-pause'); };
    $('btn-resume').onclick = () => { this.show(null); game.pause(false); };
    $('btn-quit').onclick = () => { game.pause(false); game.quit(); this.hud(false); show('s-title'); };
    $('btn-retry').onclick = () => { this.show(null); this.hud(true); game.startLevel(game.levelIndex); };
    $('btn-next').onclick = () => {
      const n = game.levelIndex + 1;
      if (n >= LEVELS.length) { game.quit(); this.hud(false); show('s-win'); Sfx.win(); return; }
      this.show(null); this.hud(true); game.startLevel(n);
    };
    $('btn-result-menu').onclick = () => { game.quit(); this.hud(false); show('s-title'); };
    $('btn-win-menu').onclick = () => show('s-title');
  }
  show(id) {
    for (const s of this.screens) $(s).classList.toggle('hidden', s !== id);
    $('screens').style.pointerEvents = id ? 'auto' : 'none';
  }
  hud(on) { $('hud').classList.toggle('hidden', !on); }
  setLevel(i) { $('hud-level').textContent = `${i + 1} · ${LEVELS[i].name}`; }
  lives(n) { $('hud-lives').textContent = '⚽'.repeat(Math.max(0, n)) + '✖'.repeat(Math.max(0, 3 - n)); }
  coins(n) { $('hud-coins').textContent = `🪙 ${n}`; }
  time(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); $('hud-time').textContent = `${m}:${s.toString().padStart(2, '0')}`; }
  heat(v, comet) { $('heat-fill').style.width = v + '%'; const h = $('heat-label').parentElement; h.classList.toggle('comet', comet); $('heat-label').textContent = comet ? '🔥 FLAMING COMET' : 'HEAT'; }
  cool(id, on) { $(id).classList.toggle('cool', on); }
  toast(txt, ms) { const t = $('toast'); t.textContent = txt; t.classList.add('show'); clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), ms); }
  tip(txt, ms) { const t = $('tip'); t.textContent = txt; clearTimeout(this._tipT); if (ms) this._tipT = setTimeout(() => { t.textContent = ''; }, ms); }
  shootMode(on) { $('shoot-ui').classList.toggle('hidden', !on); $('joystick').style.display = on ? 'none' : ''; $('buttons').style.display = on ? 'none' : ''; }
  renderLevels() {
    const list = $('level-list'); list.innerHTML = ''; const s = Save.get();
    LEVELS.forEach((lv, i) => {
      const unlocked = Save.isUnlocked(i);
      const card = document.createElement('div'); card.className = 'card' + (unlocked ? '' : ' locked');
      card.innerHTML = `<img src="${asset(`assets/img/${lv.img}.jpg`)}" alt=""><div><div class="ttl">${i + 1}. ${lv.name}</div><div class="sub">${lv.stadium} · ${lv.defenders} defenders</div></div><div class="stars">${'★'.repeat(s.stars[i] || 0)}${'☆'.repeat(3 - (s.stars[i] || 0))}</div>`;
      if (unlocked) card.onclick = () => { this.show(null); this.hud(true); this.game.startLevel(i); };
      else card.onclick = () => this.toast('Score in the previous stadium first!', 1200);
      list.appendChild(card);
    });
  }
  renderShop() {
    const list = $('skin-list'); list.innerHTML = ''; const s = Save.get();
    $('shop-coins').textContent = `🪙 ${s.coins}`;
    SKINS.forEach((sk) => {
      const owned = s.owned.includes(sk.id), sel = s.skin === sk.id;
      const card = document.createElement('div'); card.className = 'card' + (sel ? ' selected' : '');
      card.innerHTML = `<div class="swatch" style="background:${SKIN_CSS[sk.id]}"></div><div><div class="ttl">${sk.name}</div><div class="sub">${sk.desc}</div></div><div class="stars" style="font-size:14px">${owned ? (sel ? 'EQUIPPED' : 'OWNED') : '🪙 ' + sk.price}</div>`;
      card.onclick = () => {
        if (owned) { Save.select(sk.id); Sfx.coin(); }
        else if (Save.buy(sk.id)) { Sfx.star(); this.toast('Bought ' + sk.name + '!', 1000); }
        else { Sfx.tick(); this.toast('Not enough coins yet!', 1000); }
        this.renderShop();
      };
      list.appendChild(card);
    });
  }
  showResult(won, game) {
    this.hud(false);
    const r = game.result || { stars: 0, coins: game.coins, time: game.time, tricks: game.tricks };
    $('result-title').textContent = won ? '⚽ GOAL!' : '😵 SANTA STAYS CAPTURED';
    $('result-stars').textContent = won ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '☆☆☆';
    const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60);
    const lv = LEVELS[game.levelIndex];
    $('result-lines').innerHTML = won
      ? `<div>⭐ Scored at ${lv.stadium}</div><div>${game.livesLost === 0 ? '⭐ No lives lost' : '☆ Lost ' + game.livesLost + ' life'}</div><div>${r.tricks >= lv.tricksFor3 ? '⭐' : '☆'} Tricks ${r.tricks} / ${lv.tricksFor3}</div><div>🪙 +${r.coins} coins · ⏱ ${m}:${s.toString().padStart(2, '0')}</div>`
      : `<div>The elves kept the ball. Try again, Cam!</div><div>🪙 ${game.coins} coins banked</div>`;
    if (!won) Save.addCoins(game.coins);
    $('btn-next').classList.toggle('hidden', !won);
    $('btn-next').textContent = game.levelIndex + 1 >= LEVELS.length ? 'WIN CHRISTMAS' : 'NEXT STADIUM';
    this.show('s-result');
  }
}
