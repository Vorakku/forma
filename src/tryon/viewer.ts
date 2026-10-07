import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createStudio, fitDistance } from "./studio";
export {
  fitDistance,
  VIEWER_FOV,
  VIEWER_FIT_MARGIN,
  VIEWER_MAX_PIXEL_RATIO,
} from "./studio";

export const VIEWER_DAMPING = 0.08;
export const VIEWER_ROTATION_STEP = Math.PI / 12;
export const VIEWER_ZOOM_STEP = 0.8;
export const DIRECTIONS = {
  perspective: new THREE.Vector3(0.115, 0.066, 0.299),
  front: new THREE.Vector3(0, 0.03, 1),
  side: new THREE.Vector3(1, 0.12, 0),
  top: new THREE.Vector3(0, 1, 0.02),
};
export type ObjectView = keyof typeof DIRECTIONS;
export type ObjectViewer = {
  setObject: (object: THREE.Group) => void;
  setView: (view: ObjectView) => void;
  focus: (name: string) => void;
  rotate: (horizontal: number, vertical: number) => void;
  zoom: (closer: boolean) => void;
  reset: () => void;
  dispose: () => void;
};

export function createObjectViewer({
  canvas,
  onError,
}: {
  canvas: HTMLCanvasElement;
  onError?: (message: string) => void;
}): ObjectViewer {
  let studio: ReturnType<typeof createStudio> | undefined;
  let controls: OrbitControls | undefined;
  let observer: ResizeObserver | undefined;
  let camera: THREE.PerspectiveCamera;
  let radius = 10,
    distance = 40;
  let frame: number | undefined;
  let stopped = false;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function dispose() {
    if (stopped) return;
    stopped = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    observer?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    motion.removeEventListener("change", motionChanged);
    controls?.removeEventListener("change", invalidate);
    controls?.dispose();
    studio?.dispose();
  }

  function fail() {
    dispose();
    onError?.(
      "The 3D view is unavailable. You can still explore the photos or try loading it again.",
    );
  }

  function render() {
    frame = undefined;
    if (stopped || document.hidden) return;
    try {
      controls!.update();
      studio!.render();
    } catch {
      fail();
    }
  }

  function invalidate() {
    if (!stopped && !document.hidden && frame === undefined)
      frame = requestAnimationFrame(render);
  }

  function visibility() {
    if (document.hidden) {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    } else invalidate();
  }

  function motionChanged() {
    if (controls) controls.enableDamping = !motion.matches;
    invalidate();
  }

  function place(
    target: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
  ) {
    if (stopped) return;
    const damping = controls!.enableDamping;
    controls!.enableDamping = false;
    controls!.update();
    controls!.target.copy(target);
    camera.position
      .copy(target)
      .addScaledVector(direction.clone().normalize(), length);
    camera.lookAt(target);
    controls!.update();
    controls!.enableDamping = damping;
    invalidate();
  }

  function resize() {
    if (stopped || !studio) return;
    const previous = distance;
    studio.resize();
    distance = fitDistance(radius, camera.aspect);
    if (controls) {
      controls.maxDistance = distance * 2.5;
      const offset = camera.position.clone().sub(controls.target);
      place(
        controls.target.clone(),
        offset,
        THREE.MathUtils.clamp(
          (offset.length() * distance) / previous,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
    }
    invalidate();
  }

  try {
    studio = createStudio(canvas, fail);
    camera = studio.camera;
    controls = new OrbitControls(camera, canvas);
    controls.cursorStyle = "grab";
    controls.enablePan = false;
    controls.enableDamping = !motion.matches;
    controls.dampingFactor = VIEWER_DAMPING;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.addEventListener("change", invalidate);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", motionChanged);
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return {
      setObject(object) {
        const first = studio!.setObject(object);
        if (stopped || first === null) return;
        radius = studio!.radius;
        distance = fitDistance(radius, camera.aspect);
        controls!.minDistance = radius * 0.18;
        controls!.maxDistance = distance * 2.5;
        if (first) place(new THREE.Vector3(), DIRECTIONS.perspective, distance);
        else invalidate();
      },
      setView(view) {
        place(new THREE.Vector3(), DIRECTIONS[view], distance);
      },
      focus(name) {
        if (stopped) return;
        const target = studio!.getAnchor(name);
        if (target)
          place(target, new THREE.Vector3(1, 0.55, 1.2), radius * 0.48);
      },
      rotate(horizontal, vertical) {
        if (stopped) return;
        const offset = camera.position.clone().sub(controls!.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += horizontal;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi + vertical,
          0.02,
          Math.PI - 0.02,
        );
        place(
          controls!.target.clone(),
          new THREE.Vector3().setFromSpherical(spherical),
          offset.length(),
        );
      },
      zoom(closer) {
        if (stopped) return;
        const offset = camera.position.clone().sub(controls!.target);
        const length = THREE.MathUtils.clamp(
          offset.length() * (closer ? VIEWER_ZOOM_STEP : 1 / VIEWER_ZOOM_STEP),
          controls!.minDistance,
          controls!.maxDistance,
        );
        place(controls!.target.clone(), offset, length);
      },
      reset() {
        place(new THREE.Vector3(), DIRECTIONS.perspective, distance);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
