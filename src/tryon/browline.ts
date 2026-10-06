// TypeScript port of doc/feature/reference/browline-threejs-package/src/glasses-model.js.
// Contours, hardware, UVs and materials retain the supplied reconstruction.
import * as THREE from "three";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createTortoiseshellTexture } from "./tortoiseshell-texture";
import DESIGN from "./browline-design.json";
type Command = [string, ...number[]];
type Design = Omit<typeof DESIGN, "browRight" | "innerRight" | "bridge"> & {
  browRight: Command[];
  innerRight: Command[];
  bridge: Command[];
};
const DEFAULTS = DESIGN as Design;
export const BROWLINE_ACETATE = 0xffffff;
const TRYON_TEMPLE_SPLAY_DEG = 4;
type Extrusion = {
  depth: number;
  bevel: number;
  bevelThickness: number;
  holes?: Command[][];
  lens?: boolean;
  centerX?: number;
};
const mm = (n: number) => n * 0.001;
function commandPath(commands: Command[], path: THREE.Path = new THREE.Path()) {
  for (const c of commands) {
    if (c[0] === "M") path.moveTo(c[1], c[2]);
    if (c[0] === "C") path.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    if (c[0] === "L") path.lineTo(c[1], c[2]);
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
  const x = (v: number) => (mirror ? -v : v);
  const result: Command[] = [["M", x(p[0]), p[1]]];
  for (const { start, c } of segments.reverse()) {
    result.push(
      c[0] === "C"
        ? ["C", x(c[3]), c[4], x(c[1]), c[2], x(start[0]), start[1]]
        : ["L", x(start[0]), start[1]],
    );
  }
  return result;
}

function warp(x: number, y: number, p: Design) {
  return (
    -p.wrap * (x / (p.frontWidth / 2)) ** 2 +
    y * Math.tan(THREE.MathUtils.degToRad(p.pantoscopicTilt))
  );
}

function extruded(
  commands: Command[],
  p: Design,
  {
    depth,
    bevel,
    bevelThickness,
    holes = [],
    lens = false,
    centerX = 0,
  }: Extrusion,
) {
  const shape = new THREE.Shape();
  commandPath(commands, shape);
  for (const hole of holes) {
    const path = commandPath(hole);
    shape.holes.push(
      THREE.ShapeUtils.isClockWise(path.getPoints(128))
        ? commandPath(reverseCommands(hole))
        : path,
    );
  }
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
  const pos = geometry.attributes.position;
  const lensCY = p.lensTop - p.lensHeight / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i);
    let z = pos.getZ(i) + warp(x, y, p);
    if (lens) z += p.lensSag - ((x - centerX) ** 2 + (y - lensCY) ** 2) / 1000;
    pos.setXYZ(i, mm(x), mm(y), mm(z));
  }
  // Smooth the bevels first; the acetate UVs are generated after merging.
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  const unmerged = geometry;
  geometry = mergeVertices(unmerged, 1e-7);
  unmerged.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function sweptTemple(p: Design, side: number) {
  const scaleX = p.frontWidth / DEFAULTS.frontWidth;
  let points = p.templeControlPoints.map(
    (v) => new THREE.Vector3(side * v[0] * scaleX, v[1], v[2]),
  );
  const origin = points[0].clone();
  const original = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const factor = p.templeLength / original.getLength();
  points = points.map((v) =>
    v.clone().sub(origin).multiplyScalar(factor).add(origin),
  );
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const positions: number[] = [],
    indices: number[] = [],
    radial = 20,
    steps = 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      c = curve.getPointAt(t),
      tangent = curve.getTangentAt(t).normalize();
    const u = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize();
    const v = new THREE.Vector3().crossVectors(u, tangent).normalize();
    const halfW = THREE.MathUtils.lerp(1.6, 1.25, Math.min(1, t * 2));
    let halfH = 3.25 - 1.0 * Math.min(1, t * 2);
    if (t > 0.72) halfH += 0.25 * Math.sin(((t - 0.72) / 0.28) * Math.PI);
    const endScale = t > 0.975 ? Math.max(0.12, (1 - t) / 0.025) : 1;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * 2 * Math.PI;
      const xx =
        Math.sign(Math.cos(a)) *
        Math.abs(Math.cos(a)) ** 0.55 *
        halfW *
        endScale;
      const yy =
        Math.sign(Math.sin(a)) *
        Math.abs(Math.sin(a)) ** 0.55 *
        halfH *
        endScale;
      const q = c
        .clone()
        .addScaledVector(u, xx)
        .addScaledVector(v, yy)
        .sub(origin);
      positions.push(mm(q.x), mm(q.y), mm(q.z));
      if (i < steps) {
        const a0 = i * radial + j,
          b = i * radial + ((j + 1) % radial);
        const c0 = a0 + radial,
          d = b + radial;
        indices.push(a0, c0, b, b, c0, d);
      }
    }
  }
  // Watertight caps, with normals pointing away from the solid.
  for (let end = 0; end < 2; end++) {
    const ring = end ? steps * radial : 0,
      q = curve.getPointAt(end).sub(origin);
    const center = positions.length / 3;
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
  geometry.computeBoundingBox();
  return { geometry, origin: origin.multiplyScalar(0.001), curve };
}

