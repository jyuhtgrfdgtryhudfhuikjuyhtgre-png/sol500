'use strict';
// The saved window size, made safe: a missing or damaged file gives the default, and the window is never smaller than the
// game's minimum (960 x 600) nor absurdly large.
const MIN_W = 960, MIN_H = 600, MAX = 8192;
const fit = (v, min, def) => (Number.isFinite(v) ? Math.min(MAX, Math.max(min, Math.round(v))) : def);

function clampSize(s) {
  const o = s && typeof s === 'object' ? s : {};
  return { width: fit(o.width, MIN_W, 1280), height: fit(o.height, MIN_H, 800) };
}

module.exports = { clampSize };
