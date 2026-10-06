# The Felix: browline reference model

Implemented 2026-10-07, following the Ellis reference-model integration. Open `/product/the-felix` and select **View in 3D**, or select The Felix in `/try-on`.

`src/tryon/browline.ts` ports the supplied `reference/browline-threejs-package/src/glasses-model.js`. Its copied `browline-design.json` retains the brow/lens/bridge contours, bowed front, swept arms, thin gold eyewires, rivets and nose-pad hardware. `tortoiseshell-texture.ts` retains the deterministic seed-1836 pigment generator, with four cached pixel buffers and independently disposable GPU textures.

Chestnut uses the reference tortoiseshell map on both brows and arms, with separate gold hardware. Ash uses the same geometry with the selected swatch as solid acetate; new admin colors use their swatch or neutral fallback. Registering the `the-felix` slug in the same builder registry as Ellis replaces the generated Browline outline in both camera overlay and product viewer. Other products keep their existing models.

Reference geometry is authored in millimetres and built in metres, then wrapped at scale 100 for the app's centimetre face/viewer contract. Display bounds match the supplied validation to 0.1 mm: approximately 152.3 × 50.8 × 140.1 mm. These are photo-derived estimates, not measured product dimensions; server catalog dimensions and stock are unchanged.

For live overlays, lenses **and nose pads** use transparent clear coats with depth writes off, instead of physical transmission. Arms splay open 4° and the front uses the same depth offset convention as Ellis. Existing camera projection, face anchors, face mesh, room lighting and compositing remain unchanged. Display mode retains physical lens/pad transmission. Hinge mesh names match the existing close-up control.

`src/lib/reference-models.ts` exposes availability without importing builders, so gallery photo mode stays light. The shared viewer retains its presets, rotation/zoom, keyboard controls, color-angle preservation, retry/photo fallback and cleanup. MediaPipe remains exclusive to the lazy try-on route. No GLB loader, dependency, server or admin change was introduced; per-product server/GLB management remains Phase 3.

Verification: typecheck, all four unit test files, build, and both browser journeys pass. Geometry tests cover 21 meshes / 55,642 triangles, four textured meshes, reference bounds and pigment checksum, hardware, both finishes, overlay materials, temple splay and one-time texture disposal. Viewer projection tests now cover Ellis and Felix at three sizes; existing camera replacement tests include both Felix finishes. The browser test renders real WebGL, checks controls and preserved Side view on color changes, reopens the viewer, checks 375 px layout and Ellis compatibility. Temporary screenshots were inspected with `CAPTURE_SCREENSHOTS=1`; they are not committed.

Real-camera fit/occlusion and physical-phone performance still require hardware verification. The supplied reference package/workbench/PDFs are user-provided local files; the production model and tests do not load them at runtime.
