# SwarmPay

Give agents a budget. Pay merchants only on agreed terms.

This is Phase 1 of the approved Java/Spring Boot commerce project: a Gradle monorepo, two isolated Java processes, PostgreSQL migrations and roles, authenticated REST/MCP discovery, a web shell and CI. Payments and AI planning are introduced by the following stacked PRs.

Use Node.js 22.23.2 and Docker with Compose v2:

```sh
node demo/setup.mjs
node demo/doctor.mjs
docker compose up --build -d --wait
node demo/check-foundation.mjs
node demo/check-isolation.mjs
```

Open [localhost:5173](http://localhost:5173) and explore the curated demo catalog. The published AgentSafe runtime and private executor shell are running, but this phase exposes no payment operation. `search_offers` and `get_offer` are available through authenticated Streamable HTTP MCP. Credentials and local keys are generated into ignored private files.

`node demo/verify-java.mjs` runs the Java checks with Docker's JDK 21. Native JDK 21 users can run `./gradlew verify`. `npm --prefix apps/web ci` and `npm --prefix apps/web run build` build the web shell. The CI workflow exercises actual authenticated MCP discovery and checks the private network/database boundary.

The approved core uses two PayPal merchant approvals and authorization/capture for a service milestone. It does not promise legal escrow or arbitrary marketplace splitting. Real PayPal sandbox and hosted Decionis acceptance gates remain outstanding. The requested model is GPT-6 Astra through Azure OpenAI; provider calls arrive in the agent phase.

Stop with `docker compose down`; persistent volumes remain. Use a separate sandbox project for external account validation. Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
