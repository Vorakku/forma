import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { gsap } from "gsap";

await mkdir(".sites-runtime", { recursive: true });
const output = resolve(".sites-runtime/scroll-motion-tests.mjs");
const baseline = resolve(".sites-runtime/scroll-motion-round4.mjs");
await build({
  stdin: {
    contents:
      "export * from './glasses';export * from './scroll-poses';export * from './explode';export * from './screen-motion';export * from './scroll-budget';export * from './scroll-animation';export * from './scroll-timeline';export * from './scroll-steps';",
    resolveDir: resolve("src/tryon"),
  },
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
});
// Load the committed timeline and gesture rules, rather than a deliberately bad
// approximation. Its driver's gsap.to below is the original page's exact wiring.
const historical = Object.fromEntries(
  await Promise.all(
    ["scroll-timeline", "scroll-steps"].map(async (name) => [
      name,
      await readFile(`tests/fixtures/round4/${name}.ts`, "utf8"),
    ]),
  ),
);
await build({
  stdin: {
    contents: "export * from 'round4-timeline';export * from 'round4-steps';",
    resolveDir: resolve("src/tryon"),
  },
  outfile: baseline,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  plugins: [
    {
      name: "round4",
      setup(build) {
        build.onResolve({ filter: /^round4-(timeline|steps)$/ }, (args) => ({
          path: args.path,
          namespace: "round4",
        }));
        build.onResolve({ filter: /^\.\/scroll-steps$/ }, (args) =>
          args.namespace === "round4"
            ? { path: "round4-steps", namespace: "round4" }
            : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "round4" }, (args) => ({
          contents:
            historical[
              args.path === "round4-timeline"
                ? "scroll-timeline"
                : "scroll-steps"
            ],
          loader: "ts",
          resolveDir: resolve("src/tryon"),
        }));
      },
    },
  ],
});
const motion = await import(pathToFileURL(output));
const old = await import(pathToFileURL(baseline));
const {
  buildDisplayGlasses,
  createExploder,
  resolveScrollPoses,
  sampleFrameSurface,
  projectionCamera,
  visibleScreenSpeed,
  median,
  buildMotionBudget,
  interpolateOrbit,
  populateScrollTimeline,
  animateScrollStep,
  planStepAnimation,
  createScrollSteps,
  trapezoid,
  CAMERA_SPEED,
  RAMP_S,
  EXPLODE_S,
  BLUEPRINT_S,
  JUMP_SPEEDUP,
  SCRUB_PX_PER_S,
} = motion;
after(async () => {
  gsap.ticker.sleep();
  await Promise.all([
    rm(output, { force: true }),
    rm(baseline, { force: true }),
  ]);
});
const product = {
  id: "server-ellis",
  slug: "the-ellis",
  name: "The Ellis",
  dimensions: "52 · 18 · 145",
  shape: "Rectangle",
  material: "Acetate",
  category: "optical",
  colors: ["Ink black"],
  swatches: [{ hex: "#202021" }],
};
const model = buildDisplayGlasses(product, 0);
const initialBox = new THREE.Box3().setFromObject(model),
  radius = initialBox.getBoundingSphere(new THREE.Sphere()).radius;
model.position.sub(initialBox.getCenter(new THREE.Vector3()));
model.updateWorldMatrix(true, true);
const points = sampleFrameSurface(model);
const anchor = (name) =>
  model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
const exploder = createExploder(model, 30);
exploder.set(1);
const explodedRadius = new THREE.Box3()
  .setFromObject(model)
  .getBoundingSphere(new THREE.Sphere()).radius;
exploder.set(0);
const fixtures = [
  [1808, 1018],
  [375, 812],
].map(([width, height]) => {
  const poses = resolveScrollPoses(
    radius,
    width / height,
    anchor,
    explodedRadius,
  );
  return {
    width,
    height,
    poses,
    budget: buildMotionBudget(poses, points, width, height),
  };
});

