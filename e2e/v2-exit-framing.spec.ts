import { test, expect, type Page } from "@playwright/test";
import type * as THREE from "three";
import type { gsap } from "gsap";

// Measure the actual camera and scene used by WebGLRenderer. Rebuilding a
// parallel camera in the test would merely confirm the same erroneous maths.
type ExitWindow = Window & {
  exitFrame?: { scene: THREE.Scene; camera: THREE.PerspectiveCamera };
  exitTimeline?: gsap.core.Timeline;
  exitCopyBase?: { fontSize: number; anchors: { x: number; y: number }[] };
};

test.use({
  hasTouch: true,
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

async function observeRenderer(page: Page) {
  await page.evaluate(async () => {
    const threePath = "/node_modules/.vite/deps/three.js";
    const gsapPath = "/node_modules/.vite/deps/gsap.js";
    const three = await import(threePath) as typeof THREE;
    const { gsap } = await import(gsapPath) as typeof import("gsap");
    const state = window as ExitWindow;
    let measuredScene: THREE.Scene | undefined;
    let measuredCamera: THREE.PerspectiveCamera | undefined;
    // WebGLRenderer.render is an instance closure in this Three version.
    // Observe its real scene/camera matrix updates instead of a prototype hook.
    const update = three.Object3D.prototype.updateMatrixWorld;
    three.Object3D.prototype.updateMatrixWorld = function (force) {
      update.call(this, force);
      if ((this as THREE.Scene).isScene && this.getObjectByName("ellis.reference"))
        measuredScene = this as THREE.Scene;
      if ((this as THREE.PerspectiveCamera).isPerspectiveCamera && (this as THREE.PerspectiveCamera).far !== 1000)
        measuredCamera = this as THREE.PerspectiveCamera;
      if (measuredScene && measuredCamera)
        state.exitFrame = { scene: measuredScene, camera: measuredCamera };
    };
    state.exitTimeline = gsap.globalTimeline.getChildren().find(
      child => child instanceof gsap.core.Timeline && child.paused() && child.duration() === 5,
    ) as gsap.core.Timeline;
    if (!state.exitTimeline) throw Error("Missing V2 paused timeline");
  });
}

async function seek(page: Page, u: number) {
  await page.evaluate(u => {
    document.querySelector(".v2-demo-stage")!.setAttribute("data-moving", "true");
    (window as ExitWindow).exitTimeline!.time(4 + u, false);
  }, u);
}

async function metrics(page: Page) {
  return page.evaluate(async () => {
    const threePath = "/node_modules/.vite/deps/three.js";
    const three = await import(threePath) as typeof THREE;
    const { scene, camera } = (window as ExitWindow).exitFrame!;
    const model = scene.getObjectByName("ellis.reference")!;
    const canvas = document.querySelector(".v2-demo-stage canvas")!;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const copy = document.querySelector<HTMLElement>(".v2-demo-finale")!;
    const copyStyle = getComputedStyle(copy);
    const copyMatrix = new DOMMatrixReadOnly(copyStyle.transform);
    const fontSize = parseFloat(getComputedStyle(copy.querySelector("h2")!).fontSize);
    const base = (window as ExitWindow).exitCopyBase!;
    const fontScale = fontSize / base.fontSize;
    const lines = [...copy.querySelectorAll("h2 span")].map(line => line.getBoundingClientRect());
    const anchors = [{ x: lines[0].left, y: lines[0].bottom }, { x: lines[1].right, y: lines[1].top }];
    const anchorErrorPx = Math.max(...anchors.flatMap((anchor, i) => [
      Math.abs(anchor.x - (width / 2 + (base.anchors[i].x - width / 2) * fontScale)),
      Math.abs(anchor.y - (height / 2 + (base.anchors[i].y - height / 2) * fontScale)),
    ]));
    const project = (p: THREE.Vector3) => {
      p.project(camera);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
    };
    const localLens = JSON.parse(document.querySelector<HTMLElement>(".v2-demo-stage")!.dataset.exitPoint!);
    const centre = model.localToWorld(new three.Vector3(0, localLens[1], localLens[2]));
    const offset = camera.position.clone().sub(centre);
    const radius = Math.hypot(offset.x, offset.z);
    const hinges = ["detail.hinge.left", "detail.hinge.right"].map(name =>
      project(model.getObjectByName(name)!.getWorldPosition(new three.Vector3())));
    const frame = model.getObjectByName("front_frame") as THREE.Mesh;
    const glass = (model.getObjectByName("lens_R") as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
    const p = frame.geometry.attributes.position;
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let i = 0; i < p.count; i++) {
      const pixel = project(new three.Vector3().fromBufferAttribute(p, i).applyMatrix4(frame.matrixWorld));
      box.minX = Math.min(box.minX, pixel.x); box.maxX = Math.max(box.maxX, pixel.x);
      box.minY = Math.min(box.minY, pixel.y); box.maxY = Math.max(box.maxY, pixel.y);
    }
    return {
      width, height, centre: project(centre), box,
      hingeLevelErrorPx: Math.abs(hinges[0].y - hinges[1].y),
      hingeCentreErrorPx: Math.abs((hinges[0].x + hinges[1].x) / 2 - width / 2),
      horizonRollY: camera.matrixWorld.elements[1],
      radius, viewSpan: radius * Math.tan(three.MathUtils.degToRad(camera.fov / 2)),
      copy: {
        opacity: Number(copyStyle.opacity), fontScale, anchorErrorPx,
        rotateX: copyMatrix.b, rotateY: copyMatrix.c, transform: copyStyle.transform,
      },
      glass: { opacity: glass.opacity, transmission: glass.transmission, transparent: glass.transparent,
        depthWrite: glass.depthWrite, color: glass.color.getHexString(), roughness: glass.roughness },
    };
  });
}

async function inkBounds(page: Page, png: Buffer, box: Awaited<ReturnType<typeof metrics>>["box"]) {
  // Pixel verification of the captured rims, in addition to projection checks.
  // Decode in a detached 2D canvas using the browser; no image dependency.
  return page.evaluate(async ({ data, box }) => {
    const image = new Image();
    image.src = "data:image/png;base64," + data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let minX = Infinity, maxX = -Infinity;
    const halves = [{ minY: Infinity, maxY: -Infinity }, { minY: Infinity, maxY: -Infinity }];
    for (let y = Math.max(0, Math.floor(box.minY)); y <= Math.min(image.height - 1, Math.ceil(box.maxY)); y++) {
      for (let x = Math.max(0, Math.floor(box.minX)); x <= Math.min(image.width - 1, Math.ceil(box.maxX)); x++) {
        const i = (y * image.width + x) * 4;
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) >= 80) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        const half = halves[Number(x >= image.width / 2)];
        half.minY = Math.min(half.minY, y); half.maxY = Math.max(half.maxY, y);
      }
    }
    return {
      centreErrorPx: Math.abs((minX + maxX + 1) / 2 - image.width / 2),
      topLevelErrorPx: Math.abs(halves[0].minY - halves[1].minY),
      bottomLevelErrorPx: Math.abs(halves[0].maxY - halves[1].maxY),
    };
  }, { data: png.toString("base64"), box });
}

