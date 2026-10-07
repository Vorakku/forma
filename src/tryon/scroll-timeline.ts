import { gsap } from "gsap";
import type { ScenePose } from "./scroll-poses";
import {
  buildMotionBudget,
  interpolateOrbit,
  pathProgress,
  type MotionBudget,
} from "./scroll-budget";

// Linear scene time: phase seconds determine shares, and camera progress alone
// is mapped through its projected length. Animation ramps live in the driver.
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
        timeline.fromTo(
          driver,
          { progress: 0 },
          {
            progress: 1,
            duration,
            ease: "none",
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
