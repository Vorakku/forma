# 3D Try-On Module

Status: Phase 1 and Phase 1.5 done (live try-on at `/try-on` with video sync, face occlusion and contact shadows; The Ellis 3D viewer). **Phase 1.6 is implemented and headless-verified. Real-room and phone checks remain pending; see its acceptance list and report at the end.**
Last updated: 2026-10-06

## Goal

Let a shopper turn on their camera and see a FORMA frame on their own face, live. The same engine should later power a watch shop (frames on the face, watches on the wrist) and possibly other products. FORMA is the first project to use it.

## Architecture decisions

These were settled while discussing the idea. Do not reopen them in Phase 1.

1. **All per-frame work runs on the device.** Camera, tracking, smoothing and rendering happen in the browser. A server round trip can't fit in a 16–33 ms frame budget. Keeping it local also means camera frames never leave the device (privacy) and processing costs nothing on our side. The 3D engine will **not** be a backend microservice.
2. **The core is generic; products are plugins.** The engine works in terms of trackers, anchors (`face.noseBridge`, later `hand.leftWrist`), objects and occluders. It must never contain words like "glasses" or "watch". Glasses are one plugin built on it, and watches will be another.
3. **Stack:** TypeScript, `@mediapipe/tasks-vision` (Face Landmarker for now; Hand Landmarker later for watches), and `three`. No React inside the engine. React is only the page around it.
4. **Use the global commerce server.** FORMA is store #2 on MEGA-PROJECT's Hono/PostgreSQL server. In Phase 3, try-on settings belong on its product, GLB files use the media module's S3-compatible storage (local MinIO), and editing belongs in the shared `admin/`. Model compression remains a script. The owner approved replacing the former Worker/D1/R2 plan in task 11.
5. **Start inside FORMA, not in a monorepo.** Build the module in `src/tryon/`. Move it into a shared package only when the watch project actually needs to import it.
6. **Skip until there's a real need:** ONNX Runtime, WebGPU fallback chains, Web Workers for inference (add only if profiling shows jank), analytics, monorepo tooling, microservices.

## Phases

| Phase | Scope | Backend? |
|---|---|---|
| **1. Face demo (now)** | "3D Demo" link in the navbar opens `/try-on`: camera, face tracking, a frame drawn in code from product data, a frame picker | No |
| 2. Real models | Load GLB files per product (same anchor contract), with a fallback to the code-drawn frame | No (GLBs in `public/` while testing) |
| 3. Store integration | Global product try-on fields, GLBs in media S3 storage, shared admin screen for offset/scale, "Try on" button on the product page | Yes (global server + shared admin) |
| 4. Wrist tracking | Hand Landmarker tracker plus a wrist anchor, used by the watch project. This is the point to extract `src/tryon/` into a package | No |

---

## Phase 1 spec — face try-on demo

### User flow

1. A **"3D Demo"** link appears in the main navigation (desktop `main-nav` and the mobile drawer; both read the `NAV` array in `src/components/shell.tsx`).
2. It goes to **`/try-on`**, a new page inside the normal `Shell`.
3. Before the camera starts, the page shows a short intro: "Try frames on with your camera. Video stays on your device and is never uploaded." plus a **Start camera** button. The camera must start from a user gesture.
4. After the user allows the camera, the page shows a mirrored live video with the selected frame tracking their face.
5. A picker below or beside the video lists every product (image + name). Picking one swaps the frame instantly. A colour picker uses that product's `swatches`.
6. If the frame is a product with a page, a link goes there ("View The Ellis").
7. States to handle with clear copy: loading the model, camera permission denied, no camera found, no face detected ("Move into frame"), unsupported browser. Leaving the page stops the camera tracks and disposes WebGL resources.

### Files

```
src/tryon/
  engine.ts    camera + Face Landmarker + Three.js scene + loop. Generic: knows anchors, not glasses.
  filter.ts    One Euro filter (scalar), used to smooth the pose
  glasses.ts   builds a THREE.Group for a Product from its dimensions/shape/swatch/category
src/pages/try-on.tsx   React page; lazy-loaded route
```

- Register the route lazily in `src/App.tsx` like the other lazy pages: `const TryOn=lazy(()=>import('@/pages/try-on')...)`, `<Route path="/try-on" .../>`. `three` and MediaPipe must only download when this route opens, never in the main bundle.
- Add `['/try-on','3D Demo']` to `NAV`.
- Match the existing code style: compact TSX, FORMA classes in `src/styles.css`, existing components (`PageTitle`, `ProductImage`, `Breadcrumb`) and tokens (`--ink`, `--line`, `--soft`, `--radius`). Respect `prefers-reduced-motion` in any UI transitions.

