**SwarmPay Devpost submission text**

_Maintainer note, not for pasting: paste everything below the line into Devpost after replacing each `[TODO …]`. Before submitting, make the repository public (it is private today), recheck the [official rules](https://paypalaihackathon.devpost.com/rules) and the [implementation status](implementation-status.md), and submit before November 12, 2026, 12:00 PT (20:00 UTC); target November 11._

---

**Give agents a budget. Pay merchants only on agreed terms.**

- **Video:** [TODO: public YouTube URL, under three minutes]
- **Live demo:** https://swarm.decionis.com (describe your event, then continue with a PayPal sandbox buyer to create your organizer account; PayPal sandbox payments with test money; see the testing instructions)
- **Code:** [TODO: public repository URL], Apache-2.0

## Inspiration

Agent commerce tends to offer two bad options: the agent only recommends, or it gets a card and spends freely. Real purchases sit in between. An event organizer pays for tents up front but should pay the caterer only once the food arrives. We wanted agents to do the legwork while every payment follows the organizer's agreed terms.

## What it does

The organizer describes an event: "30 guests, five tent rentals, $1,500, rain likely." AI agents turn that into editable details, choose one offer from each of two merchants in a curated catalog, and flag budget, capacity, weather and timing risks. The organizer approves one exact plan, then completes a separate PayPal approval for each merchant. Tents are captured at checkout. Catering is only authorized. If an agent asks to pay the caterer before delivery, the payment boundary holds the request and nothing is paid. Catering is captured when a signed venue receipt matching the event, merchant, quantity and delivery window verifies; a photo alone is not enough. In the demo, a separate simulated venue signs that receipt. Everything exports as an evidence trail.

## How we built it

A Java 21 / Spring Boot monorepo with a React UI. The commerce app plans and records consent; a separate private executor is the only service with PayPal credentials. Each payment command passes through the published AgentSafe gateway in fail-closed mode, and the executor rechecks consent, the budget reservation and the receipt before calling PayPal. PostgreSQL holds money in integer cents, atomic budget reservations, durable command identities and a SHA-256 audit chain. Seven typed MCP tools expose the workflow to agents; plan approval is deliberately not one of them, and an agent's payment request goes through the same gateway. The simulated venue runs as its own service and is the only holder of the receipt signing key. In the hosted demo, the gateway consults a local test authority.

## Tools used

**AI.** Azure OpenAI `gpt-6-astra` through the Responses API, via the official OpenAI Java SDK. Three calls: typed intent extraction, a sourcing choice limited to the catalog's offer IDs, and a risk & milestone assessment. Each uses a strict JSON schema, is revalidated in Java and fails closed, with no model fallback. Agents never receive payment or signing tools, and catalog prices, not model output, set the amounts.

**PayPal.**

- JavaScript SDK Buttons, with a separate `data-namespace` per merchant so each seller gets its own buyer approval.
- Orders v2: `CAPTURE` intent for tents, `AUTHORIZE` intent for catering, the seller as payee and a `PayPal-Request-Id` on each write.
- Payments v2: capture the catering authorization after the receipt verifies, or void it on cancellation.
- Webhook signature verification for each seller.
- PayPal Java Server SDK 2.4.0 for all server calls, with bounded timeouts and retries disabled.

**Sandbox evidence.** Verified on the live demo on October 28, 2026, with real PayPal sandbox calls and test money:

- Tents: order `23N55770SK1159819`, $500 captured at checkout (capture `9JJ483087H808781G`).
- Catering: order `7F931246DX155571M`, $900 authorized (`76F230656E5431143`) and captured only after the venue's signed delivery receipt (capture `8LX13782L6474070M`).
- Before delivery, the agent asked to pay catering early; AgentSafe held the request and no payment was sent.
- Replaying the same receipt created no second payment: one capture per seller, $1,400 in total.
- Six PayPal webhook notifications passed signature verification.

In this run AgentSafe decided payments with a local test authority, and the catalog and venue are simulated.

[TODO: attach the completed-plan and PayPal sandbox screenshots.]

## Challenges

- **Ambiguous outcomes.** A payment timeout or 5xx may still have moved money. SwarmPay persists each attempt before dispatch, treats unclear results as unknown and reconciles them by lookup instead of retrying blindly, keeping the budget reserved meanwhile.
- **Two sellers, one plan.** Escrow and payouts were the wrong tools; authorize-then-capture pays each seller directly on its own terms.
- **Keeping agents away from money.** Their only network route is a proxy that admits the model host and refuses PayPal, and the app cannot reach the executor even by container IP.
- **Replay.** Concurrent replays of the same receipt produce exactly one capture.

## What's next

- Hosted Decionis enforcement in place of the local test authority, including approval and resume of held payments.
- Real venue integrations and a dispute process, plus refunds and budget reallocation after cancellation.
- Scoped multi-user MCP credentials, more merchants and multi-milestone contracts.

## Testing instructions

[TODO: supply privately in Devpost's testing-instructions field; never commit these:

- PayPal sandbox buyer login: **Continue with PayPal** with it creates the organizer account on https://swarm.decionis.com, and the same buyer approves both merchants' payments in PayPal
- Organizer password login, as an alternative to signing up with PayPal
- Keep the event about an hour ahead: the venue can confirm delivery from two hours before the event
- The delivery step is the **Confirm delivery as the venue** button

Anyone can run the full simulated journey locally with three commands; see the repository README.]
