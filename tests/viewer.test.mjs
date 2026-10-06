import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
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
      "export * from './viewer';export * from './glasses';export * from './resources';",
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
const resources = (object) => {
  const found = new Set();
  object.traverse((node) => {
    if (node.isMesh) {
      found.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        found.add(material);
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
test("front, side, top and perspective views fit the whole model at mobile and desktop sizes", () => {
  for (const [width, height] of [
    [338, 275],
    [600, 570],
    [300, 650],
  ]) {
    const h = devices({ width, height }),
      viewer = h.start(),
      model = buildDisplayGlasses(product(), 0);
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

test("only The Ellis exposes a 3D option; gallery starts with photos and preserves the selected colour", async () => {
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
