# hydroflare

A headless Shopify storefront built with [Shopify Hydrogen](https://shopify.dev/docs/custom-storefronts/hydrogen) on [Astro](https://astro.build) (SSR, `@astrojs/node`), connected to `hydroflare.myshopify.com`.

Hydrogen is used as a framework-agnostic Storefront API SDK (`createStorefrontClient`, `gql`, cart/product primitives, analytics). Astro owns routing, SSR, and the UI (`.astro` pages + `<script>` islands for the interactive cart and product variant form).

## Requirements

- Node `>= 22.12.0`
- A Shopify store with a Storefront API app that has **`unauthenticated_read_product_inventory`** enabled (Hydrogen's default cart fragment requests `quantityAvailable`). Standard read scopes (`unauthenticated_read_products`, `unauthenticated_read_product_listings`, `unauthenticated_read_collections`) are also required.

## Setup

Create `.env` (gitignored) at the project root:

```sh
PUBLIC_STORE_DOMAIN=hydroflare.myshopify.com
PUBLIC_STOREFRONT_API_TOKEN=<public Storefront API token>
PRIVATE_STOREFRONT_API_TOKEN=<private Storefront API token>   # server-only, never exposed to the client
PUBLIC_STOREFRONT_ID=0                                       # analytics hydrogenSubchannelId
PUBLIC_CHECKOUT_DOMAIN=hydroflare.myshopify.com
```

All env access is server-side only (middleware / page frontmatter). Public values are serialized to client islands explicitly; the private token never crosses the server boundary.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server at `http://localhost:4321` |
| `npm run build` | Production build → `dist/` (`@astrojs/node` standalone) |
| `npm run preview` | Preview the production build |
| `npm run check` | `astro check` + `gql.tada check` (validates `gql()` docs against the Storefront schema) |

Run the production server after building: `node ./dist/server/entry.mjs`.

## Architecture

**Storefront client + request handlers** — `src/middleware.ts` creates one request-scoped **private** Storefront client per request (buyer IP from `Astro.clientAddress`), then runs Hydrogen's request gate:

- `handleShopifyRoutes` (with `createCartServerHandlers`) **before** routing — owns `/api/cart`, the SFAPI proxy (`/api/<ver>/graphql.json`), `/checkout`, cart permalinks, AJAX cart URLs, `/admin`.
- `handleShopifyRedirects` **after a 404** — Storefront URL redirects + `/admin`.
- `requestContext.applyResponseHeaders` on the final response (SFAPI cookies, `Server-Timing`).

The client is exposed to pages via `Astro.locals.storefront`.

**Routes**

- `/` — home (collections + products)
- `/collections`, `/collections/[handle]` — browse with filters, sort, active chips, no-JS GET forms
- `/search?q=` — search results (sort + filters, preserves `q`)
- `/products/[handle]` — product detail + variant form (option selectors → selected variant → add-to-cart)
- `/cart` — full cart page (no-JS fallback) + slide-out cart drawer

**Cart** — `src/scripts/cart.ts` is an isomorphic render module (shared by the server-rendered `/cart` page and the cart drawer island) using the framework-neutral core APIs (`createCartStore`, `createCartFormRegister`). The Standard Actions runtime is loaded once in `src/layouts/Layout.astro` and powers the cart event system + `window.Shopify.actions.openCart()`.

**Product form** — `src/scripts/product.ts` hydrates the PDP with `createProductFormStore` (URL-synced variant selection, `canAddToCart`, add-to-cart via `store.handleFormSubmit`).

**Analytics** — `src/lib/analytics.ts` is a browser-lazy singleton (`createStorefrontAnalytics`). The root layout resolves the Shop GID server-side, bridges it to the client, and publishes `page_viewed`; per-page bridges publish `product/collection/search/cart` view events and cart changes via `updateCart`.

**GraphQL typing** — the `gql.tada/ts-plugin` is configured in `tsconfig.json` against the schema shipped by `@shopify/hydrogen`; `gql.tada check` (chained into `check`) validates every `gql()` document against the Storefront API schema.

## Out of scope (build later)

Customer accounts/login (Customer Account API), image optimization, SEO meta/JSON-LD, and Oxygen deployment (currently Node standalone).
