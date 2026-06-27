import { describe, expect, it } from 'vitest';
import fixture from '../../src/fixtures/collection-by-handle.json';

/**
 * Fixture contract test for `COLLECTION_BY_HANDLE_QUERY`.
 *
 * Fixtures are the deterministic test contract (live Storefront data is
 * non-deterministic — PLANS.md §8). This asserts the fixture both matches the
 * query shape *and* represents the seeded UI states the Phase 0 catalog-seeding
 * task guarantees: multiple sizes, a sold-out size, a media gallery.
 *
 * Once codegen runs, replace the local types below with `CollectionByHandleQuery`
 * and add `satisfies CollectionByHandleQuery` on the fixture.
 */
interface SelectedOption {
  name: string;
  value: string;
}
interface Variant {
  id: string;
  availableForSale: boolean;
  quantityAvailable: number;
  selectedOptions: SelectedOption[];
}
interface ProductOption {
  name: string;
  values: string[];
}
interface Product {
  handle: string;
  featuredImage: { url: string; width: number; height: number };
  media: { nodes: { previewImage: { url: string } }[] };
  options: ProductOption[];
  variants: { nodes: Variant[] };
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
}
interface CollectionFixture {
  data: {
    collection: {
      handle: string;
      title: string;
      products: { pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean }; nodes: Product[] };
    };
  };
}

const collection = (fixture as CollectionFixture).data.collection;
const products = collection.products.nodes;

describe('collection-by-handle fixture', () => {
  it('has a collection with a handle and title', () => {
    expect(collection.handle).toBeTruthy();
    expect(collection.title).toBeTruthy();
  });

  it('exposes paginated products', () => {
    expect(collection.products.pageInfo).toEqual(
      expect.objectContaining({
        hasNextPage: expect.any(Boolean),
        hasPreviousPage: expect.any(Boolean),
      }),
    );
    expect(products.length).toBeGreaterThan(0);
  });

  it('each product has a featured image, a media gallery, variants, and a USD price', () => {
    for (const product of products) {
      expect(product.featuredImage.url).toMatch(/^https?:\/\//);
      // 2:3 portrait framing — PLANS.md §2.
      expect(product.featuredImage.width / product.featuredImage.height).toBeCloseTo(2 / 3, 1);
      expect(product.media.nodes.length).toBeGreaterThan(0);
      expect(product.variants.nodes.length).toBeGreaterThan(0);
      expect(product.priceRange.minVariantPrice.currencyCode).toBe('USD');
    }
  });

  it('represents the seeded sold-out UI state (a variant with availableForSale=false)', () => {
    const variants = products.flatMap((p) => p.variants.nodes);
    expect(variants.some((v) => v.availableForSale === false)).toBe(true);
  });

  it('represents the seeded multi-size UI state (a Size option with >1 value)', () => {
    expect(
      products.some((p) => p.options.some((o) => o.name === 'Size' && o.values.length > 1)),
    ).toBe(true);
  });
});
