**SwarmPay Devpost submission text**

_Maintainer note, not for pasting: paste everything below the line into Devpost after replacing each `[TODO …]`. Before submitting, make the repository public (it is private today), recheck the [official rules](https://paypalaihackathon.devpost.com/rules) and the [implementation status](implementation-status.md), and submit before November 12, 2026, 12:00 PT (20:00 UTC); target November 11._

---

**Give agents a budget. Pay merchants only on agreed terms.**

- **Video:** [TODO: public YouTube URL, under three minutes]
- **Live demo:** https://swarm.decionis.com (organizer sign-in; see the testing instructions)
- **Code:** [TODO: public repository URL], Apache-2.0

## Inspiration

Agent commerce tends to offer two bad options: the agent only recommends, or it gets a card and spends freely. Real purchases sit in between. An event organizer pays for tents up front but should pay the caterer only once the food arrives. We wanted agents to do the legwork while every payment follows the organizer's agreed terms.

## What it does

The organizer describes an event: "30 guests, five tent rentals, $1,500, rain likely." AI agents turn that into editable details, compare a curated catalog from two merchants, and flag budget, capacity, weather and timing risks. The organizer approves one exact plan, then completes a separate PayPal approval for each merchant. Tents are captured at checkout. Catering is only authorized, and is captured when a signed venue receipt matching the event, merchant, quantity and delivery window verifies; a photo alone is not enough. Everything exports as an evidence trail.

## How we built it

A Java 21 / Spring Boot monorepo with a React UI. The commerce app plans and records consent; a separate private executor is the only service with PayPal credentials. Each payment command passes through the published AgentSafe gateway in fail-closed mode, and the executor rechecks consent, the budget reservation and the receipt before calling PayPal. PostgreSQL holds money in integer cents, atomic budget reservations, durable command identities and a SHA-256 audit chain. Seven typed MCP tools expose the workflow to agents; plan approval is deliberately not one of them. In the hosted demo, the gateway consults a local test authority.

## Tools used

**AI.** Azure OpenAI `gpt-6-astra` through the Responses API, via the official OpenAI Java SDK. Three calls: typed intent extraction, a sourcing assessment and a risk & milestone assessment. Each uses a strict JSON schema, is revalidated in Java and fails closed, with no model fallback. Agents never receive payment or signing tools, and catalog prices, not model output, set the amounts.

**PayPal.**

- JavaScript SDK Buttons, with a separate `data-namespace` per merchant so each seller gets its own buyer approval.
- Orders v2: `CAPTURE` intent for tents, `AUTHORIZE` intent for catering, the seller as payee and a `PayPal-Request-Id` on each write.
- Payments v2: capture the catering authorization after the receipt verifies, or void it on cancellation.
- Webhook signature verification for each seller.
- PayPal Java Server SDK 2.4.0 for all server calls, with bounded timeouts and retries disabled.

**Sandbox evidence:** [TODO: sandbox order, authorization and capture IDs plus screenshots once the end-to-end sandbox run is verified. Until then, say plainly that the hosted demo uses simulated, clearly labeled payments.]

## Challenges

- **Ambiguous outcomes.** A payment timeout or 5xx may still have moved money. SwarmPay persists each attempt before dispatch, treats unclear results as unknown and reconciles them by lookup instead of retrying blindly, keeping the budget reserved meanwhile.
- **Two sellers, one plan.** Escrow and payouts were the wrong tools; authorize-then-capture pays each seller directly on its own terms.
- **Keeping agents away from money.** Their only network route is a proxy that admits the model host and refuses PayPal, and the app cannot reach the executor even by container IP.
- **Replay.** Concurrent replays of the same receipt produce exactly one capture.

## What's next

- Complete the account-backed PayPal sandbox run and hosted Decionis enforcement, including held-payment approval and resume.
- Real venue integrations and a dispute process, plus refunds and budget reallocation after cancellation.
- Scoped multi-user MCP credentials, more merchants and multi-milestone contracts.

## Testing instructions

[TODO: supply privately in Devpost's testing-instructions field; never commit these:

- Organizer login for https://swarm.decionis.com
- PayPal sandbox buyer login, once the sandbox runtime is live
- How to complete the signed-receipt step on the hosted demo

Anyone can run the full simulated journey locally with three commands; see the repository README.]
