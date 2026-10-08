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

- **Timeline** (`scroll-timeline.ts`): one paused GSAP timeline where integer time *n* is exactly angle *n*. The camera spans every whole step `[i, i+1]` with `ease: "none"`; its progress is mapped through projected path length. Effects are linear scalar tweens inside that camera move. There is no interior camera ramp or handoff overlap.
- **Budget** (`scroll-budget.ts`): a step takes only its camera seconds: `RAMP_S + projectedLength / (CAMERA_SPEED × pace)`. Projected length measures how far 300 surface points on the assembled frame travel across the screen (`screen-motion.ts`). An effect adds no time; its seconds are its share of the step multiplied by the camera seconds.
  - 0→1: explode 0→1 across the whole move. No delayed start was needed: the unchanged in-motion fit guard passes with `start = 0`.
  - 1→2: explode closes over `[1, 1.5]`, then blueprint builds over `[1.5, 2]`, reaching full blueprint exactly when the camera lands. At the midpoint both effects are zero; halfway through the blueprint window (time 1.75), blueprint is 0.5.
  - 2→3: blueprint fades 1→0 across the whole move.
  - 3→4: camera only.
  - A single effect fills the step; outgoing/incoming effects split its span in half. Explode and blueprint are never both above zero. Reverse playback mirrors these windows, and integer times remain exactly the angle states.
- **Driver** (`scroll-animation.ts`): unchanged from round 1. One trapezoid over the whole move ramps only at its outer edges and maps budget seconds linearly into each step's timeline interval. A queued extra angle passes the integer angle without stopping.
  - Home/End uses the same path at `JUMP_SPEEDUP` (2×). Retarget velocity carry, reverse braking and pause/resume remain intact.
  - GSAP schedules frames; elapsed time comes from a monotonic clock so lag smoothing cannot stretch timing.
- **Explode** (`explode.ts`): unchanged from round 1. The public `pose.explode` scalar remains 0–1. Front and lenses start at 0, temples at `EXPLODE_STAGGER = 0.35`. Every part follows `smoothstep(clamp((amount − start) / (1 − EXPLODE_STAGGER)))`. Lenses lead on departure; temples lead on reassembly. Endpoints restore exact base/full-offset positions.
- **Scrubbing** still moves timeline time linearly in pixels, weighted by each step's camera seconds (`SCRUB_PX_PER_S`). Slow wheel/touch drags directly reveal the part stagger and effect windows. Reduced motion still cuts instantly.

Effect duration constants and `OVERLAP_S` have been removed. Effect speed follows the camera move; tune their shared duration with each angle's `pace`.

## Lighting

V2 uses a procedural PMREM studio environment: `?env=strip` (default; unknown values also use strip), `?env=soft`, or `?env=window`. Only the selected environment is built, and its panel/shell resources are released after conversion. The shop viewer keeps `RoomEnvironment`, floor opacity 0.035, PCF shadows and ACES at exposure 1.45; try-on lighting and lens materials are unchanged.

Each `SCROLL_ANGLES` row owns the key, hemisphere, environment intensity, yaw, floor-shadow opacity and CSS pool. `pose.light` follows timeline time linearly across the existing camera window; `resolveLight` blends scalars (including shadow opacity) and linear colours and takes the shortest key azimuth path. It adds no time and cuts with the pose for reduced motion.

| Angle | Key az / el / intensity / colour | Hemi | Env | Shadow | Pool x / y / size / strength |
|---|---|---|---|---|---|
| Three-quarter | −40° / 50° / 3 / `#ffffff` | 0.8 | 1 | 0.14 | 50% / 35% / 75% / 1 |
| Side, exploded | 117° / 35° / 2.2 / `#eaf1ff` | 0.5 | 1.15 | 0.12 | 60% / 30% / 70% / 0.85 |
| Top / blueprint | −40° / 70° / 1.5 / `#ffffff` | 0.5 | 0.7 | 0.10 | 50% / 50% / 60% / 0.4 |
| Hinge detail | −50° / 25° / 3.5 / `#fff6ea` | 0.35 | 0.8 | 0.05 | 55% / 45% / 45% / 0.8 |
| Front | 0° / 55° / 3 / `#ffffff` | 0.8 | 1 | 0.14 | 50% / 30% / 75% / 1 |

