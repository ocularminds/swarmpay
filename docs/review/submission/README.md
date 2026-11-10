# SwarmPay submission package — November 10, 2026

This is the third part of the requested review, after [brand and UX #39](https://github.com/ocularminds/swarmpay/pull/39) and [technical review #40](https://github.com/ocularminds/swarmpay/pull/40). It contains reviewed replacement materials and dated evidence. **The existing Devpost entry remains submitted; these replacements have not been published and the review stack has not been deployed by this work.**

## Existing public entry

| Item | Verified result |
| --- | --- |
| [Devpost](https://devpost.com/software/swarmpay-multi-agent-commerce-escrow) | Owner view: **SUBMITTED · 5/5 steps done**. Keep the SwarmPay name and working slug. |
| [Public video](https://www.youtube.com/watch?v=SHIB2tTIrmc) | Playable, non-private, 115 seconds; recorded October 31. It shows the payment journey but does not visibly demonstrate an outside MCP call or exact receipt replay. |
| [Live sandbox](https://swarm.decionis.com) | Anonymous health and fresh native PayPal/agent/receipt checks passed with the qualifications below. |
| [Public source](https://github.com/ocularminds/swarmpay) | Apache 2.0. An anonymous clone of master `2898d7a` passed setup, doctor, Docker build/start and full REST/MCP smoke. Its isolated test containers/volumes were removed afterward. |
| Private judge access | Existing saved Devpost credentials match the dedicated buyer that signed in successfully. Its workspace and ledger were empty; the review did not create judge-account plans or payments. [Sanitized read-back](../evidence/submission/judge-access.json). |

The [official rules](https://paypalaihackathon.devpost.com/rules), checked November 10, close submissions **November 12 at 20:00 UTC / 21:00 Stockholm**. Judging is December 1–15; results are expected around December 21. Section 5 restricts post-deadline changes to its limited permitted exceptions. Dates do not authorize a public rename. Kintlo remains the selected, separately [prepared commercial identity](../../brand/README.md).

## Replacement material

| Material | Review source |
| --- | --- |
| Elevator pitch, story, technology list and public links | [Prepared Devpost text](../../submission-draft.md) |
| Exact fields and sponsor answers | [Field values](devpost-fields.json); personal eligibility declarations and the owner's ratings are deliberately left to their existing answers |
| Project cover | [1800×1200 SwarmPay cover](../../../apps/web/public/brand/swarmpay-cover-devpost.png), 3:2 and below 5 MB; conceptual artwork |
| Application gallery | [Contact sheet](gallery/contact-sheet.jpg), [original PNGs and provenance](gallery.json); actual local review screenshots, with simulated model/payments/catalogs/venue |
| Demo edit | [Storyboard](../../../demo/video-script.md), [captions](video/captions.srt), [transcript](video/transcript.txt), [contact sheet](video/contact-sheet.jpg), [provenance](video/provenance.json), [format verification](video/verification.json) |
| Judge path | [Public guide](judge-guide.md); the operator's updated private copy is described below |
| Open requirements | [Complete brief matrix](../../review-implementation-status.md), [submission checklist](../../submission-checklist.md), [sponsor licenses](sponsors-and-licenses.md), [merchant/venue terms](merchant-and-delivery-terms.md), [research protocol](operator-research.md) |

The new **165-second** MP4 is prepared in the operator's ignored working directory:

```text
.local/review-20261110/video/exports/SwarmPay-review-demo-1080p.mp4
```

It is 1920×1080, 30 fps, H.264/AAC, with fast-start metadata, burned captions and a separate SRT. Generic Kokoro narration is disclosed; no human presenter footage was supplied. Actual public sandbox captures supply the core demonstration. The short gallery segment explicitly identifies the local review build. PayPal profile/address/funding details are masked. Product pixels and payment results are not synthesized; the labeled MCP/evidence panels are readable excerpts of actual recorded JSON. Edits cut waiting and hold real frames for reading.

The existing YouTube URL stays in the prepared fields until a replacement has an actual public URL. Uploading the edit and saving replacement entry fields are publication steps after review, outside the three-PR delivery. Do not point judges at an unpublished local path.

## Fresh public proof

The [rehearsal record](../evidence/submission/sandbox-rehearsal.json) covers **Review Pavilion**, workflow `5f2b75f3-50e1-4980-a140-bbdda07b1e02`, on the existing public deployment. It uses real PayPal sandbox calls and test money, actual Azure planning, simulated rental/catering catalogs and venue, and AgentSafe's local test authority.

1. Both merchant SDK buttons opened PayPal, and both native approval callbacks returned to the application. Tents captured **$500**; catering authorized **$900**.
2. An outside Node client invoked the real MCP endpoint. Human consent was refused with **HTTP 403**. Its early catering request returned **ESCALATE / HELD**, `synthetic-dossier-5`, with no receipt and no catering capture command. Paid money stayed **$500**. [Request/result](../evidence/submission/mcp-hold.json).
3. The simulated venue signed the matching delivery facts. Receipt verification permitted the **$900** catering capture. [Completed public UI](../evidence/submission/public-completed.png).
4. Repeating the milestone request retained the same capture IDs, **five** payment-command identities and the **$1,400** total. The final browser export verified its application record chain. The replay's `FORWARDED` field belongs to the stored successful result; it does not mean another provider call. [Replay](../evidence/submission/mcp-replay.json).
5. The actual AG Studio analyst cited the held dossier and separated the later successful payment at `synthetic-dossier-6`. [Answer and matching records](../evidence/submission/analyst-answer.md).
6. The temporary MCP token was revoked in the UI; the same token was then refused with **HTTP 401**. [Revocation](../evidence/submission/mcp-revoked.json).

The public deployment's source revision is not exposed, and the existing Kubernetes identity could not read its deployment metadata. Current native-journal attestation was unavailable through that identity. Neither result was invented from a health check or a passing PR.

**Exact receipt replay remains separately scoped.** Fresh local smoke/restore and historical sandbox records resend a valid receipt and retain the capture total. The fresh public UI returned acceptance rather than the signed envelope; exports contain a digest rather than its bytes. This new live run repeats the MCP payment request. A saved local signing key failed a consistency precheck, so no additional receipt was sent. Repeating the original live envelope requires that envelope or authorized current signer/storage access.

**No new settled refund.** A separate Refund Pavilion plan stalled at the PayPal SDK loading frame in the review browser, including after reload and in a fresh tab. No provider order/capture was created. The unpaid plan was cancelled before the event and its reservation release was recorded. [Cancellation](../evidence/submission/unpaid-cancellation.png). Complete a refundable sandbox tent capture and pre-event cancellation while catering is unpaid before claiming a new refund result.

## Private judge handoff

The existing private Devpost testing field was read without modification and matches the verified judge buyer. A refreshed instruction file, including those same credentials, is saved only at:

```text
.local/review-20261110/submission/judges-testing-instructions.private.md
```

It has owner-only file permissions and is excluded from Git. Use it only in the entry's **Testing instructions or credentials the judges need to test your project, if any** field. The buyer is shared across judges, so subsequent fictional test plans will be shared. The recording account is separate. Keep all passwords, bearer tokens and raw provider responses out of public materials.

## Reproduce the package

The private raw capture set must already exist; these commands do not fabricate or fetch product footage.

```sh
python3 demo/review/prepare-gallery.py
python3 demo/review/render-video.py --preview-only
python3 demo/review/render-video.py
```

Pillow and ffmpeg are required for rendering. Narration is separately generated by `demo/review/narrate-video.py` with Kokoro ONNX and the licensed local model assets; its `--models` argument points to the actual downloaded model directory. `video-scenes.json` stores the source script, and generated narration timings set the edit to 165 seconds. Raw captures, credentials, audio and the MP4 stay in `.local/`; the public gallery, captions, metadata and sanitized proof are committed.

The [sandbox MCP helper](../../../demo/review/sandbox-mcp.mjs) takes `hold`, `replay` or `revoked` plus an existing workflow ID and a private token file. Its exact $1,400 and sandbox checks prevent it from being a generic payment runner. Obtain the appropriate organizer authorization before issuing a new token or testing another workflow. The recorded token is already revoked.

## Remaining external prerequisites

Deploy the reviewed stack through the existing release process and record its immutable revision before calling the screenshots deployed. Publish replacements only after reviewing the actual video, story and fields. Obtain Studio coverage beyond **December 15 00:00 UTC** and Bryntum rights through all of judging. Name operational owners and agree actual deployment backup/restore objectives. Real customer interviews, supplier/venue contracts, hosted Decionis enforcement and a commercial Kintlo launch each require their specific inputs in the matrix; no prepared document completes those requirements.
