**SwarmPay submission video script**

Target length **2:55**, under the three-minute limit judges watch to. Record on the live site, [swarm.decionis.com](https://swarm.decionis.com), which runs real PayPal sandbox calls with test money and real Azure OpenAI responses. The narration is about 360 words, so it fits at a calm 150 words a minute with room for the screen to breathe. Cut waiting time in the edit, but never cut or rearrange a step so the product appears to do something it did not.

**Before recording**

- Rehearse the full journey once on the live site the same day, including the Postman step. The tents checkout through the PayPal buttons in the UI has not yet been verified live (the October 28 run created it through the API), and neither has an agent token used from Postman against the live site (CI runs the collection locally). If either fails in rehearsal, fix it before recording rather than cutting around it.
- Use a fresh browser profile at 1920×1080, zoom 110–125%, bookmarks bar hidden, no personal tabs or extensions visible.
- Have the PayPal sandbox buyer ready. Never show its email or password: start the recording after the PayPal login form is filled, or cut or blur that segment.
- Agent token: create it under **Agents** off camera, paste it into Postman's **Bearer Token** field (Postman masks it) and never show it. Revoke it after recording. Plan IDs are not secret.
- In Postman, open **New → MCP**, select **HTTP**, enter `https://swarm.decionis.com/mcp`, set the Bearer token and connect, so the seven tools are already listed.
- Just before recording, prepare a second plan with **Buy tents** in the same account and leave it unapproved. Its quote lasts 30 minutes.
- Leave the main event date as the default, about an hour ahead. The venue can confirm delivery from two hours before the event, and a quote lasts 30 minutes, so record the plan through delivery in one sitting.
- For the closing montage, have the APIMatic portal open locally (`node demo/apimatic.mjs`, then the preview in [contracts/apimatic](../contracts/apimatic/README.md)) and the README's **Deploy to Render** button in view.
- Use no music, or only music you own. Show only SwarmPay, PayPal's own sandbox pages, the sponsor tools in the script (Postman, the APIMatic portal, Render's Deploy button) and your own slide. The rules forbid third-party trademarks without permission: a **Buy tents** line names a real product, its brand and the store that lists it, so blur those three, and keep any other company's name or logo out of frame. The schedule uses Bryntum's trial build, which expires 45 days after it first renders in a browser; the fresh profile starts a new trial, so no notice should appear, and if one does, leave it visible.
- Use the Postman desktop app, not Postman in a web browser: the live site refuses requests that carry another site's `Origin`, which the browser client sends.
- Keep the footer disclosure in view at least once, and the lower third below on screen throughout.

**Lower third, on screen throughout** ([`video/lower-third.png`](video/lower-third.png), a transparent 1920×1080 overlay)

> PayPal sandbox · test money · rentals, catering and venue simulated · payments decided by AgentSafe's local test authority