### Engine (`engine.ts`)

The API is small and React-free. Roughly:

```ts
const engine = await createFaceEngine({ video, canvas });   // loads WASM + model, opens camera
engine.setObject(group);       // what to attach at the face anchor (replaces the previous one)
engine.onStatus(cb);           // 'loading' | 'tracking' | 'no-face' | 'error'
engine.dispose();              // stop tracks, cancel loop, dispose renderer/geometries
```

One face-only implementation. No tracker interface or plugin registry yet: an interface with a single implementation isn't needed until the wrist tracker exists (Phase 4).

**MediaPipe setup**
- `FaceLandmarker.createFromOptions` with `runningMode: 'VIDEO'`, `numFaces: 1`, `outputFacialTransformationMatrixes: true`, `baseOptions.delegate: 'GPU'`. If GPU fails, retry with CPU.
- Self-host the WASM through Vite instead of a CDN. The package exports the files: import `@mediapipe/tasks-vision/vision_wasm_internal.js?url` and `.../vision_wasm_internal.wasm?url`, then pass `{ wasmLoaderPath, wasmBinaryPath }` as the fileset.
- Model file: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` (about 4 MB). Keep it as one constant so it can move to media S3 storage later.
- Loop: use `video.requestVideoFrameCallback` where available (fall back to `requestAnimationFrame`), call `detectForVideo(video, performance.now())`, update the pose, render. Main thread is fine for Phase 1.

**Mapping the face pose into Three.js**
- `facialTransformationMatrixes[0].data` is a column-major 4×4. Load it with `new THREE.Matrix4().fromArray(data)`. It maps MediaPipe's *canonical face model* (units: **centimetres**) into camera space, with the camera at the origin looking down −Z.
- Use a `THREE.PerspectiveCamera` with **vertical FOV 63°**, near 1, far 10000, aspect = video width / height. That is MediaPipe's default face-geometry camera. Verify it against the live overlay and adjust if the frame drifts at the edges.
- Draw the canvas over the video at exactly the video's aspect ratio. **Do not crop the video with `object-fit: cover`**, or the projection won't line up. Mirror the video *and* the canvas with CSS `transform: scaleX(-1)` for the selfie view; the matrix stays unmirrored.
- Useful canonical-model points (cm), taken from MediaPipe's `canonical_face_model.obj`:

| Landmark | Meaning | x, y, z |
|---|---|---|
| 168 | nose bridge between the eyes | 0, 3.27, 5.24 |
| 6 | nose, just below the bridge | 0, 2.47, 5.79 |
| 33 / 263 | outer eye corners | ±4.45, 2.66, 3.17 |
| 133 / 362 | inner eye corners | ±1.86, 2.59, 3.76 |
| 234 / 454 | face edge near the ears | ±7.66, 0.67, −2.44 |
| 1 | nose tip | 0, −1.13, 7.48 |

  The anchor `face.noseBridge` is a child group placed at landmark 168, pushed forward slightly so the frame front sits in front of the skin (start with z ≈ +1.0 cm). Export these offsets as named constants: they are tuning values and will need calibration.

**Head occluder (required, not optional)**
- Add an invisible head shape (an ellipsoid of about 15 × 19 × 18 cm, centred around (0, 1, −3) in canonical space, tuned by eye) with `colorWrite: false`, `depthWrite: true` and `renderOrder` lower than the frame. It hides the temple arms behind the head when you turn. Without it the frame looks like a sticker. Expose a debug toggle (for example `?debug=1`) that renders it semi-visible.

**Smoothing (`filter.ts`)**
- Decompose the matrix into position, quaternion and scale. Run each component through a **One Euro filter** (min cutoff ≈ 1.0, beta ≈ 0.01, d-cutoff 1.0, all named constants). Keep quaternion signs continuous (flip if the dot with the previous one is negative), normalise, then recompose. Do not use a fixed `lerp`.
- Hide the object when there's no face. When the face comes back, reset the filter so the frame doesn't swoop in from its old position.

**Lighting:** an ambient/hemisphere light plus one soft directional light from the front-top. Use `renderer.outputColorSpace = SRGBColorSpace`, a transparent background (`alpha: true`), and `setPixelRatio(min(devicePixelRatio, 2))`.

### Code-drawn frame (`glasses.ts`)

`buildGlasses(product, colorIndex): THREE.Group`. Build in **millimetres**, then scale the group by 0.1 to get centimetres.

- Parse `product.dimensions` (`'52 · 18 · 145'`) → lens width L, bridge B, temple length T.
- Lens height depends on `product.shape` (starting ratios, tune by eye): Round 0.9·L, Oval 0.75·L, Rectangle 0.7·L, Square 0.85·L, Cat-eye 0.72·L, Aviator 0.85·L, Geometric 0.82·L, Browline 0.72·L.
- One 2D lens outline function per shape (`THREE.Shape`): Round = circle/ellipse; Oval = ellipse; Rectangle/Square = rounded rectangle; Cat-eye = rounded rectangle with the outer top corner lifted; Aviator = teardrop (wider at top, deeper towards the nose bottom); Geometric = octagon/hexagon; Browline = rounded rectangle with a thicker top band.
- Rim: `ExtrudeGeometry` of the outline with an inset copy as the hole (rim ≈ 4 mm acetate / 1.5 mm metal; extrude depth ≈ 4 mm acetate / 1.5 mm metal, small bevel). Lens centres at x = ±(B/2 + L/2), front plane z = 0, bridge centre at the origin (the anchor point).
- Bridge: a short arch or bar spanning B at the upper third. Temple arms: thin bars from the outer hinge (x = ±(B/2 + L + rim)) running back along −Z for T mm, slightly angled outwards, with the last 25 mm bent down.
- Material from `product.swatches[colorIndex].hex` and `product.material`: `MeshStandardMaterial`, roughness ≈ 0.35, metalness 0.9 for `Metal`, 0.1 for acetate. For `Mixed`, use acetate rims and a metal bridge and arms.
- Lenses: `optical` → nearly clear (`MeshPhysicalMaterial`, opacity ≈ 0.08, a slight reflection); `sun` → dark tint (opacity ≈ 0.75).
- Dispose geometries and materials when a frame is replaced.

Phase 2 swaps this for `GLTFLoader` with the same contract: GLB in metres or cm (decide and document), origin at the bridge centre, front facing +Z, temples along −Z.

### Product data

Read products from the existing store (`useApp(s=>s.products)`). There's no new API and no schema change. Default to the product passed as `?product=<id>` if present, otherwise the first product. Keep `?product=` updated as the user picks frames, so a link can open a specific frame.

### Acceptance criteria

- [ ] "3D Demo" shows in desktop nav and the mobile drawer, and opens `/try-on`.
- [ ] `three` and `@mediapipe/tasks-vision` are only in the lazy chunk for `/try-on` (check the `npm run build` output).
- [ ] On `localhost:4174` in Chrome: the camera starts after the button click, and the frame follows head turns and tilts without visible jitter.
- [ ] Turning your head about 45° hides the far temple arm behind your head (occluder works).
- [ ] Switching products and colours updates the frame instantly with no memory growth (geometries and materials disposed).
- [ ] Denied or missing camera and no-face states show clear messages. Leaving the page turns the camera light off.
- [ ] Layout works at 375 px wide with no horizontal scroll. Controls are keyboard reachable with visible focus.
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass.

### Out of scope for Phase 1

Server/schema/admin changes, GLB loading, true-to-size scaling from the iris (see below), wrist tracking, Web Workers, analytics, screenshots/sharing, a "Try on" button on product pages.

---

## Known limits and later upgrades

- **Size accuracy.** MediaPipe's pose assumes an average-sized face, so every face is treated as average and the frames show "average fit". Fix later with the iris: an iris is about 11.7 mm across for almost everyone, so iris size in pixels gives real millimetres per pixel and a true face width.
- **Camera access needs HTTPS or `localhost`.** Testing on a phone needs an HTTPS tunnel or a local certificate.
- **Model hosting.** The face model loads from Google's CDN during the demo. Move it to media S3 storage or `public/` before relying on it.
- **Performance.** If mid-range phones stutter, first lower detection to every other video frame while still rendering every frame. Only then move inference into a Web Worker (watch for OffscreenCanvas and Safari quirks).
- **Watches are much harder than glasses.** The Hand Landmarker gives a wrist point, not the wrist's orientation or thickness, and the hand must be in view. Expect a cylinder occluder for the wrist and much more tuning.

---

## Progress log (2026-10-06)

What exists now, and what was learned while building it. Read this before changing tracking or rendering.

- **Phase 1 shipped:** "3D Demo" link → `/try-on` (lazy loaded). The engine is `src/tryon/engine.ts`, smoothing is `filter.ts`, generated frames are `glasses.ts`, and the page is `src/pages/try-on.tsx`.
- **Pose pinning (important).** MediaPipe's facial transformation matrix gets the *rotation* right, but its *translation and depth* are wrong for real cameras (it assumes a 63° camera and an average face). The frame floated onto the temple. `pin()` keeps the rotation and moves the pose along the camera ray so canonical landmark 168 (nose bridge) lands on the detected landmark 168, and the outer eye corners (33/263) match their detected width. It runs `PIN_PASSES = 3` times per frame; a single pass undershoots the depth. A test recovers a deliberately wrong pose to under 1 mm.
- **Field of view.** The render camera's vertical FOV comes from the video shape with a 75° diagonal (`verticalFov()`): about 41° for a landscape webcam, about 68° for a portrait phone. MediaPipe's 63° put faces about 23 cm away and pulled the arms toward the nose.
- **Arms.** Generated arms splay to `TEMPLE_OPEN_HALF_WIDTH` (80 mm) and drop and bend toward the ear. The head is an ellipsoid occluder (`OCCLUDER_*`) that hides the far arm when the head turns.
- **The Ellis uses the reference model** (`doc/feature/reference/glasses-threejs-package`). `src/tryon/ellis.ts` is a TypeScript port of its `glasses-model.js`, and its bounds match the reference `VALIDATION.json` to 0.1 mm. `glasses.ts` routes reference products through `REFERENCE_MODELS` in both the viewer (`buildDisplayGlasses`) and the overlay (`buildOverlayGlasses`). Overlay differences: the lenses use a clear coat (transmission can't see the video behind the canvas), and the arms flex open by `TRYON_TEMPLE_SPLAY_DEG` (4°).
- **Lighting.** The overlay uses the reference studio balance: ACES tone mapping at exposure 1.45, a hemisphere light at 0.8, and a key light at 3 from the upper left. `ENVIRONMENT_INTENSITY` is 0.35, because the frame faces the camera head-on and full-strength room reflections turn black acetate grey.
- **Headless visual check.** Chrome can use a still photo as a fake webcam (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=face.mjpeg`; an MJPEG is just concatenated JPEG frames). Screenshot through the DevTools protocol. `public/images/hero.webp` works well as the test face (head turned about 22°). It's a telephoto photo, so confirm perspective-sensitive tuning on a real webcam.
- **User feedback from a live test:** *"Feels like a filter, not like it's truly on my face."* Causes, in order of impact: (1) the overlay lags the video, so the frame slides when you move; (2) nothing on the face interacts with the frame, with no contact shadows and no occlusion by the nose, cheeks or face edge; (3) lighting doesn't match the room; (4) the frame is too sharp for webcam footage; (5) the bridge floats just in front of the nose. Phase 1.5 fixes (1) and (2). (3) to (5) come in Phase 1.6.

