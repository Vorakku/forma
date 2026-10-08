import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import * as THREE from "three";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Real OrbitControls, geometry and projection maths; only GPU/device surfaces are mocked.
await mkdir(".sites-runtime", { recursive: true });
const output = resolve(".sites-runtime/viewer-tests.mjs");
await build({
  stdin: {
    contents:
      "export * from './viewer';export * from './glasses';export * from './resources';export * from './scroll-viewer';export * from './scroll-poses';export * from './scroll-timeline';export * from './scroll-budget';export * from './explode';export * from './scroll-steps';export * from './blueprint';export * from './blueprint-theme';export * from './ellis';",
    resolveDir: resolve("src/tryon"),
  },
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "gpu-boundary",
      setup(build) {
        build.onResolve({ filter: /^three$/ }, (args) =>
          args.namespace === "renderer"
            ? { path: "three", external: true }
            : { path: "three", namespace: "renderer" },
        );
        build.onLoad({ filter: /.*/, namespace: "renderer" }, () => ({
          contents:
            "export * from 'three';export class WebGLRenderer{constructor(options){return new globalThis.viewerHarness.Renderer(options)}}export class PMREMGenerator{constructor(){globalThis.viewerHarness.generators++}fromScene(){return globalThis.viewerHarness.environment}dispose(){globalThis.viewerHarness.generatorsDisposed++}}",
        }));
      },
    },
  ],
});
const {
  createObjectViewer,
  fitDistance,
  buildOverlayGlasses,
  buildDisplayGlasses,
  disposeObject,
  VIEWER_FOV,
  VIEWER_FIT_MARGIN,
  VIEWER_ROTATION_STEP,
  DIRECTIONS,
  createScrollViewer,
  resolveScrollPoses,
  populateScrollTimeline,
  clampPhi,
  SCROLL_ANGLES,
  createExploder,
  EXPLODE_MM,
  EXPLODE_STAGGER,
  buildMotionBudget,
  interpolateOrbit,
  pathProgress,
  createBlueprint,
  ellisBlueprintCurves,
  ELLIS_FRONT_DEPTH,
  warp,
  readBlueprintTokens,
  readBlueprintTheme,
  saveBlueprintTheme,
  BLUEPRINT_THEME_KEY,
  buildEllis,
} = await import(pathToFileURL(output));
after(() => rm(output, { force: true }));
const product = (overrides = {}) => ({
  id: "server-ellis",
  slug: "the-ellis",
  name: "The Ellis",
  dimensions: "52 · 18 · 145",
  shape: "Rectangle",
  material: "Acetate",
  category: "optical",
  colors: ["Ink black", "Soft graphite"],
  swatches: [{ hex: "#202021" }, { hex: "#57575b" }],
  ...overrides,
});
const felix = (overrides = {}) =>
  product({
    id: "server-felix",
    slug: "the-felix",
    name: "The Felix",
    shape: "Browline",
    material: "Mixed",
    dimensions: "51 · 20 · 145",
    colors: ["Chestnut", "Ash"],
    swatches: [{ hex: "#76442b" }, { hex: "#817b73" }],
    ...overrides,
  });
const resources = (object) => {
  const found = new Set();
  object.traverse((node) => {
    if (node.isMesh) {
      found.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        found.add(material);
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) found.add(value);
        });
      }
    }
  });
  return [...found];
};
class Surface extends EventTarget {
  listeners = new Map();
  addEventListener(type, callback, options) {
    super.addEventListener(type, callback, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback, options) {
    super.removeEventListener(type, callback, options);
    this.listeners.get(type)?.delete(callback);
  }
  count() {
    return [...this.listeners.values()].reduce(
      (count, set) => count + set.size,
      0,
    );
  }
}
function devices({
  width = 600,
  height = 570,
  reduced = false,
  failConstructor = false,
} = {}) {
  const canvas = new Surface(),
    doc = new Surface(),
    motion = new Surface(),
    callbacks = new Map();
  let nextFrame = 0;
  Object.assign(doc, { hidden: false });
  Object.assign(motion, { matches: reduced });
  Object.assign(canvas, {
    style: {},
    clientWidth: width,
    clientHeight: height,
    ownerDocument: doc,
    getRootNode: () => doc,
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  const h = {
    canvas,
    doc,
    motion,
    callbacks,
    renderers: [],
    generators: 0,
    generatorsDisposed: 0,
    environment: {
      texture: new THREE.Texture(),
      disposals: 0,
      dispose() {
        this.disposals++;
      },
    },
    errors: [],
  };
  h.Renderer = class {
    constructor() {
      if (failConstructor) throw Error("No WebGL");
      this.shadowMap = {};
      this.renders = 0;
      h.renderers.push(this);
    }
    setPixelRatio(value) {
      this.pixelRatio = value;
    }
    setClearColor() {}
    getRenderTarget() {
      return this.target ?? null;
    }
    setRenderTarget(target) {
      this.target = target;
    }
    getDrawingBufferSize(size) {
      return size.set(
        this.size[0] * this.pixelRatio,
        this.size[1] * this.pixelRatio,
      );
    }
    setSize(width, height) {
      this.size = [width, height];
    }
    render(scene, camera) {
      if (h.failRender) throw Error("Render failed");
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      this.scene = scene;
      this.camera = camera;
      this.renders++;
    }
    clear() {
      this.cleared = true;
    }
    dispose() {
      this.disposed = true;
    }
  };
  globalThis.viewerHarness = h;
  globalThis.window = { matchMedia: () => motion, devicePixelRatio: 3 };
  globalThis.document = doc;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      h.resize = callback;
    }
    observe() {}
    disconnect() {
      h.observerDisconnected = true;
    }
  };
  globalThis.requestAnimationFrame = (callback) => {
    callbacks.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  h.flush = () => {
    let limit = 300;
    while (callbacks.size && limit--) {
      const entry = callbacks.entries().next().value;
      callbacks.delete(entry[0]);
      entry[1]();
    }
    assert.ok(
      limit > 0,
      "the viewer should stop rendering after interaction settles",
    );
  };
  h.start = () =>
    createObjectViewer({
      canvas,
      onError: (message) => h.errors.push(message),
    });
  h.event = (target, type, props = {}) =>
    target.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), props),
    );
  return h;
}

