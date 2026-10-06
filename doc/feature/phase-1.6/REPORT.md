# Phase 1.6 verification — 2026-10-06

Room lighting and camera matching are implemented. All headless-checkable acceptance criteria pass. Real rooms and mid-range-phone performance still need the user's check; the simulated room fixtures do not reproduce camera auto-exposure, white balance or sensor noise.

`npm run typecheck`, `npm test` (35/35), and `npm run build` pass. There is one new light-estimator test. The lazy-bundle test passes: Three.js and MediaPipe remain outside the app entry, and the product viewer still does not load tracking/WASM. The try-on chunk is 194.07 kB (61.82 kB gzip), versus 189.02 kB (59.52 kB gzip) in Phase 1.5. The existing warning about the shared lazy 3D chunk exceeding 500 kB remains.

## Before and after: `/try-on?product=p01`

The before capture is the current Phase 1.5 implementation, taken before changing the engine. Both captures use the default Ellis colour, `public/images/hero.webp` as the fake webcam, and the same 1440×1100 viewport. The source photograph already contains glasses; these remain in the raw camera image.

| Phase 1.5 baseline | Phase 1.6 |
|---|---|
| ![Before](before.png) | ![After](after.png) |

[Native-resolution after stage](after-stage.png), [plain camera comparison](raw-camera.png), [generated Margot frame](generated-frame.png), [375 px layout](mobile.png), [full renderer/check results](after-checks.json).

## Headless acceptance evidence

The runner samples the actual Three.js scene and composite uniforms using a test-only hook in its isolated Chrome session. The application exposes no new debug API. Every fixture tracked the face, used exactly the existing two lights, rendered its 3D layer at 1280×720, kept the key above the face, passed the raw-video comparison, respected reduced motion, and released the camera. There were no uncaught exceptions or shader errors. MediaPipe's normal initialization diagnostics are recorded in the JSON files.

| Fixture | Hemisphere intensity | Key intensity | Key x/y offset (cm) | Shadow opacity | Environment | Lens opacity / clear coat | Grain | Raw-video mean difference (/255) |
|---|---:|---:|---|---:|---:|---|---:|---:|
| [Original](after-stage.png) | 1.120 | 2.630 | −6.73 / 11.21 | .136 | .385 | .060 / .385 | .025 | .099 |
| [Bright](bright/after-stage.png) | 1.120 | 3.750 | −6.54 / 11.22 | .134 | .385 | .060 / .385 | .025 | .094 |
| [Dim](dim/after-stage.png) | .200 | 1.050 | −7.08 / 11.18 | .140 | .0875 | .020 / .0875 | .075 | .060 |
| [Warm](warm/after-stage.png) | .932 | 2.008 | −6.59 / 11.18 | .135 | .385 | .058 / .385 | .025 | .084 |
| [Cool](cool/after-stage.png) | .784 | 1.515 | −6.99 / 11.23 | .139 | .343 | .049 / .343 | .026 | .090 |
| [Camera-left light](left/after-stage.png) | 1.120 | 2.155 | −11.53 / 11.86 | .188 | .385 | .060 / .385 | .025 | .099 |
| [Camera-right light](right/after-stage.png) | .200 | 1.050 | +8.61 / 9.17 | .244 | .0875 | .020 / .0875 | .075 | .059 |

The left/right fixtures split the illumination through the test face. They also change whole-frame brightness differently, so their intensities are not expected to be equal. Camera-left appears on display-right because the entire finished canvas is mirrored.

