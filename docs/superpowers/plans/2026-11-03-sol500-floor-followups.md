# SOL 500: NASA floor and rover follow-ups (2026-11-03)

These come from the whole-branch review of `feat/nasa-floor` (`e79d28f..6bd0992`). Its report is in session 5f2212e3's scratchpad, `floor-review.md`. The 3 Important findings and most of the Minor ones are fixed on the branch. These are left, all Minor:

- **F12. The ground photos are made seamless at run time.**
  - Where: `src/surface-paint.js` `loadPhotos`, which runs `tileable` and two 624 × 624 `getImageData` calls for each of the 6 photos.
  - Cost: about 45 ms of main thread per photo on a desktop, and several times that on a phone. These land in play if a save resumes straight onto the surface.
  - Fix: run `tileable` in the generator of `src/ground-photos.js`, which is already generated offline, and ship the seamless images. Otherwise run it in `requestIdleCallback`.
- **F13. The nose probe doesn't keep the drawn rover out of a wall.**
  - Where: `src/surface.js` `NOSE = 40`. The probe is the walker's box moved 40 px along the heading from the driver's feet, but the sprite is drawn 10 px higher and reaches about 61 px forward.
  - Effect: when the probe stops the rover, its drawn front is 25 px into the wall facing north, 11 px facing east or west, and 7 px facing south.
  - Fix: probe from the drawn middle to the drawn front, e.g. `hitsWall(x + hx * 52, y - 10 + hy * 56, true)`, or 2–3 probes across the bumper. First check that 1-tile gaps and corners stay drivable.
- **F7, its second half. A crewmate's rover heading jumps between relayed positions** (about 110 ms apart). The positions are eased in `stepRemote`; the heading is not.
  - Fix: ease a shown heading toward the relayed one, e.g. `r.shown += wrap(r.heading - r.shown) * k`, and draw `r.shown`.
  - Boarding no longer snaps (fixed).
- **Driving into a wall at an angle** keeps the rover's speed while it slides along the wall at the part of it along the wall, so the HUD reads a little high then. This is unchanged from before the physics rover. Head-on it now stops dead (fixed).
