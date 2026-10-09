import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { gsap } from "gsap";
await mkdir(".sites-runtime", { recursive: true });
const output = resolve(".sites-runtime/scroll-exit-tests.mjs");
await build({
  stdin: {
    contents: "export * from './scroll-exit';export * from './scroll-poses';export * from './scroll-budget';export * from './scroll-timeline';export * from './ellis';export * from './explode';",
    resolveDir: resolve("src/tryon"),
  },
  outfile: output, bundle: true, format: "esm", platform: "node", external: ["three", "gsap"],
});
const exit = await import(pathToFileURL(output));
after(() => rm(output, { force: true }));
function fixture(width, height) {
  const model = exit.buildEllis(0x0b0d0f, {});
  const box = new THREE.Box3().setFromObject(model);
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  model.position.sub(box.getCenter(new THREE.Vector3()));
  model.updateWorldMatrix(true, true);
  const reference = model.getObjectByName("ellis.reference");
  const poses = exit.resolveScrollPoses(radius, width / height, (name) =>
    model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()));
  const path = exit.resolveExitPath(poses[4], width, height, reference);
  return { model, reference, poses, path };
}
function project(point, camera, width, height) {
  const p = point.clone().project(camera);
  return new THREE.Vector2((p.x + 1) * width / 2, (1 - p.y) * height / 2);
}
function solidTriangles(model) {
  const triangles = [];
  model.traverse(node => {
    if (!node.isMesh || node.name.startsWith("lens_")) return;
    const p = node.geometry.attributes.position, index = node.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const vertex = n => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(n) : n)
        .applyMatrix4(node.matrixWorld);
      triangles.push(new THREE.Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
    }
  });
  return triangles;
}
function clearance(point, triangles) {
  const closest = new THREE.Vector3();
  let squared = Infinity;
  for (const triangle of triangles)
    squared = Math.min(squared, triangle.closestPointToPoint(point, closest).distanceToSquared(point));
  return Math.sqrt(squared);
}

test("camera orbits positive X to a level wearer POV, then pushes straight through the clear centre safely", () => {
  for (const [width, height] of [[1920, 945], [375, 812]]) {
    const { model, reference, poses, path } = fixture(width, height);
    const matrices = [];
    model.traverse(node => matrices.push(node.matrixWorld.clone()));
    const triangles = solidTriangles(model);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000);
    const local = reference.worldToLocal(path.point.clone());
    assert.ok(local.x > 0.03 && local.x < 0.04, "model-right optical centre, in metres");
    assert.ok(clearance(path.point, triangles) > 1.5, "target has >15 mm clearance from solid frame");
    assert.ok(clearance(path.frameCentre, triangles) > 0.8, "centre opening has >8 mm solid clearance");
    exit.applyExitPath(camera, path, 0);
    assert.deepEqual(camera.position.toArray(), path.position.toArray());
    assert.ok(camera.quaternion.angleTo(path.orientation) < 1e-7);
    assert.equal(camera.fov, 30);
    // Dense geometry checks include the radial entry below the right temple,
    // the central opening and the period before the paper is fully opaque.
    let minimum = Infinity, previousAngle = path.startAngle, previousDepth = -Infinity;
    const snapshots = [];
    for (let n = 0; n <= 400; n++) {
      const u = n / 400;
      exit.applyExitPath(camera, path, u);
      const distance = clearance(camera.position, triangles);
      minimum = Math.min(minimum, distance);
      assert.ok(distance > Math.max(0.3, camera.near * 3), `solid clearance at u=${u}: ${distance}`);
      assert.ok(camera.far / camera.near < 10001);
      assert.ok(Number.isFinite(camera.projectionMatrix.determinant()));
      const offset = camera.position.clone().sub(path.frameCentre);
      if (u > 0 && u < exit.EXIT_ORBIT_END) {
        const angle = Math.atan2(offset.dot(path.right), offset.dot(path.forward));
        assert.ok(angle >= previousAngle - 1e-9, "clockwise around model-right");
        assert.ok(reference.worldToLocal(camera.position.clone()).x >= -1e-9, "orbit stays on positive X side");
        previousAngle = angle;
      }
      if (u >= exit.EXIT_ORBIT_END) {
        assert.ok(Math.abs(offset.dot(path.right)) < 1e-9, "push never translates sideways");
        assert.ok(Math.abs(offset.dot(path.up)) < 1e-9);
        const direction = camera.getWorldDirection(new THREE.Vector3());
        assert.ok(direction.dot(path.forward) > 0.999999);
        assert.ok(Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).dot(path.up)) < 1e-9,
          "horizon remains level");
        assert.ok(offset.dot(path.forward) >= previousDepth - 1e-9, "forward dolly stays monotonic");
        previousDepth = offset.dot(path.forward);
        if (offset.dot(path.forward) < -0.1) {
          assert.ok(project(path.frameCentre, camera, width, height).distanceTo(new THREE.Vector2(width / 2, height / 2)) < 0.01);
          const hits = new THREE.Raycaster(camera.position, direction).intersectObject(model, true);
          assert.equal(hits.length, 0, "centre sight line misses bridge, pads, rims and lenses");
        }
      }
      snapshots.push({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov });
    }
    // Re-evaluating in reverse must restore every camera sample without state.
    for (let n = 400; n >= 0; n--) {
      exit.applyExitPath(camera, path, n / 400);
      assert.deepEqual(camera.position.toArray(), snapshots[n].position);
      assert.deepEqual(camera.quaternion.toArray(), snapshots[n].quaternion);
      assert.equal(camera.fov, snapshots[n].fov);
    }
    assert.equal(camera.near, 0.1);
    assert.equal(camera.far, 1000);
    let i = 0;
    model.traverse(node => assert.deepEqual(node.matrixWorld.elements, matrices[i++].elements));
    console.log(JSON.stringify({ viewport: [width, height], opticalCentreMetres: local.toArray(), minimumSolidClearanceMm: minimum * 10, eyeDepthMm: path.eyeDepth * 10 }));
  }
});

