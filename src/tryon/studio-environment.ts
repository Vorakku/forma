import * as THREE from "three";

export type StudioEnvironment = "strip" | "soft" | "window";

export function readStudioEnvironment(search: string): StudioEnvironment {
  const variant = new URLSearchParams(search).get("env");
  return variant === "soft" || variant === "window" ? variant : "strip";
}

// PMREM captures from the origin. The shell and inward-facing luminous cards
// describe reflections only; they are never added to the visible stage.
export function buildStudioEnvironment(variant: StudioEnvironment) {
  const scene = new THREE.Scene();
  scene.name = "V2 studio: " + variant;
  const walls = variant === "strip" ? 0.03 : variant === "soft" ? 0.15 : 0.08;
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
  );
  shell.name = "room";
  shell.material.color.setScalar(walls);
  scene.add(shell);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial(),
  );
  floor.name = "reflection floor";
  floor.material.color
    .setRGB(1, 0.97, 0.92)
    .multiplyScalar(variant === "window" ? 0.3 : 0.25);
  floor.position.y = -14.9;
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  function panel(
    name: string,
    width: number,
    height: number,
    azimuth: number,
    elevation: number,
    intensity: number,
  ) {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial(),
    );
    card.name = name;
    card.material.color.setScalar(intensity);
    card.position.setFromSphericalCoords(
      12,
      THREE.MathUtils.degToRad(90 - elevation),
      THREE.MathUtils.degToRad(azimuth),
    );
    card.lookAt(0, 0, 0);
    scene.add(card);
  }

  if (variant === "strip") {
    panel("overhead softbox", 10, 8, 0, 90, 6);
    panel("left strip", 1, 8, -125, 0, 8);
    panel("right strip", 1, 8, 125, 0, 8);
    panel("front-left fill", 8, 8, -40, 20, 0.6);
  } else if (variant === "soft") {
    panel("overhead softbox", 12, 10, 0, 90, 4);
    panel("front fill", 10, 8, 0, 20, 1.5);
  } else {
    panel("left window", 10, 6, -70, 20, 5);
    panel("back-right kicker", 0.75, 6, 125, 0, 3);
  }
  return scene;
}
