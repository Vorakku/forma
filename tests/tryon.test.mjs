import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import * as THREE from "three";

// Use real geometry/math and replace only browser devices and model inference.
await mkdir(".sites-runtime", { recursive: true });
const output = resolve(".sites-runtime/tryon-tests.mjs");
await build({
  stdin: {
    contents:
      "export * from './engine';export * from './filter';export * from './glasses';export * from './face-mesh';export * from './lighting';",
    resolveDir: resolve("src/tryon"),
  },
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "device-boundary",
      setup(build) {
        build.onResolve({ filter: /^three$/ }, (args) =>
          args.namespace === "renderer"
            ? { path: "three", external: true }
            : { path: "three", namespace: "renderer" },
        );
        build.onLoad({ filter: /.*/, namespace: "renderer" }, () => ({
          contents:
            "export * from 'three';export class WebGLRenderer{constructor(){return new globalThis.tryonHarness.Renderer()}}export class PMREMGenerator{fromScene(){return{texture:{dispose(){}}}}dispose(){}}",
        }));
        build.onResolve({ filter: /^@mediapipe\/tasks-vision$/ }, () => ({
          path: "tracker",
          namespace: "device",
        }));
        build.onResolve({ filter: /\?url$/ }, (args) => ({
          path: args.path,
          namespace: "asset",
        }));
        build.onLoad({ filter: /.*/, namespace: "asset" }, (args) => ({
          contents: `export default ${JSON.stringify("/assets/" + args.path.split("/").pop().replace("?url", ""))};`,
        }));
        build.onLoad({ filter: /.*/, namespace: "device" }, () => ({
          contents:
            "export class FaceLandmarker{static createFromOptions(fileset,options){return globalThis.tryonHarness.load(fileset,options)}}",
        }));
      },
    },
  ],
});
const {
  OneEuroFilter,
  buildGlasses,
  buildOverlayGlasses,
  parseDimensions,
  disposeObject,
  createFaceEngine,
  verticalFov,
  EYE_CORNERS,
  ANCHOR_OFFSET,
  NOSE_BRIDGE_POSITION,
  OCCLUDER_SIZE,
  OCCLUDER_POSITION,
  createFaceGeometry,
  updateFaceGeometry,
  FACE_MESH_INSET,
  LightEstimator,
  estimateLight,
  lightSettings,
  LIGHT_COLOR_MIX,
  LIGHT_SMOOTHING,
  LIGHT_SAMPLE_EVERY,
  KEY_SHIFT_MAX_X,
  KEY_SHIFT_MAX_Y,
} = await import(pathToFileURL(output));
const canonical = JSON.parse(
  await readFile("src/tryon/face-mesh.json", "utf8"),
);
after(() => rm(output, { force: true }));
const product = (overrides = {}) => ({
  id: "server-frame",
  slug: "the-remy",
  colors: ["Ink black", "Gold"],
  dimensions: "52 · 18 · 145",
  shape: "Rectangle",
  material: "Acetate",
  category: "optical",
  swatches: [{ hex: "#161616" }, { hex: "#c3a969" }],
  ...overrides,
});
const resources = (object) => {
  const geometries = new Set(),
    materials = new Set();
  object.traverse((node) => {
    if (node.isMesh) {
      geometries.add(node.geometry);
      for (const m of Array.isArray(node.material)
        ? node.material
        : [node.material])
        materials.add(m);
    }
  });
  return [...geometries, ...materials];
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function devices({
  fallback = false,
  gpuFails = false,
  loadError = false,
  cameraFailure,
  secure = true,
} = {}) {
  const track = new EventTarget();
  track.stops = 0;
  track.stop = () => {
    track.stops++;
  };
  const stream = { getTracks: () => [track] },
    video = new EventTarget(),
    canvas = new EventTarget();
  Object.assign(video, {
    videoWidth: 640,
    videoHeight: 480,
    currentTime: 0,
    readyState: 2,
    srcObject: null,
    paused: false,
    play: async () => {},
    pause() {
      this.paused = true;
    },
  });
  canvas.style = {};
  const callbacks = new Map();
  let nextId = 0;
  const request = (callback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    },
    cancel = (id) => callbacks.delete(id);
  if (!fallback) {
    video.requestVideoFrameCallback = request;
    video.cancelVideoFrameCallback = cancel;
  }
  const harness = {
    track,
    stream,
    video,
    canvas,
    callbacks,
    loads: [],
    renderers: [],
    detections: [],
    result: { faceLandmarks: [], facialTransformationMatrixes: [] },
    cameraCalls: 0,
    tracker: {
      closes: 0,
      close() {
        this.closes++;
      },
      detectForVideo(_, time) {
        harness.detections.push(time);
        if (harness.detectError) throw Error("Inference failed");
        return harness.result;
      },
    },
  };
  const motion = new EventTarget();
  motion.matches = false;
  harness.motion = motion;
  harness.samples = 0;
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {
              harness.samples++;
            },
            getImageData(_, __, width, height) {
              const data = new Uint8ClampedArray(width * height * 4);
              for (let i = 0; i < data.length; i += 4) {
                data[i] = data[i + 1] = data[i + 2] = 128;
                data[i + 3] = 255;
              }
              return { data };
            },
          };
        },
      };
    },
  };
  harness.Renderer = class {
    constructor() {
      this.renders = [];
      this.shadowMap = {};
      this.order = [];
      harness.renderers.push(this);
    }
    setPixelRatio(value) {
      this.pixelRatio = value;
    }
    setClearColor() {}
    setSize(width, height) {
      this.size = [width, height];
    }
    setRenderTarget(target) {
      this.target = target;
    }
    render(scene, camera) {
      const face = scene.children.find((node) => node.isGroup);
      if (!face) {
        if (scene.children[0].material.isShaderMaterial) {
          this.composite = scene;
          this.order.push({
            draw: "composite",
            detections: harness.detections.length,
          });
          return;
        }
        this.background = scene;
        this.order.push({
          draw: "video",
          detections: harness.detections.length,
          version: scene.children[0].material.map.version,
        });
        return;
      }
      this.layerTarget = this.target;
      this.order.push({ draw: "pose", detections: harness.detections.length });
      this.scene = scene;
      this.camera = camera;
      this.renders.push({ visible: face.visible, matrix: face.matrix.clone() });
    }
    clear() {
      this.cleared = true;
    }
    dispose() {
      this.disposed = true;
    }
    forceContextLoss() {
      this.contextLost = true;
    }
  };
  harness.load = async (fileset, options) => {
    harness.loads.push({ fileset, options });
    if (loadError || (gpuFails && options.baseOptions.delegate === "GPU"))
      throw Error("Delegate failed");
    return harness.tracker;
  };
  harness.advance = () => {
    const entries = [...callbacks.entries()];
    assert.ok(entries.length, "a video/animation callback is scheduled");
    video.currentTime += 1 / 60;
    for (const [id, callback] of entries) {
      callbacks.delete(id);
      callback();
    }
  };
  globalThis.tryonHarness = harness;
  globalThis.window = {
    isSecureContext: secure,
    devicePixelRatio: 3,
    innerWidth: 1440,
    matchMedia: () => motion,
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia(options) {
          harness.cameraCalls++;
          harness.constraints = options;
          if (cameraFailure)
            return Promise.reject(
              new DOMException("Unavailable", cameraFailure),
            );
          return harness.cameraPending ?? Promise.resolve(stream);
        },
      },
    },
  });
  globalThis.requestAnimationFrame = request;
  globalThis.cancelAnimationFrame = cancel;
  return harness;
}
const start = (h, options = {}) =>
  createFaceEngine({ video: h.video, canvas: h.canvas, ...options });
