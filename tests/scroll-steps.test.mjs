import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
await mkdir(".sites-runtime", { recursive: true });
const output = resolve(".sites-runtime/scroll-step-tests.mjs");
await build({
  entryPoints: ["src/tryon/scroll-steps.ts"],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
});
const {
  createScrollSteps,
  stepDuration,
  scrollStepWeights,
  EXPLODE_STEP_WEIGHT,
  GESTURE_IDLE_MS,
  STEP_MIN,
  STEP_MAX,
} = await import(pathToFileURL(output));
after(() => rm(output, { force: true }));

function harness(count = 5, reduced = false, angle = 0) {
  const controller = createScrollSteps(count, () => 1000, reduced, angle);
  let time = angle;
  const send = (type, at, fields = {}) => {
    const commands = controller.handle({ type, at, time, ...fields });
    for (const command of commands) {
      if (command.type === "scrubTo") time = command.time;
      if (command.type === "cutTo") time = command.angle;
    }
    return commands;
  };
  return {
    controller,
    send,
    wheel: (deltaY, at, fields) => send("wheel", at, { deltaY, ...fields }),
    setTime: (next) => {
      time = next;
    },
    get time() {
      return time;
    },
  };
}
const animate = (angle, ease = "power2.inOut") => [
  { type: "animateTo", angle, ease },
];

test("one notch and a burst step only once, even after landing", () => {
  const h = harness();
  assert.deepEqual(h.wheel(100, 0), animate(1));
  h.setTime(1);
  h.send("landed", 50, { angle: 1 });
  for (let n = 1; n < 10; n++) assert.deepEqual(h.wheel(100, n * 40), []);
});

test("a second of decaying inertia with no idle gap never takes another step", () => {
  const h = harness();
  assert.deepEqual(h.wheel(100, 0), animate(1));
  for (let n = 1; n < 64; n++)
    assert.deepEqual(h.wheel(100 * 0.92 ** n, n * 16), []);
});

test("separate gestures retarget in flight, capped at one extra angle", () => {
  const h = harness();
  h.wheel(100, 0);
  h.setTime(0.3);
  assert.deepEqual(h.wheel(100, 200), animate(2, "power2.out"));
  assert.deepEqual(h.wheel(100, 400), animate(2, "power2.out"));
  assert.deepEqual(h.wheel(-100, 600), animate(1, "power2.out"));
  assert.deepEqual(h.wheel(-100, 800), animate(0, "power2.out"));
});

test("an opposite gesture retargets to the start", () => {
  const h = harness();
  h.wheel(100, 0);
  h.setTime(0.4);
  assert.deepEqual(h.wheel(-100, 200), animate(0, "power2.out"));
});

test("slow input scrubs proportionally, clamps at its neighbour and settles forward", () => {
  const h = harness();
  for (let n = 0; n < 38; n++) {
    const commands = h.wheel(4, n * 16);
    assert.deepEqual(commands, [
      { type: "scrubTo", time: ((n + 1) * 4) / 500 },
    ]);
  }
  assert.deepEqual(
    h.send("idle", 37 * 16 + GESTURE_IDLE_MS),
    animate(1, "power2.out"),
  );
  const clamped = harness();
  for (let n = 0; n < 200; n++) clamped.wheel(4, n * 16);
  assert.equal(clamped.time, 1);
  assert.deepEqual(
    clamped.send("idle", 199 * 16 + GESTURE_IDLE_MS),
    animate(1, "power2.out"),
  );
});

test("reversal settles back at the starting angle, including an exact return", () => {
  const h = harness();
  for (let n = 0; n < 20; n++) h.wheel(4, n * 16);
  h.wheel(-4, 340);
  assert.deepEqual(h.send("idle", 520), animate(0, "power2.out"));
  const exact = harness();
  exact.wheel(4, 0);
  exact.wheel(-4, 120);
  assert.deepEqual(exact.send("idle", 300), animate(0, "power2.out"));
});

test("touch holds scrub without idle settling; release follows last movement; taps return", () => {
  const h = harness();
  h.send("touchStart", 0);
  assert.deepEqual(h.send("touchMove", 400, { deltaY: 100 }), [
    { type: "scrubTo", time: 0.2 },
  ]);
  assert.deepEqual(h.send("idle", 1000), []);
  assert.deepEqual(h.send("touchEnd", 1200), animate(1, "power2.out"));
  const reverse = harness();
  reverse.send("touchStart", 0);
  reverse.send("touchMove", 30, { deltaY: 100 });
  reverse.send("touchMove", 60, { deltaY: -10 });
  assert.deepEqual(reverse.send("touchEnd", 100), animate(0, "power2.out"));
  const tap = harness();
  tap.send("touchStart", 0);
  tap.send("touchMove", 40, { deltaY: 7 });
  assert.deepEqual(tap.send("touchEnd", 100), animate(0, "power2.out"));
});

test("bounds, ctrl/horizontal wheel, blocked UI and editable/interactive focus ignore input", () => {
  assert.deepEqual(harness().wheel(-100, 0), []);
  assert.deepEqual(harness(5, false, 4).wheel(100, 0), []);
  const h = harness();
  assert.deepEqual(h.wheel(100, 0, { ctrlKey: true }), []);
  assert.deepEqual(h.wheel(100, 0, { deltaX: 101 }), []);
  assert.deepEqual(h.wheel(100, 0, { blocked: true }), []);
  for (const fields of [
    { key: "ArrowDown", editable: true },
    { key: " ", interactive: true },
    { key: "Enter", interactive: true },
    { key: "End", blocked: true },
  ])
    assert.deepEqual(h.send("key", 0, fields), []);
  assert.deepEqual(h.wheel(100, 0), animate(1));
});

