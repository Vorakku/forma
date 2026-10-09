import { test, expect, type Page } from "@playwright/test";
import { SCROLL_ANGLES } from "../src/tryon/scroll-poses";

test.use({
  viewport: { width: 1808, height: 1018 },
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

async function ready(page: Page) {
  const stage = page.locator(".v2-demo-stage");
  await expect(stage).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(stage.locator("canvas")).toBeVisible();
  const lines = stage.locator(".v2-demo-lines");
  await expect(lines).toHaveCount(1);
  await expect(lines).toHaveAttribute("aria-hidden", "true");
  await expect(lines).toHaveAttribute("focusable", "false");
  expect(await stage.evaluate((element) => {
    const studio = element.querySelector(".v2-demo-studio")!;
    const lines = element.querySelector(".v2-demo-lines")!;
    const sheet = element.querySelector(".v2-demo-sheet")!;
    const canvas = element.querySelector("canvas")!;
    return [
      studio.nextElementSibling === lines,
      lines.nextElementSibling === sheet,
      !!(lines.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING),
    ];
  })).toEqual([true, true, true]);
  await expect(stage).toHaveAttribute("data-angle", "0");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  return stage;
}
async function landed(page: Page, angle: number) {
  const stage = page.locator(".v2-demo-stage");
  await expect(stage).toHaveAttribute("data-angle", String(angle), {
    timeout: 30_000,
  });
  await expect(stage).not.toHaveAttribute("data-moving");
  await expect(page.locator("html")).toHaveAttribute(
    "data-mode",
    SCROLL_ANGLES[angle].blueprint ? "blueprint" : "studio",
  );
  await expect(stage).toHaveAttribute(
    "data-explode",
    SCROLL_ANGLES[angle].exploded ? "1" : "0",
  );
  await expect(stage.locator('[aria-live="polite"]')).toHaveText(
    `Angle ${angle + 1} of ${SCROLL_ANGLES.length}: ${SCROLL_ANGLES[angle].name}${SCROLL_ANGLES[angle].exploded ? ", taken apart" : ""}${SCROLL_ANGLES[angle].blueprint ? ", blueprint" : ""}`,
  );
}
async function capture(page: Page, angle: number) {
  return page
    .locator(".v2-demo-stage")
    .screenshot(
      process.env.CAPTURE_SCREENSHOTS === "1"
        ? { path: `/tmp/forma-v2-angle-${angle}.png` }
        : {},
    );
}

test("navbar fades on arrival, reveals near the top at every angle and supports keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  await ready(page);
  const header = page.locator(".site-header");
  await expect(header).toHaveCSS("opacity", "0");
  await expect(header).toHaveCSS("pointer-events", "none");
  for (let angle = 0; angle < SCROLL_ANGLES.length; angle++) {
    if (angle) await page.keyboard.press("ArrowDown");
    await landed(page, angle);
    if (angle === SCROLL_ANGLES.length - 1) {
      await expect(page.locator(".finale-cta")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Shop The Ellis" })).toHaveCount(0);
    }
    const height = (await header.boundingBox())!.height;
    await page.mouse.move(900, height + 16);
    await expect(header).toHaveCSS("opacity", "1");
    await page.mouse.move(900, height - 16);
    await expect(header).toHaveCSS("pointer-events", "auto");
    await page.mouse.move(900, 600);
    await expect(header).toHaveCSS("opacity", "0");
  }
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(header).toHaveCSS("opacity", "1");
  await expect(page.getByRole("link", { name: "A better way to see" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/guide$/);
  await expect(header).toHaveCSS("opacity", "1");
  await expect(header).toHaveCSS("pointer-events", "auto");
});

test("cold arrival, one notch/burst per angle, integer landings, keys and navigation cleanup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const productResponse = page.waitForResponse((response) =>
    response.url().endsWith("/products/the-ellis"),
  );
  await page.goto("/v2-demo");
  expect((await productResponse).ok()).toBeTruthy();
  const stage = await ready(page);
  await expect(stage.locator("canvas")).toHaveAttribute("role", "img");
  await expect(stage.locator("canvas")).not.toHaveAttribute("tabindex", "0");
  const header = page.locator(".site-header");
  await expect(header).toHaveCSS("opacity", "0");
  expect((await stage.boundingBox())!.y).toBe(0);
  expect((await stage.boundingBox())!.height).toBe(1018);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    ),
  ).toBeLessThanOrEqual(1);
  const captures = [await capture(page, 0)];
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 100);
  await landed(page, 1);
  await expect(header).toHaveCSS("opacity", "0");
  captures.push(await capture(page, 1));
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await stage.screenshot({ path: "/tmp/forma-v2-angle-1-exploded.png" });
  for (let index = 2; index < SCROLL_ANGLES.length; index++) {
    // Queue the native burst together. Awaiting each dispatch can let software
    // rendering insert >180 ms gaps, which correctly become separate gestures.
    await Promise.all(
      Array.from({ length: 10 }, () => page.mouse.wheel(0, 100)),
    );
    await landed(page, index);
    captures.push(await capture(page, index));
    if (index < SCROLL_ANGLES.length - 1) await expect(header).toHaveCSS("opacity", "0");
  }
  for (let n = 1; n < captures.length; n++)
    expect(captures[n].equals(captures[n - 1])).toBeFalsy();
  await expect(header).toHaveCSS("opacity", "0");
  await expect(page.locator(".site-footer")).toHaveCount(0);
  await page.keyboard.press("Home");
  await landed(page, 0);
  // Navigation leaves focus on a link; arrows must still work there.
  await page.keyboard.press("ArrowDown");
  await landed(page, 1);
  await page.keyboard.press("End");
  await landed(page, SCROLL_ANGLES.length - 1);
  await page.mouse.move(900, 20);
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
  await page
    .getByRole("link", { name: "All eyewear", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(header).toBeVisible();
  await expect(page.locator(".site-footer")).toHaveCount(1);
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole("link", { name: "FORMA V2 DEMO", exact: true })
    .first()
    .click();
  await ready(page);
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 100);
  await landed(page, 1);
  await page.setViewportSize({ width: 375, height: 812 });
  await landed(page, 1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    ),
  ).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("slow wheel scrub has an intermediate pose and settles on idle", async ({
  page,
}) => {
  await page.goto("/v2-demo");
  await ready(page);
  const start = await page.locator(".v2-demo-stage").screenshot();
  await page.mouse.move(900, 600);
  for (let n = 0; n < 16; n++) {
    await page.mouse.wheel(0, 4);
    await page.waitForTimeout(30);
  }
  await expect(page.locator(".v2-demo-stage")).toHaveAttribute(
    "data-moving",
    "true",
  );
  await expect(page.locator(".v2-demo-stage")).toHaveAttribute(
    "data-angle",
    "0",
  );
  const middle = await page.locator(".v2-demo-stage").screenshot();
  expect(middle.equals(start)).toBeFalsy();
  await landed(page, 1);
  expect(
    middle.equals(await page.locator(".v2-demo-stage").screenshot()),
  ).toBeFalsy();
});

test("cart drawer retains wheel scrolling; ignored wheel and focused controls keep defaults", async ({
  page,
}) => {
  await page.goto("/v2-demo");
  const stage = await ready(page);
  const ignored = await page.evaluate(() => {
    return [
      new WheelEvent("wheel", {
        deltaY: 100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
      new WheelEvent("wheel", {
        deltaY: 100,
        deltaX: 200,
        bubbles: true,
        cancelable: true,
      }),
    ].map((event) => {
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(ignored).toEqual([false, false]);
  // Check actual focused fields/links as well as the controller's synthetic cases.
  const defaults = await page.evaluate(() => {
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(arrow);
    field.remove();
    const link = document.querySelector<HTMLAnchorElement>(".wordmark")!;
    link.focus();
    const space = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(space);
    link.blur();
    return [arrow.defaultPrevented, space.defaultPrevented];
  });
  expect(defaults).toEqual([false, false]);
  await page.mouse.move(900, 20);
  await page.getByRole("button", { name: /Shopping bag/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // Empty bag has no natural overflow. Give its existing scroll surface overflow
  // so this tests native wheel handling without unrelated cart mutations.
  const surface = drawer.locator(".modal-body");
  await surface.evaluate((element) => {
    const content = document.createElement("div");
    content.style.height = "2000px";
    element.append(content);
  });
  await surface.hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => surface.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(stage).toHaveAttribute("data-angle", "0");
  await drawer.getByRole("button", { name: "Close dialog" }).click();
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 100);
  await landed(page, 1);
});

test("reduced motion cuts synchronously once per gesture and changes live", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  await stage.evaluate((element) => {
    (window as typeof window & { movingMutations: number }).movingMutations = 0;
    new MutationObserver((records) => {
      (window as typeof window & { movingMutations: number }).movingMutations +=
        records.length;
    }).observe(element, { attributes: true, attributeFilter: ["data-moving"] });
  });
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 100);
  await expect(stage).toHaveAttribute("data-angle", "1");
  await expect(stage).not.toHaveAttribute("data-moving");
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { movingMutations: number }).movingMutations,
    ),
  ).toBe(0);
  const still = await stage.screenshot();
  await page.waitForTimeout(200);
  expect((await stage.screenshot()).equals(still)).toBeTruthy();
  await landed(page, 1);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(250);
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 100);
  await expect(stage).toHaveAttribute("data-moving", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await landed(page, 2);
  await page.keyboard.press("End");
  await landed(page, SCROLL_ANGLES.length - 1);
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "0");
});

test("context loss in blueprint restores the header, removes root state and stops input handling", async ({
  page,
}) => {
  await page.goto("/v2-demo");
  const stage = await ready(page);
  await page.keyboard.press("ArrowDown");
  await landed(page, 1);
  await page.keyboard.press("ArrowDown");
  await landed(page, 2);
  await stage
    .locator("canvas")
    .evaluate((element) =>
      element.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
  await expect(stage.getByText("The 3D view is unavailable.")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-mode");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-blueprint-theme",
  );
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--blueprint-mix"),
    ),
  ).toBe("");
  await expect(
    stage.getByRole("link", { name: "Explore The Ellis" }),
  ).toHaveAttribute("href", "/product/the-ellis");
  await expect(page.locator(".site-header")).toBeVisible();
  await expect(page.locator(".site-footer")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const event = new WheelEvent("wheel", {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBeFalsy();
  expect(
    await page.evaluate(() => document.documentElement.style.overflow),
  ).toBe("");
});

test("missing Ellis keeps the collection fallback", async ({ page }) => {
  await page.route(/\/api\/store\/products\?/, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.items = data.items.filter(
      (item: { slug: string }) => item.slug !== "the-ellis",
    );
    await route.fulfill({ response, json: data });
  });
  await page.route("**/api/store/products/the-ellis", (route) =>
    route.fulfill({ status: 404, json: { error: "Product not found" } }),
  );
  await page.goto("/v2-demo");
  await expect(page.getByText("This frame is unavailable.")).toBeVisible();
  await expect(
    page
      .locator(".v2-demo-stage")
      .getByRole("link", { name: "Browse the collection" }),
  ).toHaveAttribute("href", "/catalog");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
});

test("server down shows only the V2 scroll, without the shell", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 502, body: "" }),
  );
  await page.goto("/catalog");
  const stage = await ready(page);
  await expect(page.locator(".site-header")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByText("We couldn’t open the store")).toHaveCount(0);
  await expect(page).toHaveTitle("FORMA V2 Demo — FORMA");
  expect((await stage.boundingBox())!.y).toBe(0);
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 100);
  await landed(page, 1);
});

