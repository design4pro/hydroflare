# Phase 0 setup — Shopify & Cloudflare (manual steps)

> Companion to `PLANS.md §18 (Phase 0)`. The code tooling (codegen, configs, CI,
> data-layer client) is already in place; this runbook covers the **external**
> steps that need human access to the Shopify Admin and Cloudflare dashboard.

**Why two kinds of work?** Phase 0's acceptance criteria — *codegen runs; one
live collection fetch returns typed data; CI green on a trivial PR* — depend on a
real Storefront token and a seeded catalog, which can't be created from code.
Do these once, in order.

---

## Prerequisites

- Shopify Admin access to the target store (dev/staging store for local +
  preview; prod store for production).
- Cloudflare account with the Workers project (`hydroflare`).
- The Shopify store should be on the `2026-04` Storefront API cycle (current
  stable — see `PLANS.md §24`, item 8).

---

## 1. Storefront API public access token

The Storefront token is the only secret needed to read the catalog. It is
"public" by Shopify's definition but we keep it **server-side only** (never in
the client bundle — `PLANS.md §10`).

1. Shopify Admin → **Apps** → **Develop apps** (or **Sales channels** if using a
   channel app).
2. Create / open your app → **Configuration** → **Storefront API**.
3. Select the scopes the storefront needs (read products, variants, collections,
   customers for accounts, cart, checkout). At minimum: *Read products,
   variants, collections, customer*; *Write / modify customer details*;
   *Read / write cart and checkout*.
4. **Install** the app → copy the **Storefront API access token**.
5. Note your shop domain (`<shop>.myshopify.com`).

Store these for the next steps:

```
SHOPIFY_STORE_DOMAIN=<shop>.myshopify.com
SHOPIFY_STOREFRONT_PUBLIC_TOKEN=<storefront-public-access-token>
```

---

## 2. Seed the catalog (sparse store)

The catalog is intentionally sparse. Seed enough data to exercise **every** UI
state so a visual or interaction bug isn't hidden by missing data
(`PLANS.md §21` — "Sparse catalog hides UI states").

Minimum:

- **≥ 2 collections** (e.g. *Men / Jackets & Coats*, *Accessories*), each with a
  collection image + description.
- **≥ 12 products**, each with:
  - **multiple variants** — at least a *Size* option with several values
    (S / M / L / XL).
  - **colour-sibling variants** — products available in ≥ 2 colours (drives the
    PDP colour-sibling links).
  - **≥ 1 sold-out size** — set inventory to 0 for one variant on at least one
    product (exercises the disabled-radio / "sold out" PDP state).
  - **media gallery** — front + back images (drives the card hover swap + PDP
    gallery / lightbox).
  - **representative metafields** — `material`, `care`, `fit` namespaces (drive
    the PDP *Details / Material & Care / Size & Fit* accordions in Phase 7).
- A range of prices so multi-currency formatting (Step 4) is visible.

Use real-ish product photography where possible (2:3 portrait framing — the
pure B/W design relies on imagery carrying the visual weight; `PLANS.md §21`).

> The committed fixture `src/fixtures/collection-by-handle.json` mirrors the
> `COLLECTION_BY_HANDLE_QUERY` shape and already represents the sold-out +
> multi-size states — it is the deterministic test contract while live data is
> non-deterministic (`PLANS.md §8`).

---

## 3. Customer Accounts app (OAuth)

Highest-risk subsystem (full OAuth in v1 — `PLANS.md §24`, item 3). Create the
app now so the env shape is known; full wiring lands in Phase 10.

1. Shopify Admin → **Apps** → **Develop apps** → **Create an app** of type
   **Customer Accounts** (the new customer-account OAuth flow).
2. Note the **Client ID** and generate the **Client secret**.
3. Add **callback / redirect URIs** to the allowlist — one per environment
   (`PLANS.md §16`):
   - **production:** `https://<prod-worker>.workers.dev/account/callback`
   - **stable-preview:** `https://<preview-worker>.workers.dev/account/callback`
   - **localhost:** a `cloudflared` tunnel URL (e.g.
     `https://<tunnel>.trycloudflare.com/account/callback`) — see *Local
     callback* below.