- **Bright versus dim:** material albedo is unchanged. The black acetate stays dark in the bright capture and retains a highlight in the dim capture. Dim lighting lowers the rig/reflections and raises grain to the configured 3× cap. Clear lenses are capped at opacity .06 instead of the Ellis overlay's original .1; the eyes remain visible.
- **Warm versus cool:** measured hemisphere/key colours are `[1,.806,.670]` and `[.868,.934,1]` in linear RGB. All channels stay within the white-mix bound `[.6,1]`, and the frame retains its material colour.
- **Side lighting:** both key shifts follow the unmirrored image. Shadow opacity rises with directional contrast; y offsets remain positive, so contact shadows remain below the rims. The unit test also exercises top/bottom direction and clipped face bounds.
- **Smoothing:** the new test verifies linear sRGB conversion, the face bounding box, a bright-left warm image, a bounded hemisphere cast, the reversed direction, and exponential smoothing reaching `1−exp(−1)` (63.2%) after .5 seconds. Duplicate timestamps are stable and resetting removes the prior room. The engine reads only every fourth camera frame but smooths/applies every frame.
- **Softness/grain:** the native-resolution captures use four-sample MSAA and a five-tap .6 px blur on the premultiplied 3D layer. Grain rises from .025 to .075 in the dim fixture; contrast and saturation are .94. Exact softness/noise matching to a real camera remains a tuning check.
- **Raw camera:** the original fixture's mean channel difference remains **.099/255**, the same as Phase 1.5, with maximum difference 2/255. All seven fixtures are below the spec's .5/255 threshold. The comparison uses the unobstructed right 30% at native resolution.
- **Reduced motion:** the actual pass seed is zero under `prefers-reduced-motion`. The estimator/engine test verifies it stays zero across frames. Screenshot differences also decrease when animation is disabled: the original fixture's whole-image mean difference drops from .070 to .032/255. Small remaining changes are tracking/lighting variation, rather than grain animation. [Animated pair](grain-moving-a.png), [second animated frame](grain-moving-b.png), [static pair](grain-static-a.png), [second static frame](grain-static-b.png).
- **Regressions/resources:** existing pinning, face-ray geometry, 45° far-arm occlusion, filters, switching/disposal and error/cancellation tests pass. The extended engine check verifies detect → video → offscreen 3D → composite order, pixel ratio 1 despite device DPR 3, native target size, samples 4, premultiplied blending, resize replacement, single target/pass disposal, sample cadence and reduced-motion changes. The 375 px capture has scroll width 375 and exact video aspect. Stop ends the track and clears `srcObject`.

The real-room and physical-phone clauses in the acceptance list remain pending. In particular, a clean still photograph darkened in software cannot demonstrate that grain matches a noisy sensor or that mid-range phone rendering stays smooth. If a phone is slow, skip blur taps before dropping grain, as the spec directs.

## Rendering and lifecycle

The estimator reads a detached 32×18 2D canvas with `willReadFrequently:true`. It converts sRGB through a lookup table, measures whole-frame colour/luminance and the first 468 landmarks' bounding-box halves, and smooths in seconds. It normalizes the ambient colour to remove brightness before mixing the cast toward white. A new estimator is created for every engine session.

The existing hemisphere, directional/shadow light, shadow material, environment strength and transparent physical materials follow the estimate. Clear lenses have a narrow opacity clamp; tinted lenses retain their tint with a modest room-dependent opacity adjustment. Lens base opacity is captured once on object replacement, preventing cumulative changes.

The video quad draws directly to the visible native-resolution buffer with `toneMapped:false`. The 3D scene renders to an alpha, half-float MSAA target; a separate shader blurs premultiplied colour/alpha together, unpremultiplies for ACES and colour matching, adds luminance grain, then premultiplies for blending over the raw video. The shader samples only the 3D target. Target replacement updates the sampler and texel size when video dimensions change. Engine disposal releases the target and its owned texture, pass material/geometry, video texture, lights/shadows, sampling-canvas backing store and reduced-motion listener.

Protected code was checked against the saved pre-change engine: `pin()`, `PIN_PASSES`, `verticalFov()` and `ANCHOR_OFFSET` are identical. `face-mesh.ts` and `ellis.ts` retain their original SHA-256 hashes (`A0678A74…` and `D375B5DF…`). No dependencies or server/schema/admin files changed.

## Reproduce

With `npm run dev` running on port 4174:

```powershell
node scripts/tryon-visual-check.mjs after
node scripts/tryon-visual-check.mjs after doc/feature/phase-1.6/dim dim
node scripts/tryon-visual-check.mjs after doc/feature/phase-1.6/warm warm
```

