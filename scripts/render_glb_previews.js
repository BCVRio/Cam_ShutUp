// Headless GLB preview renderer (needs Node + Playwright with Chromium):
//   node scripts/render_glb_previews.js assets/previews/sheet.png assets/models/*.glb
// Renders each model from a 3/4 angle into a contact sheet using three.js in headless Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [out, ...files] = process.argv.slice(2);
  const models = files.map((f) => ({
    name: path.basename(f, '.glb'),
    b64: fs.readFileSync(f).toString('base64'),
  }));
  const cols = Math.min(4, models.length);
  const rows = Math.ceil(models.length / cols);
  const cell = 360;

  const html = `<!doctype html><html><body style="margin:0;background:#dde">
<canvas id="c" width="${cols * cell}" height="${rows * cell}"></canvas>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const models = ${JSON.stringify(models)};
const cell = ${cell}, cols = ${cols};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const loader = new GLTFLoader();
function load(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  return new Promise((res, rej) => loader.parse(bin, '', res, rej));
}
for (let i = 0; i < models.length; i++) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdddde8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffeedd, 0.8); fill.position.set(-4, 2, -3); scene.add(fill);
  let ok = true;
  try {
    const gltf = await load(models[i].b64);
    const obj = gltf.scene;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    obj.scale.setScalar(2 / maxDim);
    scene.add(obj);
  } catch (e) { ok = false; console.log('ERR ' + models[i].name + ': ' + e); }
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  cam.position.set(2.4, 1.8, 2.8); cam.lookAt(0, 0, 0);
  const x = (i % cols) * cell, y = (rows(i)) ;
  function rows(i){ return Math.floor(i / cols) * cell; }
  const yy = canvas.height - cell - rows(i);
  renderer.setViewport(x, yy, cell, cell); renderer.setScissor(x, yy, cell, cell);
  renderer.render(scene, cam);
  console.log((ok ? 'OK ' : 'FAIL ') + models[i].name);
}
window.__done = true;
</script></body></html>`;

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: cols * cell, height: rows * cell } });
  page.on('console', (m) => console.log(m.text()));
  await page.setContent(html);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  // label cells
  await page.evaluate(({ models, cols, cell }) => {
    models.forEach((m, i) => {
      const d = document.createElement('div');
      d.textContent = m.name;
      Object.assign(d.style, { position: 'absolute', left: (i % cols) * cell + 8 + 'px', top: Math.floor(i / cols) * cell + 6 + 'px', font: 'bold 18px sans-serif', color: '#223' });
      document.body.appendChild(d);
    });
  }, { models, cols, cell });
  await page.screenshot({ path: out });
  await browser.close();
})();
