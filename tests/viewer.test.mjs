import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
      "export * from './viewer';export * from './glasses';export * from './resources';export * from './scroll-viewer';export * from './scroll-poses';export * from './scroll-timeline';",
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
  holdStart,
  stillPoseIndex,
  HOLD_DURATION,
  TIMELINE_DURATION,
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

test("one GSAP orbit timeline holds every pose at both boundaries and never crosses a pole", async () => {
  const { gsap } = await import("gsap");
  const poses = resolveScrollPoses(10, 1, () => ({ x: 6, y: 1, z: 5 }));
  const pose = { ...poses[0] };
  const timeline = populateScrollTimeline(
    gsap.timeline({ paused: true }),
    pose,
    poses,
  );
  assert.ok(Math.abs(timeline.duration() - TIMELINE_DURATION) < 1e-9);
  // GSAP rounds numeric tween values to six decimal places.
  const equals = (expected) =>
    Object.entries(expected).forEach(([key, value]) =>
      assert.ok(Math.abs(pose[key] - value) < 1e-6, key),
    );
  for (let index = 0; index < poses.length; index++) {
    for (const time of [holdStart(index), holdStart(index) + HOLD_DURATION]) {
      timeline.time(time, false);
      equals(poses[index]);
    }
    assert.equal(stillPoseIndex(holdStart(index) + HOLD_DURATION / 2), index);
  }
  for (let time = TIMELINE_DURATION; time >= 0; time -= 0.01) {
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
