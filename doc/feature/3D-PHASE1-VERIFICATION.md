# Phase 1 implementation and verification

Date: 2026-10-06. Implementation follows `3D-MODEL-MODULE.md`; live browser acceptance is pending. No browser session was available to the Browser tool, so the camera and visual checks below are not signed off.

Changed files:

- `src/App.tsx`, `src/components/shell.tsx`: lazy `/try-on` route, desktop/mobile navigation and page title. The shell preserves this page across query changes so selecting a frame does not restart the camera; other routes retain their existing behaviour.
- `src/pages/try-on.tsx`, `src/styles.css`: user-initiated camera, status messages, mirrored overlay, frame/colour pickers, product links and responsive FORMA styling.
- `src/tryon/engine.ts`, `filter.ts`, `glasses.ts`: camera/tracking/rendering lifecycle, One Euro smoothing, head depth occluder and eight procedural outlines. React stays in the page; product terminology stays in `glasses.ts`.
- `package.json`, `package-lock.json`: only the requested direct dependencies (`three`, `@mediapipe/tasks-vision`, dev `@types/three`), pinned to match the repository's existing version style.
- `tests/tryon.test.mjs`, `tests/tryon-bundle.test.mjs`: geometry, smoothing, synthetic tracking/occlusion, disposal, startup cancellation, error handling and production bundle isolation.
- This verification record.

No scope or architecture deviations. The engine additionally accepts an abort signal and startup status callback to handle navigation/cancellation during camera permission or model loading. Disposing the renderer releases its resources and clears the overlay without forcing context loss, allowing the same canvas to restart.

| Spec acceptance criterion | Evidence / remaining check |
| --- | --- |
| Desktop and mobile “3D Demo” link opens `/try-on` | Shared `NAV` and lazy route implemented; browser navigation check pending. |
| Three.js and MediaPipe load only with `/try-on` | Passed production bundle graph test: neither package is reachable through the entry's static imports; both belong to the lazy route. HTML does not preload it. `npm run build` emits a separate approximately 732 kB `try-on-*.js` chunk, approximately 384 kB entry, and self-hosted WASM/loader assets. |
| Camera starts on click and follows turns/tilts without jitter in Chrome at `localhost:4174` | Gesture-only startup implemented. Synthetic pose, quaternion continuity and jitter suppression tests pass. Real-camera tracking and visible jitter check pending. |
| Far temple hidden at approximately 45° | Depth-write-only occluder implemented. Ray intersection test at 45° confirms the far arm is behind the depth surface while the near arm remains visible. Real-head calibration pending. |
| Instant frame/colour changes without memory growth | 120 replacements tested: every unique replaced geometry/material is disposed exactly once; camera stays open. Picker uses existing store and swatches and updates `?product=`. Browser interaction and GPU heap inspection pending. |
| Clear denied/missing/no-face states; leaving turns camera light off | Error classification, face loss/reacquisition, normal teardown, runtime failure and cancellation during permission/model loading tested. Late streams are stopped and late trackers closed. Browser copy and physical camera-light check pending. |
| 375 px layout, keyboard controls, visible focus | Responsive grid, `minmax(0,…)`, native buttons/links, pressed states and focus styles implemented. Existing reduced-motion rule covers UI transitions. Visual/keyboard check at 375 px pending. |
| Typecheck, test and build | `npm run typecheck`, `npm test` (23 tests), `npm run build` pass. Vite reports the expected large lazy try-on chunk warning. |

Automated inference tests replace only browser devices, renderer and model inference; they use real Three.js geometry and maths. They do not substitute for exercising actual MediaPipe WASM/WebGL on a camera feed.

Manual acceptance procedure:

1. Open `http://localhost:4174` in Chrome. Confirm the desktop “3D Demo” link and, at 375 px, the mobile drawer link. Confirm no Three.js/MediaPipe/model/WASM request before entering the demo.
2. Open `/try-on?product=p01`. Verify the intro appears with camera off. Start, allow access and wait for the model. Check the video and overlay share an uncropped aspect ratio and mirror together.
3. Turn approximately 45° each way, tilt, move to the edges and change distance. Leave/re-enter the frame; verify hiding, “Move into frame”, stable reacquisition and acceptable jitter/lag.
4. Use `/try-on?product=p01&debug=1` to inspect the head volume. Check far-arm occlusion, then test every silhouette/material and swatch. Verify selection updates the URL without interrupting the camera; verify product links.
5. Switch repeatedly and inspect GPU/heap usage. Stop/restart and navigate away, including while startup is pending. Verify the camera light turns off and restart works.
6. Deny camera permission, test with no camera, and test unavailable WebGL/insecure context. Confirm readable messages and appropriate retry behaviour.
7. At 375 px, verify no horizontal scroll; tab through Start/Stop, colours, frame buttons and product link, checking visible focus and Enter/Space activation.

Named values requiring a real-camera check:

- `NOSE_BRIDGE_POSITION` (0, 3.27, 5.24 cm) and `ANCHOR_OFFSET` (0, 0, +1 cm): bridge height, forward clearance and alignment.
- `CAMERA_FOV` (63°): edge drift and distance behaviour.
- `OCCLUDER_SIZE` (15 × 19 × 18 cm), `OCCLUDER_POSITION` (0, 1, −3 cm): far-arm hiding without clipping the front rim. `OCCLUDER_DEBUG_OPACITY` is .25.
- `FILTER_MIN_CUTOFF` (1), `FILTER_BETA` (.01), `FILTER_D_CUTOFF` (1): jitter versus responsiveness across turns and tilts.
- `LENS_HEIGHT_RATIO` and the initial rim/temple geometry: visual silhouette and fit across all eight shapes. This remains an average-fit preview as specified.