4. Select the customer scopes (read/write orders, addresses, profile).

Store for later:

```
SHOPIFY_CUSTOMER_ACCOUNTS_CLIENT_ID=<client-id>
SHOPIFY_CUSTOMER_ACCOUNTS_CLIENT_SECRET=<client-secret>
SHOPIFY_CUSTOMER_ACCOUNTS_REDIRECT_URL=<callback-uri-per-env>
```

**Local callback.** OAuth requires a public HTTPS callback. Expose local dev
with a Cloudflare tunnel:

```
cloudflared tunnel --url http://localhost:4321
```

Point `SHOPIFY_CUSTOMER_ACCOUNTS_REDIRECT_URL` at the printed
`*.trycloudflare.com/account/callback` URL and add it to the app allowlist.

---

## 4. Markets (multi-currency, single language)

v1 is multi-currency, single language via Shopify Markets (`PLANS.md §20`).

1. Shopify Admin → **Settings** → **Markets**.
2. Ensure the **primary market** + at least one additional market with a
   different currency (e.g. United States / USD primary, Europe / EUR) so the
   `@inContext(country)` price conversion is exercisable.
3. Verify product prices convert in the currency(s) you'll test.

Country is resolved at the edge from `cf.country`, overridable via a cookie
(Phase 3) — no i18n routing in v1.

---

## 5. Cloudflare secrets (staging / preview)

Secrets are stored as **Cloudflare secrets**, never committed. They surface in
the app via `Astro.locals.runtime.env` (`PLANS.md §16`).

```
wrangler secret put SHOPIFY_STORE_DOMAIN
wrangler secret put SHOPIFY_STOREFRONT_PUBLIC_TOKEN
# Phase 10 (Customer Accounts):
wrangler secret put SHOPIFY_CUSTOMER_ACCOUNTS_CLIENT_ID
wrangler secret put SHOPIFY_CUSTOMER_ACCOUNTS_CLIENT_SECRET
# Optional (tamper-detection on cart id cookies — PLANS.md §10):
wrangler secret put COOKIE_SIGNING_SECRET
```

For the **preview** environment use the matching `--env` once the preview config
exists (Phase 15). The CI deploy also needs `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID` as **GitHub Actions secrets** (Phase 15).

---

## 6. Local `.dev.vars`

```
cp .dev.vars.example .dev.vars
```

Fill in `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_STOREFRONT_PUBLIC_TOKEN` (and, later,
the Customer Accounts values). `.dev.vars` is gitignored; it is read by both the
local Cloudflare adapter runtime and `dotenv` in `codegen.ts` /
`scripts/*.ts`.

---

## 7. Verify (Phase 0 acceptance criteria)

```sh
# 1. Generate typed operations from the live 2026-04 schema, then commit them.
npm run codegen
git add src/lib/shopify/generated/types.ts
git commit -m "feat(shopify): generate storefront types from 2026-04 schema"

# 2. One live, typed collection fetch.
npm run shopify:check
# Expected:
#   ✓ COLLECTIONS_QUERY → N collection(s)
#   ✓ COLLECTION_BY_HANDLE_QUERY → "<title>": M product(s), K variant(s), …
#   Phase 0 live-fetch check passed. ✅

# 3. Quality gates green.
npm run check      # astro check — clean
npm run test       # vitest — unit/component vs fixtures
npm run build      # astro build with @astrojs/cloudflare
```

Then add the two Shopify secrets as **GitHub Actions repository secrets**
(`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_PUBLIC_TOKEN`) so the CI codegen-
drift gate activates. Open a trivial PR against `develop` to confirm CI is green
— the codegen-drift step runs once secrets are present; until then it is skipped
so the skeleton stays green.

---

## Phase 0 acceptance recap

| Criterion | How |
|---|---|
| `codegen` runs | `npm run codegen` writes `src/lib/shopify/generated/types.ts` |
| One live collection fetch returns typed data | `npm run shopify:check` (typed via generated ops) |
| CI skeleton green on a trivial PR | `astro check` + Vitest + build pass now; codegen-drift activates once secrets are added |