test("The Ellis uses the reference reconstruction in the viewer and the camera overlay", () => {
  const model = buildDisplayGlasses(product(), 0),
    graphite = buildDisplayGlasses(product(), 1),
    overlay = buildOverlayGlasses(product(), 0);
  // Bounds recorded in doc/feature/reference/glasses-threejs-package/VALIDATION.json (metres), here in cm.
  const size = new THREE.Box3()
    .setFromObject(model)
    .getSize(new THREE.Vector3());
  [15.171885, 4.383544, 13.832447].forEach((value, i) =>
    assert.ok(
      Math.abs(size.getComponent(i) - value) < 0.01,
      "reference bounds axis " + i + ": " + size.getComponent(i),
    ),
  );
  const frame = model.getObjectByName("front_frame");
  assert.equal(frame.material.color.getHexString(), "0b0d0f");
  assert.equal(frame.material.clearcoat, 1);
  assert.equal(frame.material.metalness, 0);
  assert.equal(
    graphite.getObjectByName("front_frame").material.color.getHexString(),
    "57575b",
  );
  for (const name of [
    "lens_L",
    "lens_R",
    "temple_L",
    "temple_R",
    "front_rivet_L",
    "front_rivet_R",
    "temple_rivet_L",
    "temple_rivet_R",
    "detail.hinge.left",
    "detail.hinge.right",
  ])
    assert.ok(model.getObjectByName(name), name);
  assert.equal(model.getObjectByName("lens_R").material.transmission, 1);
  const lens = overlay.getObjectByName("lens_R").material;
  assert.equal(lens.transmission, 0, "no transmission over live video");
  assert.ok(lens.transparent && lens.opacity < 0.2);
  assert.ok(
    overlay.getObjectByName("temple_pivot_R").rotation.y < 0 &&
      overlay.getObjectByName("temple_pivot_L").rotation.y > 0,
    "arms flex open to clear the temples",
  );
  for (const object of [model, graphite, overlay])
    object.traverse((node) => {
      if (node.isMesh)
        for (const value of node.geometry.attributes.position.array)
          assert.ok(Number.isFinite(value));
    });
  const generated = buildDisplayGlasses(
    product({ id: "server-remy", slug: "the-remy", shape: "Round" }),
    0,
  );
  assert.ok(
    !generated.getObjectByName("front_frame"),
    "other frames keep the generated outline",
  );
  [model, graphite, overlay, generated].forEach(disposeObject);
});
test("The Felix preserves the supplied browline geometry, textured acetate, gold wires and pads", () => {
  const model = buildDisplayGlasses(felix(), 0),
    overlay = buildOverlayGlasses(felix(), 0),
    ash = buildDisplayGlasses(felix(), 1);
  const bounds = new THREE.Box3()
    .setFromObject(model)
    .getSize(new THREE.Vector3());
  // Supplied VALIDATION.json bounds in metres, converted to the application's cm contract.
  [15.22758566439152, 5.0834884867072105, 14.013223704770209].forEach(
    (expected, axis) =>
      assert.ok(Math.abs(bounds.getComponent(axis) - expected) < 0.01),
  );
  let meshes = 0,
    triangles = 0,
    textured = 0;
  model.traverse((node) => {
    if (node.isMesh) {
      meshes++;
      triangles +=
        (node.geometry.index?.count ??
          node.geometry.attributes.position.count) / 3;
      if (node.material.map) {
        textured++;
        assert.ok(node.geometry.attributes.uv);
      }
      for (const value of node.geometry.attributes.position.array)
        assert.ok(Number.isFinite(value));
    }
  });
  assert.equal(meshes, 21);
  assert.equal(triangles, 55642);
  assert.equal(textured, 4);
  for (const suffix of ["L", "R"]) {
    for (const part of [
      "brow_",
      "gold_eyewire_",
      "lens_",
      "temple_",
      "nose_pad_",
      "nose_post_",
      "pad_mount_",
      "front_rivet_",
      "temple_rivet_",
    ])
      assert.ok(model.getObjectByName(part + suffix), part + suffix);
    assert.equal(
      model
        .getObjectByName("gold_eyewire_" + suffix)
        .material.color.getHexString(),
      "c6a36b",
    );
    assert.equal(
      model.getObjectByName("lens_" + suffix).material.transmission,
      1,
    );
    for (const part of ["lens_", "nose_pad_"]) {
      const mesh = overlay.getObjectByName(part + suffix);
      assert.equal(mesh.material.transmission, 0);
      assert.ok(mesh.material.transparent && mesh.material.opacity < 0.2);
      assert.equal(mesh.material.depthWrite, false);
      assert.equal(mesh.renderOrder, 2);
    }
  }
  assert.ok(model.getObjectByName("gold_bridge"));
  assert.ok(model.getObjectByName("detail.hinge.right"));
  assert.ok(model.getObjectByName("detail.hinge.left"));
  const acetate = model.getObjectByName("brow_R").material,
    map = acetate.map;
  assert.equal(acetate.clearcoat, 1);
  assert.equal(acetate.color.getHexString(), "ffffff");
  assert.equal(map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(map.wrapS, THREE.RepeatWrapping);
  assert.equal(map.image.width, 512);
  assert.equal(
    createHash("sha256").update(map.image.data).digest("hex"),
    "3ee9abfae293473448126ca9baf915fdda1dfd146a01f5843b8c74d8a0189449",
    "pigment bytes match the supplied seed-1836 generator",
  );
  assert.equal(ash.getObjectByName("brow_R").material.map, null);
  assert.equal(
    ash.getObjectByName("brow_R").material.color.getHexString(),
    "817b73",
  );
  const unknown = buildDisplayGlasses(
    felix({ colors: ["New color"], swatches: [{ hex: "#737373" }] }),
    0,
  );
  assert.equal(
    unknown.getObjectByName("brow_R").material.color.getHexString(),
    "737373",
  );
  assert.ok(
    overlay.getObjectByName("temple_pivot_R").rotation.y < 0 &&
      overlay.getObjectByName("temple_pivot_L").rotation.y > 0,
  );
  assert.equal(model.getObjectByName("temple_pivot_R").rotation.y, 0);
  assert.equal(overlay.children[0].position.z, -0.003);
  assert.notEqual(
    map,
    overlay.getObjectByName("brow_R").material.map,
    "each model owns its GPU texture",
  );
  const disposals = new Map();
  for (const resource of resources(model))
    resource.addEventListener("dispose", () =>
      disposals.set(resource, (disposals.get(resource) ?? 0) + 1),
    );
  disposeObject(model);
  for (const resource of resources(overlay))
    assert.ok(!disposals.has(resource));
  assert.ok(disposals.has(map));
  for (const count of disposals.values()) assert.equal(count, 1);
  [overlay, ash, unknown].forEach(disposeObject);
});

test("front, side, top and perspective views fit the whole model at mobile and desktop sizes", () => {
  for (const [width, height] of [
    [338, 275],
    [600, 570],
    [300, 650],
  ])
    for (const frame of [product(), felix()]) {
      const h = devices({ width, height }),
        viewer = h.start(),
        model = buildDisplayGlasses(frame, 0);
      viewer.setObject(model);
      h.flush();
      const renderer = h.renderers[0];
      assert.deepEqual(renderer.size, [width, height]);
      assert.equal(renderer.pixelRatio, 2);
      assert.equal(renderer.camera.fov, VIEWER_FOV);
      for (const view of ["perspective", "front", "side", "top"]) {
        viewer.setView(view);
        h.flush();
        const box = new THREE.Box3().setFromObject(model);
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const point = new THREE.Vector3(x, y, z).project(renderer.camera);
              assert.ok(
                Math.abs(point.x) < 1 && Math.abs(point.y) < 1,
                view + " must fit the model",
              );
              assert.ok(point.z > -1 && point.z < 1);
            }
      }
      assert.equal(
        h.callbacks.size,
        0,
        "stationary models do not keep an animation loop running",
      );
      viewer.dispose();
    }
  assert.ok(fitDistance(10, 0.5) > fitDistance(10, 1));
  assert.ok(fitDistance(10, 2) > 10 * VIEWER_FIT_MARGIN);
});
test("mouse drag, touch drag and wheel operate real OrbitControls and eventually stop rendering", () => {
  const h = devices(),
    viewer = h.start();
  viewer.setObject(buildDisplayGlasses(product(), 0));
  h.flush();
  const camera = h.renderers[0].camera,
    initial = camera.position.clone();
  for (const pointerType of ["mouse", "touch"]) {
    const before = camera.position.clone();
    h.event(h.canvas, "pointerdown", {
      pointerId: 1,
      pointerType,
      button: 0,
      clientX: 120,
      clientY: 150,
      pageX: 120,
      pageY: 150,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });
    h.event(h.doc, "pointermove", {
      pointerId: 1,
      pointerType,
      clientX: 210,
      clientY: 180,
      pageX: 210,
      pageY: 180,
    });
    h.event(h.doc, "pointerup", { pointerId: 1, pointerType });
    h.flush();
    assert.ok(
      camera.position.distanceTo(before) > 1,
      pointerType + " should rotate",
    );
  }
  viewer.reset();
  h.flush();
  assert.ok(camera.position.distanceTo(initial) < 1e-6);
  const distance = camera.position.length();
  h.event(h.canvas, "wheel", { deltaY: -100, deltaMode: 0, ctrlKey: false });
  h.flush();
  assert.ok(camera.position.length() < distance, "wheel should zoom in");
  viewer.dispose();
});
test("two-finger touch gestures zoom the model without panning it away", () => {
  const h = devices(),
    viewer = h.start();
  viewer.setObject(buildDisplayGlasses(product(), 0));
  h.flush();
  const camera = h.renderers[0].camera,
    initialDistance = camera.position.length();
  for (const [id, x] of [
    [1, 100],
    [2, 200],
  ])
    h.event(h.canvas, "pointerdown", {
      pointerId: id,
      pointerType: "touch",
      pageX: x,
      pageY: 150,
      clientX: x,
      clientY: 150,
    });
  h.event(h.doc, "pointermove", {
    pointerId: 2,
    pointerType: "touch",
    pageX: 280,
    pageY: 150,
    clientX: 280,
    clientY: 150,
  });
  h.flush();
  assert.ok(
    camera.position.length() < initialDistance,
    "spreading fingers should zoom in",
  );
  h.event(h.doc, "pointerup", { pointerId: 2, pointerType: "touch" });
  h.event(h.doc, "pointerup", { pointerId: 1, pointerType: "touch" });
  h.flush();
  viewer.reset();
  h.flush();
  assert.ok(Math.abs(camera.position.length() - initialDistance) < 1e-6);
  viewer.dispose();
});
test("hinge focus, keyboard actions and colour replacements preserve an inspectable view", () => {
  const h = devices(),
    viewer = h.start(),
    first = buildDisplayGlasses(product(), 0);
  viewer.setObject(first);
  h.flush();
  const renderer = h.renderers[0],
    camera = renderer.camera;
  viewer.focus("detail.hinge.right");
  h.flush();
  const hinge = first
    .getObjectByName("detail.hinge.right")
    .getWorldPosition(new THREE.Vector3())
    .project(camera);
  assert.ok(
    Math.abs(hinge.x) < 1e-6 && Math.abs(hinge.y) < 1e-6,
    "hinge is centred",
  );
  const close = camera.position.clone();
  viewer.zoom(true);
  h.flush();
  assert.ok(camera.position.distanceTo(close) > 0);
  viewer.rotate(VIEWER_ROTATION_STEP, 0);
  h.flush();
  assert.ok(camera.position.distanceTo(close) > 1);
  const before = camera.position.clone(),
    counts = resources(first).map((resource) => {
      const counter = { n: 0 };
      resource.addEventListener("dispose", () => counter.n++);
      return counter;
    });
  viewer.setObject(buildDisplayGlasses(product(), 1));
  h.flush();
  assert.ok(
    camera.position.distanceTo(before) < 1e-6,
    "colour changes retain the camera",
  );
  assert.ok(counts.every((counter) => counter.n === 1));
  for (let i = 0; i < 100; i++) viewer.zoom(true);
  h.flush();
  assert.ok(Number.isFinite(camera.position.length()));
  viewer.reset();
  h.flush();
  assert.ok(camera.position.length() > 20);
  viewer.dispose();
});
test("resizing keeps relative zoom; reduced motion disables inertia; hidden pages pause rendering", () => {
  const h = devices({ reduced: true }),
    viewer = h.start(),
    model = buildDisplayGlasses(product(), 0);
  viewer.setObject(model);
  h.flush();
  const renderer = h.renderers[0],
    camera = renderer.camera;
  const before = camera.position.length();
  h.canvas.clientWidth = 280;
  h.canvas.clientHeight = 500;
  h.resize();
  h.flush();
  assert.ok(
    camera.position.length() > before,
    "narrower layouts move back to keep the model visible",
  );
  assert.deepEqual(renderer.size, [280, 500]);
  viewer.rotate(0.2, 0.1);
  assert.equal(h.callbacks.size, 1);
  h.flush();
  assert.equal(h.callbacks.size, 0);
  h.doc.hidden = true;
  h.event(h.doc, "visibilitychange");
  viewer.rotate(0.2, 0);
  assert.equal(h.callbacks.size, 0);
  h.doc.hidden = false;
  h.event(h.doc, "visibilitychange");
  assert.equal(h.callbacks.size, 1);
  h.flush();
  viewer.dispose();
});
test("repeated colour swaps and closing release geometry, materials, environment and event listeners", () => {
  const h = devices(),
    viewer = h.start();
  let previous;
  for (let i = 0; i < 60; i++) {
    const model = buildDisplayGlasses(product(), i % 2),
      counts = resources(model).map((resource) => {
        const counter = { n: 0 };
        resource.addEventListener("dispose", () => counter.n++);
        return counter;
      });
    viewer.setObject(model);
    if (previous) assert.ok(previous.every((counter) => counter.n === 1));
    previous = counts;
  }
  h.flush();
  assert.equal(h.generators, h.generatorsDisposed);
  assert.equal(h.environment.disposals, 0);
  viewer.dispose();
  viewer.dispose();
  assert.ok(previous.every((counter) => counter.n === 1));
  assert.equal(h.environment.disposals, 1);
  assert.equal(h.callbacks.size, 0);
  assert.ok(h.observerDisconnected);
  assert.ok(h.renderers[0].disposed && h.renderers[0].cleared);
  assert.equal(h.canvas.count(), 0);
  assert.equal(h.doc.count(), 0);
  assert.equal(h.motion.count(), 0);
  const object = new THREE.Group(),
    texture = new THREE.Texture(),
    material = new THREE.MeshStandardMaterial({ map: texture }),
    geometry = new THREE.BoxGeometry();
  object.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  let released = 0;
  texture.addEventListener("dispose", () => released++);
  disposeObject(object);
  assert.equal(released, 1);
});
test("unsupported WebGL, context loss and render errors keep failures local and release the viewer", () => {
  const unsupported = devices({ failConstructor: true });
  assert.throws(() => unsupported.start());
  assert.equal(unsupported.canvas.count(), 0);
  for (const failure of ["context", "render"]) {
    const h = devices(),
      viewer = h.start();
    viewer.setObject(buildDisplayGlasses(product(), 0));
    h.flush();
    if (failure === "context") h.event(h.canvas, "webglcontextlost");
    else {
      h.failRender = true;
      viewer.rotate(0.2, 0);
      h.flush();
    }
    assert.equal(h.errors.length, 1);
    assert.ok(h.errors[0].includes("photos"));
    assert.ok(h.renderers[0].disposed);
    assert.equal(h.callbacks.size, 0);
    assert.equal(h.canvas.count(), 0);
    viewer.dispose();
  }
});

