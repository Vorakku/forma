import * as THREE from "three";
import { fitDistance } from "./studio";

export const PHI_MIN = 0.02;
export const PHI_MAX = Math.PI - PHI_MIN;

// Degrees; keep the ordered pose table easy to retune or extend. `pace`
// multiplies CAMERA_SPEED for the camera move arriving at that angle.
// prettier-ignore
export const SCROLL_ANGLES = [
  { name: "Three-quarter", theta: 21.037511025421818, elevation: 11.641352263306857, target: "centre", distance: "fit", exploded: false, blueprint: false, pace: 1, light: { key: { azimuth: -40, elevation: 50, intensity: 3, color: "#ffffff" }, hemisphere: 0.8, environment: 1, yaw: 0, pool: { x: 50, y: 35, size: 75, strength: 1 } } },
  { name: "Side three-quarter", theta: -63, elevation: 18, target: "centre", distance: "fit", exploded: true, blueprint: false, pace: 1, light: { key: { azimuth: 117, elevation: 35, intensity: 2.2, color: "#eaf1ff" }, hemisphere: 0.5, environment: 1.15, yaw: 0, pool: { x: 60, y: 30, size: 70, strength: 0.85 } } },
  { name: "Top view", theta: 0, elevation: 88.8542371618249, target: "centre", distance: "fit", exploded: false, blueprint: true, pace: 1.25, light: { key: { azimuth: -40, elevation: 70, intensity: 1.5, color: "#ffffff" }, hemisphere: 0.5, environment: 0.7, yaw: 0, pool: { x: 50, y: 50, size: 60, strength: 0.4 } } },
  { name: "Hinge detail", theta: 39.8055710922652, elevation: 19.397238652356407, target: "detail.hinge.right", distance: 0.48, exploded: false, blueprint: false, pace: 2.8, light: { key: { azimuth: -50, elevation: 15, intensity: 3.5, color: "#fff6ea" }, hemisphere: 0.35, environment: 0.8, yaw: 0, pool: { x: 55, y: 45, size: 45, strength: 0.6 } } },
  { name: "Front", theta: 0, elevation: 1.7183580016554572, target: "centre", distance: "fit", exploded: false, blueprint: false, pace: 2.4, light: { key: { azimuth: 0, elevation: 55, intensity: 3, color: "#ffffff" }, hemisphere: 0.8, environment: 1, yaw: 0, pool: { x: 50, y: 30, size: 75, strength: 1 } } },
] as const;

export type OrbitPose = {
  targetX: number;
  targetY: number;
  targetZ: number;
  theta: number;
  phi: number;
  distance: number;
};

export type ScenePose = OrbitPose & {
  explode: number;
  blueprint: number;
  light: number;
};

export function clampPhi(phi: number) {
  return Math.max(PHI_MIN, Math.min(PHI_MAX, phi));
}

export function resolveScrollPoses(
  radius: number,
  aspect: number,
  getAnchor: (name: string) => { x: number; y: number; z: number } | undefined,
  explodedRadius = radius,
): ScenePose[] {
  return SCROLL_ANGLES.map((angle, index) => {
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
      blueprint: Number(angle.blueprint),
      light: index,
    };
  });
}

export type LightState = {
  key: {
    azimuth: number;
    elevation: number;
    intensity: number;
    color: THREE.ColorRepresentation;
  };
  hemisphere: number;
  environment: number;
  yaw: number;
  pool: { x: number; y: number; size: number; strength: number };
};

// Keep the original key's radius and shadow camera coverage as the key orbits.
export const KEY_DISTANCE = Math.hypot(-15, 28, 18);

// Integers preserve the row exactly. Fractional colours are fresh linear-space
// Colors, avoiding hex quantisation while never mutating either source row.
export function resolveLight(
  light: number,
  angles: readonly { light: LightState }[] = SCROLL_ANGLES,
): LightState {
  const value = THREE.MathUtils.clamp(light, 0, angles.length - 1);
  const index = Math.floor(value);
  const a = angles[index].light;
  const t = value - index;
  if (t === 0) return a;
  const b = angles[index + 1].light;
  const lerp = (from: number, to: number) => THREE.MathUtils.lerp(from, to, t);
  const azimuthDelta =
    THREE.MathUtils.euclideanModulo(b.key.azimuth - a.key.azimuth + 180, 360) - 180;
  return {
    key: {
      azimuth: a.key.azimuth + azimuthDelta * t,
      elevation: lerp(a.key.elevation, b.key.elevation),
      intensity: lerp(a.key.intensity, b.key.intensity),
      color: new THREE.Color(a.key.color).lerp(new THREE.Color(b.key.color), t),
    },
    hemisphere: lerp(a.hemisphere, b.hemisphere),
    environment: lerp(a.environment, b.environment),
    yaw: lerp(a.yaw, b.yaw),
    pool: {
      x: lerp(a.pool.x, b.pool.x),
      y: lerp(a.pool.y, b.pool.y),
      size: lerp(a.pool.size, b.pool.size),
      strength: lerp(a.pool.strength, b.pool.strength),
    },
  };
}
