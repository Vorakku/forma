import * as THREE from "three";
import { createStudio } from "./studio";
import { createExploder } from "./explode";
import { EXPLODE_MM } from "./scroll-steps";
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
  let exploder: ReturnType<typeof createExploder> | undefined;
  let explodedRadius = 10;
  const anchors = new Map<string, THREE.Vector3>();
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
    exploder?.set(0);
    exploder = undefined;
    anchors.clear();
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
    get explodedRadius() {
      return explodedRadius;
    },
    setObject(object: THREE.Group) {
      exploder?.set(0);
      const installed = studio.setObject(object);
      if (installed === false || installed === null) return installed;
      exploder = createExploder(object, EXPLODE_MM);
      anchors.clear();
      object.updateWorldMatrix(true, true);
      object.traverse((node) => {
        if (node.name)
          anchors.set(node.name, node.getWorldPosition(new THREE.Vector3()));
      });
      try {
        exploder.set(1);
        explodedRadius = new THREE.Box3()
          .setFromObject(object)
          .getBoundingSphere(new THREE.Sphere()).radius;
      } finally {
        exploder.set(0);
      }
      return installed;
    },
    getAnchor(name: string) {
      return anchors.get(name)?.clone();
    },
    setPose(next: OrbitPose & { explode?: number }) {
      if (stopped) return;
      exploder?.set(next.explode ?? 0);
      pose = { ...next, phi: clampPhi(next.phi) };
      render();
    },
    dispose,
  };
}
