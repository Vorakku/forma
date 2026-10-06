# Phase 1.5 verification — 2026-10-06

Both rendering changes are implemented. Real-webcam and mid-range-phone acceptance remains pending; the still-photo check cannot establish fast-motion tracking, resting jitter or device performance.

The engine detects, updates the pinned/smoothed pose and live mesh, uploads the camera texture, then draws the untone-mapped video and 3D scene in the same video callback. The rAF fallback uses the same order and skips duplicate video frames. The visible canvas retains the camera aspect and selfie mirror; the source video stays decoded at opacity zero.

One dynamic geometry contains the 468 canonical vertices and 898 triangles. Each detected image ray uses its canonical vertex's camera-space depth under the smoothed pose, with a 0.25 cm inset away from the camera. The geometry is shared by a depth-only mesh and a shadow receiver. Opaque frame parts cast shadows; transparent lenses do not. The tracked light target keeps the shadow camera around the face. The rear-head ellipsoid's front moved from z=5.5 to z=3 cm, preserving the existing 45° far-arm test.

`pin()`, `PIN_PASSES`, `verticalFov()`, the Ellis reconstruction and its reference bounds are unchanged. There are no new dependencies or server/schema/admin changes.

## Before and after: `/try-on?product=p01`

The same `public/images/hero.webp` image was converted to concatenated JPEG frames and supplied to headless Chrome with the flags from the progress log. Both captures use the same 1440×1100 viewport and default Ellis colour. The source photo already contains glasses; those original glasses remain part of the camera image.

| Before | After |
|---|---|
| ![Before Phase 1.5](before.png) | ![After Phase 1.5](after.png) |

[Native-resolution stage](after-stage.png), [plain camera comparison](raw-camera.png), [generated Margot frame](generated-frame.png), [375 px layout](mobile.png), [machine-readable results](after-checks.json).

Run `npm run dev` and, in another terminal, `node scripts/tryon-visual-check.mjs after`. The runner uses the installed Chrome, existing `sharp` and `ws` packages, an isolated profile under `.sites-runtime`, and DevTools port 9335. `CHROME_PATH` overrides the default Windows executable path. Chrome required execution outside this environment's sandbox to start its GPU subprocess. No real camera was opened by the runner.

## Acceptance evidence

| Spec item | Result |
|---|---|
| Fast turns locked; no resting jitter | Pending real webcam. `FILTER_BETA` raised from 0.01 to 0.15; stationary-jitter and quaternion-continuity tests pass. |
| Camera colour and brightness match | Passed headless comparison against a plain video. At native 1280×720 resolution, the unobstructed right 30% has mean absolute RGB channel difference 0.099 and maximum 2/255. No exposure or tone mapping is applied to video. |
| Soft contact shadow below rims/bridge, follows movement | Shadows visible in the Ellis and generated-frame captures. Tests verify the light target follows the smoothed pose and that face depth/shadows hide on face loss. Confirm moving-shadow appearance on real skin. |
| Nose/cheek cover far frame at 30–45°; far arm hides | Geometry test covers 45° yaw and checks every image ray/depth. Existing 45° rear-head arm-occlusion test passes. Confirm nose/cheek silhouette against a real moving face. |
| No contact parts swallowed, Ellis and generated | Both models visually checked on the approximately 22° test photo; no missing contact rims/bridge. Other angles and face shapes need real-webcam verification. |
| Mirror, release, errors, reduced motion | Passed. Mirror is `scaleX(-1)`; 375 px layout has scroll width 375 and exact video aspect. Reduced-motion emulation is enabled. Stop camera ends the track and clears `srcObject`. Existing denial/missing/busy, cancellation, inference/context-loss and cleanup tests pass. |
| Smooth on mid-range phone | Pending physical phone. Unit test verifies 512 px shadows on a 375 px viewport, versus 1024 px on desktop. Desktop viewport emulation does not verify phone performance. |
| Required commands and one new mesh test | `npm run typecheck`, `npm test` (34/34) and `npm run build` pass. One new face-mesh test checks all 468 vertices, exact topology and buffer reuse in landscape and portrait projections. |
| Headless check plus user real-webcam check | Headless check passed without uncaught exceptions. Real-webcam check requested from the user; no result recorded yet. |

The lazy-bundle test passes: Three.js and MediaPipe stay outside the app entry; tracking/WASM also remain outside the product viewer. Production try-on chunk: 189.02 kB (59.52 kB gzip). The build's existing >500 kB warning concerns the shared lazy 3D chunk.

## Files changed

- `src/tryon/engine.ts`: synchronized video rendering, two live face meshes, contact-shadow light, rear-head sizing, shadow/resource cleanup, aspect sizing and caster selection.
- `src/tryon/face-mesh.ts`: new geometry construction and camera-ray update helper.
- `src/tryon/filter.ts`: faster adaptive smoothing.
- `src/pages/try-on.tsx`, `src/styles.css`: hidden camera source, accessible visible canvas and canvas-owned aspect/layout.
- `tests/tryon.test.mjs`: one new synthetic face-mesh test; existing harness/checks extended for render order, shadow setup, face loss and mobile map size.
- `scripts/tryon-visual-check.mjs`: reproducible fake-webcam screenshots and colour/layout/release checks.
- `doc/feature/3D-MODEL-MODULE.md`: verified checklist items marked, with remaining device checks explicitly pending.
- `doc/feature/phase-1.5/`: this report, before/after and supporting screenshots, and `after-checks.json`.

## Deviations and reasons

- The spec asks for `PCFSoftShadowMap`. The code requests it, but installed Three.js 0.186.1 reports that it was removed and internally replaces it with `PCFShadowMap`. The receiver uses the current PCF implementation with `SHADOW_RADIUS=4`; no package change was made.
- The optional nose-surface bridge anchoring was deferred to Phase 1.6, keeping the established anchor offset intact.
- Acceptance involving real movement and a mid-range phone is left pending, rather than treating a static headless image or viewport emulation as device evidence.

## Constants needing real-webcam/device checks

- `FILTER_BETA=.15`: fast-turn lock versus resting jitter.
- `FACE_MESH_INSET=.25` cm and `OCCLUDER_SIZE={x:15,y:19,z:16}`, `OCCLUDER_POSITION={x:0,y:1,z:-5}`: contact parts, nose/cheek silhouettes and far-arm coverage across faces/angles.
- `FACE_SHADOW_OPACITY=.25`, `SHADOW_LIGHT_POSITION={x:-3,y:12,z:45}`, `SHADOW_RADIUS=4`, `SHADOW_BIAS=-.0001`, `SHADOW_NORMAL_BIAS=.03`: shadow placement, softness, strength and separation from the skin.
- `SHADOW_MAP_SIZE=1024`, `SHADOW_MAP_SIZE_MOBILE=512`, `SHADOW_MOBILE_MAX_WIDTH=760`: smoothness and shadow quality on actual phones; lower map size first if needed.
- `SHADOW_CAMERA_EXTENT=12`, `SHADOW_CAMERA_NEAR=1`, `SHADOW_CAMERA_FAR=80` cm: shadow coverage at head turns and varying camera distances.
