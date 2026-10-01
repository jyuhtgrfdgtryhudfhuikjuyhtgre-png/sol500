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
