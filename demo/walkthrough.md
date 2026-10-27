**SwarmPay demo walkthrough**

Start with the [README](../README.md). For a repeatable recording or test, use `SWARM_AI_PROVIDER=demo docker compose up -d --wait commerce-app`; this leaves the local `.env` intact. Restore the configured provider afterward with `docker compose up -d --wait commerce-app`. Live Azure planning and synthetic payments are independently labeled in the UI.

**Two-minute local demonstration**

| Time | Action | Evidence to show |
| --- | --- | --- |
| 0:00–0:20 | Open the organizer workspace. Describe a rainy outdoor meetup for 30 people, five tent rentals and a $1,500 budget. | Absolute event date, venue, rental confirmation and editable quantities. Clearly identify local payment/authority fixtures. |
| 0:20–0:40 | Use **Understand request**, leave both offer preferences on **Sourcing Agent chooses**, then **Prepare my plan**. Keep the event about one hour ahead. | The Sourcing Agent's choice and reasons, then the risk review, each with its actual provider label. The server checks the choice: $500 tents and $900 catering. |
| 0:40–1:00 | Review and approve the exact $1,400 plan. Complete the two **Simulated checkout** dialogs. | Tent payment is captured; catering is authorized. Confirmed paid is $500, committed is $1,400. |
| 1:00–1:20 | Open **Delivery & proof**, upload a small image, then choose **Let the agent request payment**. | A photo does not satisfy the receipt condition. The agent's early request reaches AgentSafe, which holds it with a dossier ID; no payment command is queued. |
| 1:20–1:45 | Choose **Confirm delivery as the venue**. | The separate venue signs a receipt with its own key; it passes exact contract checks, and the same boundary allows a fresh catering capture. Confirmed paid reaches $1,400. |
| 1:45–2:00 | Download evidence and inspect the timeline. | Original command IDs, authority correlation, provider result and chain verification. Replaying the receipt creates no second capture. |

The simulated venue runs in its own container with its own signing key; the application and its agents cannot read that key. It confirms a delivery only for the signed-in organizer's plan, signs the order the application recorded with the current time, and submits the receipt through the public venue ingress. It is a disclosed test issuer and does not manufacture a real-world delivery claim. To test altered or replayed receipts, sign an exported workflow outside the application and upload it within 15 minutes:

```sh
node demo/sign-receipt.mjs /path/to/workflow.json /path/to/receipt.json
```

**Failure and recovery scenes**

Use **New plan** with a $1,300 budget. The $1,400 plan cannot be approved and creates no payment command. A forged or altered receipt similarly cannot release catering. To demonstrate cancellation, authorize catering on a fresh plan, open payment controls, choose **Freeze for review**, then **Void catering authorization**. A freeze stops spending but permits the guarded void; the conservative budget reservation remains visible.

Run the scripted version with `node demo/smoke.mjs`, followed by `node demo/check-isolation.mjs` and `node demo/check-restart.mjs`. The restart check recreates application containers, so use it on the local test stack. It confirms that completed payment IDs and the audit chain survive and that replay retains the original five command identities.

Use **New plan** to repeat the journey. `docker compose down` stops services without deleting data; `docker compose up -d --wait` restores them. Volume deletion is deliberately omitted from this walkthrough because it erases workflows and the authority journal. Expired quotes require a fresh plan.

**Account-backed hackathon recording**

The final submission must use the [sandbox runbook](../docs/sandbox-setup.md), actual Azure responses, native PayPal approvals and verified hosted Decionis authority evidence. Keep the catalog and venue issuer visibly labeled as fixtures. Do not present a local authority decision as a hosted signed grant, an authorization as a completed payment, or authorization/capture as legal escrow. The final public video must stay under three minutes; the current local walkthrough is preparation for that account-backed recording.
