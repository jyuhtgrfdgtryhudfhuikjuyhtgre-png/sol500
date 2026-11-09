/*
 * SOL 500 — the solo save slots. A Full mission lives in 'save' and a Quick one in 'saveQuick', so starting one never
 * touches the other. `ls` is ui.js's { get, set, del } over localStorage.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolSaves = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEYS = ['save', 'saveQuick'];
  const slotOf = m => (m && m.quick === true ? 'saveQuick' : 'save');
  const usable = v => !!(v && v.mission && v.mission.status === 'active' && v.mission.version === 2);

  // The mission in a slot, repaired (and the repair written back), or null. A slot that can't be read is deleted, that slot only.
  function load(ls, key, repair) {
    const v = ls.get(key, null);
    if (!usable(v)) return null;
    try {
      const mission = repair(v.mission);
      const plan = v.plan || null;
      ls.set(key, { mission, plan });
      return { mission, plan };
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('SOL 500: dropped a saved mission that could not be read:', e);
      ls.del(key);
      return null;
    }
  }

  function summary(ls) {
    const out = {};
    for (const k of KEYS) { const v = ls.get(k, null); out[k] = usable(v) ? { sol: v.mission.sol } : null; }
    return out;
  }

  return { slotOf, load, summary };
});
