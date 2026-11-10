# SwarmPay submission readiness — November 10, 2026

The [Devpost entry](https://devpost.com/software/swarmpay-multi-agent-commerce-escrow) already says **Submitted to PayPal AI Hackathon**. Its existing [public video](https://www.youtube.com/watch?v=SHIB2tTIrmc) is 115 seconds. The [repository](https://github.com/ocularminds/swarmpay) is public and carries Apache 2.0. This review prepares replacement materials; it does not publish them or deploy the PR stack.

The [official rules](https://paypalaihackathon.devpost.com/rules), checked November 10, close submissions **November 12, 2026 at noon Pacific / 20:00 UTC / 21:00 Stockholm**. Judging runs **December 1–15**; results are expected around **December 21**. Section 5 restricts changes after the deadline, with limited organizer-permitted exceptions. Keep the submitted links usable and preserve SwarmPay throughout judging. See the [complete requirement matrix](review-implementation-status.md) for evidence and prerequisites.

## Verified and prepared

- [x] Public source, open-source license and anonymous clone. A fresh clone of public `master` `2898d7a` completed `demo/setup.mjs`, `demo/doctor.mjs`, a Docker build/start and the full REST/MCP smoke test. Payments, catalogs and venue in that run were simulated.
- [x] Existing Devpost submission and public video found directly. The older video remains historical sandbox footage; it does not establish that the review branch is deployed.
- [x] Brand and UX [PR #39](https://github.com/ocularminds/swarmpay/pull/39) passed CI and was merged. Technical [PR #40](https://github.com/ocularminds/swarmpay/pull/40), rebased onto that merge with an identical source tree, passed [CI on the updated commit](https://github.com/ocularminds/swarmpay/actions/runs/42760202621).
- [x] Corrected [README](../README.md), [submission story](submission-draft.md), [implementation status](implementation-status.md), [video script](../demo/video-script.md), [judge guide](review/submission/judge-guide.md) and [submission package](review/submission/README.md).
- [x] Exact supplied SwarmPay colors, fonts/licenses, three cover formats, actual fixture screenshots and separate Kintlo commercial artwork. The 1800×1200 Devpost cover is below 5 MB.
- [x] Current technical proof: 179 Java tests, 52 configuration/protocol tests, six gateway tests, four payment-state tests, nine hosted browser cases, full REST/MCP smoke, provider HTTP fixtures, isolation and an isolated database/journal restore.
- [x] Six real Azure/Channel3 planning cases plus four invalid-input rejections; an actual AG Studio analyst answer linked to the recorded held request and dossier. No payment permission was granted by the analyst.
- [x] Fresh APIMatic SDK and portal generation against all 35 current operations, with ESM and CJS builds. Generated output is prepared locally, not published.
- [x] Historical PayPal renewal confirmed by an authenticated November 10 read: the October 31 authorization renewed on November 3 at 00:59:01 UTC. No timestamps were changed to simulate age.
- [x] Existing anonymous live health check passed. It checks assets, sandbox settings, authentication boundaries, PayPal sign-in redirect and TLS; it does not check native checkout or expose the deployed revision.
- [x] Fresh public sandbox run completed both native merchant popup callbacks, a real outside MCP hold/no capture, simulated venue receipt, later capture, unchanged repeated milestone request and the actual analyst's cited explanation. The temporary token was revoked and rejected afterward. [Evidence](review/evidence/submission/sandbox-rehearsal.json) states the original-receipt replay and deployed-revision limits.
- [x] Dedicated judge buyer signed in through PayPal to an empty workspace and ledger. Its credentials match the existing saved private Devpost testing field; the owner view reports **SUBMITTED / 5/5 steps done**. [Read-back proof](review/evidence/submission/judge-access.json) contains no credentials.
- [x] Prepared 165-second, 1920×1080, 30 fps H.264/AAC video with burned captions, SRT, transcript, contact sheet and provenance. It has not replaced the existing public video.

## Finish in the owning accounts

| Item | Exact remaining action | Acceptance |
| --- | --- | --- |
| Review deployment | Merge the remaining reviewed changes, build immutable images through the repository release workflow and approve deployment to the existing judged site. Preserve database, journal, OAuth callbacks and payment identities. | Record the actual deployed commit/digests; run anonymous health, authenticated browser acceptance, a sandbox rehearsal and native-chain verification against that release. |
| Devpost replacement | Review the exact story, fields, gallery and video package linked above, then save them in the existing entry using the owner account before the deadline. Keep the current slug and SwarmPay name. | Read back the saved fields, gallery, video and submitted status; inspect the public page signed out. |
| Private judge instructions | The saved credentials already match the verified clean judge buyer. If applying the revised instructions, copy the prepared private text to the same field along with the reviewed submission update. | Preserve the working credentials and private visibility; read back the new text. Shared judge plans and the exact proof limits remain disclosed. |
| New video publication | Review the prepared approximately 2:45 edit and its provenance, then upload it to the owner-selected public video account if replacing the existing 115-second video. | Public, playable, under three minutes, legible, captioned, no private credentials, precise simulation/deployment labels. Replace the entry link only after the public URL exists. |
| Sandbox refund | Complete a new tent checkout when the sandbox SDK frame is available, then cancel before the event while catering is unpaid. The November 10 attempt created no payment and was cancelled. | Record the actual settled refund and reservation outcome. An unpaid cancellation or HTTP fixture is not a refund. |
| Live original-receipt replay | Obtain the original valid signed envelope or authorized access to the deployed signer/storage. The public UI returns acceptance, and exports contain a digest rather than the signed bytes. | Resend the same valid receipt, verify unchanged capture IDs/total and command identities, and distinguish it from the passing live MCP payment-request replay. |
| AG Studio | Obtain a license or written evaluation extension covering the entire judging window. The recorded AG Studio Pro trial expires **December 15 at 00:00 UTC**, before judging ends. | Written grant/key validity through the end of December 15 and a rendered check of the licensed build. Do not infer validity from absence of a watermark. |
| Bryntum | Obtain the actual hackathon/evaluation grant or licensed package rights through judging. The current dependency is `scheduler-trial@7.3.7`. | Written scope/expiry and a rendered check. Keep notices visible; never reset trial storage or use a fresh profile as a licensing workaround. |
| Operations | Name a primary and backup operator, agree backup storage, encryption/key access, retention, recovery objectives and incident authority. | Owners receive the existing monitoring/restore runbook; a restore of the actual deployment and its journal passes with provider reconciliation. |

## Proof boundaries

The October 28/31 records remain historical sandbox evidence. The separate October 31 rehearsal for workflow `56cd5676…` completed the app callback outside the popup; its coverage remains qualified. The November 10 public run freshly verified both native callbacks and a real MCP request/replay. Fresh fixture tests separately cover exact receipt replay, pending results, cancellation and recovery. See [implementation status](implementation-status.md) for precise dates and scopes.

A paid catering service cannot use the automatic pre-event cancellation path. Before the event, while catering remains unpaid, cancellation requests a full tents refund and releases the catering authorization; exposure stays reserved until settlement is known. Partial delivery/refunds, cancellation fees, extra milestones and other currencies require agreed rules. The [merchant checklist](review/submission/merchant-and-delivery-terms.md) names the missing agreements.

The current authority is AgentSafe's local test authority. The configured venue is a simulated Ed25519 signer. Real issuer credentials/contracts, hosted Decionis enforcement and approval/resume remain prerequisites, as do actual customer interviews. No local fixture or signed receipt establishes physical delivery or commercial acceptance.

## Keep the judged service usable

[The existing workflow](../.github/workflows/live.yml) runs the anonymous health check every six hours through December 15. GitHub sends failure notifications according to its existing settings; the review has not assigned an incident owner. Use the [technical operating runbook](review/technical-review.md#recovery-and-operating-requirements) for native-chain integrity, stable payment reconciliation and recovery.

The reused local journal has preserved sequence gaps. Do not erase, resequence or replace it to claim continuity. The fresh isolated restore passed independently. Keep public URLs, free judge access, sandbox resources, valid licenses, TLS, model/catalog access and operator availability through judging. Commercial Kintlo launch needs a separate owner decision, verified domain ownership and trademark clearance after checking the rules and actual results.
