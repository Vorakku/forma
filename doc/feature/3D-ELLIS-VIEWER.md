# The Ellis: interactive 3D product view

> **Update (2026-10-06):** The Ellis now uses the reference reconstruction in `doc/feature/reference/glasses-threejs-package`, in both this viewer and the live camera try-on. `src/tryon/ellis.ts` is a TypeScript port of its `glasses-model.js` (same `design.json` contours, swept arms, materials and rivets; bounds match its `VALIDATION.json` to 0.1 mm). The viewer's camera and lighting match the reference workbench. In the camera overlay, the lenses use a clear coat instead of transmission (transmission can't see the video behind the canvas), and the arms flex open by `TRYON_TEMPLE_SPLAY_DEG`. Other frames still use the generated outline in `glasses.ts`; add a frame by registering a builder in `REFERENCE_MODELS`. The generated hinge hardware described below has been removed.

Implemented 2026-10-06. Open `/product/p01` and select **View in 3D** above the gallery. Other products keep their photo galleries.

The viewer supports mouse/touch rotation, scroll/pinch zoom, front/side/top/three-quarter views, a hinge close-up, zoom buttons and reset. Focus the canvas to use arrow keys, `+`/`−` and `R`. Product colour choices update the model while preserving the viewing angle. Switching to Photos or leaving the page disposes the viewer. Failed loading/WebGL stays inside the gallery and offers a photo fallback; renderer errors also offer a fresh-canvas retry.

The model uses existing product dimensions and the established glasses coordinate contract. Display geometry adds polished acetate, front rivets and five-barrel hinges with slotted screws. It is a generated preview, not manufacturer CAD. The lightweight live try-on geometry and its current calibration are preserved.

Implementation:

- `src/components/product-gallery.tsx`: photo/3D mode, Ellis-only availability, lazy loading and local loading failure boundary.
- `src/components/product-3d.tsx`: React controls, lifecycle, keyboard support, accessible instructions and retries.
- `src/tryon/viewer.ts`: React-free object viewer, actual OrbitControls, camera fitting, studio environment, lighting and shadows. Renders on interaction, not continuously while idle; pauses in hidden tabs and respects reduced motion.
- `src/tryon/glasses.ts`: display builder, separate from the existing live overlay builder.
- `src/tryon/resources.ts`: shared geometry/material/texture disposal. `engine.ts` imports and re-exports this helper, preserving its API.
- `src/pages/shop.tsx`, `src/styles.css`: product-gallery integration and responsive FORMA styling.
- `tests/viewer.test.mjs`, `tests/tryon-bundle.test.mjs`: viewer, gallery and bundle verification.

No dependencies, server, schema, API or admin changes. The new request extends the original “Three.js only on `/try-on`” loading rule to include the explicitly opened 3D product viewer. Three.js is shared between the two lazy views; MediaPipe, WASM and the face model remain exclusive to try-on.

Verification completed:

- `npm run typecheck`, `npm test` (33 tests), `npm run build` pass.
- Production entry contains no Three.js or MediaPipe modules. The lazy product component is approximately 28 kB and imports an approximately 580 kB shared Three.js/geometry chunk. Face tracking remains in the approximately 164 kB lazy try-on chunk. Neither 3D view is preloaded by the HTML.
- Real geometry and OrbitControls tests cover mouse drag, one-finger rotation, two-finger zoom, wheel zoom, presets, hinge targeting, rotation/zoom methods, resized framing and stable colour changes. Projection tests fit the full model at 338 × 275, 600 × 570 and 300 × 650.
- Repeated replacements dispose all resources once. Closing releases environment targets, shadows, event handlers, observers and scheduled frames. Unsupported WebGL, render failures and context loss have local error handling.
- Server-rendered gallery checks verify Ellis-only availability, default photos, selected colour, controls and keyboard instructions. The development server serves both new components and the Ellis data at `localhost:4174`.

Visual review remains pending: the Browser tool reported no connected browser. The automated renderer boundary is mocked, so tests do not verify the final WebGL image or live DOM layout. In a browser, check `/product/p01` at desktop and 375 px: enter/exit 3D, drag, pinch/scroll, switch both colours, inspect Hinge detail, reset, tab through controls and simulate unavailable WebGL. Inspect highlight strength and front-rivet/hinge placement against the photo before treating the generated model as a close representation of the physical frame.