/** Shared vectors used by both the model and the annotated blueprint. */
function getContours() {
  const p = DEFAULTS,
    scaleX = p.frontWidth / DEFAULTS.frontWidth;
  const points = commandPath(p.innerRight).getPoints(512);
  const minX = Math.min(...points.map((v) => v.x)),
    maxX = Math.max(...points.map((v) => v.x));
  const minY = Math.min(...points.map((v) => v.y)),
    maxY = Math.max(...points.map((v) => v.y));
  const right: Command[] = p.innerRight.map(([name, ...values]) => [
    name,
    ...values.map((v, i) =>
      i % 2 === 0
        ? (p.lensGap / 2 + ((v - minX) / (maxX - minX)) * p.lensWidth) * scaleX
        : p.lensTop -
          p.lensHeight +
          ((v - minY) / (maxY - minY)) * p.lensHeight,
    ),
  ]);
  const mirror = (cs: Command[]): Command[] =>
    cs.map(([name, ...values]) => [
      name,
      ...values.map((v, i) => (i % 2 === 0 ? -v : v)),
    ]);
  const browRight = p.browRight.map(
    ([name, ...values]): Command => [
      name,
      ...values.map((v, i) => (i % 2 === 0 ? v * scaleX : v)),
    ],
  );
  const bridge = p.bridge.map(
    ([name, ...values]): Command => [
      name,
      ...values.map((v, i) => (i % 2 === 0 ? v * scaleX : v)),
    ],
  );
  return {
    right,
    left: mirror(right),
    browRight,
    browLeft: mirror(browRight),
    bridge,
    params: p,
  };
}
class EyewireCurve extends THREE.Curve<THREE.Vector3> {
  path: THREE.Path;
  params: Design;
  constructor(commands: Command[], p: Design) {
    super();
    this.path = commandPath(commands);
    this.params = p;
    this.arcLengthDivisions = 700;
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const q = this.path.getPoint(t);
    return target.set(mm(q.x), mm(q.y), mm(warp(q.x, q.y, this.params) + 0.65));
  }
}
function projectAcetateUvs(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position,
    uv = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 1000,
      y = pos.getY(i) * 1000,
      z = pos.getZ(i) * 1000;
    uv.push((x + 70) / 66 + z / 65, (y + 33) / 45 + z / 70);
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}
function templeUvs(geometry: THREE.BufferGeometry, p: Design, side: number) {
  const pos = geometry.attributes.position,
    uv = [];
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.floor(i / 20) / 100);
    uv.push(
      (t * p.templeLength) / 55 + (side > 0 ? 0.3 : 1.15),
      (pos.getY(i) * 1000) / 15 + 0.6,
    );
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}
/** Reference geometry in metres, wrapped to Forma's centimetre face/viewer contract.
 * Camera overlays use transparent clear coats instead of transmission and worn temple splay.
 */
