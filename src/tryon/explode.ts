import * as THREE from "three";
import { EXPLODE_STAGGER } from "./scroll-steps";

// Reference setExploded offsets, in the parts' local metre space. The Ellis
// wrapper supplies the existing ×100 scale; children travel with these parents.
const OFFSETS = [
  ["front_frame", 0, 0.3, 0],
  ["lens_L", -0.3, 1.35, 0],
  ["lens_R", 0.3, 1.35, 0],
  ["temple_pivot_L", -1, -0.4, EXPLODE_STAGGER],
  ["temple_pivot_R", 1, -0.4, EXPLODE_STAGGER],
] as const;

export function createExploder(object: THREE.Object3D, separationMM: number) {
  const parts = OFFSETS.map(([name, x, z, start]) => {
    const node = object.getObjectByName(name);
    return node && { node, base: node.position.clone(), x, z, start };
  });
  // A frame without the reference assembly is left entirely alone.
  const supported = parts.every((part) => !!part);
  return {
    set(amount: number) {
      if (!supported) return;
      for (const part of parts) {
        if (!part) continue;
        const p = THREE.MathUtils.clamp(
          (amount - part.start) / (1 - EXPLODE_STAGGER),
          0,
          1,
        );
        const progress = p * p * (3 - 2 * p);
        const distance = progress * separationMM * 0.001;
        part.node.position.copy(part.base);
        if (distance === 0) continue;
        part.node.position.x += part.x * distance;
        part.node.position.z += part.z * distance;
      }
    },
  };
}
