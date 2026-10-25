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

This creates `.env.sandbox` with distinct local passwords/tokens, UI port 5175 and webhook port 5186, preserving the existing `.env` and venue fixture keys. Complete the Azure values in that file locally. If the file was created before the callback listener was added, set `WEBHOOK_PORT=5186` in it. Never change an existing demo database to sandbox mode; both Java services persist a mode binding and reject that change.

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

Configure those URLs on the matching sandbox app and save the webhook IDs. Select these event names:

```text
CHECKOUT.ORDER.APPROVED
CHECKOUT.ORDER.COMPLETED
PAYMENT.AUTHORIZATION.CREATED
PAYMENT.AUTHORIZATION.VOIDED
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.PENDING
PAYMENT.CAPTURE.DENIED
PAYMENT.CAPTURE.DECLINED
```

SwarmPay calls PayPal's signature-verification API with that app's credentials and webhook ID, associates the resource with recorded payments, and uses the notification to reconcile provider state. Malformed events stop before OAuth. An unavailable verifier returns 503 for retry; an explicit failed signature returns 400. A generic test notification with an unrelated resource is refused. The current handler does not implement a complete refund or dispute lifecycle.

The local organizer UI can remain on loopback while an HTTPS ingress forwards only the webhook routes. A public deployment also needs its own TLS/session, rate-limit and access-control configuration; it has not been provisioned by this project.

**Check seller readiness**

```sh
node demo/check-paypal.mjs .env.sandbox
# A partially configured seller can be checked independently:
node demo/check-paypal.mjs .env --merchant tents
```

This opt-in command only requests an OAuth token and reads registered webhooks at the fixed PayPal sandbox host. It disables redirects, compares the configured webhook ID, HTTPS callback path and event subscriptions, and writes `.local/paypal-preflight.json` with no credential values. It never creates an order or changes a webhook. A nonzero exit code means configuration or access is still incomplete. Successful OAuth does not prove merchant ownership, buyer approval, capture capability, delivery of webhooks or hosted authority access. Those require the account-backed journey below.

<a id="temporary-ngrok-callbacks"></a>
**Temporary ngrok callbacks**

The user selected ngrok until Azure serves `https://swarm.decionis.com`. The web container has two listeners: the organizer UI on `WEB_PORT` and a callback-only listener on `WEBHOOK_PORT`. Defaults are 5173/5184 for the local demo and 5175/5186 for the separate sandbox. These ports bind to `127.0.0.1`; the callback listener serves only POST requests to the two webhook paths. It limits request size/rate, drops incoming organizer cookies and authorization headers, and returns 404 for UI, REST, MCP and internal command routes.

After starting the sandbox stack with its completed configuration, run:

```sh
SWARM_WEBHOOK_TEST_URL=http://127.0.0.1:5186 node demo/check-webhook-ingress.mjs
ngrok http http://127.0.0.1:5186 --inspect=false
```

Use the HTTPS forwarding URL printed by ngrok as the base for each seller's callback. For example, `https://YOUR-NGROK-HOST/paypal/webhooks/tents` goes on the tent app; the `/catering` URL goes on the catering app. Keep the process running during testing and update both app registrations if its URL changes. `--inspect=false` disables ngrok's local request-body inspection; ngrok still transports the sandbox webhook data. The existing `.env` demo stack can exercise the isolated listener on port 5184, but it deliberately rejects PayPal processing with `SANDBOX_ONLY`.

Public tunneling remains pending local ngrok account setup. No public callback URL or webhook registration has been created. Check access in the [ngrok dashboard](https://dashboard.ngrok.com/), or configure an active account locally before running the command. Do not commit the ngrok auth token.

Once the Azure deployment is ready, route the same paths at `https://swarm.decionis.com`, update each seller's webhook registration and saved ID if necessary, verify the subscriptions and signature delivery, then stop the local ngrok process. The hostname is the planned deployment target; DNS, TLS and Azure resources have not been provisioned by this phase.

**The agent cannot reach PayPal**

The commerce application, which runs the agents, sits on internal Docker networks with no route out. Its only egress is the `egress` service (`infra/egress`), an HTTPS CONNECT proxy that admits the configured model host (the Azure OpenAI endpoint, or `api.openai.com` when `OPENAI_API_KEY` is set) on port 443 and refuses everything else, PayPal by name. The application holds no PayPal secret either. Every payment command therefore goes through AgentSafe to the private executor, the only service with PayPal credentials and a route to `api-m.sandbox.paypal.com`.

`node demo/check-isolation.mjs` proves it on a running stack: from the application container, `api-m.paypal.com` and `api-m.sandbox.paypal.com` are unreachable by name, at their resolved addresses, and through the proxy (`403`). The proxy logs each refusal as `EGRESS_REFUSED`.

**Hosted Decionis enforcement**

Use an owned Decionis tenant and key with actual enforcement capability. Shadow access is insufficient.

The policy is [`infra/agentsafe/decionis-policy.json`](../infra/agentsafe/decionis-policy.json), named `swarm-pay-payments`, version `swarm-pay-sandbox-v1`. A named policy sits beside any other policy in the workspace: Decionis resolves it by its id and newest version for a request (or a gateway key) that names it, and keeps the workspace default for everything else, so publishing it replaces nobody's rules. Decionis accepts `policy_id` once its named-policies change is live; until then the publish is refused, and nothing changes. It mirrors the local fixture: `payment.execute` for the two catalogue merchants in USD, up to $1,500, for the five known operations, bound to plan version 1, the policy version and the reserved workflow; a catering capture without a 64-hex receipt digest escalates; anything else is refused.

Create a short-lived administrator key in that workspace, save it as `.secrets/decionis-admin-key`, set `DECIONIS_TENANT_ID` in `.env.sandbox`, and run:

```sh
node demo/connect-decionis.mjs .env.sandbox --admin-key-file .secrets/decionis-admin-key
```

It checks the key belongs to that workspace, publishes the bundle (an unnamed one only after confirming it replaces no other product's policy; `--replace-org-policy` overrides), mints the gateway's own key (role `MEMBER`, scope `decision:enforce` only, never `policy:write`, bound to `swarm-pay-payments`), refuses a key Decionis did not bind, writes it to `.secrets/decionis-api-key` and installs it into the sandbox project's volume, then sets `DECIONIS_POLICY_VERSION`.

For the shared hosted gateway at `swarm.decionisedge.com`, add `--hosted`: it publishes the policy only, because Decionis mints the hosted gateway's key, bound to the policy, when the workspace turns enforcement on. The hosted steps are in [Azure hosting](azure-hosting.md#hosted-agentsafe-endpoints). It prints ids, scopes and versions, never a key. `--dry-run` shows what it would do. Revoke the administrator key in the workspace afterwards.

To manage the key yourself instead, store it in a private local file, normally `.secrets/decionis-api-key`, and set `DECIONIS_KEY_HOST_FILE` if using a different source path.

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
