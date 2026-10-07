# Tortoiseshell / gold browline glasses — Three.js reconstruction

Open **browline-workbench.html** directly in a WebGL-capable browser. The model, Three.js, reference, generated pigment pattern and blueprint are embedded. No CDN is required.

This study reconstructs the reference's visible design. Physical dimensions, hidden hardware and exact mottling placement are estimates from one photograph.

Contents:

- **browline-modeling-guide.pdf** — illustrated modeling and integration guide.
- **GUIDE.md** — editable text version of the guide.
- **browline-blueprint.svg / .png** — front, top, side, brow-section and nose-pad views.
- **tortoiseshell-browline.glb** — assembled, unfolded model in meters, with the pigment texture embedded.
- **src/glasses-model.js** — procedural brows, eyewires, bridge, lenses, arms and pads.
- **src/design.json** — estimated dimensions and editable contour / centerline data.
- **src/tortoiseshell-texture.js** — deterministic seamless pigment generator.
- **src/integration-example.js** — add the model to an existing Three.js scene.
- **src/viewer.js / viewer-template.html** — standalone workbench source.
- **textures/tortoiseshell-basecolor.png** — supplied seed-1836 color map.
- **reference.png** — original uploaded photograph, unchanged.
- **views/** — rendered perspective, front, side, top, separated assembly and folded views.
- **VALIDATION.json** — geometry, controls, embedded texture, export and re-import checks.
- **THIRD-PARTY-LICENSES.txt** — Three.js MIT license.

Drag to orbit, scroll to zoom, and right-drag to pan. Sliders adjust dimensions, roughness, folding, separation and wire diameter. New mottling changes the texture seed. Reset returns to the supplied default. Lenses, pads and wireframe can be toggled independently.

Export GLB always exports the assembled, unfolded model, including all lenses and pads, then restores the pose and visibility you were inspecting. The receiving application's lighting and tone mapping determine its reflections.

For procedural integration, copy `glasses-model.js`, `design.json` and `tortoiseshell-texture.js` together into a project using a JSON-aware bundler. The returned vertices and transforms are in meters; do not scale by 0.001 a second time.

Rebuild the standalone workbench after editing its source:

```sh
npm install
npm run build
```

The package pins Three.js 0.186.1 and esbuild 0.25.12. Rebuilding updates the HTML only. The blueprint, rendered views, pigment PNG and supplied GLB represent the delivered default reconstruction; regenerate these if you change the design. Use the workbench's export button to save a GLB with your current dimensions and pigment seed.
