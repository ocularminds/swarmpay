**SwarmPay HTTP and MCP contracts**

The Java records in `Commerce.java` and the controllers are the runtime source of truth. The JSON schemas in this directory document confirmed [intents](intent.schema.json), private [payment commands](payment-command.schema.json), and signed [receipt envelopes](receipt.schema.json). Cross-field identity, consent, budget, time, nonce and provider-state checks are performed in Java; JSON Schema alone cannot authorize a payment.

**Session and public metadata**

| Method/path | Behavior |
| --- | --- |
| `GET /api/config` | Public payment mode, AI provider/model label, authority label, catalog source, receipt issuer, public PayPal client IDs and policy version. No secret values. |
| `GET /api/session` | `{authenticated, username, csrfToken, csrfHeader}`. Establish the session before a state-changing request. |
| `POST /api/demo-session` | Local demo login; requires CSRF and returns 404 in sandbox mode. |
| `POST /api/login` | Form-encoded `username` and `password` plus CSRF; returns 204 on success. |
| `POST /api/logout` | CSRF-protected session logout; 204 on success. |

Keep the `JSESSIONID` cookie and refresh `/api/session` after login. Send the returned CSRF header/token on human POST requests. Only the configured organizer is supported. `/api/**` endpoints require that human session except the metadata/login routes and the signed venue ingress. The MCP bearer token is not a human session.

**Organizer endpoints**

Successful JSON endpoints normally return 200. `id` is a workflow UUID, `order` a line UUID from that workflow, and command IDs remain stable across retries.

| Method/path | Request and response |
| --- | --- |
| `GET /api/catalog` | Curated `Offer[]` with integer `unitMinor`, capacity and source labels |
| `POST /api/intent` | `{request, timezone}` → editable suggestions, nullable unknown fields, clarifications and actual AI source |
| `GET /api/plans` | Up to 30 of the organizer's newest plans |
| `POST /api/plans` | `{intent, tentOfferId, cateringOfferId}` → immutable draft `Plan` |
| `GET /api/plans/{id}` | `Workflow`: plan, merchant orders, events, committed/captured cents, payment mode, receipt and freeze flags |
| `POST /api/plans/{id}/approve` | `{version}` → approved plan and one atomic whole-plan reservation |
| `POST /api/plans/{id}/orders/{order}/checkout` | Empty body → `GateResult` for guarded create-order; buyer approval is still required |
| `POST /api/plans/{id}/orders/{order}/buyer-approved` | `{providerOrderId}` → guarded capture or authorization. PayPal independently enforces native buyer approval. |
| `POST /api/plans/{id}/milestone` | Empty body → guarded capture of the existing catering authorization; requires a trusted receipt |
| `POST /api/plans/{id}/freeze` | Empty body → `{frozen:true}`; blocks new spending, not already dispatched effects |
| `POST /api/plans/{id}/void` | Empty body → gated void of an uncaptured catering authorization; permitted after a dispute freeze |
| `POST /api/plans/{id}/receipt` | Signed envelope → workflow after verification and a possible automatic capture request |
| `POST /api/plans/{id}/photo` | Multipart field `file`, PNG/JPEG up to 2,000,000 bytes → supporting evidence in HELD state |
| `GET /api/plans/{id}/commands` | Array of `{command, state, result}` |
| `GET /api/plans/{id}/evidence` | Workflow ID, payment mode, events, commands, application-chain verification and proof scope |
| `POST /api/commands/{id}/reconcile` | Empty body → provider/ledger read through the gateway; never initiates a new payment |
| `POST /api/commands/{id}/retry` | Empty body → same command requeued only after confirmed non-dispatch; requires fresh authority |

`GateResult` has `state`, `execution`, `decisionId`, `dossierId`, `intentHash`, `intentId`, `message`, and nullable `result`. The provider result holds status, provider order/authorization/capture IDs, approval URL, amount, currency, merchant and source. Treat authority state and provider state separately: `SUCCEEDED` means the gated operation returned a result; only `CAPTURED` confirms the full payment. `PENDING` and `INDETERMINATE` retain their reservations.

Errors generally contain `{code,message}`. Bad fields use 400, unauthenticated requests 401, role/CSRF failures 403, missing owned resources 404, held/conflicting operations 409, excess upload size 413, budget/provider refusal 422, bounded planner saturation 429, invalid model output 502 and unavailable model/provider outcome 503. Security/framework errors may not use the application JSON envelope.

**Signed venue ingress**

`POST /api/venue/receipts` accepts the same signed envelope without a human session. The signature is its authentication. It admits receipts only for an approved, unfrozen workflow. The issuer, workflow, order, seller, venue and quantity must match exactly. `issuedAt` may be at most 15 minutes old or 60 seconds ahead; delivery must be within the event's two-hour early/four-hour late window, not in the future, and no later than issuance plus clock skew. `(issuer,nonce)` is unique. An identical retry is idempotent; changed content using the same nonce is refused.

The decoded payload schema is `receipt.schema.json#/$defs/decodedPayload`. Sign its original UTF-8 bytes with Ed25519, then base64 both payload and signature. The command binds `SHA-256(payloadBase64String)` as `evidenceDigest`. Neither a schema-valid document nor a photo can replace the trusted signature.

**Private executor and PayPal notifications**

`POST /internal/payments/commands` and `GET /internal/payments/commands/{id}` exist only on the private executor. Requests need its service bearer credential; payment POSTs also require the proof metadata injected by AgentSafe. The public nginx ingress returns 404 for `/internal/` and `/_agentsafe/`. The application network has no direct route to the executor network.

The only public executor routes are `POST /paypal/webhooks/tents` and `POST /paypal/webhooks/catering`, rewritten to the matching private webhook handler. Those are enabled only for PayPal sandbox and require provider signature verification, the correct app/webhook configuration and a known merchant resource. They trigger reconciliation reads, not autonomous commands based on an unverified event body.

**MCP**

Connect a Streamable HTTP client to `http://localhost:5173/mcp` using `Authorization: Bearer <MCP_TOKEN from local configuration>`. Send `Accept: application/json, text/event-stream`, initialize the MCP session, and retain the returned session/protocol headers. The smoke client demonstrates protocol `2025-11-25` and parses SSE responses. Credentials bind to the server-configured organizer; tool arguments cannot select another owner.

| Tool | Arguments and effect |
| --- | --- |
| `search_offers` | `category`: `ALL`, `TENTS` or `CATERING`; returns fixture offers |
| `get_offer` | `offerId`; reads the allowlisted price/capacity |
| `propose_checkout` | `intent`, `tentOfferId`, `cateringOfferId`; prepares a draft without consent or spending |
| `get_workflow_status` | `workflowId`; reads owned state |
| `assess_plan` | `workflowId`; reads the existing sourcing and risk assessments |
| `get_payment_evidence` | `workflowId`; reads application audit events, not a hosted signature proof |
| `request_milestone_payment` | `workflowId`; same receipt/consent/budget/gateway checks as the REST workflow |

No tool records human plan consent, completes native PayPal approval, signs delivery evidence, overrides authority, runs arbitrary HTTP, or executes SQL.
