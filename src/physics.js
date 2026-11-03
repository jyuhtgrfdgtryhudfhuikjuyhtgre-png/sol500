/*
 * SOL 500 — the physics engine: Newton's laws with Mars' real gravity, for the rover and the dust it throws up.
 * Inside it is SI (metres, seconds, kilograms, newtons); the game's world is PX_PER_M pixels to the metre here.
 *
 * Mars' gravity is 38 % of Earth's (NASA JPL, "Mars at a glance"). Grip is friction, and friction is a share (GRIP) of how
 * hard the wheels press on the ground, its weight: so on Mars a rover can speed up, brake and turn only 38 % as hard as on
 * Earth, and it needs 2.6 times as far to stop. The air's pressure is under 1/100th of Earth's (its density about 1/60th),
 * so air drag is left out. The grip is shared: what the wheels use to push or brake is not there to turn with.
 * The rover's mass is Perseverance's (1,025 kg); its motor and its top speed are game values, far above Perseverance's
 * 152 m an hour, so that exploring stays fun (src/i18n.js, the "Driving on Mars" note, says so).
 *
 * API: SolPhysics.MARS_G · EARTH_G · PX_PER_M · ROVER
 *      drive(car, input, dt, o) → px moved: car { heading (rad), speed (px/s) } is changed in place; input { x, y }, a direction
 *        of length up to 1 (none: it brakes to a stop); o { boost, rough, g } (g defaults to Mars')
 *      grip(g) → the most the wheels can push (m/s²) · stopDistance(speedPx, g) → metres to brake to a stop at full grip
 *      dust(d, dt, g) → advances one dust grain (x, y px on the ground; z m above it; vx, vy px/s; vz m/s); false once landed
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MARS_G = 3.73, EARTH_G = 9.81; // m/s²: 38 % of Earth's (NASA JPL)
  const PX_PER_M = 64;
  const ROVER = {
    mass: 1025,       // kg, Perseverance's
    power: 15000,     // W at the wheels (a game value)
    grip: 1.8,        // the share of its weight its cleated wheels can push, brake or turn with (a game value: real wheels on
                      // regolith manage about half that, but then the rover took 14 tiles to stop from a boost; the user
                      // asked for shorter stops on 2026-11-03. Gravity still scales it: Mars always needs 2.6 times Earth's)
    roll: 0.05,       // rolling resistance on firm ground, a share of its weight
    rollRough: 0.25,  // over rocks and crater rims
    top: 390 / 64,    // m/s, the motors' governor (the game's rover speed: 390 px/s)
    boost: 1.6,       // Shift: the governor opened up
    roughTop: 0.5,    // over rocks the driver creeps along at half speed
    turn: 3.6,        // rad/s, the fastest the wheels can swing it round at walking pace
  };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const grip = g => ROVER.grip * (g || MARS_G);
  const stopDistance = (speedPx, g) => { const v = speedPx / PX_PER_M; return v * v / (2 * grip(g)); };

  function drive(car, input, dt, o) {
    const R = ROVER, g = (o && o.g) || MARS_G, m = R.mass, boost = !!(o && o.boost), rough = !!(o && o.rough);
    const v = car.speed / PX_PER_M, top = R.top * (boost ? R.boost : 1) * (rough ? R.roughTop : 1);
    const n = Math.hypot(input.x, input.y), Fgrip = grip(g) * m;
    let throttle = 0, brake = 1, d = 0;
    if (n > 0.05) {
      d = wrap(Math.atan2(input.y, input.x) - car.heading);
      const c = Math.cos(d);
      throttle = Math.min(1, n) * Math.max(0, c); // ease off while turning
      brake = c < 0.5 ? Math.min(1, (0.5 - c) * Math.min(1, v / R.top)) : 0; // and brake into a sharp turn, the harder the faster it goes
    }
    // Newton's second law along the heading: the motor's push (no more than the wheels' grip, and no more than its power
    // allows at this speed) against rolling resistance and the brakes.
    const Fmotor = throttle > 0 && v <= top ? Math.min(Fgrip, R.power / Math.max(v, 0.5)) * throttle : 0; // at the governor it holds
    const Fbrake = v > 0 ? brake * Fgrip : 0;
    let side = 0; // the sideways push the turn takes, m/s²
    if (d) {
      // Turning pushes the rover sideways, and the wheels hold at most grip(g) in all (a friction circle): the grip the motor
      // or the brakes use along the heading is not there for the turn. So the faster it goes, the slower it can turn.
      const along = Math.abs(Fmotor - Fbrake) / m, left = Math.sqrt(Math.max(0, grip(g) * grip(g) - along * along));
      const w = Math.min(R.turn, left / Math.max(v, 0.5)), turn = clamp(d, -w * dt, w * dt);
      car.heading = wrap(car.heading + turn);
      side = dt > 0 ? v * Math.abs(turn) / dt : 0;
    }
    const Fresist = v > 0 ? (rough ? R.rollRough : R.roll) * m * g + Fbrake : 0;
    let next = Math.max(0, v + (Fmotor - Fresist) / m * dt);
    // Over the governor it brakes down to it, with the grip the turn leaves.
    if (v > top) next = Math.max(top, Math.min(next, v - Math.sqrt(Math.max(0, grip(g) * grip(g) - side * side)) * dt));
    else next = Math.min(next, top);
    car.speed = next * PX_PER_M;
    return car.speed * dt;
  }

  // A grain of dust flung up by a wheel: it flies under Mars' gravity, and the thin air hardly slows it.
  function dust(d, dt, g) {
    d.vz -= (g || MARS_G) * dt;
    d.z += d.vz * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    return d.z > 0;
  }

  return { MARS_G, EARTH_G, PX_PER_M, ROVER, drive, grip, stopDistance, dust };
});