function pose(position = new THREE.Vector3(1, 2, -45), angle = 0) {
  return {
    faceLandmarks: [[]],
    facialTransformationMatrixes: [
      {
        data: new THREE.Matrix4()
          .compose(
            position,
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              angle,
            ),
            new THREE.Vector3(1, 1, 1),
          )
          .toArray(),
      },
    ],
  };
}

test("One Euro suppresses stationary jitter, adapts to speed and resets on reacquisition", () => {
  const filter = new OneEuroFilter(),
    samples = [];
  for (let i = 0; i < 180; i++) {
    const raw = 10 + (i % 2 ? 0.2 : -0.2),
      value = filter.filter(raw, i / 60);
    if (i > 60) samples.push((value - 10) ** 2);
  }
  assert.ok(
    Math.sqrt(samples.reduce((a, b) => a + b, 0) / samples.length) < 0.03,
  );
  const adaptive = new OneEuroFilter(1, 0.1),
    fixed = new OneEuroFilter(1, 0);
  adaptive.filter(0, 0);
  fixed.filter(0, 0);
  for (let i = 1; i <= 60; i++) {
    adaptive.filter(i, i / 60);
    fixed.filter(i, i / 60);
  }
  assert.ok(adaptive.filter(61, 61 / 60) > fixed.filter(61, 61 / 60) + 3);
  filter.reset();
  assert.equal(filter.filter(-40, 10), -40);
  assert.equal(
    filter.filter(99, 10),
    -40,
    "duplicate timestamps do not destabilise the derivative",
  );
});

