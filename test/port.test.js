'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { pickPort } = require('../app/port.js');

test('the app skips a port that is already taken (for example an old server still running)', async () => {
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '0.0.0.0', r));
  const taken = blocker.address().port;
  try {
    const p = await pickPort(taken, 3);
    assert.notEqual(p, taken);
    assert.ok(p === 0 || (p > taken && p < taken + 3), 'next port in the range, or 0 for any free port; got ' + p);
  } finally {
    blocker.close();
  }
});
