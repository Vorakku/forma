# FORMA Eyewear

An editorial glasses storefront: optical frames and sunglasses, lens and prescription selection, bag, checkout, orders, returns and accounts. It uses the same stack and project layout as Evira: React + Vite on the front, a Hono API on a Cloudflare Worker with Prisma + D1 behind it.

## Run locally

Use Node.js 22.12 or later and npm, then:

```sh
npm install
npm run dev
```

Open http://localhost:4174 (Evira keeps 4173, so both can run side by side). No cloud account or secrets are required. Prisma Client is generated during installation. The dev server starts a local Worker runtime with Miniflare, applies the migrations in `drizzle/` and seeds 12 frames with labelled sample reviews. Every new visitor gets an isolated guest session; signing up turns that guest into an account without losing the bag, saved frames or orders.

## Checks and build

```sh
npm run typecheck
npm test
npm run build
```

`npm test` runs the real API against a throwaway D1 database. It covers lens/prescription validation, stock limits across bag lines, authoritative totals and discounts, idempotent checkout, the delivery and return simulator, double-cancel safety, guest-to-account merging, the reset-code flow, and ownership checks. The build produces `dist/client` and `dist/server/index.js`. The Worker needs a `DB` (D1) binding plus `ASSETS` for the client.

## Shop rules

All money is integer cents. `src/lib/rules.ts` is shared by the Worker (which owns the totals) and the client (which uses it for previews):

- Frames include non-prescription lenses. Single vision adds $50, reading adds $25. Finishes: blue-light +$25, light-adaptive +$60 (optical), polarized +$20 (sun).
- `WELCOME10` gives 10% off. `FORMA20` gives $20 off a subtotal of $200 or more. One code at a time.
- Standard shipping is $8, or free from $150 after discounts. Express is $18. Estimated tax is 8%.
- Returns can be requested within 30 days of delivery. Cancelling or completing a return restores stock.

## Demo boundaries

Payments, delivery, returns, support requests, newsletter and restock emails are simulations. Nothing is charged, shipped or emailed. Password reset displays its verification code on screen instead of emailing it. Replace that with a real delivery provider before real customers use the store. Passwords are salted PBKDF2 hashes, and sessions are HTTP-only cookies. Checkout, cancellation and returns use atomic D1 batches guarded by database constraints. Prescription values are stored with order lines and are not clinically verified.

## Project structure

- `src/pages`: shop (home, catalog, product, saved), checkout, orders, auth, profile, help/guide/legal.
- `src/components`: shell (header, footer, menu, search, compare), cart, lens editor, address fields, shared pieces.
- `src/lib`: API client, Zustand store (device-only state: recently viewed, comparisons, checkout draft), catalog filtering, shared shop rules, optional WebMCP agent tools.
- `src/styles.css`: FORMA's design, layered over Tailwind 4 theme + utilities (preflight is skipped; FORMA ships its own reset).
- `server`: Hono API, demo catalog, Prisma/D1 access, crypto helpers.
- `prisma/schema.prisma`: authoritative schema. Model and field names follow Evira's (`Product.price/originalPrice/stock/sold/sizes/colors/tag`, `Order.status/items/events`), so a shared admin can read both. FORMA-specific columns: `Product.swatches/shape/material/dimensions/weight/rank`, `CartItem.lens/coating/prescription`, `Order.tax/returnReason`, and the `Review`, `ReviewComment`, `SupportRequest`, `NewsletterSubscriber` and `RestockRequest` tables.
- `drizzle`: SQL migrations (Prisma owns the schema). Generate new ones with `npx prisma migrate diff`.
- `scripts`: local runtime, migrations and Worker build.
- `tests`: API integration checks.

Order statuses are `placed → processing → shipped → delivered`, plus `cancelled`, `return_requested` and `returned`. The UI shows them as Confirmed, Preparing, Shipped, Delivered, Cancelled, Return requested and Returned.

Local data lives in `.sites-data`. Stop the server and delete that folder to reset the demo.
