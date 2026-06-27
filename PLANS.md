# PLANS — Clone the Carhartt-WIP storefront look

> **Status:** Living document. Phase 1 (Foundation) ✅ complete. Phase 0 (Catalog/env/tooling) — code tooling ✅, external Shopify steps ⏳ (see `docs/phase-0-setup.md`). Everything else is planned.
> **Stack:** Astro 7 (SSR) · Tailwind CSS v4 · React 19 islands (`@astrojs/react`) · Shopify Storefront API (`2026-04`) + Customer Accounts API · `@astrojs/cloudflare` deploy (Workers).
> **Repo:** `feature/clone` branch · PRs target `develop` (git flow) — see §13.

---

## Table of contents

1. [Context & goals](#1-context--goals)
2. [Design tokens](#2-design-tokens)
3. [Information architecture & routes](#3-information-architecture--routes)
4. [Architecture overview](#4-architecture-overview)
5. [Shopify data layer & type safety](#5-shopify-data-layer--type-safety)
6. [Editorial content model](#6-editorial-content-model)
7. [Component library](#7-component-library)
8. [Testing strategy](#8-testing-strategy)
9. [Performance & accessibility budgets](#9-performance--accessibility-budgets)
10. [Security](#10-security)
11. [Error handling & resilience](#11-error-handling--resilience)
12. [Observability](#12-observability)
13. [Analytics & the event seam](#13-analytics--the-event-seam)
14. [SEO](#14-seo)
15. [CI/CD & deployment](#15-cicd--deployment)
16. [Environment & secrets management](#16-environment--secrets-management)
17. [Conventions](#17-conventions)
18. [Implementation phases (M0–M3)](#18-implementation-phases-m0m3)
19. [Verification & definition of done](#19-verification--definition-of-done)
20. [Decided defaults (v1)](#20-decided-defaults-v1)
21. [Risks & mitigations](#21-risks--mitigations)
22. [Git workflow](#22-git-workflow)
23. [Fidelity & assets notes](#23-fidelity--assets-notes)
24. [Decisions log](#24-decisions-log)
25. [References](#25-references)

---

## 1. Context & goals

Reproduce the **visual design language** of `carhartt-wip.com` as a working storefront on our own Shopify catalog. The site's signature is restraint: **pure black-on-white, real Helvetica (400/700 only), full-bleed editorial photography, horizontal scroll product carousels, a thin 60px transparent header, generous whitespace, square corners, no accent colors.** In production it is a premium commerce SPA (Next.js); we rebuild the *look* on Astro + Tailwind v4 with real Shopify data.

### Goals

- **Pixel-fidelity clone** of the Carhartt-WIP look (typography, spacing, header behaviour, carousels, grids, drawers) rendered server-side from our own Shopify catalog.
- **Working commerce**: browse → PLP → PDP → cart → Shopify checkout; search; customer-account login (OAuth); wishlist.
- **Production-grade engineering**: typed end-to-end (GraphQL codegen), tested (Vitest + Playwright), observable, performant (CWV green), secure, and deployed via CI to Cloudflare Workers.
- **Multi-currency, single language** via Shopify Markets.
- **Asset-swappable by design** so all Carhartt-copyright placeholders are replaced before launch.

### Non-goals (explicitly out of scope for v1)

- **Multi-language i18n routing** — single language (English) in v1; locale selector is decorative.
- **Custom checkout** — redirect to Shopify web checkout (`cart.checkoutUrl`).
- **Infinite scroll** — classic "1 of N" pagination only.
- **Wishlist sync** — client `localStorage` only (no backend, not cross-device).
- **Conversion pixels (GA4/Meta/TikTok) at launch** — cookieless Cloudflare Web Analytics only; an event seam is built so pixels can plug in later without component rework (see §13).
- **A/B testing, personalisation engines, recommendation services** — out of v1.

---

## 2. Design tokens

Tailwind v4 uses the Vite plugin (no `tailwind.config.js`; tokens live in CSS `@theme`). Already wired in `src/styles/global.css`.

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

### Token responsibilities (in `@theme`)

- `--font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif` — system stack: real Helvetica on Apple, Arial elsewhere. **Conscious fidelity choice, 0 KB payload.**
- Palette: `--color-ink #000`, `--color-paper #fff`, `--color-line #e6e6e6` (hairlines), `--color-muted #6b6b6b` (secondary text). **No accent colours.**
- Type scale aliases: `--text-product 0.875rem`, `--text-h2 3rem`, `--text-display 5rem`.
- Global `*, ::before, ::after { border-radius: 0 }` enforces square corners; `rounded-*` utilities still override if ever needed.

> **Verification:** grep styles for the measured values (header 60px, 14px/700 capitalize product names, 2:3 cards, 4-col 285px grid, 40/20 gaps, square corners, Helvetica stack).

---

## 3. Information architecture & routes

| Route | Page | Rendering | Cache policy |
|---|---|---|---|
| `/` | Home (editorial) | `prerender = true` | Static; rebuild to update |
| `/c/[collection]` | PLP (category) | SSR | Edge cache + SWR ~60s |
| `/c/[collection]/[page]` | Paginated PLP | SSR | Edge cache + SWR ~60s |
| `/p/[handle]` | PDP | SSR | Edge cache + SWR ~60s |
| `/search` | Search results / overlay | SSR + island | **`private, no-store`** (user query) |
| `/cart` | Cart page (drawer also exists) | SSR + island | **`private, no-store`** |
| `/account`, `/account/login`, `/account/register`, `/account/orders`, `/account/addresses`, `/account/callback` | Customer account | SSR (Customer Accounts API) | **`private, no-store`** |
| `/wishlist` | Wishlist (client store) | SSR shell + island | shell cacheable; contents client-side |
| `/stores`, `/[content]` | Static/editorial pages | SSR/static | cacheable |
| `/api/cart`, `/api/plp`, `/api/variants`, `/api/search` | Server endpoints | on-demand | per-endpoint (see §5) |

### Routing conventions

- **Trailing slashes:** pick one (Astro default `trailingSlash: 'ignore'`); canonicalise via redirects to avoid duplicate-content SEO issues. Document the choice.
- **404/500:** custom `src/pages/404.astro` and a global error boundary (§11). PDP/PLP for a non-existent handle return a styled 404, not a stack trace.
- **Pagination:** `/c/[collection]/[page]` with `<link rel="prev/next">` for SEO.
- **Collection handle mapping:** Shopify collection handles drive the URL; the mega-menu uses a manual handle→collection map (Storefront API exposes no menus/linklists).

---

## 4. Architecture overview

### Rendering model (hybrid SSR)

`output: 'server'` is the default; `export const prerender = true` opts individual pages into static. The cached base page renders first; dynamic/user-specific fragments stream in via **Server Islands** (`server:defer` — stable since Astro 5, confirmed present in Astro 7).

```
                        ┌──────────────── Cloudflare Worker (Astro SSR) ───────────────┐
Request ───────────────▶│  middleware.ts                                                  │
  cf.country, cookies   │   ├── currency context (resolve country → cookie override)     │
                        │   └── account: read/refresh OAuth tokens (httpOnly cookies)     │
                        │                                                                 │
                        │  page (SSR) ──▶ src/lib/shopify (Storefront client)             │
                        │                   ├── queries (codegen-typed)                  │
                        │                   └── @inContext(country) for currency          │
                        │                                                                 │
                        │  Response ─▶ Cache-Control header  (PLP/PDP: s-maxage=60,      │
                        │              stale-while-revalidate)  + Cloudflare Cache API    │
                        │                                                                 │
                        │  server:defer islands ─▶ cart badge, variant availability      │
                        │            (streamed AFTER cached HTML, per-request)            │
                        └─────────────────────────────────────────────────────────────────┘
                                             │ React islands hydrate client-side
                                             ▼
                          CartDrawer · ProductCarousel · Gallery · FilterDrawer · SearchOverlay · Wishlist
```

### Data flow rules

1. **All Shopify fetching is server-side.** The Storefront token never reaches the client bundle (see §10) — even though it is technically "public", SSR keeps it off the wire and lets us cache/shape responses.
2. **Cached page + streamed island** for anything user-specific (cart count, live variant availability) so it is never baked into a cached document.
3. **Mutations** (cart add/update, search) hit `/api/*` Astro server endpoints, which call the Storefront client and return fresh JSON.

### Proposed directory structure

```
src/
  components/
    chrome/       Header · MegaMenu · MobileNav · Footer · Newsletter · LocaleSelector
    home/         Hero · ProductCarousel · CategoryTile · EditorialSplit · LookbookBanner · VideoBanner
    plp/          SubCategoryNav · FilterDrawer · ProductGrid · Pagination
    pdp/          Gallery · VariantSelectors · AddToBag · Accordion · CompleteTheLook · RelatedProducts · NextProduct
    product/      ProductCard · WishlistButton
    cart/         CartDrawer (🏝️)
    search/       SearchOverlay (🏝️)
    account/      AccountForms
    seo/          Seo · JsonLd
    media/        ShopifyImage · Video
    ui/           Button · Link · Container · Spinner · Skeleton · Drawer
  content/
    editorial/    home.ts · config.ts
    mega-menu.ts  handle→collection map (+ thumbnail/counts via live fetch)
  islands/        (React .tsx) shared client islands if not co-located
  layouts/        Layout.astro · CollectionLayout · ProductLayout
  lib/
    shopify/      client.ts · queries/*.ts · generated/ (codegen) · cart.ts · customer.ts
    analytics/    events.ts (track seam) · dataLayer.ts
    cache.ts      edge-cache helpers (Cache API)
    currency.ts   country/currency context resolution
    cookies.ts    signed-cookie helpers
    format.ts     price/date formatting (currency-aware)
    env.ts        typed env + Cloudflare-secret access
  middleware.ts   currency context + account token refresh
  pages/          (routes — see §3)
  styles/         global.css
  fixtures/       *.json — real Storefront response shapes (for tests — §8)
tests/
  unit/           *.test.ts          (Vitest)
  e2e/            *.spec.ts          (Playwright)
.github/workflows/ ci.yml · deploy.yml
codegen.ts        graphql-codegen config
astro.config.mjs · wrangler.jsonc · tsconfig.json · vitest.config.ts · playwright.config.ts
```

---

## 5. Shopify data layer & type safety

> **Decision (§24):** real store + Storefront token exist but the catalog is **sparse/in-progress** → build against **live** data, and run a **catalog-seeding setup task** early (Phase 0) so every UI state is exercisable. **No mock-only detour**, but typed **fixtures** back the test suite (§8) since live data is non-deterministic.

### Client (`src/lib/shopify/client.ts`)

```ts
createStorefrontApiClient({
  storeDomain: env.SHOPIFY_STORE_DOMAIN,
  apiVersion: '2026-04',                 // current stable (April 2026 cycle) — §24, §25
  publicAccessToken: env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN,
});
```

- Shopify supports each version ~12 months; **bump the pinned version annually** (next: the 2026-07/2026-10 release) so it doesn't drift past support. Track in the decisions log.
- Centralise **all** queries in `src/lib/shopify/queries/`; components never call the client directly.

### Type safety — GraphQL codegen (§24)

- `codegen.ts` points at the Storefront `2026-04` schema (`@shopify/storefront-api-client` + `@graphql-codegen` + typed-document-node plugin).
- `npm run codegen` emits per-query TS types into `src/lib/shopify/generated/`.
- **One source of truth** for types across client, `.astro`/`.tsx` components, and `src/fixtures/*.json`.
- Codegen runs in CI as a **drift check**: `codegen && git diff --exit-code` fails if committed types are stale.

### Queries (`src/lib/shopify/queries/*.ts`)

`getCollections`, `getCollectionByHandle` (products + `cursor` pagination), `getProductByHandle` (variants, media, metafields, sibling colour variants), `searchProducts`, `cartCreate` / `cartLinesAdd` / `cartLinesUpdate` / `cartLinesRemove` / `cartQuery`, `customer*`.

All list queries run **`@inContext(country: $country)`** for multi-currency (§20).

### Cart architecture

- Shopify cart id kept in an **`httpOnly` + `secure` + `sameSite=lax`** cookie via `Astro.cookies.set`.
- Astro has no built-in cookie signing; the Shopify cart id is an opaque, non-secret token, so `httpOnly`/`secure` is sufficient. **HMAC-sign** (secret via Cloudflare secret) only if tamper-detection is wanted.
- `CartDrawer` (React island) calls `/api/cart/*` endpoints that mutate the Shopify cart and return fresh lines/totals.
- **Cart badge = Astro Server Island** (`server:defer`) so the per-user count is server-rendered per request and streamed in *after* the cached page HTML — never baked into the cached document. `CartDrawer` contents load via `/api/cart` on open.
- **Checkout** → redirect to `cart.checkoutUrl` (Shopify web checkout). No custom checkout.

### PDP variant availability (defensive)

The PDP SSR shell is cached, but a **variant-availability island** fetches `/api/variants` on mount so size radios reflect live `availableForSale`; the `/api/cart` add endpoint **re-checks** availability on mutation (a sale can land between fetch and click).

### PLP filtering

The cached base PLP renders first; applying a filter pushes the query (`history.pushState`) and the grid island fetches **`/api/plp?handle=&…`** (SSR JSON, cached per filter combo via the Cache API), which runs `collection.products(filters:)` (`variantOption` / `price` / `available`) and swaps the `ProductGrid`.

### Server endpoints

| Endpoint | Purpose | Cache |
|---|---|---|
| `/api/cart` (GET/POST) | read / mutate Shopify cart | `private, no-store` |
| `/api/plp` (GET) | filtered collection products JSON | Cache API per filter combo |
| `/api/variants` (GET) | live variant availability | short TTL (~10s) |
| `/api/search` (GET) | Storefront `search` | `private, no-store` |

All endpoints: **input validation** (zod) + **rate limiting** (§10) + typed responses.

### Customer Accounts API (OAuth — full flow in v1, §24)

- `/account/login` redirects to Shopify's customer-account authorisation URL.
- `/account/callback` exchanges the code for access/refresh tokens stored in **`httpOnly` + `secure` + `sameSite=lax`** cookies via Astro middleware.
- Middleware does **silent refresh** before expiry; expired sessions redirect to login.
- Account pages read the `customer` query.
- **One Customer Accounts app** with prod + stable-preview + localhost-tunnel (`cloudflared`) callback URIs in its allowlist; each deploy points env `redirect` + `client_id`/`secret` at the matching callback.

### Images — `ShopifyImage.astro`

Builds `srcset` from Shopify CDN at fixed widths (`320/480/640/768/1024/1280/1600/1920`) + `format=webp`; emits context-specific `sizes`; `loading=lazy` / `decoding=async` by default; **`eager` + `fetchpriority=high`** on the LCP hero; 2:3 portrait via `aspect-[2/3]`. Owned/local editorial assets may *additionally* use `astro:assets` `<Image>` build-time optimisation (`imageService: 'compile'`, already configured); dynamic Shopify product images cannot.

---

## 6. Editorial content model

Hero, category tiles, "In Full Feather" split, lookbook, and video banners are **not** Shopify data. Drive them from typed content files so every asset/URL is swappable:

- `src/content/editorial/home.ts` → hero (video/mp4 + poster + CTAs), tile groups, lookbook, channel banner.
- `src/content/editorial/config.ts` → typed schema (zod) for editorial blocks; consumed by Home + validated in tests.
- Reference Carhartt CDN URLs (`cdn.media.amplience.net`, `cdn.sanity.io`) **now** as placeholders, each flagged `// TODO: replace with own asset`. Swap to owned assets / Shopify media later with no component changes.

---

## 7. Component library

Astro components (`.astro`) for static/server-rendered UI; `.tsx` React islands (🏝️) only where client state is required.

### Chrome
- `Header.astro` — 60px sticky, transparent-over-hero + solid-on-scroll; logo left, primary nav (Sale / Men / Women / Accessories / Stores), right cluster (Search / Login / Bag with live count).
- `MegaMenu.astro` / `MobileNav.astro 🏝️` — hover mega-menu from the handle→collection map + live thumbnails/counts; slide-in mobile menu with accordion sub-categories.
- `Footer.astro` — newsletter form, link columns, social, `LocaleSelector.astro` (decorative), legal row, "Manage cookies" (**hidden v1** — §13), © line.

### Home / editorial
- `Hero.astro` — full-bleed video/image with overlay CTAs + mute/pause controls.
- `ProductCarousel.astro 🏝️` — horizontal edge-bleed scroller (scroll-snap + arrows); reuses `ProductCard`.
- `ProductCard.astro` — 2:3 image (front/back hover swap), name (14px/700/capitalize), "Color" + colour name, price, wishlist heart 🏝️.
- `CategoryTile.astro`, `EditorialSplit.astro`, `LookbookBanner.astro`, `VideoBanner.astro`.

### PLP
- `SubCategoryNav.astro`, `FilterDrawer.astro 🏝️`, `ProductGrid.astro`, `Pagination.astro`.

### PDP
- `Gallery.astro 🏝️`, `VariantSelectors.astro 🏝️`, `AddToBag.astro 🏝️`, `Accordion.astro`, `CompleteTheLook.astro`, `RelatedProducts.astro`, `NextProduct.astro`.

### Global interactive islands
- `CartDrawer.tsx 🏝️`, `SearchOverlay.tsx 🏝️`, `WishlistButton.tsx 🏝️` (localStorage), `AccountForms`.

---

## 8. Testing strategy

> **Decision (§24):** **Vitest** (unit/lib/component, against typed fixtures) + **Playwright** (E2E critical journeys against the live store) + `astro check` as the type gate.

### Vitest — `tests/unit/`

- **Targets:** `lib/format.ts` (price/date formatting, currency rounding), `lib/shopify/cart.ts` (cart math: line totals, quantity updates, merge), query builders, `lib/currency.ts` (country resolution, cookie override), `VariantSelectors` selection logic, zod schemas (editorial + endpoint inputs).
- **Data:** deterministic JSON fixtures in `src/fixtures/` (real Storefront response shapes, codegen-typed). Live data is non-deterministic — fixtures are the contract.
- **Component tests:** happy-dom render + assert markup for pure-presentational `.astro`-backed logic where it matters.

### Playwright — `tests/e2e/`

Critical user journeys against the live (sparse) store:

1. **Purchase funnel:** Home → PLP → PDP → select size → add-to-bag → cart updates → checkout redirects to `cart.checkoutUrl`.
2. **Search:** overlay → type → results render → click → PDP.
3. **Account:** login → `/account/callback` → orders/addresses render → logout.
4. **PLP filtering & pagination.**
5. **Mobile nav + cart drawer** (responsive).

### Wiring

- `vitest.config.ts` (environment: happy-dom; coverage thresholds gate CI).
- `playwright.config.ts` (reuse browser context; baseURL = preview Worker URL).
- **CI cadence:** Vitest on every PR (fast); Playwright on merge to `develop` and/or nightly to keep PRs fast (§15).
- **`astro check`** on every PR — must be clean.

---

## 9. Performance & accessibility budgets

### Performance budgets (Core Web Vitals — must be green at launch)

| Metric | Target | How |
|---|---|---|
| **LCP** | < 2.5s (p75) | LCP = hero image; `eager` + `fetchpriority=high`; webp srcset; SSR no JS-blocking |
| **INP** | < 200ms (p75) | minimal islands; defer non-critical hydration; avoid layout thrash |
| **CLS** | < 0.1 | explicit `aspect-ratio` on all media; reserve drawer/overlay space; no late layout shifts |
| **Client JS** | < 150 KB initial (gzip) | islands only where needed; code-split per route |
| **Fonts** | 0 KB | system Helvetica stack (no web fonts) |
| **TTFB** | < 600ms | Cloudflare edge + Cache API SWR on PLP/PDP |

- **Measure** with Chrome DevTools MCP / Lighthouse per phase; record a **performance trace** on Home, a PLP, and a PDP before launch.
- **Image budget:** Shopify CDN webp at the exact widths consumed; `sizes` attributes prevent over-fetching.

### Accessibility (WCAG 2.1 AA — designed in, not bolted on)

- **Keyboard:** full keyboard nav; visible focus states (2px ink outline); focus traps on drawers/overlay/lightbox; ESC to close; `aria-hidden`/`inert` on background when open.
- **Semantics:** landmark roles (header/nav/main/footer), `aria-current` on active nav/pagination, `<button>` vs `<a>` correctness.
- **Images:** descriptive `alt` (empty `alt` only for decorative); carousel controls labelled.
- **Forms:** associated `<label>`s, `autocomplete` on account/checkout-adjacent fields, error messaging with `aria-describedby`.
- **Contrast:** pure black-on-white passes; verify `--color-muted #6b6b6b` against paper for secondary text (≥ 4.5:1).
- **Motion:** `prefers-reduced-motion` respected (pause autoplay/video, disable hover-swap animations).
- **Audit:** Lighthouse a11y + axe pass per phase and pre-launch.

---

## 10. Security

- **Storefront token stays server-side.** Even though it is "public", all fetching is SSR; it never ships in the client bundle. Stored as a **Cloudflare secret**, not `PUBLIC_*` build env.
- **Cookies:** `httpOnly` + `secure` + `sameSite=lax` for cart id and OAuth tokens. HMAC-sign if tamper-detection is required.
- **Secrets** (Storefront token, Customer Accounts secret, cookie-signing secret, `CLOUDFLARE_API_TOKEN`) via `wrangler secret` / Cloudflare dashboard — never committed. `.dev.vars` for local (gitignored — already done).
- **No SSRF:** Shopify domain allowlist in the client config; never interpolate user input into a fetch URL.
- **Input validation:** zod on every `/api/*` body/query; reject early on schema mismatch.
- **Rate limiting** on `/api/cart`, `/api/plp`, `/api/search`, `/account/callback` (Cloudflare WAF / in-Worker token bucket) to blunt abuse.
- **Headers:** strict **CSP**, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimised. CSP must allow Shopify CDN images + `checkoutUrl` navigation.
- **Checkout trust:** re-validate variant availability and cart line integrity on `/api/cart` mutation (server is source of truth, never the client).

---

## 11. Error handling & resilience

- **Custom error pages:** `src/pages/404.astro` (styled, on-brand) + global `src/pages/500.astro`. PDP/PLP for a non-existent handle → 404, not a stack trace.
- **Shopify down / 5xx / timeout:** the Storefront client calls carry **timeout + retry with exponential backoff** (bounded retries); on persistent failure, render a graceful "catalogue temporarily unavailable" state or fall back to a cached response from the Cache API where possible.
- **Partial failure:** a failing island (cart badge, variant availability) must **not** break the page — islands fail closed (hide the badge, leave size radios enabled but re-check on add) and log the error (§12).
- **OAuth errors:** expired/invalid tokens → clear cookies → redirect to login; callback errors surface a friendly message, never raw stack.
- **Form errors:** inline, accessible validation messages on account forms, newsletter, search.
- **Defensive cart:** `/api/cart` re-checks availability server-side before mutation (§5).

---

## 12. Observability

- **Logging:** structured server logs (request id, route, Shopify-call latency, cache hit/miss) via the Cloudflare Worker runtime; never log secrets or PII.
- **Error tracking:** surface unhandled Worker exceptions (Cloudflare dashboard + optional external sink if added later).
- **Analytics:** Cloudflare Web Analytics (cookieless) for traffic/CWV (§13).
- **Uptime:** Cloudflare health checks + a `/healthz` endpoint (cheap Storefront ping) for deploy verification.
- **Cache observability:** log edge cache hit/miss ratios per route to validate the §3 cache policy in production.

---

## 13. Analytics & the event seam

> **Decision (§24):** cookieless **Cloudflare Web Analytics** only at launch (free, cookieless ⇒ **no GDPR/EEA consent banner required**). **Hide** the footer "Manage cookies" link in v1 (nothing backs it).

### Event seam (build now, provider later)

A typed `track(event)` / dataLayer helper (`src/lib/analytics/events.ts`) fires at the key commerce moments so any future provider (GA4, Meta Pixel, TikTok) plugs in **without touching components**:

- `view_item_list` (PLP impression), `view_item` (PDP), `select_item` (carousel/card click)
- `add_to_cart`, `view_cart`, `remove_from_cart`
- `begin_checkout`, `purchase` (fired post-redirect via Shopify web-pixel or order-status callback — note: purchase attribution across the Shopify checkout redirect needs the Shopify web-pixel/checkout extension, flagged for the pixel-add phase)

The seam is a thin module with no provider wired in v1 — adding a cookie-setting provider later is what triggers reintroducing the consent banner + "Manage cookies" UI.

---

## 14. SEO

- **`<Seo>` head component** on every page → `title` / `description`, canonical URL, Open Graph + Twitter cards.
- **Structured data:** `Product` JSON-LD on PDPs; `BreadcrumbList` on PLP/PDP; `Organization` + `WebSite` on Home.
- **Pagination:** `<link rel="prev/next">` on `/c/[collection]/[page]`.
- **Sitemap:** `@astrojs/sitemap` emits `sitemap.xml` (uses `astro.config.mjs` `site`).
- **`public/robots.txt`** permissive, pointing to the sitemap.
- **Canonicalisation:** single trailing-slash policy with redirects (§3) to avoid duplicate content.
- **Phase wiring:** add `<Seo>` + sitemap + analytics snippet during Phase 11 (polish) / Phase 12 (deploy).

---

## 15. CI/CD & deployment

> **Decision (§24):** **GitHub Actions + `wrangler`**. PR pipeline gates merges; preview Worker per PR; production deploy on merge to `develop` (git flow).

### Pipeline stages

1. **On every PR** (`.github/workflows/ci.yml`):
   - `astro check` (type gate — must be clean)
   - lint (eslint/prettier if added)
   - `npm run codegen` + `git diff --exit-code` (codegen drift check)
   - Vitest (unit + coverage threshold)
   - `astro build` (must succeed with Cloudflare adapter)
   - Deploy a **preview Worker** (`wrangler deploy --env preview`) against the **staging** Shopify catalog; post the preview URL to the PR.
2. **On merge to `develop`** (`.github/workflows/deploy.yml`):
   - Full CI + **Playwright E2E** against the preview/staging Worker.
   - On green → `wrangler deploy` to **production** (prod Shopify catalog).
   - Smoke check `/healthz` + a Playwright smoke subset post-deploy.
3. **Nightly** (optional): full Playwright suite against production to catch regressions in live data.

### Secrets in CI

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and per-env Shopify secrets as **GitHub Actions secrets** → injected as `wrangler secret` at deploy. Never in-repo.

---

## 16. Environment & secrets management

| Env | Shopify | Purpose | Callback (Customer Accounts) |
|---|---|---|---|
| **local** | dev/staging store via `.dev.vars` | `astro dev` | `cloudflared` tunnel URL |
| **preview** (per PR) | staging store | PR review | stable-preview callback URI |
| **production** | prod store | live | prod callback URI |

- **Non-secret config** (`PUBLIC_SITE_URL`) → `PUBLIC_*` build env.
- **Secrets** (Storefront token, Customer Accounts `client_id`/`secret`, cookie-signing secret) → Cloudflare secrets, read via `Astro.locals.runtime.env` / `wrangler secret`.
- **One Customer Accounts app** with all three callback URIs in its allowlist.
- `.dev.vars` is gitignored (done). `wrangler.jsonc` holds only non-secret config.

---

## 17. Conventions

- **File structure:** as §4. Co-locate components by domain; islands are `.tsx` and clearly marked.
- **Naming:** `PascalCase` components; `camelCase` lib functions; `kebab-case` routes; `*.test.ts` (Vitest) / `*.spec.ts` (Playwright).
- **Type safety:** strict `tsconfig` (done); no `any` outside codegen output; zod at every external boundary.
- **Comments:** match surrounding density; every Carhartt-copyright placeholder carries `// TODO: replace with own asset`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`); **commit per completed stage** grouped by functionality (per project memory).
- **PRs:** target `develop`; CI must be green; preview URL posted.

---

## 18. Implementation phases (M0–M3)

> **Decision (§24):** ship the **complete storefront as v1**, sequenced so a **thin vertical slice** (Home → PLP → PDP → cart → Shopify checkout) is demoable at **Milestone M1** (after Phase 8), with search/accounts/wishlist/polish layered after.

Legend: ☐ task · **AC** = acceptance criteria · **Dep** = depends on.

---

### 🚩 Milestone M0 — Foundations & infra

#### Phase 0 — Catalog, environment & tooling setup

> **Status:** code/tooling ✅ done; the four external Shopify steps + Cloudflare
> secrets ⏳ pending human access — see **`docs/phase-0-setup.md`** for the full
> runbook. `astro check` + Vitest + build are already green; `codegen` +
> `shopify:check` activate once the Storefront token is added to `.dev.vars`.

- ⏳ Confirm Shopify store access + create a **Storefront API public access token** (Storefront API `2026-04`).
- ⏳ **Seed the catalog** (sparse store) with enough test data to exercise every UI state: ≥ 2 collections, ≥ 12 products with **multiple variants** (sizes), **colour-sibling variants**, ≥ 1 **sold-out** size, **media galleries** (front/back images), and representative **metafields** (material/care/fit).
- ⏳ Create the **Customer Accounts app** (prod + stable-preview + `cloudflared` localhost callback URIs).
- ⏳ Configure Shopify **Markets** for multi-currency.
- ✅ Add `codegen.ts`; wire `npm run codegen`; emit initial types into `src/lib/shopify/generated/`. *(config + script done; first run needs the token — see `docs/phase-0-setup.md` §7)*
- ✅ Add `vitest.config.ts` + `playwright.config.ts`; create `src/fixtures/` with first fixtures. *(fixture `collection-by-handle.json` + contract test green)*
- ✅ Add `.github/workflows/ci.yml` skeleton (check + codegen-drift + vitest + build). *(codegen-drift gated on the Shopify secret so the skeleton is green pre-token)*
- ✅ Add `.dev.vars.example` (gitignored `.dev.vars`) + Cloudflare-secrets instructions. *(real `.dev.vars` + secrets ⏳ per runbook §5–6)*
- ☐ **AC:** `codegen` runs ✅ (script wired); one live collection fetch returns typed data ✅ (`npm run shopify:check`, run post-token); CI skeleton green on a trivial PR ✅ (gates pass now; drift step activates with secrets).
- **Dep:** Phase 1 (done).

#### Phase 1 — Foundation ✅ (complete)
Astro 7 SSR + Cloudflare adapter (`imageService:'compile'`) + React + Tailwind v4 Vite plugin; `global.css` `@theme` tokens + square-corner rule; `Layout.astro`; placeholder `index.astro`; `wrangler.jsonc`; strict `tsconfig`.
> **Verify at build:** adapter major (`@astrojs/cloudflare@14`) and `@astrojs/react@6` are compatible with `astro@7` (both already installed; confirm `astro build` + `wrangler dev` serve SSR).

#### Phase 2 — Design tokens & primitives
- ☐ Finalise type scale, colour, spacing in `@theme`; add container widths.
- ☐ `ui/Button` (solid-black + text variants), `ui/Link`, `ui/Container`, `ui/Skeleton`, `ui/Spinner`, `ui/Drawer` (accessible, focus-trap base).
- ☐ `media/ShopifyImage` (srcset/webp/sizes/lazy + LCP eager).
- ☐ `seo/Seo` + `seo/JsonLd` head components.
- ☐ Unit tests for `format.ts` + `ShopifyImage` srcset builder.
- **AC:** tokens grep-match the measured values; primitives render; `astro check` clean.

#### Phase 3 — Shopify data layer
- ☐ `lib/shopify/client.ts` (`apiVersion:'2026-04'`, server-side token).
- ☐ Queries in `lib/shopify/queries/*` (codegen-typed) + `@inContext(country)`.
- ☐ `lib/currency.ts` + `middleware.ts` (resolve country from `cf.country` / cookie override).
- ☐ Cart cookie helper (`lib/cookies.ts`) + `lib/shopify/cart.ts` (cart math).
- ☐ Endpoints `/api/cart`, `/api/plp`, `/api/variants`, `/api/search` (zod-validated, rate-limited, typed).
- ☐ Fixtures for every query shape; Vitest for cart math + currency.
- **AC:** add-to-cart round-trips against live store; `/api/plp` returns filtered JSON; currency switches via cookie.

#### Phase 4 — Chrome
- ☐ `Header` (sticky + transparent-over-hero + solid-on-scroll + 60px).
- ☐ `MegaMenu` (handle→collection map + live thumbnails) + `MobileNav 🏝️` (accordion).
- ☐ `Footer` (newsletter, columns, social, decorative `LocaleSelector`, hidden "Manage cookies", ©).
- ☐ **Cart badge server island** (`server:defer`) reading live cart count.
- **AC:** header scroll states match Carhartt; mega-menu loads from live collections; cart badge streams in per-request.

---

### 🚩 Milestone M1 — Thin vertical slice demoable

> After Phase 8 the path **Home → PLP → PDP → add-to-bag → cart → Shopify checkout** works end-to-end against live data.

#### Phase 5 — Home
- ☐ `Hero` (full-bleed video/image + CTAs + mute/pause, LCP-optimised).
- ☐ `ProductCarousel 🏝️` (scroll-snap + arrows) reusing `ProductCard`.
- ☐ `CategoryTile`, `EditorialSplit`, `LookbookBanner`, `VideoBanner` from `content/editorial`.
- ☐ `prerender = true` on Home.
- **AC:** Home renders from editorial config + live carousel products; LCP hero < 2.5s locally.

#### Phase 6 — PLP
- ☐ `SubCategoryNav`, `FilterDrawer 🏝️` (size/colour/fit/price → URL query), `ProductGrid` (4/2/1, 285px, 40/20 gaps), `Pagination` + `rel=prev/next`.
- ☐ `/api/plp` filter swap; edge cache + SWR ~60s.
- **AC:** filter + paginate against live collection; grid matches Carhartt spacing.

#### Phase 7 — PDP
- ☐ `Gallery 🏝️` (thumbs + lightbox), `VariantSelectors 🏝️` (colour-sibling links + size radios, disabled=sold-out), `AddToBag 🏝️` (requires size, opens drawer).
- ☐ `Accordion` (Details/Material & Care/Size & Fit/…; first open), `CompleteTheLook`, `RelatedProducts`, `NextProduct`.
- ☐ Variant-availability island (`/api/variants`) + `Product` JSON-LD.
- **AC:** select size → add → drawer opens; availability reflects live stock; edge cache ~60s.

#### Phase 8 — Cart
- ☐ `CartDrawer 🏝️` (lines/total via `/api/cart`), `/cart` page, quantity updates, remove.
- ☐ Checkout → redirect to `cart.checkoutUrl`; `/api/cart` re-validates availability.
- ☐ Playwright E2E for the full purchase funnel (M1 demo).
- **AC:** add → update → remove → checkout reaches Shopify web checkout. **🚩 M1 reached.**

---

### 🚩 Milestone M2 — Feature-complete storefront

#### Phase 9 — Search
- ☐ `SearchOverlay 🏝️` (Storefront `search`, `/api/search`), `/search` results page.
- ☐ Playwright E2E for search.
- **AC:** live search returns results; click → PDP; uncached.

#### Phase 10 — Customer Accounts (OAuth) ⚠️ highest risk
- ☐ `/account/login` → Shopify authorisation URL; `/account/callback` → token exchange.
- ☐ Middleware: tokens in httpOnly cookies + **silent refresh** + expiry handling.
- ☐ `/account`, `/account/orders`, `/account/addresses`, `AccountForms`; `register`.
- ☐ Local (`cloudflared`) + preview + prod callback wiring.
- ☐ Playwright E2E for login round-trip.
- **AC:** login → callback → account pages render; token refresh works; logout clears cookies.

#### Phase 11 — Wishlist, polish, a11y, perf, SEO
- ☐ `WishlistButton 🏝️` (localStorage) + `/wishlist` shell.
- ☐ Analytics event seam (`lib/analytics/events.ts`) + Cloudflare Web Analytics snippet.
- ☐ `<Seo>` everywhere + sitemap + `robots.txt` + JSON-LD.
- ☐ Focus states, loading skeletons, 404/500, `prefers-reduced-motion`.
- ☐ Full Lighthouse (perf + a11y) + axe pass; meet §9 budgets.
- **AC:** wishlist persists locally; CWV green; a11y AA; SEO tags valid. **🚩 M2 reached.**

---

### 🚩 Milestone M3 — Production launch

#### Phase 12 — Deploy & hardening
- ☐ Production Cloudflare Worker (`wrangler deploy`), prod Shopify catalog, prod Customer Accounts callback.
- ☐ Finalise CI/CD (`deploy.yml`): Playwright on `develop`, prod deploy on green, post-deploy smoke.
- ☐ Security headers (CSP etc.), rate limits, `/healthz`, structured logging.
- ☐ Replace **all** Carhartt-copyright assets with owned assets (§23).
- ☐ Full Playwright suite green; performance traces recorded; final side-by-side fidelity review.
- **AC:** production serves the storefront; CI gates merges; no third-party copyright assets; budgets met. **🚩 M3 — launch.**

---

## 19. Verification & definition of done

### Per phase
- `astro dev --background` (per `CLAUDE.md`); open the route; compare side-by-side with the live Carhartt page (Home / `/c/men` / a PDP).
- `astro check` clean; relevant Vitest tests pass.
- Tokens grep-match measured values (header 60px, 14px/700 capitalize names, 2:3 cards, 4-col 285px grid, 40/20 gaps, square corners, Helvetica stack).

### Commerce
- Add to cart → drawer updates → checkout reaches Shopify web checkout.
- Search returns results; account login round-trips; currency switches; wishlist persists.

### Quality gates (launch-blocking)
- **Performance:** LCP < 2.5s, INP < 200ms, CLS < 0.1 (p75); client JS < 150 KB gzip.
- **Accessibility:** WCAG 2.1 AA; Lighthouse a11y + axe clean; keyboard + focus traps.
- **Build/CI:** `astro check` clean; `astro build` succeeds with Cloudflare adapter; `wrangler dev` serves SSR; Vitest + Playwright green; codegen drift check clean.
- **Security:** no secrets in client bundle; CSP + security headers; rate limits in place.
- **SEO:** sitemap valid; JSON-LD validates; canonical URLs correct.
- **Legal:** zero Carhartt-copyright assets shipped.

---

## 20. Decided defaults (v1)

- **Data source:** real Shopify store + Storefront token, **sparse catalog seeded early**; build against live data (not mock-first). *(§24)*
- **Type safety:** GraphQL codegen from the `2026-04` schema + typed fixtures for tests. *(§24)*
- **Customer Accounts:** **full OAuth in v1** (not deferred). *(§24)*
- **Testing:** Vitest (unit/component vs fixtures) + Playwright (E2E vs live) + `astro check`. *(§24)*
- **Analytics:** cookieless Cloudflare Web Analytics + typed event seam; no consent banner v1. *(§24)*
- **CI/CD:** GitHub Actions + `wrangler`; preview per PR; prod on `develop`. *(§24)*
- **Launch scope:** **full v1** with an early **thin-slice milestone (M1)** after the cart phase. *(§24)*
- **Wishlist:** client-side `localStorage` only — no backend, not cross-device. (Persist to customer metafields post-v1 if needed.)
- **Locale / currency:** **multi-currency, single language** via Shopify Markets; `@inContext(country)`; country from `cf.country`, overridable via selector, persisted in a cookie. No i18n routing in v1.
- **Checkout:** redirect to Shopify web checkout (`cart.checkoutUrl`); no custom checkout.
- **Mega-menu data:** manual handle→collection map + live Shopify fetches for thumbnails/counts.
- **Pagination:** classic "1 of N".
- **Server islands:** `server:defer` (stable, confirmed for Astro 7).

---

## 21. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Customer Accounts OAuth** (cookies, callback across envs, token refresh) | Med | High | Dedicated Phase 10; `cloudflared` local callback; single app w/ all URIs; silent refresh; Playwright E2E; if it slips late, temporary stub → Shopify hosted account pages. |
| **Tailwind v4 `@theme` + Cloudflare SSR + React islands** edge cases | Med | Med | Foundation already built & verified; budget time for island hydration / `server:defer` streaming quirks; test on Cloudflare early (Phase 0 preview). |
| **Sparse catalog hides UI states** | Med | Med | Phase 0 seeding task guarantees sold-out sizes, colour siblings, media galleries, metafields. |
| **Pure B/W means photography carries all visual weight** | Med | Med | Insist on quality owned imagery before launch; 2:3 framing; webp optimisation. |
| **Copyright on Carhartt assets** | High | High | Every placeholder flagged `// TODO: replace`; launch-blocking check in Phase 12; none ship to prod. |
| **Codegen drift** | Low | Med | CI `git diff --exit-code` drift check on every PR. |
| **Live-data non-determinism in tests** | Med | Low | Typed fixtures are the test contract; E2E uses stable seeded handles. |
| **Purchase attribution across Shopify checkout redirect** | Med | Med | Event seam built now; full purchase attribution deferred to the pixel/web-pixel phase (flagged). |

---

## 22. Git workflow

PRs target `develop` (git flow), **not** `main`. Author work on a feature branch off `develop`; create `develop` first if it's missing. Commit per completed stage, grouped by functionality (Conventional Commits).

---

## 23. Fidelity & assets notes

- Carhartt CDN imagery and the logo are **placeholders for visual fidelity only** and must be replaced with owned assets before any public launch (copyright). Each is marked `// TODO: replace`.
- Product photography and prices come from our own Shopify store, so the catalog will read as "ours in their layout" — expected and desirable.

---

## 24. Decisions log

Resolved through a structured review (grilling) of the prior plan:

1. **Data source → real store, sparse catalog + early seeding.** Build against live Storefront data; no mock-only detour; Phase 0 seeds the catalog.
2. **Type safety → GraphQL codegen + typed fixtures.** One source of truth across client/components/tests.
3. **Customer Accounts → full OAuth in v1.** Highest-risk subsystem; dedicated Phase 10 with refresh/callback rigour.
4. **Testing → Vitest + Playwright.** Unit/component vs fixtures + E2E critical journeys vs live store.
5. **Analytics → cookieless now + typed event seam.** No consent banner v1; pixels plug in later without rework.
6. **CI/CD → GitHub Actions + wrangler.** PR gating, per-PR preview Workers, prod on `develop`.
7. **Launch scope → full v1, early thin-slice milestone (M1).** Demoable purchase funnel after Phase 8; remainder layered after.
8. **Verified facts:** `server:defer` is the stable server-island directive (Astro 5+); Storefront API `2026-04` is the current stable version (April 2026 cycle; Storefront + Customer Account APIs both bumped `2026-01 → 2026-04`). The "Storefront API proxy mandatory" change applies to Hydrogen only — not our direct client.

### Phase 0 implementation notes

- **Codegen emits types only, not `TypedDocumentNode`s.** `@shopify/storefront-api-client`'s `.request(operation, …)` takes the operation as a GraphQL **string** (it stringifies it into `{ query }`), so codegen runs `typescript` + `typescript-operations` and queries stay authored as `/* GraphQL */`-annotated string constants in `src/lib/shopify/queries/` (plucked by codegen). One `<Name>Query` + `<Name>QueryVariables` pair per operation → `src/lib/shopify/generated/types.ts`.
- **Schema source = live introspection** of `https://{domain}/api/2026-04/graphql.json` (schema is API-version scoped, identical across stores, so introspection is fine). `npm run codegen` reads the token from `.dev.vars`; CI injects it via secret.
- **CI codegen-drift gate is secret-gated.** Until the Storefront token is a repo secret, the drift step is skipped so the skeleton is green on a trivial PR; it activates once secrets are present (`docs/phase-0-setup.md` §7). Drift checks committed `generated/types.ts` only.
- **`scripts/` excluded from `astro check`.** Verification scripts (`scripts/check-storefront.ts`) import codegen output that doesn't exist until `npm run codegen` runs; they're exercised via `tsx` / CI, not `tsc`. Un-exclude once a workflow for typing them is added.
- **`generated/` is a committed artifact**, not gitignored — the drift check (`codegen && git diff --exit-code`) requires it tracked.

---

## 25. References

- [Astro — Server Islands](https://docs.astro.build/en/guides/server-islands/) (`server:defer`)
- [Astro — Routing](https://docs.astro.build/en/guides/routing/) · [Framework components](https://docs.astro.build/en/guides/framework-components/) · [Styling/Tailwind](https://docs.astro.build/en/guides/styling/) · [Content collections](https://docs.astro.build/en/guides/content-collections/) · [Internationalization](https://docs.astro.build/en/guides/internationalization/)
- [Shopify — GraphQL Storefront API (`2026-01`)](https://shopify.dev/docs/api/storefront/2026-01) · [Developer changelog](https://shopify.dev/changelog) · [Shopify changelog](https://changelog.shopify.com/)
- [Weaverse — Shopify Breaking Changes April 2026 (2026-01 → 2026-04)](https://weaverse.io/blogs/shopify-developer-breaking-changes-april-2026) · [Fudge — Shopify Updates April 2026](https://fudge.ai/blog/shopify-updates-april-2026/)
- [@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) · [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
