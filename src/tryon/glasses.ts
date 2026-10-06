import * as THREE from "three";
import type { Product } from "@/lib/types";
import { buildEllis, ELLIS_ACETATE } from "./ellis";
import { buildBrowline, BROWLINE_ACETATE } from "./browline";
import {
  hasReferenceModel,
  type ReferenceModelSlug,
} from "@/lib/reference-models";

export const LENS_HEIGHT_RATIO: Record<string, number> = {
  Round: 0.9,
  Oval: 0.75,
  Rectangle: 0.7,
  Square: 0.85,
  "Cat-eye": 0.72,
  Aviator: 0.85,
  Geometric: 0.82,
  Browline: 0.72,
};
const ACETATE_RIM = 4,
  METAL_RIM = 1.5,
  MM_TO_CM = 0.1;
// Arm fit, in mm. Arms open to TEMPLE_OPEN_HALF_WIDTH (just outside an average head at the temples) by
// TEMPLE_OPEN_AT of their length, slope TEMPLE_DROP down to the ear, then bend EAR_DROP down over the last TEMPLE_BEND_LENGTH.
export const TEMPLE_OPEN_HALF_WIDTH = 80,
  TEMPLE_OPEN_AT = 0.55,
  TEMPLE_DROP = 12,
  TEMPLE_BEND_LENGTH = 28,
  EAR_DROP = 16;
const ACETATE_ARM = { height: 5.5, thickness: 2.6 },
  METAL_ARM = { height: 1.8, thickness: 1.8 };
type Outline = (width: number, height: number) => THREE.Shape;
function ellipse(width: number, height: number) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  return shape;
}
function round(width: number, height: number) {
  return ellipse(width, height);
}
function oval(width: number, height: number) {
  return ellipse(width, height);
}
function rounded(width: number, height: number, radius: number) {
  const x = width / 2,
    y = height / 2,
    r = Math.min(radius, x, y),
    shape = new THREE.Shape();
  shape.moveTo(-x + r, y);
  shape.lineTo(x - r, y);
  shape.quadraticCurveTo(x, y, x, y - r);
  shape.lineTo(x, -y + r);
  shape.quadraticCurveTo(x, -y, x - r, -y);
  shape.lineTo(-x + r, -y);
  shape.quadraticCurveTo(-x, -y, -x, -y + r);
  shape.lineTo(-x, y - r);
  shape.quadraticCurveTo(-x, y, -x + r, y);
  shape.closePath();
  return shape;
}
function rectangle(width: number, height: number) {
  return rounded(width, height, height * 0.18);
}
function square(width: number, height: number) {
  return rounded(width, height, height * 0.22);
}
function catEye(width: number, height: number) {
  const x = width / 2,
    y = height / 2,
    shape = new THREE.Shape();
  shape.moveTo(-x * 0.7, y * 0.8);
  shape.bezierCurveTo(-x * 0.2, y, x * 0.65, y, x, y * 1.16);
  shape.quadraticCurveTo(x * 1.04, y * 0.8, x * 0.95, y * 0.2);
  shape.bezierCurveTo(x * 0.9, -y * 0.8, x * 0.65, -y, x * 0.15, -y);
  shape.lineTo(-x * 0.55, -y);
  shape.quadraticCurveTo(-x, -y, -x, -y * 0.45);
  shape.lineTo(-x, y * 0.3);
  shape.quadraticCurveTo(-x, y * 0.8, -x * 0.7, y * 0.8);
  shape.closePath();
  return shape;
}
function aviator(width: number, height: number) {
  const x = width / 2,
    y = height / 2,
    shape = new THREE.Shape();
  shape.moveTo(-x * 0.65, y);
  shape.bezierCurveTo(-x * 0.1, y * 1.1, x * 0.8, y * 1.1, x, y * 0.65);
  shape.bezierCurveTo(x * 1.1, -y * 0.05, x * 0.35, -y * 0.85, -x * 0.15, -y);
  shape.bezierCurveTo(-x * 0.8, -y * 1.05, -x, -y * 0.45, -x, y * 0.2);
  shape.quadraticCurveTo(-x, y, -x * 0.65, y);
  shape.closePath();
  return shape;
}
function geometric(width: number, height: number) {
  const x = width / 2,
    y = height / 2,
    shape = new THREE.Shape(),
    points = [
      [-0.65, 1],
      [0.65, 1],
      [1, 0.5],
      [1, -0.5],
      [0.65, -1],
      [-0.65, -1],
      [-1, -0.5],
      [-1, 0.5],
    ];
  points.forEach(([px, py], i) => {
    if (i) shape.lineTo(px * x, py * y);
    else shape.moveTo(px * x, py * y);
  });
  shape.closePath();
  return shape;
}
function browline(width: number, height: number) {
  return rounded(width, height, height * 0.3);
}
const OUTLINES: Record<string, Outline> = {
  Round: round,
  Oval: oval,
  Rectangle: rectangle,
  Square: square,
  "Cat-eye": catEye,
  Aviator: aviator,
  Geometric: geometric,
  Browline: browline,
};
export function parseDimensions(dimensions: string) {
  const values = dimensions.split("·").map((value) => Number(value.trim()));
  if (
    values.length !== 3 ||
    values.some((value) => !Number.isFinite(value) || value <= 0)
  )
    throw new Error(
      "Frame dimensions must be three positive millimetre values.",
    );
  return { lens: values[0], bridge: values[1], temple: values[2] };
}

