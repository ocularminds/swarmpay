**SwarmPay submission video script**

Target length **2:55**, under the three-minute limit judges watch to. Record on the live site, [swarm.decionis.com](https://swarm.decionis.com), which makes real PayPal sandbox calls with test money and real Azure OpenAI calls.

The narration is about 360 words: a calm 150 words a minute leaves room for PayPal's windows and the agents' answers. Cut waiting time in the edit, but never cut or rearrange a step so the product appears to do something it did not.

The video carries the **Presentation** criterion and the **Best Demo Delivery** prize, so it covers four things in order:
- the problem and who has it
- the journey working end to end, with PayPal and AI named on screen
- what is new (agents that can ask but not pay)
- how to try it

**Before recording**

- **Deploy and rehearse.** Deploy the current `master` to the live site. Rehearse the whole journey once the same day, in the fresh profile below, including Postman and **Ask the agents**. If a step fails in rehearsal, fix it before recording rather than cutting around it.
- **Prepare three plans in the recording account,** and label each one *Prepared earlier* in the edit when it appears:
  1. **A renewed hold.** A plan for an event 5–6 days out, approved, with both merchants paid on November 4 (see the [checklist](../docs/submission-checklist.md)). By recording day the timeline says *PayPal renewed the catering hold* and the schedule shows two honor periods.
  2. **Buy tents.** A **Buy tents** plan, left unapproved and prepared within 30 minutes of recording, since its quote lasts 30 minutes.
  3. **A cancelled event.** Approve a plan, pay both merchants, then cancel it under **Pause or cancel**. Its card says *Your event is cancelled*, and the timeline says PayPal refunded the tents.
- **Main plan timing.** Leave its event time at the default, about an hour ahead. The venue can confirm delivery from two hours before the event and a quote lasts 30 minutes, so record that plan through delivery in one sitting.
- **Browser.** A fresh browser profile at 1920×1080, zoom 110–125%, bookmarks bar hidden, and no personal tabs or extensions visible.
- **The PayPal sandbox buyer.** Never show its email or password: start recording after the PayPal login form is filled, or cut or blur that part.
- **Postman.**
  - Use the desktop app, not Postman in a browser: the live site refuses requests that carry another site's `Origin`.
  - Create the agent token under **Agents** off camera and paste it into Postman's **Bearer Token** field, which masks it. Never show it, and revoke it afterwards.
  - Open **New → MCP**, choose **HTTP**, enter `https://swarm.decionis.com/mcp`, set the token and connect, so the seven tools are already listed.
- **Closing montage.**
  - Regenerate the APIMatic portal from the current API description (`node demo/apimatic.mjs`, then the preview in [contracts/apimatic](../contracts/apimatic/README.md)).
  - Have the README's **Deploy to Render** button in view. Record that cut after the repository is public, or from a local Markdown preview, so GitHub's *Private* label isn't in frame.
- **What may appear on screen:** SwarmPay, PayPal's own sandbox pages, the sponsor tools in the script (Postman, AG Studio, Bryntum, Channel3, APIMatic, Render) and your own slides.
  - **Third-party marks:** the rules forbid them without permission. A **Buy tents** line names a real product, its brand and the store that lists it, so blur those three, and keep any other company's name or logo out of frame.
  - **Music:** use none, or only music you own.
- **Trial notices.** Without licence keys, Bryntum and AG Studio show trial notices or watermarks; leave them visible rather than cropping them out.
- **Disclosures.** Keep the footer disclosure in view at least once, and the lower third on screen throughout.

**Lower third, on screen throughout** ([`video/lower-third.png`](video/lower-third.png), a transparent 1920×1080 overlay)

> PayPal sandbox · test money · rentals, catering and venue simulated · payments decided by AgentSafe's local test authority

**Script**

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:15 | The landing page: *Book your event. Pay only on your terms.* Slow scroll over the example plan card. | Event organizers pay merchants on different terms: tents up front, the caterer once the food arrives. Hand an AI agent a card, and it can spend everything. SwarmPay lets agents do the legwork while you set the terms. |
| 0:15–0:26 | Type the example into the box and choose **Plan my event**. The sign-in dialog quotes the description. Choose **Continue with PayPal**, complete the sandbox sign-in (credentials hidden) and return to the workspace. | I describe the event in a sentence and continue with PayPal, which creates my account from my sandbox PayPal profile. |
| 0:26–0:46 | *Here's what we understood.* with guests, tents, budget, venue and weather filled in. Choose **Rent tents**, then **Prepare my plan**; highlight the Sourcing Agent's note and open **Why this plan**. Quick cut to the prepared **Buy tents** plan, captioned *Prepared earlier*: highlight the price, the offers compared, the rating and *Product data from Channel3*, with the product, brand and store blurred. Back to the main plan. | GPT-6 Astra on Azure OpenAI turns it into details I can edit. The Sourcing Agent picks a tent rental and a caterer from real offers; to buy tents, it chooses among Channel3's in-stock listings and their ratings. Code checks every choice, and prices, not the model, set the amounts. |
| 0:46–0:53 | **Next step**: *Approve $1,400 for 2 merchants*. Tick the consent box and choose **Approve $1,400**. | I approve the exact plan once, and the whole fourteen hundred dollars is reserved. |
| 0:53–1:10 | *Pay Canopy Collective*: the PayPal button opens the sandbox approval, and the tents line shows **Paid**. *Authorize Gather Kitchen*: approve in PayPal, and the catering line shows **Authorized · pays on delivery**. | Each merchant gets its own PayPal approval and is paid directly. The tents are captured now. Catering is only authorized: the nine hundred dollars is held, not taken. |
| 1:10–1:28 | In Postman, show the seven tools, then call `request_milestone_payment` with this plan's `workflowId` (copied from **Agents**). Highlight `"state":"ESCALATE"` and `"execution":"HELD"`. Back in SwarmPay, the request shows **Held by AgentSafe**. | Now an outside agent, here Postman over MCP, asks to pay the caterer early. It can't approve plans, and its request goes through AgentSafe, a fail-closed gateway. It's held: there's no delivery receipt. |
| 1:28–1:40 | Choose **Confirm delivery as the venue**. The card changes to *Both merchants are paid*, and the title to *Your event is booked and paid.* | When the venue signs a delivery receipt, SwarmPay checks the event, merchant, quantity and window, then captures the catering. Replaying the receipt can't pay twice. |
| 1:40–1:56 | Switch to the prepared renewed-hold plan, captioned *Prepared earlier*. Scroll to *When each merchant is paid*: the two hatched honor periods on the caterer's row and the **Hold renewed** marker. Hover it to show its tooltip. | This plan was booked days ahead. PayPal guarantees held funds for three days, and the Bryntum schedule shades that window. Before delivery, SwarmPay renewed the hold with a fresh authorization, and no money moved. |
| 1:56–2:18 | Choose **Payments**. The AG Studio dashboard: tiles for paid, held and agent requests stopped; the budget guardrail; *What AgentSafe stopped*. Choose **Ask the agents**, then **Why was it held?**. Show *Delegated to AgentSafe analyst* and the answer citing the dossier. | Payments opens an AG Studio dashboard: what's paid, what's held, and what AgentSafe stopped. I ask its agents why the request was held. The lead hands it to our AgentSafe analyst, which answers from the ledger and cites the decision. It can explain a payment, never make one. |
| 2:18–2:26 | Switch to the prepared cancelled plan, captioned *Prepared earlier*: the *Your event is cancelled* card, the tents line **Refunded**, the catering line **Cancelled**, and the timeline line *PayPal refunded the $500.00 tents payment to you.* | Here's a plan I cancelled earlier: PayPal refunded the tents, the catering hold was voided, and the budget was released. |
| 2:26–2:41 | Cut to the one-slide diagram, [`video/architecture.png`](video/architecture.png): agents → AgentSafe → private executor → PayPal, with the agents' route to PayPal crossed out. | The agents never touch money. Their network has no route to PayPal, and only a private executor holds the merchants' credentials, after rechecking consent, budget and receipt. |
| 2:41–2:55 | Quick cuts: the APIMatic docs portal, then the README's **Deploy to Render** button. End on the title card, [`video/title.png`](video/title.png): **SwarmPay** · swarm.decionis.com · open source. | Developers get an APIMatic SDK from our tested API, and one Render button deploys their own copy. Give agents a budget. Pay merchants only on agreed terms. |

**On-screen honesty**

- **Simulations.** Say or show that AgentSafe decides payments with a local test authority, and keep rentals, catering and the venue labeled as simulated.
- **Prepared plans.** Caption every prepared plan *Prepared earlier*.
- **Buy tents.** Don't imply that SwarmPay orders from the store that lists a tent: in the sandbox, SwarmPay's tents merchant is paid.
- **Payment words.** Call the catering step an authorization, never a payment, until the capture. A renewed hold moved no money. Never call authorize-then-capture escrow.
- **Retries.** If a step needed a retry while recording, show the retry rather than splicing two attempts into one.
- **Unverified steps.** Show the renewal and the dashboard agent only if they worked on the live site. Otherwise, drop those beats and give their seconds to the main journey.

**After recording**

- Upload to YouTube as **Public**.
- For captions, add [`video/transcript.txt`](video/transcript.txt) in YouTube Studio under **Subtitles → Add → Auto-sync**, which times the narration to the recording.
- Put the link in the [submission draft](../docs/submission-draft.md) and the README's video row.
- Revoke the agent token used in Postman.
