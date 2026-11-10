# SwarmPay — prepared Devpost update

Prepared November 10, 2026. This is reviewable replacement text; it has not been pasted or published by this review. The [existing entry](https://devpost.com/software/swarmpay-multi-agent-commerce-escrow) already shows **Submitted to PayPal AI Hackathon**. Keep the SwarmPay identity and working project URL. The name in the URL is historical; the product is not escrow.

Use the tagline below in **Elevator pitch**, the narrative in **About the project**, and the technology list in **Built with**. Sponsor-field text and gallery instructions are in [the submission package](review/submission/README.md). Credentials belong only in the private judge field. Review the [checklist](submission-checklist.md) before applying changes; this document is not publication evidence.

## Elevator pitch

AI plans your event. You approve the plan and each PayPal checkout. Catering is paid only after a verified venue receipt.

## About the project

### Inspiration

Office and community event organizers coordinate suppliers with different payment terms. Tents may need payment at checkout; catering should be paid against the agreed delivery evidence. The organizer needs one understandable budget and a record of what each merchant was paid.

SwarmPay uses AI to prepare that plan and a separate execution boundary to enforce its approved terms.

### What it does

Describe an outdoor meetup for 30 people, five rental tents and catering, with rain forecast and a $1,500 budget. AI turns the brief into editable details and proposes a $1,400 plan: $500 for tents and $900 for catering.

**Approve the plan once, then confirm each merchant in PayPal.** The exact merchants, amounts and receipt condition are bound to the approved plan. Tents are captured at checkout. Catering is authorized, with capture permitted after a matching venue-signed receipt.

An outside agent can connect through MCP and request the catering payment. An early request is held because its delivery condition is missing. The decision is inspectable. A photo alone cannot release payment, and replaying the same receipt does not create another capture.

The workspace keeps one main next action. Its schedule, payments dashboard and ledger distinguish approved budget, authorizations, completed captures, held requests, unknown outcomes and refunds. The dashboard analyst explains a decision using the recorded request and dossier IDs; it has no payment tool.

### How we built it

SwarmPay is a Java 21 / Spring Boot application with a React and TypeScript interface and PostgreSQL. It separates planning from payment execution:

- The commerce app records the exact consent and whole-plan reservation in integer USD cents. It can reach the configured AI/catalog services but cannot reach PayPal or the private executor directly.
- AgentSafe is a fail-closed gateway before the private payment executor. The executor alone holds merchant payment credentials and repeats the consent, amount, payee, reservation and receipt checks.
- Each payment command has a durable identity and PayPal request ID. An uncertain response is reconciled under that identity while budget stays reserved.
- A separate simulated venue holds the Ed25519 signing key. Receipt verification binds the issuer, event, merchant, quantity, time window and nonce to the approved contract.
- Seven typed MCP tools give an organizer's agent bounded access. Human plan approval and token issuance are excluded. Tokens are revocable and stored as hashes.

### PayPal and AI

The PayPal JavaScript SDK loads each merchant with its own namespace and intent. Orders v2 captures tents and authorizes catering. Payments v2 captures on verified receipt, can renew an eligible catering authorization, and supports the full tents refund/catering void used by cancellation. Webhooks are signature-verified per seller and prompt provider reconciliation. A separate service handles Log in with PayPal.

Azure OpenAI `gpt-6-astra` performs typed extraction, a sourcing choice constrained to catalog offer IDs, and a risk/milestone assessment. Java validates the result; catalog prices determine the amounts. An over-budget draft cannot be approved or start checkout. The model does not choose arbitrary payees or control merchant credentials.

### Sponsor tools

- **AG Grid and AG Studio:** a searchable ledger, settled-money totals, configurable charts, per-plan budget widgets and inspectable authority decisions. Studio's agent framework delegates payment questions to SwarmPay's analyst, which reads the same recorded outcomes and cites the evidence.
- **Bryntum Scheduler:** merchant payment timing, the delivery window, authorization honor periods, actual captures/voids/refunds and explicitly planned renewal markers.
- **Channel3:** server-side sourcing of in-stock USD purchase listings when the organizer chooses to buy tents. The current sandbox pays the configured test tents merchant; it does not place an order with the listed retailer.
- **APIMatic:** OpenAPI validation and fresh TypeScript SDK/documentation generation from the current **35-operation** description, with session/CSRF requirements. Both generated module builds passed. We also used the PayPal Context Plugin in the earlier renewal/refund implementation; its use is recorded with that work.
- **Render:** a tested Blueprint for a copy with simulated payments. Render's deployment does not enforce the payment isolation required for real merchant credentials, so the copy contains none.
- **Postman:** an outside MCP client with an organizer-issued token. The hosted fixture collection exercises denied approval, an early held request, evidence retrieval and revocation.

### Verified behavior and limits

**Fresh public sandbox rehearsal, November 10:** both merchant flows completed through their actual PayPal SDK buttons, popup approvals and native callbacks. Tents captured $500; catering authorized $900. A real outside Node MCP client requested catering payment before delivery and received `ESCALATE / HELD`, citing `synthetic-dossier-5`. The paid total stayed $500 and there was no catering capture command. The simulated venue's receipt then permitted the $900 capture. Repeated MCP milestone requests returned the same capture, with five original payment commands and $1,400 still paid. The actual AG Studio analyst explained the earlier hold and separated the later successful payment. The temporary token was revoked and rejected with HTTP 401 afterward.

**Proof limits for that run:** the original signed envelope was not returned by the public venue UI, so the fresh live replay is of the milestone request. Exact receipt replay has separate fresh fixture and historical sandbox proof. The exported application record chain verified; a current native-journal attestation and the deployed source revision were not exposed to this reviewer. A separate refund attempt stopped at a loading PayPal frame without creating an order or capture. Its unpaid plan was cancelled and released. No new settled sandbox refund is claimed.

**Historical sandbox evidence:** October 28/31 records show test-money captures, an early hold, a matching simulated venue receipt and unchanged totals after receipt replay. The published October 31 video shows the native checkout and delivery/capture journey; it does not visibly demonstrate an outside MCP call or receipt replay. Some separate historical rehearsals used PayPal-provided approval URLs and the ordinary application callback; their records explicitly qualify native popup coverage. The November 3 catering renewal has a new authorization ID and a successful stored result, re-read from the public sandbox on November 10.

**November 10 review checks:** 179 Java tests, nine hosted browser cases, REST/MCP and network-isolation checks passed. New pending-outcome tests separate gateway permission from provider settlement. A fresh isolated database/native-journal restore retained the original payment identities and the $1,400 replay total. Native SDK component tests use a stand-in SDK and simulated provider.

**Actual AI/catalog evaluation:** six Azure/Channel3 scenarios and four invalid-input cases passed without approving a plan or sending a payment. More guests and a higher-service request changed the selected offers. Rain versus dry weather kept the same affordable pair where both conditions were covered. The actual AG Studio answer cited the matching held request and dossier and distinguished a later completed capture.

**Current public access:** anonymous HTTPS/assets/authentication checks pass. The dedicated judge buyer signs in through PayPal to an empty workspace and ledger; the owner-visible submitted entry's private testing field contains those working credentials. An anonymous clone of public `master` completed setup, doctor, Docker build/start and REST/MCP smoke. The prepared 2:45 replacement video and review gallery are separate from the existing published video and public deployment.

Rentals, catering and the venue are simulated. AgentSafe currently uses a **local test authority**; hosted Decionis enforcement is a separate unfinished integration. A signature authenticates the venue's statement, not physical delivery. Authorization is distinct from payment, and the flow is not escrow. Full USD amounts and one catering milestone are supported; partial delivery, cancellation fees, partial refunds and additional currencies need agreed merchant rules. Automatic cancellation is limited to before the event while catering is unpaid, and its budget remains reserved through uncertainty.

### What we learned

Payment permission and payment completion are separate facts. A gateway can permit an attempt whose provider outcome is still pending. The same settlement rule must drive the ledger, timeline, dashboard and analyst.

A useful AI demonstration needs a changed input and an observable result. A signed record needs a clear statement of what it proves. Neither a model recommendation nor a signature replaces the organizer's consent or a real merchant/venue agreement.

### What's next

Validate the event-operator workflow with real participants and measured before/after effort. Agree merchant cancellation and delivery terms, onboard a real issuer with key rotation/revocation and dispute handling, and verify a provisioned hosted authority contract. Confirm sponsor licenses and operational ownership through judging before relying on those arrangements. Broader procurement remains a future extension.

## Built with

Java 21 · Spring Boot · Spring AI MCP · React · TypeScript · Vite · PostgreSQL · Azure OpenAI · PayPal JavaScript SDK · PayPal Orders v2 · PayPal Payments v2 · Log in with PayPal · PayPal webhooks · PayPal Java Server SDK · AgentSafe · AG Grid · AG Studio · Bryntum Scheduler · Channel3 · APIMatic · Render · Postman · Newman · Docker · Azure Kubernetes Service · Playwright

## Public links

- [Public source and Apache-2.0 license](https://github.com/ocularminds/swarmpay)
- [Hosted PayPal sandbox demo](https://swarm.decionis.com)
- [Published 115-second video](https://www.youtube.com/watch?v=SHIB2tTIrmc)
- [Existing submitted Devpost entry](https://devpost.com/software/swarmpay-multi-agent-commerce-escrow)

Private buyer/organizer credentials and any agent token must never appear in this text, the repository, screenshots or the video.
