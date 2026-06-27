/**
 * Phase 0 verification — one live, typed Storefront fetch (PLANS.md §18 AC).
 *
 * Run: `npm run shopify:check`
 *
 * Proves the data layer end-to-end against the real (seeded) store:
 *   1. `COLLECTIONS_QUERY` returns typed collections.
 *   2. `COLLECTION_BY_HANDLE_QUERY` returns a typed collection + products.
 *
 * Prereqs: a Storefront public token in `.dev.vars`, and `npm run codegen` run
 * once (so `../src/lib/shopify/generated/types.ts` exists — imported below as
 * type-only, so the script still runs without it; types just won't be checked).
 */
import * as dotenv from 'dotenv';
import { parseShopifyEnv } from '../src/lib/env';
import { getStorefrontClient } from '../src/lib/shopify/client';
import {
  COLLECTIONS_QUERY,
  COLLECTION_BY_HANDLE_QUERY,
} from '../src/lib/shopify/queries/collections';
import type {
  CollectionsQuery,
  CollectionByHandleQuery,
} from '../src/lib/shopify/generated/types';

dotenv.config({ path: '.dev.vars' });

const config = parseShopifyEnv(process.env as Record<string, string | undefined>);
const client = getStorefrontClient(config);

function fail(message: string, detail?: unknown): never {
  console.error(`✗ ${message}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

// 1. List collections (typed) — also discovers a handle for step 2.
const list = await client.request<CollectionsQuery>(COLLECTIONS_QUERY, {
  variables: { country: undefined },
});
if (list.errors) fail('COLLECTIONS_QUERY returned errors', list.errors);

const collections = list.data?.collections.nodes ?? [];
if (collections.length === 0) fail('No collections found — seed the catalog (PLANS.md §18, Phase 0).');
console.log(`✓ COLLECTIONS_QUERY → ${collections.length} collection(s):`);
for (const c of collections) console.log(`    • ${c.handle} — ${c.title}`);

// 2. Fetch one collection by handle (typed) — exercises the full card shape.
const targetHandle =
  process.env.SHOPIFY_TEST_COLLECTION_HANDLE || collections[0]!.handle;
const res = await client.request<CollectionByHandleQuery>(COLLECTION_BY_HANDLE_QUERY, {
  variables: { handle: targetHandle },
});
if (res.errors) fail('COLLECTION_BY_HANDLE_QUERY returned errors', res.errors);

const collection = res.data?.collection;
if (!collection) fail(`Collection "${targetHandle}" not found (returns 404 in the app).`);

const products = collection.products.nodes;
const variants = products.flatMap((p) => p.variants.nodes);
console.log(
  `✓ COLLECTION_BY_HANDLE_QUERY → "${collection.title}": ${products.length} product(s), ` +
    `${variants.length} variant(s), ${variants.filter((v) => !v.availableForSale).length} sold-out.`,
);
console.log('\nPhase 0 live-fetch check passed. ✅');
