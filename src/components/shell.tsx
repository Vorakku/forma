import { useEffect, useState, type FormEvent } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, Heart, UserRound, ShoppingBag, Menu } from "lucide-react";
import { Modal, ProductImage, NONE } from "./common";
import { CartDrawer, bagCount, useBag } from "./cart";
import { useApp, useProductList } from "@/lib/store";

import { useCatalog } from "@/lib/catalog";
import { money } from "@/lib/utils";
import type { Product } from "@/lib/types";
const NAV = [
  ["/catalog", "All eyewear"],
  ["/catalog?category=optical", "Optical glasses"],
  ["/catalog?category=sun", "Sunglasses"],
  ["/catalog?sort=newest", "New perspectives"],
  ["/guide", "The lens guide"],
  ["/about", "Our world"],
  ["/try-on", "3D Demo"],
  ["/v2-demo", "FORMA V2 DEMO"],
] as const;
const TITLES: Record<string, string> = {
  catalog: "The collection",
  checkout: "Checkout",
  account: "Your account",
  cart: "Your bag",
  orders: "Your orders",
  wishlist: "Saved frames",
  guide: "Lens & fit guide",
  about: "Our world",
  help: "Help",
  legal: "The small print",
  "try-on": "3D Demo",
  "v2-demo": "FORMA V2 Demo",
};
export const Wordmark = () => (
  <Link className="wordmark" to="/" aria-label="FORMA home">
    FORMA<span className="wordmark-dot">®</span>
  </Link>
);
export function Shell() {
  const location = useLocation(),
    navigate = useNavigate(),
    cart = useBag(),
    setPanel = useApp((s) => s.setPanel),
    products = useApp((s) => s.products),
    count = bagCount(cart);
  // Runs on navigation only, not when product data refreshes.
  useEffect(() => {
    setPanel(null);
    const [section, id] = location.pathname.split("/").filter(Boolean);
    document.title =
      section === "product"
        ? `${products.find((p) => p.id === id || p.slug === id)?.name ?? "Frame"} — FORMA`
        : TITLES[section]
          ? `${TITLES[section]} — FORMA`
          : "FORMA — A new perspective";
  }, [location.pathname, location.search]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  const here = location.pathname + location.search;
  // The V2 demo is one full-screen scroll animation: the header floats over it
  // and there is no footer to scroll into.
  const immersive = location.pathname === "/v2-demo";
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header
        className={`site-header${immersive ? " site-header-floating" : ""}`}
      >
        <div className="header-main">
          <div className="header-left">
            <button
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setPanel("menu")}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <Link className="small-link desktop" to="/guide">
              A better way to see
            </Link>
          </div>
          <Wordmark />
          <div className="header-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => setPanel("search")}
              aria-label="Search frames"
            >
              <Search />
            </button>
            <Link
              className="icon-button wishlist-link desktop"
              to="/wishlist"
              aria-label="Saved frames"
            >
              <Heart />
            </Link>
            <Link
              className="icon-button account-link"
              to="/account"
              aria-label="Your account"
            >
              <UserRound />
            </Link>
            <button
              type="button"
              className="icon-button bag-link"
              onClick={() => setPanel("cart")}
              aria-label={`Shopping bag, ${count} items`}
            >
              <ShoppingBag />
              {count > 0 && <span className="bag-count">{count}</span>}
            </button>
          </div>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map(([to, label]) => (
            <Link
              key={to}
              to={to}
              aria-current={here === to ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {/* Frame selection updates the query without restarting the camera. */}
      <main
        id="main"
        tabIndex={-1}
        key={location.pathname}
        className="flow-fade"
      >
        <Outlet />
      </main>
      {!immersive && <Footer />}
      <CompareBar />
      <MenuDrawer />
      <SearchDialog
        onSearch={(q) => navigate("/catalog?q=" + encodeURIComponent(q))}
      />
      <CartDrawer />
    </>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Wordmark />
          <p>Frames for every version of you.</p>
        </div>
      </div>
      <div className="footer-links">
        <div>
          <strong>Find your frame</strong>
          <Link to="/catalog?category=optical">Optical glasses</Link>
          <Link to="/catalog?category=sun">Sunglasses</Link>
          <Link to="/wishlist">Saved frames</Link>
        </div>
        <div>
          <strong>Here to help</strong>
          <Link to="/help">Contact & FAQs</Link>
          <Link to="/orders">Track an order</Link>
          <Link to="/help?topic=shipping">Shipping & returns</Link>
          <Link to="/guide">Lens & fit guide</Link>
        </div>
        <div>
          <strong>Your FORMA</strong>
          <Link to="/account">Your account</Link>
          <Link to="/orders">Orders</Link>
          <Link to="/account?tab=addresses">Address book</Link>
        </div>
        <div>
          <strong>Made with intention</strong>
          <p>
            Thoughtful details.
            <br />
            Beautifully useful design.
            <br />A pair that feels like you.
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} FORMA Eyewear</span>
        <div>
          <Link to="/legal?type=privacy">Privacy</Link>
          <Link to="/legal?type=terms">Terms</Link>
          <span>USD $ · English</span>
        </div>
        <span className="demo-label">Demo store · No real payments</span>
      </div>
    </footer>
  );
}
function MenuDrawer() {
  const open = useApp((s) => s.panel === "menu"),
    setPanel = useApp((s) => s.setPanel);
  return (
    <Modal
      open={open}
      onOpenChange={(o) => setPanel(o ? "menu" : null)}
      title="FORMA"
      variant="drawer"
    >
      <div className="modal-body">
        <nav className="mobile-nav-links">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to}>
              {label === "The lens guide" ? "Lens & fit guide" : label}
            </Link>
          ))}
        </nav>
        <div className="mobile-nav-bottom">
          <Link to="/account">Your account</Link>
          <Link to="/wishlist">Saved frames</Link>
          <Link to="/help">Help</Link>
        </div>
      </div>
    </Modal>
  );
}
function SearchDialog({ onSearch }: { onSearch: (q: string) => void }) {
  const open = useApp((s) => s.panel === "search"),
    setPanel = useApp((s) => s.setPanel),
    products = useApp((s) => s.products);
  const [q, setQ] = useState("");
  const result = useCatalog(
      new URLSearchParams({ q: q.trim() }),
      open && !!q.trim(),
    ),
    results = result.page?.items ?? [];
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        setPanel(o ? "search" : null);
        if (!o) setQ("");
      }}
      title="Find your perspective."
    >
      <div className="modal-body">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onSearch(q.trim());
          }}
        >
          <div className="search-field">
            <Search aria-hidden="true" />
            <input
              type="search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try The Ellis, Margot, or FORMA"
              aria-label="Search frames"
              autoComplete="off"
              maxLength={100}
              autoFocus
            />
            <button className="text-button" type="submit">
              Search
            </button>
          </div>
        </form>
        <div className="search-results" aria-live="polite">
          {!q.trim() ? (
            <>
              <span className="eyebrow">A few starting points</span>
              {["The Ellis", "The Margot", "The Jules", "FORMA"].map((s) => (
                <button
                  type="button"
                  key={s}
                  className="search-suggestion"
                  onClick={() => setQ(s)}
                >
                  {s}
                </button>
              ))}
              <p className="form-note" style={{ marginTop: 25 }}>
                Search by frame name or brand. Use the collection filters for
                shape, material and fit.
              </p>
            </>
          ) : result.loading ? (
            <p role="status">Loading frames…</p>
          ) : result.error ? (
            <p role="alert">{result.error}</p>
          ) : results.length ? (
            <>
              {results.slice(0, 6).map((p: Product) => (
                <Link
                  key={p.id}
                  to={"/product/" + p.id}
                  className="search-result"
                >
                  <ProductImage product={p} />
                  <div>
                    {p.name}
                    <small>
                      {p.shape} / {p.material}
                    </small>
                  </div>
                  <span>{money(p.price)}</span>
                </Link>
              ))}
              <button
                type="button"
                className="button outline full"
                style={{ marginTop: 20 }}
                onClick={() => onSearch(q.trim())}
              >
                See all {result.page?.total ?? 0} results
              </button>
            </>
          ) : (
            <p className="muted small">
              No frames found. Try another frame name or brand.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
function CompareBar() {
  const ids = useApp((s) => s.compare ?? NONE),
    setCompare = useApp((s) => s.setCompare),
    selection = useProductList(ids);
  const [open, setOpen] = useState(false);
  const list = selection.products;
  if (!ids.length) return null;
  return (
    <>
      <div className="compare-bar">
        <span>
          {selection.loading
            ? "Loading comparison…"
            : selection.error ||
              (!list.length
                ? "Selected frames are no longer available."
                : `${list.length}/3 frames selected`)}
        </span>
        <button
          type="button"
          onClick={() =>
            list.length < 2
              ? toast("Choose at least two frames to compare.")
              : setOpen(true)
          }
        >
          Compare frames
        </button>
        <button
          type="button"
          className="compare-close"
          onClick={() => setCompare([])}
          aria-label="Clear comparison"
        >
          ×
        </button>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="A side-by-side perspective."
        variant="wide"
      >
        <div className="modal-body">
          <div className="comparison-grid">
            {list.map((p) => (
              <div key={p.id}>
                <div className="compare-image">
                  <ProductImage product={p} />
                </div>
                <h3>{p.name}</h3>
                <p style={{ fontSize: ".875rem", marginTop: 10 }}>
                  {money(p.price)}
                </p>
                <div className="spec-grid">
                  <div>
                    <span>Shape</span>
                    {p.shape}
                  </div>
                  <div>
                    <span>Material</span>
                    {p.material}
                  </div>
                  <div>
                    <span>Dimensions (mm)</span>
                    {p.dimensions}
                  </div>
                  <div>
                    <span>Weight</span>
                    {p.weight}
                  </div>
                  <div>
                    <span>Available widths</span>
                    {p.sizes.join(", ")}
                  </div>
                  <div>
                    <span>Rating</span>
                    {p.rating.toFixed(1)} / 5
                  </div>
                </div>
                <Link
                  className="button small full"
                  to={"/product/" + p.id}
                  onClick={() => setOpen(false)}
                >
                  Explore frame
                </Link>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