The fourth argument accepts `neutral`, `bright`, `dim`, `warm`, `cool`, `left` or `right`. The third argument overrides the output directory; it defaults to Phase 1.6. `before` captures the current code as a baseline and should only be run before an implementation change. The source image is converted into repeated JPEG frames and opened with the fake-device/fake-UI/file-capture flags from the progress log. `CHROME_PATH` overrides the Windows default. The runner uses the already installed `sharp`/`ws` packages, an isolated `.sites-runtime` profile, and DevTools port 9335. Run fixtures sequentially. Chrome required execution outside this environment's sandbox for its GPU subprocess; no real webcam was opened.

## Files changed

- `src/tryon/engine.ts`: room sampling/application, native pixel ratio, offscreen target/composite rendering, lens updates, resize and cleanup.
- `src/tryon/lighting.ts`: new estimator, exponential smoothing, rig/lens mapping and named tuning constants.
- `src/tryon/camera-match.ts`: new five-tap blur, luminance grain, colour matching and premultiplied compositor.
- `tests/tryon.test.mjs`: one new light-estimator test and existing harness/checks extended for the render target, lighting cadence and lifecycle.
- `scripts/tryon-visual-check.mjs`: Phase 1.6 output, synthetic room fixtures, actual renderer inspection, stricter colour comparison and grain/reduced-motion captures.
- `doc/feature/3D-MODEL-MODULE.md`: headless acceptance status and report link.
- `doc/feature/phase-1.6/`: this report, before/after and supporting images, room-fixture images and machine-readable results.

## Deviations and reasons

No functional scope deviations. ACES/exposure 1.45 is applied once inside the 3D composite rather than during the offscreen scene draw, because Three.js skips renderer tone mapping for ordinary render targets. The target uses half-float RGBA to retain highlights until that ACES step. Both choices preserve the required 3D-only tone mapping and raw video path.

Real-room and mid-range-phone acceptance remains unclaimed. No mobile blur reduction was applied without performance evidence.

## Constants needing real-webcam checks

Test bright office, dim, tungsten/warm, daylight/cool and window/lamp side lighting, preferably while moving between them:

- `LIGHT_SAMPLE_EVERY=4`, `LIGHT_SAMPLE_WIDTH=32`, `LIGHT_SAMPLE_HEIGHT=18`, `LIGHT_SMOOTHING=.5`: sampling stability and adaptation speed as the camera's auto-exposure changes.
- `LIGHT_REFERENCE_LUMINANCE=.18`, `LIGHT_MIN=.25`, `LIGHT_MAX=1.4`, `LIGHT_AMBIENT_INTENSITY=.8`, `LIGHT_KEY_INTENSITY=3`, `LIGHT_KEY_MIN=.35`, `LIGHT_KEY_MAX=1.25`, `LIGHT_GROUND_SCALE=.6`: brightness/readability of black acetate in bright and dim rooms.
- `LIGHT_COLOR_MIX=.4`: warm/cool cast without tinting the frame too much.
- `KEY_SHIFT_MAX_X=18`, `KEY_SHIFT_MAX_Y=8`, `KEY_SHIFT_MIN_Y=4`, existing `SHADOW_LIGHT_POSITION`: side/top/bottom direction and shadows below the rims.
- `LIGHT_SHADOW_FLAT=.35`, `LIGHT_SHADOW_DIRECTIONAL=1.2`, existing `FACE_SHADOW_OPACITY`: soft flat-room shadows versus stronger side-lit contact.
- `LIGHT_ENVIRONMENT_MAX=1.1`, existing `ENVIRONMENT_INTENSITY=.35`, `LIGHT_LENS_CLEARCOAT=.35`, `LIGHT_LENS_OPACITY_SCALE=.5`, `LIGHT_LENS_OPACITY_MIN=.02`, `LIGHT_LENS_OPACITY_MAX=.06`, `LIGHT_CLEAR_LENS_THRESHOLD=.2`, `LIGHT_TINT_OPACITY_MIN=.9`: reflections and clear/tinted lenses, especially milky bright-office reflections.
- `CAMERA_BLUR_PX=.6`, `CAMERA_GRAIN=.025`, `GRAIN_DARK_MAX=3`, `CAMERA_CONTRAST=.94`, `CAMERA_SATURATION=.94`: softness, dim-room sensor noise and tonal match at native resolution. `CAMERA_MSAA_SAMPLES=4` also needs a physical-phone performance check.