test("Ellis and Felix expose a 3D option; galleries start with photos and preserve selected colour", async () => {
  delete globalThis.window;
  delete globalThis.document;
  const componentOutput = resolve(".sites-runtime/gallery-tests.mjs");
  await build({
    stdin: {
      contents:
        "export * from './components/product-gallery';export * from './components/product-3d';",
      resolveDir: resolve("src"),
    },
    outfile: componentOutput,
    bundle: true,
    format: "esm",
    platform: "node",
    external: [
      "react",
      "react-router-dom",
      "three",
      "lucide-react",
      "sonner",
      "radix-ui",
      "zustand",
      "clsx",
      "tailwind-merge",
      "zod",
    ],
  });
  try {
    const { ProductGallery, Product3D } = await import(
      pathToFileURL(componentOutput)
    );
    const props = {
      product: product({ image: "/images/frame-01.webp", weight: "22 g" }),
      color: 1,
      onZoom: () => {},
    };
    const markup = renderToStaticMarkup(createElement(ProductGallery, props));
    assert.ok(markup.includes("View in 3D"));
    assert.ok(markup.includes("Enlarge product image"));
    assert.ok(markup.includes("The Ellis in Soft graphite"));
    assert.ok(!markup.includes("<canvas"));
    const other = renderToStaticMarkup(
      createElement(ProductGallery, {
        ...props,
        product: { ...props.product, id: "server-remy", slug: "the-remy" },
      }),
    );
    assert.ok(!other.includes("View in 3D"));
    assert.ok(other.includes("Frame detail close-up"));
    const browlineMarkup = renderToStaticMarkup(
      createElement(ProductGallery, {
        ...props,
        product: felix({ image: "/images/frame-07.webp", weight: "21 g" }),
      }),
    );
    assert.ok(browlineMarkup.includes("View in 3D"));
    assert.ok(browlineMarkup.includes("The Felix in Ash"));
    assert.ok(!browlineMarkup.includes("<canvas"));

    const viewer = renderToStaticMarkup(
      createElement(Product3D, { ...props, onPhotos: () => {} }),
    );
    for (const label of [
      "Front",
      "Side",
      "Top",
      "Hinge detail",
      "Zoom in",
      "Zoom out",
      "Reset 3D view",
    ])
      assert.ok(viewer.includes(label));
    assert.ok(
      viewer.includes("Interactive 3D view of The Ellis in Soft graphite"),
    );
    assert.ok(viewer.includes("use arrow keys to rotate"));
    assert.ok(viewer.includes("Generated preview"));
  } finally {
    await rm(componentOutput, { force: true });
  }
});