---

## Phase 1.5 spec — make it sit on the face

Client-only. No server, schema or admin changes. No new dependencies.

### A. Video and glasses in one canvas (removes sliding)

**Problem:** the `<video>` element shows the newest camera frame, while the canvas shows glasses computed from a frame that's 20–40 ms older, plus One Euro lag. When you move, the frame swims.

**Fix:** draw the video into the WebGL canvas, using the same frame that was just tracked, so they can't drift apart.
- Keep the `<video>` element as the frame source, but don't show it. Visually hide it (for example `opacity:0; position:absolute; width:1px; height:1px`); don't use `display:none`, because some browsers stop decoding hidden video. The canvas becomes the visible stage, keeping the mirror via CSS `scaleX(-1)` and the exact video aspect ratio.
- Inside the existing `requestVideoFrameCallback` tick: run `detectForVideo` → update the pose → upload the video texture → render, all in the same callback, so the drawn video frame is the one that was tracked. Use a `THREE.VideoTexture` (or a `Texture` with `needsUpdate = true` each tick) with `colorSpace = SRGBColorSpace`.
- Draw it as a full-screen background (a full-screen quad drawn first, or `scene.background`) that is **not tone-mapped** (`toneMapped: false`) and doesn't write depth. The video must look identical to the raw camera, with no ACES, no exposure change and no colour shift. Check this by comparing against a plain `<video>`.
- With sync fixed, the remaining lag is the One Euro filter. Raise `FILTER_BETA` until fast head turns stay locked without bringing jitter back at rest. Expect about 0.05–0.3; tune on a real webcam.
- In the `rAF` fallback path (no `requestVideoFrameCallback`), keep the same order: detect, then render that frame.