Environment yaw is `ENV_FOLLOW × pose.theta + radians(light.yaw)`, with `ENV_FOLLOW = 0.35` in `scroll-steps.ts` and every row yaw at 0°. The background pool follows the resolved row; hero strength 1 reproduces the original gradient.

V2 uses `PCFShadowMap` with `shadow.radius = 4`: the installed three 0.186 shader multiplies its five Vogel-disk sample offsets by the radius, and the depth texture uses hardware PCF with linear filtering. PCF therefore supports softness directly; VSM is unnecessary. Radius 4 is a new starting choice (the spec gives no numeric radius). The ±23 shadow camera, 2048 map, bias −0.001, normal bias 0.05 and `KEY_DISTANCE` are unchanged. Shadow opacity invalidates the cached studio image without invalidating the shadow map; key or assembly movement still refreshes the map.

`?tone=aces|neutral|agx` selects ACES at 1.45 (default and unknown-value fallback), Neutral at 1.0, or AgX at 1.0. Exposure is set once for the viewer and stays constant through motion and fades. The blueprint composite selects the renderer's matching operator from `tonemapping_pars_fragment`, applies it to the studio image only, and copies exposure each draw; the drawing tokens stay flat. Rendering remains on demand.

The Round 2 opacity values and Hinge corrections match the specification; no other lighting values or comparison exposures were tuned. Automated coverage includes landed/interpolated shadow opacity, opacity-only cache invalidation, unchanged shop defaults, all tone variants/fallbacks, fixed exposure, and matching composite operators. All existing tests, including blueprint-fade render counts, remain unchanged. Round 1 visual findings are recorded in `V2-LIGHTING.md`; Round 2 shadow softness/coverage, Hinge streaks, fade brightness continuity and shop appearance still need visual review. E2E was not run because `../server` is missing.

## Timing history

| Step | 97e1737 (fixed weights) | 9c9e566 (budget, slow) | 2026-10-08 retune | Round 1 handoff, desktop / phone | Effects during camera (current), desktop / phone |
|---|---|---|---|---|---|
| 0→1 explode | 1.54 s | 3.10 s | 1.94 s desktop / 1.93 s phone | 1.586541 s / 1.581946 s | 1.236541 s / 1.231946 s |
| 1→2 blueprint | 1.87 s | 4.11 s | 2.53 s / 2.54 s | 1.828818 s / 1.840660 s | 1.128818 s / 1.140660 s |
| 2→3 hinge | 1.54 s | 3.97 s | 2.43 s / 2.88 s | 2.081323 s / 2.531361 s | 1.731323 s / 2.181361 s |
| 3→4 front | 1.10 s | 2.64 s | 1.66 s / 2.49 s | 1.657397 s / 2.486621 s | 1.657397 s / 2.486621 s |

Desktop is 1808 × 1018 and phone is 375 × 812. Commit 9c9e566 replaced the fixed step weights with the screen-speed budget, which evened out camera speed but made every step 2–3× longer. The 2026-10-08 retune changed:
- `CAMERA_SPEED` from 0.186463 to 0.326 (1.75× faster);
- `EXPLODE_S` and `BLUEPRINT_S` from 1.2 s to 0.7 s.

The retune and matching 1.237 s camera-duration pin were committed in `1e0d792` before this revision. Round 1 used a 0.35 s camera/effect handoff. The current column comes from the projection guard's logged JSON (`tests/scroll-motion.test.mjs`, `after[].stepSeconds`) at these exact viewport sizes. Every current step now equals its camera seconds; the camera paths, pace values and pinned first camera phase are unchanged (actual desktop first-camera duration: 1.2365411822166799 s).

