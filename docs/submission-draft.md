**SwarmPay Devpost submission text**

_Maintainer note, not for pasting: paste everything below the line into Devpost after replacing each `[TODO …]`. The **Elevator pitch** goes in Devpost's tagline field, **Built with** in its tags, and the sections from **Inspiration** on in **About the project**. Record the video from the [video script](../demo/video-script.md). Before submitting, make the repository public (it is private today), recheck the [official rules](https://paypalaihackathon.devpost.com/rules) and the [implementation status](implementation-status.md), and submit before November 12, 2026, 12:00 PT (20:00 UTC); target November 11._

_Sponsor prizes: enter AG Grid, APIMatic, Bryntum, Channel3 and Render where Devpost asks which sponsor tools the project uses. Recheck each sponsor's eligibility before entering; a project can win at most one sponsor prize alongside one grand or honorable-mention prize. APIMatic's subscription offer separately requires evidence of using its PayPal Context Plugin; SDK generation alone does not establish that eligibility (see [APIMatic](../contracts/apimatic/README.md)). Postman is used but has no prize here. Deploy [PR #28](https://github.com/ocularminds/swarmpay/pull/28) before recording, so the live footer says tent purchases use Channel3 listings._

---

**Elevator pitch** (Devpost tagline, under 200 characters)

AI agents plan your event and pick the merchants. PayPal pays each one only on the terms you approved: tents at checkout, catering after the venue confirms delivery.

**Give agents a budget. Pay merchants only on agreed terms.**

- **Video:** [TODO: public YouTube URL, under three minutes]
- **Live demo:** https://swarm.decionis.com (describe your event, then continue with a PayPal sandbox buyer to create your organizer account; PayPal sandbox payments with test money; see the testing instructions)
- **Code:** [TODO: public repository URL], Apache-2.0
- **Your own copy:** the repository's **Deploy to Render** button deploys the whole stack with simulated payments ([docs/render.md](render.md))

## Inspiration

Agent commerce tends to offer two bad options: the agent only recommends, or it gets a card and spends freely. Real purchases sit in between. Someone organizing a meetup pays the tent company up front but should pay the caterer only once the food arrives, and both have to fit one budget. Small-business owners, office managers and community organizers juggle this across several vendors. We wanted agents to do the legwork of finding and booking, while every payment follows terms the organizer agreed to and an agent cannot change.

## What it does

SwarmPay plans and pays for an event across two merchants, each on its own terms.

1. **Describe the event.** The landing page starts with one box: "An outdoor tech meetup for 30 people at Riverside Pavilion. Rain is forecast. Five tents and catering, $1,500 in total."
2. **Sign up with PayPal.** **Continue with PayPal** creates the organizer's account from their PayPal name and email, and the description comes along through sign-in.
3. **Agents plan.** GPT-6 Astra on Azure OpenAI reads the description into editable details, and leaves the venue blank when the description doesn't name one. The organizer chooses to rent or buy tents. The Sourcing Agent then picks the tents and one caterer: rentals and caterers come from a curated catalog, and tents to buy come from Channel3's in-stock product listings. A second agent reviews budget, capacity, weather and timing risks.
4. **Approve once.** The organizer approves one exact plan, $1,400 of the $1,500, and the whole amount is reserved.
5. **Pay each merchant on its terms.** Each merchant gets its own PayPal approval and is paid directly. Tents are captured at checkout. Catering is only authorized, so the money is held, not taken.
6. **Agents can ask but not pay.** If the milestone agent asks to pay the caterer before delivery, the request goes through a fail-closed payment gateway (AgentSafe), and it is held: no receipt, no payment.
7. **Pay on delivery.** The caterer is paid when the venue's signed receipt matches the event, merchant, quantity and delivery window. A photo alone is never enough, and replaying a receipt can't pay twice. In the demo, a separate simulated venue signs that receipt.
8. **Prove it.** A schedule shows when each merchant was paid against the delivery window, and a plain-language timeline shows what happened. The full payment record exports as tamper-evident evidence.

Around that journey:

- **Bring your own agent.** Organizers issue their own agent tokens under **Agents**. Any MCP client can connect with one, including Postman's: the agent can read the plan and ask for payments, but it can't approve a plan or issue another token, and it acts only for the organizer who issued it.
- **See every payment.** **Payments** opens a ledger of every payment and held agent request across the organizer's plans, with search, filters, CSV export and a total of what was actually paid for the rows shown.

Every screen offers exactly one next action, and the layout works on a phone.

## How we built it

We built SwarmPay from scratch during the hackathon; the first commit is from October 25, 2026. It is a Java 21 / Spring Boot monorepo with a React UI, running as eight services on Azure Kubernetes:

- **Commerce app.** It plans, records consent and runs the agents. Its network has no route to PayPal: its only way out is an egress proxy that admits the model host and refuses PayPal by name and address.
- **Private payment executor.** The only service with the merchants' PayPal credentials. It rechecks consent, the budget reservation and the delivery receipt before every PayPal call.
- **AgentSafe gateway.** Every payment command reaches the executor through this published gateway in fail-closed mode. An agent's request takes the same path, so it can be held.
- **PayPal sign-in service.** Holds SwarmPay's own Log in with PayPal secret and alone reaches PayPal's identity API. It returns who signed in, never a token.
- **Simulated venue.** Holds the only receipt-signing key.
- **Egress proxy, web front end and PostgreSQL.** PostgreSQL keeps money in integer cents, atomic whole-plan reservations, durable payment-command identities and a SHA-256 audit chain.

Seven typed MCP tools expose the workflow to outside agents. Approving a plan is deliberately not one of them. Each agent token is stored only as a hash, shown once and revocable, and every tool call resolves the organizer it acts for.

The same services also deploy to Render from a Blueprint, as a copy with simulated payments that anyone can run.

## Tools used

**AI.** Azure OpenAI `gpt-6-astra` through the Responses API, via the official OpenAI Java SDK. Three calls: typed intent extraction, a sourcing choice limited to the catalog's offer IDs, and a risk & milestone assessment. Each uses a strict JSON schema, is revalidated in Java and fails closed, with no model fallback. Agents never receive payment or signing tools, and catalog prices, not model output, set the amounts.

**PayPal.**

- JavaScript SDK Buttons, with a separate `data-namespace` per merchant so each seller gets its own buyer approval on the same page.
- Orders v2: `CAPTURE` intent for tents, `AUTHORIZE` intent for catering, the seller as payee and a `PayPal-Request-Id` on each write.
- Payments v2: capture the catering authorization after the receipt verifies, or void it on cancellation.
- Webhook signature verification for each seller.
- Log in with PayPal through SwarmPay's own sandbox app: the authorization-code exchange and the identity profile create the organizer account.
- PayPal Java Server SDK 2.4.0 for all payment calls, with bounded timeouts and retries disabled.

**Sponsor tools.**

- **Channel3: tents to buy.** When the organizer chooses **Buy tents**, the server searches Channel3 for in-stock pop-up canopy tents, adding "waterproof" when rain is forecast. The price ceiling per tent leaves room in the budget for the cheapest caterer that fits the guest count. SwarmPay keeps the lowest in-stock USD offer for each product, and the Sourcing Agent may choose only among those IDs. The plan names the product, brand and store, with a link to the listing, and the listed price sets the amount. Local and hosted runs with the live Channel3 API proposed five Homfan 10×20 ft canopies listed by homedepot.com at $113.99 each. The search runs on the server through the egress proxy, which admits `api.trychannel3.com` and still refuses PayPal, and it fails closed if Channel3 can't be reached. In the sandbox, SwarmPay's tents merchant is paid through PayPal at the listed price; no order is placed with the store.
- **AG Grid: the payments ledger.** AG Grid Community lists every payment step and held agent request across all of an organizer's plans: who asked (the organizer, an agent, or SwarmPay after delivery), the merchant, the amount, AgentSafe's decision, the PayPal reference and the dossier. It has a quick search, column filters and CSV export. A pinned **Paid to merchants** row recounts after every filter and counts only completed captures, so authorizations and held requests never inflate it.
- **Bryntum: when each merchant is paid.** A read-only Bryntum Scheduler on each plan has one row per merchant and one for the event. Its bars sit at the recorded times: the quote's validity, the tents paid at checkout, catering authorized and held, the agent's early request held, and catering paid after delivery. The venue's delivery window is shaded. It uses Bryntum's trial build, as `NOTICE` records.
- **APIMatic: the REST API, described and generated.** An OpenAPI 3.1 document describes all 31 REST operations, with their session and CSRF requirements. A CI test compares it with the Spring controllers' routes, so it can't drift from the server. The APIMatic CLI validates it and generates a TypeScript SDK and an API docs portal; the generated SDK compiled and called the local configuration and session endpoints.
- **Render: your own copy.** `render.yaml` is generated from a tested definition and deploys seven services, including PostgreSQL, from a **Deploy to Render** button. Peers find each other by Render's private `host:port`, and Render generates the database passwords and service tokens and shares them between services. Render's private network can't enforce SwarmPay's isolation rules, so this copy uses simulated payments and holds no PayPal credentials. CI runs the local stack wired exactly as Render wires it.
- **Postman: playing the agent.** A Postman collection connects to the MCP server with an organizer's agent token. It checks that the agent can't approve a plan, that its early payment request is held, and that nothing more was captured. CI runs it on every change with Newman: 21 requests and 27 assertions.

**Sandbox evidence.** Verified on the live demo on October 28, 2026, with real PayPal sandbox calls and test money:

- Tents: order `23N55770SK1159819`, $500 captured at checkout (capture `9JJ483087H808781G`).
- Catering: order `7F931246DX155571M`, $900 authorized (`76F230656E5431143`) and captured only after the venue's signed delivery receipt (capture `8LX13782L6474070M`).
- Before delivery, the agent asked to pay catering early; AgentSafe held the request and no payment was sent.
- Replaying the same receipt created no second payment: one capture per seller, $1,400 in total.
- Six PayPal webhook notifications passed signature verification.
- A sandbox buyer signed up with PayPal, and the organizer session survived a reload.

In this run AgentSafe decided payments with a local test authority, and the catalog and venue are simulated. The same day, the ledger, the schedule, agent tokens and **Buy tents** went live on the same site, and the ledger and schedule show these sandbox payments.

Every change runs 160 Java tests (PostgreSQL through Testcontainers), 49 Node tests plus five AgentSafe tests, the Postman collection, a Render-wired rehearsal and browser journeys on desktop, phone and an HTTPS rehearsal of the hosted setup in CI.

[TODO: attach the completed-plan and PayPal sandbox screenshots.]

## Challenges we ran into

- **Payments whose outcome is unknown.** A PayPal timeout or 5xx may still have moved money, so retrying could pay twice. We record each payment attempt before sending it, treat an unclear answer as *unknown* rather than failed, and settle it by looking the payment up, keeping the budget reserved in the meantime.
- **Two sellers, one plan.** Escrow and payouts looked like the answer and were the wrong tools: they put SwarmPay in the middle of the money. Authorize-then-capture lets each seller be paid directly on its own terms. Two PayPal button sets on one page needed separate SDK namespaces, so each seller gets its own approval.
- **Keeping agents away from money.** A prompt is not a boundary. We closed it in the network: the agents' service can reach only the model host, can't reach PayPal by name, address or proxy, and can't reach the executor even by container IP. A CI check proves it on every change.
- **Signing in with PayPal without opening that door.** The agents' service still can't reach PayPal, so the login exchange runs in its own small service that holds the login secret and answers only the app.
- **A bug only the real sandbox found.** Our session cookie is `SameSite=Strict`, so it doesn't come back on PayPal's cross-site redirect; a short-lived `Lax` cookie carries the sign-in check instead. Even so, the first real buyer sign-in returned signed out. Clearing that check cookie replaced the session cookie the server had just set. Unit tests had passed; the live run caught it, and a regression test now does too.
- **Letting agents shop real listings without giving them the web.** Buying tents meant real product data, but the agents' service still has no open internet. The server runs the Channel3 search through the same egress proxy, which admits Channel3 alongside the model host and still refuses PayPal, and hands the agent only the IDs it fetched. The executor checks every payment against the approved plan's lines, not against what a listing says later.
- **Bringing your own agent without sharing a key.** The first MCP server had one shared token that acted for one organizer. Agent tokens are now issued per organizer, stored only as hashes and resolved on every tool call. A token can't approve a plan, issue another token or reach the organizer's REST API.
- **A cloud we can't firewall.** Render's private network can't express SwarmPay's network policies, so the Render copy runs with simulated payments and no PayPal credentials. Our first Render deployment also found that Render's `PORT` variable moved the AgentSafe gateway onto localhost. The Blueprint now pins the gateway's listener, and a local rehearsal wired exactly like Render runs in CI.
- **Declined cards and replays.** PayPal can decline a buyer's funding source after approval while taking nothing, so we reopen the same order for another choice instead of failing the plan. Concurrent replays of one delivery receipt still produce exactly one capture.
- **A product, not a console.** Our first organizer workspace showed every panel at once and spoke in payment terms: "captured so far", "authority correlation", "freeze for review". We rebuilt it around how people actually start, describing the event in a sentence, with one next action per step and a timeline in plain language.

## What we learned

- **The safest agent can ask but can't pay.** Putting the boundary in infrastructure (network isolation, a fail-closed gateway and an executor that rechecks everything) made agent mistakes harmless instead of merely unlikely.
- **Authorize-then-capture is a natural fit for milestone commerce.** PayPal already models "hold now, pay on delivery", so we didn't need custody or escrow.
- **"Unknown" is a real payment state.** Designing for it first made timeouts, restarts and replays routine instead of dangerous.
- **Model output becomes safe to act on when the schema allows only valid choices.** The model picks offer IDs; code checks them and catalog prices set the amounts, so a hallucinated price can't reach PayPal.
- **Rehearse the real setup, then test live.** Our HTTPS rehearsal of the hosted stack caught an incompatible password-encoder format before it shipped; only a real PayPal sandbox sign-in caught the lost session cookie.
- **A description that is tested stays true.** Checking the OpenAPI document against the server's routes in CI means the SDK and portal APIMatic generates describe the API that actually runs.
- **Show money the way people ask about it.** "How much did we pay Gather Kitchen?" is a filter and a total, and "When does the caterer get paid?" is a schedule. Counting only completed captures in the total kept authorizations and held requests from looking like spent money.
- **Let people start the way they think.** Organizers describe an event in a sentence, not a form. Reading it for them, and never inventing details they didn't give, made the product feel trustworthy.

## What's next

- Hosted Decionis enforcement in place of the local test authority, including approval and resume of held payments.
- Real venue integrations and a dispute process, plus refunds and budget reallocation after cancellation.
- Checkout with the stores that list purchased tents, instead of a sandbox tents merchant.
- OAuth for agent connections, more merchants and multi-milestone contracts.

## Built with

Java 21 · Spring Boot · Spring AI (MCP) · React · TypeScript · Vite · PostgreSQL · Azure OpenAI (GPT-6 Astra) · PayPal JavaScript SDK · PayPal Orders v2 · PayPal Payments v2 · Log in with PayPal · PayPal webhooks · PayPal Java Server SDK · AgentSafe · Channel3 · AG Grid · Bryntum Scheduler · APIMatic · Render · Postman · Newman · Docker · Azure Kubernetes Service · Playwright

## Testing instructions

[TODO: supply privately in Devpost's testing-instructions field; never commit these:

- PayPal sandbox buyer login: **Continue with PayPal** with it creates the organizer account on https://swarm.decionis.com, and the same buyer approves both merchants' payments in PayPal
- Organizer password login, as an alternative to signing up with PayPal
- Keep the event about an hour ahead: the venue can confirm delivery from two hours before the event
- The delivery step is the **Confirm delivery as the venue** button
- **Buy tents** uses Channel3 listings; **Payments** opens the ledger; **Agents** issues a token for Postman or any MCP client (see `postman/README.md`)

Anyone can run the full simulated journey locally with three commands; see the repository README.]
