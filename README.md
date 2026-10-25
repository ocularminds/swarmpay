# SwarmPay

Give agents a budget. Pay merchants only on agreed terms.

Phase 2 adds guarded payment use cases to the authenticated foundation. A reviewed plan reserves its whole budget, creates separate tent/catering orders, captures tents, authorizes catering, and captures catering after an admitted Ed25519 receipt. Every payment command passes through the published AgentSafe gateway and the private Java executor. Durable identities, provider binding, outbox/reconciliation, dispute freeze and gated void behavior are included.

Use Node.js 22.23.2 and Docker Compose:

```sh
node demo/setup.mjs
node demo/doctor.mjs
docker compose up --build -d --wait
node demo/smoke.mjs
node demo/check-isolation.mjs
node demo/verify-java.mjs
```

The smoke test exercises the full REST/MCP payment lifecycle, concurrent retries, a photo-only hold, altered receipt rejection and a single milestone capture. The web remains the foundation catalog shell until Phase 3. [Wire contracts and endpoints](contracts/README.md) describe the workflow API and seven MCP tools. Human approval is not an agent tool.

The local authority, payment responses, catalog and advisory roles are explicitly synthetic. PayPal Java SDK and webhook adapters compile and are covered by binding tests, but real two-seller sandbox approvals and hosted Decionis enforcement/signature/Presence validation remain outstanding. This phase's PR stays draft until those external acceptance gates pass. Azure and the complete organizer UI arrive in the next stacked PR.

Credentials, logs and generated evidence stay outside Git. `docker compose down` stops the stack without deleting records. Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
