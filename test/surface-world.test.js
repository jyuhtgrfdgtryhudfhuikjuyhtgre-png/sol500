'use strict';
// The surface's world model (src/surface-world.js): live chunks, collision, short paths, the build queue and fog.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');
const F = require('../src/fog.js');
const SW = require('../src/surface-world.js');

test('tiles and regions are the worldgen ones, west and north of the base too', () => {
  const w = SW.create('WORLD-1');
  const seed = W.seedOf('WORLD-1');
  for (const [tx, ty] of [[0, 0], [-1, -1], [-33, 5], [100, -70], [-200, -200]]) {
    const cx = Math.floor(tx / 32), cy = Math.floor(ty / 32), c = W.chunk(seed, cx, cy);
    assert.equal(w.tile(tx, ty), W.tileOf(c, tx - cx * 32, ty - cy * 32), 'tile ' + tx + ',' + ty);
    assert.equal(w.region(tx, ty), W.regionAt(seed, tx, ty), 'region ' + tx + ',' + ty);
  }
});

test('the base pad is open; the overlay blocks the HQ, reactor, lander and grid rocks', () => {
  const w = SW.create('WORLD-2');
  assert.equal(w.isBlocked(0, 0), false);
  w.setOverlay([[0, 0], [-6, -4]]);
  assert.equal(w.isBlocked(0, 0), true);
  assert.equal(w.isBlocked(-6, -4), true);
  assert.equal(w.isBlocked(1, 0), false);
});

test('chunks within 2 are made, chunks beyond 3 are deleted, the base chunks always stay', () => {
  const w = SW.create('WORLD-3');
  w.get(0, 0);
  w.retain(10 * 32 + 5, 5);
  let n = 0;
  while (w.work()) n++;
  assert.equal(n, 25);
  const live = () => new Set(w.liveKeys());
  for (let cy = -2; cy <= 2; cy++) for (let cx = 8; cx <= 12; cx++) assert.ok(live().has(cx + ',' + cy), cx + ',' + cy);
  w.retain(14 * 32 + 5, 5);
  for (const k of live()) {
    const [cx, cy] = k.split(',').map(Number);
    const base = cx >= -1 && cx <= 0 && cy >= -1 && cy <= 0;
    assert.ok(base || Math.max(Math.abs(cx - 14), Math.abs(cy)) <= 3, 'chunk ' + k + ' should be gone');
  }
  assert.ok(live().has('11,0'), 'a chunk 3 away is kept (no churn at the edge)');
  assert.ok(!live().has('10,0'), 'a chunk 4 away is deleted');
  assert.ok(live().has('0,0'), 'the base chunk stays');
});

test('the queue starts with the chunk nearest to where the player is heading', () => {
  const w = SW.create('WORLD-4');
  w.retain(5, 5, 5 + 64, 5); // standing in chunk (0, 0), heading two chunks east
  w.work();
  assert.deepEqual(w.liveKeys(), ['2,0']);
});

test('never more live chunks than the cap; the least recently used go first, the base never', () => {
  const w = SW.create('WORLD-5', { cap: 10 });
  w.get(0, 0);
  w.get(-1, -1);
  for (let i = 1; i <= 15; i++) w.get(i * 5, 40);
  assert.equal(w.stats().data, 10);
  assert.ok(w.peek(0, 0) && w.peek(-1, -1), 'base chunks stay');
  assert.equal(w.peek(5, 40), null, 'the oldest is dropped');
  assert.ok(w.peek(75, 40), 'the newest is kept');
});

test('a deleted chunk comes back byte-identical, and dataFor never keeps what it builds', () => {
  const w = SW.create('WORLD-6');
  const before = w.get(9, -9).tiles.slice();
  w.retain(100 * 32, 100 * 32);
  assert.equal(w.peek(9, -9), null);
  assert.deepEqual(w.dataFor(9, -9).tiles, before);
  assert.equal(w.peek(9, -9), null, 'dataFor did not keep it');
  assert.deepEqual(w.get(9, -9).tiles, before);
});