test("scroll poses match product presets and the centred hinge focus", () => {
  const h = devices(),
    viewer = h.start(),
    model = buildDisplayGlasses(product(), 0);
  viewer.setObject(model);
  const poses = resolveScrollPoses(10, 600 / 570, (name) =>
    model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()),
  );
  const direction = (pose) =>
    new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(1, pose.phi, pose.theta),
    );
  // The top direction is 0.0199973 rad from the pole; both viewers clamp it to 0.02.
  const top = new THREE.Spherical().setFromVector3(DIRECTIONS.top);
  top.radius = 1;
  top.phi = clampPhi(top.phi);
  assert.ok(
    direction(poses[2]).distanceTo(new THREE.Vector3().setFromSpherical(top)) <
      1e-12,
  );
  assert.ok(
    direction(poses[4]).distanceTo(DIRECTIONS.front.clone().normalize()) <
      1e-12,
  );
  assert.ok(
    direction(poses[3]).distanceTo(
      new THREE.Vector3(1, 0.55, 1.2).normalize(),
    ) < 1e-12,
  );
  viewer.focus("detail.hinge.right");
  h.flush();
  const camera = h.renderers[0].camera;
  const anchor = model
    .getObjectByName("detail.hinge.right")
    .getWorldPosition(new THREE.Vector3());
  assert.deepEqual(
    [poses[3].targetX, poses[3].targetY, poses[3].targetZ],
    anchor.toArray(),
  );
  const expected = resolveScrollPoses(
    new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere())
      .radius,
    camera.aspect,
    () => anchor,
  )[3];
  const actual = camera.position.clone().sub(anchor);
  assert.ok(Math.abs(actual.length() - expected.distance) < 1e-9);
  assert.ok(actual.normalize().distanceTo(direction(expected)) < 1e-9);
  viewer.dispose();
});

