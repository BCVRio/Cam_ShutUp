// Tiny WebAudio synth: no audio files needed, works offline.
import { asset } from './assets.js';
let ctx = null, master = null, crowdGain = null, started = false;
const samples = {}; let crowdSrc = null;
const SAMPLE_FILES = { crowd: 'assets/audio/crowd_loop.mp3', roar: 'assets/audio/goal_roar.mp3', whistle: 'assets/audio/whistle.mp3', bells: 'assets/audio/bells.mp3' };
async function loadSamples() {
  const c = ensure(); if (!c) return;
  await Promise.all(Object.entries(SAMPLE_FILES).map(async ([k, url]) => {
    try { const r = await fetch(asset(url)); const b = await r.arrayBuffer(); samples[k] = await c.decodeAudioData(b); } catch (e) { /* synth fallback */ }
  }));
  if (samples.crowd && crowdGain) {
    crowdSrc = c.createBufferSource(); crowdSrc.buffer = samples.crowd; crowdSrc.loop = true; crowdSrc.connect(crowdGain); crowdSrc.start();
  }
}
function play(name, vol = 0.8, rate = 1) {
  const c = ensure(); if (!c || !samples[name]) return false;
  const s = c.createBufferSource(); s.buffer = samples[name]; s.playbackRate.value = rate;
  const g = c.createGain(); g.gain.value = vol; s.connect(g); g.connect(master); s.start(); return true;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
  return ctx;
}
export function unlockAudio() {
  const c = ensure(); if (!c) return;
  if (c.state === 'suspended') c.resume();
  if (!started) { started = true; startCrowd(); loadSamples(); }
}
function env(gain, t0, a, d, peak = 1) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function tone(freq, type, a, d, peak = 0.3, t0 = 0, slideTo = null) {
  const c = ensure(); if (!c) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + t0 + a + d);
  env(g, c.currentTime + t0, a, d, peak);
  o.connect(g); g.connect(master); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + a + d + 0.05);
}
function noise(dur, peak = 0.3, filterHz = 1200, t0 = 0, type = 'lowpass') {
  const c = ensure(); if (!c) return;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterHz;
  const g = c.createGain(); env(g, c.currentTime + t0, 0.01, dur, peak);
  s.connect(f); f.connect(g); g.connect(master); s.start(c.currentTime + t0);
}
function startCrowd() {
  const c = ensure(); if (!c) return;
  const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const d = buf.getChannelData(0); let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + (Math.random() * 2 - 1) * 0.02); last *= 0.98; d[i] = last * 8; }
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.5;
  crowdGain = c.createGain(); crowdGain.gain.value = 0.0;
  const synthGain = c.createGain(); synthGain.gain.value = 0.5;
  s.connect(f); f.connect(synthGain); synthGain.connect(crowdGain); crowdGain.connect(master); s.start();
  // once the real crowd sample is in, fade the synth bed out
  const check = setInterval(() => { if (crowdSrc) { synthGain.gain.linearRampToValueAtTime(0, c.currentTime + 1); clearInterval(check); } }, 500);
}
export const Sfx = {
  crowd(level) { if (crowdGain) crowdGain.gain.linearRampToValueAtTime(level, ensure().currentTime + 0.5); },
  whistle() { if (play('whistle', 0.7)) return; tone(2200, 'square', 0.02, 0.35, 0.15); tone(2600, 'square', 0.02, 0.35, 0.1, 0.03); },
  kick() { noise(0.12, 0.5, 400); tone(90, 'sine', 0.005, 0.12, 0.5, 0, 40); },
  touch() { noise(0.05, 0.12, 600); },
  coin() { tone(1320, 'square', 0.005, 0.08, 0.12); tone(1760, 'square', 0.005, 0.15, 0.12, 0.07); },
  star() { [880, 1108, 1320, 1760].forEach((f, i) => tone(f, 'triangle', 0.01, 0.25, 0.2, i * 0.08)); },
  trick() { tone(600, 'sawtooth', 0.01, 0.15, 0.15, 0, 1200); noise(0.15, 0.15, 3000, 0, 'highpass'); },
  nutmeg() { tone(500, 'triangle', 0.01, 0.1, 0.2); tone(1000, 'triangle', 0.01, 0.2, 0.2, 0.1); noise(0.2, 0.2, 2500, 0, 'highpass'); },
  pass() { noise(0.1, 0.3, 700); tone(300, 'sine', 0.005, 0.1, 0.3, 0, 200); },
  tackle() { noise(0.25, 0.6, 250); tone(70, 'sine', 0.005, 0.3, 0.6, 0, 30); tone(180, 'sawtooth', 0.01, 0.3, 0.15, 0, 60); },
  ignite() { noise(0.6, 0.5, 900, 0, 'bandpass'); tone(200, 'sawtooth', 0.05, 0.5, 0.2, 0, 900); },
  ko() { noise(0.3, 0.5, 300); tone(400, 'square', 0.01, 0.3, 0.15, 0, 100); },
  goal() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 'square', 0.01, 0.4, 0.18, i * 0.1)); tone(1046, 'square', 0.01, 0.8, 0.2, 0.45); if (!play('roar', 0.9)) noise(1.5, 0.35, 900, 0.2, 'bandpass'); play('bells', 0.5); },
  save() { tone(220, 'sawtooth', 0.01, 0.4, 0.25, 0, 110); noise(0.3, 0.3, 500, 0); },
  lose() { [440, 415, 392, 370].forEach((f, i) => tone(f, 'triangle', 0.01, 0.3, 0.2, i * 0.18)); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 'triangle', 0.01, 0.35, 0.2, i * 0.14)); play('roar', 0.8); play('bells', 0.8); },
  bells() { if (play('bells', 0.8)) return; [784, 784, 784, 784, 784, 784, 784, 988, 523, 587, 784].forEach((f, i) => tone(f, 'triangle', 0.005, 0.25, 0.12, i * 0.18)); },
  tick() { tone(1500, 'square', 0.002, 0.03, 0.06); },
};
