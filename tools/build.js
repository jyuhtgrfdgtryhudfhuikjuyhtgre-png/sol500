#!/usr/bin/env node
// Inlines index.html + src/* into single files:
//   dist/sol500.html   — one self-contained file: double-click to play offline, or put on any web host
//   dist/artifact.html — page body for the shareable Claude artifact link (no <html>/<head>/<body> wrapper)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="src\/style\.css">/, () => '<style>\n' + read('src/style.css') + '\n</style>');
html = html.replace(/<script src="(src\/[a-z0-9-]+\.js)"><\/script>/g, (m, rel) => {
  const code = read(rel);
  if (/<\/script/i.test(code)) throw new Error(rel + ' contains a closing script tag');
  return '<script>\n' + code + '\n</script>';
});
// The single-file builds have no server next to them: no manifest, no service worker, no LAN.
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace('<script>window.SOL_APP = true;</script>', '<script>window.SOL_APP = false;</script>');
if (/src="src\//.test(html) || /href="src\//.test(html)) throw new Error('an asset was not inlined');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'sol500.html'), html);

const artifact = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*$/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
// The title has to be within the first 8 KB for the gallery.
const titled = artifact.replace(/<title>[^<]*<\/title>\s*/, '');
const title = (artifact.match(/<title>[^<]*<\/title>/) || [''])[0];
fs.writeFileSync(path.join(ROOT, 'dist', 'artifact.html'), title + '\n' + titled);

const kb = f => (fs.statSync(path.join(ROOT, 'dist', f)).size / 1024).toFixed(0) + ' KB';
console.log('dist/sol500.html   ' + kb('sol500.html'));
console.log('dist/artifact.html ' + kb('artifact.html'));
