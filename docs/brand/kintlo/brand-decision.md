# Kintlo: selected commercial identity

The owner selected **Kintlo** on November 10, 2026. This settles the name choice for commercial planning. Pronunciation: **KINT-loh**, two syllables. Use **Kintlo** in normal display copy and `kintlo` in new filenames where appropriate.

The name evokes connected participants working toward one intent. This is a brand association, not a claimed dictionary definition. It leaves room for the product to grow beyond event payments while retaining its promise of coordinated action under human control.

Proposed brand line: **Many agents. Your rules.**

Supporting line: **AI plans. You stay in control.**

The user selected the name; the copy and artwork remain proposed applications of that identity. Product claims must continue to match the implemented scope.

## Rollout decision

Retain **SwarmPay** as the current hackathon-facing name and preserve consistency across the submitted entry, demo, repository references and video. Prepare **Kintlo** for the commercial launch after results. This follows the timing recommendation immediately preceding the owner's selection; revisit timing if the owner explicitly changes that plan.

The schedule checked on November 10 was:

- Submission deadline: November 12, 2026 at 21:00 Europe/Stockholm.
- Judging: December 1-15, 2026.
- Results: expected on or around December 21, 2026.

The [official rules](https://paypalaihackathon.devpost.com/rules), section 5, freeze submission changes after the deadline with limited organizer-permitted exceptions. They distinguish the submitted entry from the editable portfolio project. Keep the working judged build and its links stable; do not use a calendar date alone to trigger publication or rename a submission.

At the commercial launch, a temporary **Originally presented as SwarmPay** reference can connect the brands. Mention an award only after the result and wording are verified. Maintain the old demo access and arrange redirects for appropriate marketing URLs as part of a planned migration.

## Visual identity

Retain the original four rounded tiles and their slight rotation, with Manrope headlines and DM Sans body copy. The palette and accessibility calculations are unchanged:

| Color | Hex | Role |
| --- | --- | --- |
| Evergreen | `#11695B` | Primary actions and trust |
| Citron | `#D5FF5F` | Bright cover and selected emphasis |
| Sky | `#A9E7FF` | Supporting illustration |
| Deep ink | `#142F2B` | Primary text |
| Cloud | `#F7FAF7` | Light canvas |
| Slate | `#52665F` | Meaningful secondary text |

Use the supplied semantic states for paid, awaiting delivery and held requests. The commercial kit carries the Kintlo name and `--kintlo-` CSS variables. Bridge tokens to the application's existing theme during implementation; changing the name must not change payment behavior.

## Preliminary naming screen

The November 10 public screen did not surface an obvious exact-name agent or payment platform. It did find [Kintlo tableware at Midas](https://midasfurniture.com/ksa_en/kintlo-serving-plate-medium-accessories-164633-midas.html), so the word is not globally unused.

The registry lookup for `kintlo.com` returned HTTP 404 (no registry record) at the time checked. This is a dated indication of possible availability, not a registration, ownership verification, price quote, or trademark clearance. No domain was purchased. Confirm current registration options and complete appropriate trademark checks before committing to the commercial launch. The artwork intentionally omits a commercial URL until ownership and the launch address are established.

## Implementation references

- Primary review: `/Users/bonus/develop/products/SwarmPay/brief.review.pdf`. Pages 1-10 preserve the original review; page 11 records this decision.
- Implementation instructions: `/Users/bonus/develop/products/SwarmPay/instruct.review.md`.
- Commercial assets: this directory.
- Preserved hackathon assets: `../swarmpay-2026-11-10/`.

The project directory remains `/Users/bonus/develop/products/SwarmPay`. Display branding is separate from identifiers used by databases, PayPal, receipts, OAuth, deployments and existing integrations. Inspect and migrate such identifiers deliberately if that work is later requested; do not apply a global replacement.
