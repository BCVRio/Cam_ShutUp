// Minimal offline cache so the game works as an installed PWA.
const CACHE = 'xmas-rush-v1';
const CORE = ['./', './index.html', './styles.css', './manifest.webmanifest', './src/main.js', './src/game.js', './src/world.js', './src/characters.js', './src/input.js', './src/ui.js', './src/audio.js', './src/save.js', './vendor/three.module.js', './vendor/jsm/loaders/GLTFLoader.js', './vendor/jsm/utils/BufferGeometryUtils.js', './assets/audio/crowd_loop.mp3', './assets/audio/goal_roar.mp3', './assets/audio/whistle.mp3', './assets/audio/bells.mp3'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); });
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => r)));
});
