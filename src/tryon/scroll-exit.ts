import * as THREE from "three";
import type { gsap } from "gsap";
import { projectionCamera } from "./screen-motion";
import type { OrbitPose, ScenePose } from "./scroll-poses";
import type { MotionBudget } from "./scroll-budget";
import { EXIT_S } from "./scroll-steps";

// Exit-only choreography. The five authored cameras never use this wider POV.
export const EXIT_ORBIT_END = 0.35;
export const EXIT_PUSH_END = 0.8;
const smooth = (t: number) => THREE.MathUtils.smoothstep(t, 0, 1);

export function exitSurface(u: number) {
  return {
    copyOpacity: 1,
    copyScale: 40 ** THREE.MathUtils.clamp(u, 0, 1),
    chromeOpacity: Math.max(0, 1 - u / 0.25),
    paperOpacity: THREE.MathUtils.clamp((u - 0.85) / 0.15, 0, 1),
  };
}

export function resolveExitPath(
  front: OrbitPose,
  width: number,
  height: number,
  model: THREE.Object3D,
) {
  model.updateWorldMatrix(true, true);
  const lens = model.getObjectByName("lens_R") as THREE.Mesh | undefined;
  if (!lens?.isMesh) throw new Error("The wearer exit needs the Ellis right lens.");
  lens.geometry.computeBoundingBox();
  const lensBox = lens.geometry.boundingBox!;
  const centre = lensBox.getCenter(new THREE.Vector3());
  // Measure both physical glass faces at the optical opening's XY centre.
  // This incorporates the authored wrap, tilt and sag, rather than assuming z=0.
  const toWorld = (p: THREE.Vector3) => lens.localToWorld(p);
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  const right = new THREE.Vector3(1, 0, 0).transformDirection(model.matrixWorld);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(model.matrixWorld);
  const ray = new THREE.Raycaster();
  const face = (side: number) => {
    const origin = toWorld(new THREE.Vector3(centre.x, centre.y,
      side > 0 ? lensBox.max.z + 0.01 : lensBox.min.z - 0.01));
    ray.set(origin, forward.clone().multiplyScalar(-side));
    const hit = ray.intersectObject(lens, false)[0];
    if (!hit) throw new Error("The exit target misses the physical right lens.");
    return hit.point;
  };
  const point = face(1).add(face(-1)).multiplyScalar(0.5);
  const camera = projectionCamera(front, width, height);
  // Orbit about the frame's symmetry plane. Using the right lens as the
  // orbit pivot puts the bridge off-centre and gives unequal temple perspective.
  const localPoint = model.worldToLocal(point.clone());
  const frameCentre = model.localToWorld(new THREE.Vector3(0, localPoint.y, localPoint.z));
  const offset = camera.position.clone().sub(frameCentre);
  const startRadius = Math.hypot(offset.dot(right), offset.dot(forward));
  const startAngle = Math.atan2(offset.dot(right), offset.dot(forward));
  const startHeight = offset.dot(up);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  // A wide, level wearer view briefly reads the inside of both rims. Portrait
  // gets the same horizontal field, instead of an extreme lens close-up.
  const wearerFov = THREE.MathUtils.radToDeg(2 * Math.atan(
    Math.tan(THREE.MathUtils.degToRad(40)) / Math.min(1, width / height)));
  const eyeDepth = size.x * 0.72;
  const frontAperture = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const wearerAperture = Math.tan(THREE.MathUtils.degToRad(wearerFov / 2));
  const spanRatio = eyeDepth * wearerAperture / (startRadius * frontAperture);
  const pushSpeed = -eyeDepth * Math.log(spanRatio) / EXIT_ORBIT_END;
  const clearance = size.x * 0.04;
  return {
    point, frameCentre, forward, right, up, bounds, startRadius, startAngle, startHeight,
    frontAperture, wearerAperture, spanRatio, pushSpeed,
    eyeDepth, clearance, wearerFov,
    position: camera.position.clone(), orientation: camera.quaternion.clone(),
    frontTarget: new THREE.Vector3(front.targetX, front.targetY, front.targetZ),
    fov: camera.fov,
  };
}
export type ExitPath = ReturnType<typeof resolveExitPath>;

export function applyExitPath(camera: THREE.PerspectiveCamera, path: ExitPath, progress: number) {
  const u = THREE.MathUtils.clamp(progress, 0, 1);
  camera.up.copy(path.up);
  if (u === 0) {
    camera.position.copy(path.position);
    camera.quaternion.copy(path.orientation);
    camera.fov = path.fov;
    camera.near = 0.1;
    camera.far = 1000;
  } else {
    const orbitTime = Math.min(1, u / EXIT_ORBIT_END);
    const orbit = smooth(orbitTime);
    const aperture = path.frontAperture * (path.wearerAperture / path.frontAperture) ** orbit;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(aperture));
    if (u < EXIT_ORBIT_END) {
      // Complete most of the turn before entering the curled temple tips.
      // The camera continues approaching throughout this eased yaw.
      const turn = Math.sin(orbitTime * Math.PI / 2);
      const angle = THREE.MathUtils.lerp(path.startAngle, Math.PI, turn);
      // Shrink the visible span at a constant perceived rate FROM THE START,
      // while turning. FOV widens smoothly; it never cancels the approach or
      // makes the frame shrink before a late rush toward the wearer pose.
      const span = path.startRadius * path.frontAperture * path.spanRatio ** orbitTime;
      const radius = span / aperture;
      camera.position.copy(path.frameCentre)
        .addScaledVector(path.right, Math.sin(angle) * radius)
        .addScaledVector(path.forward, Math.cos(angle) * radius)
        .addScaledVector(path.up, path.startHeight * (1 - turn));
      // Re-centre the front plane early, then hold that screen anchor for the
      // entire turn. Blending for the whole orbit makes the frame drift sideways.
      camera.lookAt(path.frontTarget.clone().lerp(path.frameCentre, smooth(u / 0.04)));
    } else {
      const t = THREE.MathUtils.clamp((u - EXIT_ORBIT_END) / (EXIT_PUSH_END - EXIT_ORBIT_END), 0, 1);
      // Match the orbit's forward speed at the handoff, then accelerate gently
      // through the clear centre opening. Keep the symmetry plane throughout:
      // translating toward one lens makes the entire frame slide sideways.
      const p0 = -path.eyeDepth;
      const p1 = p0 + path.pushSpeed * (EXIT_PUSH_END - EXIT_ORBIT_END) / 3;
      const p2 = path.clearance;
      const advance = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
        + 3 * (1 - t) * t * t * p2 + t ** 3 * path.clearance;
      const tail = path.clearance * 3 * smooth((u - EXIT_PUSH_END) / (1 - EXIT_PUSH_END));
      camera.position.copy(path.frameCentre)
        .addScaledVector(path.forward, advance + tail);
      camera.lookAt(camera.position.clone().add(path.forward));
    }
    // 0.1 mm near at the crossing; far encloses the actual frame, keeping a
    // compact depth range without ever deriving near from zero lens distance.
    camera.near = THREE.MathUtils.lerp(0.1, 0.01, orbit);
    camera.far = camera.position.distanceTo(path.bounds.getCenter(new THREE.Vector3()))
      + path.bounds.getBoundingSphere(new THREE.Sphere()).radius + 2;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
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