### B. A live face mesh: occlusion and contact shadows

**Problem:** the only face proxy is a rigid ellipsoid. Nothing on the face covers the frame, and the frame casts no shadow on the skin, which is the strongest "it's resting on me" cue.

**Data (already in the repo):** `src/tryon/face-mesh.json` holds MediaPipe's canonical face model: `vertices` (468 × [x, y, z] cm, where vertex *i* = landmark *i*) and `triangles` (898 × 3 indices). It was extracted from `canonical_face_model.obj` (Apache-2.0).

**Build one `BufferGeometry` (468 vertices, the 898 triangles) and update its positions every tracked frame:**
- For each landmark *i*: take the detected normalised `(x, y)`, cast the camera ray through it (NDC `x*2−1`, `1−y*2`, unproject, as `pin()` does), and place the vertex on that ray at the **depth of canonical vertex *i* transformed by the pinned, smoothed face pose**. The result matches the image exactly in 2D, follows expressions and the user's face shape, and gets plausible depth from the pose.
- Then push every vertex back along its ray by `FACE_MESH_INSET` (start at 0.25 cm) so parts touching the skin (bridge, rims near the cheeks) aren't swallowed by depth fighting. Recompute normals only if a material needs them.
- Keep the mesh in world space (a scene child, not inside the face group), or convert to face-local with the inverse face matrix. Either way, hide it when no face is tracked.

