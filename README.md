# SwarmPay

Give agents a budget. Pay merchants only on agreed terms.

Phase 3 adds Azure OpenAI intent extraction, sourcing/risk roles and the responsive organizer journey. The configured GPT-6 Astra deployment completed three real Responses calls in 18.1 seconds: typed intent and two assessments. The live check created only a draft and no payment command. Strict wire schemas and local validation avoid the OpenAI/Spring AI schema-generator conflict; regression tests use the full application classpath.

Use Node.js 22.23.2 and Docker Compose:

```sh
node demo/setup.mjs
node demo/doctor.mjs
docker compose up --build -d --wait
```

Open [localhost:5173](http://localhost:5173). Describe the event, confirm rentals, review the two merchants and budget, approve the exact plan, complete two simulated checkouts, then upload a signed venue receipt. Tents are paid at checkout; catering is authorized until the receipt passes. A photo alone stays held. The UI identifies synthetic payments and the actual AI source independently.

The default fresh configuration uses synthetic AI as well. For Azure, set the private Azure key, HTTPS resource/v1 endpoint, deployment and `SWARM_AI_PROVIDER=azure` as described in [account setup](docs/sandbox-setup.md). `node demo/check-azure.mjs` makes three bounded live calls with simulated payments. It never approves funds. There is no model/provider fallback.

For fixture verification, use `SWARM_AI_PROVIDER=demo docker compose up -d --wait commerce-app`, then `node demo/smoke.mjs`, `node demo/verify-java.mjs` and the Playwright suite in `apps/web`. Use `docker compose up -d --wait commerce-app` afterward to restore the configured AI provider. Local verification includes 34 Java tests and two desktop/mobile browser journeys.

Native PayPal sandbox and hosted Decionis acceptance checks remain incomplete. This stacked PR is draft until the payment phase supplies that account-backed organizer journey. [API/MCP reference](contracts/README.md). Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