test("one linear GSAP orbit timeline matches integer angles and never crosses a pole", async () => {
  const { gsap } = await import("gsap");
  const poses = resolveScrollPoses(10, 1, () => ({ x: 6, y: 1, z: 5 }));
  const pose = { ...poses[0] };
  const timeline = populateScrollTimeline(
    gsap.timeline({ paused: true }),
    pose,
    poses,
  );
  assert.ok(Math.abs(timeline.duration() - (poses.length - 1)) < 1e-9);
  // GSAP rounds numeric tween values to six decimal places.
  const equals = (expected) =>
    Object.entries(expected).forEach(([key, value]) =>
      assert.ok(Math.abs(pose[key] - value) < 1e-6, key),
    );
  for (let index = 0; index < poses.length; index++) {
    timeline.time(index, false);
    equals(poses[index]);
    if (
      index < poses.length - 1 &&
      poses[index].explode === poses[index + 1].explode &&
      poses[index].blueprint === poses[index + 1].blueprint
    ) {
      timeline.time(index + 0.5, false);
      const phase = buildMotionBudget(poses, [], 1, 1).steps[index].phases.find(
        (p) => p.kind === "camera",
      );
      equals({
        ...interpolateOrbit(
          poses[index],
          poses[index + 1],
          pathProgress(phase.move, 0.5),
        ),
        explode: poses[index].explode,
        blueprint: poses[index].blueprint,
      });
    }
  }
  for (let time = poses.length - 1; time >= 0; time -= 0.01) {
    timeline.time(time, false);
    assert.ok(pose.phi >= 0.02 - 1e-6 && pose.phi <= Math.PI - 0.02);
    assert.ok(
      pose.theta >= poses[1].theta - 1e-6 &&
        pose.theta <= poses[3].theta + 1e-6,
    );
  }
  // An invalid future pose is clamped in both table resolution and camera placement.
  assert.equal(clampPhi(-10), 0.02);
  assert.equal(clampPhi(10), Math.PI - 0.02);
  timeline.kill();
});

test("a sixth table angle extends the integer timeline without changing the driver", async () => {
  const { gsap } = await import("gsap");
  const table = [
    ...SCROLL_ANGLES,
    { ...SCROLL_ANGLES[0], name: "Extra angle" },
  ];
  const resolved = resolveScrollPoses(10, 1, () => ({ x: 6, y: 1, z: 5 }));
  const poses = table.map((_, index) => resolved[index] ?? resolved[0]);
  const pose = { ...poses[0] };
  const timeline = populateScrollTimeline(
    gsap.timeline({ paused: true }),
    pose,
    poses,
  );
  assert.equal(timeline.duration(), table.length - 1);
  timeline.time(table.length - 1, false);
  for (const [key, value] of Object.entries(poses.at(-1)))
    assert.ok(Math.abs(pose[key] - value) < 1e-6);
  timeline.kill();
});

test("explode offsets match the reference, do not accumulate and carry nested parts", () => {
  const model = buildDisplayGlasses(product(), 0);
  const exploder = createExploder(model, EXPLODE_MM);
  const offsets = [
    ["front_frame", 0, 0.3],
    ["lens_L", -0.3, 1.35],
    ["lens_R", 0.3, 1.35],
    ["temple_pivot_L", -1, -0.4],
    ["temple_pivot_R", 1, -0.4],
  ];
  const transforms = [];
  model.traverse((node) =>
    transforms.push([
      node,
      node.position.clone(),
      node.quaternion.clone(),
      node.scale.clone(),
    ]),
  );
  const children = [
    "front_rivet_R",
    "detail.hinge.right",
    "temple_rivet_L",
    "temple_R",
  ].map((name) => {
    const node = model.getObjectByName(name);
    return [
      node,
      node.position.clone(),
      node.getWorldPosition(new THREE.Vector3()),
    ];
  });
  const progress = (name, amount) => {
    const start = name.startsWith("temple_pivot") ? EXPLODE_STAGGER : 0;
    const p = Math.max(0, Math.min(1, (amount - start) / (1 - EXPLODE_STAGGER)));
    return p * p * (3 - 2 * p);
  };
  for (const amount of [1, 1, 0.4, 0.8, EXPLODE_STAGGER, 0]) {
    exploder.set(amount);
    for (const [name, x, z] of offsets) {
      const [node, base] = transforms.find(([node]) => node.name === name);
      const expected = base
        .clone()
        .add(
          new THREE.Vector3(
            x * (progress(name, amount) * EXPLODE_MM * 0.001),
            0,
            z * (progress(name, amount) * EXPLODE_MM * 0.001),
          ),
        );
      assert.ok(node.position.distanceTo(expected) < 1e-15, name);
      if (amount === 0 || amount === 1) assert.deepEqual(node.position, expected);
      if (amount === EXPLODE_STAGGER) {
        if (name.startsWith("temple_pivot")) assert.deepEqual(node.position, base);
        else assert.ok(node.position.distanceTo(base) > 0, name);
      }
    }
    for (const [node, local, originalWorld] of children) {
      assert.deepEqual(
        node.position,
        local,
        "child's local transform stays unchanged",
      );
      const parentOffset = offsets.find(([name]) => name === node.parent.name);
      const expectedWorld = originalWorld
        .clone()
        .add(
          new THREE.Vector3(
            parentOffset[1] * EXPLODE_MM * 0.1 * progress(parentOffset[0], amount),
            0,
            parentOffset[2] * EXPLODE_MM * 0.1 * progress(parentOffset[0], amount),
          ),
        );
      assert.ok(
        node.getWorldPosition(new THREE.Vector3()).distanceTo(expectedWorld) <
          1e-12,
        node.name,
      );
    }
  }
  const previous = new Map(offsets.map(([name]) => [name, 0]));
  for (let sample = 0; sample <= 100; sample++) {
    exploder.set(sample / 100);
    for (const [name] of offsets) {
      const [node, base] = transforms.find(([node]) => node.name === name);
      const distance = node.position.distanceTo(base);
      assert.ok(distance >= previous.get(name), `${name} moves monotonically`);
      previous.set(name, distance);
    }
  }
  exploder.set(0);
  for (const [node, position, quaternion, scale] of transforms) {
    assert.deepEqual(node.position, position);
    assert.deepEqual(node.quaternion.toArray(), quaternion.toArray());
    assert.deepEqual(node.scale, scale);
  }
  disposeObject(model);
});

test("frames with a missing reference assembly make explode a silent no-op", () => {
  const model = buildDisplayGlasses(
    product({ slug: "the-remy", shape: "Round" }),
    0,
  );
  const positions = [];
  model.traverse((node) => positions.push([node, node.position.clone()]));
  const exploder = createExploder(model, EXPLODE_MM);
  exploder.set(1);
  exploder.set(0.3);
  exploder.set(0);
  for (const [node, base] of positions) assert.deepEqual(node.position, base);
  const partial = new THREE.Group();
  const front = new THREE.Group();
  front.name = "front_frame";
  partial.add(front);
  createExploder(partial, EXPLODE_MM).set(1);
  assert.deepEqual(front.position.toArray(), [0, 0, 0]);
  disposeObject(model);
});

