import * as THREE from "three";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import DESIGN from "./ellis-design.json";

// The Ellis, ported from doc/feature/reference/glasses-threejs-package/src/glasses-model.js (same contours, sections and materials).
// Authored in mm, built in metres, returned wrapped to the app's cm contract: origin at the bridge, +Z forward, arms toward −Z.
type Command = [string, ...number[]];
type Design = typeof DESIGN & {
  outerRight: Command[];
  innerRight: Command[];
  templeControlPoints: number[][];
};
const D = DESIGN as Design;
export const ELLIS_FRONT_DEPTH = D.frontDepth;
export const ELLIS_ACETATE = 0x0b0d0f; // reference finish for the first colourway; other colourways tint the same material
// Live try-on only: worn frames flex open so the arms clear the temples (reference arms reach 74.7 mm half-width).
export const TRYON_TEMPLE_SPLAY_DEG = 4;
const mm = (n: number) => n * 0.001;

export function commandPath<T extends THREE.Path>(
  commands: Command[],
  path: T,
): T {
  for (const c of commands) {
    const [k, ...v] = c;
    if (k === "M") path.moveTo(v[0], v[1]);
    if (k === "C") path.bezierCurveTo(v[0], v[1], v[2], v[3], v[4], v[5]);
    if (k === "L") path.lineTo(v[0], v[1]);
  }
  return path;
}
function reverseCommands(commands: Command[], mirror = false): Command[] {
  const segments: { start: number[]; c: Command }[] = [];
  let p = commands[0].slice(1) as number[];
  for (const c of commands.slice(1)) {
    segments.push({ start: p, c });
    p = c.slice(-2) as number[];
  }
  const x = (v: number) => (mirror ? -v : v),
    result: Command[] = [["M", x(p[0]), p[1]]];
  for (const { start, c } of segments.reverse())
    result.push(
      c[0] === "C"
        ? [
            "C",
            x(c[3] as number),
            c[4] as number,
            x(c[1] as number),
            c[2] as number,
            x(start[0]),
            start[1],
          ]
        : ["L", x(start[0]), start[1]],
    );
  return result;
}
export function contours() {
  const outer = [
    ...D.outerRight,
    ...reverseCommands(D.outerRight, true).slice(1),
  ];
  const sample = commandPath(D.innerRight, new THREE.Path()).getPoints(512),
    xs = sample.map((v) => v.x),
    ys = sample.map((v) => v.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const right = D.innerRight.map(
    (c) =>
      c.map((v, i) =>
        !i
          ? v
          : i % 2 === 1
            ? D.lensGap / 2 +
              (((v as number) - minX) / (maxX - minX)) * D.lensWidth
            : D.lensTop -
              D.lensHeight +
              (((v as number) - minY) / (maxY - minY)) * D.lensHeight,
      ) as Command,
  );
  const left = right.map(
    (c) =>
      c.map((v, i) => (i > 0 && i % 2 === 1 ? -(v as number) : v)) as Command,
  );
  return { outer, right, left };
}
export const warp = (x: number, y: number) =>
  -D.wrap * (x / (D.frontWidth / 2)) ** 2 +
  y * Math.tan(THREE.MathUtils.degToRad(D.pantoscopicTilt));
function extruded(
  commands: Command[],
  {
    depth,
    bevel,
    bevelThickness,
    holes = [],
    lens = false,
    centerX = 0,
  }: {
    depth: number;
    bevel: number;
    bevelThickness: number;
    holes?: Command[][];
    lens?: boolean;
    centerX?: number;
  },
) {
  const shape = commandPath(commands, new THREE.Shape());
  for (const hole of holes)
    shape.holes.push(
      THREE.ShapeUtils.isClockWise(
        commandPath(hole, new THREE.Path()).getPoints(128),
      )
        ? commandPath(reverseCommands(hole), new THREE.Path())
        : commandPath(hole, new THREE.Path()),
    );
  const coreDepth = depth - 2 * bevelThickness;
  let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: coreDepth,
    steps: 1,
    curveSegments: 40,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness,
    bevelOffset: -bevel,
    bevelSegments: 4,
  });
  geometry.translate(0, 0, -coreDepth / 2);
  if (lens) {
    const old = geometry;
    geometry = new TessellateModifier(5, 5).modify(old);
    old.dispose();
  }
  const pos = geometry.attributes.position,
    lensCY = D.lensTop - D.lensHeight / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i);
    let z = pos.getZ(i) + warp(x, y);
    if (lens) z += D.lensSag - ((x - centerX) ** 2 + (y - lensCY) ** 2) / 1000;
    pos.setXYZ(i, mm(x), mm(y), mm(z));
  }
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  const unmerged = geometry;
  geometry = mergeVertices(unmerged, 1e-7);
  unmerged.dispose();
  geometry.computeVertexNormals();
  return geometry;
}
// Flat, tapered arm: a rounded-rectangle section swept along the centripetal Catmull–Rom centreline, capped at both ends.
export function templeDesign(side: number) {
  let points = D.templeControlPoints.map(
    (v) => new THREE.Vector3(side * v[0], v[1], v[2]),
  );
  const origin = points[0].clone(),
    factor =
      D.templeLength /
      new THREE.CatmullRomCurve3(points, false, "centripetal").getLength();
  points = points.map((v) =>
    v.clone().sub(origin).multiplyScalar(factor).add(origin),
  );
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal"),
    up = new THREE.Vector3(0, 1, 0);
  const section = (t: number) => {
    const c = curve.getPointAt(t),
      tangent = curve.getTangentAt(t).normalize();
    const u = new THREE.Vector3().crossVectors(tangent, up).normalize(),
      v = new THREE.Vector3().crossVectors(u, tangent).normalize();
    const halfW = THREE.MathUtils.lerp(1.6, 1.25, Math.min(1, t * 2));
    let halfH = 3.25 - Math.min(1, t * 2);
    if (t > 0.72) halfH += 0.25 * Math.sin(((t - 0.72) / 0.28) * Math.PI);
    const endScale = t > 0.975 ? Math.max(0.12, (1 - t) / 0.025) : 1;
    return { c, u, v, halfW, halfH, endScale };
  };
  const sectionPoint = (t: number, a: number) => {
    const { c, u, v, halfW, halfH, endScale } = section(t);
    const xx =
        Math.sign(Math.cos(a)) *
        Math.abs(Math.cos(a)) ** 0.55 *
        halfW *
        endScale,
      yy =
        Math.sign(Math.sin(a)) *
        Math.abs(Math.sin(a)) ** 0.55 *
        halfH *
        endScale;
    return c
      .clone()
      .addScaledVector(u, xx)
      .addScaledVector(v, yy)
      .sub(origin)
      .multiplyScalar(0.001);
  };
  return { origin, curve, section, sectionPoint };
}
function sweptTemple(side: number) {
  const { origin, curve, sectionPoint } = templeDesign(side);
  const positions: number[] = [],
    indices: number[] = [],
    radial = 20,
    steps = 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (let j = 0; j < radial; j++) {
      const q = sectionPoint(t, (j / radial) * 2 * Math.PI);
      positions.push(q.x, q.y, q.z);
      if (i < steps) {
        const a0 = i * radial + j,
          b = i * radial + ((j + 1) % radial);
        indices.push(a0, a0 + radial, b, b, a0 + radial, b + radial);
      }
    }
  }
  for (let end = 0; end < 2; end++) {
    const ring = end ? steps * radial : 0,
      q = curve.getPointAt(end).sub(origin),
      center = positions.length / 3;
    positions.push(mm(q.x), mm(q.y), mm(q.z));
    for (let j = 0; j < radial; j++) {
      const a = ring + j,
        b = ring + ((j + 1) % radial);
      if (end) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, origin: origin.multiplyScalar(0.001) };
}

