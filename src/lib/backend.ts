// The only module that translates the global commerce contract into FORMA's view model.
import { api, ApiError } from "./api";
import { swatchFor } from "./presentation";
import type {
  Address,
  Bootstrap,
  CartLine,
  CatalogPage,
  Category,
  LensOption,
  LensSelection,
  Order,
  PaymentMethod,
  Prescription,
  Product,
  Quote,
  Review,
  ShippingMethod,
  SupportRequest,
  User,
} from "./types";

type ServerPrescription =
  | {
      kind: "SINGLE_VISION";
      pd: number;
      right: { sphere: number; cylinder: number; axis: number };
      left: { sphere: number; cylinder: number; axis: number };
    }
  | { kind: "READING"; power: number };
type Choice = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  isDefault: boolean;
};
type ServerProduct = {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
  brand: string;
  description: string;
  tag: string | null;
  priceMin: number | null;
  ratingAvg: number;
  reviewCount: number;
  soldCount: number;
  images: { url: string }[];
  specs: { name: string; value: string }[];
  options: {
    id: string;
    name: string;
    values: { id: string; value: string }[];
  }[];
  variants: {
    id: string;
    price: number;
    compareAtPrice: number | null;
    inStock: boolean;
    optionValues: { optionId: string; value: string }[];
  }[];
  addOnGroups: { name: string; addOns: Choice[] }[];
};
type ServerAddress = {
  id?: string;
  label: string;
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  country: string;
  postalCode: string;
  phone: string;
  isDefault?: boolean;
};
type ServerCart = {
  version: number;
  subtotal: number;
  lines: {
    id: string;
    variantId: string;
    quantity: number;
    available: boolean;
    unitPrice: number;
    lineTotal: number;
    product: {
      id: string;
      title: string;
      slug: string;
      imageUrl: string | null;
    } | null;
    variant: { optionValues: string[] } | null;
    addOns: { id: string; groupName: string; name: string; price: number }[];
    prescription: ServerPrescription | null;
  }[];
};
type ServerOrder = {
  id: string;
  number: number;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  address: ServerAddress;
  shippingMethod: { code: string; name: string };
  couponCode: string | null;
  items: {
    productId: string | null;
    variantId: string | null;
    title: string;
    imageUrl: string | null;
    options: string;
    unitPrice: number;
    lineTotal: number;
    quantity: number;
    addOns: { groupName: string; code: string; name: string; price: number }[];
    prescription: ServerPrescription | null;
  }[];
  events: { toStatus: string | null; createdAt: string; message: string }[];
  payments: { method: { brand: string; last4: string } | null }[];
  createdAt: string;
  updatedAt: string;
};
type ServerBootstrap = {
  customer: { id: string; email: string; name: string } | null;
  cart: ServerCart;
  wishlist?: string[];
  addresses?: ServerAddress[];
  paymentMethods?: PaymentMethod[];
  orders?: { items: ServerOrder[] };
};
const products = new Map<string, ServerProduct>();
let categories = new Map<string, Category>();
let catalogReady: Promise<void> | undefined;
async function ensureCatalog() {
  catalogReady ??= api<{ id: string; slug: string }[]>("/categories")
    .then((rows) => {
      categories = new Map(rows.map((c) => [c.id, c.slug as Category]));
    })
    .catch((error) => {
      catalogReady = undefined;
      throw error;
    });
  await catalogReady;
}
const option = (p: ServerProduct, name: string) =>
  p.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
