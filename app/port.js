'use strict';
const net = require('node:net');

function canListen(port, host) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

// Always try the same ports first: saved games are stored per address, so a stable port keeps them.
async function pickPort(first = 5050, count = 10, host = '0.0.0.0') {
  for (let p = first; p < first + count; p++) if (await canListen(p, host)) return p;
  return 0;
}

module.exports = { pickPort, canListen };