for (const [name, width, height] of [
  ["desktop", 1920, 945], ["reference", 1808, 931], ["mobile", 375, 812],
] as const) {
  test(`wearer framing is centred and straight, with simultaneous approach — ${name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.route("**/api/**", route => route.fulfill({ status: 502, body: "offline" }));
    await page.goto("/");
    const stage = page.locator(".v2-demo-stage");
    await expect(stage).toHaveAttribute("data-angle", "0", { timeout: 30_000 });
    await observeRenderer(page);
    await page.keyboard.press("End");
    await expect(stage).toHaveAttribute("data-angle", "4", { timeout: 30_000 });
    await expect(stage).not.toHaveAttribute("data-moving");
    await page.evaluate(() => {
      const copy = document.querySelector(".v2-demo-finale")!;
      const lines = [...copy.querySelectorAll("h2 span")].map(line => line.getBoundingClientRect());
      (window as ExitWindow).exitCopyBase = {
        fontSize: parseFloat(getComputedStyle(copy.querySelector("h2")!).fontSize),
        anchors: [{ x: lines[0].left, y: lines[0].bottom }, { x: lines[1].right, y: lines[1].top }],
      };
    });
    const samples: { u: number; radius: number; viewSpan: number }[] = [];
    let previousCopyScale = 1;
    let baseGlass: Awaited<ReturnType<typeof metrics>>["glass"] | undefined;
    for (const u of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35]) {
      await seek(page, u);
      const measured = await metrics(page);
      baseGlass ??= measured.glass;
      expect(measured.glass).toEqual(baseGlass);
      expect(Math.abs(measured.centre.x - width / 2)).toBeLessThan(0.5);
      expect(Math.abs(measured.centre.y - height / 2)).toBeLessThan(0.5);
      expect(Math.abs(measured.horizonRollY)).toBeLessThan(1e-9);
      expect(measured.copy.opacity).toBe(1);
      expect(measured.copy.fontScale).toBeGreaterThan(previousCopyScale);
      expect(measured.copy.anchorErrorPx).toBeLessThan(1);
      expect(measured.copy.rotateX).toBe(0);
      expect(measured.copy.rotateY).toBe(0);
      expect(measured.copy.transform).toBe("none");
      previousCopyScale = measured.copy.fontScale;
      const previous = samples.at(-1);
      if (previous) {
        expect(measured.radius).toBeLessThan(previous.radius);
        expect(measured.viewSpan).toBeLessThan(previous.viewSpan);
      }
      samples.push({ u, radius: measured.radius, viewSpan: measured.viewSpan });
    }
    const straight = [];
    const composites = new Map<number, Buffer>();
    for (const u of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35]) {
      await seek(page, u);
      const measured = await metrics(page);
      expect(measured.glass).toEqual(baseGlass);
      expect(Math.abs(measured.centre.x - width / 2)).toBeLessThan(0.5);
      expect(Math.abs(measured.centre.y - height / 2)).toBeLessThan(0.5);
      expect(measured.hingeLevelErrorPx).toBeLessThan(0.5);
      expect(measured.hingeCentreErrorPx).toBeLessThan(0.5);
      expect(measured.copy.opacity).toBe(1);
      expect(measured.copy.anchorErrorPx).toBeLessThan(1);
      const composite = await stage.screenshot();
      if (u === 0.4 || u === 0.65) {
        const previous = composites.get(u);
        if (previous) expect(composite.equals(previous), `full composite restores at u=${u}`).toBe(true);
        else composites.set(u, composite);
      }
      // Isolate 3D ink for this pixel measurement so the enlarging black
      // headline cannot be mistaken for a rim. Copy is measured above, and
      // the review captures retain the full composite with visible text.
      const screenshot = await stage.screenshot({
        style: ".v2-demo-finale { visibility: hidden !important; }",
      });
      const ink = await inkBounds(page, screenshot, measured.box);
      expect(ink.centreErrorPx).toBeLessThanOrEqual(1);
      expect(ink.topLevelErrorPx).toBeLessThanOrEqual(1);
      expect(ink.bottomLevelErrorPx).toBeLessThanOrEqual(1);
      straight.push({ u, hingeCentreErrorPx: measured.hingeCentreErrorPx, hingeLevelErrorPx: measured.hingeLevelErrorPx, ink });
      await testInfo.attach(`${name}-straight-${u}`, { body: screenshot, contentType: "image/png" });
    }
    // Include return from the largest text size at the paper endpoint. This
    // catches stale text raster tiles that do not appear on a short reversal.
    await seek(page, 1);
    for (const u of [0.65, 0.4]) {
      await seek(page, u);
      expect((await stage.screenshot()).equals(composites.get(u)!)).toBe(true);
    }
    await testInfo.attach("framing-measurements", {
      body: JSON.stringify({ samples, straight }, null, 2), contentType: "application/json",
    });
    console.log(JSON.stringify({ viewport: [width, height], samples, straight }));
  });

  if (name !== "reference") test(`reverse exit wheel returns to Front before the preceding angle — ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/api/**", route => route.fulfill({ status: 502, body: "offline" }));
    await page.goto("/");
    const stage = page.locator(".v2-demo-stage");
    await expect(stage).toHaveAttribute("data-angle", "0", { timeout: 30_000 });
    await page.keyboard.press("End");
    await expect(stage).toHaveAttribute("data-angle", "4", { timeout: 30_000 });
    await expect(stage).not.toHaveAttribute("data-moving");
    await page.waitForTimeout(220);
    // Reverse the same consumed notch while its forward exit is running.
    await page.mouse.wheel(0, 120);
    await expect.poll(() => stage.getAttribute("data-exit").then(Number)).toBeGreaterThan(0.01);
    expect(Number(await stage.getAttribute("data-motion-duration"))).toBeGreaterThanOrEqual(2.8);
    await page.mouse.wheel(0, -120);
    await expect(stage).not.toHaveAttribute("data-moving", { timeout: 10_000 });
    await expect(stage).toHaveAttribute("data-angle", "4");
    await expect(stage).not.toHaveAttribute("data-exit");
    // Now reverse a fresh notch during return from a slow touch scrub. Its target
    // is already 4, which previously made target - 1 skip directly to 3.
    await page.waitForTimeout(220);
    const cdp = await page.context().newCDPSession(page);
    const x = width / 2, y = height * 0.8;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let n = 1; n <= 8; n++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x, y: y - n * height * 0.02 }],
      });
      await page.waitForTimeout(30);
    }
    await expect(stage).toHaveAttribute("data-exit", /.+/);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.mouse.wheel(0, -120);
    await expect(stage).not.toHaveAttribute("data-moving", { timeout: 10_000 });
    await expect(stage).toHaveAttribute("data-angle", "4");
    await expect(stage).not.toHaveAttribute("data-exit");
    await expect(stage.locator(".v2-demo-finale")).toHaveCSS("opacity", "1");
    await expect(stage.locator(".v2-demo-finale")).toHaveCSS("--finale-scale", "1");
    await expect(page.getByRole("heading", { name: "We couldn’t open the store" })).toHaveCount(0);
    // A later deliberate reverse gesture can still leave Front normally.
    await page.waitForTimeout(220);
    await page.mouse.wheel(0, -120);
    await expect(stage).toHaveAttribute("data-angle", "3", { timeout: 30_000 });
    await expect(stage).not.toHaveAttribute("data-moving");
  });
}