function variantLabels(p: ServerProduct, variantId: string) {
  const variant = p.variants.find((v) => v.id === variantId);
  const value = (name: string) =>
    variant?.optionValues.find((v) => v.optionId === option(p, name)?.id)
      ?.value ?? "";
  return { size: value("Size"), color: value("Color") };
}
function remember(rows: ServerProduct[]) {
  for (const p of rows) {
    products.delete(p.id);
    products.set(p.id, p);
  }
  while (products.size > 200) products.delete(products.keys().next().value!);
}
function toProduct(p: ServerProduct): Product {
  const cheapest = p.variants.find((v) => v.price === p.priceMin);
  const values = (name: string) =>
    option(p, name)?.values.map((v) => v.value) ?? [];
  const spec = (name: string) =>
    p.specs.find((s) => s.name.toLowerCase() === name.toLowerCase())?.value ??
    "";
  const choices = (name: string): LensOption[] =>
    p.addOnGroups
      .find((g) => g.name === name)
      ?.addOns.map((a) => ({ ...a, id: a.code, addOnId: a.id })) ?? [];
  return {
    id: p.id,
    slug: p.slug,
    name: p.title,
    category: categories.get(p.categoryId) ?? "optical",
    brand: p.brand,
    description: p.description,
    price: p.priceMin ?? 0,
    originalPrice: cheapest?.compareAtPrice ?? 0,
    stock: p.variants.some((v) => v.inStock) ? 20 : 0,
    sold: p.soldCount,
    rating: p.ratingAvg,
    reviewCount: p.reviewCount,
    image: p.images[0]?.url ?? "",
    images: p.images.map((i) => i.url),
    sizes: values("Size"),
    colors: values("Color"),
    swatches: values("Color").map(swatchFor),
    shape: spec("Shape"),
    material: spec("Material"),
    dimensions: spec("Dimensions"),
    weight: spec("Weight"),
    tag: p.tag ?? "",
    lenses: choices("Lens type"),
    finishes: choices("Lens finish"),
  };
}
export const cachedProducts = () => [...products.values()].map(toProduct);
export async function queryCatalog(
  input: URLSearchParams | Record<string, string | number | boolean> = {},
): Promise<CatalogPage> {
  await ensureCatalog();
  const params =
    input instanceof URLSearchParams
      ? input
      : new URLSearchParams(
          Object.entries(input).map(([k, v]) => [k, String(v)]),
        );
  const page = await api<{
    items: ServerProduct[];
    total: number;
    page: number;
    pageSize: number;
  }>("/products?" + params);
  remember(page.items);
  return { ...page, items: page.items.map(toProduct) };
}
export function catalogParams(view: URLSearchParams) {
  const p = new URLSearchParams({
    pageSize: "6",
    sort:
      (
        {
          recommended: "newest",
          "price-asc": "priceAsc",
          "price-desc": "priceDesc",
          rating: "rating",
        } as Record<string, string>
      )[view.get("sort") ?? "recommended"] ??
      view.get("sort") ??
      "newest",
  });
  for (const key of ["category", "q", "page", "wishlist"])
    if (view.get(key)) p.set(key === "q" ? "search" : key, view.get(key)!);
  for (const [key, name] of [
    ["shape", "Shape"],
    ["material", "Material"],
  ])
    for (const value of view.getAll(key)) p.append("spec", name + ":" + value);
  for (const value of view.getAll("fit")) p.append("option", "Size:" + value);
  if (view.get("max")) p.set("priceMax", String(Number(view.get("max")) * 100));
  if (view.get("stock")) p.set("inStock", "true");
  if (view.get("sale")) p.set("discount", "true");
  return p;
}
export async function loadProduct(id: string) {
  await ensureCatalog();
  const p = await api<ServerProduct>("/products/" + encodeURIComponent(id));
  remember([p]);
  return toProduct(p);
}
export async function loadCatalog() {
  await Promise.all([
    queryCatalog({ featured: true, pageSize: 6, sort: "newest" }),
    queryCatalog({ category: "sun", pageSize: 6, sort: "newest" }),
    loadProducts(["the-remy", "the-margot", "the-jules"]),
  ]);
  return cachedProducts();
}
const toPrescription = (p: ServerPrescription | null): Prescription | null =>
  !p
    ? null
    : p.kind === "READING"
      ? { power: p.power.toFixed(2) }
      : {
          pd: p.pd,
          eyes: [
            { eye: "right", ...p.right },
            { eye: "left", ...p.left },
          ],
        };
