import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Package } from "lucide-react";
import {
  Breadcrumb,
  Empty,
  FormError,
  Modal,
  NotFound,
  PageTitle,
  ProductImage,
  STATUS_LABEL,
  Status,
  Totals,
  NONE,
} from "@/components/common";
import { AddressText } from "@/components/address-fields";
import { useApp, useProduct } from "@/lib/store";
import { loadOrder } from "@/lib/backend";
import { date, money } from "@/lib/utils";
import type { Order, OrderItem, Prescription } from "@/lib/types";
const flow = ["placed", "processing", "shipped", "delivered"] as const;
const Thumb = ({ item }: { item: OrderItem }) => {
  const product = useProduct(item.productId);
  return product ? (
    <ProductImage product={product} color={item.color} />
  ) : (
    <img src={item.image} alt={item.name} />
  );
};
export function PrescriptionBlock({ value }: { value: Prescription | null }) {
  if (!value) return null;
  return (
    <div className="detail-box">
      <h4>Prescription</h4>
      {"power" in value ? (
        <p>Reading power +{value.power}</p>
      ) : (
        <>
          <p>PD {value.pd} mm</p>
          {value.eyes.map((e) => (
            <p key={e.eye}>
              {e.eye === "right" ? "Right" : "Left"}: sphere {e.sphere},
              cylinder {e.cylinder}, axis {e.axis}°
            </p>
          ))}
        </>
      )}
    </div>
  );
}
export function OrderCard({ o }: { o: Order }) {
  return (
    <article className="order-card">
      <div className="order-card-head">
        <div>
          <strong>#{o.number}</strong>
          <small>
            {date(o.createdAt)} · {o.items.reduce((n, l) => n + l.quantity, 0)}{" "}
            pairs
          </small>
        </div>
        <Status status={o.status} />
      </div>
      <div className="order-card-products">
        {o.items.map((item, i) => (
          <Thumb key={i} item={item} />
        ))}
      </div>
      <div className="order-card-foot">
        <span>Total {money(o.total)}</span>
        <Link className="button small outline" to={"/order/" + o.id}>
          View order
        </Link>
      </div>
    </article>
  );
}
export function Orders() {
  const orders = useApp((s) => s.orders ?? NONE);
  return (
    <div className="page-wrap">
      <Breadcrumb parts={[{ label: "Your orders" }]} />
      <PageTitle
        title="Your perspectives."
        copy="Orders, deliveries, and the pairs you picked."
      />
      {orders.length ? (
        <div style={{ maxWidth: 950 }}>
          {orders.map((o) => (
            <OrderCard key={o.id} o={o} />
          ))}
        </div>
      ) : (
        <Empty
          title="No orders just yet."
          copy="Your future favorites are waiting. Once you check out, your orders will appear here."
          label="Find your frame"
          icon={Package}
        />
      )}
    </div>
  );
}
function downloadReceipt(o: Order) {
  const a = o.address,
    lines = [
      "FORMA EYEWEAR",
      "Demo receipt — no real payment collected",
      "",
      `Order: #${o.number}`,
      `Date: ${date(o.createdAt)}`,
      `Status: ${STATUS_LABEL[o.status]}`,
      "",
      ...o.items.map(
        (l) =>
          `${l.name} / ${l.color} / ${l.size}\n${l.addOns.map((a) => a.name).join(" · ")}\nQty ${l.quantity}: ${money(l.lineTotal)}`,
      ),
      "",
      `Subtotal: ${money(o.subtotal)}`,
      `Discount: -${money(o.discount)}`,
      `Shipping: ${money(o.shipping)}`,
      `Total: ${money(o.total)}`,
      `Payment: ${o.paymentMethod}`,
      "",
      `Deliver to: ${a.firstName} ${a.lastName}`,
      a.line1,
      a.line2,
      `${a.city}, ${a.postalCode}`,
      a.country,
    ];
  const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = `forma-${o.number}-receipt.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Your demo receipt is ready.");
}
export function OrderDetail() {
  const { id } = useParams(),
    cached = useApp((s) => s.orders?.find((o) => o.id === id)),
    perform = useApp((s) => s.perform),
    busy = useApp((s) => s.busy) > 0,
    navigate = useNavigate();
  const [loaded, setLoaded] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [cancel, setCancel] = useState(false);
  useEffect(() => {
    let live = true;
    if (id)
      void loadOrder(id).then(
        (o) => {
          if (live) setLoaded(o);
        },
        (error) => {
          if (live) setError(error.message);
        },
      );
    return () => {
      live = false;
    };
  }, [id]);
  const o = cached ?? loaded;
  if (!o)
    return (
      <div className="page-wrap">
        {error ? (
          <FormError message={error} />
        ) : (
          <p role="status">Loading order…</p>
        )}
      </div>
    );
  const index = flow.indexOf(o.status as (typeof flow)[number]);
  const act = async (action: string) => {
    try {
      await perform(`/orders/${o.id}/${action}`);
      setCancel(false);
      setLoaded(await loadOrder(o.id));
    } catch {}
  };
  return (
    <div className="page-wrap">
      <Breadcrumb
        parts={[
          { label: "Your orders", to: "/orders" },
          { label: "#" + o.number },
        ]}
      />
      <div className="page-title">
        <div>
          <span className="eyebrow">Placed {date(o.createdAt)}</span>
          <h1>#{o.number}</h1>
        </div>
        <Status status={o.status} />
      </div>
      <div className="order-detail-layout">
        <section>
          {index >= 0 && (
            <div className="timeline">
              {flow.map((status, i) => (
                <div key={status} className={i <= index ? "done" : "upcoming"}>
                  <i />
                  {STATUS_LABEL[status]}
                </div>
              ))}
            </div>
          )}
          <div className="detail-box">
            <h3>Your pair{o.items.length > 1 ? "s" : ""}</h3>
            {o.items.map((item, i) => (
              <div key={i}>
                <div className="order-summary-item">
                  <Thumb item={item} />
                  <div>
                    {item.name}
                    <small>
                      {item.color} · {item.size} · Qty {item.quantity}
                      <br />
                      {item.addOns
                        .map((a) => `${a.name} (${money(a.price)})`)
                        .join(" · ")}
                    </small>
                  </div>
                  <span>{money(item.lineTotal)}</span>
                </div>
                <PrescriptionBlock value={item.prescription} />
              </div>
            ))}
          </div>
          <div className="guide-grid">
            <div className="detail-box">
              <h3>Deliver to</h3>
              <p>
                <AddressText a={o.address} />
              </p>
            </div>
            <div className="detail-box">
              <h3>Delivery & payment</h3>
              <p>
                {o.shippingName} delivery
                <br />
                {o.paymentMethod}
                <br />
                {o.status === "cancelled"
                  ? "Refund recorded (simulated)"
                  : "Demo payment recorded"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              className="button outline"
              disabled={busy}
              onClick={() =>
                perform(`/orders/${o.id}/reorder`).then(
                  (result) => {
                    toast(
                      result.skipped?.length
                        ? "Available pairs added; some selections could not be recreated."
                        : "Your previous selection is back in the bag.",
                    );
                    navigate("/cart");
                  },
                  () => {},
                )
              }
            >
              Buy again
            </button>
            <button
              className="button outline"
              onClick={() => downloadReceipt(o)}
            >
              Download receipt
            </button>
            {["placed", "processing"].includes(o.status) && (
              <button className="text-button" onClick={() => setCancel(true)}>
                Cancel order
              </button>
            )}
            {o.status === "delivered" && (
              <Link className="text-button" to="/help">
                Need a return? Message us
              </Link>
            )}
          </div>
          <div className="detail-box" style={{ marginTop: 30 }}>
            <h3>Delivery simulator</h3>
            <p>Advance this demo order to test tracking and delivery.</p>
            {index >= 0 && index < 3 ? (
              <button
                className="button small outline"
                disabled={busy}
                onClick={() => act("advance")}
              >
                Advance to {STATUS_LABEL[flow[index + 1]]}
              </button>
            ) : (
              <p className="form-note">
                This order has no remaining delivery steps.
              </p>
            )}
          </div>
          <div className="detail-box">
            <h3>Order history</h3>
            {o.events.map((event, i) => (
              <p key={i}>
                {date(event.time)} · {event.text}
              </p>
            ))}
          </div>
        </section>
        <aside className="summary-box">
          <h3>Order total</h3>
          <Totals t={{ ...o, promo: o.coupon }} />
          <Link className="text-button" to="/help">
            Need a hand?
          </Link>
        </aside>
      </div>
      <Modal open={cancel} onOpenChange={setCancel} title="Cancel this order?">
        <div className="modal-body">
          <p>
            Order #{o.number} will be cancelled and its frames returned to
            stock. Any recorded demo payment will be marked refunded.
          </p>
        </div>
        <div className="modal-footer">
          <button className="button outline" onClick={() => setCancel(false)}>
            Keep order
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => act("cancel")}
          >
            Cancel demo order
          </button>
        </div>
      </Modal>
    </div>
  );
}
