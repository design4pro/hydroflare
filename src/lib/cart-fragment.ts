import { gql } from "@shopify/hydrogen";

/**
 * Additive cart fragment. The default HydrogenCartFragment is always included;
 * this extends it with `updatedAt`, which the analytics bus needs to dedupe cart
 * change events (see hydrogen-analytics → Cart Tracking). Must be named
 * `CartFragment` and target `Cart`.
 */
export const cartFragment = gql(`
  fragment CartFragment on Cart {
    updatedAt
  }
`);
