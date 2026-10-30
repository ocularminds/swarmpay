**SwarmPay submission checklist**

The path from here to a submitted entry, and what keeps it working until judging ends. The repository stays private until [Go public and submit](#go-public-and-submit-november-11). Deadline: **November 12, 2026, 12:00 PT** (20:00 UTC); target November 11. Judging runs December 1–15, and the [rules](https://paypalaihackathon.devpost.com/rules) require the demo to stay usable, free and unrestricted until then.

**Done in the repository**

- [x] README: the **Deploy to Render** button, a live-demo row that matches the live footer, and a link to the latest release record.
- [x] The Postman agent folder runs against the hosted HTTPS rehearsal with the live environment file and an organizer-issued token after password sign-in, the way the live site requires ([`check-hosted-agent.mjs`](../demo/check-hosted-agent.mjs), in CI). It also shows the site refuses Postman's browser client, which sends an `Origin`; the desktop app sends none.
- [x] A browser test drives the real PayPal button component for both merchants against a stand-in SDK: each merchant loads its own client ID and intent, tents are paid and catering is authorized. Nothing had covered that component before, because CI runs simulated checkout.
- [x] [`check-live.mjs`](../demo/check-live.mjs) and the [Watch the live demo](../.github/workflows/live.yml) workflow check swarm.decionis.com every six hours until December 15, anonymously: the landing and its assets, sandbox configuration, both seller client IDs, MCP, the PayPal sign-in redirect and at least 21 days left on the TLS certificate.
- [x] Bryntum's trial expires **45 days after the schedule first renders in a browser** (it stores `b-scheduler-trial-start` in that browser), then a toast says the trial has expired and the schedule is masked. Each judge's browser starts its own 45 days. A browser that first showed the schedule around October 28 expires around December 12.
- [x] The video script blurs the brand, product and store on a **Buy tents** line and keeps other companies' names and logos out of frame; the submission text names the store generically. The rules forbid third-party trademarks in the video without permission.
- [x] Video frames in [`demo/video`](../demo/video): the architecture slide, the title card, a transparent lower third and the narration transcript for YouTube's caption auto-sync. `node demo/video/render.mjs` redraws the PNGs from `slides.html`.

**Before recording (by November 6)**

- [ ] Merge this work after CI passes. The live-demo watch runs only from `master`.
- [ ] Ask Bryntum (a sponsor) for a hackathon license. If one arrives, change the alias in `apps/web/package.json` to the licensed package, update `NOTICE`, and redeploy the web image before recording. Without one, judges are unaffected; record in a fresh browser profile, as the script already says.
- [ ] Rehearse on the live site the same day you record, in the script's fresh profile:
  - **Tents through the PayPal buttons.** Only catering has used the buttons live; the October 28 tents payment went through the API. If a button shows *Payment command is being processed*, the 3-second worker claimed the checkout first: choose the button again, and it continues the same order.
  - **Postman as the agent.** Postman desktop app, **New → MCP → HTTP**, `https://swarm.decionis.com/mcp`, Bearer token from **Agents**. Or run the collection's **2 · Be the agent** folder with `SwarmPay-live.postman_environment.json`, as CI does on the rehearsal.
  - When both pass, record them in [implementation status](implementation-status.md) (the MCP row and the sponsor-tools paragraph still say they are unverified live), and remove the rehearsal note from the [video script](../demo/video-script.md).

**Record and publish the video (by November 8)**

- [ ] Record from the [video script](../demo/video-script.md), under 3:00. Blur the PayPal sandbox login, the agent token and the brand, product and store on the **Buy tents** line.
- [ ] Record the README's **Deploy to Render** cut after going public, or from a local Markdown preview, so GitHub's *Private* label isn't in frame.
- [ ] Upload to YouTube as **Public**; add [`demo/video/transcript.txt`](../demo/video/transcript.txt) under **Subtitles → Add → Auto-sync**.
- [ ] Put the link in the README's video row and the [submission draft](submission-draft.md). Revoke the agent token used for recording.

**Devpost entry (by November 10)**

- [ ] Gallery screenshots: the completed plan, a PayPal sandbox approval, the schedule, the ledger with a filtered total, and Postman's held answer. Keep the sandbox buyer's email and any Buy tents brand or store out of them, then remove the screenshots TODO from the draft.
- [ ] Paste the [submission draft](submission-draft.md) as its note describes. Enter AG Grid, APIMatic, Bryntum, Channel3 and Render as sponsor tools.
- [ ] Testing instructions, privately in Devpost only: the PayPal sandbox buyer, the organizer password login, keeping the event about an hour ahead, and the delivery button. Use credentials that stay valid through December 15.

**Go public and submit (November 11)**

- [ ] In [implementation status](implementation-status.md), replace *This is not yet a completed hackathon submission*. In the draft, fill in the code URL and drop *it is private today*.
- [ ] Make the repository public and set its About section; GitHub then shows the Apache-2.0 license there, as the rules require:

  ```bash
  gh repo edit ocularminds/swarmpay --visibility public --accept-visibility-change-consequences
  ```

  ```bash
  gh repo edit ocularminds/swarmpay --description "Give agents a budget. Pay merchants only on agreed terms. PayPal + AI agent commerce." --homepage https://swarm.decionis.com --add-topic paypal --add-topic ai-agents --add-topic mcp --add-topic agentic-commerce
  ```

- [ ] Open the repository signed out: the license shows in About, and the **Deploy to Render** button opens Render's deploy page.
- [ ] Run a judge's three commands from a fresh public clone. The project name keeps it apart from your own stack's volumes; stop your stack first (`docker compose stop`), because both use port 5173.

  ```bash
  git clone https://github.com/ocularminds/swarmpay.git /tmp/swarmpay-judge && cd /tmp/swarmpay-judge && node demo/setup.mjs && node demo/doctor.mjs && COMPOSE_PROJECT_NAME=swarm-pay-judge docker compose up --build -d --wait
  ```

  Walk the journey at <http://localhost:5173>, then `COMPOSE_PROJECT_NAME=swarm-pay-judge docker compose down --volumes` in that clone and `docker compose up -d --wait` in yours.
- [ ] Submit on Devpost, and check that the entry shows as submitted, not as a draft.

**Through judging (to December 15)**

- [ ] Keep running: the `decionis-aks` deployments, the Azure OpenAI `gpt-6-astra` deployment and its quota, both PayPal sandbox seller apps, SwarmPay's PayPal sign-in app, the sandbox buyer, and the Channel3 key. The TLS certificate is valid until January 23, 2027.
- [ ] Don't change the live site after submitting except to fix it. The rules require it to work as the video and text describe.
- [ ] Watch for failed **Watch the live demo** runs; GitHub emails them to whoever last changed the schedule. After judging, delete `.github/workflows/live.yml`.

**Decisions**

- **Infrastructure names in public history.** `infra/azure/target.json` and the release records name the resource group, AKS cluster, registry, namespace and a private DNS address. None is a credential, and git history already holds them, so removing them now would mean rewriting history. Recommended: accept.
- **A Render copy for judges (optional).** The Render prize judges may prefer a running copy. Six services run on Starter instances; check [docs/render.md](render.md) for costs and the sponsor's $50 credit.
- **APIMatic's subscription offer (optional).** It also asks for evidence of the PayPal Context Plugin ([APIMatic](../contracts/apimatic/README.md)).
