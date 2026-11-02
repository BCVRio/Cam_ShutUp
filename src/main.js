import * as THREE from '../vendor/three.module.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { unlockAudio, Sfx } from './audio.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const input = new Input();
const ui = new UI();
const game = new Game(renderer, input, ui);
ui.bind(game);
window.__game = game; // for debugging / automated tests

game.ready.then(() => { document.getElementById('loadnote').textContent = game.cam.model.procedural ? 'Ready (simple avatars)' : 'Ready'; });

const unlock = () => { unlockAudio(); Sfx.crowd(0.03); };
window.addEventListener('touchstart', unlock, { once: true, passive: true });
window.addEventListener('mousedown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });
document.getElementById('btn-play').addEventListener('click', () => Sfx.bells(), { once: true });

function loop() { requestAnimationFrame(loop); game.update(); }
loop();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
