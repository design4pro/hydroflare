import * as dotenv from 'dotenv';
import type { CodegenConfig } from '@graphql-codegen/cli';

// Local secrets live in .dev.vars (gitignored). CI injects them via env from
// GitHub Actions secrets. Loading here lets `npm run codegen` run standalone.
dotenv.config({ path: '.dev.vars' });

/**
 * Storefront + Customer Accounts API version — must stay in sync with
 * `src/lib/env.ts`. Bump both together each cycle (PLANS.md §5, §24).
 */
const API_VERSION = '2026-04';

const storeDomain = process.env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const publicToken = process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN;

if (!storeDomain || !publicToken) {
  throw new Error(
    '[codegen] Missing SHOPIFY_STORE_DOMAIN and/or SHOPIFY_STOREFRONT_PUBLIC_TOKEN. ' +
      'Copy .dev.vars.example → .dev.vars and fill in your Storefront public token. ' +
      'In CI, add them as repository secrets.',
  );
}

/**
 * GraphQL Codegen — Storefront API 2026-04.
 *
 * - `schema` introspects the live Storefront endpoint (the schema is API-version
 *   scoped, identical across stores, so introspection is fine).
 * - `documents` plucks the GraphQL magic-comment-annotated string constants in
 *   `src/lib/shopify/queries/`.
 * - Output is **types only** (`typescript` + `typescript-operations`): the SDK's
 *   `.request()` takes the query as a string, so we generate `<Name>Query` +
 *   `<Name>QueryVariables` types and keep the query text as the authored string.
 *
 * Output is committed; CI runs `codegen && git diff --exit-code` as a drift
 * check (PLANS.md §5). Run `npm run codegen` after adding/changing any query.
 */
const config: CodegenConfig = {
  schema: {
    [`https://${storeDomain}/api/${API_VERSION}/graphql.json`]: {
      headers: { 'X-Shopify-Storefront-Access-Token': publicToken },
    },
  },
  documents: ['src/lib/shopify/queries/**/*.ts'],
  generates: {
    'src/lib/shopify/generated/types.ts': {
      plugins: ['typescript', 'typescript-operations'],
    },
  },
  config: {
    // Keep emitted types aligned with how the app consumes them: operation
    // result + variables pairs, no DocumentNode objects.
    avoidOptionals: false,
    skipTypename: false,
  },
  // Fail loud on schema/document mismatch instead of emitting partial types.
  ignoreNoDocuments: false,
};

export default config;