// Advance the production GSAP driver with an injected monotonic clock. The
// real onUpdate, planner, timeline and Three.js camera projection all run.
function controlledAnimation(timeline, budget, angle, options = {}) {
  let elapsed = 0;
  const animation = animateScrollStep(timeline, budget, angle, {
    ...options,
    now: () => elapsed,
  });
  animation.tween.pause();
  return {
    ...animation,
    seek(value) {
      elapsed = value;
      animation.tween.totalTime(value, false);
      return this;
    },
  };
}

function runGuard(
  { width, height, poses, budget },
  legacy = false,
  reverse = false,
) {
  const pose = { ...poses[0] };
  const timeline = (
    legacy ? old.populateScrollTimeline : populateScrollTimeline
  )(gsap.timeline({ paused: true }), pose, poses, budget);
  const controller = (legacy ? old.createScrollSteps : createScrollSteps)(
    poses.length,
    () => height,
    false,
    0,
    legacy ? old.scrollStepWeights(motion.SCROLL_ANGLES) : budget.seconds,
  );
  const rows = [];
  for (let i = 0; i < poses.length - 1; i++) {
    const start = reverse ? i + 1 : i;
    timeline.time(start, false);
    controller.handle({ type: "landed", angle: i, at: i * 10000, time: i });
    const [command] = controller.handle({
      type: "key",
      key: reverse ? "ArrowUp" : "ArrowDown",
      at: i * 10000 + 200,
      time: timeline.time(),
    });
    let tween, duration, animation;
    if (legacy) {
      duration = old.stepDuration(
        start,
        command.angle,
        old.scrollStepWeights(motion.SCROLL_ANGLES),
      );
      tween = gsap.to(timeline, {
        time: command.angle,
        duration,
        ease: command.ease,
      });
    } else {
      animation = controlledAnimation(timeline, budget, command.angle, {
        jump: command.jump,
      });
      tween = animation.tween;
      duration = animation.plan.duration;
    }
    tween.pause();
    const phase = budget.steps[i].phases.find((p) => p.kind === "camera");
    const ordered = reverse
      ? [...budget.steps[i].phases].reverse()
      : budget.steps[i].phases;
    const offset = ordered
      .slice(0, ordered.indexOf(phase))
      .reduce((sum, p) => sum + p.seconds, 0);
    const samples = [];
    let previous = projectionCamera(pose, width, height),
      lastDistance = pose.distance,
      lastTheta = pose.theta,
      lastPhi = pose.phi;
    for (let frame = 1; frame <= Math.ceil(duration * 60); frame++) {
      const elapsed = Math.min(duration, frame / 60);
      if (legacy) tween.time(elapsed, false);
      else animation.seek(elapsed);
      const camera = projectionCamera(pose, width, height);
      if (
        Math.abs(pose.distance - lastDistance) +
          Math.abs(pose.theta - lastTheta) +
          Math.abs(pose.phi - lastPhi) >
        1e-9
      ) {
        samples.push({
          elapsed,
          speed: visibleScreenSpeed(
            points,
            previous,
            camera,
            width,
            height,
            1 / 60,
          ),
        });
      }
      previous = camera;
      lastDistance = pose.distance;
      lastTheta = pose.theta;
      lastPhi = pose.phi;
    }
    const cruise = legacy
      ? samples.filter(
          (s) =>
            s.elapsed >
              samples[0].elapsed +
                (samples.at(-1).elapsed - samples[0].elapsed) * 0.2 &&
            s.elapsed <
              samples.at(-1).elapsed -
                (samples.at(-1).elapsed - samples[0].elapsed) * 0.2,
        )
      : samples.filter(
          (s) =>
            s.elapsed >= offset + RAMP_S + 1 / 60 &&
            s.elapsed <= offset + phase.seconds - RAMP_S,
        );
    assert.ok(cruise.length >= 3);
    const speed = median(cruise.map((s) => s.speed));
    rows.push({
      move: reverse ? `${i + 1}→${i}` : `${i}→${i + 1}`,
      length: legacy ? undefined : phase.move.length,
      cameraSeconds: legacy
        ? samples.at(-1).elapsed - samples[0].elapsed
        : phase.seconds,
      stepSeconds: duration,
      cruise: speed,
      // Each angle's pace deliberately scales its move; evenness is judged after that.
      pace: legacy ? 1 : motion.SCROLL_ANGLES[i + 1].pace,
      spike: Math.max(...samples.map((s) => s.speed)) / speed,
    });
    tween.kill();
  }
  timeline.kill();
  return rows;
}
function assertEven(rows) {
  const centre = median(rows.map((r) => r.cruise / r.pace));
  for (const r of rows) {
    assert.ok(
      Math.abs(r.cruise / r.pace / centre - 1) <= 0.2,
      `${r.move}: ${r.cruise} at pace ${r.pace} vs ${centre}`,
    );
    assert.ok(r.spike <= 1.5, `${r.move} spike ${r.spike}`);
  }
}

