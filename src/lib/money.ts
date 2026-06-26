import { formatMoney, type MoneyV2 } from "@shopify/hydrogen";

/**
 * Format a Storefront API MoneyV2 value as a localized price string.
 *
 * Pass the active market locale for market-aware stores. Single-market
 * storefronts can keep the default. Never compute currency amounts client-side.
 */
export function formatPrice(money: MoneyV2, locale = "en-US"): string {
  return formatMoney(money, { locale }).toString();
}

/** Format a min/max price range, e.g. "$12.00 – $24.00". Both ends share one currency. */
export function formatPriceRange(
  min: MoneyV2,
  max: MoneyV2,
  locale = "en-US",
): string {
  return formatMoney([min, max], { locale }).toString();
}
