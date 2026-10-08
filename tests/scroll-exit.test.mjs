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
    contents: "export * from './scroll-exit';export * from './scroll-poses';export * from './scroll-budget';export * from './scroll-timeline';export * from './ellis';",
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
  const dolly = exit.resolveExitDolly(poses[4], width, height, exit.exitFrontPlane(reference));
  return { model, reference, poses, dolly };
}
function project(point, camera, width, height) {
  const p = point.clone().project(camera);
  return new THREE.Vector2((p.x + 1) * width / 2, (1 - p.y) * height / 2);
}
test("dolly fixes P on the nose-gap mark, keeps direction, and matches front-plane DOM scale", () => {
  for (const [width, height] of [[1920, 945], [375, 812]]) {
    const { model, reference, dolly } = fixture(width, height);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000);
    exit.applyExitDolly(camera, dolly, 0);
    const landed = project(dolly.point, camera, width, height);
    const local = reference.worldToLocal(dolly.point.clone());
    assert.ok(Math.abs(local.x) < 1e-10 && Math.abs(local.z) < 1e-10);
    const ray = new THREE.Raycaster(camera.position, dolly.point.clone().sub(camera.position).normalize());
    assert.equal(ray.intersectObject(model, true).length, 0, "P is clear of bridge, lenses and rims");
    // Nearby points on the authored z=0 plane. Front has its unchanged 1.718°
    // inclination; the local projected plane scale must agree to within 1%.
    const points = [[0.001, 0], [-0.001, 0], [0, 0.001], [0, -0.001]].map(([x, y]) =>
      new THREE.Vector3(local.x + x, local.y + y, 0).applyMatrix4(reference.matrixWorld));
    const baseline = points.map(p => project(p, camera, width, height).distanceTo(landed));
    for (let n = 0; n <= 100; n++) {
      const u = n / 100;
      const { scale, depth } = exit.applyExitDolly(camera, dolly, u);
      const mark = project(dolly.point, camera, width, height);
      assert.ok(mark.distanceTo(landed) < 0.5);
      assert.ok(camera.quaternion.angleTo(dolly.orientation) < 1e-7);
      points.forEach((p, i) => assert.ok(
        Math.abs(project(p, camera, width, height).distanceTo(mark) / baseline[i] / scale - 1) < 0.01));
      assert.equal(camera.near, u === 0 ? 0.1 : Math.min(0.1, depth / 4));
      assert.equal(camera.far, u === 0 ? 1000 : camera.near * 1e4);
      assert.ok(depth > camera.near);
    }
    exit.applyExitDolly(camera, dolly, 0);
    assert.deepEqual(camera.position.toArray(), dolly.position.toArray());
    assert.equal(camera.near, 0.1);
    assert.equal(camera.far, 1000);
    console.log(JSON.stringify({ viewport: [width, height], Pmetres: local.toArray(), depthMetres: dolly.d0 / 100, endMm: dolly.d0 / 4 }));
  }
});
test("exit scalar is monotonic and restores endpoints in both directions after resize rebuilds", () => {
  const timeline = gsap.timeline({ paused: true });
  for (const [width, height] of [[1920, 945], [375, 812], [1920, 945]]) {
    const { poses } = fixture(width, height);
    const base = exit.buildMotionBudget(poses, [], width, height);
    const original = [...base.seconds];
    const budget = exit.withExitBudget(base);
    assert.deepEqual(base.seconds, original);
    assert.deepEqual(budget.seconds, [...original, 1.6]);
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
