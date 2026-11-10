# Technical review — November 10, 2026

This is part 2 of the review against the [eleven-page brief](baseline/brief.review.pdf). The web/API changes ship together. These results concern the reviewed source and isolated fixtures unless a record explicitly identifies another environment.

## Recorded outcomes

- [Final verification record](evidence/technical/verification.json): Java 21 verification passed **179 tests**, including PostgreSQL recovery and real SDK HTTP fixtures; no failures or skips. The web build, four payment-state tests, 52 configuration/protocol tests, six gateway tests, nine hosted browser cases and both npm audits passed. The published AgentSafe boundary refused all six attacks and admitted the one authorized execution used by its replay case. The hosted Postman/MCP folder passed eight requests and thirteen assertions with a real organizer-issued fixture token.
- The real REST/MCP fixture held an early request, accepted a matching signed venue receipt, captured once and kept the total at **$1,400** after replay. These payments and the signer are simulated. The native PayPal button component is exercised with a stand-in SDK in browser coverage.
- [Azure planning evaluation](evidence/technical/planning-azure.json): six real model/catalog scenarios and four deterministic invalid-input checks passed. Changed guest capacity and service/budget requirements changed the selected offers; the rain/dry pair correctly kept the same affordable pair. Channel3 returned purchase listings. All plans stayed drafts with zero payment commands. The [demo rules evaluation](evidence/technical/planning-demo.json) passed its five rental scenarios and four rejection cases; purchase sourcing is explicitly blocked when its key is absent.
- The [actual dashboard answer](evidence/technical/analyst.json) cited the held request and matching dossier, explained the missing receipt and distinguished the later completed capture. Captured money and command identities did not change. [Screenshot](evidence/technical/analyst.png). The wider dashboard and initially collapsed editing/data panels keep the answer readable.
- [APIMatic generation](evidence/technical/apimatic.json) covers all **35 current operations** in a newly generated portal and SDK. Both ESM and CJS TypeScript builds passed, including the new balances, measurements and provider-status contract. Generated files remain in `.local/review-20261110/apimatic/`; they were not published.
- [Isolated restore](evidence/technical/restore.json): both schemas, roles/grants and native journal restored; application and native chains verified; replay retained five original command IDs and the same $1,400 total. Restore/start/replay took **58.4 seconds** on this machine. This is a rehearsal measurement, not an agreed production recovery objective.
- [Current read of historical sandbox evidence](evidence/technical/sandbox-history.json): the October 31 catering authorization `07731015K3449464F` was renewed as `97P017464E128624V` at **2026-11-03 00:59:01 UTC**. The stored reauthorization is `SUCCEEDED` / `AUTHORIZED`; catering remains uncaptured. This authenticated November 10 read requested no payment or reconciliation. The Harbor demo workflow belongs to a different organizer and returned 404 under this password account; its preserved October video/proof remains historical evidence.

[Pending payment](evidence/technical/payment-pending.png), [payments](evidence/technical/payments.png) and [ledger](evidence/technical/ledger.png) show actual rendered fixtures. The pending image is an explicitly injected browser fault used to verify the UI; it is not a newly observed PayPal incident. Source fingerprints distinguish edited source from the parent commit. No result in this document claims the stack is deployed.

The [390px dashboard](evidence/technical/payments-mobile.png) uses Studio's supported report/layout API to stack its real widgets vertically. Totals remain readable; resizing back preserves values, filters and widget configuration. The browser regression checks that the rendered total matches `/api/balances` at both widths.

## Payment and evidence corrections

