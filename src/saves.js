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
  // `makePlan(mission)` builds the plan a save without one gets; it runs inside the guard, so a throw drops this slot only.
  // A mission that doesn't belong in the slot (a Quick one in 'save', or a lost quick flag in 'saveQuick') is damaged too:
  // the next save would write it over the other slot.
  function load(ls, key, repair, makePlan) {
    const v = ls.get(key, null);
    if (!usable(v)) return null;
    try {
      if (slotOf(v.mission) !== key) throw new Error('mission does not belong in slot ' + key);
      const mission = repair(v.mission);
      if (slotOf(mission) !== key) throw new Error('repaired mission does not belong in slot ' + key);
      const plan = v.plan || (makePlan ? makePlan(mission) : null);
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
