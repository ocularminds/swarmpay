# SwarmPay demo — prepared 2:45 review edit

Prepared November 10, 2026. The existing [115-second published video](https://www.youtube.com/watch?v=SHIB2tTIrmc) remains linked from the [submitted entry](https://devpost.com/software/swarmpay-multi-agent-commerce-escrow). This new **165-second** edit is a local deliverable awaiting publication after review.

The main sequence is a fresh real PayPal sandbox recording on the existing public site. It uses a fictional event, actual Azure planning, simulated rental/catering catalogs and venue, and AgentSafe's local test authority. It does not prove the review branches are deployed. The later gallery segment is explicitly a prepared local review build with simulated payments/model behavior.

One event brief leads to **one exact plan consent and two merchant-specific PayPal approvals**. The key outcome is the missing-receipt hold, followed by a permitted capture and an unchanged total when the payment request is repeated. The new live run replays the MCP milestone request; exact signed-receipt replay has fresh fixture and historical sandbox evidence. Do not describe these as the same test.

## Timeline and exact narration

Timings come from the generated narration, not a guessed edit length. The voice is a generic licensed Kokoro voice; no human presenter was supplied or impersonated. Captions are burned in and provided as SRT.

| Time | Scene | What is visible |
| --- | --- | --- |
| 00:00.0–00:12.8 | Plan with AI. Pay on your terms. | Supplied SwarmPay wide artwork; conceptual title card. |
| 00:12.8–00:28.8 | One plan. Two PayPal approvals. | Actual Review Pavilion plan and its exact consent. Hold the real first frame while explaining the brief, then play the recorded approval. |
| 00:28.8–00:42.1 | Tents: $500 captured | Actual SDK button, labeled still of the native PayPal $500 window with profile/funding masks, then its real callback into the application. |
| 00:42.1–00:55.0 | Catering: $900 authorized | Separate actual SDK approval, masked $900 PayPal window, then native callback to Authorized / awaiting delivery. |
| 00:55.0–01:10.5 | An outside agent asks to pay | Readable excerpt of the real Node MCP exchange: public endpoint, protocol, request_milestone_payment, workflow ID and HTTP 403 consent refusal. |
| 01:10.5–01:28.8 | ESCALATE · HELD | Actual held-request timeline followed by the recorded JSON decision: $900 catering, ESCALATE/HELD, synthetic-dossier-5, receiptVerified false and exact intent hash. |
| 01:28.8–01:47.1 | Evidence permits the capture | Actual simulated-venue action, verified receipt, pending capture and completed $900 capture. No receipt body is invented. |
| 01:47.1–02:02.6 | Replay: still $1,400 | Actual completed plan followed by the final evidence excerpt: both capture IDs, same five commands, $1,400 unchanged and applicationChainVerified true. |
| 02:02.6–02:23.1 | An explanation tied to the record | Actual submitted question, then the real AG Studio answer beside its matching held request and ledger. Cuts omit model waiting. |
| 02:23.1–02:35.2 | Review build · prepared for publication | Clearly labeled local review gallery: landing and held request. These fixture images are separate from the public sandbox deployment. |
| 02:35.2–02:45.0 | Try SwarmPay | Supplied SwarmPay wide artwork with the working live site URL. Refer judges to their private instructions. |

### 00:00.0 — Plan with AI. Pay on your terms.

Office and community events involve different suppliers and payment terms. SwarmPay lets AI prepare the plan, while your approvals and verified delivery evidence control payment.

### 00:12.8 — One plan. Two PayPal approvals.

This is a fresh PayPal sandbox run. Azure interpreted thirty guests, five rental tents, rain, and a fifteen hundred dollar budget. Its sourced plan totals fourteen hundred dollars. I approve those exact terms.

### 00:28.8 — Tents: $500 captured

The native PayPal button opens the tents merchant's checkout. I approve five hundred dollars of test money. PayPal captures it, and the application receives the native callback.

### 00:42.1 — Catering: $900 authorized

The caterer has a separate PayPal approval. Nine hundred dollars is authorized, while paid money stays at five hundred. An authorization is not escrow.

### 00:55.0 — An outside agent asks to pay

Now an outside Node client connects through the real MCP endpoint. It can read this organizer's plan and request a milestone. Its attempt to grant human consent is refused.

### 01:10.5 — ESCALATE · HELD

The catering request returns ESCALATE and HELD. No verified delivery receipt is attached. The record cites synthetic dossier five, because this demo uses a local test authority. The authorization remains intact, and no catering capture is sent.

### 01:28.8 — Evidence permits the capture

The simulated venue signs delivery facts bound to this event, merchant, and quantity. SwarmPay verifies the statement and time window. PayPal then captures nine hundred dollars. A signature authenticates the venue's statement; it does not prove physical delivery.

### 01:47.1 — Replay: still $1,400

I repeat the milestone request. It returns the same capture. Tents and catering still total fourteen hundred dollars, with one capture for each merchant. The evidence export verifies its application record chain.

### 02:02.6 — An explanation tied to the record

I ask AG Studio why the earlier request was held. Its analyst cites dossier five, explains the missing receipt, and separates that hold from the later completed capture. The assistant can explain payments, never approve them.

### 02:23.1 — Review build · prepared for publication

The pull requests also prepare the updated interface and gallery. These are local review screenshots; the recorded sandbox flow uses the existing public deployment.

### 02:35.2 — Try SwarmPay

Try SwarmPay using the private judge instructions. AI plans. You approve. Payment follows verified terms.

## Capture and evidence requirements

- Use actual recorded product frames and real request/evidence excerpts. Never draw a new payment state, manufacture a signed receipt, change a provider ID or hide an evaluation notice.
- Keep the exact merchant, amount, intent and outcome legible. Privacy masks cover sandbox account/profile/funding details; the $500/$900 checkout amounts remain visible.
- Preserve the native per-merchant PayPal flow. The recorded callbacks happened without manually invoking buyer-approved endpoints.
- Label cuts, held reading frames and the local gallery. The public sandbox's source revision and a current native-journal attestation were unavailable; application-chain verification is separately labeled.
- Keep the ledger's synthetic dossier IDs accurately identified as local test authority records. The actual analyst distinguishes the early hold from the later successful capture and acknowledges that its ledger does not expose the underlying receipt body.
- Do not add a refund or renewal demonstration to this timeline. The historical November 3 renewal has a separate result. The fresh refund attempt never created a payment; an unpaid cancellation is not a refund. A paid catering plan is outside the automatic pre-event cancellation path.
- Use the existing public URL until the replacement is uploaded and independently playable. Retain SwarmPay through judging; a prepared Kintlo kit is not an authorized rename.

## Output and reproducibility

The MP4 is saved in the operator's ignored directory:

```text
.local/review-20261110/video/exports/SwarmPay-review-demo-1080p.mp4
```

[Contact sheet](../docs/review/submission/video/contact-sheet.jpg), [captions](../docs/review/submission/video/captions.srt), [transcript](../docs/review/submission/video/transcript.txt), [source/edit provenance](../docs/review/submission/video/provenance.json) and [format verification](../docs/review/submission/video/verification.json) are committed. The final format is 1920×1080, 30 fps, H.264/AAC with fast-start metadata, under 100 MB and under three minutes. Preview frames cover intent, both native approvals, the held decision, verified capture/replay evidence, analyst and close.

Source narration lives in [video-scenes.json](review/video-scenes.json). [narrate-video.py](review/narrate-video.py) uses actual local licensed Kokoro model assets; [render-video.py](review/render-video.py) reads the private captures, public MCP proof and generated timings. The renderer crops/resizes real product pixels, applies explicit PayPal privacy masks and renders labeled explanatory evidence panels. It fails if required source captures or proof are missing.

The [submission package](../docs/review/submission/README.md) holds the judge path, exact fields, gallery, current public links and remaining prerequisites.
