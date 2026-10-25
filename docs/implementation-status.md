**SwarmPay implementation status — October 25, 2026**

The user approved the architecture, then configured local credentials and selected Azure OpenAI. The configured deployment has completed typed intent extraction and both sourcing/risk assessments through the Java Responses adapter. The payment and authority journey remains an explicitly synthetic local flow; native PayPal sandbox and hosted Decionis validation still require account setup. This is not yet a completed hackathon submission.

| Capability | Delivered and verified locally | Still requires account access or additional implementation |
| --- | --- | --- |
| Monorepo and runtime | Gradle wrapper, Java 21 modules, two Spring Boot services, PostgreSQL/Flyway, React/Vite, Compose with isolated networks and database roles | Hosted deployment and operational infrastructure |
| Organizer journey | Intent form and extraction endpoint, editable event details, offer choices, plan review, exact consent, separate merchant progress, delivery/evidence views, desktop/mobile browser tests | Native PayPal popup behavior with actual sandbox accounts; broader accessibility audit |
| Agent roles | Three real Azure OpenAI Responses calls through the configured `gpt-6-astra` deployment; typed intent, sourcing and risk assessments completed in 18.1 seconds combined; strict schemas and fixed catalog prices | Broader model evaluation, cost measurement and account-backed payment journey |
| PayPal | Official Java SDK for create, capture, authorize, authorization capture and void; JS SDK checkout branch; merchant/amount/resource checks; negative binding tests | Two seller credentials plus buyer approval; actual authorization/capture, refusal/timeout, and webhook fixtures from PayPal sandbox |
| AgentSafe | Published gateway in enforcement/fail-closed mode; local authority ALLOW/BLOCK/ESCALATE/outage tests; spoofed headers overwritten; grant claim/replay/substitution checks in the supplied suite; journal verification | Hosted Decionis enforcement grant and signature verification, tenant policy binding, provider correlation and Presence approval/resume |
| Milestone | Ed25519 receipt verification repeated by executor; exact contract/issuer/quantity/time/nonce binding; photo-only hold; concurrent receipt/milestone replay causes one capture | A real venue integration and dispute process. Local receipt signer remains a clearly labeled fixture even when used with PayPal sandbox |
| Money and recovery | Integer cents, atomic whole-plan reservation, unique command/operation identity, private durable attempts, unknown outcome reconciliation, monotonic payment projection, restart recovery | Provider-supported recovery when a create-order response is lost before its ID is recorded; refunds, reauthorization and extended booking schedules |
| Cancellation | Human dispute freeze, gated cancellation of an existing uncaptured catering authorization; conservative reservation retention | Budget reallocation after cancellation, refund processing and unfreeze/review workflow |
| Webhooks | Compiled signature-verification API adapter, merchant/resource association, inbox deduplication and replayable reconciliation | Live signature/header fixtures and lifecycle coverage. Settled captures are not continually refreshed for later refunds/disputes |
| MCP | Seven real Spring AI tools over authenticated Streamable HTTP; initialized, listed and invoked by smoke test; bearer credential cannot record human plan approval | Multi-user scoped credentials, OAuth, and deployment-specific client configuration |
| Evidence | Application SHA-256 chain detects alteration; AgentSafe's own journal verifier succeeds; original command/provider/authority correlation identifiers retained | Hosted Decionis proof bundle verification. A local hash chain is not an externally witnessed ledger |
| Delivery | Local setup, environment doctor, isolated authority-key installation, API/MCP reference, CI definition, walkthrough and submission draft | CI execution on GitHub, public repository publication, optional hosted demo, final video and Devpost submission |

**Observed validation**

All 34 JUnit tests passed, covering money/plan invariants, signed receipt rejection, provider binding, outbox/reservation races, frozen plans, status ordering, private executor replay and the Azure Responses protocol on the full Spring AI application classpath. PostgreSQL tests use Testcontainers rather than an in-memory SQL approximation. The local smoke test exercises the full REST and MCP path through the actual AgentSafe runtime; two browser tests separately exercise the user journey and mobile budget refusal.

The opt-in Azure check passed on October 25, 2026. It extracted 30 guests, five tents and a $1,500 budget, then created a $1,400 draft with two provider-labeled assessments. No funds were reserved and no payment command was created. The private `.local/azure-integration.json` report records the timestamp, draft ID and 18,080 ms elapsed time without credentials. The endpoint and key are excluded from source and test output.

The network check verifies that the commerce application cannot connect to the private executor even by container IP, cannot read its payment tables, and has no PayPal client secrets or venue signing key. A fresh disposable database was initialized from the SQL bootstrap; service recreation checks preserve completed payment identities. Native AgentSafe journal verification and its supplied adversarial suite were also run.

NPM audits of the web and gateway dependency trees reported no known vulnerabilities at implementation time. This is a point-in-time package audit, not a security certification or a complete Java/container vulnerability scan. CI has been authored but has not been run remotely.

**Deliberate scope limits**

One configured organizer; USD; curated two-merchant catalog; one catering milestone; exact full-amount captures. UI event input uses the browser timezone, and stored/MCP event timestamps carry an explicit IANA timezone. Agents provide structured recommendations and summaries; they do not browse arbitrary stores or control payments directly. Prices include simulated buyer taxes/delivery, capacity is a fixture, and rain is user-provided context.

Plans may be prepared within 28 days, but catering checkout is restricted to the next three days. Quotes expire after 30 minutes. Changed terms require a newly approved plan; automatic supersession of an already funded plan is not supported. Pending/unknown operations keep their commitments reserved. Voiding an authorization does not automatically release the reservation for another purchase.

Payment holds remain holds. There is no application button that overrides a Decionis BLOCK or ESCALATE. The local retry action is available only after confirmed non-dispatch and obtains a fresh authority decision using the same command identity. Hosted Presence resume is an outstanding integration, not a completed feature.

**Next account-enabled work**

Complete the [sandbox runbook](sandbox-setup.md), then record an actual two-seller PayPal lifecycle and hosted Decionis enforcement/signature/hold-resume evidence. Current local configuration has a tent seller client ID/secret, but its merchant/webhook IDs, the catering seller configuration and a nonempty Decionis enforcement key are still absent. Azure access is verified. Run provider refusal, expiry, duplicate webhook and ambiguous-response cases against the actual payment/authority integrations before recording the final submission video. The approved broader delivery plan continues to track those remaining gates.
