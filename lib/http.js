'use strict';
// SOL 500 — the two HTTP helpers every route uses: a JSON reply and a size-capped JSON body reader.
const MAX_BODY = 64 * 1024;

function send(res, status, obj, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const tooBig = () => Object.assign(new Error('tooBig'), { status: 413 });
    if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); reject(tooBig()); return; }
    let size = 0;
    let over = false;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { over = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (over) { reject(tooBig()); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = { send, readBody, MAX_BODY };
