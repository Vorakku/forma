# FORMA V2: effects ride the camera move

Spec revised 2026-10-08. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md) first.

## Background

Round 1 (commits `0d9c89b`, `3cf6587` on `task/forma-v2-motion-overlap`) did two things:
- **Staggered the explode:** lenses lead, arms follow.
- **Short handoff:** a special phase (explode or blueprint) overlaps the camera by only `OVERLAP_S` = 0.35 s. On Side → Top the blueprint still starts 0.35 s before landing and finishes 0.35 s after, so it still reads as "arrive, then switch".

**The intended behaviour is different:** each effect plays *during* the camera move. Going from angle 2 (Side) to angle 3 (Top), the blueprint builds gradually as the camera travels and is fully on exactly when the camera lands. The explode works the same way going into and out of Side.

## The rule

The camera move spans the **whole step** `[i, i+1]`. Each effect runs inside it, and nothing runs before or after the camera:

| Step | Effects |
|---|---|
| 0→1 Three-quarter → Side | explode 0→1 across the whole move |
| 1→2 Side → Top | explode 1→0 over the **first half**, blueprint 0→1 over the **second half** |
| 2→3 Top → Hinge | blueprint 1→0 across the whole move |
| 3→4 Hinge → Front | none |

In general:
- If a step has one effect (in or out), it spans the whole step.
- If it has both an outgoing and an incoming effect, the outgoing one takes `[i, i+0.5]` and the incoming one takes `[i+0.5, i+1]`.
- Explode and blueprint are never both above 0 at the same time.
- Integer times are still exactly the angles.
- Reverse playback mirrors everything. Going from Top back to Side, the blueprint fades over the first half and the frame comes apart over the second half.

Scrubbing gets this for free: dragging slowly from Side toward Top builds the blueprint in step with your finger.

## Changes

### Keep from round 1
- **Staggered explode** (`explode.ts`, `EXPLODE_STAGGER`) is unchanged. Smoothstep per part also means parts arrive at rest even when the explode ends mid-step.
- **Driver** (`scroll-animation.ts`) keeps one trapezoid over the whole move. Ordinary steps and Home/End share that one path, and velocity carry, reverse braking, pause/resume and the monotonic clock are unchanged.

### Budget (`scroll-budget.ts`)
- A step's seconds are the **camera seconds alone**: `RAMP_S + projectedLength / (CAMERA_SPEED × pace)`. Effects no longer add time, so `budget.seconds` matches the camera-only values.
- Phases:
  - camera `start = i`, `end = i + 1`;
  - effects get their window from the rule above.
- An effect phase's `seconds` is just its share × step seconds, for anything that reads it. Scrubbing only uses step seconds.
- Delete the overlap computation.

### Timeline (`scroll-timeline.ts`)
- The camera now always starts and ends on integers, so its interior ramp is never needed. **Delete `rampEase`** and go back to `ease: "none"` for the camera; the driver ramps both ends.
- Effects stay linear in timeline time inside their window. The explode gets its easing from the per-part smoothstep. The blueprint is a cross-fade, so a linear rate is fine.

### Constants (`scroll-steps.ts`)
- Delete `OVERLAP_S`, `EXPLODE_S` and `BLUEPRINT_S`. Effect speed now follows the camera move it rides.
- Keep `CAMERA_SPEED = 0.326`, `RAMP_S`, `EXPLODE_STAGGER` and `pace`.
- The working tree has an **uncommitted retune** (`CAMERA_SPEED` 0.186463 → 0.326, `EXPLODE_S`/`BLUEPRINT_S` 1.2 → 0.7) plus a README link and this spec. Commit those first, separately.

### Expected timings

Each step now equals its camera seconds:

| Step | round 1 (handoff) | this rule |
|---|---|---|
| 0→1 | 1.59 / 1.58 s | ≈1.24 / 1.23 s |
| 1→2 | 1.83 / 1.84 s | ≈1.13 / 1.14 s |
| 2→3 | 2.08 / 2.53 s | ≈1.73 / 2.18 s |
| 3→4 | 1.66 / 2.49 s | unchanged |

Times are desktop (1808 × 1018) / phone (375 × 812). On 1→2 each half lasts about 0.56 s. If that feels rushed, the knob is `pace` on the Top view row in `scroll-poses.ts` (currently 1.25; 1 gives about 1.32 s). Don't add an effect-duration constant back.

## Tests

Round 1's tests assert the overlap. Update them to the new rule rather than deleting them:

- `tests/viewer.test.mjs`
  - **"budget timeline overlaps only camera neighbours…"** (~1027) should assert:
    - the camera phase spans `[i, i+1]` on every step;
    - the effect windows follow the table above;
    - at 25 %, 50 % and 75 % of 0→1 the camera is moving and `0 < explode < 1`, increasing;
    - on 1→2, the explode is 0 from the midpoint on and the blueprint is 0 up to the midpoint;
    - explode and blueprint are never both above 0;
    - all of this holds forwards, in reverse and after the resize rebuild.
  - **"exploded fit contains every part…"** (~1075): keep the in-motion sampling across 0→1 and 1→2, both sizes, both directions. This matters more now, because the frame starts coming apart while the camera is still at the assembled distance. If it fails, start the 0→1 explode later in that step by the smallest amount that passes, and note it in the doc. Don't loosen the test.
- `tests/scroll-motion.test.mjs`
  - **Projection guard** (~298, ~318): the camera starts at the step start again, so its offset is 0. The pinned 1.237 s first camera phase stays.
  - **"budget derives seconds/shares…"** (~430): `step.seconds` = camera seconds, with no overlap term.
  - **"ordinary moves keep velocity at phase boundaries…"** (~468): drop the camera-ramp assertions. Keep:
    - velocity > 0 at the 1→2 midpoint handoff;
    - scrub proportionality;
    - one test that scrubbing halfway from 1 to 2 gives `explode = 0` and `0 < blueprint < 1`.
  - **"camera ramp ease…"** (~528): delete it along with `rampEase`.
  - **Home/End, monotonic clock**: should pass unchanged.
- `e2e/v2-scroll.spec.ts`: durations come from `data-motion-duration`, so no change is expected. Run it if `../server` exists; otherwise say it wasn't run.

## Constraints

- No new dependencies.
- Don't touch the server, the shop pages or `tests/fixtures/round4`.
- Reduced motion still cuts.
- Update `V2-SCROLL-DEMO.md`: the motion model section and a new timing column taken from the guard's logged JSON.

## Done when

- `npm run typecheck`, `npm test` and `npm run build` pass. `npm run test:e2e` passes, or it's reported as not run.
- On `/v2-demo` (or the offline demo with the server off):
  - the frame comes apart *while* turning to Side;
  - on Side → Top it closes up during the first half and the blueprint builds during the second half, fully on at landing;
  - on Top → Hinge the blueprint fades out during the move;
  - no part leaves the frame;
  - Home/End sweeps without stops;
  - reduced motion still cuts.
