# PLANS — Clone the Carhartt-WIP storefront look

**Stack:** Astro 7 (SSR) · Tailwind CSS v4 · React islands (`@astrojs/react`) · Shopify Storefront API + Customer Accounts API · `@astrojs/cloudflare` deploy.

## 1. Context & goals

Reproduce the **visual design language** of `carhartt-wip.com` as a working storefront on our own Shopify catalog. The site's signature is restraint: **pure black-on-white, real Helvetica (400/700 only), full-bleed editorial photography, horizontal scroll product carousels, a thin 60px transparent header, generous whitespace, square corners, no accent colors.** In production it is a premium commerce SPA (Next.js); we rebuild the *look* on Astro + Tailwind v4 with real Shopify data.

### Measured design tokens (captured from the live site)

| Token | Value |
|---|---|
| Body type | 16px / line-height 24px (1.5) / weight 400 / `#000` on `#fff` |
| Nav links | 16px / 400 / black / no uppercase / normal tracking |
| Product name | 14px / 700 / `text-transform: capitalize` / black |
| Homepage section H2 | ~48px / 700 |
| PLP H1 | ~80px / 700 + subtitle line |
| Header height | 60px, transparent over hero, sticky (hairline border on scroll) |
| Product card image | 2:3 portrait, hover swaps front→back (Swiper-style) |
| PLP grid | 4 cols @ ~285px, row-gap 40px / col-gap 20px (desktop → 2 cols tablet → 1–2 mobile) |
| Footer | padding-top ~80px; newsletter + link columns + social + locale + legal |
| Corners / radius | **none** (workwear square aesthetic) |
| Type weights | **400 and 700 only** |

## 2. Tailwind v4 setup

Tailwind v4 uses the Vite plugin (no `tailwind.config.js` required; tokens live in CSS `@theme`).

- Install: `tailwindcss@^4 @tailwindcss/vite`
- `astro.config.mjs`: add `@tailwindcss/vite` to `vite.plugins` and `@astrojs/cloudflare` adapter (`output: 'server'`).
- Global CSS at `src/styles/global.css`:

  ```css
  @import "tailwindcss";

  @theme {
    --font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif;  /* system stack: real Helvetica on Apple, Arial elsewhere (conscious fidelity choice, 0 KB payload) */
    --color-ink: #000000;
    --color-paper: #ffffff;
    --color-line: #e6e6e6;        /* hairline borders */
    --color-muted: #6b6b6b;       /* secondary text */
    /* type scale aliases */
    --text-product: 0.875rem;     /* 14px product name */
    --text-display: 5rem;         /* 80px PLP h1 */
  }

  @layer base {
    html { -webkit-font-smoothing: antialiased; }
    body { @apply bg-paper text-ink font-sans antialiased; }
  }

  /* Carhartt uses no rounded corners anywhere */
  @layer utilities {
    .square-corners * { border-radius: 0; }
  }
  ```

- Import `../styles/global.css` once in `src/layouts/Layout.astro`.

## 3. Project / package setup

- Runtime/build: `astro@^7`, `tailwindcss@^4`, `@tailwindcss/vite`, `@astrojs/react`, `react`, `react-dom`. Deploy adapter: `@astrojs/cloudflare` — **at install time verify the adapter's major (and `@astrojs/react`'s major) are compatible with `astro@^7`**, since both rev on Astro majors. Add `wrangler` (devDep) + a `wrangler.jsonc` so `astro build && wrangler dev` serves the SSR Worker.
- Shopify client: `@shopify/storefront-api-client`, `@shopify/graphql-client`
- Dev tooling: `@astrojs/check` + `typescript` (so `astro check` runs), plus type imports for React
- SEO: `@astrojs/sitemap` (generates `sitemap.xml`)
- `.env` (never committed): `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_PUBLIC_TOKEN` (the Storefront API exposes **only** public access tokens — a single token, not separate public/private), `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID`/`SHOPIFY_CUSTOMER_ACCOUNT_SECRET`, `PUBLIC_SITE_URL`
- `astro.config.mjs`: `output:'server'` (SSR default) with `export const prerender = true` on Home/editorial; `adapter: cloudflare()`, `vite.plugins:[tailwindcss()]`, `integrations:[react()]`. **Per-route cache policy → §5.**
- Node `>=22.12` already pinned.

