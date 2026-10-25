**Delivery phases and pull requests**

The user approved the [architecture](architecture-and-delivery-plan.md) and requested a PR for each completed phase. Work is packaged as a stack so each review shows only that phase's changes. Merge order is foundation → guarded payments → Azure/product → verification. No automatic merges are configured.

| Approved phase | Implementation and review status | Remaining exit gate |
| --- | --- | --- |
| 0. Capability verification | Dependency compatibility, local AgentSafe boundary and three Azure calls verified | Actual two-seller PayPal sandbox lifecycle; hosted Decionis signed grant, claim, signature and Presence resume |
| 1. Foundation | Gradle/Java modules, authenticated REST/MCP discovery, web shell, Compose, migrations, credential/network isolation and CI | CI results are recorded in the foundation PR |
| 2. Payment and authority | Implemented; draft PR covers guarded create/capture/authorize/void, receipt, durable attempts, reconciliation, webhooks and synthetic acceptance tests | Native sandbox buyer approvals, actual provider failure/webhook fixtures and hosted authority verification |
| 3. Agent and product | Implemented; draft PR covers verified Azure intent/roles, explicit strict schemas, source labels, responsive organizer journey and browser tests | Full organizer journey with the account-backed payment/authority flow from Phase 2 |
| 4. Reliability and demo | Local checks and runbooks delivered in a draft PR: replay/restart, isolation, adversarial boundary, CI, evidence and walkthrough | External failure/recovery acceptance gates and final account-backed rehearsal |
| 5. Submission | License and submission text prepared | Final sandbox/authority proof, public video under three minutes, reviewer access and Devpost submission |

A passing fixture test is recorded as local evidence; it does not close an external-account gate. Credentials stay in ignored local files. New external evidence should update the [capability matrix](implementation-status.md) and the corresponding PR before that draft becomes ready for review.
