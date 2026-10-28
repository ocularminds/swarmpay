**SwarmPay API with APIMatic**

[`src/spec/openapi.json`](src/spec/openapi.json) is the OpenAPI 3.1 document for SwarmPay's REST API: sessions and sign-in, planning, the guarded payment steps, delivery, records, the ledger and organizers' agent tokens. [`../openapi.test.mjs`](../openapi.test.mjs) keeps it honest: it fails if a controller serves a route the document doesn't describe, or the document describes one nobody serves.

APIMatic validates the document and generates a TypeScript SDK and a static API docs portal from it. With `APIMATIC_API_KEY` in the private `.env`:

```sh
node demo/apimatic.mjs
```

The SDK goes to `.local/apimatic/sdk/typescript` and the portal to `.local/apimatic/portal` (pass another directory as the first argument). The script pins `@apimatic/cli` 1.5.0 and never prints the key. If APIMatic asks for portal settings on the first run, run `npx @apimatic/cli@1.5.0 quickstart` once in this folder.

The REST API authenticates with the organizer's session cookie and the CSRF header from `GET /api/session`. Agents don't use it: they use the MCP server at `/mcp` with an organizer's agent token (see [`postman/`](../../postman/README.md)).