| Finding | Result | Regression evidence |
| --- | --- | --- |
| A gateway `SUCCEEDED` response could still contain PayPal `PENDING`; the ledger counted it as paid or refunded. | `LedgerEntry.providerStatus` carries the provider result. Ledger totals, schedule and analyst data require a settled `CAPTURED`/`REFUNDED` result. Permission and settlement are displayed separately. | `payment-state.test.ts`; PostgreSQL pending-capture and refund tests; browser pending-outcome test. |
| Late reconciliation could overwrite a completed command even when the order projection stayed final. Rechecks also changed the apparent settlement time. | Completed commands remain final; `settled_at` preserves the first completed observation. Renewal eligibility uses that timestamp rather than the last poll. | PostgreSQL late-result and renewal regressions. Existing migrated rows retain their best recorded timestamp, not an invented provider timestamp. |
| A frozen plan with an unprojected, uncertain attempt could release its reservation. | Queued, dispatched, unknown and provider-pending commands retain the reservation. A confirmed non-dispatch can clear that exposure; an uncertain attempt cannot be retried as a new payment. | PostgreSQL cancellation/unknown-outcome regression. |
| Workflow totals always returned the approved plan total as committed, even after release. Dashboard reconstruction treated any void as a cancelled event. | Workflow reads use one consistent database snapshot. `/api/balances` returns actual active reservations and settled order balances for every approved plan. A dispute freeze, a void and event cancellation stay distinct. | PostgreSQL balance/refund tests; REST smoke assertions. |
| Cancellation could stop between recording the request and enqueuing its void/refund. | A worker resumes missing protective settlements using their existing stable business identities. Paid catering requires merchant resolution; automatic cancellation covers unpaid catering and the full tents payment. | Cancellation recovery query regression and browser cancellation journey. |
| Delivery confirmation announced payment before the capture settled. | Receipt success is separate from payment success. Pending, held and confirmed non-dispatch results have their own next action and inspectable decision. | Browser fault fixture and status regressions. |
| Plans sharing a venue were aggregated into one budget bar. Unknown agent results were counted as held. | Custom widgets group by plan/request identity. Only HELD/ESCALATE/BLOCK/BLOCKED count as stopped requests. | Browser fixture with two plans at one venue and an indeterminate request. |
| Missing schedule data became an empty history with planned payment bars. | Failed reads show a visible error. The schedule uses recorded provider outcomes, respects freezes, and labels planned renewals as plans. | Browser journey plus provider-state projection checks. |
| The deterministic demo reader dropped “5 rental tents.” | Recognized, bounded tent modifiers preserve the explicit count. Unrelated intervening words do not become a quantity. | `DemoInterpreterTest`; the changed-brief evaluation exposed this case. |

The recent ledger remains bounded at 500 commands and 500 agent requests. Its filtered total refers to the displayed rows. A workflow filter is applied before that limit. Overview balance KPIs cover all approved plans; recent-record charts and decision counts disclose their narrower scope. The analyst receives request/plan IDs, the dossier/reference and the same settled-money calculation; its instructions require these citations and distinguish permission from payment.

Exact consent, separate native PayPal merchant approvals, integer cents, database reservations, private credentials, executor receipt checks, stable command identities and reconciliation remain the payment boundary. A UI badge never authorizes execution.

## Measured behavior

`GET /api/measurements` requires the organizer's human session and returns only their workflow IDs and numeric observations. It adds no raw briefs, venue names, credentials, receipt bodies or model payloads to the measurement export.

| Field | What it measures | Limit |
| --- | --- | --- |
| `planningMillis` | Successful proposal processing from request admission through catalog/model work to plan construction. | Failed drafts are excluded; this is server latency, not customer time saved. |
| `briefToPlanMillis` | Last `/api/intent` request to the next successful plan in the same browser session, including intervening review. | No measurement before the first submitted brief; concurrent tabs share a session. Manual/MCP-only plans and old records can have null. |
| `organizerActions` | Recorded HUMAN audit actions, including consent, merchant approval callbacks, venue confirmation and review actions. | Not a click counter; callbacks and deliberate retries are observable actions. |
| `heldAgentRequests` | Actual recorded agent requests with held/blocked authority outcomes. | Unavailable or unknown outcomes are separate. |
| `receiptToCaptureMillis` | First accepted receipt ingestion to the first completed catering capture observation. | It measures software processing, not physical delivery time. Null until captured. |
| `resolvedExceptionMillis`, `resolvedExceptions` | Sum and count of first exceptional/pending observation to later completed provider settlement. | Known non-dispatches without a later provider settlement remain open exceptions; not every exception should be retried. |
| `unresolvedExceptions` | Commands with an exceptional observation and no recorded provider settlement. | Includes held and not-started work; it does not assert that money moved. |

Historical timing is left null. The observer records future values against the existing durable workflow, command and receipt records. An operator can export this endpoint using their normal session; no globally readable metrics or raw event stream was opened. Actual research findings and a comparison to an organizer's previous workflow are still needed for an impact claim.

`demo/review/planning-cases.json` covers rain versus dry conditions, guest capacity, a higher-service request/budget, an impossible budget, purchase listings, and deterministic invalid requests. `evaluate-planning.mjs` checks typed extraction, actual offer choices, amounts and zero payment commands. Default runs use the labeled demo rules. `--live-ai` explicitly permits Azure inference while requiring simulated payments. Channel3 purchase listings are not retailer orders. The weather pair can validly choose the same affordable offer; this dataset does not claim weather changed a choice when it did not.