test('paths go around what blocks, stay inside the 64×64 box, and can end at a blocked goal', () => {
  const w = SW.create('WORLD-7');
  const wall = [];
  for (let y = -6; y <= 6; y++) wall.push([3, y]);
  w.setOverlay(wall);
  const path = w.findPath(0, 0, 6, 0, false);
  assert.ok(path && path.length >= 20, 'walked around the wall: ' + (path && path.length));
  for (const [x, y] of path) assert.ok(!w.isBlocked(x, y), 'step on a blocked tile ' + x + ',' + y);
  assert.deepEqual(path[path.length - 1], [6, 0]);
  assert.equal(w.findPath(0, 0, 40, 0, false), null, 'beyond the 32-tile box');
  const toWall = w.findPath(0, 0, 3, 0, true);
  assert.deepEqual(toWall[toWall.length - 1], [3, 0]);
  assert.equal(w.findPath(0, 0, 3, 0, false), null);
  assert.deepEqual(w.findPath(0, 0, 0, 0, false), []);
  const west = w.findPath(-1, -1, -8, -7, false); // inside the flat zone, west and north of the HQ
  assert.equal(west.length, 13);
  assert.deepEqual(west[west.length - 1], [-8, -7]);
});

test('walking is slower on dunes; everything else is normal speed', () => {
  const seed = W.seedOf('WORLD-8');
  let dune = null;
  for (const cy of [3, 40, 80, 120, -60]) for (let cx = -200; cx < 200 && !dune; cx += 7) {
    const c = W.chunk(seed, cx, cy), i = c.tiles.indexOf(W.TILE.DUNE);
    if (i >= 0) dune = [cx * 32 + (i % 32), cy * 32 + Math.floor(i / 32)];
  }
  assert.ok(dune, 'found a dune');
  const w = SW.create('WORLD-8');
  assert.equal(w.speed(dune[0], dune[1]), 0.7);
  assert.equal(w.speed(0, 0), 1);
});

test('fog: a circle is seen once, takeFog hands over only new chunks, and merging ORs', () => {
  const w = SW.create('WORLD-9');
  let expect = 0;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dy * dy <= 64) expect++;
  assert.equal(w.reveal(0, 0, 8), expect);
  assert.equal(w.reveal(0, 0, 8), 0);
  assert.ok(w.seen(-8, 0) && w.seen(0, -8) && w.seen(8, 0), 'edges of the circle, both sides of zero');
  assert.ok(!w.seen(9, 0) && !w.seen(6, 6) && !w.seen(-6, -6));
  const sent = w.takeFog();
  assert.deepEqual(Object.keys(sent).sort(), ['-1,-1', '-1,0', '0,-1', '0,0']);
  assert.deepEqual(w.takeFog(), {});
  const other = SW.create('WORLD-9');
  other.reveal(40, 40, 3);
  assert.deepEqual(w.mergeFog(other.takeFog()), ['1,1']);
  assert.ok(w.seen(40, 40));
  assert.deepEqual(w.mergeFog(sent), [], 'our own fog echoed back changes nothing');
  const before = w.fogStamp('1,1');
  w.reveal(41, 44, 1);
  assert.ok(w.fogStamp('1,1') > before);
  assert.ok(w.fogKeys().includes('1,1'));
});

test('fog survives its chunk being deleted, and bad fog is ignored', () => {
  const w = SW.create('WORLD-10');
  w.get(9, 9);
  w.reveal(300, 300, 2);
  w.retain(-3000, -3000);
  assert.equal(w.peek(9, 9), null);
  assert.ok(w.seen(300, 300));
  const evil = JSON.parse('{"__proto__":"' + F.encode(F.empty()) + '","x,y":"zz","1,1":"short"}');
  assert.deepEqual(w.mergeFog(evil), []);
  assert.deepEqual(w.mergeFog(null), []);
  assert.deepEqual(w.mergeFog('nope'), []);
});
