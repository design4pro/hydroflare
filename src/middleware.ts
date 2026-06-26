import { defineMiddleware } from "astro:middleware";
import {
  createCartServerHandlers,
  createStorefrontClient,
  createStorefrontRequestContext,
  handleShopifyRedirects,
  handleShopifyRoutes,
} from "@shopify/hydrogen";
import { cartFragment } from "./lib/cart-fragment";

// Cart server handlers back the Hydrogen-owned /api/cart endpoints. Created once,
// reused per request alongside the request-scoped storefront client. The additive
// fragment adds `updatedAt` for analytics cart-change dedupe.
//
// NOTE: the default cart fragment requests `quantityAvailable`, which requires
// the `unauthenticated_read_product_inventory` Storefront API scope. Enable that
// scope on your Storefront API app (Admin → Settings → Apps and sales channels →
// Develop apps → <app> → Storefront API) for add-to-cart / cart to work.
const cartHandlers = createCartServerHandlers({ fragment: cartFragment });

export const onRequest = defineMiddleware(async (context, next) => {
  const requestContext = createStorefrontRequestContext(context.request);

  // Resolve buyer IP from a trusted source. `clientAddress` is correct for the
  // Node adapter (local + generic Node hosts). On Oxygen/Cloudflare/etc. prefer
  // the deployment's trusted header (e.g. `oxygen-buyer-ip`, `CF-Connecting-IP`).
  const buyerIp = context.clientAddress;

  const storefrontClient = createStorefrontClient({
    type: "private",
    config: {
      storeDomain: import.meta.env.PUBLIC_STORE_DOMAIN,
      privateStorefrontToken: import.meta.env.PRIVATE_STOREFRONT_API_TOKEN,
      buyerIp,
      requestContext,
      i18n: { country: "US", language: "EN" },
    },
  });

  // Expose the client + request context to pages/loaders.
  context.locals.storefront = storefrontClient;
  context.locals.requestContext = requestContext;

  // Hydrogen-owned routes must be handled before framework routing: SFAPI proxy
  // (/api/<ver>/graphql.json), /checkout, cart permalinks, AJAX cart URLs,
  // /api/cart (from cartHandlers), /api/mcp, /agent/*, /graphiql (dev), /admin.
  const shopifyRoute = await handleShopifyRoutes({
    request: context.request,
    storefrontClient,
    handlers: [cartHandlers],
  });
  if (shopifyRoute) return shopifyRoute;

  const response = await next();

  // Post-routing: only consult Shopify redirects on a real 404.
  if (response.status === 404) {
    const redirect = await handleShopifyRedirects({
      request: context.request,
      storefrontClient,
    });
    if (redirect) {
      requestContext.applyResponseHeaders(redirect.headers);
      return redirect;
    }
  }

  // Propagate SFAPI cookies, Server-Timing, and tracking fallback headers.
  requestContext.applyResponseHeaders(response.headers);
  return response;
});