test("real CDP touch drag holds a scrub then lands on release; header touch remains a link", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 812 },
    baseURL: "http://localhost:4176",
  });
  const page = await context.newPage();
  try {
    await page.goto("/v2-demo");
    const stage = await ready(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 600 }],
    });
    for (let n = 1; n <= 10; n++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y: 600 - n * 12 }],
      });
      await page.waitForTimeout(40);
    }
    await expect(stage).toHaveAttribute("data-moving", "true");
    await page.waitForTimeout(250);
    await expect(stage).toHaveAttribute("data-angle", "0");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await landed(page, 1);
    await page.keyboard.press("ArrowDown");
    await landed(page, 2);
    await page.getByRole("button", { name: "Blue blueprint" }).tap();
    await expect(page.locator("html")).toHaveAttribute(
      "data-blueprint-theme",
      "blue",
    );
    await expect(
      page.getByRole("button", { name: "Blue blueprint" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(stage).not.toHaveAttribute("data-moving");
    await landed(page, 2);
    await page.keyboard.press("Home");
    await landed(page, 0);
    await page.getByRole("link", { name: "FORMA home" }).tap();
    await expect(page).toHaveURL("http://localhost:4176/");
  } finally {
    await context.close();
  }
});

test("assembly steps 0 → 1 → 2 → 1 → 0 in both directions without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/v2-demo");
  await ready(page);
  await page.mouse.move(900, 600);
  for (const [delta, angle] of [
    [100, 1],
    [100, 2],
    [-100, 1],
    [-100, 0],
  ]) {
    await page.mouse.wheel(0, delta);
    await landed(page, angle);
  }
  expect(errors).toEqual([]);
});

