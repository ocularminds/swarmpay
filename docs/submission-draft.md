**SwarmPay submission draft — account validation pending**

**Tagline:** Give agents a budget. Pay merchants only on agreed terms.

SwarmPay helps an organizer turn an event request into a reviewed plan across two merchants. Two bounded AI roles compare curated offers and explain the risk and delivery terms. The organizer confirms the budget and payees, then completes each merchant's PayPal approval. Tent rentals are paid at checkout; catering is authorized and captured only after an agreed venue receipt passes deterministic verification.

The engineering focus is the boundary between a recommendation and a payment. Every payment command follows the published AgentSafe gateway into an isolated Java executor. The executor rechecks consent, reservations, resource bindings and receipt evidence, while durable command identities prevent a replay from creating another business payment. The UI shows partial completion and pending outcomes without presenting them as success.

The monorepo uses Java 21, Spring Boot, Gradle, authenticated Spring AI MCP, PostgreSQL, React, the PayPal Java/JavaScript SDKs, Azure OpenAI Responses and the published Decionis AgentSafe runtime. The requested model is GPT-6 Astra. The core includes two merchants, separate native approvals and one catering milestone. It does not depend on a general wallet, a legal escrow account or arbitrary-site purchasing.

At this stage the local payment and authority journey is reproducible with explicit fixtures. Use the [implementation status](implementation-status.md) for current account evidence. Do not submit this draft as a claim of verified hosted Decionis or PayPal sandbox execution until those gates pass.

Before submission, add actual PayPal sandbox and Decionis proof, the final public repository URL, reviewer run instructions, and a public YouTube video under three minutes. Confirm eligibility and the [official rules](https://paypalaihackathon.devpost.com/rules) again. The challenge deadline is November 12, 2026 at 20:00 UTC; target November 11. No Devpost entry, hosted deployment or public video has been submitted by this implementation.
