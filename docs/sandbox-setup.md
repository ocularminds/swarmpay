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

The endpoint can be the HTTPS Azure OpenAI resource root or its `/openai/v1` URL. The application normalizes it to `/openai/v1/`, disables redirects, and passes the deployment name in the Responses request. No `api-version` query is required for this v1 route. The deployment must point to the GPT-6 Astra model; a deployment name alone does not prove the underlying model. See Microsoft's [v1 API guidance](https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle) and the official [Java SDK Azure configuration](https://github.com/openai/openai-java#Microsoft-Azure).

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

The payment mode and the payment authority are separate settings. A new sandbox configuration starts with `SWARM_AUTHORITY=local`: real PayPal sandbox orders, authorizations and captures, each decided by the disclosed local test authority with the same synthetic policy as the demo. The UI labels this `AgentSafe · local test authority`, and the Java executor still rechecks consent, reservations, prices, provider resources and receipts. To have hosted Decionis decide instead, complete **Hosted Decionis enforcement** below; its connector sets `SWARM_AUTHORITY=decionis`. A `.env.sandbox` created before this setting existed selects Decionis by default; add `SWARM_AUTHORITY=local` and `DECIONIS_POLICY_VERSION=swarm-pay-demo-v1` to use the local authority.

In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/), create two controlled sandbox business sellers and one sandbox personal buyer. Create a sandbox REST app for each seller and record the following locally:

| Merchant | Required configuration |
| --- | --- |
| Tent seller | `PAYPAL_TENTS_CLIENT_ID`, `PAYPAL_TENTS_CLIENT_SECRET`, `PAYPAL_TENTS_MERCHANT_ID`, `PAYPAL_TENTS_WEBHOOK_ID` |
| Catering seller | `PAYPAL_CATERING_CLIENT_ID`, `PAYPAL_CATERING_CLIENT_SECRET`, `PAYPAL_CATERING_MERCHANT_ID`, `PAYPAL_CATERING_WEBHOOK_ID` |

The merchant ID is the seller account identifier, not its app client ID or email. Client IDs are public checkout configuration; secrets are injected only into the private executor. The implementation explicitly constructs the PayPal SDK with `Environment.SANDBOX` and has no production payment mode.

Use a publicly reachable HTTPS webhook endpoint for each seller, routed only to the corresponding path:

```text
POST https://swarm.decionis.com/webhooks/paypal/tents
POST https://swarm.decionis.com/webhooks/paypal/catering
```

These are the current public routes. The legacy `/paypal/webhooks/*` paths and unknown merchant paths return 404. Edit an existing registration to change its URL while preserving its webhook ID.

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

