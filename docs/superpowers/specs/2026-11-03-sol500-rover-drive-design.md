# SOL 500: a bigger, better rover that drives like one (2026-11-03)

The user asked for "the vehicle to be more bigger", "curtain movement skill" (from a list, they picked **smooth steering,
speed boost and off-road climbing**) and "make it better". From a browser demo of three designs they picked **A, the
science rover** (Perseverance-like). They approved the description below ("ok goo"). Built on `feat/nasa-floor`.

## What the player gets
- **Look.** The rover on the map (driven or parked) is drawn from above, about 2 tiles long (128 px; today's picture is
  68 px): six wheels on rocker arms, a camera mast, a dish, a power unit at the back, a folded arm, a stripe in the
  driver's crew colour. It turns to any angle, casts a shadow to the south-east, its wheels roll, its headlights come on
  while it moves, dust kicks up from the wheels and its tracks stay on the ground a while, then fade.
- **Smooth steering.** The rover turns toward the way you push (keys, joystick or a click-to-drive route) at most
  1.15 half-turns a second, speeds up and slows down like a heavy vehicle, and eases off while it turns hard.
- **Speed boost.** Hold Shift (the touch sprint button) while driving: ×1.6 speed, the battery drains ×2.
- **Off-road climbing.** Boulders and crater rims (they block walking) let the rover over at ×0.5 speed and ×2 battery.
  Cliffs, canyon walls, ice scarps, lava-tube walls, Kestrel structures and the base's buildings still block it.
  Click-to-drive routes over rocks too.
- **Co-op.** Other players see the rover turn: its heading comes from how its relayed position moves (no new network
  field). A parked rover keeps the last heading this screen saw.

## Unchanged
One driver at a time; 400 tiles of battery a round; getting in and out with E (out onto the nearest open spot, as now);
parking; the view range; the build menu's icon and the 1-tile garage bay at the base (today's picture).

## Claude's calls
- The collision box stays the walker's, plus a probe at the rover's nose, so the drawn rover does not drive its nose
  into a cliff, and narrow gaps that you can walk through stay drivable.
- The numbers live in `D.EXPEDITION.rover` (turn, accel, brake, boost, rough) next to `roverRange`.
- Tracks and dust are a local effect only (a few hundred points and particles), never sent.

## Where it lives
- `src/surface-world.js`: `steer(car, input, dt, top)` (pure, tested), `rough(tx, ty)`, `isBlocked(tx, ty, rover)`,
  `findPath(..., rover)`.
- `src/surface.js`: the rover branch of `stepPlayer`, the remote heading, tracks and dust, the parked rover's picture.
- `src/surface-eva.js`: the battery counts `moved × p.drain`.
- `src/surface-paint.js`: `sprites.drawRoverTop`, used by `drawAvatar` for anyone in the rover.
- `src/i18n.js`: the in-rover key hint (EN, VI).