test("orbit approaches throughout, with a centred straight wearer view throughout the push", () => {
  for (const [width, height] of [[1920, 945], [1808, 931], [375, 812]]) {
    const { reference, path } = fixture(width, height);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000);
    let previousRadius = Infinity, previousSpan = Infinity;
    for (let n = 0; n <= 100; n++) {
      exit.applyExitPath(camera, path, exit.EXIT_ORBIT_END * n / 100);
      const offset = camera.position.clone().sub(path.frameCentre);
      const radius = Math.hypot(offset.dot(path.right), offset.dot(path.forward));
      const span = radius * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      assert.ok(radius < previousRadius, "camera advances while it rotates, including early orbit");
      assert.ok(span < previousSpan, "perceived zoom never shrinks or waits for the end of rotation");
      if (n >= 12) {
        assert.ok(project(path.frameCentre, camera, width, height)
          .distanceTo(new THREE.Vector2(width / 2, height / 2)) < 0.01, "frame stays centred during rotation");
      }
      previousRadius = radius;
      previousSpan = span;
    }
    for (const u of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) {
      exit.applyExitPath(camera, path, u);
      const centre = project(path.frameCentre, camera, width, height);
      assert.ok(centre.distanceTo(new THREE.Vector2(width / 2, height / 2)) < 0.01);
      const hinges = ['detail.hinge.left', 'detail.hinge.right'].map(name =>
        project(reference.getObjectByName(name).getWorldPosition(new THREE.Vector3()), camera, width, height));
      assert.ok(Math.abs(hinges[0].y - hinges[1].y) < 0.01, "hinges share a horizontal line");
      assert.ok(Math.abs((hinges[0].x + hinges[1].x) / 2 - width / 2) < 0.01,
        "hinges are equally spaced about the viewport centre");
    }
  }
});

test("resize resolves the resting lens even while the live model is exploded", () => {
  const { model, poses } = fixture(1920, 945);
  const assembled = model.clone(true);
  const reference = assembled.getObjectByName("ellis.reference");
  const first = exit.resolveExitPath(poses[4], 1920, 945, reference);
  exit.createExploder(model, 30).set(1);
  const rebuilt = exit.resolveExitPath(poses[4], 375, 812, reference);
  assert.deepEqual(rebuilt.point.toArray(), first.point.toArray());
  assert.deepEqual(rebuilt.bounds.min.toArray(), first.bounds.min.toArray());
  assert.deepEqual(rebuilt.bounds.max.toArray(), first.bounds.max.toArray());
  assert.ok(rebuilt.wearerFov > first.wearerFov);
});

test("copy zooms immediately without fading or orbiting; chrome and paper retain their endpoints", () => {
  assert.deepEqual(exit.exitSurface(0), { copyOpacity: 1, copyScale: 1, chromeOpacity: 1, paperOpacity: 0 });
  let previousScale = 1;
  for (const u of [0.2, 0.4, 0.65, 0.85, 1]) {
    const surface = exit.exitSurface(u);
    assert.equal(surface.copyOpacity, 1);
    assert.ok(surface.copyScale > previousScale);
    previousScale = surface.copyScale;
    assert.equal(surface.paperOpacity, u === 1 ? 1 : 0);
  }
  assert.ok(exit.exitSurface(0.001).copyScale > 1, "text starts growing on the first increment");
  assert.deepEqual(exit.exitSurface(1), { copyOpacity: 1, copyScale: 40, chromeOpacity: 0, paperOpacity: 1 });
});

test("exit scalar is monotonic and restores endpoints in both directions after resize rebuilds", () => {
  const timeline = gsap.timeline({ paused: true });
  for (const [width, height] of [[1920, 945], [375, 812], [1920, 945]]) {
    const { poses } = fixture(width, height);
    const base = exit.buildMotionBudget(poses, [], width, height);
    const original = [...base.seconds];
    const budget = exit.withExitBudget(base);
    assert.deepEqual(base.seconds, original);
    assert.deepEqual(budget.seconds, [...original, 2.8]);
    assert.deepEqual(budget.steps.slice(0, 4), base.steps);
    const pose = { ...poses[0] };
    exit.populateScrollTimeline(timeline, pose, poses, budget);
    exit.appendExitTimeline(timeline, pose, 4);
    for (const times of [
      Array.from({ length: 21 }, (_, n) => 4 + n / 20),
      Array.from({ length: 21 }, (_, n) => 5 - n / 20),
    ]) for (const time of times) {
      timeline.time(time, false);
      assert.ok(Math.abs(pose.exit - (time - 4)) < 1e-9);
      for (const key of ["targetX", "targetY", "targetZ", "theta", "phi", "distance", "light", "explode", "blueprint"])
        assert.ok(Math.abs(pose[key] - poses[4][key]) < 1e-9);
    }
    timeline.time(3, false);
    assert.equal(pose.exit, 0);
  }
  timeline.kill();
});
