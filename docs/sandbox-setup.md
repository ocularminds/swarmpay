**SwarmPay account setup**

AI routing and payment routing are separate. `SWARM_AI_PROVIDER=azure` uses the configured Azure deployment through the official OpenAI Java Responses client. `SWARM_MODE=demo` continues to use synthetic payment responses and a local authority. This combination lets real AI planning work while payment accounts are being completed; the UI labels both sources.

**Azure OpenAI**

Set these values in the private `.env` used by Compose:

```dotenv
SWARM_MODE=demo
SWARM_AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=gpt-6-astra
```

The endpoint can be the HTTPS Azure OpenAI resource root or its `/openai/v1` URL. The application normalizes it to `/openai/v1/`, disables redirects, and passes the deployment name in the Responses request. No `api-version` query is required for this v1 route. The deployment must point to the requested GPT-6 Astra model; a deployment name alone does not prove the underlying model. See Microsoft's [v1 API guidance](https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle) and the official [Java SDK Azure configuration](https://github.com/openai/openai-java#Microsoft-Azure).

The initial local names `AZURE_OPEANAI_KEY`, `AZURE_OPENAI_URL`, and `AZURE_OPENAI_LLM` are supported as aliases, including the original spelling of `OPEANAI`. Their values do not need to be pasted into chat or rewritten. If both key names are present, the existing `AZURE_OPEANAI_KEY` takes precedence. The canonical names above are preferred for new configurations.

```sh
node demo/doctor.mjs
docker compose up -d --wait commerce-app
node demo/check-azure.mjs
```

`check-azure.mjs` deliberately makes three live, bounded model calls through the Java application: intent extraction, sourcing and risk assessment. It creates one draft plan, checks that no reservation/payment command was created, and saves a redacted report to `.local/azure-integration.json`. It is excluded from fixture CI. Provider errors do not silently switch to simulated AI or another model.

To run the deterministic tests without model charges, temporarily use `SWARM_AI_PROVIDER=demo docker compose up -d --wait commerce-app`, run the tests, then restore the configured AI provider with `docker compose up -d --wait commerce-app`.

**Separate PayPal sandbox stack**

Create a new configuration and separate data volumes:

```sh
node demo/setup.mjs --sandbox
```

This creates `.env.sandbox` with distinct local passwords/tokens and port 5175, preserving the existing `.env` and venue fixture keys. Complete the Azure values in that file locally. Never change an existing demo database to sandbox mode; both Java services persist a mode binding and reject that change.

In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/), create two controlled sandbox business sellers and one sandbox personal buyer. Create a sandbox REST app for each seller and record the following locally:

| Merchant | Required configuration |
| --- | --- |
| Tent seller | `PAYPAL_TENTS_CLIENT_ID`, `PAYPAL_TENTS_CLIENT_SECRET`, `PAYPAL_TENTS_MERCHANT_ID`, `PAYPAL_TENTS_WEBHOOK_ID` |
| Catering seller | `PAYPAL_CATERING_CLIENT_ID`, `PAYPAL_CATERING_CLIENT_SECRET`, `PAYPAL_CATERING_MERCHANT_ID`, `PAYPAL_CATERING_WEBHOOK_ID` |

The merchant ID is the seller account identifier, not its app client ID or email. Client IDs are public checkout configuration; secrets are injected only into the private executor. The implementation explicitly constructs the PayPal SDK with `Environment.SANDBOX` and has no production payment mode.

Use a publicly reachable HTTPS webhook endpoint for each seller, routed only to the corresponding path:

```text
POST /paypal/webhooks/tents
POST /paypal/webhooks/catering
```

Configure those URLs on the matching sandbox app and save the webhook IDs. Subscribe to the applicable order-approval, authorization, capture-completed, capture-pending and capture-denied events. SwarmPay calls PayPal's signature-verification API with that app's credentials and webhook ID, associates the resource with recorded payments, and uses the notification to reconcile provider state. A generic test notification with an unrelated resource is refused. The current handler does not implement a complete refund or dispute lifecycle.

The local organizer UI can remain on loopback while an HTTPS ingress forwards only the webhook routes. A public deployment also needs its own TLS/session, rate-limit and access-control configuration; it has not been provisioned by this project.

**Hosted Decionis enforcement**

Use an owned Decionis tenant and key with actual enforcement capability. Shadow access is insufficient. Set `DECIONIS_TENANT_ID` and the actual `DECIONIS_POLICY_VERSION` in `.env.sandbox`. Store the key in a private local file, normally `.secrets/decionis-api-key`, and set `DECIONIS_KEY_HOST_FILE` if using a different source path.

AgentSafe checks secret-file ownership in production. Install the source key into the sandbox project's dedicated volume rather than changing host file permissions:

```sh
node demo/install-authority-key.mjs .secrets/decionis-api-key swarm-pay-sandbox
```

The installer transfers the key through stdin to an offline container, writes it as UID 1000 with mode 0600, and prints no key value. Only AgentSafe mounts that volume, read-only. Keep the host source file private. Use `--replace` only for intentional rotation, then recreate the gateway to load the replacement; this pinned runtime does not watch the file for rotation.

The hosted policy must bind the workload, boundary, merchant, operation, amount/currency, approved plan version, reservation, provider resource and evidence digest. Java independently validates the recorded consent and complete reservation. Verify a real ALLOW grant, claim, signature, BLOCK, ESCALATE and authority outage before calling this hosted integration complete. The application currently leaves ESCALATE held; native Presence approval/resume remains additional integration work.

**Venue receipt and first account test**

For a disclosed hackathon fixture, retain `VENUE_ISSUER=demo-venue-fixture` and the generated public key. The private fixture key remains on the host; it is never mounted into either Java application or exposed through MCP. A real venue integration supplies its own issuer/key and signs the [receipt contract](../contracts/receipt.schema.json).

```sh
node demo/doctor.mjs .env.sandbox
docker compose --env-file .env.sandbox -p swarm-pay-sandbox up --build -d --wait
```

Open [http://localhost:5175](http://localhost:5175) and sign in with the organizer credentials in `.env.sandbox`. Choose an event within the next three days and complete both native PayPal approvals with the sandbox buyer. Verify the tent capture and the separate catering authorization in the correct seller accounts.

Export the workflow. To exercise the disclosed venue fixture against **PayPal sandbox only**, the signer requires an explicit flag:

```sh
node demo/sign-receipt.mjs /path/to/workflow.json /path/to/receipt.json --sandbox-test
```

Uploading that receipt can trigger a sandbox catering capture. It remains a simulated delivery attestation, not a claim that physical food arrived. Capture only follows a valid, fresh receipt and a new authority decision. Check that the seller, amount, authorization ID, capture ID and authority evidence agree. Replay the receipt and verify that no second capture appears.

Record the real sandbox/authority evidence in the capability matrix. Missing account capability, provider-pending status, an expired authorization, and an unknown response must remain visible as such. Refunds, reauthorization, long booking schedules and hosted Presence resume are not implemented by the core.
