**Be the agent with Postman**

SwarmPay's agents work through an MCP server at `/mcp`. Postman can play that agent: connect with an agent token, read a plan, and ask to pay the caterer before delivery. AgentSafe holds the request and nothing is paid. The token acts for its organizer only and can never approve a plan.

**Get an agent token**

Sign in to SwarmPay (for the live site, **Continue with PayPal**), open **Agents** in the workspace header and create a token. It is shown once. The same dialog lists your plan IDs and revokes tokens. An agent token cannot create another token or reach the organizer's REST API.

**Option 1: Postman's MCP request (interactive)**

1. In the Postman desktop app, choose **New → MCP**, select **HTTP**, and enter `https://swarm.decionis.com/mcp` (or `http://localhost:5173/mcp` locally). Postman in a web browser sends its own site's `Origin`, which SwarmPay refuses.
2. On **Authorization**, choose **Bearer Token** and paste the agent token. Connect: the seven tools appear. None of them approves a plan.
3. Call `get_workflow_status` with a `workflowId` whose catering is authorized (approve the plan and authorize catering in the SwarmPay UI first).
4. Call `request_milestone_payment` with the same `workflowId`. Before the venue confirms delivery, the answer is `"state":"ESCALATE"` and `"execution":"HELD"`, with an AgentSafe dossier. Call `get_workflow_status` again: nothing more was captured.

**Option 2: the collection (repeatable, with tests)**

Import [`SwarmPay-agent.postman_collection.json`](SwarmPay-agent.postman_collection.json) and an environment.

- **Live site or any SwarmPay:** use [`SwarmPay-live.postman_environment.json`](SwarmPay-live.postman_environment.json), set `agentToken` and `workflowId`, and run **2 · Be the agent**. It speaks MCP over plain HTTP (initialize, list tools, call tools) and checks that the agent can't approve, that the early request is held, and that nothing more was captured.
- **Local simulated demo:** start the stack (`docker compose up --build -d --wait`, see the [README](../README.md)), select [`SwarmPay-local.postman_environment.json`](SwarmPay-local.postman_environment.json) and run the whole collection. **1 · Organizer setup** plays the human through the REST API with simulated payments, from sign-in to an authorized catering payment, and issues the agent token; **3 · Clean up** revokes it and checks that it no longer connects.

CI runs the whole collection against the local stack on every change with Postman's command-line runner:

```sh
npx --yes newman@6.2.1 run postman/SwarmPay-agent.postman_collection.json -e postman/SwarmPay-local.postman_environment.json
```

Payments in the local demo are simulated. On the live site they run in the PayPal sandbox with test money, and AgentSafe decides them with a local test authority.
