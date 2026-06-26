/// <reference types="astro/client" />
import type {
  RequestScopedPrivateStorefrontClient,
  StorefrontRequestContext,
} from "@shopify/hydrogen";

declare global {
  namespace App {
    interface Locals {
      /** Per-request private Storefront API client (buyer-isolated). */
      storefront: RequestScopedPrivateStorefrontClient;
      /** Request context carrying SFAPI cookies, request-group id, response-header capture. */
      requestContext: StorefrontRequestContext;
    }
  }

  interface ImportMetaEnv {
    readonly PUBLIC_STORE_DOMAIN: string;
    readonly PUBLIC_STOREFRONT_API_TOKEN: string;
    readonly PRIVATE_STOREFRONT_API_TOKEN: string;
    readonly PUBLIC_STOREFRONT_ID: string;
    readonly PUBLIC_CHECKOUT_DOMAIN: string;
  }
}

export {};