test("budget timeline parks the camera whenever exploded or blueprint in both directions and after resize", async () => {
  const { gsap } = await import("gsap");
  const poses = resolveScrollPoses(10, 1, () => ({ x: 6, y: 1, z: 5 }), 15);
  const pose = { ...poses[0] },
    budget = buildMotionBudget(poses, [], 1, 1);
  const timeline = populateScrollTimeline(
    gsap.timeline({ paused: true }),
    pose,
    poses,
    budget,
  );
  const equalsOrbit = (expected) =>
    Object.keys(expected)
      .filter((k) => k !== "explode" && k !== "blueprint")
      .forEach((k) => assert.ok(Math.abs(pose[k] - expected[k]) < 1e-6, k));
  for (const direction of [1, -1])
    for (let index = 0; index <= 400; index++) {
      const time = direction === 1 ? index / 100 : (400 - index) / 100;
      timeline.time(time, false);
      if (pose.explode > 0) equalsOrbit(poses[1]);
      if (pose.blueprint > 0) equalsOrbit(poses[2]);
      assert.ok(!(pose.explode > 0 && pose.blueprint > 0));
    }
  assert.deepEqual(
    budget.steps.map((step) => step.phases.map((p) => p.kind)),
    [
      ["camera", "explode"],
      ["explode", "camera", "blueprint"],
      ["blueprint", "camera"],
      ["camera"],
    ],
  );
  for (const step of budget.steps)
    for (const phase of step.phases) {
      timeline.time((phase.start + phase.end) / 2, false);
      if (phase.kind === "explode") {
        assert.equal(pose.explode, 0.5);
        equalsOrbit(poses[1]);
      }
      if (phase.kind === "blueprint") {
        assert.equal(pose.blueprint, 0.5);
        equalsOrbit(poses[2]);
      }
      if (phase.kind === "camera") {
        assert.equal(pose.explode, 0);
        assert.equal(pose.blueprint, 0);
      }
      assert.ok(
        Math.abs(phase.end - phase.start - phase.seconds / step.seconds) <
          1e-12,
      );
    }
  const rebuilt = resolveScrollPoses(
    10,
    375 / 812,
    () => ({ x: 6, y: 1, z: 5 }),
    15,
  );
  const newBudget = buildMotionBudget(rebuilt, [], 375, 812);
  const explodePhase = newBudget.steps[0].phases.find(
    (p) => p.kind === "explode",
  );
  populateScrollTimeline(timeline, pose, rebuilt, newBudget).time(
    (explodePhase.start + explodePhase.end) / 2,
    false,
  );
  equalsOrbit(rebuilt[1]);
  assert.equal(pose.explode, 0.5);
  timeline.kill();
});

test("exploded fit contains every part at desktop/mobile sizes; assembled anchors and other fits stay fixed", () => {
  const h = devices({ width: 1808, height: 1018 });
  const viewer = createScrollViewer({
    canvas: h.canvas,
    onError: () => assert.fail("unexpected failure"),
  });
  const model = buildDisplayGlasses(product(), 0);
  viewer.setObject(model);
  const hinge = viewer.getAnchor("detail.hinge.right");
  assert.ok(viewer.explodedRadius > viewer.radius);
  for (const [width, height] of [
    [1808, 1018],
    [375, 812],
  ]) {
    h.canvas.clientWidth = width;
    h.canvas.clientHeight = height;
    h.resize();
    const poses = resolveScrollPoses(
      viewer.radius,
      viewer.aspect,
      viewer.getAnchor,
      viewer.explodedRadius,
    );
    const assembledPoses = resolveScrollPoses(
      viewer.radius,
      viewer.aspect,
      viewer.getAnchor,
    );
    assert.equal(
      poses[1].distance,
      fitDistance(viewer.explodedRadius, viewer.aspect),
    );
    for (const index of [0, 2, 3, 4])
      assert.deepEqual(poses[index], assembledPoses[index]);
    for (const explode of [0, 0.25, 0.5, 0.75, 1]) {
      viewer.setPose({ ...poses[1], explode });
      assert.deepEqual(viewer.getAnchor("detail.hinge.right"), hinge);
      assert.deepEqual(
        [poses[3].targetX, poses[3].targetY, poses[3].targetZ],
        hinge.toArray(),
      );
      const camera = h.renderers[0].camera;
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry.computeBoundingBox();
        const box = node.geometry.boundingBox;
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const projected = new THREE.Vector3(x, y, z)
                .applyMatrix4(node.matrixWorld)
                .project(camera);
              assert.ok(
                Math.abs(projected.x) <= 1 &&
                  Math.abs(projected.y) <= 1 &&
                  Math.abs(projected.z) <= 1,
                `${width}×${height} ${node.name}: ${projected.toArray()}`,
              );
            }
      });
    }
  }
  viewer.dispose();
  assert.equal(h.callbacks.size, 0);
});

test("scroll viewer renders on demand, fits on resize and releases resources on context loss", () => {
  const h = devices();
  let viewer;
  const resolvePoses = () =>
    resolveScrollPoses(viewer.radius, viewer.aspect, viewer.getAnchor);
  viewer = createScrollViewer({
    canvas: h.canvas,
    onError: () => h.errors.push("lost"),
    onResize: () => viewer.setPose(resolvePoses()[0]),
  });
  const model = buildDisplayGlasses(product(), 0);
  const counts = resources(model).map((resource) => {
    const counter = { n: 0 };
    resource.addEventListener("dispose", () => counter.n++);
    return counter;
  });
  viewer.setObject(model);
  const transforms = [];
  model.traverse((node) =>
    transforms.push([
      node,
      node.position.clone(),
      node.quaternion.clone(),
      node.scale.clone(),
    ]),
  );
  const poses = resolvePoses();
  viewer.setPose(poses[0]);
  const renderer = h.renderers[0];
  assert.equal(h.callbacks.size, 0, "no animation frame loop");
  assert.equal(
    h.canvas.listeners.get("pointerdown")?.size ?? 0,
    0,
    "no orbit input",
  );
  const distance = renderer.camera.position.length();
  for (const pose of poses) viewer.setPose(pose);
  for (const [node, position, quaternion, scale] of transforms) {
    assert.ok(node.position.equals(position));
    assert.ok(node.quaternion.equals(quaternion));
    assert.ok(node.scale.equals(scale));
  }
  viewer.setPose({ ...poses[1], phi: -100 });
  assert.ok(
    Math.abs(
      new THREE.Spherical().setFromVector3(renderer.camera.position).phi - 0.02,
    ) < 1e-9,
  );
  h.canvas.clientWidth = 280;
  h.canvas.clientHeight = 500;
  h.resize();
  assert.ok(renderer.camera.position.length() > distance);
  assert.deepEqual(renderer.size, [280, 500]);
  h.doc.hidden = true;
  const renders = renderer.renders;
  viewer.setPose(resolvePoses()[3]);
  assert.equal(renderer.renders, renders);
  h.doc.hidden = false;
  h.event(h.doc, "visibilitychange");
  assert.equal(renderer.renders, renders + 1);
  h.event(h.canvas, "webglcontextlost");
  assert.deepEqual(h.errors, ["lost"]);
  assert.ok(renderer.disposed && renderer.cleared);
  assert.ok(counts.every((counter) => counter.n === 1));
  assert.equal(h.environment.disposals, 1);
  assert.ok(h.observerDisconnected);
  assert.equal(h.canvas.count(), 0);
  assert.equal(h.doc.count(), 0);
  viewer.dispose();
  assert.equal(h.environment.disposals, 1);
});

