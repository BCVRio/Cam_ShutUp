// Builds two distributables from the source tree:
//   dist/cam-xmas-rush.html   one self-contained file (JS, CSS and every asset inlined as data URIs)
//   dist/artifact.html        page body with inlined JS/CSS, assets referenced relatively (for claude.ai Artifacts)
// Usage: node tools/build.mjs   (needs esbuild: npm i esbuild)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' };

const r = await build({ entryPoints: [join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', write: false, target: ['es2020'], legalComments: 'none' });
let js = r.outputFiles[0].text;
js = js.replace(/if\s*\(\s*["']serviceWorker["']\s*in\s*navigator[^;]*;/, ''); // no SW in single-file / artifact builds
const css = readFileSync(join(root, 'styles.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).replace(/<script type="module" src="src\/main.js"><\/script>/, '');

function walk(dir, out = []) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; }
const assets = {};
for (const p of walk(join(root, 'assets'))) {
  const ext = extname(p); if (!MIME[ext]) continue;
  const rel = relative(root, p);
  if (rel.includes('icon-')) continue;
  assets[rel] = `data:${MIME[ext]};base64,${readFileSync(p).toString('base64')}`;
}
mkdirSync(join(root, 'dist'), { recursive: true });

// 1) single file
let single = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Cam's Xmas Soccer Rush</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0b1a33">\n<style>${css}</style>\n</head>\n<body>\n${body}\n<script>window.__ASSETS=${JSON.stringify(assets)};</script>\n<script>${js}</script>\n</body>\n</html>\n`;
single = single.replace(/src="(assets\/[^"]+)"/g, (m, p) => assets[p] ? `src="${assets[p]}"` : m);
writeFileSync(join(root, 'dist/cam-xmas-rush.html'), single);

// 2) artifact page (no doctype/html/head/body; assets relative)
const models = Object.fromEntries(Object.entries(assets).filter(([k]) => k.endsWith('.glb')));
const artifact = `<title>Cam's Xmas Soccer Rush</title>\n<style>:root{color-scheme:dark}html,body{height:100%}${css}</style>\n${body}\n<script>window.__ASSETS=${JSON.stringify(models)};</script>\n<script>${js}</script>\n`;
writeFileSync(join(root, 'dist/artifact.html'), artifact);
console.log('bundle js', (js.length / 1024).toFixed(0), 'KB; single', (single.length / 1024 / 1024).toFixed(2), 'MB; artifact', (artifact.length / 1024).toFixed(0), 'KB');
