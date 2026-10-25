**Delivery phases and pull requests**

The user approved the [architecture](architecture-and-delivery-plan.md) and requested a PR for each completed phase. The initial reviews were stacked as [foundation #1](https://github.com/ocularminds/swarmpay/pull/1) → [guarded payments #2](https://github.com/ocularminds/swarmpay/pull/2) → [Azure/product #3](https://github.com/ocularminds/swarmpay/pull/3) → [integration and verification #4](https://github.com/ocularminds/swarmpay/pull/4). All four are merged. PR #4 integrated the intermediate phase merges into `master` after its full CI passed. Further phase reviews start from `master`. No automatic merges are configured. The repository remains private; public release is part of the submission phase.

| Approved phase | Implementation and review status | Remaining exit gate |
| --- | --- | --- |
| 0. Capability verification | Dependency compatibility, local AgentSafe boundary and three Azure calls verified | Actual two-seller PayPal sandbox lifecycle; hosted Decionis signed grant, claim, signature and Presence resume |
| 1. Foundation | Merged; Gradle/Java modules, authenticated REST/MCP discovery, web shell, Compose, migrations and isolation. GitHub CI passed. | Complete for the approved foundation scope |
| 2. Payment and authority | Core merged into `master`; guarded create/capture/authorize/void, receipt, durable attempts, reconciliation and webhooks. Follow-up adds real SDK HTTP fixtures, bounded transport, response/recovery checks and a read-only seller preflight | Native sandbox buyer approvals, actual provider failure/webhook fixtures and hosted authority verification |
| 3. Agent and product | Merged into `master`; verified Azure intent/roles, explicit strict schemas, source labels, responsive organizer journey and browser tests | Full organizer journey with the account-backed payment/authority flow from Phase 2 |
| 4. Reliability and demo | PR #4 merged; concurrent Docker/Gradle cache fix, replay/restart, CI, evidence and runbooks. Follow-up adds a callback-only ngrok listener and route isolation checks | Active ngrok account, external failure/recovery acceptance gates and final account-backed rehearsal |
| 5. Submission | License and submission text prepared | Final sandbox/authority proof, public video under three minutes, reviewer access and Devpost submission |

A passing fixture test is recorded as local evidence; it does not close an external-account gate. Merging an implementation also does not verify those missing capabilities. Credentials stay in ignored local files. New external evidence should update the [capability matrix](implementation-status.md) before the account-backed demonstration is declared complete.
