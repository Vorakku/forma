import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { X, Heart, ShoppingBag, Search } from "lucide-react";
import { useApp, useProduct, useProductList } from "@/lib/store";
import { imageFilter } from "@/lib/catalog";
import type { Quote } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import type { CartLine, OrderItem, OrderStatus, Product } from "@/lib/types";
// Modals open from state, not a Dialog.Trigger, so Radix has no trigger to refocus; return focus to whatever opened it.
export function Modal({
  open,
  onOpenChange,
  title,
  variant,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  variant?: "drawer" | "wide";
  children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const head = (
    <div className="modal-head">
      <Dialog.Title asChild>
        <h2>{title}</h2>
      </Dialog.Title>
      <Dialog.Close className="icon-button" aria-label="Close dialog">
        <X />
      </Dialog.Close>
    </div>
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-backdrop" />
        <Dialog.Content
          className={cn("overlay", variant)}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(e) => {
            if (
              opener.current?.isConnected &&
              opener.current !== document.body
            ) {
              e.preventDefault();
              opener.current.focus();
            }
          }}
        >
          {variant === "drawer" ? (
            <div className="drawer-content">
              {head}
              {children}
            </div>
          ) : (
            <>
              {head}
              {children}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Breadcrumb({
  parts,
}: {
  parts: { label: string; to?: string }[];
}) {
  return (
    <div className="breadcrumb">
      <Link to="/">Home</Link>
      {parts.map((p) => (
        <span key={p.label} style={{ display: "contents" }}>
          <span>/</span>
          {p.to ? <Link to={p.to}>{p.label}</Link> : <span>{p.label}</span>}
        </span>
      ))}
    </div>
  );
}
export function PageTitle({
  title,
  copy,
  children,
}: {
  title: ReactNode;
  copy?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {copy && <p>{copy}</p>}
      </div>
      {children}
    </div>
  );
}
export const NONE: never[] = [];
export function NotFound() {
  return (
    <div className="page-wrap">
      <Empty
        title="A different perspective?"
        copy="We couldn’t find that page. Your next favorite pair is still out there."
        icon={Search}
      />
    </div>
  );
}
export function Empty({
  title,
  copy,
  to = "/catalog",
  label = "Explore eyewear",
  icon: Icon = ShoppingBag,
}: {
  title: string;
  copy: string;
  to?: string;
  label?: string;
  icon?: typeof ShoppingBag;
}) {
  return (
    <div className="empty-state">
      <Icon aria-hidden="true" />
      <h2>{title}</h2>
      <p>{copy}</p>
      <Link className="button" to={to}>
        {label}
      </Link>
    </div>
  );
}
export function ProductImage({
  product,
  color = 0,
  ...props
}: { product?: Product; color?: string | number } & Omit<
  React.ComponentProps<"img">,
  "color"
>) {
  if (!product) return <img alt="" {...props} />;
  const name = typeof color === "number" ? product.colors[color] : color;
  return (
    <img
      src={product.image}
      alt={`${product.name} in ${name}`}
      style={{ filter: imageFilter(product, color) }}
      {...props}
    />
  );
}
export const Stars = ({ n }: { n: number }) => (
  <span className="stars" aria-label={`${n} out of 5 stars`}>
    {"★".repeat(n) + "☆".repeat(5 - n)}
  </span>
);
export function FormError({ message }: { message: string }) {
  return (
    <div className={cn("form-error", message && "visible")} role="alert">
      {message}
    </div>
  );
}
// Busy state plus an inline error, the way FORMA's forms report problems in place.
export function useSubmit() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit =
    (
      fn: (
        values: Record<string, string>,
        form: HTMLFormElement,
      ) => Promise<unknown> | unknown,
    ) =>
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;
      const form = e.currentTarget;
      setError("");
      setBusy(true);
      try {
        await fn(formValues(form), form);
      } catch (err) {
        setError(
          (err as Error).message || "Please check the details and try again.",
        );
      } finally {
        setBusy(false);
      }
    };
  return { error, busy, submit, setError };
}
export const formValues = (form: HTMLFormElement) =>
  Object.fromEntries(
    [...new FormData(form)].map(([k, v]) => [
      k,
      typeof v === "string" && !/password/i.test(k) ? v.trim() : String(v),
    ]),
  );
export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Confirmed",
  processing: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
export const Status = ({ status }: { status: OrderStatus }) => (
  <span className={cn("status-badge", status === "cancelled" && "cancelled")}>
    {STATUS_LABEL[status] ?? status}
  </span>
);
export function WishlistButton({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const saved = useApp((s) => s.wishlist?.includes(product.id) ?? false),
    perform = useApp((s) => s.perform),
    navigate = useNavigate();
  return (
    <button
      type="button"
      className={cn("heart", saved && "saved", className)}
      aria-label={saved ? "Remove from saved frames" : "Add to saved frames"}
      aria-pressed={saved}
      onClick={async () => {
        try {
          await perform("/wishlist/" + product.id);
          toast(
            saved
              ? "Frame removed from saved frames."
              : "Frame saved for another look.",
            saved
              ? undefined
              : {
                  action: {
                    label: "View saved",
                    onClick: () => navigate("/wishlist"),
                  },
                },
          );
        } catch {}
      }}
    >
      <Heart />
    </button>
  );
}
export function ProductCard({
  product: p,
  compare = false,
}: {
  product: Product;
  compare?: boolean;
}) {
  const [color, setColor] = useState(0);
  const compared = useApp((s) => s.compare),
    setCompare = useApp((s) => s.setCompare);
  const to = `/product/${p.id}${color ? "?color=" + color : ""}`;
  return (
    <article className="product-card">
      <WishlistButton product={p} />
      <Link className="product-visual" to={to}>
        {p.tag && (
          <span className="product-badge">{p.stock ? p.tag : "Sold out"}</span>
        )}
        <ProductImage
          product={p}
          color={color}
          loading="lazy"
          width="384"
          height="342"
        />
      </Link>
      <div className="product-info">
        <Link className="product-title-line" to={to}>
          <h3>{p.name}</h3>
          <span className="price">
            {p.originalPrice > p.price && <del>{money(p.originalPrice)}</del>}
            {money(p.price)}
          </span>
        </Link>
        <p>
          {p.shape} · {p.material}
        </p>
        <div className="swatches">
          {p.colors.map((c, i) => (
            <button
              type="button"
              key={c}
              className={cn("swatch", i === color && "selected")}
              style={{ "--swatch": p.swatches[i]?.hex } as React.CSSProperties}
              title={c}
              aria-label={c}
              aria-pressed={i === color}
              onClick={() => setColor(i)}
            />
          ))}
          <span className="rating-mini">
            <span className="star">★</span> {p.rating.toFixed(1)}
          </span>
        </div>
        {compare && (
          <label className="compare-check">
            <input
              type="checkbox"
              checked={compared.includes(p.id)}
              onChange={(e) => {
                if (!e.target.checked)
                  return setCompare(compared.filter((id) => id !== p.id));
                if (compared.length >= 3) {
                  toast("Compare up to three frames at a time.");
                  return;
                }
                setCompare([...compared, p.id]);
              }}
            />{" "}
            Compare frame
          </label>
        )}
      </div>
    </article>
  );
}
export function ProductGrid({
  products,
  compare = false,
}: {
  products: Product[];
  compare?: boolean;
}) {
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} compare={compare} />
      ))}
    </div>
  );
}
export function RecentSection({ except = "" }: { except?: string }) {
  const recent = useApp((s) => s.recent),
    clear = useApp((s) => s.clearRecent);
  const selection = useProductList(recent.filter((id) => id !== except));
  const list = selection.products.slice(0, 4);
  return recent.some((id) => id !== except) ? (
    <section className="section">
      <div className="section-head">
        <div>
          <span className="eyebrow">Worth a second look</span>
          <h2>Recently viewed.</h2>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            clear();
            toast("Recently viewed frames cleared.");
          }}
        >
          Clear history
        </button>
      </div>
      {selection.loading ? (
        <p role="status">Loading recently viewed frames…</p>
      ) : selection.error ? (
        <p role="alert">{selection.error}</p>
      ) : list.length ? (
        <ProductGrid products={list} />
      ) : (
        <p>These frames are no longer available.</p>
      )}
    </section>
  ) : null;
}
export function Totals({ t }: { t: Omit<Quote, "cartVersion"> }) {
  return (
    <>
      <div className="summary-row">
        <span>Subtotal</span>
        <span>{money(t.subtotal)}</span>
      </div>
      {t.discount > 0 && (
        <div className="summary-row">
          <span>Discount · {t.promo}</span>
          <span>−{money(t.discount)}</span>
        </div>
      )}
      <div className="summary-row">
        <span>Shipping</span>
        <span>{money(t.shipping)}</span>
      </div>
      <div className="summary-row total">
        <strong>Total</strong>
        <strong>{money(t.total)}</strong>
      </div>
    </>
  );
}
function SummaryItem({ item }: { item: OrderItem | CartLine }) {
  const product = useProduct(item.productId);
  return (
    <div className="order-summary-item">
      <ProductImage product={product} color={item.color} />
      <div>
        {"name" in item ? item.name : product?.name}
        <small>
          {item.color} · Qty {item.quantity}
          <br />
          {item.addOns.map((a) => a.name).join(" · ")}
        </small>
      </div>
      <span>{money(item.lineTotal)}</span>
    </div>
  );
}
export function SummaryItems({ items }: { items: (OrderItem | CartLine)[] }) {
  return (
    <div className="summary-product-list">
      {items.map((l, i) => (
        <SummaryItem key={"id" in l ? l.id : i} item={l} />
      ))}
    </div>
  );
}
