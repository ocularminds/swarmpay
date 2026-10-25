**SwarmPay demo walkthrough**

Start with the [README](../README.md). For a repeatable recording or test, use `SWARM_AI_PROVIDER=demo docker compose up -d --wait commerce-app`; this leaves the local `.env` intact. Restore the configured provider afterward with `docker compose up -d --wait commerce-app`. Live Azure planning and synthetic payments are independently labeled in the UI.

**Two-minute local demonstration**

| Time | Action | Evidence to show |
| --- | --- | --- |
| 0:00–0:20 | Open the organizer workspace. Describe a rainy outdoor meetup for 30 people, five tent rentals and a $1,500 budget. | Absolute event date, venue, rental confirmation and editable quantities. Clearly identify local payment/authority fixtures. |
| 0:20–0:40 | Use **Understand request**, then **Prepare my plan**. Keep the event about one hour ahead. | Sourcing and risk summaries with their actual provider label. Two curated merchants: $500 tents and $900 catering. |
| 0:40–1:00 | Review and approve the exact $1,400 plan. Complete the two **Simulated checkout** dialogs. | Tent payment is captured; catering is authorized. Confirmed paid is $500, committed is $1,400. |
| 1:00–1:20 | Open **Delivery & proof** and upload a small image. | Payment stays held because a photo does not satisfy the agreed receipt condition. |
| 1:20–1:45 | Export the workflow, sign it with the separate fixture and upload the signed receipt. | Receipt passes exact contract checks. A fresh gated catering capture brings confirmed paid to $1,400. |
| 1:45–2:00 | Download evidence and inspect the timeline. | Original command IDs, authority correlation, provider result and chain verification. Replaying the receipt creates no second capture. |

Sign the exported workflow outside the application:

```sh
node demo/sign-receipt.mjs /path/to/workflow.json /path/to/receipt.json
```

Upload the receipt within 15 minutes. The fixture signs the matching catering order and current delivery time; it is a disclosed test issuer. It does not manufacture a real-world delivery claim.

**Failure and recovery scenes**

Use **New plan** with a $1,300 budget. The $1,400 plan cannot be approved and creates no payment command. A forged or altered receipt similarly cannot release catering. To demonstrate cancellation, authorize catering on a fresh plan, open payment controls, choose **Freeze for review**, then **Void catering authorization**. A freeze stops spending but permits the guarded void; the conservative budget reservation remains visible.

Run the scripted version with `node demo/smoke.mjs`, followed by `node demo/check-isolation.mjs` and `node demo/check-restart.mjs`. The restart check recreates application containers, so use it on the local test stack. It confirms that completed payment IDs and the audit chain survive and that replay retains the original five command identities.

Use **New plan** to repeat the journey. `docker compose down` stops services without deleting data; `docker compose up -d --wait` restores them. Volume deletion is deliberately omitted from this walkthrough because it erases workflows and the authority journal. Expired quotes require a fresh plan.

**Account-backed hackathon recording**

The final submission must use the [sandbox runbook](../docs/sandbox-setup.md), actual Azure responses, native PayPal approvals and verified hosted Decionis authority evidence. Keep the catalog and venue issuer visibly labeled as fixtures. Do not present a local authority decision as a hosted signed grant, an authorization as a completed payment, or authorization/capture as legal escrow. The final public video must stay under three minutes; the current local walkthrough is preparation for that account-backed recording.