export function buildBrowline(
  color: THREE.ColorRepresentation = BROWLINE_ACETATE,
  { overlay = false, pattern = true } = {},
): THREE.Group {
  const p = DEFAULTS,
    contours = getContours(),
    group = new THREE.Group();
  group.name = "PhotoDerived_TortoiseshellGold_Browline";
  group.userData = {
    units: "meters",
    dimensionsAreEstimated: true,
    texturePatternIsInferred: true,
    authoringDimensionsMM: {
      frontWidth: p.frontWidth,
      templeLength: p.templeLength,
      wireDiameter: p.wireDiameter,
    },
  };
  const texture = pattern ? createTortoiseshellTexture(p.textureSeed) : null;
  const acetate = new THREE.MeshPhysicalMaterial({
    color,
    map: texture,
    metalness: 0,
    roughness: p.roughness,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    ior: 1.49,
    envMapIntensity: 0.85,
  });
  acetate.name = "Tortoiseshell_Acetate_BakedPattern";
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc6a36b,
    metalness: 0.85,
    roughness: 0.22,
  });
  gold.name = "Champagne_Gold";
  const glass = overlay
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.025,
        transparent: true,
        opacity: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.025,
        transmission: 1,
        opacity: 1,
        ior: 1.5,
        thickness: mm(p.lensThickness),
        envMapIntensity: 0.4,
      });
  glass.name = "Clear_Thin_Lenses";
  const pad = overlay
    ? new THREE.MeshPhysicalMaterial({
        color: 0xfff9ec,
        roughness: 0.18,
        transparent: true,
        opacity: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
        depthWrite: false,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xfff9ec,
        roughness: 0.18,
        transmission: 0.78,
        opacity: 1,
        ior: 1.42,
        thickness: mm(1.5),
        envMapIntensity: 0.7,
      });
  pad.name = "Translucent_Nose_Pads";
  const frame = new THREE.Group();
  frame.name = "front_assembly";
  group.add(frame);
  function add(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = frame,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = material !== glass && material !== pad;
    mesh.renderOrder = material === glass || material === pad ? 2 : 1;
    parent.add(mesh);
    return mesh;
  }
  const bridge = add(
    "gold_bridge",
    extruded(contours.bridge, p, {
      depth: 1.6,
      bevel: 0.15,
      bevelThickness: 0.15,
    }),
    gold,
  );
  bridge.position.z = mm(1.0);
  for (const side of [-1, 1]) {
    const suffix = side > 0 ? "R" : "L",
      aperture = side > 0 ? contours.right : contours.left,
      brow = side > 0 ? contours.browRight : contours.browLeft;
    const browMesh = add(
      "brow_" + suffix,
      projectAcetateUvs(
        extruded(brow, p, {
          depth: p.frontDepth,
          bevel: p.bevel,
          bevelThickness: p.bevelThickness,
        }),
      ),
      acetate,
    );
    add(
      "gold_eyewire_" + suffix,
      new THREE.TubeGeometry(
        new EyewireCurve(aperture, p),
        240,
        mm(p.wireDiameter / 2),
        10,
        true,
      ),
      gold,
    );
    const cx =
        (side * (p.lensGap / 2 + p.lensWidth / 2) * p.frontWidth) /
        DEFAULTS.frontWidth,
      cy = p.lensTop - p.lensHeight / 2;
    const lens: Command[] = aperture.map(([name, ...values]) => [
      name,
      ...values.map((v, i) =>
        i % 2 === 0 ? cx + (v - cx) * 1.003 : cy + (v - cy) * 1.003,
      ),
    ]);
    add(
      "lens_" + suffix,
      extruded(lens, p, {
        depth: p.lensThickness,
        bevel: 0.1,
        bevelThickness: 0.1,
        lens: true,
        centerX: cx,
      }),
      glass,
      group,
    );
    const t = sweptTemple(p, side),
      pivot = new THREE.Group();
    pivot.name = "temple_pivot_" + suffix;
    pivot.position.copy(t.origin);
    group.add(pivot);
    if (overlay)
      pivot.rotation.y =
        -side * THREE.MathUtils.degToRad(TRYON_TEMPLE_SPLAY_DEG);
    add("temple_" + suffix, templeUvs(t.geometry, p, side), acetate, pivot);
    const rivet = add(
      "front_rivet_" + suffix,
      new THREE.SphereGeometry(1, 24, 14),
      gold,
      browMesh,
    );
    const x = (side * 65.6 * p.frontWidth) / DEFAULTS.frontWidth,
      y = 15.2;
    rivet.position.set(
      mm(x),
      mm(y),
      mm(warp(x, y, p) + p.frontDepth / 2 + 0.03),
    );
    rivet.scale.set(mm(1.65), mm(0.6), mm(0.18));
    rivet.rotation.x = -THREE.MathUtils.degToRad(p.pantoscopicTilt);
    rivet.rotation.y = side * 0.1;
    const hinge = add(
      side > 0 ? "detail.hinge.right" : "detail.hinge.left",
      new THREE.CylinderGeometry(mm(0.8), mm(0.8), mm(5.5), 16),
      gold,
    );
    hinge.position
      .copy(t.origin)
      .add(new THREE.Vector3(mm(side * 0.35), 0, mm(0.35)));
    const badge = add(
      "temple_rivet_" + suffix,
      new THREE.SphereGeometry(1, 20, 12),
      gold,
      pivot,
    );
    badge.position.set(mm(side * 2.4), mm(0), mm(-4.6));
    badge.scale.set(mm(0.18), mm(0.7), mm(1.35));
    const postPoints = [
      [11.3, 4.2, -1.8],
      [9.0, 2.2, -4.4],
      [8.9, -1.7, -6.1],
      [9.7, -4.0, -6.5],
    ].map((v) => new THREE.Vector3(mm(side * v[0]), mm(v[1]), mm(v[2])));
    add(
      "nose_post_" + suffix,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(postPoints),
        36,
        mm(0.33),
        8,
        false,
      ),
      gold,
    );
    const nosePad = add(
      "nose_pad_" + suffix,
      new THREE.SphereGeometry(1, 28, 20),
      pad,
    );
    nosePad.position.set(mm(side * 9.9), mm(-4.0), mm(-7.3));
    nosePad.scale.set(mm(2.1), mm(4.9), mm(0.85));
    nosePad.rotation.z = side * 0.2;
    nosePad.rotation.y = side * 0.25;
    const padPin = add(
      "pad_mount_" + suffix,
      new THREE.SphereGeometry(1, 18, 12),
      gold,
    );
    padPin.position.set(mm(side * 9.7), mm(-4.0), mm(-6.4));
    padPin.scale.set(mm(0.7), mm(1.05), mm(0.3));
  }
  if (overlay) group.position.z = -mm(p.frontDepth / 2);
  const wrapper = new THREE.Group();
  wrapper.name = "browline";
  wrapper.scale.setScalar(100);
  wrapper.add(group);
  return wrapper;
}
