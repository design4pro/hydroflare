# `generated/` — GraphQL Codegen output

This directory holds TypeScript types **generated** from the Storefront API
`2026-04` schema by GraphQL Codegen.

## Regenerate

```sh
npm run codegen
```

`codegen` introspects the live Storefront endpoint (using the token in
`.dev.vars`) and writes `types.ts` here — one `<Operation>Query` +
`<Operation>QueryVariables` pair per document in `../queries/`.

## Committed artifact

`types.ts` **is committed** to the repo. CI runs `npm run codegen &&
git diff --exit-code` as a drift check (PLANS.md §5): if a query changes but the
types aren't regenerated, CI fails. So:

- After editing **any** query in `../queries/`, run `npm run codegen` and commit
  the regenerated `types.ts` in the same change.
- Run codegen once after first seeding the catalog + creating the Storefront
  token (Phase 0), then commit the resulting `types.ts`.

## Why types only (no DocumentNode objects)

`@shopify/storefront-api-client`'s `.request(operation, …)` takes the operation
as a GraphQL **string** (it is stringified into `{ query }`). So codegen emits
types and the queries stay authored as string constants in `../queries/` — no
`TypedDocumentNode` objects are generated.
