import * as THREE from "three";
import type { gsap } from "gsap";
import { projectionCamera } from "./screen-motion";
import type { OrbitPose, ScenePose } from "./scroll-poses";
import type { MotionBudget } from "./scroll-budget";
import { EXIT_SCALE, EXIT_S } from "./scroll-steps";

export function exitFrontPlane(model: THREE.Object3D) {
  model.updateWorldMatrix(true, false);
  return new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    .applyMatrix4(model.matrixWorld);
}

export function resolveExitDolly(
  front: OrbitPose,
  width: number,
  height: number,
  plane: THREE.Plane,
) {
  const camera = projectionCamera(front, width, height);
  const origin = { x: width / 2, y: height / 2 - Math.min(width, height) * 0.01 };
  const rayPoint = new THREE.Vector3(0, 2 * Math.min(width, height) * 0.01 / height, 0.5)
    .unproject(camera);
  const ray = new THREE.Ray(camera.position.clone(), rayPoint.sub(camera.position).normalize());
  const point = ray.intersectPlane(plane, new THREE.Vector3());
  if (!point) throw new Error("The exit ray misses the frame front plane.");
  const d0 = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
  return { point, origin, d0, position: camera.position.clone(), orientation: camera.quaternion.clone() };
}
export type ExitDolly = ReturnType<typeof resolveExitDolly>;

export function applyExitDolly(camera: THREE.PerspectiveCamera, dolly: ExitDolly, u: number) {
  const scale = EXIT_SCALE ** THREE.MathUtils.clamp(u, 0, 1);
  const depth = dolly.d0 / scale;
  camera.position.copy(dolly.position).sub(dolly.point).divideScalar(scale).add(dolly.point);
  camera.quaternion.copy(dolly.orientation);
  camera.near = u === 0 ? 0.1 : Math.min(0.1, depth / 4);
  camera.far = u === 0 ? 1000 : camera.near * 1e4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { scale, depth };
}

// Append only in the page: the five-angle projection budgets and their tests
// retain exactly their existing steps and phases.
export function withExitBudget(budget: MotionBudget): MotionBudget {
  return {
    steps: [...budget.steps, { seconds: EXIT_S, phases: [] }],
    seconds: [...budget.seconds, EXIT_S],
  };
}
export function appendExitTimeline(timeline: gsap.core.Timeline, pose: ScenePose, frontTime: number) {
  timeline.fromTo(pose, { exit: 0 }, {
    exit: 1, duration: 1, ease: "none", immediateRender: false,
  }, frontTime);
}
