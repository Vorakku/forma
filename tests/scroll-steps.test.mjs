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
const { createScrollSteps, stepDuration, GESTURE_IDLE_MS } = await import(
  pathToFileURL(output)
);
after(() => rm(output, { force: true }));

function harness(count = 5, reduced = false, angle = 0, exit = false) {
  const controller = createScrollSteps(
    count,
    () => 1000,
    reduced,
    angle,
    [...Array(count - 1).fill(2), ...(exit ? [1.6] : [])],
    exit,
  );
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
const animate = (angle, jump = false) => [
  { type: "animateTo", angle, jump: jump === true },
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
  assert.deepEqual(harness(6).send("key", 0, { key: "End" }), animate(5, true));
  assert.deepEqual(
    harness(6, false, 5).send("key", 0, { key: "Home" }),
    animate(0, true),
  );
  assert.deepEqual(harness(6, true).send("key", 0, { key: "End" }), [
    { type: "cutTo", angle: 5 },
  ]);
  assert.deepEqual(harness(6, true, 5).send("key", 0, { key: "Home" }), [
    { type: "cutTo", angle: 0 },
  ]);
  assert.deepEqual(harness(6, false, 4).wheel(100, 0), animate(5));
});

test("seconds integrate partial/reverse/multi-angle durations without a cap", () => {
  const seconds = [3.5, 4.5, 8, 7];
  assert.equal(stepDuration(0, 1, seconds), 3.5);
  assert.equal(stepDuration(1, 0, seconds), 3.5);
  assert.ok(Math.abs(stepDuration(0.99, 1, seconds) - 0.035) < 1e-12);
  assert.equal(stepDuration(0, 4, seconds), 23);
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

test("budget seconds weight scrub pixels, update live on resize, and preserve gesture decisions", () => {
  const seconds = [3.5, 4.5, 8, 7];
  for (const [start, delta, expected] of [
    [0, 87.5, 0.1],
    [1, -87.5, 0.9],
    [1, 112.5, 1.1],
    [2, -112.5, 1.9],
  ]) {
    const steps = createScrollSteps(5, () => 1000, false, start, seconds);
    steps.handle({ type: "touchStart", at: 0, time: start });
    const [command] = steps.handle({
      type: "touchMove",
      at: 200,
      time: start,
      deltaY: delta,
    });
    assert.ok(Math.abs(command.time - expected) < 1e-12);
  }
  const steps = createScrollSteps(5, () => 1000, false, 0, seconds);
  seconds[0] = 7;
  steps.handle({ type: "touchStart", at: 0, time: 0 });
  assert.equal(
    steps.handle({ type: "touchMove", at: 200, time: 0, deltaY: 175 })[0].time,
    0.1,
  );
  assert.deepEqual(
    steps.handle({ type: "wheel", at: 250, time: 0.1, deltaY: 100 }),
    [],
  );
  steps.handle({ type: "touchEnd", at: 300, time: 0.1 });
  assert.deepEqual(
    steps.handle({ type: "wheel", at: 400, time: 0.1, deltaY: 100 }),
    animate(2),
  );
});

const finale = (reduced = false, angle = 4) => harness(5, reduced, angle, true);

test("fresh forward keys and wheel gestures step Front to position 5", () => {
  for (const key of ["ArrowDown", "PageDown", " "])
    assert.deepEqual(finale().send("key", 0, { key }), animate(5));
  assert.deepEqual(finale().wheel(100, 0), animate(5));
  const flick = finale();
  assert.deepEqual(flick.wheel(20, 0), [{ type: "scrubTo", time: 4.05 }]);
  assert.deepEqual(flick.wheel(20, 30), animate(5));
});

test("slow wheel and touch scrub the exit; early release returns and late release commits", () => {
  for (const travel of [100, 300]) {
    const h = finale();
    h.send("touchStart", 0);
    assert.deepEqual(h.send("touchMove", 200, { deltaY: travel }), [
      { type: "scrubTo", time: 4 + travel / 400 },
    ]);
    assert.deepEqual(h.send("touchEnd", 300), animate(travel < 200 ? 4 : 5));
  }
  const wheel = finale();
  for (let n = 0; n < 10; n++) wheel.wheel(4, n * 30);
  assert.equal(wheel.time, 4.1);
  assert.deepEqual(wheel.send("idle", 270 + GESTURE_IDLE_MS), animate(4));
});

test("exit scrub can reverse, cancel and be interrupted before commitment", () => {
  const h = finale();
  h.send("touchStart", 0);
  h.send("touchMove", 200, { deltaY: 300 });
  h.send("touchMove", 220, { deltaY: -100 });
  assert.equal(h.time, 4.5);
  assert.deepEqual(h.send("touchEnd", 300), animate(4));
  const cancelled = finale();
  cancelled.send("touchStart", 0);
  cancelled.send("touchMove", 200, { deltaY: 300 });
  assert.deepEqual(cancelled.send("touchEnd", 300, { cancelled: true }), animate(4));
  const flight = finale();
  flight.send("key", 0, { key: "ArrowDown" });
  flight.setTime(4.7);
  flight.send("touchStart", 200);
  assert.deepEqual(flight.send("touchMove", 400, { deltaY: -200 }), [{ type: "scrubTo", time: 4.2 }]);
  assert.deepEqual(flight.send("touchEnd", 500), animate(4));
});

test("End and jumps stop at Front; Home returns from inside the exit", () => {
  assert.deepEqual(finale().send("key", 0, { key: "End" }), []);
  assert.deepEqual(finale(false, 0).send("key", 0, { key: "End" }), animate(4, true));
  for (const key of ["Home", "End"]) {
    const h = finale();
    h.send("key", 0, { key: "ArrowDown" });
    h.setTime(4.5);
    assert.deepEqual(h.send("key", 100, { key }), animate(key === "Home" ? 0 : 4, true));
  }
});

test("reverse keys and fresh wheel notches inside an exit scrub stop at Front", () => {
  for (const key of ["ArrowUp", "PageUp", " "]) {
    const h = finale();
    h.wheel(4, 0);
    h.setTime(4.3);
    assert.deepEqual(h.send("key", 20, { key, shiftKey: true }), animate(4));
  }
  const h = finale();
  h.send("touchStart", 0);
  h.send("touchMove", 200, { deltaY: 100 });
  h.send("touchEnd", 300);
  h.setTime(4.2);
  assert.deepEqual(h.wheel(-100, 400), animate(4));
});

test("reverse wheel interrupts a consumed exit notch and its tail cannot skip Front", () => {
  const h = finale();
  assert.deepEqual(h.wheel(100, 0), animate(5));
  h.setTime(4.3);
  assert.deepEqual(h.wheel(-100, 80), animate(4));
  h.setTime(4.1);
  assert.deepEqual(h.wheel(-20, 100), []);
  h.setTime(4);
  h.send("landed", 150, { angle: 4 });
  assert.deepEqual(h.wheel(-20, 200), []);
  assert.deepEqual(h.wheel(-100, 400), animate(3), "a later fresh gesture can leave Front normally");
});

test("a reverse wheel arriving just after an exit scrub lands cannot skip Front", () => {
  const h = finale();
  h.send("touchStart", 0);
  h.send("touchMove", 200, { deltaY: 100 });
  h.send("touchEnd", 300);
  h.setTime(4);
  h.send("landed", 500, { angle: 4 });
  assert.deepEqual(h.wheel(-100, 520), []);
  assert.deepEqual(h.wheel(-20, 560), []);
  assert.deepEqual(h.wheel(-100, 760), animate(3));
});

test("forward repeat stops at Front; backward input still steps", () => {
  for (const key of ["ArrowDown", "PageDown", " "])
    assert.deepEqual(finale().send("key", 0, { key, repeat: true }), []);
  const h = finale(false, 3);
  assert.deepEqual(h.send("key", 0, { key: "ArrowDown", repeat: true }), animate(4));
  h.setTime(4);
  h.send("landed", 100, { angle: 4 });
  assert.deepEqual(h.send("key", 200, { key: "ArrowDown", repeat: true }), []);
  assert.deepEqual(finale().send("key", 0, { key: "ArrowUp" }), animate(3));
  assert.deepEqual(finale().wheel(-100, 0), animate(3));
});

test("in-flight and queued Front cannot queue the exit", () => {
  const h = finale(false, 2);
  h.send("key", 0, { key: "ArrowDown" });
  h.setTime(2.5);
  h.send("key", 100, { key: "ArrowDown" });
  assert.deepEqual(h.send("key", 200, { key: "ArrowDown" }), animate(4));
  h.setTime(4);
  assert.deepEqual(h.send("key", 300, { key: "ArrowDown" }), animate(4));
  h.send("landed", 400, { angle: 4 });
  assert.deepEqual(h.send("key", 500, { key: "ArrowDown" }), animate(5));
});

test("momentum spanning landing stays at Front until a fresh idle gesture", () => {
  const h = finale(false, 3);
  assert.deepEqual(h.wheel(100, 0), animate(4));
  h.setTime(4);
  h.send("landed", 100, { angle: 4 });
  for (let at = 120; at < 1200; at += 16) assert.deepEqual(h.wheel(50, at), []);
  assert.deepEqual(h.wheel(100, 1200 + GESTURE_IDLE_MS), animate(5));
});

test("landing guards new wheel and touch input for the full idle window", () => {
  for (const kind of ["wheel", "touch"]) {
    const h = finale(false, 3);
    h.send("key", 0, { key: "End" });
    h.setTime(4);
    h.send("landed", 1000, { angle: 4 });
    if (kind === "wheel") {
      assert.deepEqual(h.wheel(100, 1179), []);
      assert.deepEqual(h.wheel(100, 1300), []);
      assert.deepEqual(h.wheel(100, 1480), animate(5));
    } else {
      h.send("touchStart", 1179);
      assert.deepEqual(h.send("touchMove", 1300, { deltaY: 300 }), []);
      assert.ok(h.send("touchEnd", 1400).every((c) => c.angle !== 5));
    }
  }
});

test("reduced exit cuts to 5 and uses the same repeat and inertia guard", () => {
  assert.deepEqual(finale(true).send("key", 0, { key: "ArrowDown" }), [{ type: "cutTo", angle: 5 }]);
  assert.deepEqual(finale(true).wheel(100, 0), [{ type: "cutTo", angle: 5 }]);
  assert.deepEqual(finale(true).send("key", 0, { key: "ArrowDown", repeat: true }), []);
  const h = finale(true, 3);
  h.send("key", 1000, { key: "ArrowDown" });
  assert.deepEqual(h.wheel(100, 1050), []);
  assert.deepEqual(h.wheel(100, 1230), [{ type: "cutTo", angle: 5 }]);
});

test("landing on 5, rather than a partial scrub, swallows all later input", () => {
  const h = finale();
  h.send("key", 0, { key: "ArrowDown" });
  h.setTime(5);
  h.send("landed", 2000, { angle: 5 });
  for (const event of [
    { type: "wheel", deltaY: 100 }, { type: "wheel", deltaY: -100 },
    { type: "idle" }, { type: "touchStart" }, { type: "touchMove", deltaY: 100 },
    { type: "touchEnd" }, { type: "key", key: "Home" },
    { type: "key", key: "End" }, { type: "key", key: "ArrowDown" },
    { type: "landed", angle: 0 },
  ]) assert.deepEqual(h.send(event.type, 3000, event), []);
  assert.deepEqual(h.controller.setReduced(true, 5), []);
});

test("blocked or modified Front input cannot enter the exit", () => {
  const h = finale();
  for (const fields of [{ ctrlKey: true }, { deltaX: 101 }, { blocked: true }])
    assert.deepEqual(h.wheel(100, 0, fields), []);
  for (const fields of [
    { key: "ArrowDown", editable: true },
    { key: "ArrowDown", blocked: true },
    { key: " ", interactive: true },
  ]) assert.deepEqual(h.send("key", 0, fields), []);
  assert.deepEqual(h.send("key", 0, { key: "ArrowDown" }), animate(5));
});


test("quick forward touch flick plays the exit but cannot bypass landing idle", () => {
  const h = finale();
  h.send("touchStart", 0);
  assert.deepEqual(h.send("touchMove", 40, { deltaY: 50 }), [{ type: "scrubTo", time: 4.125 }]);
  assert.deepEqual(h.send("touchEnd", 80), animate(5));
  const guarded = finale();
  guarded.send("landed", 1000, { angle: 4 });
  guarded.send("touchStart", 1010);
  assert.deepEqual(guarded.send("touchMove", 1050, { deltaY: 50 }), []);
  assert.ok(guarded.send("touchEnd", 1090).every((command) => command.angle !== 5));
});
