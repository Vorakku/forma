import { gsap } from "gsap";
import { clampPhi, type OrbitPose } from "./scroll-poses";

// Angle k is exactly at time k; the gesture driver supplies step easing.
export function populateScrollTimeline(
  timeline: gsap.core.Timeline,
  pose: OrbitPose,
  poses: OrbitPose[],
) {
  timeline.clear();
  Object.assign(pose, poses[0]);
  poses.forEach((next, index) => {
    if (index > 0) {
      timeline.to(pose, {
        ...next,
        phi: clampPhi(next.phi),
        duration: 1,
        ease: "none",
      });
    }
  });
  return timeline;
}
