# FORMA V2: scroll-driven Ellis demo

Status as of 2026-10-08. Open `/v2-demo` on the dev server (4175). If the store cannot reach the server, the app shows this demo full-screen instead of the startup error, with a built-in Ellis (`OFFLINE_ELLIS` in `src/pages/v2-demo.tsx`) and no header or footer. That means `npm run dev` alone, without the server, is enough to work on the motion.

## What it does

A full-screen stage shows The Ellis from five angles. Each gesture moves exactly one angle:

| # | Angle | State on arrival | `pace` |
|---|---|---|---|
| 0 | Three-quarter | assembled | 1 |
| 1 | Side three-quarter | **exploded** (parts pulled apart by `EXPLODE_MM` = 30 mm) | 1 |
| 2 | Top view | **blueprint** (flat line drawing on a sheet, Ink or Blue theme) | 1.25 |
| 3 | Hinge detail | assembled, close-up on `detail.hinge.right` | 2.8 |
| 4 | Front | assembled | 2.4 |

The angle table, with its targets, distances and per-angle `pace`, lives in `src/tryon/scroll-poses.ts`. Adding a sixth row extends the demo without driver changes.

Input:
- One wheel notch or a fast flick steps once. A slow wheel or a touch drag scrubs between neighbouring angles and settles when idle or released.
- Arrow keys, Page Up/Down and Space step. Home/End jump to either end at `JUMP_SPEEDUP` (2×).
- Retargeting mid-flight carries the current velocity, with at most one extra queued angle.
- Reduced motion cuts instantly, including the blueprint theme swap.

Gesture rules and all tuning constants are in `src/tryon/scroll-steps.ts`.

## Motion model

- **Timeline** (`scroll-timeline.ts`): one paused GSAP timeline where integer time *n* is exactly angle *n*. Explode and blueprint scalar tweens are linear. Camera progress passes through an asymmetric ramp ease before projected path-length mapping. Interior camera edges ramp over `RAMP_S / camera.seconds` (scaled down together if necessary to fit); integer edges rely on the driver's ramp.
- **Budget** (`scroll-budget.ts`): the phase order remains blueprint out, explode out, camera, explode in, blueprint in. Adjacent camera/special phases overlap by `min(OVERLAP_S, special.seconds / 2, camera.seconds / 2)`. `OVERLAP_S = 0.35 s`; explode and blueprint never overlap.
  - Camera seconds remain `RAMP_S + projectedLength / (CAMERA_SPEED × pace)`. Projected length measures how far 300 surface points on the frame travel across the screen (`screen-motion.ts`).
  - Explode and blueprint each take `EXPLODE_S = BLUEPRINT_S = 0.7 s`. A step's actual span is the sum of its phases minus overlaps. Each phase's timeline share is still its seconds divided by the step's actual seconds.
- **Driver** (`scroll-animation.ts`): one trapezoid over the whole move, ramping only at its outer edges, maps budget seconds linearly into each step's timeline interval. Camera ramps inside the timeline let it settle while explode/blueprint continues, without stopping the whole gesture. A queued extra angle passes the integer angle without stopping.
  - Home/End uses the same path at `JUMP_SPEEDUP` (2×). Retarget velocity carry, reverse braking and pause/resume remain intact.
  - GSAP schedules frames; elapsed time comes from a monotonic clock so lag smoothing cannot stretch timing.
- **Explode** (`explode.ts`): the public `pose.explode` scalar remains 0–1. Front and lenses start at 0, temples at `EXPLODE_STAGGER = 0.35`. Every part follows `smoothstep(clamp((amount − start) / (1 − EXPLODE_STAGGER)))`. Lenses lead on departure; temples lead on reassembly. Endpoints restore exact base/full-offset positions.
- **Scrubbing** still moves timeline time linearly in pixels, weighted by each step's seconds (`SCRUB_PX_PER_S`); the internal camera ramp and part stagger remain visible while scrubbing. Reduced motion still cuts instantly.

## Timing history

| Step | 97e1737 (fixed weights) | 9c9e566 (budget, slow) | 2026-10-08 retune | Overlap (current), desktop / phone |
|---|---|---|---|---|
| 0→1 explode | 1.54 s | 3.10 s | 1.94 s desktop / 1.93 s phone | 1.586541 s / 1.581946 s |
| 1→2 blueprint | 1.87 s | 4.11 s | 2.53 s / 2.54 s | 1.828818 s / 1.840660 s |
| 2→3 hinge | 1.54 s | 3.97 s | 2.43 s / 2.88 s | 2.081323 s / 2.531361 s |
| 3→4 front | 1.10 s | 2.64 s | 1.66 s / 2.49 s | 1.657397 s / 2.486621 s |