No explode-start delay was needed. The fit test passes with the 0→1 explode spanning [0, 1], sampling all mesh bbox corners in both directions at both viewport sizes. On 1→2, each effect half lasts 0.564409 s desktop / 0.570330 s phone. If that feels rushed, lowering the Top view's `pace` lengthens both halves together; no separate effect-duration constant is needed.

## Files

- `src/pages/v2-demo.tsx`, `v2-demo.css`: stage, input wiring (GSAP Observer), header fade, theme swatches, offline fallback.
- `src/tryon/scroll-poses.ts`: angle table and pose resolution.
- `src/tryon/scroll-steps.ts`: gesture state machine and tuning constants.
- `src/tryon/scroll-budget.ts`, `screen-motion.ts`: per-step phase seconds from projected screen motion.
- `src/tryon/scroll-timeline.ts`: builds the GSAP timeline from the budget.
- `src/tryon/scroll-animation.ts`: trapezoid driver, retarget velocity, pause/resume.
- `src/tryon/scroll-viewer.ts`, `studio.ts`, `studio-environment.ts`, `studio-tone.ts`, `explode.ts`, `blueprint*.ts`: renderer, procedural studio environments, on-demand frames, exploded fit, blueprint pass.
- `doc/feature/V2-LIGHTING.md`: V2 lighting specification (round 1 and round 2).

## Verification

- `npm run typecheck`, `npm test` (82 tests) and `npm run build` pass after the revision. The only removed test is the obsolete ramp-ease self-check.
- The projection guard passes forward and reverse at both sizes, with the same evenness/spike limits and the 1.237 s first-camera pin. The camera-window offset is now zero in either direction.
- The rewritten timeline test checks the full camera spans, effect windows, simultaneous turning/exploding at 25/50/75 %, midpoint handoff, effect exclusivity and integer states in both directions after resize rebuilds.
- The fit test retains parked checks and unchanged every-mesh bbox-corner sampling every 0.01 timeline unit across 0↔1 and 1↔2 at both sizes, including simultaneous camera/explode movement. No NDC limits were relaxed.
- Budget tests require step seconds to equal camera seconds and effect seconds to equal their window shares. Driver tests retain positive velocity at effect handoffs, proportional scrubbing and uninterrupted queued traversal; real scrub commands check both effects zero at 1.5 and a partial blueprint at 1.75. Home/End, retarget and monotonic-clock checks remain unchanged.
- `npm run test:e2e` was **not run**: `../server` is missing. Playwright needs that server's `.env` and starts it on 8788.

## Visual review on /v2-demo

Tests verify geometry and timing, not feel. At 1808 × 1018 and 375 × 812, check:

- 0→1: parts separate while the camera turns to Side, with lenses/front leading the temples. Camera and explode reach the Side state together, with no effect continuing after landing. On 1→0, temples return first and lenses seat last while the camera returns.
- 1→2: parts close during the first half of the turn; blueprint builds during the second half and is fully on at landing. At the midpoint the frame is assembled with no blueprint. On 2→1, blueprint fades first, then the frame separates while the camera is still turning.
- 2→3: blueprint fades throughout the move toward Hinge and is completely off at landing; reverse playback builds it throughout the return to Top. Check Ink/Blue theme transitions too.
- Watch outer lens and arm tips during 0↔1 and 1↔2, especially early in 0→1 on portrait: every part should stay visible with no clipping, pop or camera snap.
- Slow wheel/touch scrubbing should reveal the stagger and half-step handoff. Check whether the approximately 0.56–0.57 s effect halves on 1→2 feel rushed. Release a scrub and check its settle.
- Queue one extra angle and retarget forward/back mid-flight: no stop at the intermediate angle or velocity jump. Home/End should sweep at 2× without internal stops; reduced motion should cut directly to the angle and theme.
- Resize between desktop/portrait while landed and during a move: watch for clipping or a stale pose.
