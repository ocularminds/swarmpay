**SwarmPay Devpost submission text**

_Maintainer notes, not for pasting:_

- _The [submission checklist](submission-checklist.md) has the steps and dates. Submit before **November 12, 2026, 12:00 PT** (20:00 UTC); target November 11. Submitting by November 5 gets an early eligibility review, and the entry stays editable until the deadline._
- _Where things go: the **Elevator pitch** goes in the tagline field, **Built with** in the tags, and everything from **SwarmPay at a glance** to **What's next** in **About the project**. **Testing instructions** go in Devpost's private testing field and never in this file._
- _Replace every `[TODO …]` or delete the sentence it sits in. Each one marks a result that has to be verified on the live site first, so never fill one with an expected value._
- _Sponsor tools to tick: AG Grid, APIMatic, Bryntum, Channel3, Render and Postman. A project can win at most one sponsor prize, plus either one grand prize or one honorable mention._
- _Before submitting: make the repository public (it is private today), recheck the [official rules](https://paypalaihackathon.devpost.com/rules), and remove this note block._

---

**Elevator pitch** (Devpost tagline, under 200 characters)

AI agents plan your event and pick the merchants; PayPal pays each one only on the terms you approved. Agents can ask to pay, but they can never move money.

- **Video:** [TODO: public YouTube URL, under three minutes]
- **Live demo:** https://swarm.decionis.com. PayPal sandbox payments with test money. Sign up with a PayPal sandbox buyer; the testing instructions have one.
- **Code:** [TODO: public repository URL], Apache-2.0. Three commands run the whole journey locally with simulated payments, and a **Deploy to Render** button deploys your own copy.

## SwarmPay at a glance

- **Problem:** an organizer pays several merchants on different terms: tents up front, the caterer only once the food arrives. Handing an AI agent a card puts the whole budget at risk; keeping agents to suggestions wastes them.
- **Who it's for:** event organizers, small-business owners, office managers and community groups who book vendors for an event, and anyone who pays contractors when a job is signed off.
- **What it does:** you describe the event in a sentence. AI agents build a plan across two merchants. You approve the exact plan once, and PayPal pays each merchant directly on its own terms: tents captured at checkout, catering authorized and captured only after the venue signs a delivery receipt.
- **The idea:** agents can ask to pay, but they cannot pay. Every payment command passes AgentSafe, a fail-closed gateway, before a private executor that alone holds the merchants' PayPal credentials. The agents' network has no route to PayPal at all.
- **PayPal:**
  - JavaScript SDK Buttons for two sellers on one page.
  - Orders v2, with a `CAPTURE` intent for tents and `AUTHORIZE` for catering.
  - Payments v2: capture, void, **reauthorize** and **refund**.
  - Log in with PayPal, and webhook signature verification for each seller.
  - The PayPal Java Server SDK for every payment call.
- **AI:** Azure OpenAI `gpt-6-astra` in three strict-schema roles. An MCP server lets any outside agent ask, including Postman. An AG Studio agent team, with SwarmPay's own **AgentSafe analyst**, explains every payment decision.
- **Sponsor tools:**
  - **AG Grid:** an AG Studio spend dashboard with custom widgets and a custom agent.
  - **Bryntum:** a payment schedule showing PayPal's authorization windows.
  - **Channel3:** real tent listings, with ratings, for the agent to choose from.
  - **APIMatic:** a tested OpenAPI document, a generated SDK and docs portal, and the PayPal Context Plugin used to build the PayPal SDK code.
  - **Render:** a one-button copy of the stack.
  - **Postman:** plays the agent, in CI too.

| Judging criterion | What SwarmPay shows |
| --- | --- |
| Technological implementation | PayPal from two-seller checkout to reauthorization and refunds, behind replay-safe, reconciled payment commands. Azure OpenAI in strict-schema roles that code revalidates, an authenticated MCP server, and an AG Studio agent team. Verified in the PayPal sandbox; 173 Java, 58 Node and 11 browser tests run on every change. |
| Design | One sentence to start, then one next action per step. Plain-language timelines, a schedule of when each merchant is paid, and a spend dashboard you can question. It works on a phone. |
| Potential impact | Pay up front where that's normal and on delivery where it matters, within one budget. Book catering weeks ahead inside PayPal's authorization rules, and cancel with an automatic refund. The same pattern serves any vendor paid on a milestone. |
| Innovation | The boundary is infrastructure, not a prompt: a fail-closed gateway, an executor that rechecks everything, and an agent network with no route to PayPal. Signed delivery receipts release funds, and PayPal's own authorize, reauthorize and capture lifecycle replaces escrow. |
| Presentation | A video of the live sandbox journey in under three minutes, a hosted demo, a three-command local run and a Render copy. |

## Inspiration

Agent commerce tends to offer two bad options: the agent only recommends, or it gets a card and spends freely. Real purchases sit in between.

Someone organizing a meetup pays the tent company up front but should pay the caterer only once the food arrives, and both have to fit one budget. They may book weeks ahead and still need to cancel cleanly. Small-business owners, office managers and community organizers juggle this across vendors by hand.

We wanted agents to do the legwork of finding and booking, while every payment follows terms the organizer agreed to and no agent can change.

## What it does

SwarmPay plans and pays for an event across two merchants, each on its own terms.

1. **Describe the event.** The landing page starts with one box: "An outdoor tech meetup for 30 people at Riverside Pavilion. Rain is forecast. Five tents and catering, $1,500 in total."
2. **Sign up with PayPal.** **Continue with PayPal** creates the organizer's account from their PayPal name and email, and the description comes along through sign-in.
3. **Agents plan.**
   - GPT-6 Astra on Azure OpenAI reads the description into editable details. It never invents a venue the description doesn't name.
   - The organizer chooses to rent or buy tents.
   - The **Sourcing Agent** picks the tents and one caterer, from a curated catalog or, to buy tents, from Channel3's in-stock listings, rating included.
   - A **Risk and Milestone Agent** reviews budget, capacity, weather and timing.
4. **Approve once.** The organizer approves one exact plan, $1,400 of the $1,500, and the whole amount is reserved.
5. **Pay each merchant on its terms.** Each merchant gets its own PayPal approval and is paid directly, with no escrow in between. Tents are captured at checkout. Catering is only authorized: the money is held, not taken.
6. **Agents can ask but not pay.** When an agent asks to pay the caterer before delivery, its own or one connected over MCP, the request goes through AgentSafe and is held. Without a receipt, nothing is paid.
7. **Pay on delivery.** The caterer is paid when the venue's signed receipt matches the event, merchant, quantity and delivery window. A photo alone is never enough, and replaying a receipt can't pay twice. In the demo, a separate simulated venue signs the receipt.
8. **Book weeks ahead.** PayPal guarantees an authorization's funds for 3 days and keeps it for 29. So catering can be authorized up to 27 days before the event: SwarmPay renews the hold once its honor period is over and the event is near, and pays the caterer from the fresh authorization. No money moves when a hold is renewed.
9. **Cancel cleanly.** Cancelling before the event stops all further payments, refunds the tents through PayPal and voids the catering hold, each through AgentSafe. It then releases the budget.

Around that journey:

- **See when each merchant is paid.** A schedule shows each payment against the delivery window, shades PayPal's honor period for every authorization, and marks renewals, refunds and held requests.
- **Ask about your money.** **Payments** opens a spend dashboard: what was paid, what is held until delivery, what AgentSafe stopped, and each plan against its budget. Ask its agents "why was the caterer's payment held?" and SwarmPay's AgentSafe analyst answers from the ledger, citing the decision record.
- **Bring your own agent.** Organizers issue agent tokens under **Agents**, and any MCP client can connect with one, including Postman's. An agent reads the plan and can ask for payments. It cannot approve a plan or issue another token, and it acts only for the organizer who issued it.
- **Prove it.** A plain-language timeline shows what happened, and the full payment record exports as tamper-evident evidence.

## How we built it

We built SwarmPay from scratch during the hackathon; the first commit is from October 25, 2026. It is a Java 21 / Spring Boot monorepo with a React and TypeScript UI, running as eight services on Azure Kubernetes Service:

- **Commerce app.** It plans, records consent and runs the agents. Its network has no route to PayPal: the only way out is an egress proxy that admits the model host and Channel3, and refuses PayPal by name and address.
- **Private payment executor.** The only service with the merchants' PayPal credentials. Before every PayPal call it rechecks consent, the budget reservation, the exact amount and payee, and the delivery receipt.
- **AgentSafe gateway.** Every payment command reaches the executor through this gateway in fail-closed mode. An agent's request takes the same path, so it can be held.
- **PayPal sign-in service.** It alone holds SwarmPay's Log in with PayPal secret, and it returns who signed in, never a token.
- **Simulated venue.** It holds the only receipt-signing key, an Ed25519 key.
- **Egress proxy, web front end and PostgreSQL.** Money is kept in integer cents, with atomic whole-plan reservations, durable payment-command identities and a SHA-256 audit chain.

Seven typed MCP tools expose the workflow to outside agents; approving a plan is deliberately not one of them. Agent tokens are stored only as hashes, shown once, revocable, and resolved to their organizer on every call.

Every payment is a command with one identity:

- It is recorded before it is sent, carries a `PayPal-Request-Id`, and is checked against PayPal's answer.
- An unclear answer, such as a timeout or a 5xx, becomes *unknown* rather than failed, and is settled by reading PayPal, never by sending again.

## How we used PayPal and AI

**PayPal**

- **JavaScript SDK Buttons**, with a separate `data-namespace` per merchant, so each seller gets its own buyer approval on the same page.
- **Orders v2**: `CAPTURE` intent for tents and `AUTHORIZE` for catering, the seller as payee, and a `PayPal-Request-Id` on every write.
- **Payments v2**: capture the catering authorization after the receipt verifies; **reauthorize** it once the 3-day honor period has passed; on cancellation, **void** it and **refund** the tents capture. A renewal must come back as a new authorization, and a refund must link back to the capture it returns.
- **Log in with PayPal** through SwarmPay's own sandbox app: the authorization-code exchange and the identity profile create the organizer account.
- **Webhooks**, signature-verified for each seller. A notification only prompts a read of PayPal; it never sets payment state on its own.
- **PayPal Java Server SDK 2.4.0** for every payment call, with bounded timeouts and retries disabled.

**AI**

- **Azure OpenAI `gpt-6-astra`** through the Responses API, in three roles:
  - typed intent extraction
  - a sourcing choice limited by schema to the catalog's offer IDs
  - a risk and milestone review

  Each role uses a strict JSON schema, is revalidated in Java and fails closed, with no model fallback. Catalog prices, never model output, set the amounts.
- **An authenticated MCP server** (Spring AI) for outside agents. Its payment request goes through AgentSafe like any other.
- **The AG Studio agent team**: AG's five built-in agents build and edit the dashboard, and SwarmPay's custom AgentSafe analyst explains payment decisions from the payment rules and the ledger. No agent holds a payment tool, and the browser never holds a model key.

## Sponsor tools

- **AG Grid: a spend dashboard on AG Studio.**
  - **The dashboard:** the **Payments** page opens on an AG Studio dashboard in SwarmPay's own theme. It shows tiles for paid, held until delivery, refunded and agent requests stopped; a donut of what each merchant was paid; payments by day; and every payment step.
  - **Custom widgets:** two SwarmPay widgets read through Studio's data engine, so its filters apply to them. A **budget guardrail** draws each plan's paid, held and approved-but-unpaid amounts against its budget. **AgentSafe's decisions** lists every held or blocked request with its dossier ID.
  - **Studio Agent Framework:** **Ask the agents** runs AG's five built-in agents plus SwarmPay's **AgentSafe analyst**, a custom agent the lead hands "why" questions to. It reads two custom tools (SwarmPay's payment rules and the ledger's AgentSafe decisions) and has no tool that can move money.
  - **The model route:** Studio's adapter calls SwarmPay's server, which holds the Azure key, fixes the deployment, keeps only Studio's function tools, disables storage, caps the output and streams the answer back.
  - **The ledger:** the **Ledger** tab keeps an AG Grid Community grid of every payment and agent request, with search, filters, CSV export, and a total that counts only completed captures, less refunds.
- **Bryntum: when each merchant is paid.**
  - **The layout:** a Bryntum Scheduler on each plan has one row per merchant and one for the event, with bars at the recorded times.
  - **Shaded windows:** the venue's delivery window, and PayPal's 3-day honor period for each catering authorization, so an organizer sees when the funds are actually guaranteed.
  - **Renewals:** when delivery falls after that period, a dashed marker shows where SwarmPay will renew the hold; then the renewal and its fresh honor period appear.
  - **Cancellation, tooltips and range:** a cancellation shows the refund and the released hold. Tooltips name AgentSafe's decision, the dossier and the PayPal reference. Plans weeks ahead get day ticks sized to fit, on a phone too.
- **Channel3: tents to buy.**
  - **Search:** when the organizer chooses **Buy tents**, the server searches Channel3 for in-stock pop-up canopies, adding "waterproof" when rain is forecast. The price ceiling per tent leaves room in the budget for catering.
  - **Choice:** SwarmPay keeps each product's lowest in-stock US-dollar offer, and the Sourcing Agent chooses only among those IDs. It reads the offer count and Channel3's rating, so the agent can weigh value and reviews.
  - **On the plan:** the plan names the product, the store and the number of offers compared, with a link to the listing marked as an affiliate link.
  - **Safety:** the search runs on the server through the egress proxy and fails closed if Channel3 can't be reached. In the sandbox, SwarmPay's tents merchant is paid at the listed price; no order is placed with the store.
- **APIMatic: an API described, generated, and built with.**
  - **The description:** an OpenAPI 3.1 document describes all 33 REST operations, with their session and CSRF requirements. A CI test compares it with the Spring controllers' routes, so it can't drift.
  - **Generated output:** the APIMatic CLI validates it and generates a TypeScript SDK and an API docs portal.
  - **The Context Plugin:** we used APIMatic's PayPal Context Plugin in Claude Code to build the reauthorization and refund code against PayPal Java Server SDK 2.4.0. Following its `java-*` skills, we confirmed signatures in the SDK sources, unwrapped `ApiResponse`, and kept typed refusals apart from transport failures.
- **Render: your own copy.** A **Deploy to Render** button deploys seven services, including PostgreSQL, from a tested Blueprint. Render generates and shares the passwords and service tokens. Render's private network can't enforce SwarmPay's isolation rules, so this copy uses simulated payments and holds no PayPal credentials. CI runs the stack wired exactly as Render wires it.
- **Postman: playing the agent.** A Postman collection connects to the MCP server with an organizer's agent token. It checks that the agent can't approve a plan, that its early payment request is held, and that nothing more was captured. CI runs it with Newman on every change (21 requests, 27 assertions), and again over HTTPS with the live site's rules.

## Verified

**Live demo, PayPal sandbox, October 28, 2026** (real sandbox calls with test money):

- **Tents:** order `23N55770SK1159819`, $500 captured at checkout (capture `9JJ483087H808781G`).
- **Catering:** order `7F931246DX155571M`, $900 authorized (`76F230656E5431143`) and captured only after the venue's signed receipt (capture `8LX13782L6474070M`).
- **Agent held:** before delivery, the agent asked to pay catering early. AgentSafe held the request, and no payment was sent.
- **Replay:** replaying the receipt created no second payment; one capture per seller, $1,400 in total.
- **Webhooks:** six PayPal webhook notifications passed signature verification.
- **Sign-in:** a sandbox buyer signed up with PayPal, and the organizer session survived a reload.

[TODO: after the November rehearsal, list what was verified live: tents paid through the PayPal buttons; the held answer an agent token got from Postman; a hold renewed after its honor period (authorization `…` renewed as `…`); a cancellation refund (refund `…`); the dashboard's AgentSafe analyst answering "why was it held?". Delete any line that was not verified.]

**On every change**, CI runs:

- 173 Java tests, with PostgreSQL through Testcontainers and the PayPal SDK against a local HTTP server.
- 58 Node tests, AgentSafe's six included.
- The Postman collection.
- A rehearsal wired like Render.
- Five browser journeys on desktop and phone, plus six against an HTTPS rehearsal of the hosted setup.

A scheduled job also checks the live site every six hours until judging ends.

In these runs AgentSafe decides payments with a local test authority, and rentals, catering and the venue are simulated.

[TODO: attach screenshots: a completed plan with its schedule, a PayPal sandbox approval, the spend dashboard with the AgentSafe analyst's answer, and Postman's held answer. Keep the sandbox buyer's email and any Buy tents brand or store out of them.]

## Challenges we ran into

- **Payments whose outcome is unknown.** A PayPal timeout or 5xx may still have moved money, so retrying could pay twice. We record each attempt before sending it, treat an unclear answer as unknown, and settle it by reading PayPal, keeping the budget reserved meanwhile.
- **Two sellers, one plan.** Escrow and payouts looked like the answer and were the wrong tools: they put SwarmPay in the middle of the money. Authorize-then-capture pays each seller directly, on its own terms. Two button sets on one page needed separate SDK namespaces.
- **An authorization that runs out of guarantee.** PayPal guarantees an authorization's funds for only three days, so our first version refused catering more than three days out. Reauthorizing once, after the honor period and close to delivery, lifted that limit. The renewal has to come back as a new authorization, and a lost reply is recovered from the order's second authorization with reads alone.
- **Refunds after a "final" state.** Our payment projection never lets a late reply roll a payment back, and *captured* was final. A refund is the one state allowed after it, and only for a cancelled plan, before the event, in full.
- **Keeping agents away from money.** A prompt is not a boundary. We closed it in the network: the agents' service reaches only the model host and Channel3, and cannot reach PayPal by name, address or proxy, or the executor even by container IP. A CI check proves it on every change.
- **Giving the dashboard agents a model without giving them more.** AG Studio's agents run in the browser. Their requests go through our server, which adds the key and strips anything but Studio's own function tools, so no agent can search the web or reach a file store.
- **A bug only the real sandbox found.** Our session cookie is `SameSite=Strict`, so it doesn't come back on PayPal's cross-site redirect; a short-lived `Lax` cookie carries the sign-in check instead. The first real sign-in still returned signed out, because clearing that cookie replaced the new session cookie. The live run caught it, and a regression test now does.
- **A product, not a console.** Our first workspace showed every panel at once and spoke in payment terms. We rebuilt it around how people start: describe the event in a sentence, take one next action per step, and read a timeline in plain language.

## Accomplishments that we're proud of

- An agent can ask for a payment and be stopped, in the real PayPal sandbox, with a dossier explaining why. The dashboard's AgentSafe analyst can then explain that decision to the organizer.
- Two merchants paid directly on different terms from one approval, with no escrow and no money passing through us.
- Catering booked weeks ahead, inside PayPal's authorization rules, and a cancellation that refunds the tents and voids the hold in one step.
- Replays, timeouts and restarts produce exactly one payment, and the tests prove it on every change.

## What we learned

- **The safest agent can ask but can't pay.** With the boundary in infrastructure, agent mistakes become harmless instead of merely unlikely.
- **Authorize-then-capture is a natural fit for milestone commerce.** PayPal already models "hold now, pay on delivery", and reauthorization stretches it to bookings weeks ahead.
- **"Unknown" is a real payment state.** Designing for it first made timeouts, restarts and replays routine instead of dangerous.
- **Model output is safe to act on when the schema allows only valid choices.** The model picks offer IDs; code checks them, and catalog prices set the amounts.
- **Rehearse the real setup, then test live.** An HTTPS rehearsal of the hosted stack caught bugs before they shipped; only a real sandbox sign-in caught the lost session cookie.
- **Show money the way people ask about it.** "How much did we pay the caterer?" is a filter and a total. "When does the caterer get paid?" is a schedule. "Why was it held?" is a question for an agent that can read the record.

## What's next

- Hosted Decionis enforcement in place of the local test authority, including approval and resume of held payments.
- Real venue integrations, a dispute process, and merchant cancellation fees with partial refunds.
- Checkout with the stores that list purchased tents, instead of a sandbox tents merchant.
- More merchants and multi-milestone contracts, such as contractors paid per signed-off stage, plus OAuth for agent connections.

## Built with

Java 21 · Spring Boot · Spring AI (MCP) · React · TypeScript · Vite · PostgreSQL · Azure OpenAI (GPT-6 Astra) · PayPal JavaScript SDK · PayPal Orders v2 · PayPal Payments v2 · Log in with PayPal · PayPal webhooks · PayPal Java Server SDK · AgentSafe · AG Grid · AG Studio · Bryntum Scheduler · Channel3 · APIMatic · Render · Postman · Newman · Docker · Azure Kubernetes Service · Playwright · Claude Code

## Testing instructions

[TODO: paste privately into Devpost's testing-instructions field; never commit the credentials:

- **PayPal sandbox buyer:** **Continue with PayPal** with it creates the organizer account on https://swarm.decionis.com, and the same buyer approves both merchants' payments in PayPal. It is a sandbox account, not a real PayPal login.
- **Organizer password:** an alternative to signing up with PayPal.
- **Event time:** keep the event about an hour ahead; the venue can confirm delivery from two hours before it.
- **Delivery:** the delivery step is the **Confirm delivery as the venue** button. **Let the agent ask** shows AgentSafe holding an early payment request.
- **Dashboard:** **Payments** opens the spend dashboard. In **Ask the agents**, choose **Why was it held?**. The **Ledger** tab lists every payment.
- **Agents:** **Agents** issues a token for Postman's desktop app or any MCP client (see `postman/README.md`). **Buy tents** uses Channel3 listings.

Anyone can run the full simulated journey locally with three commands; see the repository README.]