**Script**

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:16 | The landing page: *Book your event. Pay only on your terms.* Slow scroll over the example plan card. | Event organizers pay merchants on different terms: tents up front, the caterer once the food arrives. Hand an AI agent a card and it can spend everything. SwarmPay lets agents do the legwork while you set the terms. |
| 0:16–0:30 | Type into the box: *An outdoor tech meetup for 30 people at Riverside Pavilion. Rain is forecast. Five tents and catering, $1,500 in total.* Choose **Plan my event**. The sign-in dialog quotes the description. Choose **Continue with PayPal**, complete the PayPal sandbox sign-in (credentials hidden) and return. | I describe the event in a sentence. Continuing with PayPal creates my account from my PayPal name and email, and my description comes along. |
| 0:30–0:50 | *Here's what we understood.* with guests, tents, budget, venue and weather filled in. Choose **Rent tents**, then **Prepare my plan**. Highlight the Sourcing Agent's note and open **Why this plan**. | GPT-6 Astra on Azure OpenAI reads it into details I can edit. The Sourcing Agent picks one tent rental and one caterer, limited to real offers; our code checks capacity, dates and budget, and prices, not the model, set every amount. A second agent reviews the risks. |
| 0:50–1:00 | From the plan menu in the header, open the **Buy tents** plan prepared before recording. Highlight the tents line's price and *Product data from Channel3*; blur the product title, brand and store name in the edit. Switch back to the main plan. | Here's a plan I prepared earlier with Buy tents: the agent chose from Channel3's in-stock listings within budget. I'll rent for this event. |
| 1:00–1:10 | The **Next step** card: *Approve $1,400 for 2 merchants*. Tick the consent box and choose **Approve $1,400**. | I approve the exact plan once: $1,400 of my $1,500, reserved as a whole, with catering paid only after a matching delivery receipt. |
| 1:10–1:33 | *Pay Canopy Collective*: the PayPal button opens the sandbox approval, then the tents line shows **Paid**. *Authorize Gather Kitchen*: approve in PayPal, then the catering line shows **Authorized · pays on delivery**. | Each merchant gets its own PayPal approval and is paid directly, with no escrow in between. The tents are captured now. Catering uses PayPal's authorize-then-capture: the $900 is held, not taken. |
| 1:33–1:54 | Open **Agents** and copy this plan's ID from *Plan IDs your agent can use* (the token stays off screen). In Postman, show the seven tools, then call `request_milestone_payment` with that `workflowId`. Highlight `"state":"ESCALATE"` and `"execution":"HELD"`. Back in SwarmPay (reload if needed), the request shows **Held by AgentSafe**. | Now an outside agent, here Postman, connects with a token I issued and asks to pay the caterer early. None of its tools can approve a plan. Its request goes through AgentSafe, a fail-closed payment gateway, and it's held: there's no delivery receipt yet. |
| 1:54–2:10 | Choose **Confirm delivery as the venue**. The card changes to *Both merchants are paid* and the title to *Your event is booked and paid.* | When the venue confirms delivery, it signs a receipt with its own key. SwarmPay checks the event, merchant, quantity and delivery window, then captures the catering payment. Replaying that receipt can't pay twice. |
| 2:10–2:26 | Scroll to *When each merchant is paid*: **Paid $500**, **Agent asked early · held**, **Paid $900 after delivery** and the shaded delivery window. Choose **Payments**, search *Gather Kitchen*: the total reads *$900 · 1 payment*. Choose **Export CSV**. | The Bryntum schedule shows when each merchant was paid against the delivery window. The AG Grid ledger lists every payment and held request across my plans, and its total counts only money actually paid. |
| 2:26–2:40 | Cut to the one-slide diagram, [`video/architecture.png`](video/architecture.png): agents → AgentSafe → private executor → PayPal, with the agents' network crossed off from PayPal. | The agents never touch money. They run on a network with no route to PayPal, and only a private executor holds the merchants' PayPal credentials, after rechecking consent, the budget and the receipt. |
| 2:40–2:55 | Quick cuts: the APIMatic docs portal, the README's **Deploy to Render** button. Title card, [`video/title.png`](video/title.png): **SwarmPay** · swarm.decionis.com · open source. | For developers, APIMatic generates an SDK and docs from our tested API description, and one button deploys your own simulated copy to Render. Give agents a budget. Pay merchants only on agreed terms. |

**On-screen honesty**

Say or show that AgentSafe decides payments with a local test authority, and keep rentals, catering and the venue labeled as simulated. Say that the **Buy tents** plan was prepared before recording, and don't imply that SwarmPay orders from the store that lists a tent: in the sandbox, the tents merchant is paid. Call the catering step an authorization, never a completed payment, until the capture, and never call authorize-then-capture escrow. If a step needed a retry while recording, show the retry rather than splicing two attempts into one.

**After recording**

Upload to YouTube as **Public**. For captions, add [`video/transcript.txt`](video/transcript.txt) in YouTube Studio under **Subtitles → Add → Auto-sync**, which times the narration to the recording. Put the link in the [submission draft](../docs/submission-draft.md) and the README's video row. Revoke the agent token used in Postman.
