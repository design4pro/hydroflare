/**
 * Storefront API query documents.
 *
 * Each operation is a string constant annotated with a `GraphQL` magic comment,
 * which GraphQL Codegen plucks to generate matching TS types in
 * `../generated/types.ts` (one source of truth across client, components, and
 * fixtures — PLANS.md §5). Pass the string to `client.request<QueryType>(...)`;
 * the SDK embeds it verbatim as `{ query }`.
 *
 * All list queries run `@inContext(country: $country)` so prices render in the
 * resolved market currency (PLANS.md §5, §20). `CountryCode` is optional —
 * omitting it falls back to the store's default market.
 *
 * API version: `2026-04` (see `lib/env.ts`). Bump there + in `codegen.ts`
 * together each cycle.
 */

// Minimal collection listing — drives the mega-menu handle→collection map and
// collection discovery. Kept lean to avoid field-deprecation risk; richer
// product shape lives in `COLLECTION_BY_HANDLE_QUERY`.
export const COLLECTIONS_QUERY = /* GraphQL */ `
  query Collections($country: CountryCode, $first: Int = 100)
    @inContext(country: $country) {
    collections(first: $first) {
      nodes {
        id
        handle
        title
        image {
          url
          altText
          width
          height
        }
      }
    }
  }
`;

// Single collection + paginated products with the full card/PDP-relevant shape:
// variants (with availability for sold-out states), options, media, price range.
// Used by PLP + the Phase 0 live-fetch verification + the typed fixture.
export const COLLECTION_BY_HANDLE_QUERY = /* GraphQL */ `
  query CollectionByHandle(
    $handle: String!
    $country: CountryCode
    $first: Int = 24
    $after: String
  ) @inContext(country: $country) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
        altText
        width
        height
      }
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          id
          handle
          title
          productType
          tags
          availableForSale
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          featuredImage {
            url
            altText
            width
            height
          }
          # 'media' (not the deprecated 'images') — previewImage/alt live on
          # the Media interface so no inline fragment is needed.
          media(first: 8) {
            nodes {
              alt
              previewImage {
                url
                width
                height
              }
            }
          }
          options {
            id
            name
            values
          }
          variants(first: 50) {
            nodes {
              id
              title
              availableForSale
              quantityAvailable
              selectedOptions {
                name
                value
              }
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;