test("blueprint swatches use keyboard toggles, persist Blue, and remove root state on navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  const control = page.getByRole("group", {
    name: "Blueprint theme",
    includeHidden: true,
  });
  const blue = page.getByRole("button", {
    name: "Blue blueprint",
    includeHidden: true,
  });
  const ink = page.getByRole("button", {
    name: "Ink blueprint",
    includeHidden: true,
  });
  await expect(control).toBeHidden();
  expect(
    await blue.evaluate((button) => {
      button.focus();
      return document.activeElement === button;
    }),
  ).toBeFalsy();
  await page.keyboard.press("ArrowDown");
  await landed(page, 1);
  await expect(control).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await landed(page, 2);
  await expect(control).toBeVisible();
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "0");
  await expect(ink).toHaveAttribute("aria-pressed", "true");
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await stage.screenshot({ path: "/tmp/forma-v2-blueprint-ink.png" });
  await blue.focus();
  await page.keyboard.press("Space");
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await expect(ink).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute(
    "data-blueprint-theme",
    "blue",
  );
  await page.waitForTimeout(250);
  await landed(page, 2);
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await stage.screenshot({ path: "/tmp/forma-v2-blueprint-blue.png" });
  expect(
    await page.evaluate(() => localStorage.getItem("forma.v2.blueprintTheme")),
  ).toBe("blue");
  // Wheel over a focused swatch still steps; Space only activates the button.
  await blue.hover();
  await page.mouse.wheel(0, 100);
  await landed(page, 3);
  await expect(control).toBeHidden();
  await page.reload();
  await ready(page);
  await page.keyboard.press("ArrowDown");
  await landed(page, 1);
  await page.keyboard.press("ArrowDown");
  await landed(page, 2);
  await expect(blue).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-blueprint-theme",
    "blue",
  );
  await page.keyboard.press("End");
  await landed(page, SCROLL_ANGLES.length - 1);
  await page.mouse.move(900, 20);
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
  await page
    .getByRole("link", { name: "All eyewear", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-mode");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-blueprint-theme",
  );
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--blueprint-mix"),
    ),
  ).toBe("");
  expect(errors).toEqual([]);
});

