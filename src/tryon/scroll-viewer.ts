import * as THREE from "three";
import { createStudio } from "./studio";
import { createExploder } from "./explode";
import { createBlueprint } from "./blueprint";
import { createBlueprintRender } from "./blueprint-render";
import type { BlueprintTokens } from "./blueprint-theme";
import { VIEWER_MAX_PIXEL_RATIO } from "./studio";
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
  let blueprint: ReturnType<typeof createBlueprint> | undefined;
  let blueprintRender: ReturnType<typeof createBlueprintRender> | undefined;
  let blueprintMix = 0;
  let blueprintTokens: BlueprintTokens | undefined;
  const anchors = new Map<string, THREE.Vector3>();
  const studio = createStudio(
    canvas,
    () => {
      dispose();
      onError();
    },
    disposeBlueprint,
  );
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
    if (blueprintMix > 0 && blueprint && blueprintRender)
      studio.render((renderer) =>
        blueprintRender!.draw(
          renderer,
          studio.scene,
          studio.camera,
          blueprint!,
          blueprintMix,
        ),
      );
    else studio.render();
  }

  function resize() {
    if (stopped) return;
    studio.resize();
    blueprint?.resize(
      canvas.clientWidth,
      canvas.clientHeight,
      Math.min(window.devicePixelRatio || 1, VIEWER_MAX_PIXEL_RATIO),
    );
    onResize?.();
    render();
  }

  function visibility() {
    if (!document.hidden) render();
  }

  function disposeBlueprint() {
    // Detach resources owned here before the studio traverses the same scene.
    blueprint?.dispose();
    blueprintRender?.dispose();
    blueprint = undefined;
    blueprintRender = undefined;
  }

  function dispose() {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    exploder?.set(0);
    exploder = undefined;
    anchors.clear();
    disposeBlueprint();
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
      blueprint?.dispose();
      blueprint = undefined;
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
      blueprint = createBlueprint(object);
      blueprintRender ??= createBlueprintRender();
      blueprint.resize(
        canvas.clientWidth,
        canvas.clientHeight,
        Math.min(window.devicePixelRatio || 1, VIEWER_MAX_PIXEL_RATIO),
      );
      if (blueprintTokens) blueprint.recolor(blueprintTokens);
      return installed;
    },
    getAnchor(name: string) {
      return anchors.get(name)?.clone();
    },
    setBlueprintTokens(tokens: BlueprintTokens) {
      if (stopped) return;
      blueprintTokens = tokens;
      blueprint?.recolor(tokens);
      render();
    },
    setPose(next: OrbitPose & { explode?: number; blueprint?: number }) {
      if (stopped) return;
      exploder?.set(next.explode ?? 0);
      blueprintMix = THREE.MathUtils.clamp(next.blueprint ?? 0, 0, 1);
      pose = { ...next, phi: clampPhi(next.phi) };
      render();
    },
    dispose,
  };
}