const blueprintCSS = await readFile("src/pages/v2-demo.css", "utf8");
function tokensFor(theme) {
  const block = (selector) =>
    blueprintCSS.slice(blueprintCSS.indexOf(selector)).split("}")[0];
  const values = Object.fromEntries(
    (
      block(":root[data-blueprint-theme]") +
      (theme === "blue" ? block(':root[data-blueprint-theme="blue"]') : "")
    )
      .matchAll(/(--blueprint-[\w-]+):\s*([^;]+);/g)
      .map((match) => [match[1], match[2].trim()]),
  );
  return readBlueprintTokens({ getPropertyValue: (key) => values[key] ?? "" });
}

test("exporting Ellis design curves preserves product and try-on geometry, materials and transforms byte for byte", () => {
  for (const [overlay, expected] of [
    [false, "56366e13e7cf8f8cddfa8dfff7f736f87dc068b90f7d986db20ecce6581f21df"],
    [true, "bfd6d6172914cc5bea850f2123614dd80dbdabe1d266ce8c26d009e118adeb22"],
  ]) {
    const model = buildEllis(undefined, { overlay });
    const hash = createHash("sha256");
    model.traverse((node) => {
      hash.update(node.name);
      hash.update(
        JSON.stringify([
          node.position.toArray(),
          node.quaternion.toArray(),
          node.scale.toArray(),
        ]),
      );
      if (!node.isMesh) return;
      for (const [name, attribute] of Object.entries(
        node.geometry.attributes,
      )) {
        hash.update(name);
        hash.update(Buffer.from(attribute.array.buffer));
      }
      if (node.geometry.index)
        hash.update(Buffer.from(node.geometry.index.array.buffer));
      const { uuid, metadata, ...material } = node.material.toJSON();
      hash.update(JSON.stringify(material));
    });
    assert.equal(
      hash.digest("hex"),
      expected,
      "hash recorded before Round 4 refactoring",
    );
    disposeObject(model);
  }
});

test("blueprint design lines follow both warped front faces and actual arm surface vertices, parented to moving parts", () => {
  const model = buildDisplayGlasses(product(), 0);
  const curves = ellisBlueprintCurves(model);
  assert.equal(curves.length, 16); // Six outlines, eight arm edges, two centre curves.
  for (const { part, points, centre } of curves) {
    if (part.name === "front_frame")
      for (const p of points) {
        assert.ok(
          Math.abs(
            Math.abs(p.z - warp(p.x * 1000, p.y * 1000) * 0.001) -
              ELLIS_FRONT_DEPTH * 0.0005,
          ) < 1e-12,
        );
      }
    else if (!centre) {
      const vertices = part.geometry.attributes.position;
      for (const p of points) {
        let closest = Infinity;
        for (let i = 0; i < vertices.count; i++)
          closest = Math.min(
            closest,
            p.distanceTo(new THREE.Vector3().fromBufferAttribute(vertices, i)),
          );
        assert.ok(closest < 1e-8, "arm point is an authored surface vertex");
      }
    }
  }
  const blueprint = createBlueprint(model);
  const lines = [];
  model.traverse((n) => {
    if (n.isLine2 || n.isLineSegments2) lines.push(n);
  });
  assert.equal(lines.length, 30);
  assert.ok(
    lines
      .filter((line) => line.name.endsWith("centre"))
      .every(
        (line) =>
          line.material.depthFunc === THREE.GreaterDepth &&
          line.material.dashed,
      ),
  );
  assert.ok(
    lines.every((line) =>
      ["front_frame", "temple_L", "temple_R"].includes(line.parent.name),
    ),
  );
  assert.ok(
    lines
      .filter((line) => line.name.endsWith("hidden"))
      .every(
        (line) =>
          line.material.depthFunc === THREE.GreaterDepth &&
          line.material.dashed,
      ),
  );
  const line = lines.find((line) => line.parent.name === "temple_R");
  const before = line.getWorldPosition(new THREE.Vector3());
  createExploder(model, EXPLODE_MM).set(1);
  const after = line.getWorldPosition(new THREE.Vector3());
  assert.ok(
    after.distanceTo(before.clone().add(new THREE.Vector3(3, 0, -1.2))) < 1e-12,
  );
  blueprint.dispose();
  assert.ok(lines.every((line) => line.parent === null));
  disposeObject(model);
});

test("CSS theme tokens recolor flat materials without rebuilding; DPR widths and missing-outline fallback work", () => {
  for (const model of [
    buildDisplayGlasses(product(), 0),
    buildDisplayGlasses(product({ slug: "the-remy", shape: "Round" }), 0),
  ]) {
    const blueprint = createBlueprint(model);
    const lines = [];
    model.traverse((n) => {
      if (n.isLine2 || n.isLineSegments2) lines.push(n);
    });
    assert.ok(lines.length > 0);
    if (!model.getObjectByName("ellis.reference"))
      assert.ok(lines.every((line) => line.isLineSegments2));
    const geometries = lines.map((line) => line.geometry);
    let front = model.getObjectByName("front_frame");
    if (!front)
      model.traverse((n) => {
        if (!front && n.isMesh && !n.isLineSegments2) front = n;
      });
    const original = front.material;
    const releases = new Map();
    for (const resource of new Set([
      ...geometries,
      ...lines.map((line) => line.material),
    ]))
      resource.addEventListener("dispose", () =>
        releases.set(resource, (releases.get(resource) ?? 0) + 1),
      );
    for (const theme of ["ink", "blue"]) {
      const tokens = tokensFor(theme);
      blueprint.recolor(tokens);
      blueprint.resize(375, 812, 2);
      blueprint.draw(() => {
        assert.ok(front.material.isMeshBasicMaterial);
        assert.equal(
          front.material.color.getHexString(),
          theme === "ink" ? "1a1a1a" : "1e4963",
        );
        assert.equal(front.material.opacity, theme === "ink" ? 0.6 : 0.55);
        assert.ok(!("transmission" in front.material));
        for (const line of lines) {
          const visible = line.name.endsWith("visible");
          assert.equal(
            line.material.color.getHexString(),
            tokens[visible ? "line" : "hidden"].slice(1),
          );
          assert.equal(line.material.opacity, visible ? 1 : 0.45);
          assert.equal(line.material.linewidth, visible ? 3.4 : 2);
          assert.deepEqual(line.material.resolution.toArray(), [750, 1624]);
          assert.ok(line.visible);
        }
        for (const name of ["lens_L", "lens_R"]) {
          const lens = model.getObjectByName(name);
          if (!lens) continue;
          assert.equal(
            lens.material.color.getHexString(),
            theme === "ink" ? "ffffff" : "78d2e6",
          );
          assert.equal(lens.material.opacity, theme === "ink" ? 0.05 : 0.08);
          assert.equal(lens.material.depthWrite, false);
        }
      });
      assert.equal(front.material, original);
      assert.ok(lines.every((line) => !line.visible));
      assert.deepEqual(
        lines.map((line) => line.geometry),
        geometries,
      );
    }
    assert.throws(() =>
      blueprint.draw(() => {
        throw Error("GPU failure");
      }),
    );
    assert.equal(front.material, original);
    blueprint.dispose();
    blueprint.dispose();
    assert.ok([...releases.values()].every((count) => count === 1));
    assert.equal(
      releases.size,
      new Set([...geometries, ...lines.map((line) => line.material)]).size,
    );
    disposeObject(model);
  }
});