test("reduced motion cuts straight into and out of blueprint with instant theme changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  for (const angle of [1, 2]) {
    await page.keyboard.press("ArrowDown");
    await landed(page, angle);
  }
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--blueprint-mix"),
    ),
  ).toBe("1");
  await page.getByRole("button", { name: "Blue blueprint" }).click();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--blueprint-fill")
        .trim(),
    ),
  ).toBe("#1e4963");
  await expect(stage).not.toHaveAttribute("data-moving");
  await page.keyboard.press("ArrowDown");
  await landed(page, 3);
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--blueprint-mix"),
    ),
  ).toBe("0");
  await page.keyboard.press("ArrowUp");
  await landed(page, 2);
  expect(errors).toEqual([]);
});

test.describe("motion stopwatch", () => {
  test("every single step lands within ten percent of its live stage motion budget", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    for (const viewport of [
      { width: 1808, height: 1018 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/v2-demo");
      const stage = await ready(page);
      // Compile every real render state before measuring steady-state pacing.
      // Cold loading/navigation is covered separately above.
      for (let angle = 1; angle < SCROLL_ANGLES.length; angle++) {
        await page.keyboard.press("ArrowDown");
        await landed(page, angle);
      }
      for (let angle = SCROLL_ANGLES.length - 2; angle >= 0; angle--) {
        await page.keyboard.press("ArrowUp");
        await landed(page, angle);
      }
      await stage.evaluate((element) => {
        let started: number | undefined;
        let lastFrame = performance.now();
        let longestFrame = 0;
        const measurements: {
          seconds: number;
          budget: number;
          longestFrame: number;
        }[] = [];
        // A step can only land on a rendered frame, so record the longest frame
        // gap while it runs; software WebGL is slowest in the hinge close-up.
        const frame = (now: number) => {
          if (started !== undefined)
            longestFrame = Math.max(longestFrame, (now - lastFrame) / 1000);
          lastFrame = now;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        (
          window as typeof window & { stepMeasurements: typeof measurements }
        ).stepMeasurements = measurements;
        new MutationObserver(() => {
          if (element.hasAttribute("data-moving")) {
            if (started === undefined) longestFrame = 0;
            started ??= performance.now();
          } else if (started !== undefined) {
            measurements.push({
              seconds: (performance.now() - started) / 1000,
              budget: Number((element as HTMLElement).dataset.motionDuration),
              longestFrame,
            });
            started = undefined;
          }
        }).observe(element, {
          attributes: true,
          attributeFilter: ["data-moving"],
        });
      });
      for (let angle = 1; angle < SCROLL_ANGLES.length; angle++) {
        await page.keyboard.press("ArrowDown");
        await landed(page, angle);
      }
      for (let angle = SCROLL_ANGLES.length - 2; angle >= 0; angle--) {
        await page.keyboard.press("ArrowUp");
        await landed(page, angle);
      }
      const measurements = await page.evaluate(
        () =>
          (
            window as typeof window & {
              stepMeasurements: {
                seconds: number;
                budget: number;
                longestFrame: number;
              }[];
            }
          ).stepMeasurements,
      );
      console.log(
        JSON.stringify({ viewport, deviceScaleFactor: 1, measurements }),
      );
      expect(measurements).toHaveLength(2 * (SCROLL_ANGLES.length - 1));
      for (const measurement of measurements) {
        const detail = JSON.stringify({ viewport, ...measurement });
        expect(measurement.seconds, detail).toBeGreaterThanOrEqual(
          measurement.budget * 0.9,
        );
        // Ten percent, plus at most one frame of landing granularity.
        expect(measurement.seconds, detail).toBeLessThanOrEqual(
          measurement.budget * 1.1 + measurement.longestFrame,
        );
      }
    }
    expect(errors).toEqual([]);
  });
});

test("finale exits online to a usable home Shell and reveals only once", async ({ page }) => {
  await page.goto("/v2-demo");
  await ready(page);
  await page.keyboard.press("End");
  await landed(page, 4);
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/$/);
  const heading = page.locator("main h1").first();
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.locator(".site-header")).toBeVisible();
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
  const wrapper = page.locator(".exit-reveal-content");
  await expect(wrapper).toHaveCSS("filter", "none");
  await expect(wrapper).toHaveCSS("transform", "none");
  await expect(wrapper).toHaveCSS("will-change", "auto");
  await expect(page.locator(".exit-reveal-paper")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state.usr)).toBeNull();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.reload();
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator(".exit-reveal-paper")).toHaveCount(0);
  await page.goBack();
  await ready(page);
});

