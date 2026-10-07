import { fitDistance } from "./studio";

export const PHI_MIN = 0.02;
export const PHI_MAX = Math.PI - PHI_MIN;

// Degrees; keep the ordered pose table easy to retune or extend.
// prettier-ignore
export const SCROLL_ANGLES = [
  { name: "Three-quarter", theta: 21.037511025421818, elevation: 11.641352263306857, target: "centre", distance: "fit", exploded: false },
  { name: "Side three-quarter", theta: -63, elevation: 18, target: "centre", distance: "fit", exploded: true },
  { name: "Top", theta: 0, elevation: 88.8542371618249, target: "centre", distance: "fit", exploded: false },
  { name: "Hinge detail", theta: 39.8055710922652, elevation: 19.397238652356407, target: "detail.hinge.right", distance: 0.48, exploded: false },
  { name: "Front", theta: 0, elevation: 1.7183580016554572, target: "centre", distance: "fit", exploded: false },
] as const;

export type OrbitPose = {
  targetX: number;
  targetY: number;
  targetZ: number;
  theta: number;
  phi: number;
  distance: number;
};

export type ScenePose = OrbitPose & { explode: number };

export function clampPhi(phi: number) {
  return Math.max(PHI_MIN, Math.min(PHI_MAX, phi));
}

export function resolveScrollPoses(
  radius: number,
  aspect: number,
  getAnchor: (name: string) => { x: number; y: number; z: number } | undefined,
  explodedRadius = radius,
): ScenePose[] {
  return SCROLL_ANGLES.map((angle) => {
    const target =
      angle.target === "centre"
        ? { x: 0, y: 0, z: 0 }
        : getAnchor(angle.target);
    if (!target) throw new Error(`Missing frame anchor: ${angle.target}`);
    return {
      targetX: target.x,
      targetY: target.y,
      targetZ: target.z,
      theta: (angle.theta * Math.PI) / 180,
      phi: clampPhi(((90 - angle.elevation) * Math.PI) / 180),
      distance:
        angle.distance === "fit"
          ? fitDistance(angle.exploded ? explodedRadius : radius, aspect)
          : radius * angle.distance,
      explode: Number(angle.exploded),
    };
  });
}
