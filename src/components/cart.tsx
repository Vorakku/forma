import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Modal, Empty, ProductImage, NONE, FormError } from "./common";
import { LensEditor } from "./lens-editor";
import { useApp } from "@/lib/store";
import { quote } from "@/lib/backend";
import { lensLabel } from "@/lib/rules";
import { money } from "@/lib/utils";
import type { CartLine as Line, Quote } from "@/lib/types";
export const useBag = () => useApp((s) => s.cart ?? NONE);
export const bagCount = (cart: Line[]) =>
  cart.reduce((n, l) => n + l.quantity, 0);
export function useQuote(delivery = "standard") {
  const version = useApp((s) => s.cartVersion),
    promo = useApp((s) => s.promo),
    user = useApp((s) => s.user),
    cart = useBag();
  const [result, setResult] = useState<{
    value: Quote | null;
    error: string;
    loading: boolean;
  }>({ value: null, error: "", loading: false });
  useEffect(() => {
    let live = true;
    setResult({
      value: null,
      error: "",
      loading: !!cart.length && !user?.guest,
    });
    if (cart.length && user && !user.guest)
      void quote(delivery, promo).then(
        (value) => {
          if (live) setResult({ value, error: "", loading: false });
        },
        (error) => {
          if (live)
            setResult({ value: null, error: error.message, loading: false });
        },
      );
    return () => {
      live = false;
    };
  }, [version, promo, delivery, user?.id, cart.length]);
  return result;
}
export function bagProblem(cart: Line[]) {
  return !cart.length
    ? "Your bag is empty."
    : cart.some((l) => !l.available)
      ? "A frame or lens selection is unavailable. Edit your bag to continue."
      : "";
}
export function useStartCheckout() {
  const navigate = useNavigate(),
    cart = useBag();
  return () => {
    const problem = bagProblem(cart);
    if (problem) toast(problem);
    else navigate("/checkout");
  };
}
export function CartLine({ line }: { line: Line }) {
  const perform = useApp((s) => s.perform),
    busy = useApp((s) => s.busy) > 0,
    [editing, setEditing] = useState(false),
    p = line.product;
  const setQuantity = (quantity: number) =>
    perform("/cart/" + line.id, "PATCH", { quantity }).catch(() => {});
  const remove = async () => {
    const { productId, size, color, lens, coating, prescription, quantity } =
      line;
    try {
      await perform("/cart/" + line.id, "DELETE");
    } catch {
      return;
    }
    toast("Pair removed from your bag.", {
      action: {
        label: "Undo",
        onClick: () =>
          perform("/cart", "POST", {
            productId,
            size,
            color,
            lens,
            coating,
            prescription,
            quantity,
          }).then(
            () => toast("Pair restored to your bag."),
            () => {},
          ),
      },
    });
  };
  return (
    <article className="cart-line">
      <Link className="cart-image" to={"/product/" + p.slug}>
        <ProductImage product={p} color={line.color} />
      </Link>
      <div>
        <div className="line-top">
          <Link to={"/product/" + p.slug}>
            <h3>{p.name}</h3>
          </Link>
          <span>{money(line.lineTotal)}</span>
        </div>
        <p className="line-meta">
          {line.color} / {line.size}
          <br />
          {line.addOns.map((a) => a.name).join(" · ")}
          {line.prescription && (
            <>
              <br />
              Prescription on file for this pair
            </>
          )}
        </p>
        {!line.available && (
          <p role="alert">Choose your frame and lenses again.</p>
        )}
        <div className="line-bottom">
          <div className="qty-control">
            <button
              type="button"
              aria-label={`Decrease ${p.name} quantity`}
              disabled={busy || line.quantity <= 1}
              onClick={() => setQuantity(line.quantity - 1)}
            >
              −
            </button>
            <span aria-live="polite">{line.quantity}</span>
            <button
              type="button"
              aria-label={`Increase ${p.name} quantity`}
              disabled={busy || line.quantity >= 20}
              onClick={() => setQuantity(line.quantity + 1)}
            >
              +
            </button>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              className="remove"
              onClick={() => setEditing(true)}
            >
              Edit lenses
            </button>
            <button
              type="button"
              className="remove"
              disabled={busy}
              onClick={remove}
            >
              Remove
            </button>
          </div>
        </div>
      </div>
      {editing && (
        <LensEditor
          product={p}
          value={line}
          onClose={() => setEditing(false)}
          onSave={async (selection) => {
            await perform(
              "/cart/" + line.id,
              "PATCH",
              {
                lens: selection.lens,
                coating: selection.coating,
                prescription: selection.prescription,
              },
              { silent: true },
            );
            setEditing(false);
            toast("Lens selection saved.");
          }}
        />
      )}
    </article>
  );
}
export function PromoBox({ delivery = "standard" }: { delivery?: string }) {
  const promo = useApp((s) => s.promo),
    setPromo = useApp((s) => s.setPromo),
    user = useApp((s) => s.user);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const apply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .trim()
      .toUpperCase();
    setBusy(true);
    setError("");
    try {
      await quote(delivery, code);
      setPromo(code);
      toast("Discount code applied.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (user?.guest)
    return (
      <p className="form-note">
        <Link to="/account?next=checkout">Sign in</Link> to apply a discount
        code at checkout.
      </p>
    );
  return (
    <>
      {promo ? (
        <div className="discount-applied">
          <span>{promo}</span>
          <button
            type="button"
            onClick={() => setPromo(null)}
            aria-label="Remove discount code"
          >
            ×
          </button>
        </div>
      ) : (
        <form className="promo-form" onSubmit={apply}>
          <input
            name="code"
            placeholder="Discount code"
            aria-label="Discount code"
            required
          />
          <button type="submit" disabled={busy}>
            Apply
          </button>
        </form>
      )}
      <FormError message={error} />
      <p className="promo-hint">
        Try WELCOME10 for 10% off, or FORMA20 on $200+.
      </p>
    </>
  );
}
export function CartDrawer() {
  const open = useApp((s) => s.panel === "cart"),
    setPanel = useApp((s) => s.setPanel),
    cart = useBag(),
    subtotal = useApp((s) => s.subtotal ?? 0),
    checkout = useStartCheckout(),
    count = bagCount(cart);
  return (
    <Modal
      open={open}
      onOpenChange={(value) => setPanel(value ? "cart" : null)}
      title={"Your bag" + (count ? ` (${count})` : "")}
      variant="drawer"
    >
      <div className="modal-body">
        {cart.length ? (
          cart.map((line) => <CartLine key={line.id} line={line} />)
        ) : (
          <Empty
            title="Room for a favorite."
            copy="Your bag is empty. Let’s find your next pair."
          />
        )}
      </div>
      {cart.length > 0 && (
        <div className="modal-footer">
          <div className="drawer-total">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <p className="drawer-shipping">
            Delivery and discounts calculated at checkout.
          </p>
          <button type="button" className="button full" onClick={checkout}>
            Continue to checkout
          </button>
          <Link
            className="text-button"
            to="/cart"
            style={{
              display: "block",
              textAlign: "center",
              margin: "16px auto 0",
              width: "max-content",
            }}
          >
            View your bag
          </Link>
        </div>
      )}
    </Modal>
  );
}
