// The dashboard's agents, on AG Studio's Studio Agent Framework. AG's five built-in agents build and edit the
// dashboard; SwarmPay adds an AgentSafe analyst that the lead can hand a "why" question to. It reads SwarmPay's
// payment rules and the organizer's ledger, and has no tool that can pay, refund or change anything.
import {createAiHarness,directLlmRunner,type AgAiHarnessSetup,type AgAiPromptStarter,type AgAiTool} from 'ag-studio';
import {openaiAdapter} from './openaiAdapter';
import {analystEvidence} from '../payment-state';
import type {LedgerEntry} from '../types';

const RULES=`SwarmPay's payment rules, as the application enforces them:
- The organizer approves one exact plan, then separately approves each merchant in PayPal; the whole plan total is reserved against the budget. Agents never approve a plan and hold no payment credentials.
- Tents are paid at checkout (PayPal Orders v2, CAPTURE intent). Catering is authorized at checkout (AUTHORIZE intent): the money is held, not taken.
- Catering is captured only after the venue signs a delivery receipt that matches the event, merchant, quantity and delivery window. A photo alone never releases it, and replaying a receipt cannot pay twice.
- Every payment command passes AgentSafe, a fail-closed gateway, before a private executor that alone holds the merchants' PayPal credentials and rechecks consent, the reserved budget and the receipt.
- An agent can ask to pay catering early. Without a verified receipt AgentSafe holds (ESCALATE) or blocks the request, and nothing is paid.
- PayPal guarantees an authorization's funds for 3 days (the honor period) and keeps it for 29. When delivery is later, SwarmPay reauthorizes the hold once, after the honor period and within 3 days of the event, and pays the caterer from the renewed authorization. No money moves when a hold is renewed.
- Cancellation before the event starts, while catering is unpaid, freezes further payments and requests a catering void and full tents refund through AgentSafe. Dispatched requests must still be reconciled. The reservation remains until no paid, authorized or uncertain exposure remains. Completed catering requires a merchant resolution.
- SUCCEEDED is an authority/gateway result, not proof of settled money. A capture is paid only with providerStatus CAPTURED; a refund reduces paid only with providerStatus REFUNDED. PENDING and outcome-unknown are never counted as paid or refunded.
- This tool returns recent ledger records (up to 500 commands and 500 agent requests); plan balance data covers all approved plans. Do not infer all-time totals from a truncated ledger. A signed venue receipt authenticates the issuer statement; it does not prove physical delivery.`;

const STARTERS:AgAiPromptStarter[]=[
  {label:'What did I pay?',prompt:'How much have I paid each merchant, and how much is still held until delivery?'},
  {label:'Why was it held?',prompt:'Why did AgentSafe hold the agent\'s request to pay catering?'},
  {label:'Add a chart',prompt:'Add a chart of what I paid by merchant and plan.'},
];

/** `headers` adds the session's CSRF token to each request; `entries` reads the ledger as the dashboard has it now. */
export function buildAi(headers:()=>Record<string,string>,entries:()=>LedgerEntry[]):AgAiHarnessSetup {
  // The server fixes the deployment; the model named here is only the adapter's label for it.
  const adapter=openaiAdapter({endpoint:'/api/ai',model:'swarmpay-dashboard',headers});
  return ({api})=>createAiHarness(api,({tools,builtIn})=>{
    const rules=api.defineAiTool({name:'swarmpay_payment_rules',description:'The payment rules SwarmPay enforces: terms per merchant, AgentSafe, delivery receipts, PayPal holds and renewals, cancellation.',
      params:s=>s.object({}),execute:(_args,ctx)=>ctx.success(RULES)});
    const decisions=api.defineAiTool({name:'agentsafe_decisions',description:'Every payment step and agent request in the organizer\'s ledger, with AgentSafe\'s decision, the dossier and the PayPal reference.',
      params:s=>s.object({}),execute:(_args,ctx)=>ctx.success(JSON.stringify(analystEvidence(entries())))});
    const analyst=directLlmRunner({id:'agentsafe-analyst',name:'AgentSafe analyst',
      description:'Explains why SwarmPay allowed, held, refunded or renewed a payment, from SwarmPay\'s payment rules and the ledger\'s AgentSafe decisions. Hand it any "why" question about a payment. It cannot pay or change anything.',
      adapter,maxTurns:6,
      instructions:()=>'You are the AgentSafe analyst in SwarmPay\'s spend dashboard. Answer in plain language, in a few sentences, why a payment was allowed, held, refunded or renewed. '+
        'Call swarmpay_payment_rules and agentsafe_decisions first, and cite the request ID plus dossier ID or PayPal reference you rely on. Distinguish plans by planId even if they share a venue. Never claim a payment happened without a settled CAPTURED provider status; PENDING is not paid. Never call an authorization a payment or call authorize-then-capture escrow. You cannot move money.',
      tools:()=>[rules,decisions]});
    const lead=builtIn.lead as never as {tools?:(ctx:unknown,params:unknown)=>AgAiTool[]};
    const others=(['planning','data','page','widget'] as const).map(id=>directLlmRunner({...(builtIn[id] as never as object),adapter} as never));
    return {
      agents:[directLlmRunner({...(builtIn.lead as never as object),adapter,
        // The lead keeps its own tools and can now also hand work to the AgentSafe analyst.
        tools:(ctx:unknown,params:unknown)=>[...(lead.tools?.(ctx,params)??[]).filter(t=>t.name!=='delegate_to'),tools.delegateTo(['planning','data','page','widget','agentsafe-analyst'])]} as never),
        ...others,analyst],
      primary:'lead',promptStarters:STARTERS,
    };
  });
}
