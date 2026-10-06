import { z } from "zod";
import { useApp } from "./store";
import { loadProduct, queryCatalog, quote } from "./backend";
// Optional browser agent tools. All commerce reads and writes go through the adapter.
export function registerWebTools() {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: unknown,
          options?: { signal: AbortSignal },
        ) => Promise<void> | void;
      };
    }
  ).modelContext;
  if (!context) return;
  const lifecycle = new AbortController();
  const register = (tool: unknown) => {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  };
  const bag = async () => {
    const state = useApp.getState();
    return {
      items: (state.cart ?? []).map((l) => ({
        productId: l.productId,
        name: l.product.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        lenses: l.addOns.map((a) => a.name),
      })),
      subtotal: state.subtotal ?? 0,
      quote:
        state.user && !state.user.guest && state.cart?.length
          ? await quote(state.draft.delivery ?? "standard", state.promo)
          : null,
      currency: "USD cents",
    };
  };
  register({
    name: "search_eyewear",
    title: "Search eyewear",
    description: "Read a server page of FORMA frames.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", maxLength: 100 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input: unknown) {
      const { query = "" } = z
        .object({ query: z.string().max(100).optional() })
        .strict()
        .parse(input ?? {});
      const result = await queryCatalog({ search: query, pageSize: 6 });
      return {
        total: result.total,
        items: result.items.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          priceCents: p.price,
          shape: p.shape,
          material: p.material,
          colors: p.colors,
          widths: p.sizes,
          available: p.stock > 0,
        })),
      };
    },
  });
  register({
    name: "read_shopping_bag",
    title: "Read shopping bag",
    description: "Read the bag and the server quote when signed in.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: bag,
  });
  register({
    name: "add_frame_to_bag",
    title: "Add a frame to bag",
    description:
      "Add a chosen frame with included non-prescription lenses. Does not place an order.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["productId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input: unknown) {
      const value = z
        .object({
          productId: z.string(),
          quantity: z.number().int().min(1).max(20).default(1),
        })
        .strict()
        .parse(input);
      const p = await loadProduct(value.productId);
      await useApp
        .getState()
        .perform("/cart", "POST", {
          productId: p.id,
          size: p.sizes[0],
          color: p.colors[0],
          lens: "non-prescription",
          coating: p.finishes.find((f) => f.isDefault)?.id ?? "standard",
          quantity: value.quantity,
          prescription: null,
        });
      return bag();
    },
  });
  register({
    name: "start_checkout",
    title: "Start checkout",
    description:
      "Open account-required demo checkout. Does not submit an order or charge a payment.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() {
      if (!useApp.getState().cart?.length)
        throw new Error("Your bag is empty.");
      history.pushState({}, "", "/checkout");
      dispatchEvent(new PopStateEvent("popstate"));
      return { checkoutStarted: true };
    },
  });
  return () => lifecycle.abort();
}