test("offline finale reveals and focuses StoreUnavailable; retry stays there", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 502, body: "offline" }));
  await page.goto("/");
  await ready(page);
  await page.keyboard.press("End");
  await landed(page, 4);
  await page.keyboard.press("ArrowDown");
  const heading = page.getByRole("heading", { name: "We couldn’t open the store" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.locator(".exit-reveal-content")).toHaveCSS("filter", "none");
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Tab");
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(heading).toBeVisible();
  await expect(page.locator(".v2-demo-stage")).toHaveCount(0);
  await expect(page.locator(".exit-reveal-paper")).toHaveCount(0);
});

test("reduced-motion finale completes both paper hold and reveal in under 0.6 seconds", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => route.fulfill({ status: 502, body: "offline" }));
  await page.goto("/");
  await ready(page);
  await page.keyboard.press("End");
  await landed(page, 4);
  // Wait for the on-demand Front frame before timing the exit; software WebGL
  // can otherwise spend longer than the fades rendering the preceding cut.
  await page.locator(".v2-demo-stage").screenshot();
  await page.evaluate(() => {
    const start = performance.now();
    (window as typeof window & { exitElapsed?: number }).exitElapsed = undefined;
    new MutationObserver((_, observer) => {
      const content = document.querySelector(".exit-reveal-content");
      if (content && !content.classList.contains("is-revealing")) {
        (window as typeof window & { exitElapsed?: number }).exitElapsed = performance.now() - start;
        observer.disconnect();
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  await expect(page.getByRole("heading", { name: "We couldn’t open the store" })).toBeFocused();
  const elapsed = await page.evaluate(() => (window as typeof window & { exitElapsed?: number }).exitElapsed);
  expect(elapsed).toBeLessThan(600);
  await expect(page.locator(".exit-reveal-content")).toHaveCSS("filter", "none");
});


test("early exit touch scrub returns to Front with the finale copy visible", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 812 },
    baseURL: "http://localhost:4176",
  });
  const page = await context.newPage();
  try {
    await page.route("**/api/**", (route) => route.fulfill({ status: 502, body: "offline" }));
    await page.goto("/");
    const stage = await ready(page);
    await page.keyboard.press("End");
    await landed(page, 4);
    await page.waitForTimeout(200);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: 180, y: 600 }],
    });
    for (let n = 1; n <= 8; n++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x: 180, y: 600 - n * 10 }],
      });
      await page.waitForTimeout(40);
    }
    await expect(stage).toHaveAttribute("data-moving", "true");
    await expect.poll(() => stage.getAttribute("data-exit").then(Number)).toBeGreaterThan(0);
    await expect.poll(() => stage.getAttribute("data-exit").then(Number)).toBeLessThan(0.5);
    await expect(stage.locator(".v2-demo-finale")).toHaveCSS("opacity", "1");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await landed(page, 4);
    await expect(stage).not.toHaveAttribute("data-exit");
    await expect(stage.locator(".v2-demo-finale")).toBeVisible();
    await expect(stage.locator(".v2-demo-finale")).toHaveCSS("transform", "none");
    await expect(page.getByRole("heading", { name: "We couldn’t open the store" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

 test("Hinge hides only its two colliding backdrop marks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  const marks = stage.locator(".lines-hinge-collision");
  await expect(marks).toHaveCount(2);
  for (let angle = 0; angle < 5; angle++) {
    if (angle) await page.keyboard.press("ArrowDown");
    await landed(page, angle);
    for (const mark of await marks.all())
      await expect(mark).toHaveCSS("display", angle === 3 ? "none" : "inline");
  }
});

 test("Night mode toggles tokens, persists reload and keeps controls independent of angles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  const button = page.getByRole("button", { name: "Night mode" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button.locator("svg")).toHaveClass(/lucide-moon/);
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button.locator("svg")).toHaveClass(/lucide-sun/);
  expect(await page.evaluate(() => localStorage.getItem("forma.v2.theme"))).toBe("night");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim())).toBe("#262624");
  await expect(page.locator(".site-header")).toHaveCSS("background-color", "rgb(38, 38, 36)");
  await page.reload();
  await ready(page);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  for (let angle = 0; angle < 5; angle++) {
    if (angle) await page.keyboard.press("ArrowDown");
    await landed(page, angle);
    if (angle === 2) {
      await expect(button).toBeHidden();
      expect(await page.getByRole("button", { name: "Night mode", includeHidden: true }).evaluate(element => { element.focus(); return document.activeElement === element; })).toBe(false);
    } else {
      await expect(button).toBeVisible();
      await button.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Space");
      await landed(page, angle);
      await button.hover();
      await page.mouse.wheel(0, 100);
      await landed(page, angle);
      await button.evaluate(element => element.blur());
    }
  }
});

 test("night finale exit removes theme and restores home day tokens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  const dayPaper = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim());
  await page.getByRole("button", { name: "Night mode" }).click();
  await page.keyboard.press("End");
  await landed(page, 4);
  // Click guard applies as soon as a reversible exit scrub starts, as well as after commit.
  await stage.evaluate(element => element.setAttribute("data-exit", "0.1"));
  await page.getByRole("button", { name: "Night mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await stage.evaluate(element => element.removeAttribute("data-exit"));
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim())).toBe(dayPaper);
  await expect(page.locator("main h1").first()).toBeFocused();
  await expect(page.locator(".site-header")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

 for (const theme of ["day", "night"] as const) {
  test(theme + " landed frames stay identical at every angle", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/v2-demo");
    const stage = await ready(page);
    if (theme === "night") await page.getByRole("button", { name: "Night mode" }).click();
    await page.getByRole("button", { name: "Night mode" }).evaluate(element => element.blur());
    await page.mouse.move(1, 1);
    for (let angle = 0; angle < 5; angle++) {
      if (angle) await page.keyboard.press("ArrowDown");
      await landed(page, angle);
      const still = await stage.screenshot();
      await page.waitForTimeout(200);
      expect((await stage.screenshot()).equals(still)).toBe(true);
    }
  });
}

 test("native night crossfade lasts 300ms and ignores rapid clicks until finished", async ({ page }) => {
  await page.goto("/v2-demo");
  await ready(page);
  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("function");
  await page.evaluate(() => {
    const start = document.startViewTransition.bind(document);
    (window as any).themeTransitions = [];
    document.startViewTransition = ((apply: () => void) => {
      const transition = start(apply);
      (window as any).themeTransitions.push(transition);
      return transition;
    }) as typeof document.startViewTransition;
    const button = document.querySelector<HTMLButtonElement>(".v2-demo-night-toggle")!;
    button.click();
    button.click();
  });
  await page.evaluate(async () => {
    const transition = (window as any).themeTransitions[0];
    await transition.ready;
    (window as any).themeAnimationDurations = document.getAnimations().filter(animation => {
      const effect = animation.effect as KeyframeEffect;
      return effect.pseudoElement?.startsWith("::view-transition");
    }).map(animation => animation.effect!.getTiming().duration);
    await transition.finished;
  });
  expect(await page.evaluate(() => (window as any).themeTransitions.length)).toBe(1);
  const durations = await page.evaluate(() => (window as any).themeAnimationDurations);
  expect(durations.length).toBeGreaterThan(0);
  expect(durations.every((duration: number) => duration === 300)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page.getByRole("button", { name: "Night mode" }).click();
  await page.evaluate(() => (window as any).themeTransitions[1].finished);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
});

 for (const instant of ["reduced motion", "unsupported API"] as const) {
  test("night switches instantly with " + instant, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: instant === "reduced motion" ? "reduce" : "no-preference" });
    await page.goto("/v2-demo");
    await ready(page);
    const result = await page.evaluate(mode => {
      if (mode === "unsupported API") Object.defineProperty(document, "startViewTransition", { configurable: true, value: undefined });
      else document.startViewTransition = (() => { throw Error("reduced motion must not start a transition"); }) as typeof document.startViewTransition;
      document.querySelector<HTMLButtonElement>(".v2-demo-night-toggle")!.click();
      return { theme: document.documentElement.dataset.theme, pressed: document.querySelector(".v2-demo-night-toggle")!.getAttribute("aria-pressed"), animations: document.getAnimations().length };
    }, instant);
    expect(result).toEqual({ theme: "night", pressed: "true", animations: 0 });
  });
}

 test("touching Night mode toggles without capturing a stage gesture", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 }, baseURL: "http://localhost:4176", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("/v2-demo");
    await ready(page);
    await page.getByRole("button", { name: "Night mode" }).tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await landed(page, 0);
  } finally {
    await context.close();
  }
});

