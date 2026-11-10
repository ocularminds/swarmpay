# Kintlo / SwarmPay: complete review implementation instructions for Codex

## Objective

Implement the SwarmPay review in full, using the report and supplied design assets as the implementation brief. Deliver a polished, coherent product and accurate hackathon submission materials, with evidence for every completed requirement. Proceed beyond planning and isolated cosmetic changes: update the actual application, integrate the assets, reconcile the documentation, and verify the affected journeys.

The repository is `/Users/bonus/develop/products/SwarmPay`. When working in a separate checkout, resolve repository-relative paths against that checkout. The links below point to the original project directory.

**Selected commercial name: Kintlo.** The owner selected this name on November 10, 2026. Keep **SwarmPay** as the current hackathon-facing identity, following the current timing recommendation, and prepare Kintlo for the commercial launch after results. Apply the phase-specific directions below before changing public copy or assets. The name decision does not reopen the naming shortlist.

## Required references

Read the report before making changes. Inspect the actual images as well as the token files.

| Reference | Purpose |
| --- | --- |
| [brief.review.pdf](/Users/bonus/develop/products/SwarmPay/brief.review.pdf) | Primary brief: pages 1-10 preserve the innovation, positioning, gaps and polish review; page 11 records Kintlo and the commercial rollout timing. |
| [Kintlo name decision](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/brand-decision.md) | Selected name, pronunciation, meaning, rollout, dated domain screen and remaining registration checks. |
| [Kintlo palette](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/kintlo-brand-palette.png), [tokens JSON](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/brand-tokens.json), and [tokens CSS](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/brand-tokens.css) | Selected commercial identity. Same tested palette, new Kintlo labeling and `--kintlo-` variables. |
| [Kintlo project cover](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/kintlo-cover-project.png), [wide cover](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/kintlo-cover-wide.png), and [social cover](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/kintlo-cover-social.png) | Prepared commercial artwork, with no unverified launch URL or award claim. Use the SwarmPay versions for the current hackathon entry. |
| [Kintlo kit README](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/README.md) and [art direction](/Users/bonus/develop/products/SwarmPay/output/brand/kintlo-2026-11-10/art-direction.md) | Commercial asset inventory, exact proposed copy, provenance and export guidance. |
| [Editable report](/Users/bonus/develop/products/SwarmPay/output/pdf/swarmpay-hackathon-review-2026-11-10.md) | Searchable companion to the PDF. |
| [Brand palette](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/swarmpay-brand-palette.png) | Visual reference for the colors, typography and payment states. |
| [Brand tokens JSON](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/brand-tokens.json) and [CSS](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/brand-tokens.css) | Exact proposed values. Integrate these into the application's existing theme system. |
| [Payment-state specimen](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/swarmpay-payment-states.png) | Design reference for approved, authorized, paid and held states. This is an illustration, not a live screenshot or production data source. |
| [Devpost cover](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/swarmpay-cover-devpost.png) | 1800 × 1200, 3:2 project-gallery artwork. |
| [Wide cover](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/swarmpay-cover-wide.png) | 1920 × 1080 title artwork for the demo and presentation. |
| [Social cover](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/swarmpay-cover-social.png) | 1200 × 630 image for Open Graph and social previews. |
| [Asset README](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/README.md), [art direction](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/art-direction.md), and [contrast results](/Users/bonus/develop/products/SwarmPay/output/brand/swarmpay-2026-11-10/contrast-checks.json) | Usage, provenance, exact cover copy and tested color pairs. Matching SVGs and licensed fonts are in the same asset directory. |
| [Review evidence snapshot](/Users/bonus/develop/products/SwarmPay/output/swarmpay-review-evidence-2026-11-10.json) | What was observed on November 10, 2026, and what was not verified. |

The review used source commit `10c58a85e5f20ba2bfd366b27e45b618d42b9372`. Recheck the current source, deployment, repository visibility and submission status; the report is a dated baseline, not a substitute for current evidence. Preserve the report and source artwork as the baseline and record implementation outcomes separately.

## Working method and completion standard