// Origin: bridge centre. Front: +Z. Arms: -Z. All geometry is mm.
export function buildGlasses(
  product: Product,
  colorIndex: number,
): THREE.Group {
  const { lens: L, bridge: B, temple: T } = parseDimensions(product.dimensions),
    H = L * (LENS_HEIGHT_RATIO[product.shape] ?? 0.7),
    outline = OUTLINES[product.shape] ?? rectangle;
  const metal = product.material === "Metal",
    mixed = product.material === "Mixed",
    rim = metal ? METAL_RIM : ACETATE_RIM,
    depth = rim;
  const color =
    product.swatches[colorIndex]?.hex ?? product.swatches[0]?.hex ?? "#161616";
  const rimMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: metal ? 0.9 : 0.1,
  });
  const armMaterial = mixed
    ? new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.9 })
    : rimMaterial;
  const lensMaterial = new THREE.MeshPhysicalMaterial({
    color: product.category === "sun" ? "#262322" : "#eef3f5",
    transparent: true,
    opacity: product.category === "sun" ? 0.75 : 0.08,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.scale.setScalar(MM_TO_CM);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    group.add(mesh);
    return mesh;
  };
  for (const side of [-1, 1]) {
    const x = side * (B / 2 + L / 2),
      y = -H / 6,
      outer = outline(L + 2 * rim, H + 2 * rim),
      inner = outline(L, H);
    outer.holes.push(new THREE.Path(inner.getPoints(48)));
    const mesh = add(
      new THREE.ExtrudeGeometry(outer, {
        depth,
        bevelEnabled: true,
        bevelThickness: metal ? 0.2 : 0.5,
        bevelSize: metal ? 0.2 : 0.5,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 32,
      }),
      rimMaterial,
    );
    mesh.position.set(x, y, -depth);
    mesh.scale.x = side;
    const lens = add(new THREE.ShapeGeometry(inner, 32), lensMaterial);
    lens.position.set(x, y, -depth * 0.45);
    lens.scale.x = side;
    lens.renderOrder = 2;
    if (product.shape === "Browline") {
      const points = outline(L + rim, H + rim)
        .getPoints(48)
        .filter((point) => point.y > H * 0.25)
        .sort((a, b) => a.x - b.x);
      const band = add(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            points.map((point) => new THREE.Vector3(point.x, point.y, 0)),
          ),
          32,
          rim * 0.85,
          8,
          false,
        ),
        rimMaterial,
      );
      band.position.set(x, y, -depth * 0.5);
      band.scale.x = side;
    }
    // Hinge: the rim's real outer edge at arm height, so it follows round and lifted (cat-eye) outlines.
    const ya = y + H * 0.28,
      edge = Math.max(
        ...outer
          .getPoints(64)
          .filter((point) => Math.abs(point.y - H * 0.28) < H * 0.12)
          .map((point) => point.x),
      ),
      hinge = B / 2 + L / 2 + edge;
    // Arm: a tube flattened across x (points pre-divided so the mesh scale restores them), so acetate reads as a flat temple.
    const open = Math.max(TEMPLE_OPEN_HALF_WIDTH - hinge, 4),
      arm = metal || mixed ? METAL_ARM : ACETATE_ARM,
      flat = arm.thickness / arm.height;
    const path = [
      [0, 0, -depth / 2],
      [open * 0.55, -1, -T * TEMPLE_OPEN_AT * 0.45],
      [open, -TEMPLE_DROP * 0.5, -T * TEMPLE_OPEN_AT],
      [open, -TEMPLE_DROP, -(T - TEMPLE_BEND_LENGTH)],
      [
        open - 2,
        -TEMPLE_DROP - EAR_DROP * 0.35,
        -(T - TEMPLE_BEND_LENGTH * 0.4),
      ],
      [open - 5, -TEMPLE_DROP - EAR_DROP, -T],
    ];
    const curve = new THREE.CatmullRomCurve3(
      path.map(
        ([px, py, pz]) =>
          new THREE.Vector3((side * (hinge + px)) / flat, ya + py, pz),
      ),
      false,
      "centripetal",
    );
    add(
      new THREE.TubeGeometry(curve, 64, arm.height / 2, 10, false),
      armMaterial,
    ).scale.x = flat;
    // End piece: a small hinge block straddling the rim edge.
    const end = add(
      new THREE.BoxGeometry(4, arm.height + 2, depth + 1),
      metal ? armMaterial : rimMaterial,
    );
    end.position.set(side * (hinge - 1), ya, -depth / 2);
  }
  const arch = [
    new THREE.Vector3(-B / 2, 0, -depth / 2),
    new THREE.Vector3(0, 3, -depth / 2),
    new THREE.Vector3(B / 2, 0, -depth / 2),
  ];
  add(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(arch),
      20,
      metal || mixed ? 0.8 : 1.8,
      8,
      false,
    ),
    armMaterial,
  );
  return group;
}

