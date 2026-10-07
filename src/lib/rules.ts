// Display helpers only. Prices, stock validation, shipping and discounts live on the server.
import type { Product } from "./types";
export const lensLabel = (product: Product, lens: string, coating: string) =>
  `${product.lenses.find((l) => l.id === lens)?.name ?? lens} · ${product.finishes.find((c) => c.id === coating)?.name ?? coating}`;
export const READING_POWERS = Array.from({ length: 15 }, (_, i) =>
  (0.5 + i * 0.25).toFixed(2),
);
export const SUPPORT_TOPICS = [
  "Frame & fit",
  "Lenses",
  "Delivery",
  "Returns",
  "Something else",
] as const;
