import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  contours,
  commandPath,
  warp,
  templeDesign,
  ELLIS_FRONT_DEPTH,
} from "./ellis";
import type { BlueprintTokens } from "./blueprint-theme";

export const BLUEPRINT_LINE_PX = 1.7;
export const BLUEPRINT_HIDDEN_PX = 1;

// Points are in the owning part's local metres, using the same design functions
// as its geometry. Arm edges sample actual section vertices, not a second sweep.
export function ellisBlueprintCurves(object: THREE.Object3D) {
  const curves: {
    part: THREE.Object3D;
    points: THREE.Vector3[];
    centre: boolean;
  }[] = [];
  if (!object.getObjectByName("ellis.reference")) return curves;
  const front = object.getObjectByName("front_frame");
  if (front) {
    const c = contours();
    for (const face of [1, -1])
      for (const commands of [c.outer, c.right, c.left]) {
        const points = commandPath(commands, new THREE.Path())
          .getPoints(160)
          .map(
            (p) =>
              new THREE.Vector3(
                p.x * 0.001,
                p.y * 0.001,
                ((face * ELLIS_FRONT_DEPTH) / 2 + warp(p.x, p.y)) * 0.001,
              ),
          );
        curves.push({
          part: front,
          points: [...points, points[0].clone()],
          centre: false,
        });
      }
  }
  for (const side of [-1, 1]) {
    const part = object.getObjectByName(`temple_${side > 0 ? "R" : "L"}`);
    if (!part) continue;
    const design = templeDesign(side);
    for (const vertex of [2, 8, 12, 18]) {
      const points = Array.from({ length: 101 }, (_, i) =>
        design.sectionPoint(i / 100, (vertex / 20) * 2 * Math.PI),
      );
      curves.push({ part, points, centre: false });
    }
    curves.push({
      part,
      points: Array.from({ length: 101 }, (_, i) =>
        design.curve
          .getPointAt(i / 100)
          .sub(design.origin)
          .multiplyScalar(0.001),
      ),
      centre: true,
    });
  }
  return curves;
}

export function createBlueprint(object: THREE.Object3D) {
  const meshes: {
    mesh: THREE.Mesh;
    material: THREE.Material | THREE.Material[];
    fill: THREE.MeshBasicMaterial;
    order: number;
  }[] = [];
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const lens = node.name.startsWith("lens_");
    meshes.push({
      mesh: node,
      material: node.material,
      order: node.renderOrder,
      fill: new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: !lens,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      }),
    });
  });
  const visible = new LineMaterial({
    linewidth: BLUEPRINT_LINE_PX,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const hidden = new LineMaterial({
    linewidth: BLUEPRINT_HIDDEN_PX,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    dashed: true,
    dashSize: 0.0015,
    gapSize: 0.0012,
    depthFunc: THREE.GreaterDepth,
  });
  const centre = new LineMaterial({
    linewidth: BLUEPRINT_HIDDEN_PX,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    dashed: true,
    dashSize: 0.004,
    gapSize: 0.0015,
    // The centre is inside the arm, so it is a hidden construction line.
    depthFunc: THREE.GreaterDepth,
  });
  const lines: (Line2 | LineSegments2)[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const add = (
    parent: THREE.Object3D,
    geometry: LineGeometry | LineSegmentsGeometry,
    isCentre = false,
    segments = false,
  ) => {
    geometries.add(geometry);
    for (const [material, order] of isCentre
      ? [[centre, 3] as const]
      : [[hidden, 1] as const, [visible, 2] as const]) {
      const line = segments
        ? new LineSegments2(geometry, material)
        : new Line2(geometry as LineGeometry, material);
      line.name = `blueprint.${isCentre ? "centre" : material === hidden ? "hidden" : "visible"}`;
      line.computeLineDistances();
      line.renderOrder = order + 3;
      line.visible = false;
      // LineSegments2 normally overwrites resolution with the logical viewport.
      // Keep our explicit drawing-buffer resolution and DPR-scaled pixel width.
      line.onBeforeRender = () => {};
      parent.add(line);
      lines.push(line);
    }
  };
  const curves = ellisBlueprintCurves(object);
  if (curves.length)
    for (const curve of curves) {
      add(
        curve.part,
        new LineGeometry().setPositions(
          curve.points.flatMap((p) => p.toArray()),
        ),
        curve.centre,
      );
    }
  else
    for (const { mesh } of meshes) {
      const edges = new THREE.EdgesGeometry(mesh.geometry, 50);
      try {
        add(
          mesh,
          new LineSegmentsGeometry().fromEdgesGeometry(edges),
          false,
          true,
        );
      } finally {
        edges.dispose();
      }
    }
  let disposed = false;
  return {
    recolor(tokens: BlueprintTokens) {
      for (const { mesh, fill } of meshes) {
        const lens = mesh.name.startsWith("lens_");
        fill.color.set(tokens[lens ? "lens" : "fill"]);
        fill.opacity = Number(tokens[lens ? "lens-opacity" : "fill-opacity"]);
      }
      visible.color.set(tokens.line);
      visible.opacity = 1;
      for (const material of [hidden, centre]) {
        material.color.set(tokens.hidden);
        material.opacity = Number(tokens["hidden-opacity"]);
      }
    },
    resize(width: number, height: number, dpr: number) {
      for (const material of [visible, hidden, centre]) {
        material.linewidth =
          (material === visible ? BLUEPRINT_LINE_PX : BLUEPRINT_HIDDEN_PX) *
          dpr;
        material.resolution.set(width * dpr, height * dpr);
      }
    },
    // Swap only for an independent blueprint render, then restore before returning.
    draw<T>(render: () => T): T {
      try {
        for (const { mesh, fill } of meshes) {
          mesh.material = fill;
          mesh.renderOrder = 0;
        }
        for (const line of lines) line.visible = true;
        return render();
      } finally {
        for (const { mesh, material, order } of meshes) {
          mesh.material = material;
          mesh.renderOrder = order;
        }
        for (const line of lines) line.visible = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const line of lines) line.removeFromParent();
      geometries.forEach((g) => g.dispose());
      for (const material of [
        visible,
        hidden,
        centre,
        ...meshes.map((m) => m.fill),
      ])
        material.dispose();
    },
  };
}