## 4. Information architecture (routes)

| Route | Page | Rendering |
|---|---|---|
| `/` | Home (editorial) | SSR |
| `/c/[collection]` | PLP (category) | SSR |
| `/c/[collection]/[page]` | Paginated PLP | SSR |
| `/p/[handle]` | PDP | SSR |
| `/search` | Search results / overlay | SSR + island |
| `/cart` | Cart page (drawer also exists) | SSR + island |
| `/account`, `/account/login`, `/account/register`, `/account/orders`, `/account/addresses` | Customer account | SSR (Customer Accounts API) |
| `/wishlist` | Wishlist (client store) | SSR shell + island |
| `/stores`, `/[content]` | Static/editorial pages | SSR/static |

## 5. Shopify integration

- **Rendering & caching (per route, hybrid):** Home/editorial use `prerender = true` (static, rebuild to update); PLP (`/c/[collection]`, `/c/[collection]/[page]`) and PDP (`/p/[handle]`) are SSR with a short-TTL Cloudflare edge cache + `stale-while-revalidate` (~60s); `/search`, `/cart`, `/account/*` are SSR and **uncached** (user-specific). `output:'server'` is the default; prerender is opted in per static page.
- **PLP filtering:** the cached base PLP renders first; applying a filter pushes the query (`history.pushState`) and the grid island fetches `/api/plp?handle=&…` (SSR JSON, cached per filter combo), which runs Storefront `collection.products(filters:)` (`variantOption` / `price` / `available`) and swaps the `ProductGrid`.
- **PDP availability:** the PDP SSR shell is cached, but a variant-availability island fetches `/api/variants` on mount so size radios reflect live `availableForSale`; the `/api/cart` add endpoint **still re-checks** availability (defensive — a sale can land between fetch and click).
- **Cart badge:** rendered as an **Astro Server Island** (`server:defer` — verify the directive name in Astro 7 docs) so the per-user count is server-rendered per request and streamed in *after* the cached page HTML, never baked into the cached document. `CartDrawer` contents load via `/api/cart` on open.
- **Client** (`src/lib/shopify.ts`): `createStorefrontApiClient({ storeDomain, apiVersion:'2026-04', publicAccessToken })`. Shopify supports each version ~12 months; **bump the pinned version annually** so it doesn't drift past support. Centralize all queries here.
- **Queries** (`src/lib/queries/*.ts`): `getCollections`, `getCollectionByHandle` (products + pagination), `getProductByHandle` (variants, media, metafields), `searchProducts`, `cartCreate/cartLinesAdd/cartLinesUpdate/cartQuery`, `customer*`.
- **Cart**: server keeps the Shopify cart id in an `httpOnly` + `secure` + `sameSite=lax` cookie via `Astro.cookies.set`. Astro has no built-in cookie signing, and the Shopify cart id is an opaque, non-secret token — so `httpOnly`/`secure` is sufficient (HMAC-sign with a secret only if you want tamper-detection). A React `CartDrawer` island calls server endpoints (`/api/cart/*` Astro server endpoints) that mutate the Shopify cart and return fresh lines/total. "Checkout" → redirect to `cart.checkoutUrl` (Shopify web checkout).
- **Customer Accounts API**: OAuth flow — `/account/login` redirects to Shopify's customer account URL; `/account/callback` exchanges the code for tokens stored in `httpOnly` cookies via Astro middleware; account pages read the `customer` query. **One Customer Accounts app** with prod + stable-preview + localhost-tunnel (`cloudflared`) callback URIs in its allowlist; each deploy points env `redirect` + `client_id`/`secret` at the matching callback. *(Stub fallback if phase 10 slips: link out to Shopify's hosted account pages, defer OAuth to post-launch.)*
- **Images**: a single `ShopifyImage` Astro component builds `srcset` from Shopify CDN at fixed widths (`320/480/640/768/1024/1280/1600/1920`) + `format=webp`, emits context-specific `sizes`, `loading=lazy` / `decoding=async` by default, and `eager` + `fetchpriority=high` on the LCP hero; render 2:3 portrait via `aspect-[2/3]`. (Owned/local editorial assets may *additionally* use `astro:assets` `<Image>` build-time optimization; dynamic Shopify product images cannot.)