1. Read applicable `AGENTS.md` files, inspect the working tree and current project instructions, and preserve unrelated user changes. Reuse a suitable existing checkout or worktree; follow the repository's branch workflow.
2. Create `docs/review-implementation-status.md`. Map every report recommendation to its PDF page, implementation location, acceptance condition, evidence and current status. Include the P0 items on page 3, proof map on page 4, design requirements on pages 7-8, P1/P2 items on page 9, and the Kintlo identity decision on page 11. Record the commercial launch separately from hackathon readiness; prepared artwork is not a completed launch.
3. Implement in priority order. Each requirement must end as **implemented and verified**, **already satisfied with current evidence**, or **blocked by a specific missing prerequisite**. Record any work remaining after a partial implementation. Do not silently omit a recommendation or substitute a new plan for completed work.
4. Make routine implementation decisions autonomously. Carry out already authorized, reversible work before asking for missing inputs. If an external action needs additional authorization, prepare the exact material first and identify the remaining action. Respect authorization already given in the executing conversation.
5. Real customer interviews, merchant agreements, venue credentials, payment approvals, publishing and account operations need their actual inputs and applicable authorization. Finish the independent code and documentation work while those are pending. Never invent evidence or label a prerequisite complete merely because its UI or instructions exist.

## 0. Apply the selected name at the correct phase

