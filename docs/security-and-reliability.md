**SwarmPay security and reliability**

This document describes the implemented local boundary and its limits. The [capability matrix](implementation-status.md) separates fixture verification from account verification. The application supports one organizer, USD, two curated merchants and one catering milestone. Production deployment and a complete refund/dispute service are outside this core.

**Authority and credential boundary**

The public Java application owns intent, plans, consent and budget reservations. Its authenticated MCP tools call the same workflow service as REST. Human approval requires an organizer session and CSRF token; the MCP bearer credential cannot approve a plan. Spring Security also carries authentication into asynchronous MCP dispatch. Tokens are server configuration, never model arguments.

The application requests payment execution through the published AgentSafe gateway. AgentSafe runs in enforcement mode with a fail-closed policy and overwrites caller-supplied authority headers. The exact command binds merchant, integer amount, currency, operation, plan version, reservation, provider resource and receipt digest. The private executor rechecks persisted consent, reservation, order state and receipt before invoking PayPal. Both Java services refuse to relabel an existing database from demo to sandbox or vice versa.

Only the executor receives PayPal secrets. It shares an execution network with AgentSafe and the narrowly routed webhook ingress, while the public application has no path to that network. PostgreSQL roles separate commerce records from the private attempt ledger. The executor authenticates the service credential and relies on the isolated gateway's validated metadata; it does **not** independently verify a hosted Decionis JWS. Headers alone would not establish this boundary without network and service authentication.

This design constrains an agent, forged tool arguments and a compromised model response. A fully compromised application with write access to its consent tables can forge those rows. Stronger host-compromise protection would require independently verifiable human approval and a separate approval trust boundary. The Compose host and administrators remain trusted.

**Payment lifecycle and replay**

All amounts use integer USD cents. Approval locks the plan and atomically reserves the whole $1,400 example commitment under the $1,500 cap. Capturing an existing authorization does not reserve the same amount again. The UI separately shows committed and confirmed-paid totals; it does not imply that authorizations are settled payments.

Business command IDs and provider idempotency identities are stable. The outbox claims work with leases; the executor persists its attempt before dispatch. Duplicate calls reuse that identity. A lost response remains pending or indeterminate until provider reads establish an outcome; it does not mint a new payment request. If create-order succeeds but its response and resource ID are lost, the current adapter cannot discover the order automatically. That case stays indeterminate and requires provider investigation.

Order projections move forward. Late create/authorization results cannot rewind a captured or voided order. Unknown provider states map to pending. An authority ALLOW, HTTP success, or provider acceptance does not by itself mark money paid. Partial merchant completion is visible, and the system makes no atomic multi-merchant settlement promise.

Pending, unknown and canceled operations retain their reservation conservatively. A dispute freeze prevents new spending; a freshly gated void can still cancel an existing uncaptured catering authorization. Freeze cannot recall an already dispatched effect. Automatic reservation recredit, reauthorization, refunds, dispute settlement and unfreeze are not implemented. Already settled commands are not continuously refreshed for subsequent provider refunds or disputes.

**Evidence and its limits**

The admitted venue signs exact JSON bytes with Ed25519. Verification checks signature, issuer, workflow/order, seller, venue, quantity, delivery window, freshness and nonce. The executor verifies the receipt again. A photograph is supporting material only and cannot trigger capture. The fixture signer remains on the host; neither Java service nor MCP receives its private key. The receipt proves what that admitted issuer signed, not that food physically arrived.

Application audit events form a SHA-256 chain; exports include a chain check and original command/provider/authority identifiers. AgentSafe also writes its native journal, checked by its supplied verifier. These checks detect alteration relative to the recorded chain. An administrator able to rewrite the whole local journal can rebuild an unanchored chain. Hosted signature and external-witness verification are separate unfinished account checks; no blockchain or immutable-ledger claim is made.

**Model and input boundary**

Azure OpenAI uses the configured deployment through the official Java Responses client, with no provider/model fallback, no automatic request retries, 60-second request timeout, 2,200 output-token limit and `store=false`. This request setting does not override the provider's account-level retention policies. Each plan uses two advisory roles. Neither role receives payment tools, credentials or receipt-signing capability. Catalog prices and allowed merchants are server-owned; model text never sets a charge.

Explicit strict output schemas avoid a runtime conflict between OpenAI Java's Jackson 2 schema generator and the Jackson 3 generator used by Spring AI MCP. Local parsing also rejects missing fields, unknown fields, scalar coercion, truncation and malformed responses. A regression test runs on the complete commerce application's dependency graph and checks the outgoing protocol and refusal behavior. Production Azure endpoints require HTTPS, an Azure host and the supported v1 path; redirects are disabled.

Uploaded images are bounded to 2 MB and accepted image types. Signed receipts use a small JSON envelope. Merchant text, model outputs and file contents are untrusted data. Their content cannot introduce a new merchant, URL, actor, policy or payment operation. The local web server publishes only a loopback port; a public deployment needs its own TLS, origin/session, rate-limit and operational controls.

**Dependencies and verification**

AgentSafe 0.2.5 and agent-safe-pipeline 0.3.8 are the actual published Apache-2.0 packages. The Presence-types dependency is overridden to 0.3.0 to remove its older Zod 3 dependency implicated by GHSA-mrhx-c7xc-m3w5. Runtime differences were reviewed and the gateway's custom and supplied adversarial suites were exercised. Hosted Presence approval/resume is still unverified and is not exposed as a completed UI action.

NPM audits reported zero known vulnerabilities for the locked web and gateway trees at verification time. This is not a complete Java/container scan or a certification. Docker base manifests, the Gradle distribution checksum and GitHub Actions revisions are pinned. Environment files, keys, logs, build outputs and browser artifacts are excluded from source and Docker contexts.

The [CI workflow](../.github/workflows/verify.yml) uses generated local secrets, synthetic AI/payments/authority and real PostgreSQL. It tests concurrent reservation/command behavior, private executor binding, signed receipt rejection, gateway failure/forgery/replay, actual authenticated MCP calls, network isolation, service recreation and browser journeys. Live Azure checks are opt-in; native PayPal approvals and hosted Decionis proof remain separate acceptance gates.
