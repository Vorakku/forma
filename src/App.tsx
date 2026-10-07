import { Component, useEffect, lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useApp } from "@/lib/store";
import { Shell } from "@/components/shell";
import { NotFound } from "@/components/common";
import { Home, Catalog, ProductDetail, Wishlist } from "@/pages/shop";
const AuthPage = lazy(() =>
  import("@/pages/auth").then((m) => ({ default: m.AuthPage })),
);
function RequireAccount({ children }: { children: ReactNode }) {
  const user = useApp((s) => s.user),
    location = useLocation();
  return user && !user.guest ? (
    children
  ) : (
    <AuthPage next={location.pathname + location.search} />
  );
}
const Cart = lazy(() =>
  import("@/pages/checkout").then((m) => ({ default: m.Cart })),
);
const Checkout = lazy(() =>
  import("@/pages/checkout").then((m) => ({ default: m.Checkout })),
);
const Confirmation = lazy(() =>
  import("@/pages/checkout").then((m) => ({ default: m.Confirmation })),
);
const Orders = lazy(() =>
  import("@/pages/orders").then((m) => ({ default: m.Orders })),
);
const OrderDetail = lazy(() =>
  import("@/pages/orders").then((m) => ({ default: m.OrderDetail })),
);
const Account = lazy(() =>
  import("@/pages/profile").then((m) => ({ default: m.Account })),
);
const Guide = lazy(() =>
  import("@/pages/help").then((m) => ({ default: m.Guide })),
);
const About = lazy(() =>
  import("@/pages/help").then((m) => ({ default: m.About })),
);
const Help = lazy(() =>
  import("@/pages/help").then((m) => ({ default: m.Help })),
);
const Legal = lazy(() =>
  import("@/pages/help").then((m) => ({ default: m.Legal })),
);
const TryOn = lazy(() =>
  import("@/pages/try-on").then((m) => ({ default: m.TryOn })),
);
const V2Demo = lazy(() =>
  import("@/pages/v2-demo").then((m) => ({ default: m.V2Demo })),
);
const OfflineV2Demo = lazy(() =>
  import("@/pages/v2-demo").then((m) => ({ default: m.OfflineV2Demo })),
);
const Mark = () => (
  <span className="wordmark">
    FORMA<span className="wordmark-dot">®</span>
  </span>
);
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(e: Error) {
    console.error("FORMA view error", e);
  }
  render() {
    return this.state.error ? (
      <div className="startup-state">
        <Mark />
        <h1>This view could not load</h1>
        <p>Your bag and orders are still saved.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload FORMA
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const { init, ready, error } = useApp();
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    if (error) console.warn("FORMA is offline, showing the V2 demo:", error);
  }, [error]);
  // Agent tools (and zod) load only in browsers that expose WebMCP.
  useEffect(() => {
    if (!ready || !("modelContext" in document)) return;
    let off: (() => void) | undefined,
      live = true;
    void import("@/lib/web-tools").then((m) => {
      if (live) off = m.registerWebTools();
    });
    return () => {
      live = false;
      off?.();
    };
  }, [ready]);
  return (
    <ErrorBoundary>
      <Toaster
        position="bottom-center"
        duration={4800}
        expand
        visibleToasts={3}
        toastOptions={{ unstyled: true, classNames: { toast: "toast" } }}
      />
      {ready ? (
        <Suspense
          fallback={
            <div className="startup-state">
              <p>Loading…</p>
            </div>
          }
        >
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/cart" element={<Cart />} />
              <Route
                path="/checkout"
                element={
                  <RequireAccount>
                    <Checkout />
                  </RequireAccount>
                }
              />
              <Route
                path="/confirmation/:id"
                element={
                  <RequireAccount>
                    <Confirmation />
                  </RequireAccount>
                }
              />
              <Route
                path="/orders"
                element={
                  <RequireAccount>
                    <Orders />
                  </RequireAccount>
                }
              />
              <Route
                path="/order/:id"
                element={
                  <RequireAccount>
                    <OrderDetail />
                  </RequireAccount>
                }
              />
              <Route
                path="/account"
                element={
                  <RequireAccount>
                    <Account />
                  </RequireAccount>
                }
              />
              <Route path="/guide" element={<Guide />} />
              <Route path="/about" element={<About />} />
              <Route
                path="/help"
                element={
                  <RequireAccount>
                    <Help />
                  </RequireAccount>
                }
              />
              <Route path="/legal" element={<Legal />} />
              <Route path="/try-on" element={<TryOn />} />
              <Route path="/v2-demo" element={<V2Demo />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      ) : error ? (
        // Without the server there is no store to show, only the V2 scroll.
        <Suspense fallback={null}>
          <OfflineV2Demo />
        </Suspense>
      ) : (
        <div className="startup-state">
          <Mark />
          <p>Getting your frames ready…</p>
        </div>
      )}
    </ErrorBoundary>
  );
}
