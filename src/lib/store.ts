import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import * as backend from "./backend";
import type { Bootstrap, OrderAddress, Product } from "./types";
type Draft = {
  address?: OrderAddress;
  addressId?: string;
  delivery?: string;
  paymentMethodId?: string;
};
type State = Partial<Bootstrap> & {
  products: Product[];
  ready: boolean;
  error: string;
  busy: number;
  panel: "menu" | "search" | "cart" | null;
  recent: string[];
  compare: string[];
  guestWishlist: string[];
  promo: string | null;
  draft: Draft;
  init: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  ensureProducts: (ids: string[]) => Promise<void>;
  rememberProducts: () => void;
  sync: (data: Bootstrap) => void;
  perform: <T = any>(
    path: string,
    method?: string,
    body?: unknown,
    options?: { silent?: boolean },
  ) => Promise<T>;
  setPanel: (panel: State["panel"]) => void;
  viewProduct: (id: string) => void;
  clearRecent: () => void;
  setCompare: (ids: string[]) => void;
  setPromo: (code: string | null) => void;
  setDraft: (draft: Draft) => void;
  clearDraft: () => void;
};
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((s) => typeof s === "string"))].slice(0, max)
    : [];
let generation = 0;
export const useApp = create<State>()(
  persist(
    (set, get) => ({
      products: [],
      ready: false,
      error: "",
      busy: 0,
      panel: null,
      recent: [],
      compare: [],
      guestWishlist: [],
      promo: null,
      draft: {},
      sync: (data) => set(data),
      rememberProducts: () => set({ products: backend.cachedProducts() }),
      init: async () => {
        const current = ++generation;
        set({ error: "" });
        try {
          await backend.loadCatalog();
          let state = await backend.loadState(get().guestWishlist);
          if (!state.user.guest && get().guestWishlist.length) {
            await backend.syncWishlist(get().guestWishlist);
            set({ guestWishlist: [] });
            state = await backend.loadState([]);
          }
          if (current === generation)
            set({ ...state, products: backend.cachedProducts(), ready: true });
        } catch (error) {
          if (current === generation)
            set({ error: (error as Error).message, ready: false });
        }
      },
      refreshProducts: async () => {
        await backend.loadCatalog();
        get().rememberProducts();
      },
      ensureProducts: async (ids) => {
        await backend.loadProducts(strings(ids, 200));
        get().rememberProducts();
      },
      perform: async (path, method = "POST", body, { silent = false } = {}) => {
        set((s) => ({ busy: s.busy + 1 }));
        try {
          if (get().user?.guest && path.startsWith("/wishlist/")) {
            const id = path.slice("/wishlist/".length),
              saved = get().guestWishlist;
            const wishlist = saved.includes(id)
              ? saved.filter((x) => x !== id)
              : [id, ...saved].slice(0, 200);
            set({ guestWishlist: wishlist, wishlist });
            return { wishlist };
          }
          const result = await backend.perform(path, method, body, get());
          if (
            /^\/auth\/(register|login)$/.test(path) &&
            get().guestWishlist.length
          ) {
            await backend.syncWishlist(get().guestWishlist);
            set({ guestWishlist: [] });
          }
          if (
            path === "/checkout" ||
            path.startsWith("/orders/") ||
            path.endsWith("/reviews")
          )
            await get().refreshProducts();
          if (
            !["/auth/forgot", "/auth/reset", "/security/password"].includes(
              path,
            )
          ) {
            const state = await backend.loadState(get().guestWishlist);
            set({ ...state, products: backend.cachedProducts() });
            return {
              ...result,
              ...(/^\/auth\/(register|login)$/.test(path) ? state : { state }),
            };
          }
          return result;
        } catch (error) {
          if (!silent) toast((error as Error).message);
          throw error;
        } finally {
          set((s) => ({ busy: Math.max(0, s.busy - 1) }));
        }
      },
      setPanel: (panel) => set({ panel }),
      viewProduct: (id) =>
        set((s) => ({
          recent: [id, ...s.recent.filter((v) => v !== id)].slice(0, 12),
        })),
      clearRecent: () => set({ recent: [] }),
      setCompare: (compare) => set({ compare: compare.slice(0, 3) }),
      setPromo: (promo) => set({ promo }),
      setDraft: (draft) => set((s) => ({ draft: { ...s.draft, ...draft } })),
      clearDraft: () => set({ draft: {}, promo: null }),
    }),
    {
      name: "forma-device-v1",
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      // Prescription data and checkout contact details stay off persistent device storage.
      partialize: (s) => ({
        recent: s.recent,
        compare: s.compare,
        guestWishlist: s.guestWishlist,
        promo: s.promo,
      }),
      migrate: (saved) => {
        const p = (saved ?? {}) as Partial<State>;
        return {
          recent: strings(p.recent, 12),
          compare: strings(p.compare, 3),
          guestWishlist: strings(p.guestWishlist, 200),
          promo: typeof p.promo === "string" ? p.promo : null,
        };
      },
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<State>;
        return {
          ...current,
          recent: strings(p.recent, 12),
          compare: strings(p.compare, 3),
          guestWishlist: strings(p.guestWishlist, 200),
          promo: typeof p.promo === "string" ? p.promo : null,
        };
      },
    },
  ),
);
export function useProduct(id?: string) {
  const product = useApp((s) =>
    s.products.find((p) => p.id === id || p.slug === id),
  );
  const ensure = useApp((s) => s.ensureProducts);
  useEffect(() => {
    if (id && !product)
      void ensure([id]).catch((error) => toast(error.message));
  }, [id, !!product, ensure]);
  return product;
}

export function useProductList(ids: string[]) {
  const key = ids.join(",");
  const products = useApp((state) => state.products);
  const [status, setStatus] = useState({ loading: true, error: "" });
  useEffect(() => {
    let live = true;
    setStatus({ loading: true, error: "" });
    void useApp
      .getState()
      .ensureProducts(key ? key.split(",") : [])
      .then(
        () => {
          if (live) setStatus({ loading: false, error: "" });
        },
        (error) => {
          if (live) setStatus({ loading: false, error: error.message });
        },
      );
    return () => {
      live = false;
    };
  }, [key]);
  return {
    ...status,
    products: ids
      .map((id) =>
        products.find((product) => product.id === id || product.slug === id),
      )
      .filter((product): product is Product => !!product),
  };
}