## 6. Editorial content model (non-Shopify blocks)

Hero, category tiles, "In Full Feather" split, lookbook, and video banners are **not** Shopify data. Drive them from typed content files so every asset/URL is swappable:

- `src/content/editorial/home.ts` → hero (video/mp4 + poster + CTAs), tile groups, lookbook, channel banner.
- Reference Carhartt CDN URLs (`cdn.media.amplience.net`, `cdn.sanity.io`) **now** as placeholders, each flagged `// TODO: replace with own asset`. Swap to owned assets / Shopify media later with no component changes.

## 7. Component library

Astro components (`.astro`) for static/server-rendered UI; `.tsx` React islands only where client state is required (marked 🏝️).

**Chrome**
- `Header.astro` — 60px sticky, transparent-over-hero variant + solid-on-scroll; logo left, primary nav (Sale / Men / Women / Accessories / Stores), right cluster (Search / Login / Bag with live count).
- `MegaMenu.astro` / `MobileNav.astro 🏝️` — hover mega-menu from Shopify collections; slide-in mobile menu with accordion sub-categories.
- `Footer.astro` — newsletter form, link columns, social, `LocaleSelector.astro` (decorative now), legal row, "Manage cookies", © line.

**Home / editorial**
- `Hero.astro` — full-bleed video/image with overlay CTAs + mute/pause controls.
- `ProductCarousel.astro 🏝️` — horizontal edge-bleed scroller (scroll-snap + arrows); reuses `ProductCard`.
- `ProductCard.astro` — 2:3 image (front/back hover swap), name (14px / 700 / capitalize), "Color" + color name, price, wishlist heart 🏝️.
- `CategoryTile.astro` — full-bleed image + title + "Shop Men / Women".
- `EditorialSplit.astro`, `LookbookBanner.astro`, `VideoBanner.astro`.

**PLP**
- `SubCategoryNav.astro` — horizontal scrollable sub-category strip.
- `FilterDrawer.astro 🏝️` — "Filter" button → slide-in drawer (size, color, fit, price) mutating URL query params.
- `ProductGrid.astro` — responsive 4 / 2 / 1 grid, 285px cols, 40px / 20px gaps.
- `Pagination.astro` — "1 of N pages" classic pagination.

**PDP**
- `Gallery.astro 🏝️` — image stack / thumbs + fullscreen lightbox.
- `VariantSelectors.astro 🏝️` — color swatches (sibling-variant links) + size radios (disabled = sold out) + "Find your size".
- `AddToBag.astro 🏝️` — requires size; solid-black button; opens `CartDrawer`.
- `Accordion.astro` — Details / Material & Care / Size & Fit / Other fabrics / Additional Information (first open by default).
- `CompleteTheLook.astro` / `RelatedProducts.astro` — carousels; `NextProduct.astro`.

**Global interactive islands**
- `CartDrawer.tsx 🏝️`, `SearchOverlay.tsx 🏝️` (Shopify search), `WishlistButton.tsx 🏝️` (localStorage), `AccountForms` (login / register / address).

## 8. Implementation phases

