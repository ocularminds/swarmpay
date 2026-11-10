# Judge guide — public version

Use [the live SwarmPay demo](https://swarm.decionis.com), [public source](https://github.com/ocularminds/swarmpay) and [existing public video](https://www.youtube.com/watch?v=SHIB2tTIrmc). The owner has a prepared private testing file containing the dedicated sandbox buyer credentials. They belong only in Devpost's private testing instructions.

On November 10, the saved private Devpost field was read back and matched the dedicated buyer that successfully signed in through PayPal. Its workspace and ledger were empty. No plan or payment was created in the judge account by this review. This is a dated check; judges sharing the buyer will see subsequent fictional test plans.

## Five-minute path

1. Choose **Sign in → Continue with PayPal** and log in on **www.sandbox.paypal.com** with the dedicated buyer from the private instructions. Use the same buyer at checkout. Do not create a new account or enter real PayPal/card credentials. If another test buyer is remembered, use PayPal's account-switch option.
2. Describe a fictional outdoor event for **30 guests, 5 rental tents, rain expected and a USD 1,500 total budget** at a fictional named venue. Set the event about one hour ahead in the displayed time zone; the simulated delivery window will be open. Choose **Rent tents** and prepare the plan.
3. Review the exact merchants, quantities, total and payment terms, then approve the plan. This is separate from PayPal approval. The typical simulated rental/catering pair totals **$1,400**, subject to the displayed selected offers.
4. Complete the tents merchant's native PayPal sandbox approval, then the separate catering approval. Tents should show **$500 paid**. Catering should show **$900 authorized**, awaiting delivery. An authorization is not a payment or escrow.
5. Use **Let the agent ask** before delivery. Its request should be held for the missing receipt; catering must remain uncaptured. Inspect the recorded reason/decision and the ledger.
6. Choose **Confirm delivery as the venue**. This is explicitly a simulated venue; its separately held key signs the matching facts. The application verifies the receipt and sends the permitted capture. Wait for an actual settled result; a pending/unknown payment is not success.
7. Inspect the completed plan, schedule, evidence export and Payments dashboard. Ask the analyst why the early request was held and check its dossier reference. The analyst explains recorded state and cannot approve payment.

The private buyer has its own workspace. Judges sharing that buyer can see one another's fictional test plans; it is not a separate account per judge. The recording buyer is separate. Do not place personal event details or sensitive briefs into shared test plans.

## Outside-agent and replay proof

The [Postman collection](../../../postman) supports the MCP endpoint `https://swarm.decionis.com/mcp`. Use the desktop app or an HTTP MCP client with an organizer-issued bearer token; browser-origin requests are deliberately restricted. The seven tools exclude plan consent and buyer approval. Keep tokens private and revoke them after testing.

The review's [sandbox MCP proof client](../../../demo/review/sandbox-mcp.mjs) verifies an already approved fictional $1,400 workflow. It refuses real-money mode and checks that requests cannot grant human consent or change settled captures when replayed. The [dated results](../evidence/submission/mcp-hold.json) identify its environment and request. Do not submit arbitrary test payments or age an authorization by changing timestamps.

Exact signed-receipt replay is exercised by the fresh local smoke/restore and preserved historical sandbox records. The public UI venue does not return its signed envelope. Current public rehearsal evidence states precisely which receipt or payment request was replayed; repeating a milestone is not proof of resending the original receipt bytes.

## Cancellation and recovery

Before event start, while catering remains unpaid, **Pause or cancel → Cancel event** freezes new payments and requests a full tents refund plus release of any catering authorization. Wait for confirmed provider settlement. Pending/unknown operations keep their budget reserved. Already paid catering requires merchant resolution; do not use a completed catering plan as a pre-event refund test.

A renewal needs an authorization that has actually aged beyond its initial honor period and a future event inside the renewal window. The November 3 historical sandbox renewal is documented; it is not part of the five-minute path. Unknown payment outcomes must be reconciled under the same command identity, never by approving a fresh duplicate plan.

## Run locally from public source

Follow the [README](../../../README.md#run-it-locally) using the repository's pinned Node and Java 21/Docker requirements. A November 10 anonymous clone of `master` `2898d7a` passed setup, doctor, Docker build/start and REST/MCP smoke. This default copy simulates payments, catalogs, venue and model behavior. Real model/catalog keys are optional for local evaluation and must stay outside Git.

## What this demo does not establish

The current authority is a local test authority, the venue is simulated, and a signature authenticates an issuer's statement rather than physical delivery. Channel3 supplies listings without placing retailer orders. USD/full-amount/two-merchant settlement is the implemented scope. Hosted Decionis, real supplier/venue agreements, expanded settlement terms and commercial Kintlo launch remain separate prerequisites. See the [readiness checklist](../../submission-checklist.md) for current license, ownership and publication requirements.