// Shared clear-glass recipe for video overlays and the V2 night backdrop.
export const ELLIS_OVERLAY_GLASS = {
  transmission: 0,
  transparent: true,
  opacity: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  depthWrite: false,
  thickness: 0,
  attenuationDistance: Infinity,
  envMapIntensity: 1,
} as const;

/** overlay: live camera try-on (no transmission over video, arms flexed open, drawn after the head occluder). */
export function buildEllis(
  color: THREE.ColorRepresentation = ELLIS_ACETATE,
  { overlay = false } = {},
): THREE.Group {
  const c = contours(),
    model = new THREE.Group();
  model.name = "ellis.reference";
  const acetate = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: D.roughness,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    ior: 1.49,
  });
  // Transmission samples only what WebGL drew, so over a live <video> it would show nothing behind the lens; overlay uses a thin clear coat instead.
  const glass = overlay
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.025,
        ...ELLIS_OVERLAY_GLASS,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.025,
        transmission: 1,
        opacity: 1,
        ior: 1.5,
        thickness: mm(D.lensThickness),
        attenuationColor: 0xffffff,
        attenuationDistance: 1,
        envMapIntensity: 0.55,
      });
  const silver = new THREE.MeshStandardMaterial({
    color: 0xb7b3a6,
    metalness: 0.88,
    roughness: 0.25,
  });
  const add = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = model,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.renderOrder = material === glass ? 2 : 1;
    parent.add(mesh);
    return mesh;
  };
  const frame = add(
    "front_frame",
    extruded(c.outer, {
      depth: D.frontDepth,
      bevel: D.bevel,
      bevelThickness: D.bevelThickness,
      holes: [c.right, c.left],
    }),
    acetate,
  );
  for (const side of [-1, 1]) {
    const suffix = side > 0 ? "R" : "L",
      inner = side > 0 ? c.right : c.left,
      cx = side * (D.lensGap / 2 + D.lensWidth / 2),
      cy = D.lensTop - D.lensHeight / 2;
    // 0.8% larger than the opening so the lens edge is buried in the acetate.
    add(
      "lens_" + suffix,
      extruded(
        inner.map(
          (k) =>
            k.map((v, i) =>
              !i
                ? v
                : i % 2
                  ? cx + ((v as number) - cx) * 1.008
                  : cy + ((v as number) - cy) * 1.008,
            ) as Command,
        ),
        {
          depth: D.lensThickness,
          bevel: 0.1,
          bevelThickness: 0.1,
          lens: true,
          centerX: cx,
        },
      ),
      glass,
    );
    const t = sweptTemple(side),
      pivot = new THREE.Group();
    pivot.name = "temple_pivot_" + suffix;
    pivot.position.copy(t.origin);
    model.add(pivot);
    if (overlay)
      pivot.rotation.y =
        -side * THREE.MathUtils.degToRad(TRYON_TEMPLE_SPLAY_DEG);
    add("temple_" + suffix, t.geometry, acetate, pivot);
    const x = side * 65.6,
      y = 8.3,
      rivet = add(
        "front_rivet_" + suffix,
        new THREE.SphereGeometry(1, 24, 14),
        silver,
        frame,
      );
    rivet.position.set(mm(x), mm(y), mm(warp(x, y) + D.frontDepth / 2 + 0.03));
    rivet.scale.set(mm(1.85), mm(0.63), mm(0.2));
    rivet.rotation.set(
      -THREE.MathUtils.degToRad(D.pantoscopicTilt),
      side * 0.105,
      0,
    );
    const pin = add(
      side > 0 ? "detail.hinge.right" : "detail.hinge.left",
      new THREE.CylinderGeometry(mm(0.85), mm(0.85), mm(5.1), 16),
      silver,
      frame,
    );
    pin.position
      .copy(t.origin)
      .add(new THREE.Vector3(mm(side * 0.35), 0, mm(0.25)));
    const badge = add(
      "temple_rivet_" + suffix,
      new THREE.SphereGeometry(1, 20, 12),
      silver,
      pivot,
    );
    badge.position.set(mm(side * 2.5), 0, mm(-4.7));
    badge.scale.set(mm(0.18), mm(0.68), mm(1.45));
  }
  if (overlay) model.position.z = -mm(D.frontDepth / 2); // front face on z = 0, as the anchor offset expects
  const group = new THREE.Group();
  group.name = "ellis";
  group.scale.setScalar(100);
  group.add(model);
  return group;
}
