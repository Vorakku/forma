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
  await expect(stage.locator('[aria-live="polite"]')).toHaveText(
    `Angle ${angle + 1} of ${SCROLL_ANGLES.length}: ${SCROLL_ANGLES[angle].name}`,
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
  await expect(header).toHaveCSS("opacity", "1");
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
  await expect(header).toBeHidden();
  captures.push(await capture(page, 1));
  for (let index = 2; index < SCROLL_ANGLES.length; index++) {
    // All ten belong to one gesture, including events during the step tween.
    for (let notch = 0; notch < 10; notch++) await page.mouse.wheel(0, 100);
    await landed(page, index);
    captures.push(await capture(page, index));
    if (index < SCROLL_ANGLES.length - 1) await expect(header).toBeHidden();
  }
  for (let n = 1; n < captures.length; n++)
    expect(captures[n].equals(captures[n - 1])).toBeFalsy();
  await expect(header).toHaveCSS("opacity", "1");
  await expect(page.locator(".site-footer")).toHaveCount(0);
  await page.keyboard.press("Home");
  await landed(page, 0);
  // Navigation leaves focus on a link; arrows must still work there.
  await page.keyboard.press("ArrowDown");
  await landed(page, 1);
  await page.keyboard.press("End");
  await landed(page, SCROLL_ANGLES.length - 1);
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
  await expect(page.locator(".site-header")).toHaveCSS("opacity", "1");
});

test("context loss restores the header and stops input handling", async ({
  page,
}) => {
  await page.goto("/v2-demo");
  const stage = await ready(page);
  await page.keyboard.press("ArrowDown");
  await landed(page, 1);
  await stage
    .locator("canvas")
    .evaluate((element) =>
      element.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
  await expect(stage.getByText("The 3D view is unavailable.")).toBeVisible();
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
    await page.keyboard.press("Home");
    await landed(page, 0);
    await page.getByRole("link", { name: "FORMA home" }).tap();
    await expect(page).toHaveURL("http://localhost:4176/");
  } finally {
    await context.close();
  }
});