test("real gesture → step animation → timeline projection guard fails on 97e1737 and passes at both stage sizes", () => {
  for (const fixture of fixtures) {
    const before = runGuard(fixture, true),
      after = runGuard(fixture);
    assert.throws(() => assertEven(before));
    assertEven(after);
    console.log(
      JSON.stringify({
        viewport: `${fixture.width}×${fixture.height}`,
        CAMERA_SPEED,
        before,
        after,
      }),
    );
  }
  assert.ok(
    Math.abs(fixtures[0].budget.steps[0].phases[0].seconds - 1.9) < 0.01,
  );
});

test("reverse single steps retain the same projection cruise rate", () => {
  for (const fixture of fixtures) assertEven(runGuard(fixture, false, true));
});

test("surface sampling is deterministic, area weighted in world space and on triangles", () => {
  assert.equal(points.length, 300);
  assert.deepEqual(
    sampleFrameSurface(model).map((p) => p.toArray()),
    points.map((p) => p.toArray()),
  );
  const group = new THREE.Group();
  const large = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  large.scale.set(2, 2, 1);
  const small = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  small.position.x = 10;
  group.add(large, small);
  const sampled = sampleFrameSurface(group);
  assert.equal(sampled.filter((p) => p.x < 5).length, 240);
  for (const p of sampled) {
    assert.equal(p.z, 0);
    assert.ok(
      p.x < 5
        ? Math.abs(p.x) < 1 && Math.abs(p.y) < 1
        : Math.abs(p.x - 10) < 0.5 && Math.abs(p.y) < 0.5,
    );
  }
  const pin = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001));
  pin.position.x = 20;
  group.add(pin);
  assert.equal(
    sampleFrameSurface(group).filter((point) => point.x > 15).length,
    1,
  );
  pin.geometry.dispose();
  pin.material.dispose();
  large.geometry.dispose();
  small.geometry.dispose();
  large.material.dispose();
  small.material.dispose();
});

test("metric excludes off-stage and behind-camera points, uses fewer than twelve and normalises by the shorter side", () => {
  const pose = {
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    theta: 0,
    phi: Math.PI / 2,
    distance: 10,
  };
  const a = projectionCamera(pose, 600, 600),
    b = projectionCamera({ ...pose, targetX: 0.1 }, 600, 600);
  const visible = [
    new THREE.Vector3(0.1, 0.1, 0),
    new THREE.Vector3(-0.1, -0.1, 0),
  ];
  const speed = visibleScreenSpeed(visible, a, b, 600, 600, 1);
  assert.ok(speed > 0);
  assert.equal(
    visibleScreenSpeed(
      [...visible, new THREE.Vector3(100, 100, 0), new THREE.Vector3(0, 0, 20)],
      a,
      b,
      600,
      600,
      1,
    ),
    speed,
  );
  assert.equal(visibleScreenSpeed(visible, a, b, 1200, 1200, 1), speed);
  assert.equal(visibleScreenSpeed(visible, a, b, 1200, 600, 1), speed * 2);
  assert.ok(Number.isFinite(visibleScreenSpeed([], a, b, 600, 600, 1)));
  assert.equal(visibleScreenSpeed([], a, a, 600, 600, 1), 0);
});

