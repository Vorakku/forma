import { gsap } from "gsap";
import {
  HOLD_DURATION,
  MOVE_DURATION,
  clampPhi,
  type OrbitPose,
} from "./scroll-poses";

// A single timeline; holds animate a separate clock so all six pose values stay still.
export function populateScrollTimeline(
  timeline: gsap.core.Timeline,
  pose: OrbitPose,
  poses: OrbitPose[],
) {
  timeline.clear();
  Object.assign(pose, poses[0]);
  const clock = { hold: 0 };
  poses.forEach((next, index) => {
    if (index > 0) {
      timeline.to(pose, {
        ...next,
        phi: clampPhi(next.phi),
        duration: MOVE_DURATION,
        ease: "power2.inOut",
      });
    }
    timeline.to(clock, {
      hold: index + 1,
      duration: HOLD_DURATION,
      ease: "none",
    });
  });
  return timeline;
}
