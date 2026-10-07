import { gsap } from "gsap";
import { clampPhi, type ScenePose } from "./scroll-poses";
import { EXPLODE_SHARE } from "./scroll-steps";

// Each scene state still lands at integer time. The camera and assembly animate
// in separate linear phases, so a reversed scrub naturally reverses their order.
export function populateScrollTimeline(
  timeline: gsap.core.Timeline,
  pose: ScenePose,
  poses: ScenePose[],
) {
  timeline.clear().time(0, true);
  Object.assign(pose, poses[0]);
  poses.forEach((next, index) => {
    if (index === 0) return;
    const previous = poses[index - 1];
    const { explode, ...orbit } = next;
    const split = previous.explode !== explode;
    if (split && previous.explode) {
      timeline.to(pose, { explode: 0, duration: EXPLODE_SHARE, ease: "none" });
    }
    timeline.to(pose, {
      ...orbit,
      phi: clampPhi(next.phi),
      duration: split ? 1 - EXPLODE_SHARE : 1,
      ease: "none",
    });
    if (split && explode) {
      timeline.to(pose, { explode, duration: EXPLODE_SHARE, ease: "none" });
    }
  });
  return timeline;
}