test("night button clears visible copy and navigation at all review sizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [{ width: 1920, height: 945 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/v2-demo");
    await ready(page);
    const button = page.getByRole("button", { name: "Night mode" });
    if (await button.getAttribute("aria-pressed") === "false") await button.click();
    for (let angle = 0; angle < 5; angle++) {
      if (angle) await page.keyboard.press("ArrowDown");
      await landed(page, angle);
      if (angle === 2) continue;
      const result = await button.evaluate(element => {
        const r = element.getBoundingClientRect();
        const selectors = ".v2-demo-copy h1,.v2-demo-copy h2 span,.v2-demo-copy p,.v2-demo-part h2,.v2-demo-part > span,.v2-demo-finale .eyebrow,.finale-aside em,.main-nav a";
        return { width: r.width, height: r.height, bottom: innerHeight - r.bottom, left: r.left, overflow: document.documentElement.scrollWidth > innerWidth, clickable: !!document.elementFromPoint(r.x + 22, r.y + 22)?.closest(".v2-demo-night-toggle"), collisions: [...document.querySelectorAll(selectors)].filter(copy => {
          const b = copy.getBoundingClientRect();
          return b.width && getComputedStyle(copy).visibility !== "hidden" && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
        }).map(copy => copy.textContent) };
      });
      expect(result).toEqual({ width: 44, height: 44, bottom: 24, left: 24, overflow: false, clickable: true, collisions: [] });
    }
  }
});

test("leaving during a pending night transition cannot leak root theme", async ({ page }) => {
  await page.goto("/v2-demo");
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>(".v2-demo-night-toggle")!.click();
    document.querySelector<HTMLAnchorElement>(".wordmark")!.click();
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await page.waitForTimeout(400);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
});
