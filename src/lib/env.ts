import { z } from 'zod';

/**
 * Pinned Storefront + Customer Accounts API version — the April 2026 cycle.
 *
 * Single source of truth for the API version across the runtime client and the
 * GraphQL codegen config. Shopify supports each version ~12 months; bump this
 * AND `codegen.ts` annually (next: the 2026-07 / 2026-10 release). See
 * PLANS.md §5 and §24 (decisions log, item 8).
 */
export const STOREFRONT_API_VERSION = '2026-04';

/**
 * Server-only Shopify credentials. The Storefront token is "public" by Shopify's
 * definition but is never shipped to the client bundle (PLANS.md §10): this
 * module is imported only by server code (the client factory, middleware,
 * `/api/*` endpoints) and standalone scripts — never from a client island.
 */
const shopifyEnvSchema = z.object({
  SHOPIFY_STORE_DOMAIN: z
    .string()
    .min(1, 'SHOPIFY_STORE_DOMAIN is required')
    // Normalise to a bare host; the SDK adds the scheme + API path.
    .transform((domain) => domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')),
  SHOPIFY_STOREFRONT_PUBLIC_TOKEN: z
    .string()
    .min(1, 'SHOPIFY_STOREFRONT_PUBLIC_TOKEN is required'),
});

export type ShopifyEnv = z.infer<typeof shopifyEnvSchema>;

export interface ShopifyConfig extends ShopifyEnv {
  readonly apiVersion: string;
}

/**
 * Parse + validate Shopify config from an arbitrary string record.
 *
 * Works for both the Cloudflare/Astro runtime env (`Astro.locals.runtime.env`)
 * and `process.env` in standalone scripts. Throws a zod error on missing
 * secrets so misconfiguration fails loudly at the boundary rather than silently
 * shipping an empty token — server-side only, so the message never leaks.
 */
export function parseShopifyEnv(
  record: Record<string, string | undefined>,
): ShopifyConfig {
  const env = shopifyEnvSchema.parse(record);
  return { ...env, apiVersion: STOREFRONT_API_VERSION };
}
