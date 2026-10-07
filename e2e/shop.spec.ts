import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("guest configures lenses, keeps bag and saved frame after signup, checks out and follows the order", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = `forma-${randomUUID()}@example.test`,
    password = "forma-demo-password-2026";
  async function json(path: string) {
    const response = await page.request.get("/api/store" + path, {
      headers: { "X-Store-Key": "pk_forma_dev" },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await page.goto("/catalog");
  const filters = page.getByRole("complementary", { name: "Filter products" });
  await filters.getByLabel("Rectangle", { exact: true }).click();
  await expect(filters.getByLabel("Rectangle", { exact: true })).toBeChecked();
  await filters.getByLabel("Wide", { exact: true }).click();
  await expect(filters.getByLabel("Wide", { exact: true })).toBeChecked();
  const ellis = page.locator(".product-card").filter({ hasText: "The Ellis" });
  await expect(ellis).toBeVisible();
  await ellis.getByRole("heading", { name: "The Ellis", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The Ellis", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wide", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose lenses", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Single vision/ }).check();
  await dialog.getByRole("radio", { name: /Blue-light filter/ }).check();
  await dialog.getByLabel("right sphere", { exact: true }).fill("-2.25");
  await dialog.getByLabel("right cylinder", { exact: true }).fill("-0.5");
  await dialog.getByLabel("right axis", { exact: true }).fill("90");
  await dialog.getByLabel("left sphere", { exact: true }).fill("1.5");
  await dialog.getByLabel("Pupillary distance (PD), mm").fill("62.5");
  await dialog
    .getByRole("button", { name: "Save lens selection", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.getByText("The Ellis added to your bag.", { exact: true }),
  ).toBeVisible();
  const initialCart = await json("/cart");
  expect(initialCart.lines[0].unitPrice).toBe(22000);
  expect(initialCart.subtotal).toBe(22000);
  const productId = initialCart.lines[0].product.id;
  await page
    .locator(".product-detail")
    .getByRole("button", { name: "Add to saved frames", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from saved frames", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Remove from saved frames", exact: true }),
  ).toBeVisible();
  await page.goto("/cart");
  await expect(page.locator(".summary-box")).toContainText("$220.00");
  await page
    .getByRole("button", { name: "Continue to checkout", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Sophea");
  await page.getByLabel("Last name", { exact: true }).fill("Chan");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create demo account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Where should we send your pair?" }),
  ).toBeVisible();
  expect((await json("/cart")).lines[0].unitPrice).toBe(22000);
  expect(
    (await json("/wishlist")).map((product: { id: string }) => product.id),
  ).toContain(productId);
  await page.getByLabel("First name", { exact: true }).fill("Sophea");
  await page.getByLabel("Last name", { exact: true }).fill("Chan");
  await page
    .getByLabel("Street address", { exact: true })
    .fill("18 Frame Lane");
  await page.getByLabel("City", { exact: true }).fill("Phnom Penh");
  await page
    .getByLabel("State / province (optional)", { exact: true })
    .fill("Phnom Penh");
  await page.getByLabel("Postal code", { exact: true }).fill("12000");
  await page.getByLabel("Phone number", { exact: true }).fill("+85512345678");
  await page
    .getByRole("button", { name: "Continue to delivery", exact: true })
    .click();
  await page.getByRole("radio", { name: /Express delivery/ }).check();
  await page
    .getByRole("button", { name: "Review your order", exact: true })
    .click();
  await page.getByLabel("Discount code", { exact: true }).fill("WELCOME10");
  const quoteResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/checkout/quote") &&
      response.request().postDataJSON()?.couponCode === "WELCOME10",
  );
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const quoted = await (await quoteResponse).json();
  expect(quoted).toMatchObject({
    subtotal: 22000,
    discount: 2200,
    shipping: 1800,
    total: 21600,
  });
  await expect(page.locator(".summary-box .total")).toContainText("$216.00");
  await page.getByLabel("Last four digits", { exact: true }).fill("4242");
  await page.getByLabel("Expiry month", { exact: true }).fill("12");
  await page.getByLabel("Expiry year", { exact: true }).fill("2030");
  await page.getByRole("checkbox").check();
  const checkoutResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/store/checkout") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Place demo order/ }).click();
  const response = await checkoutResponse;
  expect(response.status(), await response.text()).toBe(201);
  const order = await response.json();
  expect(order.total).toBe(quoted.total);
  expect(order.items[0].prescription).toMatchObject({
    kind: "SINGLE_VISION",
    pd: 62.5,
    right: { sphere: -2.25, cylinder: -0.5, axis: 90 },
  });
  expect(order.address).toMatchObject({
    recipient: "Sophea Chan",
    region: "Phnom Penh",
    label: "Home",
  });
  await page
    .getByRole("link", { name: "View your order", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "#" + order.number }),
  ).toBeVisible();
  await expect(page.locator(".order-detail-layout")).toContainText(
    "Single vision",
  );
  await expect(page.locator(".order-detail-layout")).toContainText(
    "Blue-light filter",
  );
  await expect(page.getByText("PD 62.5 mm", { exact: true })).toBeVisible();
  for (const status of ["Preparing", "Shipped", "Delivered"]) {
    await page
      .getByRole("button", { name: "Advance to " + status, exact: true })
      .click();
  }
  await expect(
    page.getByRole("link", { name: "Need a return? Message us", exact: true }),
  ).toBeVisible();
  await page.goto("/product/the-ellis");
  await page
    .getByRole("button", { name: "Write a review", exact: true })
    .click();
  await page
    .getByLabel("Your review", { exact: true })
    .fill("A comfortable frame with clear lenses and thoughtful details.");
  await page
    .getByRole("button", { name: "Publish review", exact: true })
    .click();
  await expect(
    page.getByText(
      "A comfortable frame with clear lenses and thoughtful details.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/help");
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Could you help me adjust the fit of my new frame?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(/Thanks for your message. I’m the FORMA demo assistant/),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your FORMA." }),
  ).toBeVisible();
  await page.goto("/orders");
  await expect(page.locator(".order-card")).toContainText("#" + order.number);
  await page.goto("/try-on");
  await expect(page.locator(".tryon-frame")).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "Start camera", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("video")
      .evaluate((video) => (video as HTMLVideoElement).srcObject),
  ).toBeNull();
  expect(errors).toEqual([]);
});
