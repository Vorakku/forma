import * as THREE from "three";

// Reference setExploded offsets, in the parts' local metre space. The Ellis
// wrapper supplies the existing ×100 scale; children travel with these parents.
const OFFSETS = [
  ["front_frame", 0, 0.3],
  ["lens_L", -0.3, 1.35],
  ["lens_R", 0.3, 1.35],
  ["temple_pivot_L", -1, -0.4],
  ["temple_pivot_R", 1, -0.4],
] as const;

export function createExploder(object: THREE.Object3D, separationMM: number) {
  const parts = OFFSETS.map(([name, x, z]) => {
    const node = object.getObjectByName(name);
    return node && { node, base: node.position.clone(), x, z };
  });
  // A frame without the reference assembly is left entirely alone.
  const supported = parts.every((part) => !!part);
  return {
    set(amount: number) {
      if (!supported) return;
      const distance =
        THREE.MathUtils.clamp(amount, 0, 1) * separationMM * 0.001;
      for (const part of parts) {
        if (!part) continue;
        part.node.position.copy(part.base);
        if (distance === 0) continue;
        part.node.position.x += part.x * distance;
        part.node.position.z += part.z * distance;
      }
    },
  };
}
