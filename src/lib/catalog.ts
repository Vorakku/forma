import { useEffect, useState } from "react";
import { catalogParams, queryCatalog } from "./backend";
import { useApp } from "./store";
import type { CatalogPage, Product } from "./types";
export const FILTER_GROUPS = {
  shape: [
    "Rectangle",
    "Round",
    "Cat-eye",
    "Square",
    "Aviator",
    "Browline",
    "Geometric",
    "Oval",
  ],
  material: ["Acetate", "Metal", "Mixed"],
  fit: ["Standard", "Narrow", "Wide"],
} as const;
export const SORTS = [
  ["recommended", "Recommended"],
  ["newest", "Newest"],
  ["price-asc", "Price: low to high"],
  ["price-desc", "Price: high to low"],
  ["rating", "Top rated"],
] as const;
export const PRICE_MIN = 130,
  PRICE_MAX = 200,
  PAGE_SIZE = 6;
export function useCatalog(params: URLSearchParams, enabled = true) {
  const key = params.toString();
  const [state, setState] = useState<{
    page: CatalogPage | null;
    error: string;
    loading: boolean;
  }>({ page: null, error: "", loading: true });
  useEffect(() => {
    let live = true;
    if (!enabled) return;
    setState({ page: null, error: "", loading: true });
    void queryCatalog(catalogParams(new URLSearchParams(key))).then(
      (page) => {
        if (live) {
          useApp.getState().rememberProducts();
          setState({ page, error: "", loading: false });
        }
      },
      (error) => {
        if (live)
          setState({ page: null, error: error.message, loading: false });
      },
    );
    return () => {
      live = false;
    };
  }, [key, enabled]);
  return state;
}
export function catalogHref(
  params: URLSearchParams,
  changes: Record<string, string | number | null | undefined>,
) {
  const p = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    p.delete(key);
    if (value !== null && value !== undefined && value !== "")
      p.set(key, String(value));
  }
  return "/catalog" + (p.size ? "?" + p : "");
}
export const colorIndex = (p: Product, color: string) =>
  Math.max(0, p.colors.indexOf(color));
export const imageFilter = (p: Product | undefined, color: string | number) =>
  p?.swatches[typeof color === "number" ? color : colorIndex(p, color)]
    ?.filter ?? "none";