**Use the same geometry for two meshes:**
1. **Occluder:** `MeshBasicMaterial({colorWrite:false, depthWrite:true})`, `renderOrder` before the frame (like the ellipsoid). The user's real nose, cheeks and jaw edge now cover the frame where they're in front of it.
2. **Contact-shadow receiver:** `ShadowMaterial({opacity: FACE_SHADOW_OPACITY})` (start at 0.25), `receiveShadow = true`, drawn after the video background so the shadow darkens the real skin. Enable `renderer.shadowMap` (`PCFSoftShadowMap`). The frame meshes `castShadow = true`, lenses no. Add one shadow-casting directional light, roughly from above and slightly in front of the face, and fit its shadow camera tightly around the face (about ±12 cm) so the map has enough resolution. Use 1024 px; drop to 512 px on mobile if it's slow. The shadow should fall just below the rims and the bridge onto the nose and cheeks, soft and subtle, not a hard black line.

**Keep the ellipsoid occluder, but only for the back of the head and the ears,** which the face mesh doesn't cover. Move or shrink it (`OCCLUDER_*`) so its front sits behind the face mesh; otherwise it hides the frame where the real face isn't. Arms must still disappear behind the head on a turn.

**Bridge contact (small, optional within B):** with the mesh available, the nose-bridge anchor can rest on the real nose surface (mesh vertex 168 and its neighbours) instead of the canonical depth plus `ANCHOR_OFFSET.z`. Do this only if it's simple; otherwise leave it for Phase 1.6.

### Acceptance (Phase 1.5)

Implementation and headless verification: [Phase 1.5 report](phase-1.5/REPORT.md). Real-webcam motion/angle checks and mid-range-phone performance remain pending; unchecked items below retain those requirements.

- [ ] Shake your head quickly in front of a real webcam: the frame stays locked to the face with no visible sliding. Still jitter-free when you hold still.
- [x] The video in the canvas looks identical to the raw camera: same colour and brightness, no tone mapping.
- [ ] A soft contact shadow is visible under the rims and bridge on the nose and cheeks, and follows head movement.
- [ ] Turning about 30–45°: the nose and cheek edge cover the far lens and rim where they're physically in front, and the far arm still hides behind the head.
- [ ] No frame parts vanish where they touch the face (inset tuned), on both The Ellis and a generated frame.
- [x] Mirrored selfie view still correct; camera release, error states and reduced motion unchanged.
- [ ] Mid-range phone: rendering stays smooth. If shadows or the mesh cost too much, lower the shadow map size first.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass. Add one test that builds the face mesh from synthetic landmarks (projected canonical vertices under a known pose) and checks the vertices land on their image rays at the expected depth minus the inset. Keep existing tests green.
- [ ] Visual check in headless Chrome with the fake webcam (see the progress log), plus a real-webcam check by the user.