// Frames with a reference reconstruction use it everywhere; the rest fall back to the generated outline.
const REFERENCE_MODELS: Record<
  ReferenceModelSlug,
  (
    color: THREE.ColorRepresentation,
    options: { overlay?: boolean },
  ) => THREE.Group
> = {
  "the-ellis": buildEllis,
  "the-felix": (color, options) =>
    buildBrowline(color, { ...options, pattern: color === BROWLINE_ACETATE }),
};
const referenceColor = (product: Product, colorIndex: number) => {
  if (product.slug === "the-felix")
    return product.colors[colorIndex] === "Chestnut"
      ? BROWLINE_ACETATE
      : (product.swatches[colorIndex]?.hex ?? "#737373");
  return product.colors?.[colorIndex] !== "Ink black"
    ? (product.swatches[colorIndex]?.hex ?? ELLIS_ACETATE)
    : ELLIS_ACETATE;
};
export function buildOverlayGlasses(
  product: Product,
  colorIndex: number,
): THREE.Group {
  const reference = hasReferenceModel(product.slug)
    ? REFERENCE_MODELS[product.slug]
    : undefined;
  return reference
    ? reference(referenceColor(product, colorIndex), { overlay: true })
    : buildGlasses(product, colorIndex);
}
export function buildDisplayGlasses(
  product: Product,
  colorIndex: number,
): THREE.Group {
  const reference = hasReferenceModel(product.slug)
    ? REFERENCE_MODELS[product.slug]
    : undefined;
  if (reference) return reference(referenceColor(product, colorIndex), {});
  const group = buildGlasses(product, colorIndex),
    polished = new Map<
      THREE.MeshStandardMaterial,
      THREE.MeshPhysicalMaterial
    >();
  group.traverse((node) => {
    if (
      !(node instanceof THREE.Mesh) ||
      !(node.material instanceof THREE.MeshStandardMaterial) ||
      node.material instanceof THREE.MeshPhysicalMaterial
    )
      return;
    const original = node.material;
    let material = polished.get(original);
    if (!material) {
      material = new THREE.MeshPhysicalMaterial({
        color: original.color,
        roughness: 0.23,
        metalness: original.metalness,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      });
      polished.set(original, material);
    }
    node.material = material;
  });
  polished.forEach((_, original) => original.dispose());
  return group;
}
