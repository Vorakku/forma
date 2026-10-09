# FORMA Eyewear

FORMA is store #2 on MEGA-PROJECT's global commerce server. This separate repository contains the React/Vite storefront, static frame images and the try-on demo. Products, stock, lens prices, prescriptions, customers, orders and support are managed through the shared server and `admin/`. Its former Cloudflare Worker/D1 backend has been retired.

## Run locally

Use Node.js 24+, npm and the adjacent MEGA-PROJECT checkout. Start PostgreSQL/MinIO and apply the server's committed migrations before starting the storefront:

```sh
# From MEGA-PROJECT/server; see its README for environment/storage setup
npm run db:migrate
npm run db:seed
npm run dev                         # http://localhost:8787

# In a separate terminal, from forma/
cp .env.example .env
npm install
npm run dev                         # http://localhost:4175
```

The root workspace installs the shared server/admin/contract; Forma installs separately. `.env.example` documents `VITE_STORE_KEY=pk_forma_dev` and `VITE_API_TARGET=http://localhost:8787`. Vite proxies `/api` for dev and preview with same-origin cookies and `X-Store-Key`; the server should use `TRUST_PROXY_HOPS=1`. Evira dev stays on 4173. FORMA end-to-end tests use 4176; 4174 belongs to Evira's tests.

The seed creates 12 frames, Size × Color variants, specifications, lens add-ons, shipping and coupons. It is idempotent and preserves existing edits. Old `.sites-data` D1 files are unused; this migration does not import guest accounts or old demo orders. Admin images resolve existing `/images/...` URLs against Forma's first allowed origin, so keep its dev server running on 4175 while viewing those images in the admin. Uploaded images use shared S3/MinIO media storage.

## Share a development preview

Vite retains ngrok domain allowances and an optional exact `FORMA_SHARE_HOST` (hostname only) for another tunnel. Add `https://<share host>` to the **FORMA store's allowed origins** in shared admin Settings, after `http://localhost:4175` and `http://localhost:4176`. The server checks the browser Origin through the proxy; Vite's hostname allowance alone does not authorize API writes. Keep the local dev origin first for admin image resolution. The tunnel itself is not started by Forma.

## Checks and build

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit tests cover adapter translation, named options, server lens prices, neutral swatch fallback and try-on/viewer behavior. Backend integration tests live in the global server and use real isolated PostgreSQL. Playwright uses Chromium, rebuilds `commerce_e2e` through `../server` on 8788, and starts Vite on 4176. Run admin, Evira and Forma browser suites sequentially because they share this test database. No browser suite uses development data. Screenshots are off unless `CAPTURE_SCREENSHOTS=1`.

The browser journey exercises guest filtering/configuration, device saved frames, signup/cart merge, quote-based checkout with a prescription/coupon/address/demo card, delivery, reviews, support, logout/login and the try-on picker without camera access. `npm run build` produces `dist/client`; there is no Worker bundle or Prisma generation in this repository. `scripts/tryon-visual-check.mjs` uses the dev storefront on 4175.

`/v2-demo` previews The Ellis in a full-screen stage with a floating header and no page scroll or footer. One wheel gesture steps one angle; slow wheel input and touch drags scrub one neighbouring transition and settle on idle/release. Arrow/page/space keys step, Home/End reach the ends, and reduced motion cuts instantly. The ordered angle table lives in `src/tryon/scroll-poses.ts`, and gesture rules/tuning constants in `src/tryon/scroll-steps.ts`. Both display viewers share `src/tryon/studio.ts`. GSAP Observer and Three.js stay lazy; ScrollTrigger is absent. With `CAPTURE_SCREENSHOTS=1 npm run test:e2e`, the demo tests save each landed angle to `/tmp/forma-v2-angle-<n>.png`. Motion model, timing history and next steps: [V2 scroll demo](doc/feature/V2-SCROLL-DEMO.md). Each angle carries its own copy; a fresh forward gesture on Front starts a reversible, gradually approaching camera orbit around the wearer’s right side into centred wearer POV, then a centred push through the clear middle opening to paper while editorial copy enlarges from the start without fading, then a one-time reveal of home online or the store-unavailable screen offline; details are in [V2 finale exit](doc/feature/V2-FINALE-EXIT.md).

## Shopping behavior

- Catalog queries are server pages of six, with category, shape/material specs, fit options, price, stock, sale and sort filters. Search matches frame name or brand. Home/try-on queries and the product mapping cache are bounded; detail, recent and compare load products by ID or slug.
- Lens type/finish choices and their prices come from the server. Seed prices: non-prescription $0, single vision $50, reading $25; optical blue-light $25/light-adaptive $60, sun polarized $20. Server cart line amounts and checkout quotes are authoritative, including discounts. Frame variant stock is shared across all lens configurations.
- Browsing, bag, try-on and guest saved frames work anonymously. Checkout, orders/account, reviews and support require sign-in. Signup/sign-in merge the cookie bag and sync saved frames. Device storage contains saved/recent/compare IDs and coupon only; prescription and checkout contact values are not persisted there.
- Checkout saves an address (label defaults Home) and uses a saved display-only demo card (brand, last four digits, expiry, holder). Nothing is charged. Last four digits `0002` decline. Submit uses an idempotency key and expected cart version.
- Standard shipping is $8; express $18. `WELCOME10` is 10% off; `FORMA20` is $20 off a subtotal of at least $200. The free-shipping threshold and estimated tax are removed.
- Orders display server numbers, lens/finish/prescription snapshots and events. Cancellation and reorder use server endpoints. Demo delivery advances only with `DEV_SIMULATIONS=true`. Delivered orders link to support for return requests; there is no return/RMA workflow.
- Reviews are rating/text/likes and require a delivered purchase. Review titles, comments and sample reviews are removed. Support is a signed-in conversation with an optional development reply.
- Cash on delivery, newsletter and restock subscriptions are removed. Wallet, notifications, passkeys and Forma realtime are not enabled. Forma refetches after its own writes.
- Forgot/reset password shows the development code only when the server exposes it. Email changes require the current password; profile name is one full name.

Prescriptions use the server's optional typed module and are visible only in owned cart/orders and authorized admin order detail. They never enter audit, CSV, realtime, notifications or server logs. Prescription validation is mathematical and does not provide clinical advice.

## Structure

- `src/lib/api.ts`: `/api/store` transport, store key, cookies and errors.
- `src/lib/backend.ts`: the only translation layer that understands server contracts.
- `src/lib/types.ts`, `store.ts`: FORMA view models, transient state and limited device persistence.
- `src/lib/presentation.ts`: local color swatches with neutral fallback for new admin colors.
- `src/pages`, `src/components`: shopping/account screens and shared UI.
- `src/tryon`: camera/3D demo; Ellis and [Felix browline](doc/feature/3D-BROWLINE-VIEWER.md) use supplied reference reconstructions in both try-on and their lazy product viewers, identified by slug.
- `tests`, `e2e`: adapter/try-on checks and the shopper journey.

Try-on Phase 3 remains deferred. Its owner-approved plan is global product settings, GLBs in the media module's S3 storage, and the shared admin; see [3D module plan](doc/feature/3D-MODEL-MODULE.md).
