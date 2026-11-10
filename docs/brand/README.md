# SwarmPay now, Kintlo at commercial launch

The owner selected **Kintlo** (KINT-loh) on November 10, 2026. The current hackathon entry, website and payment journeys remain **SwarmPay**. Proposed commercial lines: “Many agents. Your rules.” and “AI plans. You stay in control.”

The application uses the supplied November 10 palette, Manrope and DM Sans through `apps/web/src/brand.css`. AG Grid and AG Studio read `apps/web/src/brand-tokens.json`; Bryntum uses its theme custom properties. The four rounded, slightly rotated tiles remain the mark. The supplied font licenses are shipped alongside the fonts.

## Assets and provenance

- [Hackathon assets](../../apps/web/public/brand/): original PNG/SVG covers, specimen, palette, token sources, licenses and provenance. `event-terms.svg` extracts the illustrated merchants and approved-terms sheet from the supplied wide cover. It is conceptual artwork, not a receipt or product screenshot.
- [Kintlo kit](kintlo/): a preserved copy of the selected commercial artwork, decision, tokens, export manifest and font licenses. The application does not load these commercial assets. Paths in the original kit refer to the supplied review workspace; the versioned review is linked below.
- [Source brief](../review/baseline/brief.review.pdf), [instructions](../review/baseline/instruct.review.md) and [dated evidence](../review/baseline/evidence.json) are preserved separately from implementation results. The supplied originals were not edited.
- Actual application captures belong in `docs/review/evidence/`, with their environment and source revision. Keep them distinct from conceptual artwork.

## Commercial release prerequisites

Kintlo preparation is complete only as an asset handoff. Publication is pending a launch decision, confirmed domain ownership, trademark clearance and the organizer's rules for changing the judged entry. The dated preliminary `kintlo.com` lookup establishes neither ownership nor clearance. No Kintlo URL, email address or OAuth/PayPal callback is configured.

At an authorized launch, change the wordmark, page title, navigation, onboarding, sharing images, new screenshots and commercial copy together. Use “Originally presented as SwarmPay” where continuity helps; verify any award before mentioning it. Preserve the judge URL and access. Inspect redirects and integration configuration explicitly. Database IDs, request namespaces, receipt audiences and deployment identifiers are not display branding and must retain their identities unless a separately reviewed migration is agreed.

See [implementation status](../review-implementation-status.md) for the current schedule check and remaining release prerequisites. Passing a calendar date does not authorize a rename.