### Out of scope for Phase 1.5

Room-light estimation from the video, camera-matched blur and grain, and iris-based true scale (Phase 1.6). Server/admin work (Phase 3). More reference models.

---

## Progress log — Phase 1.5 (2026-10-06)

- **Done and reviewed.** Codex's report with screenshots is in `doc/feature/phase-1.5/REPORT.md`. Typecheck, all 34 tests and the build pass. The user tested live and was happy with the result ("surprisingly well").
- **Video sync:** the camera frame is drawn into the WebGL canvas as a quad that is not tone-mapped, in the same `requestVideoFrameCallback` tick as detection, the pose and the mesh. The `<video>` element is hidden at `opacity:0`. `FILTER_BETA` is now 0.15.
- **Face mesh:** `src/tryon/face-mesh.ts` updates one dynamic 468-vertex geometry per frame. Its positions come from the image rays, its depth from the canonical vertex under the smoothed pose, inset by `FACE_MESH_INSET`. It's shared by a depth-only occluder and a `ShadowMaterial` receiver. The key light is the shadow light: it follows the face at `SHADOW_LIGHT_POSITION` with a tight shadow camera (`SHADOW_*`). The ellipsoid now covers only the back of the head (`OCCLUDER_POSITION.z = -5`).
- **Shadow map type:** `PCFSoftShadowMap` was removed in Three.js 0.186 (it logged a console warning). The engine and viewer now use `PCFShadowMap` with `SHADOW_RADIUS` for softness.
- **Bridge contact (item 5): won't do.** The user likes the current placement. Keep `ANCHOR_OFFSET` as it is.
- **Still pending on real hardware:** fast-turn lock versus resting jitter, the shadow's look on real skin, and phone performance (see the Phase 1.5 acceptance list).
- **Seen in the user's live screenshot:** in a bright office, the clear lenses show a large milky white reflection. Phase 1.6 lighting should scale lens reflections with the room's brightness.

---

## Phase 1.6 spec — match the room and the camera

Fixes item (3), lighting that doesn't match the room, and item (4), a frame too sharp and clean for webcam footage. Client-only, no new dependencies, no server/schema/admin changes. Don't change `pin()`, `PIN_PASSES`, `verticalFov()`, the face mesh maths or the Ellis geometry.

### A. Room lighting from the video (item 3)

**Problem:** the frame is lit by a fixed studio rig (hemisphere 0.8, key 3 from the upper left, environment 0.35), whatever the room. Under office ceiling lights or a window to one side it looks pasted on, and the lenses go milky in bright rooms.

**Measure the light every few frames, cheaply:**
- Every `LIGHT_SAMPLE_EVERY` frames (start at 4), draw the current video frame into a tiny 2D canvas (for example 32 × 18, `willReadFrequently: true`) in the same tick, and read it with `getImageData`. That's one small readback, not per pixel on the GPU.
- Compute in **linear** RGB (convert from sRGB first):
  - **Ambient:** mean colour and luminance of the whole frame.
  - **Face light:** mean luminance of the face region, using the face's landmark bounding box mapped to the tiny canvas. Also the **left vs right** and **top vs bottom** halves of that box, which give the key light's direction. Mind the mirror: landmarks and the sampled image are unmirrored; only the CSS display is mirrored.
- Smooth every estimate over time (exponential, about 0.5 s, `LIGHT_SMOOTHING`) so lights never flicker. Reset the smoothing when the camera restarts.

