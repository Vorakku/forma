import type * as THREE from "three";
import {
  clampPhi,
  SCROLL_ANGLES,
  type OrbitPose,
  type ScenePose,
} from "./scroll-poses";
import {
  CAMERA_SPEED,
  PATH_SAMPLES,
  RAMP_S,
  EXPLODE_S,
  BLUEPRINT_S,
} from "./scroll-steps";
import { projectionCamera, visibleScreenSpeed } from "./screen-motion";

export type CameraMove = {
  from: OrbitPose;
  to: OrbitPose;
  cumulative: number[];
  length: number;
};
export type MotionPhase = {
  kind: "camera" | "explode" | "blueprint";
  seconds: number;
  start: number;
  end: number;
  from: number;
  to: number;
  move?: CameraMove;
};
export type MotionStep = { seconds: number; phases: MotionPhase[] };
export type MotionBudget = { steps: MotionStep[]; seconds: number[] };

export function interpolateOrbit(
  from: OrbitPose,
  to: OrbitPose,
  progress: number,
): OrbitPose {
  const mix = (a: number, b: number) => a + (b - a) * progress;
  return {
    targetX: mix(from.targetX, to.targetX),
    targetY: mix(from.targetY, to.targetY),
    targetZ: mix(from.targetZ, to.targetZ),
    theta: mix(from.theta, to.theta),
    phi: clampPhi(mix(from.phi, to.phi)),
    distance: Math.exp(mix(Math.log(from.distance), Math.log(to.distance))),
  };
}

export function pathProgress(move: CameraMove, progress: number) {
  if (progress <= 0 || progress >= 1 || !move.length)
    return Math.max(0, Math.min(1, progress));
  const wanted = move.length * progress;
  let low = 0,
    high = move.cumulative.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (move.cumulative[middle] < wanted) low = middle;
    else high = middle;
  }
  const span = move.cumulative[high] - move.cumulative[low];
  return (
    (low + (span ? (wanted - move.cumulative[low]) / span : 0)) /
    (move.cumulative.length - 1)
  );
}

export function buildMotionBudget(
  poses: ScenePose[],
  points: readonly THREE.Vector3[],
  width: number,
  height: number,
  paces: readonly number[] = SCROLL_ANGLES.map((angle) => angle.pace),
): MotionBudget {
  const steps = poses.slice(1).map((to, index) => {
    const from = poses[index];
    const move: CameraMove = { from, to, cumulative: [0], length: 0 };
    let previous = projectionCamera(from, width, height);
    for (let sample = 1; sample < PATH_SAMPLES; sample++) {
      const current = projectionCamera(
        interpolateOrbit(from, to, sample / (PATH_SAMPLES - 1)),
        width,
        height,
      );
      move.length += visibleScreenSpeed(
        points,
        previous,
        current,
        width,
        height,
        1,
      );
      move.cumulative.push(move.length);
      previous = current;
    }
    const phases: MotionPhase[] = [];
    const add = (
      kind: MotionPhase["kind"],
      seconds: number,
      a: number,
      b: number,
      camera?: CameraMove,
    ) =>
      phases.push({
        kind,
        seconds,
        from: a,
        to: b,
        start: 0,
        end: 0,
        move: camera,
      });
    if (from.blueprint !== to.blueprint && from.blueprint)
      add("blueprint", BLUEPRINT_S, from.blueprint, 0);
    if (from.explode !== to.explode && from.explode)
      add("explode", EXPLODE_S, from.explode, 0);
    const speed = CAMERA_SPEED * (paces[index + 1] ?? 1);
    add("camera", RAMP_S + move.length / speed, 0, 1, move);
    if (from.explode !== to.explode && to.explode)
      add("explode", EXPLODE_S, 0, to.explode);
    if (from.blueprint !== to.blueprint && to.blueprint)
      add("blueprint", BLUEPRINT_S, 0, to.blueprint);
    const seconds = phases.reduce((sum, p) => sum + p.seconds, 0);
    let start = index;
    phases.forEach((phase, phaseIndex) => {
      phase.start = start;
      phase.end =
        phaseIndex === phases.length - 1
          ? index + 1
          : start + phase.seconds / seconds;
      start = phase.end;
    });
    return { phases, seconds };
  });
  return { steps, seconds: steps.map((step) => step.seconds) };
}