test("live face mesh follows image rays at canonical pose depth plus the inset, reusing its topology and buffers", () => {
  const geometry = createFaceGeometry(),
    positions = geometry.getAttribute("position"),
    buffer = positions.array,
    index = geometry.index;
  assert.equal(positions.count, 468);
  assert.equal(index.count, 898 * 3);
  assert.equal(positions.usage, THREE.DynamicDrawUsage);
  for (const [width, height, yaw] of [
    [1280, 720, 0.2],
    [375, 667, Math.PI / 4],
  ]) {
    const camera = new THREE.PerspectiveCamera(
        verticalFov(width, height),
        width / height,
        1,
        10000,
      ),
      pose = new THREE.Matrix4().compose(
        new THREE.Vector3(3, 1, -50),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, yaw, 0.05)),
        new THREE.Vector3(1, 1, 1),
      );
    const truth = canonical.vertices.map((p) =>
        new THREE.Vector3().fromArray(p).applyMatrix4(pose),
      ),
      landmarks = truth.map((p) => {
        const v = p.clone().project(camera);
        return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, z: 99 };
      });
    assert.ok(updateFaceGeometry(geometry, landmarks, pose, camera));
    assert.equal(positions.array, buffer);
    assert.equal(geometry.index, index);
    for (let i = 0; i < 468; i++) {
      const actual = new THREE.Vector3().fromBufferAttribute(positions, i),
        ray = truth[i].clone().normalize(),
        expected = truth[i].clone().addScaledVector(ray, FACE_MESH_INSET),
        image = actual.clone().project(camera);
      assert.ok(
        actual.distanceTo(expected) < 1e-5,
        `vertex ${i} has canonical depth with inset away from the camera`,
      );
      assert.ok(
        Math.abs((image.x + 1) / 2 - landmarks[i].x) < 1e-6 &&
          Math.abs((1 - image.y) / 2 - landmarks[i].y) < 1e-6,
        `vertex ${i} stays on its image ray`,
      );
    }
  }
  assert.equal(
    updateFaceGeometry(
      geometry,
      [],
      new THREE.Matrix4(),
      new THREE.PerspectiveCamera(),
    ),
    false,
  );
  geometry.dispose();
});

