import { gsap } from "gsap";
import type { ScenePose } from "./scroll-poses";
import {
  buildMotionBudget,
  interpolateOrbit,
  pathProgress,
  type MotionBudget,
} from "./scroll-budget";
import { RAMP_S } from "./scroll-steps";

// Integrated asymmetric trapezoid, normalised to cover the full camera path.
export function rampEase(a: number, b: number) {
  const v = 1 / (1 - a / 2 - b / 2);
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (p < a) return (v * p * p) / (2 * a);
    if (p > 1 - b) return 1 - (v * (1 - p) * (1 - p)) / (2 * b);
    return v * (p - a / 2);
  };
}

// Scene time is linear in budget seconds. Interior camera edges have their own
// ramps; integer edges are ramped by the driver for the whole move.
export function populateScrollTimeline(
  timeline: gsap.core.Timeline,
  pose: ScenePose,
  poses: ScenePose[],
  budget: MotionBudget = buildMotionBudget(poses, [], 1, 1),
) {
  timeline.clear().time(0, true);
  Object.assign(pose, poses[0]);
  for (const step of budget.steps)
    for (const phase of step.phases) {
      const duration = phase.end - phase.start;
      if (phase.kind === "camera") {
        const driver = { progress: 0 },
          move = phase.move!;
        let a = Number.isInteger(phase.start) ? 0 : RAMP_S / phase.seconds;
        let b = Number.isInteger(phase.end) ? 0 : RAMP_S / phase.seconds;
        const scale = Math.max(1, a + b);
        a /= scale;
        b /= scale;
        timeline.fromTo(
          driver,
          { progress: 0 },
          {
            progress: 1,
            duration,
            ease: rampEase(a, b),
            immediateRender: false,
            onUpdate: () =>
              Object.assign(
                pose,
                interpolateOrbit(
                  move.from,
                  move.to,
                  pathProgress(move, driver.progress),
                ),
              ),
          },
          phase.start,
        );
      } else
        timeline.fromTo(
          pose,
          { [phase.kind]: phase.from },
          {
            [phase.kind]: phase.to,
            duration,
            ease: "none",
            immediateRender: false,
          },
          phase.start,
        );
    }
  return timeline;
}
