'use strict';
// The physics engine (src/physics.js): Newton's laws with Mars' gravity, for the rover and its dust.
const test = require('node:test');
const assert = require('node:assert/strict');
const PH = require('../src/physics.js');

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ': ' + a + ' vs ' + b);
const run = (car, input, secs, o, dt) => { let d = 0; const step = dt || 0.01; for (let t = 0; t < secs - 1e-9; t += step) d += PH.drive(car, input, step, o); return d; };

test("Mars' gravity is 38 % of Earth's, so the wheels grip 38 % as hard and the rover needs 2.6 times as far to stop", () => {
  near(PH.MARS_G / PH.EARTH_G, 0.38, 0.002, 'the gravity ratio NASA gives');
  near(PH.grip(PH.MARS_G) / PH.grip(PH.EARTH_G), 0.38, 0.002, 'the grip ratio');
  near(PH.stopDistance(390, PH.MARS_G) / PH.stopDistance(390, PH.EARTH_G), PH.EARTH_G / PH.MARS_G, 1e-9, 'stopping distances');
  near(PH.stopDistance(390, PH.MARS_G), (390 / 64) ** 2 / (2 * 0.9 * 3.73), 1e-9, 'v² / 2a at top speed');
});

test('from a standstill the rover pulls away no harder than its wheels grip: on Earth the same rover would pull away 2.6 times as hard', () => {
  const pull = g => { const car = { heading: 0, speed: 0 }; PH.drive(car, { x: 1, y: 0 }, 0.01, { g }); return car.speed / PH.PX_PER_M / 0.01; };
  const R = PH.ROVER;
  near(pull(PH.MARS_G), R.grip * PH.MARS_G, 1e-9, 'Newton: the push, capped by grip, over the mass (no rolling resistance at a standstill)');
  near(pull(PH.EARTH_G) / pull(PH.MARS_G), PH.EARTH_G / PH.MARS_G, 1e-9, 'Earth against Mars');
});

test("its motors' governor holds it at top speed; the boost opens it up 1.6 times; over rocks it creeps at half", () => {
  for (const [o, want] of [[{}, 390], [{ boost: true }, 390 * 1.6], [{ rough: true }, 195], [{ boost: true, rough: true }, 390 * 1.6 / 2]]) {
    const car = { heading: 0, speed: 0 };
    run(car, { x: 1, y: 0 }, 8, o);
    near(car.speed, want, 1e-6, JSON.stringify(o));
  }
  const car = { heading: 0, speed: 390 * 1.6 }; // let go of the boost: it brakes back down to the governor, no faster than grip allows
  PH.drive(car, { x: 1, y: 0 }, 0.1, {});
  near(car.speed, 390 * 1.6 - PH.grip() * 0.1 * 64, 1e-6, 'one tenth of a second later');
  run(car, { x: 1, y: 0 }, 3, {});
  near(car.speed, 390, 1e-6, 'and holds at the governor');
});

test('the faster it goes the slower it can turn: the wheels only take so much sideways push', () => {
  const turned = speed => { const car = { heading: 0, speed }; PH.drive(car, { x: 0, y: 1 }, 0.05, {}); return car.heading; };
  near(turned(390), PH.grip() / (390 / 64) * 0.05, 1e-9, 'at top speed, grip / speed');
  near(turned(10), PH.ROVER.turn * 0.05, 1e-9, 'at walking pace, as fast as the wheels can swing it');
  assert.ok(turned(390) < turned(10) / 4);
});

test('let go and it brakes to a stop within its stopping distance; on Earth it would stop 2.6 times sooner', () => {
  for (const g of [PH.MARS_G, PH.EARTH_G]) {
    const car = { heading: 0, speed: 390 };
    let d = 0;
    for (let i = 0; i < 20000 && car.speed > 0; i++) d += PH.drive(car, { x: 0, y: 0 }, 0.001, { g });
    const m = d / PH.PX_PER_M, most = PH.stopDistance(390, g);
    assert.ok(m <= most + 0.01 && m > most * 0.9, g + ': ' + m + ' m, at most ' + most + ' m (rolling resistance helps a little)');
  }
});

test('a dust grain flung up flies for 2·vz/g: on Mars 2.6 times as long as on Earth', () => {
  const flight = g => { const d = { x: 0, y: 0, z: 1e-9, vx: 0, vy: 0, vz: 2 }; let t = 0; while (PH.dust(d, 0.001, g)) t += 0.001; return t; };
  near(flight(PH.MARS_G), 2 * 2 / PH.MARS_G, 0.005, 'Mars');
  near(flight(PH.MARS_G) / flight(PH.EARTH_G), PH.EARTH_G / PH.MARS_G, 0.02, 'against Earth');
});