test("reduced motion only cuts once per wheel/touch gesture and responds live", () => {
  const h = harness(5, true);
  assert.deepEqual(h.wheel(4, 0), [{ type: "cutTo", angle: 1 }]);
  for (let n = 1; n < 40; n++) assert.deepEqual(h.wheel(4, n * 16), []);
  h.send("touchStart", 1000);
  assert.deepEqual(h.send("touchMove", 1100, { deltaY: 20 }), [
    { type: "cutTo", angle: 2 },
  ]);
  assert.deepEqual(h.send("touchMove", 1200, { deltaY: 300 }), []);
  assert.deepEqual(h.send("touchEnd", 1300), []);
  const live = harness();
  live.wheel(100, 0);
  live.setTime(0.2);
  assert.deepEqual(live.controller.setReduced(true, live.time), [
    { type: "cutTo", angle: 1 },
  ]);
  assert.deepEqual(live.wheel(100, 50), []);
});

test("all step keys and Home/End work with a sixth angle", () => {
  for (const key of ["ArrowDown", "PageDown", " "])
    assert.deepEqual(harness(6).send("key", 0, { key }), animate(1));
  for (const fields of [
    { key: "ArrowUp" },
    { key: "PageUp" },
    { key: " ", shiftKey: true },
  ])
    assert.deepEqual(harness(6, false, 3).send("key", 0, fields), animate(2));
  assert.deepEqual(harness(6).send("key", 0, { key: "End" }), animate(5));
  assert.deepEqual(
    harness(6, false, 5).send("key", 0, { key: "Home" }),
    animate(0),
  );
  assert.deepEqual(harness(6, true).send("key", 0, { key: "End" }), [
    { type: "cutTo", angle: 5 },
  ]);
  assert.deepEqual(harness(6, true, 5).send("key", 0, { key: "Home" }), [
    { type: "cutTo", angle: 0 },
  ]);
  assert.deepEqual(harness(6, false, 4).wheel(100, 0), animate(5));
});

test("step durations scale with distance and clamp for partial and multi-angle moves", () => {
  assert.equal(stepDuration(0, 1), 1.1);
  assert.equal(stepDuration(0.99, 1), STEP_MIN);
  assert.equal(stepDuration(0, 5), STEP_MAX);
});

test("reversal before the first animation tick still cancels the destination", () => {
  const h = harness();
  h.wheel(100, 0);
  assert.deepEqual(h.wheel(-100, 200), animate(0, "power2.out"));
});

test("a short fast accumulation carries on from its scrub position", () => {
  const h = harness();
  h.wheel(20, 0);
  assert.deepEqual(h.wheel(20, 30), animate(1, "power2.out"));
});

test("a scrub interrupting a step starts at the current camera time without a jump", () => {
  const forward = harness();
  forward.wheel(100, 0);
  forward.setTime(0.7);
  assert.deepEqual(forward.wheel(4, 200), [{ type: "scrubTo", time: 0.708 }]);
  assert.deepEqual(forward.send("idle", 380), animate(1, "power2.out"));
  const reverse = harness();
  reverse.wheel(100, 0);
  reverse.setTime(0.7);
  reverse.send("touchStart", 200);
  reverse.send("touchMove", 220, { deltaY: -100 });
  assert.ok(Math.abs(reverse.time - 0.5) < 1e-9);
  assert.deepEqual(reverse.send("touchEnd", 400), animate(0, "power2.out"));
});

test("split step weights scale full/partial/reverse durations and scrub distance without changing gesture decisions", () => {
  const states = [
    { exploded: false },
    { exploded: true },
    { exploded: false },
    { exploded: false },
  ];
  const weights = scrollStepWeights(states);
  assert.deepEqual(weights, [EXPLODE_STEP_WEIGHT, EXPLODE_STEP_WEIGHT, 1]);
  assert.ok(Math.abs(stepDuration(0, 1, weights) - 1.54) < 1e-12);
  assert.ok(Math.abs(stepDuration(2, 1, weights) - 1.54) < 1e-12);
  assert.ok(Math.abs(stepDuration(0.8, 1.2, weights) - 0.616) < 1e-12);
  assert.equal(stepDuration(0, 3, weights), STEP_MAX);
  assert.equal(stepDuration(0.99, 1, weights), STEP_MIN);
  for (const [start, delta, expected] of [
    [0, 70, 0.1],
    [1, 70, 1.1],
    [1, -70, 0.9],
    [2, -70, 1.9],
    [2, 70, 2.14],
  ]) {
    const steps = createScrollSteps(
      states.length,
      () => 1000,
      false,
      start,
      weights,
    );
    steps.handle({ type: "touchStart", at: 0, time: start });
    const [command] = steps.handle({
      type: "touchMove",
      at: 200,
      time: start,
      deltaY: delta,
    });
    assert.equal(command.type, "scrubTo");
    assert.ok(Math.abs(command.time - expected) < 1e-12);
  }
  const steps = createScrollSteps(states.length, () => 1000, false, 0, weights);
  assert.deepEqual(
    steps.handle({ type: "wheel", at: 0, time: 0, deltaY: 100 }),
    animate(1),
  );
  assert.deepEqual(
    steps.handle({ type: "wheel", at: 50, time: 0.2, deltaY: 100 }),
    [],
  );
});