The [Azure demo](https://swarm.decionis.com) is deployed with trusted TLS, session protection and isolated webhook routes. Its payment executor still runs in `demo` mode and returns `404 SANDBOX_ONLY` on these routes. A webhook registration can be prepared now, but successful delivery requires a separate sandbox database/environment and its configured executor. Never switch the existing demo database to sandbox mode. The local organizer UI can alternatively remain on loopback while an HTTPS ingress forwards only the webhook routes.

**Check seller readiness**

```sh
node demo/check-paypal.mjs .env.sandbox --callback-origin https://swarm.decionis.com
# A partially configured seller can be checked independently:
node demo/check-paypal.mjs .env.sandbox --merchant tents --callback-origin https://swarm.decionis.com
```

This opt-in command only requests an OAuth token and reads registered webhooks at the fixed PayPal sandbox host. It disables redirects, compares the configured webhook ID, HTTPS callback path and event subscriptions, and writes `.local/paypal-preflight.json` with no credential values. `--callback-origin` also requires the exact expected host and port, so a stale tunnel registration cannot pass the Azure check. Without that argument, the report explicitly records that the origin was not checked. It never creates an order, probes the callback or changes a webhook. A nonzero exit code means configuration or access is still incomplete. Successful OAuth and matching registrations do not prove merchant ownership, buyer approval, capture capability, delivery of webhooks or hosted authority access; `webhookDelivery` remains `NOT_TESTED`. Those require the account-backed journey below.

<a id="temporary-ngrok-callbacks"></a>
**Temporary ngrok callbacks**

The Azure hostname now serves the hosted demo; ngrok remains an optional route for local sandbox testing. The web container has two listeners: the organizer UI on `WEB_PORT` and a callback-only listener on `WEBHOOK_PORT`. Defaults are 5173/5184 for the local demo and 5175/5186 for the separate sandbox. These ports bind to `127.0.0.1`; the callback listener serves only POST requests to the two webhook paths. It limits request size/rate, drops incoming organizer cookies and authorization headers, and returns 404 for UI, REST, MCP and internal command routes.

After starting the sandbox stack with its completed configuration, run:

```sh
SWARM_WEBHOOK_TEST_URL=http://127.0.0.1:5186 SWARM_WEBHOOK_PUBLIC_URL=http://127.0.0.1:5175 node demo/check-webhook-ingress.mjs
ngrok http http://127.0.0.1:5186 --inspect=false
```

Use the HTTPS forwarding URL printed by ngrok as the base for each seller's callback. For example, `https://YOUR-NGROK-HOST/webhooks/paypal/tents` goes on the tent app; the `/catering` URL goes on the catering app. Keep the process running during testing and update both app registrations if its URL changes. `--inspect=false` disables ngrok's local request-body inspection; ngrok still transports the sandbox webhook data. The existing `.env` demo stack can exercise the isolated listener on port 5184, but it deliberately rejects PayPal processing with `SANDBOX_ONLY`.

The ingress check always tests isolation on `SWARM_WEBHOOK_TEST_URL`. Set `SWARM_WEBHOOK_PUBLIC_URL` to also verify the current routes, legacy/unknown-route rejection, POST-only access and payload limits on the organizer listener or public HTTPS host. These are malformed-request checks; they do not send a payment or prove a verified webhook delivery.

Public tunneling remains pending local ngrok account setup. No ngrok callback URL has been created. Check access in the [ngrok dashboard](https://dashboard.ngrok.com/), or configure an active account locally before running the command. Do not commit the ngrok auth token.

When the separate sandbox executor is available through Azure, route the same paths at `https://swarm.decionis.com`, update each seller's webhook registration and saved ID if necessary, verify the subscriptions with `--callback-origin https://swarm.decionis.com`, and verify real signature delivery before stopping any local ngrok process. DNS and TLS are already provisioned; the remaining gate is the account-backed runtime and its enforcement configuration.

**Tents to buy with Channel3**

Add a [Channel3](https://channel3.ai) API key to the private environment file as `CHANNEL3_API_KEY` and restart `commerce-app`. **Buy tents** then searches Channel3 for in-stock pop-up tents that leave room in the budget for catering; the Sourcing Agent chooses among them, and the plan names the product and the store that lists it. The tents merchant still fills the order and is the seller paid through PayPal. The application reaches `api.trychannel3.com` through the egress proxy, like the model; PayPal stays refused. Without the key, tents are rental-only.

**The agent cannot reach PayPal**

The commerce application, which runs the agents, sits on internal Docker networks with no route out. Its only egress is the `egress` service (`infra/egress`), an HTTPS CONNECT proxy that admits the configured model host (the Azure OpenAI endpoint, or `api.openai.com` when `OPENAI_API_KEY` is set) on port 443 and refuses everything else, PayPal by name. The application holds no PayPal secret either. Every payment command therefore goes through AgentSafe to the private executor, the only service with the merchants' PayPal credentials. The separate sign-in service (below) reaches PayPal's identity API alone and holds no payment credentials.

`node demo/check-isolation.mjs` proves it on a running stack: from the application container, `api-m.paypal.com` and `api-m.sandbox.paypal.com` are unreachable by name, at their resolved addresses, and through the proxy (`403`). The proxy logs each refusal as `EGRESS_REFUSED`.

**Sign-up and sign-in with PayPal**

Organizers create their SwarmPay account by continuing with PayPal: the first sign-in creates the account from their PayPal name and email, and later sign-ins return them to the same plans. This uses SwarmPay's own PayPal app, separate from the two merchants' apps, so organizer identity never depends on a seller's credentials.

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox), create a sandbox app named **SwarmPay**.
2. In the app's features, turn on **Log in with PayPal**. Under its advanced settings, request **Full name** and **Email**, and add each return URL SwarmPay uses: `https://swarm.decionis.com/api/paypal/return` for the hosted site, and `http://localhost:5175/api/paypal/return` (sandbox stack) or `http://localhost:5173/api/paypal/return` (demo stack) for local runs. PayPal compares the return URL exactly.
3. Put its credentials in the private environment file, never in chat or source:

   ```dotenv
   PAYPAL_LOGIN_CLIENT_ID=
   PAYPAL_LOGIN_CLIENT_SECRET=
   ```

4. Run `node demo/setup.mjs` (or `--sandbox`) once more: it adds the `IDENTITY_TOKEN` the application uses to ask the sign-in service, and changes nothing else. Then `docker compose up -d --wait identity commerce-app web`.

The sign-in dialog then leads with **Continue with PayPal**; the organizer password stays below it. Only the `identity` service (`infra/identity`) receives the login secret, and it reaches PayPal's identity API alone. The application, where the agents run, still has no route to PayPal: it sends the browser to PayPal, checks the returned state against a short-lived cookie that only this browser holds, and hands the one-time code to `identity`, which answers with who signed in, never a PayPal token. `node demo/check-isolation.mjs` also checks that the application holds no login secret and that no other service can ask `identity` who a code belongs to.

**Hosted Decionis enforcement**

This step is optional for PayPal sandbox payments, which can run under the local test authority. Use an owned Decionis tenant and key with actual enforcement capability. Shadow access is insufficient.

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

For a disclosed hackathon fixture, retain `VENUE_ISSUER=demo-venue-fixture` and the generated public key. The fixture key is never mounted into either Java application or exposed through MCP; only the separate simulated venue container receives it, as `VENUE_PRIVATE_KEY`. If `.env.sandbox` predates the venue, run `node demo/setup.mjs --sandbox` again to add that line. A real venue integration supplies its own issuer/key and signs the [receipt contract](../contracts/receipt.schema.json).

```sh
node demo/doctor.mjs .env.sandbox
docker compose --env-file .env.sandbox -p swarm-pay-sandbox up --build -d --wait
```

Open [http://localhost:5175](http://localhost:5175) and sign in with the organizer credentials in `.env.sandbox`. Choose an event within the next three days and complete both native PayPal approvals with the sandbox buyer. Verify the tent capture and the separate catering authorization in the correct seller accounts.

If PayPal declines the sandbox buyer's funding source, its checkout reopens on the same order so the buyer can choose another; the retry reuses the same payment command and takes a fresh authority decision.

Before delivery, choose **Let the agent ask** and confirm that AgentSafe holds the request and no payment is sent. Then choose **Confirm delivery as the venue**. The venue container signs the recorded catering order with the current time, and the receipt can trigger a sandbox catering capture. To sign an exported workflow outside the application instead, the signer requires an explicit flag for **PayPal sandbox only**:

```sh
node demo/sign-receipt.mjs /path/to/workflow.json /path/to/receipt.json --sandbox-test
```

Either receipt remains a simulated delivery attestation, not a claim that physical food arrived. Capture only follows a valid, fresh receipt and a new authority decision. Check that the seller, amount, authorization ID, capture ID and authority evidence agree. Replay the receipt and verify that no second capture appears.

Record the real sandbox/authority evidence in the capability matrix. Missing account capability, provider-pending status, an expired authorization, and an unknown response must remain visible as such. Refunds, reauthorization, long booking schedules and hosted Presence resume are not implemented by the core.