test("surface median pure zoom is lower than the mean displacement of empty bounding-box corners", () => {
  const pose = fixtures[0].poses[0],
    a = projectionCamera({ ...pose, theta: 0, phi: Math.PI / 2 }, 1808, 1018),
    b = projectionCamera(
      { ...pose, theta: 0, phi: Math.PI / 2, distance: pose.distance * 0.6 },
      1808,
      1018,
    );
  const box = new THREE.Box3().setFromObject(model),
    corners = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        corners.push(new THREE.Vector3(x, y, z));
  const mean =
    corners.reduce((sum, p) => {
      const u = p.clone().project(a),
        v = p.clone().project(b);
      return (
        sum +
        Math.hypot(((v.x - u.x) * 1808) / 2, ((v.y - u.y) * 1018) / 2) / 1018
      );
    }, 0) / 8;
  assert.ok(visibleScreenSpeed(points, a, b, 1808, 1018, 1) < mean);
});

test("log orbit midpoint is geometric mean; explicit theta never wraps and phi remains clamped", () => {
  const a = { ...fixtures[0].poses[2], theta: 3 },
    b = { ...fixtures[0].poses[3], theta: -3 };
  const mid = interpolateOrbit(a, b, 0.5);
  assert.ok(
    Math.abs(mid.distance - Math.sqrt(a.distance * b.distance)) < 1e-12,
  );
  assert.equal(mid.theta, 0);
  assert.equal(interpolateOrbit({ ...a, phi: -1 }, b, 0).phi, 0.02);
});

test("budget derives seconds/shares, resize rebuilds them, and all scene states remain at integer times", () => {
  assert.notDeepEqual(fixtures[0].budget.seconds, fixtures[1].budget.seconds);
  for (const { poses, budget } of fixtures) {
    const p = { ...poses[0] },
      timeline = populateScrollTimeline(
        gsap.timeline({ paused: true }),
        p,
        poses,
        budget,
      );
    assert.equal(timeline.duration(), poses.length - 1);
    poses.forEach((expected, k) => {
      timeline.time(k, false);
      for (const key of Object.keys(expected))
        assert.ok(Math.abs(p[key] - expected[key]) < 1e-6, `${k} ${key}`);
    });
    for (const step of budget.steps) {
      assert.equal(
        step.seconds,
        step.phases.reduce((sum, p) => sum + p.seconds, 0),
      );
      for (const phase of step.phases) {
        assert.ok(
          Math.abs(phase.end - phase.start - phase.seconds / step.seconds) <
            1e-12,
        );
        if (phase.kind === "explode") assert.equal(phase.seconds, EXPLODE_S);
        if (phase.kind === "blueprint")
          assert.equal(phase.seconds, BLUEPRINT_S);
      }
    }
    timeline.kill();
  }
});

test("each special phase has the configured trapezoid and direct scrubbing is proportional to its seconds", () => {
  const { poses, budget, height } = fixtures[0],
    p = { ...poses[0] },
    timeline = populateScrollTimeline(
      gsap.timeline({ paused: true }),
      p,
      poses,
      budget,
    );
  const animation = controlledAnimation(timeline, budget, 2); // two-angle ordinary traversal retains phase rests
  animation.tween.pause();
  let offset = 0;
  for (const step of budget.steps.slice(0, 2))
    for (const phase of step.phases) {
      const profile = trapezoid(phase.seconds, phase.seconds);
      assert.equal(profile(0).velocity, 0);
      assert.equal(profile(phase.seconds).velocity, 0);
      assert.ok(
        Math.abs(
          profile(RAMP_S).velocity - profile(phase.seconds - RAMP_S).velocity,
        ) < 1e-12,
      );
      if (phase.kind !== "camera")
        for (const elapsed of [
          RAMP_S / 2,
          RAMP_S,
          phase.seconds / 2,
          phase.seconds - RAMP_S / 2,
        ]) {
          animation.seek(offset + elapsed);
          assert.ok(
            Math.abs(
              p[phase.kind] -
                (phase.from +
                  ((phase.to - phase.from) * profile(elapsed).distance) /
                    phase.seconds),
            ) < 1e-6,
          );
        }
      const secondsForScrub = (phase.end - phase.start) * step.seconds;
      assert.ok(Math.abs(secondsForScrub - phase.seconds) < 1e-12);
      const controller = createScrollSteps(
        poses.length,
        () => height,
        false,
        Math.floor(phase.start),
        budget.seconds,
      );
      controller.handle({ type: "touchStart", at: 0, time: phase.start });
      const delta = (SCRUB_PX_PER_S * height * phase.seconds) / 2;
      const command = controller.handle({
        type: "touchMove",
        at: 200,
        time: phase.start,
        deltaY: delta,
      })[0];
      assert.ok(
        Math.abs(command.time - (phase.start + (phase.end - phase.start) / 2)) <
          1e-12,
      );
      offset += phase.seconds;
    }
  animation.tween.kill();
  timeline.kill();
});

