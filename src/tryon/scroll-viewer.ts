import * as THREE from "three";
import { sampleFrameSurface } from "./screen-motion";
import { createStudio } from "./studio";
import { createExploder } from "./explode";
import { createBlueprint } from "./blueprint";
import { createBlueprintRender } from "./blueprint-render";
import type { BlueprintTokens } from "./blueprint-theme";
import { VIEWER_MAX_PIXEL_RATIO } from "./studio";
import {
  buildStudioEnvironment,
  readStudioEnvironment,
} from "./studio-environment";
import { EXPLODE_MM, ENV_FOLLOW } from "./scroll-steps";
import {
  resolveLight,
  KEY_DISTANCE,
  clampPhi,
  type OrbitPose,
  type ScenePose,
} from "./scroll-poses";

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
  let pose: ScenePose | undefined;
  let stopped = false;
  let exploder: ReturnType<typeof createExploder> | undefined;
  let explodedRadius = 10;
  let blueprint: ReturnType<typeof createBlueprint> | undefined;
  let blueprintRender: ReturnType<typeof createBlueprintRender> | undefined;
  let blueprintMix = 0;
  let renderRevision = 0;
  let shadowDirty = true;
  let lastExplode = 0;
  let blueprintTokens: BlueprintTokens | undefined;
  let surfacePoints: THREE.Vector3[] = [];
  const anchors = new Map<string, THREE.Vector3>();
  const studio = createStudio(
    canvas,
    () => {
      dispose();
      onError();
    },
    disposeBlueprint,
    () =>
      buildStudioEnvironment(readStudioEnvironment(window.location.search)),
  );
  const keyPosition = new THREE.Vector3();
  const keyColor = new THREE.Color();
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
    studio.render((renderer) => {
      // Directional shadows depend on the model/light, not the viewing camera.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = shadowDirty;
      if (blueprintMix > 0 && blueprint && blueprintRender)
        blueprintRender.draw(
          renderer,
          studio.scene,
          studio.camera,
          blueprint,
          blueprintMix,
          renderRevision,
        );
      else renderer.render(studio.scene, studio.camera);
      if (blueprintMix < 1) shadowDirty = false;
    });
  }

  function resize() {
    if (stopped) return;
    studio.resize();
    renderRevision++;
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
    surfacePoints = [];
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
    get surfacePoints() {
      return surfacePoints;
    },
    get width() {
      return Math.max(1, canvas.clientWidth);
    },
    get height() {
      return Math.max(1, canvas.clientHeight);
    },
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
      shadowDirty = true;
      lastExplode = 0;
      renderRevision++;
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
      surfacePoints = sampleFrameSurface(object);
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
      renderRevision++;
      blueprint?.recolor(tokens);
      render();
    },
    setPose(
      next: OrbitPose & { explode?: number; blueprint?: number; light?: number },
    ) {
      if (stopped) return;
      const light = next.light ?? 0;
      const resolvedLight = resolveLight(light);
      keyPosition.setFromSphericalCoords(
        KEY_DISTANCE,
        THREE.MathUtils.degToRad(90 - resolvedLight.key.elevation),
        THREE.MathUtils.degToRad(resolvedLight.key.azimuth),
      );
      keyColor.set(resolvedLight.key.color);
      const environmentYaw =
        ENV_FOLLOW * next.theta + THREE.MathUtils.degToRad(resolvedLight.yaw);
      const keyMoved = !studio.key.position.equals(keyPosition);
      if (keyMoved) shadowDirty = true;
      if (
        keyMoved ||
        !studio.key.color.equals(keyColor) ||
        studio.key.intensity !== resolvedLight.key.intensity ||
        studio.hemisphere.intensity !== resolvedLight.hemisphere ||
        studio.scene.environmentIntensity !== resolvedLight.environment ||
        studio.scene.environmentRotation.y !== environmentYaw ||
        light !== pose?.light
      )
        renderRevision++;
      studio.key.position.copy(keyPosition);
      studio.key.color.copy(keyColor);
      studio.key.intensity = resolvedLight.key.intensity;
      studio.hemisphere.intensity = resolvedLight.hemisphere;
      studio.scene.environmentIntensity = resolvedLight.environment;
      studio.scene.environmentRotation.y = environmentYaw;
      const explode = next.explode ?? 0;
      if (explode !== lastExplode) shadowDirty = true;
      lastExplode = explode;
      if (
        !pose ||
        explode !== pose.explode ||
        (
          ["targetX", "targetY", "targetZ", "theta", "phi", "distance"] as const
        ).some((key) => next[key] !== pose![key])
      )
        renderRevision++;
      exploder?.set(explode);
      blueprintMix = THREE.MathUtils.clamp(next.blueprint ?? 0, 0, 1);
      pose = {
        ...next,
        explode,
        light,
        blueprint: blueprintMix,
        phi: clampPhi(next.phi),
      };
      render();
    },
    dispose,
  };
}
