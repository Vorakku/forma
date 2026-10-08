import * as THREE from "three";

// Comparison exposures stay fixed for the viewer's lifetime. Only V2 reads
// this query parameter; shared studio callers retain their existing defaults.
export function readStudioTone(search: string) {
  const variant = new URLSearchParams(search).get("tone");
  if (variant === "neutral")
    return {
      toneMapping: THREE.NeutralToneMapping,
      toneMappingExposure: 1,
    };
  if (variant === "agx")
    return {
      toneMapping: THREE.AgXToneMapping,
      toneMappingExposure: 1,
    };
  return {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.45,
  };
}