## Recovery and operating requirements

Run the isolated rehearsal after building the hosted fixture:

```sh
node demo/hosted/run.mjs up
NODE_EXTRA_CA_CERTS="$PWD/.local/hosted/tls.crt" node demo/review/backup-restore.mjs
```

The script creates two new local demo projects using the built images and synthetic settings. It seeds the source through REST and MCP, checks the native journal, stops its writers, dumps both database schemas with ownership/grants, copies the native journal, restores into the second project and replays the saved milestone. It checks row counts, application and native chains, original command IDs and the unchanged captured total. Only projects and temporary files created by that run are removed. Existing fixture databases, journals, review inputs and real environments are preserved.

The reused localhost fixture's native journal was found to contain sequence gaps during this review. Its original cause/time is not established by that check. The journal is preserved; a fresh successful rehearsal does not repair or certify that old chain. AgentSafe 0.2.5 documents that a crash between checkpoints leaves a visible gap. Compose now allows 45 seconds for its 10-second request drain and checkpoint flush, matching the existing Kubernetes termination grace. Repeated shutdown signals cannot start overlapping closes. This reduces an avoidable shutdown race; it is not a guarantee against a host crash or full disk.

Before an operational release, the designated operator must verify the actual deployed native chain, preserve any damaged evidence, reconcile provider results against stable command IDs, and resolve missing continuity explicitly. Do not truncate a journal, resequence it or call it verified after starting a new one. An unresolved provider result keeps its reservation and is reconciled under the existing identity.

| Operational prerequisite | Required action and acceptance |
| --- | --- |
| Monitoring and incident ownership | Name a primary and backup operator; give them the existing health check, AgentSafe status/chain checks and the organizer measurement export. Agree who handles failed checkouts, old unresolved commands and delivery disputes. No individual has been nominated by this review. |
| Production backup policy | Supply the target storage account, encryption/key access, retention, recovery point/time objectives and restore authority. Rehearse the actual database and journal restore together in an isolated environment, verify grants/runtime binding and provider reconciliation, then record measured recovery time. |
| Disk/journal integrity | Alert on disk exhaustion and native chain verification failures. Preserve evidence and investigate before claiming continuity. The local Docker storage failure observed during this review is not evidence of a production failure. |
| Hosted Decionis | The provisioned local key file was inspected and is empty. Supply an owned enforcement key, workspace/policy binding, actual signed-grant contract and a human approval/resume case. A connected decision UI or hostname alone does not establish application enforcement. Local test authority remains disclosed and fail-closed. |
| Real delivery issuer | Supply an issuer contract, identity onboarding, key IDs/history, rotation/revocation rules, clock tolerances and contested-delivery procedure. The current single configured Ed25519 signer is a simulated venue; its signature authenticates the statement, not physical delivery. |

## Settlement scope requiring agreement

| Behavior | Current implementation | Missing decision or contract |
| --- | --- | --- |
| Tents and catering | Exact approved full USD amounts; tents captured at checkout, catering authorized then captured on matching receipt. | Written acceptance from the tent supplier, caterer and venue. |
| Cancellation | Before event start and while catering is unpaid: freeze, full tents refund, catering void; reservation retained through uncertainty. Already captured catering requires merchant resolution. | Rules for post-delivery cancellation and disputed completed services. |
| Authorization expiry | Bookings within 28 days, one renewal after the initial 3-day honor period and within 3 days of the event; HTTP fixtures cover renewal and expiry. A historical sandbox renewal on November 3 is confirmed by the stored evidence read above. | Any new sandbox renewal still needs an approved authorization that has actually aged; the historical result is not a new payment approval. |
| Partial delivery or extra milestones | A receipt must match the approved full meal quantity and plan; no split release is implemented. | Merchant-approved quantities, evidence rules, allocation/rounding, partial settlement and retry identities. |
| Cancellation fees / partial refunds | No invented fee or partial refund policy. Full tents refund only. | Approved fee schedule, refund allocation, provider capabilities and consent wording. |
| Additional currencies | USD integer cents throughout the current consent and executor. | Supported merchant/currency matrix, minor units, FX owner/rate, rounding and refund exchange policy. |

These are explicit prerequisites for expansion, not implemented integrations or commercial agreements. See the [review status matrix](../review-implementation-status.md) for the current proof records and submission work.
