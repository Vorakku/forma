import { test, expect } from "@playwright/test";

// Exercise actual WebGL rendering in headless Chromium, without a camera or GPU dependency.
test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

test("Felix reference viewer renders both finishes and retains Ellis viewing controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/product/the-felix");
  await expect(
    page.getByRole("heading", { level: 1, name: "The Felix" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View in 3D" }).click();
  const front = page.getByRole("button", { name: "Front", exact: true });
  await expect(front).toBeEnabled();
  const canvas = page.getByRole("img", {
    name: "Interactive 3D view of The Felix in Chestnut",
  });
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((element) => (element as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await page
      .locator(".product-3d-stage")
      .screenshot({ path: "/tmp/forma-browline-perspective.png" });
  await front.click();
  await expect(front).toHaveAttribute("aria-pressed", "true");
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await page
      .locator(".product-3d-stage")
      .screenshot({ path: "/tmp/forma-browline-front.png" });
  await page.getByRole("button", { name: "Hinge detail" }).click();
  await page.getByRole("button", { name: "Reset 3D view" }).click();
  await page.getByRole("button", { name: "Side", exact: true }).click();
  const color = page
    .locator(".product-detail")
    .getByRole("button", { name: /Ash/ });
  await color.click();
  await expect(
    page.getByRole("img", { name: "Interactive 3D view of The Felix in Ash" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Side", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Three-quarter", exact: true })
    .click();
  if (process.env.CAPTURE_SCREENSHOTS === "1")
    await page
      .locator(".product-3d-stage")
      .screenshot({ path: "/tmp/forma-browline-ash.png" });
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Enlarge product image" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View in 3D" }).click();
  await expect(front).toBeEnabled();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(375);
  await page.goto("/product/the-ellis");
  await page.getByRole("button", { name: "View in 3D" }).click();
  await expect(
    page.getByRole("button", { name: "Front", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("img", { name: /Interactive 3D view of The Ellis/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