- **Selected commercial name:** Kintlo, pronounced KINT-loh. Use this case in display copy. The proposed brand line is **Many agents. Your rules.** and supporting line **AI plans. You stay in control.** These lines complement the specific event and payment explanation in section 3.
- **Current hackathon phase:** keep SwarmPay consistent across the entry, submitted demo, video and judge-access references. Apply the visual improvements using the SwarmPay assets. Preserve the working judged build and public links while preparing commercial work separately. A user-directed change to this timing takes precedence.
- **Commercial launch phase:** use the Kintlo kit and update the wordmark, website title, navigation, onboarding, sharing images, metadata, new screenshots, commercial documentation and appropriate user-facing messages together. Add a temporary **Originally presented as SwarmPay** reference where it helps continuity. Only claim an award once verified.
- **Rollout timing:** the checked schedule was submission close on November 12, 2026 at 21:00 Stockholm, judging December 1-15 and results around December 21. Recheck the [official rules](https://paypalaihackathon.devpost.com/rules) and current entry status. Section 5 freezes the submitted entry after the deadline with limited organizer-permitted exceptions. Do not trigger a public rename solely because a date has passed.
- **Domain:** `kintlo.com` returned no registry record in the preliminary November 10 check. It has not been purchased or verified as owned, and trademark clearance remains open. Confirm the actual launch domain before setting canonical URLs, Open Graph links, email addresses, OAuth callbacks or PayPal return URLs. Prepared commercial artwork deliberately has no domain.
- **Identifiers:** keep display branding separate from database keys, payment request IDs, idempotency namespaces, receipt audiences, OAuth configuration, API contracts and deployment identifiers. Inspect references and plan migrations explicitly; a global SwarmPay-to-Kintlo replacement is not acceptable. The current working directory remains `/Users/bonus/develop/products/SwarmPay`.
- **Verification:** when commercial rollout is authorized and in scope, inspect desktop/mobile surfaces and sharing metadata for consistent Kintlo branding, verify the old judge links remain usable, and test any changed redirect or integration configuration. Record publication and migration status with evidence. Prepared assets alone do not complete this requirement.

## 1. Apply the brand system throughout the product

Use these exact primary colors:

| Token | Value | Role |
| --- | --- | --- |
| Evergreen | `#11695B` | Primary actions and trust |
| Citron | `#D5FF5F` | Bright cover and selective emphasis |
| Sky | `#A9E7FF` | Supporting illustration and accents |
| Deep ink | `#142F2B` | Headings and body copy |
| Cloud | `#F7FAF7` | Page canvas |
| Slate | `#52665F` | Meaningful secondary text |

- Preserve the four rounded tiles in the existing mark and its slight rotation. Kintlo inherits this visual form. Use the correct phase's name and supplied visual direction consistently across the landing, signed-in workspace, dialogs, agent access, payments dashboard, ledger and schedule.
- Retain Manrope for headings and DM Sans for body and controls. Use the supplied fonts with their licenses if bundling them locally. Keep body copy around 16 px and meaningful secondary interface text around 14 px; fit dense data views thoughtfully rather than applying a global size override.
- Use roughly 70% light surfaces, 20% green/ink and up to 10% bright accent in the product. Citron may dominate the artwork. Keep dark text on citron and sky.
- Consolidate conflicting or obsolete color declarations into shared semantic tokens. Adapt AG Studio, AG Grid and Bryntum through their supported theme interfaces so embedded views feel like the same product.
- Follow the token spacing scale and 12-20 px control/card radii. Maintain clear hierarchy, restrained shadows and generous space around the main action.
- Fix the source-defined weak text combinations identified in the report, then inspect their actual rendered backgrounds: `#6B7C77` on white measured 4.40:1; `#8A9A94` on `#F7F9F8` measured 2.79:1. Meaningful normal text should reach at least 4.5:1. Check focus indicators and component boundaries as well as text.
- Verify keyboard navigation, visible focus, accessible dialog labels, reduced motion, useful alternative text and small-screen layout. Represent status with words and an appropriate icon, not color alone.

Start with `apps/web/src/styles.css`, `Landing.tsx`, `main.tsx`, `AgentAccess.tsx`, `Ledger.tsx`, `PaymentSchedule.tsx`, `SpendDashboard.tsx`, and `studio/theme.ts`; inspect the related components before editing. Complete the rendered result, including hover, focus, disabled, loading, error and empty states.

## 2. Integrate the artwork and sharing assets

- Put application-consumed copies of the phase-appropriate artwork in a durable web asset directory, such as `apps/web/public/brand/`. Use SwarmPay for the current hackathon entry and Kintlo for the commercial launch. Use normal production URLs; the application must not depend on a local filesystem path or the review's output folder at runtime.
- Integrate the illustration into the landing where it supports the event composer and the payment-term explanation. Keep the live input, example request and main action prominent. Adapt the composition responsively; use the SVG when a separate illustrative element is needed instead of placing a text-heavy full cover behind interface copy.
- Add Open Graph and Twitter metadata in `apps/web/index.html`, including the supplied social image, an accurate description, canonical project URL and appropriate image dimensions. Use absolute public URLs for sharing metadata and verify the resulting built asset is served.
- Keep the 3:2 cover ready for Devpost and the wide version ready for the demo title. Check dimensions, file size, small-thumbnail legibility and safe margins. Preserve the supplied SVG originals and font licenses.
- Keep actual product screenshots separate from conceptual artwork. Refresh gallery images from the implemented application once the real flow is verified.

## 3. Clarify the positioning and approval flow

The central position is: **AI plans the event; approved terms and verified delivery evidence control when merchants are paid.** Lead with office and community event organizers coordinating tents and catering. Treat broader procurement and contractor workflows according to their actual implementation status.

Use or refine the following copy while preserving its meaning:

- Headline: **Plan with AI. Pay on your terms.**
- Supporting copy: **One event brief. Two merchants. A plan you approve, with catering paid after a verified delivery receipt.**
- Approval explanation: **Approve the plan once, then confirm each merchant in PayPal.**
- Devpost tagline: **AI plans your event. You approve the plan and each PayPal checkout. Catering is paid only after a verified venue receipt.**

Apply the explanation consistently in the landing, consent step, checkout guidance, README, submission draft, demo script and relevant tool descriptions. Preserve the native merchant-specific PayPal approval behavior.

Make the limits clear at the relevant decision:

- Payments use the PayPal sandbox in this demo.
- The rental/catering catalog and venue are simulated where that is the actual configured behavior.
- Channel3 supplies purchase listings; the current sandbox flow does not order from the listed retailer.
- AgentSafe's current local test authority and any future hosted Decionis integration must be named accurately from verified configuration.
- An authorization is distinct from a completed payment. The flow is not escrow. A signed receipt authenticates an issuer's statement; it does not independently establish physical delivery.
- Explain the bounded roles the agents actually perform. Avoid unsupported claims of autonomous negotiation, global novelty, guaranteed delivery or unlimited spending in all competing products.

## 4. Implement clear payment states and actionable evidence

Use the specimen as a design reference while binding all displayed amounts, statuses and conditions to real application state.

- Distinguish **Plan approved**, **Awaiting PayPal approval**, **Authorized / awaiting delivery**, **Paid**, **Request held**, **Payment pending / outcome unknown**, **Refund pending**, **Refunded**, and cancellation/void states wherever supported by the actual lifecycle. Do not invent backend states merely to reproduce a mockup.
- Show the merchant, exact amount and payment timing together. Keep paid amounts separate from authorizations and reserved budget. Use the existing monetary domain and settlement-aware totals.
- Keep one clear next action. Explain the missing condition when catering waits. Place the simulated-venue disclosure next to the venue-confirmation action.
- Use the semantic token pairs for paid, waiting and held/blocked requests. An expected delivery wait should look different from an agent request that was held for lacking evidence.
- Make each hold inspectable: show the plain-language reason and link to the relevant decision and receipt condition. Put technical identifiers in the evidence detail, retaining correlation with the ledger.
- Make the schedule, ledger, dashboard widgets and analyst responses agree about the same underlying transaction state. Ensure the dashboard's explanation is grounded in recorded decisions.

Preserve the existing architectural protections: exact human plan consent; separate PayPal approval for each merchant; integer-cent amounts; atomic budget reservations; restricted agent tools; private merchant credentials; policy checks before execution; receipt verification by the executor; stable payment command identities; and reconciliation for unknown outcomes. Any lifecycle changes require meaningful regression coverage. A visual “success” state must never bypass or replace these controls.

## 5. Close the proof and documentation gaps

Use `README.md`, `docs/submission-draft.md`, `docs/submission-checklist.md`, `docs/implementation-status.md`, `demo/video-script.md` and the report's proof map as a connected set.

- Reconcile contradictory claims and stale diagrams, especially hosted Decionis versus local authority and broad live-verification claims around renewals/refunds.
- Keep separate labels for **verified on the current deployment**, **historical sandbox evidence**, **fixture-tested**, **simulated**, and **planned**. Record dates and source/deployment revisions. Keep the original historical evidence intact.
- Exercise the central sequence using an appropriate test environment: prepare a plan, approve it, complete each merchant flow, request catering payment before delivery, verify that no capture occurred, supply a valid signed receipt, observe the capture, replay the receipt, and confirm the captured total is unchanged.
- Verify tents through the actual SDK button component and an outside agent through the real MCP path. Test authorization boundaries and the ledger consequence, not only the presence of UI text.
- Exercise the dashboard explanation and check its decision references. Include a meaningful changed-brief comparison to show what AI contributes to sourcing.
- For renewal and refunds, obtain actual results where the required sandbox resources and elapsed authorization age are available. Otherwise retain truthful fixture coverage and name the exact missing live result. Do not manufacture timestamps or claim a new aged-authorization test can be completed immediately.
- Refresh sponsor claims against current implementation. Verify any APIMatic SDK/docs generation against the current API description rather than copying a historical operation count. Recheck AG Studio/Bryntum license suitability through judging and accurately describe the simulated Render copy.
- Produce current screenshots and the report's approximately 2:45 demonstration sequence. Prioritize the early request being held, evidence allowing payment, unchanged totals after replay, and an understandable explanation. Label prepared material and retain visible sandbox/simulation context.
- Prepare a clean judge-access path and private testing instructions. Record actual public video and repository links only once they exist. Publishing, account and payment actions must use the authorization and credentials applicable to the executing session.

The report's deadline was November 12, 2026 at 21:00 Stockholm time. Verify the current date and official schedule before using that deadline or treating any publication checklist as current.

## 6. Address all P1/P2 recommendations with real implementations or explicit prerequisites

The commercial and operational recommendations are part of the work, but a screen or TODO does not complete them.

- **Audience and impact:** prepare a concise event-operator interview protocol and a place to record actual findings, including sample size. Add appropriately scoped measurements for brief-to-plan time, organizer actions, held requests, delivery-to-capture outcomes and exception handling using existing observability where possible. Avoid collecting credentials, unnecessary personal data or raw sensitive briefs. Customer research and outreach require actual participants and authorization to contact them.
- **AI usefulness:** build a small, meaningful evaluation set covering weather, guest count, budget, buy/rent and invalid inputs. Verify changes in the resulting plan and deterministic rejection of invalid choices. Record measured results rather than assumptions.
- **Merchant terms:** make supported timing and cancellation terms visible and consistent with the domain. Obtain real merchant acceptance where available; document the specific missing agreement when it is not. Do not invent fees or terms.
- **Delivery trust:** inspect the current issuer integration and implement the necessary adapter/configuration and verification behavior against a real, provided issuer contract. Cover identity binding, key rotation/revocation and contested delivery as the agreed integration supports them. A simulated signer must remain labeled until a real integration is verified.
- **Hosted authority and operations:** use the actual Decionis contract and provisioned credentials for hosted verification and approval/resume. Preserve fail-closed behavior and local/demo disclosure until that integration succeeds. Add or complete isolated backup/restore rehearsal and operational documentation, and connect ownership to existing monitoring. Never fabricate grants or treat a hostname as proof of enforcement.
- **Broader lifecycle coverage:** account for partial delivery, cancellation fees, partial refunds, additional milestones, currencies and authorization expiry. Inspect which are already supported. Implement agreed, well-defined behavior with monetary and recovery tests; identify any missing product decision, provider capability or merchant agreement precisely before changing settlement semantics.

Complete everything that can be implemented and verified from the available contracts and authorization. Keep any dependent work visible in the status matrix with a concrete prerequisite and acceptance check; do not describe unverified integrations or speculative business behavior as finished.

## 7. Verification

Use the current repository workflow as the source for commands and prerequisites. Run checks appropriate to the actual changes and fix regressions before handoff.

- Build the web application: `npm --prefix apps/web run build`.
- Run affected desktop/mobile journeys, including `npm --prefix apps/web run test:e2e` with its required local environment. Inspect fresh screenshots of the landing, approval, merchant checkout handoff, delivery wait, held request, completion, payments, ledger, schedule and agent access.
- Check desktop and narrow mobile layouts, keyboard operation, text contrast, wrapping, focus and loading/error states. A disabled browser tool is a verification limitation to resolve or report; a source-code inspection is not a substitute for a rendered check.
- For backend, schema or payment behavior changes, run `./gradlew verify --no-daemon --console=plain` and the relevant Node, MCP, authority-boundary and recovery checks from `.github/workflows/verify.yml`. Read the current workflow and its prerequisites before invoking those checks.
- Reuse meaningful existing tests. Add targeted regressions for changed state mapping, consent, evidence gating, duplicate requests or unknown payment outcomes. Avoid tests that merely repeat static color values or copy implementation logic.
- Use `node demo/check-live.mjs` for the existing anonymous production-site health check. Distinguish its result from authenticated checkout or live payment verification.
- Confirm production builds contain the artwork, fonts/licenses where bundled, valid social metadata and working asset URLs. Check the Devpost cover remains 3:2 and below 5 MB.
- Check every displayed total against recorded captures, authorizations and refunds. The replay test must demonstrate that the same receipt does not add another payment.
- Keep secrets and raw private responses out of screenshots, documentation, commits and evidence exports. Use sanitized records while retaining enough identifiers internally to verify the actual outcome.

## Final handoff

Deliver the complete change through the repository's normal review workflow and update `docs/review-implementation-status.md` with:

1. The implemented requirements and their locations, mapped back to the PDF pages and gap IDs.
2. Current screenshots and actual test results, including environment and source/deployment revision.
3. Updated README, submission text, demo script, gallery assets and judge-access instructions, with public links verified where publication has occurred.
4. A short, precise list of unresolved external prerequisites or product decisions, their impact, and the exact next action. Keep these visibly open.

Finish with what changed, how it was verified and any material remaining limitation. Continue until all available implementation and verification work is complete; do not stop after writing another plan, merely adding token files or updating the cover image.
