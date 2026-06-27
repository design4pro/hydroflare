import {
  createStorefrontApiClient,
  type StorefrontApiClient,
} from '@shopify/storefront-api-client';
import type { ShopifyConfig } from '../env';

/**
 * Build a Storefront API client for a resolved server-side config.
 *
 * The client embeds the public Storefront access token; per PLANS.md §10 it is
 * constructed **server-side only** and never reaches the client bundle. Pass a
 * freshly-resolved `ShopifyConfig` (from the Cloudflare runtime env per
 * request) rather than capturing a module-scope global, so secrets are not
 * pinned into long-lived state.
 *
 * `.request()` takes the operation as a GraphQL **string** (the SDK stringifies
 * it into `{ query }`), so queries are authored as string constants annotated
 * with a `GraphQL` magic comment and typed via codegen — see `queries/` and
 * `generated/`.
 */
export function getStorefrontClient(config: ShopifyConfig): StorefrontApiClient {
  return createStorefrontApiClient({
    storeDomain: config.SHOPIFY_STORE_DOMAIN,
    apiVersion: config.apiVersion,
    publicAccessToken: config.SHOPIFY_STOREFRONT_PUBLIC_TOKEN,
    // One bounded retry so a transient Storefront hiccup doesn't 5xx the page.
    // Mutations still surface the final error to the caller (PLANS.md §11).
    retries: 1,
  });
}
