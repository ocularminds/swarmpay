**SwarmPay submission video script**

Target length **2:50**, under the three-minute limit judges watch to. Record on the live site, [swarm.decionis.com](https://swarm.decionis.com), which runs real PayPal sandbox calls with test money and real Azure OpenAI responses. The narration is about 320 words, so it fits at a calm 150 words a minute with room for the screen to breathe. Cut waiting time in the edit, but never cut or rearrange a step so the product appears to do something it did not.

**Before recording**

- Rehearse the full journey once on the live site the same day. The tents checkout through the PayPal buttons in the UI has not yet been verified live (the October 28 run created it through the API), so if it fails in rehearsal, fix it before recording rather than cutting around it.
- Use a fresh browser profile at 1920×1080, zoom 110–125%, bookmarks bar hidden, no personal tabs or extensions visible.
- Have the PayPal sandbox buyer ready. Never show its email or password: start the recording after the PayPal login form is filled, or cut or blur that segment.
- Leave the event date as the default, about an hour ahead. The venue can confirm delivery from two hours before the event, and a quote lasts 30 minutes, so record the plan through delivery in one sitting.
- Use no music, or only music you own. Show only SwarmPay, PayPal's own sandbox pages and your own slide.
- Keep the footer disclosure in view at least once, and the lower third below on screen throughout.

**Lower third, on screen throughout**

> PayPal sandbox · test money · catalog and venue simulated · payments decided by AgentSafe's local test authority

**Script**

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:18 | The landing page: *Book your event. Pay only on your terms.* Slow scroll over the example plan card. | Event organizers pay several merchants on different terms: tents up front, the caterer only once the food arrives. Hand an AI agent a card and it can spend the whole budget. SwarmPay lets agents do the legwork while every merchant is paid on your terms. |
| 0:18–0:35 | Type into the box: *An outdoor tech meetup for 30 people at Riverside Pavilion. Rain is forecast. Five tents and catering, $1,500 in total.* Choose **Plan my event**. The sign-in dialog quotes the description. Choose **Continue with PayPal**, complete the PayPal sandbox sign-in (credentials hidden) and return. | I just describe the event in a sentence. Continuing with PayPal creates my organizer account from my PayPal name and email, and my description comes along. |
| 0:35–0:58 | *Here's what we understood.* with guests, tents, budget, venue and weather filled in. Choose **Rent tents**, then **Prepare my plan**. Highlight the Sourcing Agent's note and open **Why this plan**. | GPT-6 Astra on Azure OpenAI reads it into details I can edit. The Sourcing Agent then picks one tent rental and one caterer. Its answer is limited to real catalog offers, our code checks capacity, dates and budget, and catalog prices, not the model, set every amount. A second agent reviews the risks: rain, timing, capacity. |
| 0:58–1:10 | The **Next step** card: *Approve $1,400 for 2 merchants*. Tick the consent box and choose **Approve $1,400**. | I approve the exact plan once: $1,400 of my $1,500, reserved as a whole, with catering paid only after a matching delivery receipt. |
| 1:10–1:38 | *Pay Canopy Collective*: the PayPal button opens the sandbox approval, then the tents line shows **Paid**. *Authorize Gather Kitchen*: approve in PayPal, then the catering line shows **Authorized · pays on delivery**. | Each merchant gets its own PayPal approval and is paid directly, with no escrow in between. The tents are captured now. Catering uses PayPal's authorize-then-capture: the $900 is authorized, not taken. |
| 1:38–1:58 | Under **Try it**, choose **Let the agent ask**. The row shows **Held by AgentSafe**; open **Payment records and authority decisions** to show the held request and its dossier. | Now the milestone agent asks to pay the caterer early. Its request goes through AgentSafe, a fail-closed payment gateway, and it is held, because there is no delivery receipt yet. No payment is sent. |
| 1:58–2:18 | Choose **Confirm delivery as the venue**. The card changes to *Both merchants are paid* and the title to *Your event is booked and paid.* | When the venue confirms delivery, it signs a receipt with its own key. SwarmPay checks the event, merchant, quantity and delivery window, and only then captures the catering payment. Replaying that receipt can't pay twice. |
| 2:18–2:35 | Scroll the **What happened** timeline, then choose **Download evidence**. Cut to a one-slide diagram: agents → AgentSafe → private executor → PayPal, with the agents' network crossed off from PayPal. | Every step lands in a tamper-evident record. And the agents never touch money: they run on a network with no route to PayPal, and only a private executor holds the merchants' PayPal credentials, after rechecking consent, the budget and the receipt. |
| 2:35–2:48 | Back to the landing. Title card: **SwarmPay** · swarm.decionis.com · open source. | SwarmPay is for anyone who pays several vendors on different terms and wants AI's help without handing it a card. Give agents a budget. Pay merchants only on agreed terms. |

**On-screen honesty**

Say or show that AgentSafe decides payments with a local test authority, and keep the catalog and venue labeled as simulated. Call the catering step an authorization, never a completed payment, until the capture, and never call authorize-then-capture escrow. If a step needed a retry while recording, show the retry rather than splicing two attempts into one.

**After recording**

Upload to YouTube as **Public**, add the narration as captions, and put the link in the [submission draft](../docs/submission-draft.md) and the README's video row.