**Drive the existing lights (no new rig):**
- **Hemisphere:** sky colour = white-balanced ambient colour mixed toward white (`LIGHT_COLOR_MIX`, about 0.4, so the frame picks up warm or cool casts without turning orange or blue). Intensity scales with ambient luminance relative to `LIGHT_REFERENCE_LUMINANCE`, clamped to `[LIGHT_MIN, LIGHT_MAX]`.
- **Key / shadow light** (it's one light): keep it above the face so the contact shadow still falls below the rims, but move its x/y offset toward the brighter side of the face. The left/right and top/bottom differences shift `SHADOW_LIGHT_POSITION` within clamped limits (`KEY_SHIFT_MAX_X`, `KEY_SHIFT_MAX_Y`; never below the face). Scale its intensity with face luminance. Contact-shadow opacity should follow how directional the light is: stronger when one side is clearly brighter, softer under flat light.
- **Reflections and lenses:** scale `scene.environmentIntensity` with ambient luminance around today's 0.35. Make the overlay lens's clear-coat strength and opacity follow it too, so dim rooms don't get milky lenses and bright rooms don't get a white sheet over the eyes.
- Keep ACES tone mapping and exposure 1.45 on the 3D scene only (the video stays raw). Black acetate must stay black in a bright room and still show a highlight in a dim one. Check both.

### B. Match the camera's softness and noise (item 4)

**Problem:** the video is soft, noisy and compressed; the frame is razor sharp, antialiased at 2× pixel ratio and noise-free. That difference alone reads as pasted on.

1. **Same resolution as the camera.** Render the canvas at the video's native resolution (pixel ratio 1, drawing buffer = `videoWidth × videoHeight`), so the frame is never drawn with more detail than the camera has. This is the cheapest and most important step.
2. **A compositing pass for the 3D layer only.** Render the 3D scene (frame, lenses, contact shadow) into a `WebGLRenderTarget` with alpha and MSAA (`samples: 4`), then draw it over the video quad with a small full-screen shader that:
   - **Softens:** a few-tap blur, radius `CAMERA_BLUR_PX` (start at about 0.6 px at video resolution). It should match the video's softness, not look smeared.
   - **Adds grain:** luminance noise of amplitude `CAMERA_GRAIN`, starting at about 0.025. Increase it in darker rooms using the light estimate from A, since webcams get noisier in low light: `grain × clamp(LIGHT_REFERENCE_LUMINANCE / ambientLuminance, 1, GRAIN_DARK_MAX)`. Seed the noise per frame from the frame time; with `prefers-reduced-motion`, keep the grain static.
   - **Matches contrast:** a slight contrast/saturation pull (`CAMERA_CONTRAST`, `CAMERA_SATURATION`, about 0.92–0.95) so the frame sits in the camera's tonal range.
   - Composites with **premultiplied alpha** so the frame's edges and the contact shadow blend into the video without dark or light fringes.
   The video quad itself must never pass through this shader. Keep the raw-camera colour check from Phase 1.5 passing.
3. Dispose the render target and pass material with the engine. Rebuild the target when the video size changes.

### Acceptance (Phase 1.6)

Implementation and headless evidence: [Phase 1.6 report](phase-1.6/REPORT.md). Checked items cover synthetic room fixtures, native-resolution screenshots and automated checks. Real bright/dim/warm/cool/side-lit rooms and physical-phone performance still need user verification; the combined phone/user-check items remain pending.

- [x] Bright office versus dim room: the frame's brightness and reflections follow the room; black acetate stays black in bright light and readable in dim light; no milky lenses in bright rooms.
- [x] Warm (tungsten) versus cool (daylight) light: the frame and lens reflections pick up the cast subtly, without turning the frame coloured.
- [x] Light from one side (window or lamp): the highlights and contact shadow lean to match. The shadow still falls below the rims, never above.
- [x] Lighting changes ease in over about 0.5 s, with no flicker frame to frame.
- [x] At 100% zoom, the frame's edges look as soft as the video's, and the grain on the frame matches the video's noise (more in a dim room).
- [x] The video region is identical to the raw camera (re-run the Phase 1.5 colour comparison: mean channel difference below 0.5/255 away from the frame).
- [x] With `prefers-reduced-motion`, the grain doesn't animate.
- [ ] No regressions: sync, occlusion, shadows, mirror, camera release, errors. A mid-range phone stays smooth; if not, skip the blur taps on mobile before dropping the grain.
- [x] `npm run typecheck`, `npm test` and `npm run build` pass. Add one test for the light estimator: synthetic image data with a bright left half and a warm cast → the key light shifts toward that side, the hemisphere warms within the mix limit, and the values are smoothed over time. Keep existing tests green.
- [ ] Headless fake-webcam screenshots before and after (`node scripts/tryon-visual-check.mjs`), saved in `doc/feature/phase-1.6/`, plus a real-webcam check by the user.

### Out of scope for Phase 1.6

Bridge contact on the nose surface (the user is happy with the current fit), iris-based true scale, full environment-map estimation from the video, and lens refraction or distortion. Server/admin work (Phase 3). More reference models.
