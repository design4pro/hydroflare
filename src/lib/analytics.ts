import {
  createStorefrontAnalytics,
  AnalyticsEvent,
  type StorefrontAnalytics,
  type ShopAnalytics,
} from "@shopify/hydrogen";

export { AnalyticsEvent };

// One browser-lazy analytics bus per page lifetime. Shop metadata is resolved on
// the server (root layout) and bridged to the client via a #analytics-shop element.
let bus: StorefrontAnalytics | null = null;
let analyticsShop: ShopAnalytics | null = null;

export function configureAnalytics(shop: ShopAnalytics) {
  analyticsShop = shop;
}

export function getAnalyticsShop(): ShopAnalytics | null {
  return analyticsShop;
}

export function getAnalytics(): StorefrontAnalytics | null {
  if (typeof window === "undefined") return null; // SSR no-op
  if (!analyticsShop) return null;
  if (bus) return bus;
  bus = createStorefrontAnalytics({
    shop: analyticsShop,
    consent: { mode: "default-banner" },
  });
  return bus;
}

/**
 * Read the ShopAnalytics object rendered by the root layout into #analytics-shop,
 * configure the bus, and return the shop. Safe to call from any page script — it
 * ensures configuration before publishing a view event regardless of script order.
 */
export function initAnalyticsFromDom(): ShopAnalytics | null {
  const el = document.getElementById("analytics-shop");
  if (el instanceof HTMLElement && el.dataset.shop) {
    try {
      const shop = JSON.parse(el.dataset.shop) as ShopAnalytics;
      configureAnalytics(shop);
      return shop;
    } catch {
      /* fall through */
    }
  }
  return getAnalyticsShop();
}
