import { useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Check } from "lucide-react";
import {
  Breadcrumb,
  Empty,
  FormError,
  NotFound,
  PageTitle,
  SummaryItems,
  Totals,
  NONE,
  useSubmit,
} from "@/components/common";
import {
  AddressFields,
  AddressText,
  addressFrom,
} from "@/components/address-fields";
import {
  CartLine,
  PromoBox,
  bagCount,
  useBag,
  useQuote,
  useStartCheckout,
} from "@/components/cart";
import { useApp } from "@/lib/store";
import { date, money, uuid } from "@/lib/utils";
import type { Address, Order, PaymentMethod } from "@/lib/types";
export function Cart() {
  const cart = useBag(),
    subtotal = useApp((s) => s.subtotal ?? 0),
    checkout = useStartCheckout(),
    count = bagCount(cart);
  return (
    <div className="page-wrap">
      <Breadcrumb parts={[{ label: "Your bag" }]} />
      <PageTitle
        title="Your bag."
        copy={
          count
            ? `${count} ${count === 1 ? "pair" : "pairs"}, one fresh perspective.`
            : undefined
        }
      />
      {cart.length ? (
        <div className="bag-page">
          <section>
            {cart.map((line) => (
              <CartLine key={line.id} line={line} />
            ))}
            <Link className="text-button" to="/catalog">
              Keep exploring
            </Link>
          </section>
          <aside className="summary-box">
            <h3>Bag summary</h3>
            <div className="summary-row">
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <p className="form-note">
              Delivery and discounts are quoted at checkout.
            </p>
            <button type="button" className="button full" onClick={checkout}>
              Continue to checkout
            </button>
            <p className="form-note">
              Demo checkout · No real payment is collected.
            </p>
          </aside>
        </div>
      ) : (
        <Empty
          title="A little room for a new favorite."
          copy="Your bag is empty. Find a frame you love, then choose the lenses that suit your day."
        />
      )}
    </div>
  );
}
const steps = ["Your details", "Delivery", "Review & pay"];
export function Checkout() {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    cart = useBag(),
    user = useApp((s) => s.user)!;
  const addresses = useApp((s) => s.addresses ?? NONE),
    payments = useApp((s) => s.payments ?? NONE),
    methods = useApp((s) => s.shippingMethods ?? NONE);
  const draft = useApp((s) => s.draft),
    setDraft = useApp((s) => s.setDraft),
    clearDraft = useApp((s) => s.clearDraft),
    promo = useApp((s) => s.promo),
    perform = useApp((s) => s.perform);
  const [addressId, setAddressId] = useState(
    draft.addressId ??
      addresses.find((a) => a.isDefault)?.id ??
      addresses[0]?.id ??
      "",
  );
  const [cardId, setCardId] = useState(
    draft.paymentMethodId ?? payments[0]?.id ?? "new",
  );
  const key = useRef(uuid()),
    { error, busy, submit } = useSubmit();
  const delivery =
    draft.delivery ??
    methods.find((m) => m.isDefault)?.code ??
    methods[0]?.code ??
    "standard";
  const q = useQuote(delivery),
    step = draft.addressId
      ? Math.min(3, Math.max(1, Number(params.get("step")) || 1))
      : 1;
  if (!cart.length)
    return (
      <div className="page-wrap">
        <Empty
          title="Your bag is empty."
          copy="Choose a pair before continuing to checkout."
        />
      </div>
    );
  const method = methods.find((m) => m.code === delivery);
  const selectedAddress = addresses.find((a) => a.id === addressId);
  const chooseAddress = (a: Address) => {
    setDraft({ address: { ...a, email: user.email }, addressId: a.id });
    navigate("/checkout?step=2");
  };
  const edit = (n: number) => (
    <Link className="text-button small" to={"/checkout?step=" + n}>
      {n === 1 ? "Edit details" : "Change delivery"}
    </Link>
  );
  return (
    <div className="page-wrap">
      <Breadcrumb
        parts={[{ label: "Your bag", to: "/cart" }, { label: "Checkout" }]}
      />
      <div className="checkout-layout">
        <section className="checkout-form">
          <div className="checkout-steps">
            {steps.map((name, i) => (
              <span
                key={name}
                className={i + 1 === step ? "active" : undefined}
              >
                <i>{i + 1 < step ? "✓" : i + 1}</i>
                {name}
              </span>
            ))}
          </div>
          {step === 1 ? (
            <>
              <h2>Where should we send your pair?</h2>
              <p>
                Shopping as {user.name}. Checkout addresses are saved in your
                account.
              </p>
              {addresses.length > 0 && (
                <div className="field">
                  <label htmlFor="saved-address">Use a saved address</label>
                  <select
                    id="saved-address"
                    value={addressId}
                    onChange={(event) => setAddressId(event.target.value)}
                  >
                    <option value="">Add a new address</option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.line1}, {a.city}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedAddress ? (
                <div className="detail-box">
                  <p>
                    <AddressText a={selectedAddress} />
                  </p>
                  <button
                    className="button"
                    onClick={() => chooseAddress(selectedAddress)}
                  >
                    Continue to delivery
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={submit(async (fields) => {
                    const saved = await perform<Address>(
                      "/addresses",
                      "POST",
                      addressFrom(fields),
                      { silent: true },
                    );
                    setAddressId(saved.id);
                    chooseAddress(saved);
                  })}
                >
                  <AddressFields address={draft.address} />
                  <FormError message={error} />
                  <div className="form-actions">
                    <Link className="text-button" to="/cart">
                      Back to bag
                    </Link>
                    <button className="button" disabled={busy}>
                      Continue to delivery
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : step === 2 ? (
            <>
              <h2>Choose your delivery.</h2>
              <div className="detail-box">
                <p>
                  <AddressText a={draft.address ?? {}} />
                </p>
                {edit(1)}
              </div>
              <form
                onSubmit={submit((fields) => {
                  setDraft({ delivery: fields.delivery });
                  navigate("/checkout?step=3");
                })}
              >
                {methods.map((m) => (
                  <label key={m.code} className="radio-card">
                    <input
                      type="radio"
                      name="delivery"
                      value={m.code}
                      defaultChecked={delivery === m.code}
                      required
                    />
                    <div>
                      <strong>{m.name} delivery</strong>
                      <p>{m.days} · Prescription lenses add 3–5 days.</p>
                    </div>
                    <span className="choice-price">{money(m.price)}</span>
                  </label>
                ))}
                {!methods.length && (
                  <p role="alert">No delivery methods are available.</p>
                )}
                <div className="form-actions">
                  <Link className="text-button" to="/checkout?step=1">
                    Back to details
                  </Link>
                  <button className="button" disabled={!methods.length}>
                    Review your order
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h2>One last look.</h2>
              <div className="detail-box">
                <h3>Deliver to</h3>
                <p>
                  <AddressText a={draft.address ?? {}} />
                </p>
                {edit(1)}
              </div>
              <div className="detail-box">
                <h3>{method?.name} delivery</h3>
                <p>{method?.days}</p>
                {edit(2)}
              </div>
              <form
                onSubmit={submit(async (fields) => {
                  if (!q.value)
                    throw new Error(
                      q.error ||
                        "Wait for your quote before placing the order.",
                    );
                  let paymentMethodId = cardId;
                  if (cardId === "new") {
                    const saved = await perform<PaymentMethod>(
                      "/payments",
                      "POST",
                      fields,
                      { silent: true },
                    );
                    paymentMethodId = saved.id;
                    setCardId(saved.id);
                    setDraft({ paymentMethodId: saved.id });
                  }
                  const result = await perform<{ order: Order }>(
                    "/checkout",
                    "POST",
                    {
                      addressId: draft.addressId,
                      delivery,
                      paymentMethodId,
                      coupon: promo,
                      idempotencyKey: key.current,
                      expectedCartVersion: q.value.cartVersion,
                    },
                    { silent: true },
                  );
                  clearDraft();
                  navigate("/confirmation/" + result.order.id, {
                    replace: true,
                  });
                })}
              >
                <div className="payment-notice">
                  <strong>Demo payment</strong>Nothing is charged. Save
                  display-only card details; do not enter a full card number.
                  Last four digits 0002 simulate a decline.
                </div>
                <div className="field">
                  <label htmlFor="saved-card">Demo card</label>
                  <select
                    id="saved-card"
                    value={cardId}
                    onChange={(event) => {
                      setCardId(event.target.value);
                      setDraft({
                        paymentMethodId:
                          event.target.value === "new"
                            ? undefined
                            : event.target.value,
                      });
                    }}
                  >
                    <option value="new">Add a new demo card</option>
                    {payments.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.brand} ···· {p.last4}
                      </option>
                    ))}
                  </select>
                </div>
                {cardId === "new" && (
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="card-brand">Brand</label>
                      <select id="card-brand" name="brand">
                        <option>Visa</option>
                        <option>Mastercard</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="card-last4">Last four digits</label>
                      <input
                        id="card-last4"
                        name="last4"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="card-month">Expiry month</label>
                      <input
                        id="card-month"
                        name="expiryMonth"
                        type="number"
                        min="1"
                        max="12"
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="card-year">Expiry year</label>
                      <input
                        id="card-year"
                        name="expiryYear"
                        type="number"
                        min="2000"
                        max="2100"
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="card-holder">Card holder</label>
                      <input
                        id="card-holder"
                        name="holderName"
                        maxLength={80}
                        defaultValue={user.name}
                        required
                      />
                    </div>
                  </div>
                )}
                <label className="check-label">
                  <input type="checkbox" name="terms" required />
                  <span>
                    I agree to the <Link to="/legal?type=terms">terms</Link> and
                    understand this is a demo order.
                  </span>
                </label>
                <FormError message={error} />
                <FormError message={q.error} />
                <div className="form-actions">
                  <Link className="text-button" to="/checkout?step=2">
                    Back to delivery
                  </Link>
                  <button
                    className="button"
                    disabled={busy || q.loading || !q.value}
                  >
                    Place demo order
                    {q.value ? " · " + money(q.value.total) : ""}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
        <aside className="summary-box">
          <h3>
            Your selection{" "}
            <span className="muted small">({bagCount(cart)})</span>
          </h3>
          <SummaryItems items={cart} />
          {q.loading ? (
            <p role="status">Loading quote…</p>
          ) : q.value ? (
            <Totals t={q.value} />
          ) : (
            <FormError message={q.error} />
          )}
          <PromoBox delivery={delivery} />
          <p className="form-note">
            Your quote comes from the store. No money is charged.
          </p>
        </aside>
      </div>
    </div>
  );
}
export function Confirmation() {
  const { id } = useParams(),
    o = useApp((s) => s.orders?.find((order) => order.id === id));
  if (!o) return <NotFound />;
  return (
    <div className="page-wrap">
      <div className="confirmation">
        <div className="confirm-icon">
          <Check aria-hidden="true" />
        </div>
        <span className="eyebrow">A new perspective, on its way</span>
        <h1>Looks like a good choice.</h1>
        <p>
          Your demo order <strong>#{o.number}</strong> is saved. No payment was
          collected or email sent.
        </p>
        <div
          className="detail-box"
          style={{ textAlign: "left", marginTop: 35 }}
        >
          <SummaryItems items={o.items} />
          <Totals t={{ ...o, promo: o.coupon }} />
          <p className="form-note">
            Order placed {date(o.createdAt)} · {o.paymentMethod}
          </p>
        </div>
        <Link className="button" to={"/order/" + o.id}>
          View your order
        </Link>
        <Link className="button outline" to="/catalog">
          Keep exploring
        </Link>
      </div>
    </div>
  );
}