function prescriptionBody(
  p: Prescription | null | undefined,
): ServerPrescription | null {
  if (!p) return null;
  if ("power" in p) return { kind: "READING", power: Number(p.power) };
  const right = p.eyes.find((e) => e.eye === "right"),
    left = p.eyes.find((e) => e.eye === "left");
  if (!right || !left) throw new Error("Enter the sphere for both eyes.");
  return {
    kind: "SINGLE_VISION",
    pd: p.pd,
    right: { sphere: right.sphere, cylinder: right.cylinder, axis: right.axis },
    left: { sphere: left.sphere, cylinder: left.cylinder, axis: left.axis },
  };
}
const splitName = (name: string) => {
  const [firstName = "", ...last] = name.split(" ");
  return { firstName, lastName: last.join(" ") };
};
const guest: User = {
  id: "guest",
  email: "",
  name: "Guest",
  firstName: "Guest",
  lastName: "",
  guest: true,
};
const toAddress = (a: ServerAddress): Address => ({
  id: a.id ?? "",
  label: a.label,
  ...splitName(a.recipient),
  line1: a.line1,
  line2: a.line2 ?? "",
  city: a.city,
  state: a.region ?? "",
  country: a.country,
  postalCode: a.postalCode,
  phone: a.phone,
  isDefault: a.isDefault ?? false,
});
function unavailableProduct(line: ServerCart["lines"][number]): Product {
  return {
    id: line.product?.id ?? "",
    slug: line.product?.slug ?? "",
    name: line.product?.title ?? "Unavailable frame",
    category: "optical",
    brand: "",
    description: "",
    price: 0,
    originalPrice: 0,
    stock: 0,
    sold: 0,
    rating: 0,
    reviewCount: 0,
    image: line.product?.imageUrl ?? "",
    images: [],
    sizes: [],
    colors: [],
    swatches: [],
    shape: "",
    material: "",
    dimensions: "",
    weight: "",
    tag: "",
    lenses: [],
    finishes: [],
  };
}
function toCart(line: ServerCart["lines"][number]): CartLine {
  const known = line.product ? products.get(line.product.id) : undefined;
  const product = known ? toProduct(known) : unavailableProduct(line);
  const codes = (group: string, fallback: string) => {
    const choice = line.addOns.find((a) => a.groupName === group);
    return (
      known?.addOnGroups
        .flatMap((g) => g.addOns)
        .find((a) => a.id === choice?.id)?.code ?? fallback
    );
  };
  return {
    id: line.id,
    variantId: line.variantId,
    productId: product.id,
    quantity: line.quantity,
    available: line.available,
    product,
    ...(known
      ? variantLabels(known, line.variantId)
      : {
          size: line.variant?.optionValues[0] ?? "",
          color: line.variant?.optionValues[1] ?? "",
        }),
    lens: codes("Lens type", "non-prescription"),
    coating: codes("Lens finish", "standard"),
    prescription: toPrescription(line.prescription),
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    addOns: line.addOns,
  };
}
function toOrder(o: ServerOrder, email = ""): Order {
  return {
    id: o.id,
    number: o.number,
    status: o.status.toLowerCase() as Order["status"],
    subtotal: o.subtotal,
    discount: o.discount,
    shipping: o.shipping,
    total: o.total,
    address: { ...toAddress(o.address), email },
    shippingMethod: o.shippingMethod.code,
    shippingName: o.shippingMethod.name,
    coupon: o.couponCode ?? "",
    paymentMethod: o.payments[0]?.method
      ? `Demo ${o.payments[0].method.brand} ···· ${o.payments[0].method.last4}`
      : "Demo card",
    items: o.items.map((i) => {
      const known = i.productId ? products.get(i.productId) : undefined,
        parts = i.options.split(" / ");
      return {
        productId: i.productId ?? "",
        name: i.title,
        image: i.imageUrl ?? "",
        category: known
          ? (categories.get(known.categoryId) ?? "optical")
          : "optical",
        ...(known && i.variantId
          ? variantLabels(known, i.variantId)
          : { size: parts[0] ?? "", color: parts[1] ?? "" }),
        lens:
          i.addOns.find((a) => a.groupName === "Lens type")?.code ??
          "non-prescription",
        coating:
          i.addOns.find((a) => a.groupName === "Lens finish")?.code ??
          "standard",
        prescription: toPrescription(i.prescription),
        addOns: i.addOns,
        quantity: i.quantity,
        price: i.unitPrice,
        lineTotal: i.lineTotal,
      };
    }),
    events: o.events
      .filter((e) => e.toStatus)
      .map((e) => ({
        status: e.toStatus!.toLowerCase(),
        time: e.createdAt,
        text: e.message,
      })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
export async function messages(): Promise<SupportRequest[]> {
  return (
    await api<
      { id: string; senderKind: string; text: string; createdAt: string }[]
    >("/conversations/support/messages")
  ).map((m) => ({
    id: m.id,
    sender: m.senderKind === "CUSTOMER" ? "customer" : "support",
    message: m.text,
    createdAt: m.createdAt,
  }));
}
export async function loadState(guestWishlist: string[]): Promise<Bootstrap> {
  await ensureCatalog();
  const b = await api<ServerBootstrap>("/bootstrap");
  await Promise.all(
    [
      ...new Set(
        b.cart.lines.flatMap((l) => (l.product ? [l.product.id] : [])),
      ),
    ].map((id) =>
      loadProduct(id).catch((e) => {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }),
    ),
  );
  const shippingMethods = (
    await api<
      {
        code: string;
        name: string;
        deliveryTime: string;
        price: number;
        isDefault: boolean;
      }[]
    >("/shipping-methods")
  ).map((m) => ({ ...m, days: m.deliveryTime }));
  return {
    user: b.customer
      ? { ...b.customer, ...splitName(b.customer.name), guest: false }
      : guest,
    cart: b.cart.lines.map(toCart),
    cartVersion: b.cart.version,
    subtotal: b.cart.subtotal,
    wishlist: b.customer ? (b.wishlist ?? []) : guestWishlist,
    addresses: (b.addresses ?? []).map(toAddress),
    payments: b.paymentMethods ?? [],
    orders: (b.orders?.items ?? []).map((o) => toOrder(o, b.customer?.email)),
    requests: b.customer ? await messages() : [],
    shippingMethods,
  };
}
export async function quote(
  shipping: string,
  coupon: string | null,
): Promise<Quote> {
  const q = await api<
    Omit<Quote, "promo"> & { coupon: { code: string } | null }
  >("/checkout/quote", "POST", {
    shippingMethodCode: shipping || undefined,
    couponCode: coupon || undefined,
  });
  return {
    subtotal: q.subtotal,
    discount: q.discount,
    shipping: q.shipping,
    total: q.total,
    cartVersion: q.cartVersion,
    promo: q.coupon?.code ?? "",
  };
}
export async function reviews(productId: string): Promise<Review[]> {
  const result = await api<{
    items: {
      id: string;
      rating: number;
      text: string;
      author: { name: string };
      likeCount: number;
      liked: boolean;
      mine: boolean;
      createdAt: string;
    }[];
  }>(`/products/${productId}/reviews?pageSize=50`);
  return result.items.map((r) => ({
    ...r,
    author: r.author.name,
    likes: r.likeCount,
    verified: true,
  }));
}
function addressBody(b: Partial<Address>) {
  const data = {
    label: b.label ?? "Home",
    recipient:
      b.firstName === undefined
        ? undefined
        : `${b.firstName} ${b.lastName ?? ""}`.trim(),
    line1: b.line1,
    line2: b.line2 === undefined ? undefined : b.line2 || null,
    city: b.city,
    region: b.state === undefined ? undefined : b.state || null,
    country: b.country,
    postalCode: b.postalCode,
    phone: b.phone,
    isDefault: b.isDefault,
  };
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}
export async function perform(
  path: string,
  method: string,
  body: any,
  state: Partial<Bootstrap>,
): Promise<any> {
  const b = body ?? {};
  if (path === "/cart" && method === "POST") {
    const p = await loadProduct(b.productId),
      raw = products.get(p.id)!;
    const variant = raw.variants.find((v) => {
      const labels = variantLabels(raw, v.id);
      return labels.size === b.size && labels.color === b.color;
    });
    if (!variant) throw new Error("Choose an available size and color.");
    return api("/cart/items", "POST", {
      variantId: variant.id,
      qty: b.quantity,
      ...configuration(p, b),
    });
  }
  let match = path.match(/^\/cart\/([^/]+)$/);
  if (match) {
    if (method === "DELETE") return api("/cart/items/" + match[1], "DELETE");
    const line = state.cart?.find((l) => l.id === match![1]);
    if (!line) throw new Error("Reload your bag and try again.");
    const p = await loadProduct(line.productId);
    return api("/cart/items/" + match[1], "PATCH", {
      ...(b.quantity === undefined ? {} : { qty: b.quantity }),
      ...(b.lens === undefined &&
      b.coating === undefined &&
      b.prescription === undefined
        ? {}
        : configuration(p, { ...line, ...b })),
    });
  }
  match = path.match(/^\/wishlist\/([^/]+)$/);
  if (match)
    return api(
      "/wishlist/" + match[1],
      state.wishlist?.includes(match[1]) ? "DELETE" : "PUT",
    );
  if (path === "/auth/register")
    return api(path, "POST", {
      name: `${b.firstName} ${b.lastName}`.trim(),
      email: b.email,
      password: b.password,
    });
  if (path === "/auth/forgot") {
    const result = await api<{
      challengeId: string;
      code?: string;
      message: string;
    }>(path, "POST", { email: b.email });
    return {
      challengeId: result.challengeId,
      demoCode: result.code,
      message: result.message,
    };
  }
  if (["/auth/login", "/auth/logout", "/auth/reset"].includes(path))
    return api(path, "POST", body);
  if (path === "/security/password") return api("/auth/password", "POST", b);
  if (path === "/user") {
    if (b.name) await api("/me", "PATCH", { name: b.name });
    if (b.email && b.email !== state.user?.email)
      await api("/me/email", "POST", {
        email: b.email,
        password: b.currentPassword,
      });
    return;
  }
  if (path === "/addresses")
    return toAddress(await api<ServerAddress>(path, "POST", addressBody(b)));
  if (/^\/addresses\/[^/]+$/.test(path))
    return api(path, method, method === "DELETE" ? undefined : addressBody(b));
  if (path === "/payments")
    return api<PaymentMethod>("/payment-methods", "POST", {
      brand: b.brand,
      last4: b.last4,
      expiryMonth: Number(b.expiryMonth),
      expiryYear: Number(b.expiryYear),
      holderName: b.holderName,
    });
  if (path === "/checkout")
    return {
      order: toOrder(
        await api<ServerOrder>(path, "POST", {
          addressId: b.addressId,
          shippingMethodCode: b.delivery,
          couponCode: b.coupon || undefined,
          payment: { method: "card", paymentMethodId: b.paymentMethodId },
          idempotencyKey: b.idempotencyKey,
          expectedCartVersion: b.expectedCartVersion,
        }),
        state.user?.email,
      ),
    };
  match = path.match(/^\/orders\/([^/]+)\/(cancel|reorder|advance)$/);
  if (match)
    return api(
      `/orders/${match[1]}/${match[2] === "advance" ? "simulate-advance" : match[2]}`,
      "POST",
    );
  if (path === "/support")
    return api("/conversations/support/messages", "POST", {
      text: `${b.topic}: ${b.message}`,
    });
  if (/^\/products\/[^/]+\/reviews$/.test(path))
    return api(path, "POST", { rating: b.rating, text: b.text });
  if (/^\/reviews\/[^/]+\/like$/.test(path)) return api(path, "POST");
  throw new Error("This action is not available.");
}
function configuration(p: Product, selection: LensSelection) {
  const lens = p.lenses.find((a) => a.id === selection.lens),
    finish = p.finishes.find((a) => a.id === selection.coating);
  if ((p.lenses.length && !lens) || (p.finishes.length && !finish))
    throw new Error("Choose a lens type and finish.");
  return {
    addOnIds: [lens?.addOnId, finish?.addOnId].filter(
      (id): id is string => !!id,
    ),
    prescription: prescriptionBody(selection.prescription),
  };
}
export const syncWishlist = async (ids: string[]) => {
  for (const id of ids) {
    try {
      await api("/wishlist/" + id, "PUT");
    } catch (error) {
      // A deleted frame cannot be carried into an account wishlist.
      // Keep valid device selections until every other write succeeds.
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
};
export async function loadOrder(id: string): Promise<Order> {
  return toOrder(await api<ServerOrder>("/orders/" + encodeURIComponent(id)));
}

export async function loadProducts(ids: string[]) {
  return Promise.all(
    ids.map(async (id) => {
      try {
        return await loadProduct(id);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    }),
  );
}
