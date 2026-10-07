import * as THREE from "three";
import { SURFACE_POINTS, VISIBLE_MARGIN } from "./scroll-steps";
import { clampPhi, type OrbitPose } from "./scroll-poses";
import { VIEWER_FOV } from "./studio";

export function median(values: number[]) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

// Stratify the total world-space triangle area. Irrational barycentric sequences
// are repeatable, independent of triangle tessellation density, and use no RNG.
export function sampleFrameSurface(
  object: THREE.Object3D,
  count = SURFACE_POINTS,
) {
  object.updateWorldMatrix(true, true);
  const triangles: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    c: THREE.Vector3;
    end: number;
  }[] = [];
  let area = 0;
  const strata: { start: number; end: number; samples: number }[] = [];
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const position = node.geometry.getAttribute("position"),
      index = node.geometry.index;
    if (!position) return;
    const total = index?.count ?? position.count;
    const start = area;
    for (let i = 0; i + 2 < total; i += 3) {
      const vertex = (offset: number) =>
        new THREE.Vector3()
          .fromBufferAttribute(position, index ? index.getX(offset) : offset)
          .applyMatrix4(node.matrixWorld);
      const a = vertex(i),
        b = vertex(i + 1),
        c = vertex(i + 2);
      const size = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      if (size <= 0) continue;
      area += size;
      triangles.push({ a, b, c, end: area });
    }
    if (area > start) strata.push({ start, end: area, samples: 0 });
  });
  const points: THREE.Vector3[] = [];
  if (!area) return points;
  // Reserve one sample per part so small hinge pins are represented too;
  // distribute the rest by area using largest-remainder apportionment.
  for (const stratum of strata)
    stratum.samples = Math.max(
      count >= strata.length ? 1 : 0,
      Math.floor((count * (stratum.end - stratum.start)) / area),
    );
  let assigned = strata.reduce((sum, s) => sum + s.samples, 0);
  while (assigned !== count) {
    const increase = assigned < count;
    const candidates = strata.filter(
      (s) => increase || s.samples > (count >= strata.length ? 1 : 0),
    );
    candidates.sort((a, b) => {
      const deficit = (s: typeof a) =>
        (count * (s.end - s.start)) / area - s.samples;
      return increase ? deficit(b) - deficit(a) : deficit(a) - deficit(b);
    });
    candidates[0].samples += increase ? 1 : -1;
    assigned += increase ? 1 : -1;
  }
  let triangle = 0,
    i = 0;
  for (const stratum of strata)
    for (let j = 0; j < stratum.samples; j++, i++) {
      const distance =
        stratum.start +
        ((stratum.end - stratum.start) * (j + 0.5)) / stratum.samples;
      while (triangles[triangle].end < distance) triangle++;
      const { a, b, c } = triangles[triangle];
      const u = Math.sqrt(((i + 1) * 0.7548776662466927) % 1);
      const v = ((i + 1) * 0.5698402909980532) % 1;
      points.push(
        a
          .clone()
          .multiplyScalar(1 - u)
          .addScaledVector(b, u * (1 - v))
          .addScaledVector(c, u * v),
      );
    }
  return points;
}

export function projectionCamera(
  pose: OrbitPose,
  width: number,
  height: number,
) {
  const camera = new THREE.PerspectiveCamera(
    VIEWER_FOV,
    width / height,
    0.1,
    1000,
  );
  const target = new THREE.Vector3(pose.targetX, pose.targetY, pose.targetZ);
  camera.position
    .copy(target)
    .add(
      new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(pose.distance, clampPhi(pose.phi), pose.theta),
      ),
    );
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.userData.motionTarget = target;
  camera.updateMatrixWorld(true);
  return camera;
}

export function visibleScreenSpeed(
  points: readonly THREE.Vector3[],
  from: THREE.Camera,
  to: THREE.Camera,
  width: number,
  height: number,
  seconds: number,
) {
  const shorter = Math.min(width, height);
  // Keep an inset margin: points beyond the stage or in its outer 10% don't count.
  const limit = 1 - 2 * VISIBLE_MARGIN;
  const speeds: number[] = [];
  const measure = (point: THREE.Vector3) => {
    const a = point.clone().project(from),
      b = point.clone().project(to);
    const inFront =
      point.clone().applyMatrix4(from.matrixWorldInverse).z < 0 &&
      point.clone().applyMatrix4(to.matrixWorldInverse).z < 0;
    if (
      !inFront ||
      Math.abs(a.x) > limit ||
      Math.abs(a.y) > limit ||
      Math.abs(b.x) > limit ||
      Math.abs(b.y) > limit
    )
      return;
    speeds.push(
      Math.hypot(((b.x - a.x) * width) / 2, ((b.y - a.y) * height) / 2) /
        shorter /
        seconds,
    );
  };
  points.forEach(measure);
  if (!speeds.length) {
    const centre: THREE.Vector3 =
      from.userData.motionTarget ??
      from.getWorldDirection(new THREE.Vector3()).add(from.position);
    for (const axis of [
      new THREE.Vector3(0.01, 0, 0),
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(0, 0, 0.01),
    ]) {
      const point = centre.clone().add(axis),
        a = point.clone().project(from),
        b = point.clone().project(to);
      if (Number.isFinite(a.x + a.y + b.x + b.y))
        speeds.push(
          Math.hypot(((b.x - a.x) * width) / 2, ((b.y - a.y) * height) / 2) /
            shorter /
            seconds,
        );
    }
  }
  return median(speeds);
}
