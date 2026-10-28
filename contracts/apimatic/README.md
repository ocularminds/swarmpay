**SwarmPay API with APIMatic**

[`src/spec/openapi.json`](src/spec/openapi.json) is the OpenAPI 3.1 document for SwarmPay's REST API: sessions and sign-in, planning, the guarded payment steps, delivery, records, the ledger and organizers' agent tokens. [`../openapi.test.mjs`](../openapi.test.mjs) keeps it honest: it fails if a controller serves a route the document doesn't describe, or the document describes one nobody serves.

APIMatic validates the document and generates a TypeScript SDK and a static API docs portal from it. With `APIMATIC_API_KEY` in the private `.env`:

```sh
node demo/apimatic.mjs
```

The SDK goes to `.local/apimatic/sdk/typescript` and the portal to `.local/apimatic/portal` (pass another directory as the first argument). The script pins `@apimatic/cli` 1.5.0 and never prints the key. The checked-in [`src/APIMATIC-BUILD.json`](src/APIMATIC-BUILD.json) configures HTTP and TypeScript documentation, so generation needs no interactive setup. Every operation has a unique SDK method name and a description, checked in CI because APIMatic requires both.

Live generation was verified on October 28, 2026: validation, the TypeScript SDK and the portal all succeeded. The generated SDK compiled and read the local configuration and session endpoints. APIMatic still reports non-blocking documentation warnings, including missing schema descriptions and examples.

To preview the generated portal, run `python3 -m http.server 5188 --bind 127.0.0.1 --directory .local/apimatic/portal` and open `http://localhost:5188`.

The [PayPal AI Hackathon sponsor offer](https://paypalaihackathon.devpost.com/details/apimatic) grants one month of Basic to participants, or six months of Business to winning teams, who used APIMatic's PayPal Context Plugin to build their PayPal integration. Its claim form requires project evidence of that usage. The SDK and portal generation documented here does not establish that requirement.

The REST API authenticates with the organizer's session cookie and the CSRF header from `GET /api/session`. Agents don't use it: they use the MCP server at `/mcp` with an organizer's agent token (see [`postman/`](../../postman/README.md)).
