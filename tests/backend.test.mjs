import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
await mkdir(".sites-runtime", { recursive: true });
const output = resolve(".sites-runtime/backend-tests.mjs");
await build({
  stdin: {
    contents: "export * from './backend';export * from './presentation';",
    resolveDir: resolve("src/lib"),
  },
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
});
const backend = await import(pathToFileURL(output));
after(() => rm(output, { force: true }));
const rx = {
  kind: "SINGLE_VISION",
  pd: 62.5,
  right: { sphere: -2.25, cylinder: -0.5, axis: 90 },
  left: { sphere: 1.5, cylinder: 0, axis: 0 },
};
const p = {
  id: "store-product",
  slug: "the-ellis",
  title: "The Ellis",
  categoryId: "category",
  brand: "FORMA",
  description: "Frame",
  tag: null,
  priceMin: 14500,
  ratingAvg: 4,
  reviewCount: 1,
  soldCount: 2,
  images: [{ url: "/images/frame.webp" }],
  specs: [{ name: "Shape", value: "Rectangle" }],
  options: [
    { id: "color", name: "Color", values: [{ id: "cv", value: "New colour" }] },
    { id: "size", name: "Size", values: [{ id: "sv", value: "Wide" }] },
  ],
  variants: [
    {
      id: "variant",
      price: 14500,
      compareAtPrice: null,
      inStock: true,
      optionValues: [
        { optionId: "size", value: "Wide" },
        { optionId: "color", value: "New colour" },
      ],
    },
  ],
  addOnGroups: [
    {
      name: "Lens type",
      addOns: [
        {
          id: "vision-id",
          code: "single-vision",
          name: "Single vision",
          description: "",
          price: 5000,
          isDefault: true,
        },
      ],
    },
    {
      name: "Lens finish",
      addOns: [
        {
          id: "finish-id",
          code: "blue-light",
          name: "Blue-light filter",
          description: "",
          price: 2500,
          isDefault: true,
        },
      ],
    },
  ],
};
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  assert.equal(options.headers["X-Store-Key"], "pk_forma_dev");
  assert.equal(options.credentials, "same-origin");
  if (url.endsWith("/deleted-frame"))
    return new Response(JSON.stringify({ error: "Frame not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  if (url.endsWith("/unavailable-frame"))
    return new Response(JSON.stringify({ error: "Server unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  let data;
  if (url === "/api/store/categories")
    data = [{ id: "category", slug: "optical" }];
  else if (url.startsWith("/api/store/products?"))
    data = { items: [p], total: 1, page: 1, pageSize: 6 };
  else if (url === "/api/store/products/store-product") data = p;
  else if (url === "/api/store/bootstrap")
    data = {
      customer: null,
      cart: {
        version: 7,
        subtotal: 22000,
        lines: [
          {
            id: "line",
            variantId: "variant",
            quantity: 1,
            available: true,
            unitPrice: 22000,
            lineTotal: 22000,
            product: {
              id: p.id,
              title: p.title,
              slug: p.slug,
              imageUrl: p.images[0].url,
            },
            variant: { optionValues: ["New colour", "Wide"] },
            addOns: [
              {
                id: "vision-id",
                groupName: "Lens type",
                name: "Single vision",
                price: 5000,
              },
              {
                id: "finish-id",
                groupName: "Lens finish",
                name: "Blue-light filter",
                price: 2500,
              },
            ],
            prescription: rx,
          },
        ],
      },
    };
  else if (url === "/api/store/shipping-methods")
    data = [
      {
        code: "standard",
        name: "Standard",
        deliveryTime: "5–7 business days",
        price: 800,
        isDefault: true,
      },
    ];
  else if (
    url === "/api/store/cart/items" ||
    url === "/api/store/auth/register"
  )
    data = {};
  else throw new Error("Unexpected transport request: " + url);
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};
test("named options, server add-on prices and decimal prescriptions translate through one adapter", async () => {
  const page = await backend.queryCatalog({ pageSize: 6 });
  assert.deepEqual(page.items[0].sizes, ["Wide"]);
  assert.deepEqual(page.items[0].colors, ["New colour"]);
  assert.equal(page.items[0].slug, "the-ellis");
  assert.equal(page.items[0].lenses[0].price, 5000);
  assert.deepEqual(page.items[0].swatches, [
    { hex: "#737373", filter: "none" },
  ]);
  assert.deepEqual(backend.swatchFor("constructor"), {
    hex: "#737373",
    filter: "none",
  });
  const state = await backend.loadState(["saved-id"]);
  assert.equal(state.subtotal, 22000);
  assert.equal(state.cartVersion, 7);
  const line = state.cart[0];
  assert.equal(line.size, "Wide");
  assert.equal(line.color, "New colour");
  assert.equal(line.lens, "single-vision");
  assert.equal(line.coating, "blue-light");
  assert.equal(line.unitPrice, 22000);
  assert.equal(line.prescription.pd, 62.5);
  assert.deepEqual(state.wishlist, ["saved-id"]);
  await backend.perform(
    "/cart",
    "POST",
    { productId: p.id, quantity: 1, ...line },
    state,
  );
  const sent = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(sent, {
    variantId: "variant",
    qty: 1,
    addOnIds: ["vision-id", "finish-id"],
    prescription: rx,
  });
  await backend.perform(
    "/auth/register",
    "POST",
    {
      firstName: "Sophea",
      lastName: "Chan",
      email: "demo@example.test",
      password: "demo-password",
    },
    state,
  );
  assert.equal(JSON.parse(calls.at(-1).options.body).name, "Sophea Chan");
});
test("catalog controls produce repeated spec/option filters and the server sort names", () => {
  const params = backend.catalogParams(
    new URLSearchParams(
      "shape=Rectangle&shape=Round&material=Acetate&fit=Wide&max=150&sort=price-desc&page=2&stock=yes&sale=yes&wishlist=true&q=Ellis",
    ),
  );
  assert.deepEqual(params.getAll("spec"), [
    "Shape:Rectangle",
    "Shape:Round",
    "Material:Acetate",
  ]);
  assert.deepEqual(params.getAll("option"), ["Size:Wide"]);
  assert.equal(params.get("priceMax"), "15000");
  assert.equal(params.get("sort"), "priceDesc");
  assert.equal(params.get("search"), "Ellis");
  assert.equal(params.get("pageSize"), "6");
  assert.equal(params.get("wishlist"), "true");
});

test("deleted recent/saved frames do not block the shop, but connection failures remain visible", async () => {
  assert.deepEqual(await backend.loadProducts(["deleted-frame"]), [null]);
  await backend.syncWishlist(["deleted-frame"]);
  await assert.rejects(
    backend.loadProducts(["unavailable-frame"]),
    /Server unavailable/,
  );
  await assert.rejects(
    backend.syncWishlist(["unavailable-frame"]),
    /Server unavailable/,
  );
});