test("Home/End play at JUMP_SPEEDUP without internal stops and retarget carries actual velocity", () => {
  const { poses, budget } = fixtures[0],
    p = { ...poses[0] },
    timeline = populateScrollTimeline(
      gsap.timeline({ paused: true }),
      p,
      poses,
      budget,
    );
  const controller = createScrollSteps(
    poses.length,
    () => 1018,
    false,
    0,
    budget.seconds,
  );
  const [command] = controller.handle({
    type: "key",
    key: "End",
    at: 0,
    time: 0,
  });
  assert.equal(command.jump, true);
  const jump = controlledAnimation(timeline, budget, command.angle, {
    jump: command.jump,
  });
  jump.tween.pause();
  assert.ok(
    Math.abs(
      jump.plan.duration -
        budget.seconds.reduce((a, b) => a + b, 0) / JUMP_SPEEDUP,
    ) < 1e-12,
  );
  let boundary = 0;
  for (const step of budget.steps.slice(0, -1)) {
    boundary += step.seconds;
    assert.ok(jump.plan.sample(boundary / JUMP_SPEEDUP).velocity > 0);
  }
  jump.tween.kill();
  timeline.time(0, false);
  const first = controlledAnimation(timeline, budget, 1);
  first.seek(0.6);
  const time = timeline.time(),
    velocity = first.velocity();
  assert.ok(velocity > 0);
  first.tween.kill();
  const retarget = controlledAnimation(timeline, budget, 2, { velocity });
  retarget.tween.pause();
  assert.equal(retarget.plan.sample(0).velocity, velocity);
  assert.equal(timeline.time(), time);
  retarget.seek(0.01);
  assert.ok(timeline.time() > time);
  assert.ok(
    retarget.velocity() > 0 && Math.abs(retarget.velocity() - velocity) < 0.1,
  );
  retarget.tween.kill();
  // Reverse retarget starts with the old signed velocity too, then brakes.
  timeline.time(time, false);
  const reverse = planStepAnimation(budget, time, 0, false, velocity);
  assert.equal(reverse.sample(0).velocity, velocity);
  timeline.kill();
});

test("monotonic animation clock excludes explicit pauses and completes only once", () => {
  const { poses, budget } = fixtures[0],
    pose = { ...poses[0] };
  const timeline = populateScrollTimeline(
    gsap.timeline({ paused: true }),
    pose,
    poses,
    budget,
  );
  let now = 0,
    completions = 0;
  const animation = animateScrollStep(timeline, budget, 1, {
    now: () => now,
    onComplete: () => completions++,
  });
  animation.tween.pause();
  now = 0.4;
  animation.tween.totalTime(0.4, false);
  const held = timeline.time();
  animation.pause();
  now = 20;
  animation.tween.totalTime(0.8, false);
  assert.equal(timeline.time(), held);
  animation.resume();
  now = 20.2;
  animation.tween.totalTime(1, false);
  assert.ok(Math.abs(timeline.time() - animation.plan.sample(0.6).time) < 1e-6);
  now = 20 + animation.plan.duration;
  animation.tween.totalTime(2, false);
  assert.equal(timeline.time(), 1);
  assert.equal(completions, 1);
  animation.tween.totalTime(3, false);
  assert.equal(completions, 1);
  animation.tween.kill();
  timeline.kill();
});