Desktop is 1808 × 1018 and phone is 375 × 812. Commit 9c9e566 replaced the fixed step weights with the screen-speed budget, which evened out camera speed but made every step 2–3× longer. The 2026-10-08 retune changed:
- `CAMERA_SPEED` from 0.186463 to 0.326 (1.75× faster);
- `EXPLODE_S` and `BLUEPRINT_S` from 1.2 s to 0.7 s.

The current overlap column comes from the projection guard’s logged JSON (`tests/scroll-motion.test.mjs`, `after[].stepSeconds`) at these exact viewport sizes, using the existing working-tree retune (`CAMERA_SPEED = 0.326`, `EXPLODE_S = BLUEPRINT_S = 0.7`). Those pre-existing tuning edits are preserved outside the two motion commits. Overlap subtracts 0.35 s on 0→1 and 2→3 and 0.70 s on 1→2; 3→4 is unchanged. No overlap needed shortening for fit. Camera seconds are unchanged: the pinned first camera phase remains 1.237 s (actual desktop value 1.2365411822166799 s).

On a phone, the hinge and front steps are still the longest. Lower `pace` for those rows if they drag.

## Files

- `src/pages/v2-demo.tsx`, `v2-demo.css`: stage, input wiring (GSAP Observer), header fade, theme swatches, offline fallback.
- `src/tryon/scroll-poses.ts`: angle table and pose resolution.
- `src/tryon/scroll-steps.ts`: gesture state machine and tuning constants.
- `src/tryon/scroll-budget.ts`, `screen-motion.ts`: per-step phase seconds from projected screen motion.
- `src/tryon/scroll-timeline.ts`: builds the GSAP timeline from the budget.
- `src/tryon/scroll-animation.ts`: trapezoid driver, retarget velocity, pause/resume.
- `src/tryon/scroll-viewer.ts`, `studio.ts`, `explode.ts`, `blueprint*.ts`: renderer, on-demand frames, exploded fit, blueprint pass.

## Verification

- `npm run typecheck`, `npm test` (70 tests) and `npm run build` pass after overlap.
- The projection guard passes forward and reverse at both sizes, with the same evenness/spike limits. Its camera-window offset now uses the phase's start/end shares; the reverse gesture starts from its actual landed angle.
- Viewer tests retain the parked fit check and sample every mesh bbox corner every 0.01 timeline unit across 0↔1 and 1↔2 at both sizes, including simultaneous camera/explode movement. The overlap/order/exclusivity test also runs both directions after the resize rebuild.
- Driver tests require positive timeline velocity at interior phase boundaries, near-zero camera screen speed at its interior end while a special phase continues, unchanged proportional scrubbing and uninterrupted queued traversal. Ramp ease has endpoint, monotonicity and continuity checks, including either ramp absent. Home/End, retarget and monotonic-clock checks remain.
- `npm run test:e2e` was **not run**: `../server` is missing. Playwright needs that server's `.env` and starts it on 8788.

## Visual review on /v2-demo

Tests verify geometry and timing, not feel. At 1808 × 1018 and 375 × 812, check:

- Step 0→1→2→1→0 with wheel and arrow keys: each step should feel like one gesture, with no full pause at a phase handoff. The camera settles while parts separate/cross-fade, and begins moving as they finish closing/fading out.
- Lenses/front lead the arms out; arms return first and lenses seat last. Slow wheel/touch scrubbing should show the same stagger without abrupt arm starts.
- Keep every part on screen during 0↔1 and 1↔2, especially the outer lens and arm tips in the portrait viewport; no clipping, pop or camera snap during the overlap.
- Blueprint appears only once the parts are assembled, in both directions; verify Ink/Blue cross-fades while the camera settles.
- Queue one extra angle and retarget forward/back mid-flight: no stop at the intermediate integer angle and no velocity jump on retarget. Release a touch/slow-wheel scrub and check its settle.
- Home/End should sweep at 2× without internal stops. Reduced motion should cut directly to the requested angle and theme. Resize between desktop/portrait while landed and during a step; watch for clipping or a stale pose.
