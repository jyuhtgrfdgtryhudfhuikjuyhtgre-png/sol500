'use strict';
/*
 * SOL 500 — small JSON files in the data folder, written so that a crash or a locked file never leaves half a file.
 */
const fs = require('node:fs');
const path = require('node:path');

// The parsed value; `fallback` when the file doesn't exist; throws { code: 'BAD_JSON' } when it isn't JSON.
function readJson(file, fallback, fsImpl = fs) {
  let text;
  try { text = fsImpl.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  try { return JSON.parse(text); } catch (e) { throw Object.assign(new Error('bad JSON in ' + file), { code: 'BAD_JSON' }); }
}

// Write a temp file, then rename it over the old one. On Windows an antivirus or the search indexer can hold the old
// file open so the rename fails (EPERM/EBUSY/EACCES): then copy over it instead.
function writeJsonAtomic(file, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fsImpl.writeFileSync(tmp, JSON.stringify(value));
  try {
    fsImpl.renameSync(tmp, file);
  } catch (e) {
    if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
      try { fsImpl.unlinkSync(tmp); } catch (x) { /* ignore */ }
      throw e;
    }
    fsImpl.copyFileSync(tmp, file);
    fsImpl.unlinkSync(tmp);
  }
}

module.exports = { readJson, writeJsonAtomic };