test("mix zero retains studio materials and render state, partial/full blueprint restores state and cleans GPU resources", () => {
  const h = devices();
  const viewer = createScrollViewer({
    canvas: h.canvas,
    onError: () => assert.fail("unexpected failure"),
  });
  const model = buildDisplayGlasses(product(), 0);
  viewer.setObject(model);
  viewer.setBlueprintTokens(tokensFor("ink"));
  const poses = resolveScrollPoses(
    viewer.radius,
    viewer.aspect,
    viewer.getAnchor,
    viewer.explodedRadius,
  );
  viewer.setPose({ ...poses[0], blueprint: 0 });
  const renderer = h.renderers[0];
  const scene = renderer.scene;
  const environment = scene.environment;
  const original = model.getObjectByName("front_frame").material;
  const floor = scene.getObjectByName("floor");
  const state = {
    shadow: renderer.shadowMap.enabled,
    visible: floor.visible,
    tone: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
  };
  const initialRenders = renderer.renders;
  for (const mix of [0.2, 0.8, 1, 0]) {
    viewer.setPose({ ...poses[2], blueprint: mix });
    assert.equal(model.getObjectByName("front_frame").material, original);
    assert.equal(scene.environment, environment);
    assert.deepEqual(
      {
        shadow: renderer.shadowMap.enabled,
        visible: floor.visible,
        tone: renderer.toneMapping,
        exposure: renderer.toneMappingExposure,
      },
      state,
    );
    assert.equal(renderer.getRenderTarget(), null);
  }
  assert.equal(renderer.renders - initialRenders, 6); // First fade builds both images; the next only composites.
  viewer.setPose({ ...poses[2], blueprint: 0.5 });
  let renders = renderer.renders;
  viewer.setBlueprintTokens(tokensFor("blue"));
  assert.equal(renderer.renders - renders, 3); // Theme invalidates both cached images.
  renders = renderer.renders;
  viewer.setPose({ ...poses[2], blueprint: 0.6 });
  assert.equal(renderer.renders - renders, 1);
  renders = renderer.renders;
  h.canvas.clientWidth = 375;
  h.resize();
  assert.equal(renderer.renders - renders, 3); // New drawing-buffer size invalidates.
  renders = renderer.renders;
  h.doc.hidden = true;
  viewer.setPose({ ...poses[2], blueprint: 0.5 });
  viewer.setBlueprintTokens(tokensFor("blue"));
  assert.equal(renderer.renders, renders);
  viewer.dispose();
  viewer.dispose();
  assert.ok(renderer.disposed);
  assert.equal(h.callbacks.size, 0);
});

test("scroll-only shadow caching refreshes on assembly changes and keeps product viewer defaults", () => {
  const h = devices();
  const viewer = createScrollViewer({
    canvas: h.canvas,
    onError: () => assert.fail("unexpected failure"),
  });
  viewer.setObject(buildDisplayGlasses(product(), 0));
  const poses = resolveScrollPoses(
    viewer.radius,
    viewer.aspect,
    viewer.getAnchor,
    viewer.explodedRadius,
  );
  viewer.setPose(poses[0]);
  const renderer = h.renderers[0];
  assert.equal(renderer.shadowMap.autoUpdate, false);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  viewer.setPose({ ...poses[1], explode: 0 });
  assert.equal(renderer.shadowMap.needsUpdate, false);
  viewer.setPose({ ...poses[1], explode: 0.5 });
  assert.equal(renderer.shadowMap.needsUpdate, true);
  viewer.setPose({ ...poses[1], explode: 0.5 });
  assert.equal(renderer.shadowMap.needsUpdate, false);
  viewer.setPose({ ...poses[1], explode: 0 });
  assert.equal(renderer.shadowMap.needsUpdate, true);
  viewer.dispose();
  const productDevices = devices();
  const productViewer = createObjectViewer({
    canvas: productDevices.canvas,
    onError: () => assert.fail("unexpected failure"),
  });
  assert.notEqual(productDevices.renderers[0].shadowMap.autoUpdate, false);
  productViewer.dispose();
});

test("saved blueprint choice validates values and tolerates reads, getter and writes denied by storage", () => {
  assert.equal(
    readBlueprintTheme(() => ({
      getItem: (key) => {
        assert.equal(key, BLUEPRINT_THEME_KEY);
        return "blue";
      },
    })),
    "blue",
  );
  for (const value of [null, "", "paper", "ink"])
    assert.equal(
      readBlueprintTheme(() => ({ getItem: () => value })),
      "ink",
    );
  assert.equal(
    readBlueprintTheme(() => {
      throw Error("denied getter");
    }),
    "ink",
  );
  assert.equal(
    readBlueprintTheme(() => ({
      getItem: () => {
        throw Error("denied read");
      },
    })),
    "ink",
  );
  assert.doesNotThrow(() =>
    saveBlueprintTheme(
      () => ({
        setItem: () => {
          throw Error("denied write");
        },
      }),
      "blue",
    ),
  );
});

test("blueprint lines are disposed once when the shared studio fails or loses context", () => {
  for (const failure of ["context", "render"]) {
    const h = devices();
    const viewer = createScrollViewer({
      canvas: h.canvas,
      onError: () => h.errors.push(failure),
    });
    const model = buildDisplayGlasses(product(), 0);
    viewer.setObject(model);
    viewer.setBlueprintTokens(tokensFor("ink"));
    const pose = resolveScrollPoses(
      viewer.radius,
      viewer.aspect,
      viewer.getAnchor,
      viewer.explodedRadius,
    )[2];
    viewer.setPose(pose);
    const counts = new Map(
      resources(model).map((resource) => {
        resource.addEventListener("dispose", () =>
          counts.set(resource, counts.get(resource) + 1),
        );
        return [resource, 0];
      }),
    );
    if (failure === "context") h.event(h.canvas, "webglcontextlost");
    else {
      h.failRender = true;
      viewer.setPose({ ...pose, blueprint: 0.5 });
    }
    viewer.dispose();
    assert.deepEqual(h.errors, [failure]);
    assert.ok(
      [...counts.values()].every((count) => count === 1),
      "each mesh/line geometry and material is released once",
    );
    assert.equal(h.canvas.count(), 0);
    assert.ok(h.renderers[0].disposed);
  }
});