test("room light uses linear face regions and unmirrored direction, limits the warm cast and eases over half a second", () => {
  const width = 32,
    height = 18,
    bounds = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.75 },
    ],
    image = (left, right) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          data.set(
            [...(x < width / 2 ? left : right), 255],
            (y * width + x) * 4,
          );
      return data;
    };
  const flat = image([128, 128, 128], [128, 128, 128]),
    warm = image([240, 180, 110], [60, 40, 25]),
    raw = estimateLight(warm, width, height, bounds),
    settings = lightSettings(raw);
  assert.ok(
    raw.horizontal < 0 && settings.shiftX < 0,
    "bright image left moves the key to camera left; CSS mirrors both together",
  );
  assert.ok(
    Math.abs(settings.shiftX) <= KEY_SHIFT_MAX_X &&
      Math.abs(settings.shiftY) <= KEY_SHIFT_MAX_Y,
  );
  assert.ok(
    settings.color[0] > settings.color[1] &&
      settings.color[1] > settings.color[2],
    "ambient and key carry a subtle warm cast",
  );
  assert.ok(
    settings.color.every((c) => c >= 1 - LIGHT_COLOR_MIX && c <= 1),
    "cast stays inside the white mix limit",
  );
  const gray = estimateLight(flat, width, height, bounds);
  assert.ok(
    Math.abs(gray.ambient - 0.2158605) < 1e-6,
    "8-bit sRGB is converted to linear light",
  );
  assert.equal(gray.horizontal, 0);
  assert.equal(gray.vertical, 0);
  const estimator = new LightEstimator();
  estimator.sample(flat, width, height, bounds);
  estimator.update(0);
  estimator.sample(warm, width, height, bounds);
  const early = { ...estimator.update(0.1) },
    eased = { ...estimator.update(LIGHT_SMOOTHING) };
  assert.ok(
    early.horizontal < 0 &&
      early.horizontal > eased.horizontal &&
      eased.horizontal > raw.horizontal,
    "direction eases toward the brighter side",
  );
  assert.ok(
    Math.abs(eased.horizontal / raw.horizontal - (1 - Math.exp(-1))) < 1e-6,
    "time-based smoothing reaches 63% at 0.5 seconds",
  );
  const before = JSON.stringify(estimator.update(LIGHT_SMOOTHING));
  assert.equal(
    JSON.stringify(estimator.update(LIGHT_SMOOTHING)),
    before,
    "duplicate timestamps cannot flicker",
  );
  const mirrored = estimateLight(
    image([60, 40, 25], [240, 180, 110]),
    width,
    height,
    bounds,
  );
  assert.ok(lightSettings(mirrored).shiftX > 0);
  const top = image([128, 128, 128], [128, 128, 128]);
  for (let y = 0; y < height / 2; y++)
    for (let x = 0; x < width; x++)
      top.set([230, 230, 230, 255], (y * width + x) * 4);
  assert.ok(
    lightSettings(estimateLight(top, width, height, bounds)).shiftY > 0,
    "brighter top shifts the key upwards",
  );
  const clipped = estimateLight(warm, width, height, [
    { x: -1, y: -1 },
    { x: 2, y: 2 },
  ]);
  assert.ok(
    Object.values(clipped).flat().every(Number.isFinite),
    "offscreen bounds stay finite",
  );
  estimator.reset();
  estimator.sample(flat, width, height, bounds);
  assert.equal(
    estimator.update(10).horizontal,
    0,
    "camera restart resets the prior room",
  );
});
test("all eight outlines produce finite, distinct geometry with physical dimensions and material colours", () => {
  assert.deepEqual(parseDimensions("52 · 18 · 145"), {
    lens: 52,
    bridge: 18,
    temple: 145,
  });
  assert.throws(() => parseDimensions("52 · nope · 145"));
  const outlines = new Set();
  for (const shape of [
    "Round",
    "Oval",
    "Rectangle",
    "Square",
    "Cat-eye",
    "Aviator",
    "Geometric",
    "Browline",
  ]) {
    const group = buildGlasses(product({ shape }), 1);
    assert.equal(group.scale.x, 0.1);
    group.traverse((node) => {
      if (node.isMesh)
        for (const value of node.geometry.attributes.position.array)
          assert.ok(Number.isFinite(value), shape);
    });
    const rim = group.children[0],
      lens = group.children[1];
    outlines.add(
      JSON.stringify(Array.from(rim.geometry.attributes.position.array)),
    );
    assert.equal(rim.position.x, -35);
    assert.equal(rim.material.color.getHexString(), "c3a969");
    assert.equal(rim.material.metalness, 0.1);
    assert.equal(lens.material.opacity, 0.08);
    const box = new THREE.Box3().setFromObject(group);
    assert.ok(box.min.z <= -14.4);
    assert.ok(box.max.x - box.min.x > 12, "mm geometry is converted to cm");
    disposeObject(group);
  }
  assert.equal(outlines.size, 8);
  const metal = buildGlasses(
    product({ material: "Metal", category: "sun" }),
    0,
  );
  assert.equal(metal.children[0].material.metalness, 0.9);
  assert.equal(metal.children[1].material.opacity, 0.75);
  disposeObject(metal);
  const mixed = buildGlasses(product({ material: "Mixed" }), 0);
  assert.equal(mixed.children[0].material.metalness, 0.1);
  assert.equal(mixed.children.at(-1).material.metalness, 0.9);
  disposeObject(mixed);
});
test("tracking uses camera-space pose, depth occlusion, reset after face loss and video-sized projection", async () => {
  const h = devices(),
    statuses = [],
    engine = await start(h, {
      debug: true,
      onStatus: (status) => statuses.push(status),
    }),
    group = buildGlasses(product(), 0);
  engine.setObject(group);
  h.result = pose();
  h.advance();
  const renderer = h.renderers[0],
    face = renderer.scene.children.find((node) => node.isGroup),
    anchor = face.getObjectByName("face.noseBridge");
  assert.equal(renderer.camera.fov, verticalFov(640, 480));
  assert.equal(renderer.camera.aspect, 640 / 480);
  assert.deepEqual(renderer.size, [640, 480]);
  assert.equal(renderer.pixelRatio, 1);
  const videoMaterial = renderer.background.children[0].material;
  assert.equal(videoMaterial.toneMapped, false);
  assert.equal(videoMaterial.depthWrite, false);
  assert.equal(videoMaterial.map.colorSpace, THREE.SRGBColorSpace);
  const light = renderer.scene.children.find((node) => node.isDirectionalLight);
  assert.ok(light.castShadow);
  assert.deepEqual(light.shadow.mapSize.toArray(), [1024, 1024]);
  assert.deepEqual(
    renderer.order.map(({ draw, detections }) => ({ draw, detections })),
    [
      { draw: "video", detections: 1 },
      { draw: "pose", detections: 1 },
      { draw: "composite", detections: 1 },
    ],
  );
  assert.ok(renderer.order[0].version > 0);
  assert.equal(h.canvas.style.aspectRatio, String(640 / 480));
  assert.equal(renderer.shadowMap.type, THREE.PCFShadowMap);
  assert.ok(renderer.shadowMap.enabled);
  const pass = renderer.composite.children[0].material,
    target = renderer.layerTarget;
  assert.ok(pass.premultipliedAlpha && pass.transparent);
  assert.equal(pass.uniforms.layer.value, target.texture);
  assert.equal(target.samples, 4);
  assert.deepEqual([target.width, target.height], [640, 480]);
  assert.equal(target.texture.type, THREE.HalfFloatType);
  let targetDisposals = 0;
  target.addEventListener("dispose", () => targetDisposals++);
  h.video.videoWidth = 800;
  h.video.videoHeight = 600;
  h.video.dispatchEvent(new Event("resize"));
  assert.equal(targetDisposals, 1);
  assert.deepEqual(
    [
      pass.uniforms.layer.value.image.width,
      pass.uniforms.layer.value.image.height,
    ],
    [800, 600],
  );
  h.video.videoWidth = 640;
  h.video.videoHeight = 480;
  h.video.dispatchEvent(new Event("resize"));
  assert.ok(
    group.children
      .filter((node) => !node.material.transparent)
      .every((node) => node.castShadow),
  );
  assert.ok(
    group.children
      .filter((node) => node.material.transparent)
      .every((node) => !node.castShadow),
  );
  assert.deepEqual(anchor.position.toArray(), [
    NOSE_BRIDGE_POSITION.x + ANCHOR_OFFSET.x,
    NOSE_BRIDGE_POSITION.y + ANCHOR_OFFSET.y,
    NOSE_BRIDGE_POSITION.z + ANCHOR_OFFSET.z,
  ]);
  assert.equal(anchor.children[0], group);
  assert.deepEqual(
    new THREE.Vector3().setFromMatrixPosition(face.matrix).toArray(),
    [1, 2, -45],
  );
  const head = face.children.find(
    (node) => node.isMesh && !node.material.colorWrite,
  );
  assert.ok(head.material.depthWrite);
  assert.ok(head.renderOrder < group.children[0].renderOrder);
  assert.deepEqual(head.scale.toArray(), [
    OCCLUDER_SIZE.x / 2,
    OCCLUDER_SIZE.y / 2,
    OCCLUDER_SIZE.z / 2,
  ]);
  assert.deepEqual(head.position.toArray(), Object.values(OCCLUDER_POSITION));
  assert.ok(
    face.children.some((node) => node.isMesh && node.material.transparent),
  );
  h.result = pose(new THREE.Vector3(2, 2, -45), Math.PI / 4);
  h.advance();
  assert.ok(face.visible);
  assert.ok(
    light.position.y > light.target.position.y,
    "key always remains above the face",
  );
  assert.ok(
    light.target.position.distanceTo(
      new THREE.Vector3(
        NOSE_BRIDGE_POSITION.x,
        NOSE_BRIDGE_POSITION.y,
        NOSE_BRIDGE_POSITION.z,
      ).applyMatrix4(face.matrix),
    ) < 1e-6,
    "shadow camera follows the smoothed pose",
  );
  const movingSeed = pass.uniforms.seed.value;
  h.motion.matches = true;
  h.motion.dispatchEvent(new Event("change"));
  h.advance();
  assert.equal(pass.uniforms.seed.value, 0);
  h.advance();
  assert.equal(pass.uniforms.seed.value, 0, "reduced motion freezes grain");
  assert.ok(movingSeed > 0);
  h.result = { faceLandmarks: [], facialTransformationMatrixes: [] };
  h.advance();
  assert.ok(!face.visible);
  assert.ok(
    renderer.scene.children
      .filter((node) => node.isMesh)
      .every((node) => !node.visible),
    "face depth and shadows hide on face loss",
  );
  h.result = pose(new THREE.Vector3(10, 3, -50));
  h.advance();
  assert.deepEqual(
    new THREE.Vector3().setFromMatrixPosition(face.matrix).toArray(),
    [10, 3, -50],
  );
  assert.deepEqual(statuses, [
    "loading",
    "no-face",
    "tracking",
    "no-face",
    "tracking",
  ]);
  assert.ok(h.detections.every((time) => time > 0));
  assert.equal(
    h.samples,
    Math.ceil(h.detections.length / LIGHT_SAMPLE_EVERY),
    "readback happens only every few tracked frames",
  );
  let passDisposals = 0,
    finalTargetDisposals = 0;
  pass.addEventListener("dispose", () => passDisposals++);
  renderer.layerTarget.addEventListener(
    "dispose",
    () => finalTargetDisposals++,
  );
  engine.dispose();
  engine.dispose();
  assert.equal(passDisposals, 1);
  assert.equal(finalTargetDisposals, 1);
  assert.equal(h.track.stops, 1);
  assert.equal(h.tracker.closes, 1);
  assert.equal(h.video.srcObject, null);
  assert.ok(h.video.paused);
  assert.equal(h.callbacks.size, 0);
  assert.ok(renderer.disposed && renderer.cleared);
  assert.ok(
    !renderer.contextLost,
    "the same canvas remains reusable on restart",
  );
});
test("quaternion smoothing remains normalised and continuous through a full head rotation", async () => {
  const h = devices(),
    engine = await start(h);
  let previous;
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 36) {
    h.result = pose(new THREE.Vector3(0, 0, -45), angle);
    h.advance();
    const q = new THREE.Quaternion();
    h.renderers[0].renders
      .at(-1)
      .matrix.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    assert.ok(Math.abs(q.length() - 1) < 1e-6);
    if (previous) assert.ok(Math.abs(q.dot(previous)) > 0.95);
    previous = q;
  }
  engine.dispose();
});
test("at 45 degrees the head depth surface blocks the far arm while the near arm remains in front", async () => {
  const h = devices(),
    engine = await start(h),
    group = buildGlasses(product(), 0);
  engine.setObject(group);
  h.result = pose(new THREE.Vector3(0, 0, -45), Math.PI / 4);
  h.advance();
  const scene = h.renderers[0].scene,
    head = scene.children
      .find((node) => node.isGroup)
      .children.find((node) => node.isMesh && !node.material.colorWrite);
  scene.updateMatrixWorld(true);
  const blocked = (arm) => {
    const target = new THREE.Box3()
        .setFromObject(arm)
        .getCenter(new THREE.Vector3()),
      ray = new THREE.Raycaster(
        new THREE.Vector3(),
        target.clone().normalize(),
      ),
      hit = ray.intersectObject(head)[0];
    return !!hit && hit.distance < target.length();
  };
  assert.ok(
    blocked(group.children[6]),
    "the far temple must lie behind the head depth surface",
  );
  assert.ok(!blocked(group.children[2]), "the near temple must remain visible");
  engine.dispose();
});
test("the pose is pinned to the landmarks: bridge on landmark 168, eye corners at their detected width", async () => {
  const h = devices(),
    engine = await start(h),
    camera = new THREE.PerspectiveCamera(
      verticalFov(640, 480),
      640 / 480,
      1,
      10000,
    );
  const truth = new THREE.Matrix4().compose(
    new THREE.Vector3(3, 1, -50),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.4, 0.05)),
    new THREE.Vector3(1, 1, 1),
  );
  const landmarks = Array.from({ length: 478 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    })),
    screen = (p, m) =>
      new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(m).project(camera);
  for (const [index, p] of [
    [168, NOSE_BRIDGE_POSITION],
    ...EYE_CORNERS.map((c) => [c.index, c]),
  ]) {
    const v = screen(p, truth);
    landmarks[index] = { x: (v.x + 1) / 2, y: (1 - v.y) / 2, z: 0 };
  }
  // Right rotation, wrong translation (what MediaPipe's FOV/face-size assumptions produce).
  h.result = {
    faceLandmarks: [landmarks],
    facialTransformationMatrixes: [
      { data: truth.clone().setPosition(8, -4, -30).toArray() },
    ],
  };
  h.advance();
  const face = h.renderers[0].scene.children.find((node) => node.isGroup),
    bridge = screen(NOSE_BRIDGE_POSITION, face.matrix);
  const meshes = h.renderers[0].scene.children.filter((node) => node.isMesh);
  assert.equal(meshes.length, 2);
  assert.equal(meshes[0].geometry, meshes[1].geometry);
  assert.ok(meshes.every((node) => node.visible));
  assert.ok(meshes[1].receiveShadow);
  assert.ok(
    Math.abs((bridge.x + 1) / 2 - landmarks[168].x) < 1e-4 &&
      Math.abs((1 - bridge.y) / 2 - landmarks[168].y) < 1e-4,
    "bridge lands on landmark 168",
  );
  assert.ok(
    new THREE.Vector3()
      .setFromMatrixPosition(face.matrix)
      .distanceTo(new THREE.Vector3(3, 1, -50)) < 0.1,
    "depth recovered from eye-corner width",
  );
  engine.dispose();
});
test("switching frames and colours disposes every unique resource exactly once without stopping the camera", async () => {
  const h = devices(),
    engine = await start(h);
  let previous;
  for (let i = 0; i < 120; i++) {
    const next = buildGlasses(
        product({
          shape: i % 2 ? "Round" : "Browline",
          material: i % 3 ? "Acetate" : "Mixed",
        }),
        i % 2,
      ),
      counts = resources(next).map((resource) => {
        const count = { n: 0 };
        resource.addEventListener("dispose", () => count.n++);
        return count;
      });
    engine.setObject(next);
    if (previous) assert.ok(previous.every((count) => count.n === 1));
    engine.setObject(next);
    assert.ok(counts.every((count) => count.n === 0));
    previous = counts;
  }
  assert.equal(h.cameraCalls, 1);
  assert.equal(h.track.stops, 0);
  engine.dispose();
  assert.ok(previous.every((count) => count.n === 1));
  const shared = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    material = new THREE.MeshBasicMaterial();
  let geometryDisposals = 0,
    materialDisposals = 0;
  geometry.addEventListener("dispose", () => geometryDisposals++);
  material.addEventListener("dispose", () => materialDisposals++);
  shared.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  disposeObject(shared);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});
