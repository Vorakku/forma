import * as THREE from "three";
import { createStudio } from "./studio";
import { clampPhi, type OrbitPose } from "./scroll-poses";

export function createScrollViewer({
  canvas,
  onError,
  onResize,
}: {
  canvas: HTMLCanvasElement;
  onError: () => void;
  onResize?: () => void;
}) {
  let observer: ResizeObserver | undefined;
  let pose: OrbitPose | undefined;
  let stopped = false;
  const studio = createStudio(canvas, () => {
    dispose();
    onError();
  });
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  function render() {
    if (stopped || document.hidden || !pose) return;
    target.set(pose.targetX, pose.targetY, pose.targetZ);
    spherical.set(pose.distance, clampPhi(pose.phi), pose.theta);
    studio.camera.position.copy(target).add(offset.setFromSpherical(spherical));
    studio.camera.up.set(0, 1, 0);
    studio.camera.lookAt(target);
    studio.render();
  }

  function resize() {
    if (stopped) return;
    studio.resize();
    onResize?.();
    render();
  }

  function visibility() {
    if (!document.hidden) render();
  }

  function dispose() {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    studio.dispose();
  }

  try {
    studio.resize();
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", visibility);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    get radius() {
      return studio.radius;
    },
    get aspect() {
      return studio.camera.aspect;
    },
    setObject: studio.setObject,
    getAnchor: studio.getAnchor,
    setPose(next: OrbitPose) {
      pose = { ...next, phi: clampPhi(next.phi) };
      render();
    },
    dispose,
  };
}
