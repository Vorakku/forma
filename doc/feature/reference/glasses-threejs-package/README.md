# Black acetate glasses — Three.js reconstruction package

Open **glasses-workbench.html** directly in a browser. It is standalone and works without network access. WebGL must be enabled.

The model reconstructs the uploaded reference's visible design. Dimensions, the orthographic views, and hidden surfaces are estimates from one perspective photograph.

Contents:

- **glasses-modeling-guide.pdf** — illustrated construction and integration guide.
- **GUIDE.md** — full guide in editable text.
- **glasses-blueprint.svg / .png** — annotated front, top, side and section views.
- **black-acetate-glasses.glb** — assembled, unfolded 3D model in meters.
- **src/glasses-model.js** — editable procedural model builder.
- **src/design.json** — dimensions, Bézier contours and arm control points.
- **src/integration-example.js** — use the model in an existing Three.js scene.
- **src/viewer.js / viewer-template.html** — standalone workbench source.
- **reference.png** — original uploaded reference, unchanged.
- **views/** — rendered perspective, front, side, top and separated assembly images.
- **VALIDATION.json** — geometry, controls, export and re-import verification.
- **THIRD-PARTY-LICENSES.txt** — Three.js MIT license.

Controls: drag to orbit, scroll to zoom, right-drag to pan. Buttons select orthographic views. Sliders adjust dimensions, material roughness, arm folding and assembly separation. Export GLB always exports the assembled, unfolded pose, then restores your inspected pose.

For integration, copy `src/glasses-model.js` and `src/design.json` into a project using a JSON-aware bundler. Install the pinned Three.js version and import `createGlasses()`. All returned vertices and transforms are in meters; do not scale the model by 0.001 again.

To rebuild the standalone workbench after editing its source:

```sh
npm install
npm run build
```

The package pins Three.js 0.186.1 and esbuild 0.25.12. Rebuilding does not regenerate the blueprint or GLB automatically; those files show the supplied default design. Use the workbench's export control for a new GLB. If you change the front contours, update your blueprint to reflect the new source geometry.
