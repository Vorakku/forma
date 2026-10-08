import * as THREE from "three";

// PMREM captures from the origin. The shell and inward-facing luminous cards
// describe reflections only; they are never added to the visible stage.
export function buildStudioEnvironment() {
  const scene = new THREE.Scene();
  scene.name = "V2 studio: strip";
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
  );
  shell.name = "room";
  shell.material.color.setScalar(0.03);
  scene.add(shell);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial(),
  );
  floor.name = "reflection floor";
  floor.material.color
    .setRGB(1, 0.97, 0.92)
    .multiplyScalar(0.25);
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

  panel("overhead softbox", 10, 8, 0, 90, 6);
  panel("left strip", 1, 8, -125, 0, 8);
  panel("right strip", 1, 8, 125, 0, 8);
  panel("front-left fill", 8, 8, -40, 20, 0.6);
  return scene;
}
