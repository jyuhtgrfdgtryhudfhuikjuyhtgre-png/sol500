'use strict';
// Fog of war bitsets (src/fog.js): one bit per tile, one 128-byte set per 32×32 chunk, base64 on the wire.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/fog.js');

function randomBits(seed) {
  const b = F.empty();
  let a = seed;
  for (let i = 0; i < b.length; i++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; b[i] = a >>> 24; }
  return b;
}

test('a chunk of fog is 128 bytes and 172 characters of standard base64', () => {
  for (let s = 1; s < 20; s++) {
    const bits = randomBits(s);
    const text = F.encode(bits);
    assert.equal(text.length, 172);
    assert.equal(text, Buffer.from(bits).toString('base64'));
    assert.deepEqual(F.decode(text), bits);
  }
  assert.equal(F.encode(F.empty()), Buffer.alloc(128).toString('base64'));
});

test('bad fog text is refused, never thrown on', () => {
  const good = F.encode(randomBits(3));
  for (const bad of [null, undefined, 42, {}, '', 'abc', good.slice(1), good + 'A', good.replace(/.$/, 'A'), '!' + good.slice(1), good.slice(0, 100) + 'é' + good.slice(101)]) {
    assert.equal(F.decode(bad), null, String(bad).slice(0, 20));
  }
});

test('set marks a tile once; has reads it back, including the last tile', () => {
  const b = F.empty();
  assert.equal(F.set(b, 0, 0), true);
  assert.equal(F.set(b, 0, 0), false);
  assert.equal(F.set(b, 31, 31), true);
  assert.equal(F.has(b, 0, 0), 1);
  assert.equal(F.has(b, 31, 31), 1);
  assert.equal(F.has(b, 5, 7), 0);
  assert.equal(F.count(b), 2);
});

test('merging ORs the bits and reports only the chunks that changed', () => {
  const a = F.empty(), b = F.empty();
  F.set(a, 1, 1);
  F.set(b, 2, 2);
  const map = { '0,0': F.encode(a) };
  const changed = F.mergeMap(map, { '0,0': F.encode(b), '-3,7': F.encode(b) });
  assert.deepEqual(Object.keys(changed).sort(), ['-3,7', '0,0']);
  const merged = F.decode(map['0,0']);
  assert.equal(F.has(merged, 1, 1) + F.has(merged, 2, 2), 2);
  assert.deepEqual(F.mergeMap(map, { '0,0': F.encode(b) }), {}, 'nothing new the second time');
});

test('a room frame with a mission under a different launch number means this tab missed a restart', () => {
  const frame = launch => ({ launch, mission: {} });
  assert.equal(F.isNewLaunch(null, frame(1)), true, 'the first frame of a room, or the first after a restart this tab saw');
  assert.equal(F.isNewLaunch(1, frame(1)), false, 'the same mission again');
  assert.equal(F.isNewLaunch(1, frame(2)), true, 'the restart and the relaunch were missed: same code, new mission');
  assert.equal(F.isNewLaunch(1, { launch: 1, mission: null }), false, 'a lobby frame has no mission to reset for');
  assert.equal(F.isNewLaunch(null, { launch: 0, mission: null }), false);
  assert.equal(F.isNewLaunch(null, null), false);
  assert.equal(F.isNewLaunch(null, {}), false);
  // a server without the counter resets once per room, not on every frame
  assert.equal(F.isNewLaunch(null, { mission: {} }), true);
  assert.equal(F.isNewLaunch(undefined, { mission: {} }), false);
});

test('hostile fog is skipped: odd keys, prototype keys, wrong values, non-objects, and the chunk cap', () => {
  const v = F.encode(randomBits(5));
  const map = {};
  for (const diff of [null, 'x', 7, [v]]) assert.deepEqual(F.mergeMap(map, diff), {});
  const evil = JSON.parse('{"__proto__": "' + v + '", "constructor": "' + v + '", "1,2,3": "' + v + '", "a,b": "' + v + '", "1234567,0": "' + v + '", "0,0": "nope"}');
  assert.deepEqual(F.mergeMap(map, evil), {});
  assert.deepEqual(Object.keys(map), []);
  assert.equal(Object.getPrototypeOf(map), Object.prototype);
  const many = {};
  for (let i = 0; i < 10000; i++) many[i + ',0'] = v;
  const changed = F.mergeMap(map, many, 4096);
  assert.equal(Object.keys(changed).length, 4096);
  assert.equal(Object.keys(map).length, 4096);
});

test('a chunk has one fog key, spelled the way String() writes its numbers, so it takes one slot and counts once (M4d)', () => {
  for (const k of ['0,0', '-1,0', '0,-1', '7,-12', '999999,-999999']) assert.ok(F.KEY.test(k), k);
  for (const k of ['-0,0', '0,-0', '00,0', '01,2', '1,007', '+1,0', ' 1,0', '1, 0', '1234567,0', '1,2,3']) assert.equal(F.KEY.test(k), false, k);
  const v = F.encode(randomBits(6)), map = {};
  assert.deepEqual(Object.keys(F.mergeMap(map, { '0,0': v, '-0,0': v, '00,0': v, '0,-0': v })), ['0,0']);
  assert.deepEqual(Object.keys(map), ['0,0']);
});