test("GPU failure retries CPU with self-hosted WASM; rAF skips duplicate video frames", async () => {
  const h = devices({ gpuFails: true, fallback: true });
  globalThis.window.innerWidth = 375;
  const engine = await start(h);
  assert.deepEqual(
    h.loads.map((load) => load.options.baseOptions.delegate),
    ["GPU", "CPU"],
  );
  for (const { fileset, options } of h.loads) {
    assert.ok(fileset.wasmLoaderPath.startsWith("/assets/"));
    assert.ok(fileset.wasmBinaryPath.startsWith("/assets/"));
    assert.equal(options.runningMode, "VIDEO");
    assert.equal(options.numFaces, 1);
    assert.ok(options.outputFacialTransformationMatrixes);
  }
  h.advance();
  assert.deepEqual(
    h.renderers[0].scene.children
      .find((node) => node.isDirectionalLight)
      .shadow.mapSize.toArray(),
    [512, 512],
    "mobile starts with a smaller shadow map",
  );
  const entry = h.callbacks.entries().next().value;
  h.callbacks.delete(entry[0]);
  entry[1]();
  assert.equal(h.detections.length, 1);
  assert.equal(
    h.renderers[0].order.length,
    3,
    "duplicate frames neither upload the video nor redraw a stale pose",
  );
  engine.dispose();
  assert.equal(h.callbacks.size, 0);
});
test("camera denied/missing/busy, unsupported browser and model errors clean up startup", async () => {
  for (const [name, code] of [
    ["NotAllowedError", "camera-denied"],
    ["NotFoundError", "camera-missing"],
    ["NotReadableError", "camera-busy"],
  ]) {
    const h = devices({ cameraFailure: name });
    await assert.rejects(start(h), (error) => error.code === code);
    assert.equal(h.loads.length, 0);
    assert.equal(h.callbacks.size, 0);
  }
  const unsupported = devices({ secure: false });
  await assert.rejects(
    start(unsupported),
    (error) => error.code === "unsupported",
  );
  assert.equal(unsupported.cameraCalls, 0);
  const model = devices({ loadError: true });
  await assert.rejects(start(model), (error) => error.code === "model");
  assert.equal(model.track.stops, 1);
  assert.equal(model.video.srcObject, null);
  assert.ok(model.renderers[0].disposed);
});
test("leaving during permission or model loading releases late camera/model results", async () => {
  const camera = devices(),
    permission = deferred(),
    controller = new AbortController();
  camera.cameraPending = permission.promise;
  const pending = start(camera, { signal: controller.signal });
  assert.equal(
    camera.cameraCalls,
    1,
    "camera request starts synchronously from the gesture",
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  permission.resolve(camera.stream);
  await Promise.resolve();
  assert.equal(camera.track.stops, 1);
  const model = devices(),
    loading = deferred(),
    loadStarted = deferred(),
    cancel = new AbortController();
  model.load = () => {
    loadStarted.resolve();
    return loading.promise;
  };
  const starting = start(model, { signal: cancel.signal });
  await loadStarted.promise;
  cancel.abort();
  await assert.rejects(starting, { name: "AbortError" });
  assert.equal(model.track.stops, 1);
  loading.resolve(model.tracker);
  await Promise.resolve();
  assert.equal(model.tracker.closes, 1);
  assert.equal(model.callbacks.size, 0);
});
test("cancelling between permission resolution and the startup continuation releases the stream", async () => {
  const h = devices(),
    controller = new AbortController(),
    pending = start(h, { signal: controller.signal });
  queueMicrotask(() => controller.abort());
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(h.track.stops, 1);
  assert.equal(h.loads.length, 0);
});
test("runtime inference failure, lost WebGL and disconnected camera stop all resources", async () => {
  for (const failure of ["inference", "context", "camera"]) {
    const h = devices(),
      statuses = [],
      engine = await start(h);
    engine.onStatus((status, error) => statuses.push({ status, error }));
    if (failure === "inference") {
      h.detectError = true;
      h.advance();
    } else if (failure === "context")
      h.canvas.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      );
    else h.track.dispatchEvent(new Event("ended"));
    assert.equal(statuses.at(-1).status, "error");
    assert.ok(statuses.at(-1).error.message);
    assert.equal(h.track.stops, 1);
    assert.equal(h.tracker.closes, 1);
    assert.equal(h.callbacks.size, 0);
    engine.dispose();
  }
});

test("reference overlays use the product slug and accept an unfamiliar admin colour", () => {
  const model = buildOverlayGlasses(
    product({
      id: "generated-store-product-id",
      slug: "the-ellis",
      colors: ["New neutral"],
      swatches: [{ hex: "#737373", filter: "none" }],
    }),
    0,
  );
  assert.ok(model.getObjectByName("front_frame"));
  assert.equal(
    model.getObjectByName("front_frame").material.color.getHexString(),
    "737373",
  );
  disposeObject(model);
});
