// The spend dashboard's data: one row per payment step or agent request from the organizer's ledger, and
// one row per plan with its budget, as AG Studio data sources. Amounts are in dollars.
import type {AgDataSourcesDefinition,AgFieldDefinition,AgFormat,AgRelationDefinition} from 'ag-studio';
import {boundaryLabel,operationLabels,requesterLabels} from '../labels';
import {balanceStatus,decisionGroup,isHeld,paidSign,settled} from '../payment-state';
import type {LedgerEntry,PlanBalance} from '../types';

export type PaymentRow={id:string;planId:string;when:string;plan:string;merchant:string;category:string;step:string;askedBy:string;decision:string;
  amount:number;paid:number;refunded:number;heldRequest:number;outcome:string;providerStatus:string;dossier:string;reference:string};
export type PlanRow={id:string;plan:string;eventDate:string;budget:number;committed:number;paid:number;held:number;refunded:number;pending:number;refundPending:number;status:string};

const dollars=(minor:number)=>minor/100;

/** Paid counts completed captures less refunds; held is a catering authorization that is neither paid nor released. */
export function dashboardRows(entries:LedgerEntry[],plans:PlanBalance[]):{payments:PaymentRow[];plans:PlanRow[]} {
  const payments=entries.map(e=>({id:e.id,planId:e.workflowId,when:e.at.slice(0,10),plan:e.venue,merchant:e.merchantName,category:e.category==='TENTS'?'Tents':'Catering',
    step:operationLabels[e.operation]??e.operation,askedBy:requesterLabels[e.requestedBy]??e.requestedBy,decision:boundaryLabel(e.state),amount:dollars(e.amountMinor),
    paid:paidSign(e)*dollars(e.amountMinor),outcome:decisionGroup(e.state),providerStatus:e.providerStatus??'Not recorded',
    refunded:settled(e,'REFUND_CAPTURE')?dollars(e.amountMinor):0,heldRequest:e.requestedBy==='AGENT'&&isHeld(e.state)?1:0,
    dossier:e.dossierId??'',reference:e.refundId??e.captureId??e.authorizationId??e.providerOrderId??''}));
  const planRows=plans.map(p=>({id:p.id,plan:p.venue,eventDate:p.eventAt.slice(0,10),budget:dollars(p.budgetMinor),committed:dollars(p.committedMinor),
    paid:dollars(p.capturedMinor),held:dollars(p.authorizedMinor),refunded:dollars(p.refundedMinor),pending:dollars(p.pendingMinor),refundPending:dollars(p.refundPendingMinor),status:balanceStatus(p)}));
  return {payments,plans:planRows};
}

type FieldSpec=[id:string,name:string,format:AgFormat,hide?:boolean];
// Dollars and short dates, the way the rest of SwarmPay shows them.
const formatOptions:Partial<Record<string,object>>={currencyFormat:{format:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})},
  dateFormat:{format:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'})}};
const fields=(specs:FieldSpec[]):AgFieldDefinition[]=>specs.map(([id,name,format,hide])=>({id,name,format,...(formatOptions[format]&&{formatOptions:formatOptions[format]}),...(hide&&{hide})}));

export function studioData(rows:{payments:PaymentRow[];plans:PlanRow[]}):AgDataSourcesDefinition {
  const dates=[...rows.payments.map(r=>r.when),...rows.plans.map(r=>r.eventDate)].sort();
  const today=new Date().toISOString().slice(0,10);
  const relationships:AgRelationDefinition[]=[
    {id:'payment-plan',source:{tableId:'payments',fieldId:'planId'},target:{tableId:'plans',fieldId:'id'},type:'many-to-one'},
    {id:'payments-when-calendar',source:{tableId:'payments',fieldId:'when'},target:{calendarId:'calendar'}}];
  return {
    description:'SwarmPay payments for one event organizer. Each plan pays two merchants through PayPal: tents are paid at checkout, '+
      'catering is authorized and paid only after the venue signs a delivery receipt. AgentSafe decides every payment request; agents can ask but never pay. '+
      'Paid is completed captures less settled refunds. Allowed by AgentSafe does not mean PayPal settled. Held is a currently recorded catering authorization. '+
      'Plan balances cover all approved plans; payment rows are the recent 500 commands and 500 agent requests. Pending outcomes retain budget.',
    sources:[
      {id:'payments',name:'Payments',description:'One row per payment step or agent request. Sum Paid for money paid to merchants; Held Request counts agent requests AgentSafe held or blocked.',
        data:rows.payments,fields:fields([['id','Payment ID','textFormat',true],['planId','Plan ID','textFormat',true],['when','Date','dateFormat'],['plan','Plan','textFormat'],
          ['merchant','Merchant','textFormat'],['category','Category','textFormat'],['step','Step','textFormat'],['askedBy','Asked By','textFormat'],['decision','AgentSafe','textFormat'],
          ['amount','Amount','currencyFormat'],['paid','Paid','currencyFormat'],['refunded','Refunded','currencyFormat'],['heldRequest','Held Request','integerFormat'],
          ['outcome','Decision group','textFormat'],['providerStatus','Provider outcome','textFormat'],['dossier','Dossier','textFormat'],['reference','PayPal Reference','textFormat']])},
      {id:'plans',name:'Plans',description:'One row per approved plan: its budget, what was committed, paid, still held on delivery, and refunded.',
        data:rows.plans,fields:fields([['id','Plan ID','textFormat',true],['plan','Plan','textFormat'],['eventDate','Event Date','dateFormat'],['budget','Budget','currencyFormat'],
          ['committed','Committed','currencyFormat'],['paid','Paid to Merchants','currencyFormat'],['held','Held on Delivery','currencyFormat'],['refunded','Refunded','currencyFormat'],
          ['pending','Pending outcomes','currencyFormat'],['refundPending','Refund pending','currencyFormat'],['status','Status','textFormat']])},
    ],
    relationships,
    calendars:[{id:'calendar',label:'Calendar',range:{from:{type:'date',value:dates[0]??today},to:{type:'date',value:dates.at(-1)??today}},fragments:['month','week','day']}],
  };
}
