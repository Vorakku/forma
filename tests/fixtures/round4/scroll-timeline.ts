import { gsap } from "gsap";
import { clampPhi, type ScenePose } from "./scroll-poses";
import { EXPLODE_SHARE, BLUEPRINT_SHARE } from "./scroll-steps";

// Special states off, camera move, special states on. Reverse seeking mirrors
// these phases; every scene still lands at its integer time.
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
    const { explode, blueprint, ...orbit } = next;
    const explodeChanges = previous.explode !== explode;
    const blueprintChanges = previous.blueprint !== blueprint;
    const add = (values: object, duration: number) =>
      timeline.to(pose, { ...values, duration, ease: "none" });
    if (blueprintChanges && previous.blueprint)
      add({ blueprint: 0 }, BLUEPRINT_SHARE);
    if (explodeChanges && previous.explode) add({ explode: 0 }, EXPLODE_SHARE);
    add(
      { ...orbit, phi: clampPhi(next.phi) },
      1 -
        (explodeChanges ? EXPLODE_SHARE : 0) -
        (blueprintChanges ? BLUEPRINT_SHARE : 0),
    );
    if (explodeChanges && explode) add({ explode }, EXPLODE_SHARE);
    if (blueprintChanges && blueprint) add({ blueprint }, BLUEPRINT_SHARE);
  });
  return timeline;
}
