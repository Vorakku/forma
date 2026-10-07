import { test, expect, type Page } from "@playwright/test";
import {
  HOLD_DURATION,
  SCROLL_LENGTH_VH,
  TIMELINE_DURATION,
  holdStart,
} from "../src/tryon/scroll-poses";

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
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  return stage;
}

async function hold(page: Page, index: number) {
  const start = await page
    .locator(".pin-spacer")
    .evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
  const time = holdStart(index) + HOLD_DURATION / 2;
  await page.evaluate(
    ({ start, progress, vh }) =>
      window.scrollTo(0, start + (progress * window.innerHeight * vh) / 100),
    {
      start,
      progress: time / TIMELINE_DURATION,
      vh: SCROLL_LENGTH_VH,
    },
  );
  // Allow the documented 1-second scrub to settle, including software WebGL rendering.
  await page.waitForTimeout(1600);
}

test("cold slug load, five angles, reverse scroll and navigation clean up the pin", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // No catalog visit or cached Ellis product before this direct URL.
  const productResponse = page.waitForResponse((response) =>
    response.url().endsWith("/products/the-ellis"),
  );
  await page.goto("/v2-demo");
  expect((await productResponse).ok()).toBeTruthy();
  const stage = await ready(page);
  const canvas = stage.locator("canvas");
  await expect(canvas).not.toHaveAttribute("tabindex", "0");
  await expect(canvas).toHaveAttribute("role", "img");
  const header = page.locator(".site-header");
  await expect(header).toBeVisible();
  // The stage fills the screen on arrival, so the only scrolling is the animation itself.
  expect((await stage.boundingBox())!.y).toBe(0);
  const { maxScroll, range } = await page.evaluate(
    (vh) => ({
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      range: (window.innerHeight * vh) / 100,
    }),
    SCROLL_LENGTH_VH,
  );
  expect(Math.abs(maxScroll - range)).toBeLessThanOrEqual(2);
  const captures: Buffer[] = [];
  for (let index = 0; index < 5; index++) {
    await hold(page, index);
    // The header stays out of the way for every angle, including the last hold's midpoint.
    await expect(header).toBeHidden();
    const bounds = await stage.boundingBox();
    expect(bounds!.y).toBeCloseTo(0, 0);
    // ScrollTrigger rounds pinned dimensions to device pixels.
    expect(Math.abs(bounds!.height - 1018)).toBeLessThanOrEqual(1);
    // Memory-only comparisons also verify the stage actually changes without writing artifacts.
    captures.push(
      await stage.screenshot(
        process.env.CAPTURE_SCREENSHOTS === "1"
          ? { path: `/tmp/forma-v2-angle-${index + 1}.png` }
          : {},
      ),
    );
  }
  for (let index = 1; index < 5; index++)
    expect(captures[index].equals(captures[index - 1])).toBeFalsy();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".site-footer")).toHaveCount(0);
  await expect(header).toHaveCSS("opacity", "1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).toHaveCSS("opacity", "1");
  await hold(page, 2);
  await expect(header).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page
    .getByRole("link", { name: "All eyewear", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(header).toBeVisible();
  await expect(page.locator(".site-footer")).toHaveCount(1);
  await page
    .getByRole("link", { name: "FORMA V2 DEMO", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/v2-demo$/);
  await ready(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await hold(page, 3);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.setViewportSize({ width: 1808, height: 1018 });
    await page.goto("/product/the-ellis");
    await page.getByRole("button", { name: "View in 3D" }).click();
    for (const [index, name] of [
      [1, "Three-quarter"],
      [3, "Top"],
      [4, "Hinge detail"],
      [5, "Front"],
    ] as const) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(500);
      await page
        .locator(".product-3d-stage")
        .screenshot({ path: `/tmp/forma-v2-product-angle-${index}.png` });
    }
  }
  expect(errors).toEqual([]);
});

test("reduced motion cuts between still angles and adapts when the preference changes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/v2-demo");
  const stage = await ready(page);
  await hold(page, 1);
  const before = await stage.screenshot();
  // Two scroll positions in the same segment render exactly the same pose.
  await page.evaluate(() => window.scrollBy(0, 40));
  await page.waitForTimeout(100);
  expect((await stage.screenshot()).equals(before)).toBeTruthy();
  await hold(page, 2);
  expect((await stage.screenshot()).equals(before)).toBeFalsy();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await hold(page, 3);
  await expect(page.locator(".site-header")).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole("link", { name: "All eyewear", exact: true })
    .first()
    .click();
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
});

test("context loss removes the pin and keeps the product fallback accessible", async ({
  page,
}) => {
  await page.goto("/v2-demo");
  const stage = await ready(page);
  await hold(page, 2);
  await stage
    .locator("canvas")
    .evaluate((element) =>
      element.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(stage.getByText("The 3D view is unavailable.")).toBeVisible();
  await expect(
    stage.getByRole("link", { name: "Explore The Ellis" }),
  ).toHaveAttribute("href", "/product/the-ellis");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".site-header")).toBeVisible();
  await expect(page.locator(".site-footer")).toHaveCount(0);
});

test("missing Ellis shows the collection link with no pin", async ({
  page,
}) => {
  // App bootstrap also reads featured products; simulate a genuinely absent frame there.
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
