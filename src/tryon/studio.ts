import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { disposeObject } from "./resources";

// Reference workbench studio, in centimetres. Shared by both display viewers.
export const VIEWER_FOV = 30;
export const VIEWER_FIT_MARGIN = 1.2;
export const VIEWER_MAX_PIXEL_RATIO = 2;

export function fitDistance(radius: number, aspect: number, fov = VIEWER_FOV) {
  const vertical = (fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return (
    (radius / Math.sin(Math.min(vertical, horizontal))) * VIEWER_FIT_MARGIN
  );
}

export function createStudio(
  canvas: HTMLCanvasElement,
  onError: () => void,
  beforeDispose?: () => void,
) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEWER_FOV, 1, 0.1, 1000);
  let renderer: THREE.WebGLRenderer | undefined;
  let environment: THREE.WebGLRenderTarget | undefined;
  let floor: THREE.Mesh | undefined;
  let current: THREE.Group | null = null;
  let radius = 10;
  let stopped = false;

  function dispose() {
    if (stopped) return;
    stopped = true;
    canvas.removeEventListener("webglcontextlost", contextLost);
    beforeDispose?.();
    scene.traverse((node) => {
      if (node instanceof THREE.DirectionalLight) node.shadow.dispose();
    });
    disposeObject(scene);
    scene.clear();
    environment?.dispose();
    renderer?.clear();
    renderer?.dispose();
    current = null;
  }

  function contextLost(event: Event) {
    event.preventDefault();
    dispose();
    onError();
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      environment = generator.fromScene(room, 0.03);
      scene.environment = environment.texture;
    } finally {
      room.dispose();
      generator.dispose();
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9b9fa4, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-15, 28, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -23;
    key.shadow.camera.right = key.shadow.camera.top = 23;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.05;
    scene.add(key);
    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.035 }),
    );
    floor.name = "floor";
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    canvas.addEventListener("webglcontextlost", contextLost);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    scene,
    camera,
    get radius() {
      return radius;
    },
    setObject(object: THREE.Group) {
      if (stopped) {
        disposeObject(object);
        return false;
      }
      if (object === current) return null;
      const first = !current;
      const box = new THREE.Box3().setFromObject(object);
      const centre = box.getCenter(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      if (
        box.isEmpty() ||
        !Number.isFinite(sphere.radius) ||
        sphere.radius <= 0
      ) {
        disposeObject(object);
        throw new Error("This object has no displayable geometry.");
      }
      if (current) disposeObject(current);
      current = object;
      object.position.sub(centre);
      scene.add(object);
      object.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = !(node.material as THREE.Material).transparent;
          node.receiveShadow = false;
        }
      });
      radius = sphere.radius;
      floor!.position.y = box.min.y - centre.y - 0.25;
      return first;
    },
    getAnchor(name: string) {
      return current
        ?.getObjectByName(name)
        ?.getWorldPosition(new THREE.Vector3());
    },
    resize() {
      if (stopped) return;
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer!.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, VIEWER_MAX_PIXEL_RATIO),
      );
      renderer!.setSize(width, height, false);
    },
    render(draw?: (renderer: THREE.WebGLRenderer) => void) {
      if (stopped || document.hidden) return;
      try {
        if (draw) draw(renderer!);
        else renderer!.render(scene, camera);
      } catch {
        dispose();
        onError();
      }
    },
    dispose,
  };
}
