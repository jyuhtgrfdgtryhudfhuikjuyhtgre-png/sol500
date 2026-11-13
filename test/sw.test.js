'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs sw.js in a sandbox (offline-ish: fetch answers "not ok", the cache is empty) and returns its fetch handler.
function swFetchHandler() {
  const handlers = {};
  const self = { addEventListener: (type, fn) => { handlers[type] = fn; }, location: { origin: 'http://localhost:5050' } };
  const caches = { match: async () => undefined, open: async () => ({ put() {} }), keys: async () => [], delete: async () => true };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), { self, URL, caches, fetch: async () => ({ ok: false }) });
  return handlers.fetch;
}
const handled = (onFetch, url) => {
  let used = false;
  onFetch({ request: { method: 'GET', url, mode: 'navigate' }, respondWith: p => { used = true; return p; } });
  return used;
};

test('the service worker never caches or replays the admin page', () => {
  const onFetch = swFetchHandler();
  assert.equal(handled(onFetch, 'http://localhost:5050/admin'), false);
  assert.equal(handled(onFetch, 'http://localhost:5050/api/admin/live'), false);
  assert.equal(handled(onFetch, 'http://localhost:5050/api/history/solo'), false);
  assert.equal(handled(onFetch, 'http://localhost:5050/src/ui.js'), true, 'the game still works offline');
});

test('every script the page loads is in the offline cache', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(src\/[a-z0-9-]+\.js)"><\/script>/g)].map(m => m[1]);
  for (const s of ['src/worldgen.js', 'src/fog.js', 'src/expedition.js', 'src/dangers.js', 'src/surface-world.js', 'src/surface-paint.js', 'src/surface-map.js', 'src/surface-eva.js']) assert.ok(scripts.includes(s), s + ' is loaded by index.html');
  assert.ok(scripts.indexOf('src/engine.js') < scripts.indexOf('src/expedition.js') && scripts.indexOf('src/worldgen.js') < scripts.indexOf('src/expedition.js'), 'the rules load after the engine and the world');
  assert.ok(scripts.indexOf('src/expedition.js') < scripts.indexOf('src/dangers.js') && scripts.indexOf('src/dangers.js') < scripts.indexOf('src/surface-eva.js'), 'the dangers load after the rules they use and before the surface');
  assert.ok(scripts.indexOf('src/surface-eva.js') < scripts.indexOf('src/surface.js'), 'the exploring layer loads before the surface');
  assert.ok(scripts.indexOf('src/expedition.js') < scripts.indexOf('src/goals.js') && scripts.indexOf('src/goals.js') < scripts.indexOf('src/ui.js'), 'the goals load after the rules they read and before the interface');
  for (const s of scripts) assert.ok(sw.includes("'" + s + "'"), s + ' is cached by sw.js');
  assert.ok(scripts.indexOf('src/surface-map.js') < scripts.indexOf('src/surface.js') && scripts.indexOf('src/surface.js') < scripts.indexOf('src/ui.js'), 'load order');
  assert.ok(scripts.includes('src/ground-photos.js') && scripts.indexOf('src/ground-photos.js') < scripts.indexOf('src/surface-paint.js'), 'the NASA ground photos load before the painter, which reads them as it loads');
  assert.ok(scripts.includes('src/saves.js') && scripts.indexOf('src/saves.js') < scripts.indexOf('src/ui.js'), 'the save slots load before the interface');
  assert.ok(scripts.includes('src/showcase.js') && scripts.indexOf('src/showcase.js') < scripts.indexOf('src/ui.js'), 'the Showcase cards load before the interface');
  assert.match(sw, /const CACHE = 'sol500-v20'/, 'a new name, so an installed app fetches the new files');
});
