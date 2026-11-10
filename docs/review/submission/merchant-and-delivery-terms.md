# Merchant, venue and settlement acceptance

Prepared November 10, 2026. **No commercial agreement or real venue contract has been supplied or signed.** This is the exact current behavior for a prospective supplier/venue review, not accepted contract text.

## Current terms to validate

| Topic | Implemented behavior | Required acceptance / input |
| --- | --- | --- |
| Buyer consent | One exact plan: selected offers, full quantities, USD integer-cent amounts, event/time zone and receipt conditions. Each merchant then requires its own PayPal approval. | Organizer and each merchant agree that the approved plan is the authoritative order. Supply real price/tax/delivery and quote-validity terms before replacing simulated offers. |
| Tent rental | Full tents amount captured at checkout to the configured tent merchant. | Tent supplier accepts upfront payment and supplies availability/fulfillment integration and contact/escalation route. |
| Tent purchase | Channel3 supplies listings; the current sandbox flow pays its test tent merchant and does not order from the listing retailer. | Retailer or fulfillment agreement and actual order placement/confirmation contract before claiming a purchase was fulfilled. |
| Catering | Full catering amount authorized, then captured only after an accepted signed receipt matching the approved merchant, venue, event, quantity and window. | Caterer agrees to authorization/capture timing, delivery evidence and the handling of insufficient/expired authorizations. |
| Quote and booking | Quotes last 30 minutes; event plans are bounded to 28 days; catering authorization must fit the provider's remaining validity. | Confirm booking limits and real inventory/quote expiry with both merchants. |
| Renewal | One gated renewal after the initial three-day honor period and within three days of a future event; capture uses the current authorization. | Merchant/provider acceptance of renewal timing and a customer contact path if renewal fails. No authorization age is manufactured. |
| Cancellation | Before event start and while catering remains unpaid: freeze further payments, request full tents refund and catering void. Unknown or pending results retain the reservation. | Tent supplier accepts a full refund policy; caterer accepts release before payment; agree the response/settlement time shown to the organizer. No fee has been invented. |
| Already paid catering | Automatic pre-event cancellation refuses this case and directs it to merchant resolution. | Written post-delivery cancellation, refund and dispute procedure, with an accountable decision maker. |
| Evidence | Venue signature authenticates the issuer's assertion. It does not independently prove physical delivery. Photo-only or altered receipts do not release catering. | Identify the accountable delivery attestor and agree what constitutes acceptance and how conflicts are resolved. |

## Real venue integration contract

Before adding a production adapter, the issuer must provide its API/authentication contract and test account, stable issuer identity, mapping to venue/merchant/event identifiers, audience, signed schema and canonicalization, algorithms/key IDs, current and historical public keys, timestamp/clock tolerance and expiry rules. Supply key rotation overlap, emergency revocation behavior and a reliable source of revocation state.

Agree who may attest, what evidence they check, who can contest the statement, and what happens before versus after capture. Define outage/retry/replay semantics and stable event/receipt IDs. The present simulated signer has one configured Ed25519 key; adding invented issuer endpoints or key-management rules would not integrate a real venue.

Acceptance requires authentic issuer fixtures and a controlled end-to-end test: correct receipt accepted; wrong audience, merchant, event, quantity, stale/revoked key, expired/replayed receipt and contested delivery handled according to the signed agreement. Preserve fail-closed behavior while any required verification is unavailable.

## Broader settlement decisions

| Expansion | Decision required before implementation | Acceptance check |
| --- | --- | --- |
| Partial delivery / additional milestones | Agreed quantities and evidence per milestone, allocation of total price, rounding, maximum cumulative capture and stable retry identities. | Monetary/recovery tests prove each approved portion can settle once and the sum never exceeds consent. |
| Cancellation fees / partial refunds | Who receives each fee, exact fee schedule/timing, tax allocation, refund eligibility, provider support and explicit consent wording. | Provider fixtures plus an authorized sandbox partial-refund result agree with the ledger and remaining exposure. |
| Other currencies | Merchant/provider currency matrix, minor units, FX rate/time/owner, rounding, cross-currency refunds and displayed consent. | Boundary/round-trip tests and an authorized provider result in each supported settlement path. |
| Changed funded plans | Whether to cancel/reapprove or amend, treatment of settled amounts, identity/version rules and merchant acceptance. | An amendment cannot silently replace prior consent or create duplicate payments. |

## Agreement record

| Party / role | Contract or decision supplied | Accepted scope and date | Named operator | Verification record |
| --- | --- | --- | --- | --- |
| Tent supplier | Missing | Not accepted | Unassigned | Not run |
| Caterer | Missing | Not accepted | Unassigned | Not run |
| Real venue issuer | Missing | Not accepted | Unassigned | Simulated signer only |

Obtain actual participants, contracts and authorization to negotiate or sign. Keep confidential commercial terms outside public Git history; record only an approved reference and verification outcome here.