1. **Foundation** — install deps, wire `astro.config.mjs` (SSR + Cloudflare + React + Tailwind v4), `global.css` + `@theme`, `Layout.astro`, delete template `Welcome.astro`.
2. **Design tokens & primitives** — implement type scale, color, spacing, square-corner rule; build `Button`, `Link`, container widths.
3. **Chrome** — `Header` (sticky + scroll states), `MegaMenu`, `MobileNav`, `Footer`, `Newsletter`, `LocaleSelector`.
4. **Shopify layer** — client + queries + cookie cart + `/api/cart/*` endpoints; verify with one live collection fetch.
5. **Home** — Hero, carousels, tiles, editorial splits, lookbook, channel banner from `content/editorial`.
6. **PLP** — sub-category nav, filter drawer, product grid, pagination.
7. **PDP** — gallery, variant selectors, add-to-bag, accordions, related / complete-the-look.
8. **Cart** — drawer + `/cart` page, Shopify cart, checkout redirect.
9. **Search** — overlay + results page (Storefront `search`).
10. **Accounts** — Customer Accounts API OAuth + account pages.
11. **Wishlist + polish** — localStorage wishlist, focus states, loading skeletons, 404 / 500.
12. **Deploy** — Cloudflare adapter, env vars, `astro build` + `wrangler` preview, then production.

## 9. Fidelity & assets notes

- Carhartt CDN imagery and the logo are **placeholders for visual fidelity only** and must be replaced with owned assets before any public launch (copyright). Each is marked `// TODO: replace`.
- Product photography and prices come from our own Shopify store, so the catalog will read as "ours in their layout" — expected and desirable.

## 10. Verification

- **Per phase:** `astro dev --background` (per `CLAUDE.md`), open the relevant route, compare side-by-side with the live Carhartt page (home / `/c/men` / a PDP).
- **Tokens:** grep styles for the measured values (header 60px, 14px / 700 capitalize product names, 2:3 cards, 4-col 285px grid, 40 / 20 gaps, square corners, Helvetica stack).
- **Commerce:** add to cart → drawer updates → checkout reaches Shopify web checkout; search returns results; account login round-trips.
- **Perf / a11y:** Lighthouse pass (Chrome DevTools MCP) for LCP / CLS, keyboard nav, alt text, focus traps on drawers / overlay.
- **Build:** `astro check` clean; `astro build` succeeds with Cloudflare adapter; `wrangler dev` serves SSR.

## 11. Decided defaults (v1)

- **Wishlist:** client-side `localStorage` only — no Shopify backend, **not** synced across devices or to a logged-in account. (Persist to customer metafields post-v1 if needed.)
- **Locale / currency:** **multi-currency, single language** via Shopify Markets. Storefront queries run `@inContext(country: $country)`; `$country` defaults to the buyer's geo (Cloudflare `request.cf.country`) and is overridable via the currency selector, persisted in a cookie. No `i18n` routing in v1.
- **Checkout:** redirect to Shopify web checkout (`cart.checkoutUrl`); no custom checkout.
- **Mega-menu data:** a manual handle→collection map in content config (Storefront API exposes no menus/linklists) + live Shopify collection fetches for thumbnails/counts.
- **Pagination:** classic "1 of N" (not infinite scroll).

## 12. Risks

- Shopify Customer Accounts API OAuth is the most involved piece (cookies, callback, token refresh) — phase 10 may slip; can ship with "stub → Shopify account redirect" first.
- Pure black/white means photography carries all visual weight — poor product imagery breaks the look.
- Tailwind v4 `@theme` + Cloudflare SSR + React islands is a newer combo; budget time for adapter / island hydration edge cases.
- Copyright on Carhartt assets — must not ship to production.

## 13. Git workflow

PRs target `develop` (git flow), not `main`. Author work on a feature branch off `develop`; create `develop` first if it's missing.

## 14. SEO & analytics (v1)

- **SEO:** a `<Seo>` head component on every page → `title` / `description`, canonical URL, Open Graph + Twitter cards; **`Product` JSON-LD** on PDPs and **`BreadcrumbList`** on PLP/PDP; `@astrojs/sitemap` emits `sitemap.xml`, plus a permissive `public/robots.txt` pointing to it.
- **Analytics:** **Cloudflare Web Analytics** — cookieless, free, native to the Cloudflare deploy. No cookies ⇒ **no GDPR/EEA consent banner required**.
- **Consent:** the footer's "Manage cookies" link is **hidden/removed for v1** (nothing backs it). Re-introduce with a real consent UI only if a cookie-setting provider (e.g. GA4) is added later.
- **Phase wiring:** add `<Seo>` head + sitemap + analytics snippet during phase 11 (polish) / phase 12 (deploy).
