// The spend dashboard's data: one row per payment step or agent request from the organizer's ledger, and
// one row per plan with its budget, as AG Studio data sources. Amounts are in dollars.
import type {AgDataSourcesDefinition,AgFieldDefinition,AgFormat,AgRelationDefinition} from 'ag-studio';
import {boundaryLabel,operationLabels,requesterLabels} from '../labels';
import type {LedgerEntry,Plan} from '../types';

export type PaymentRow={id:string;planId:string;when:string;plan:string;merchant:string;category:string;step:string;askedBy:string;decision:string;
  amount:number;paid:number;refunded:number;heldRequest:number;dossier:string;reference:string};
export type PlanRow={id:string;plan:string;eventDate:string;budget:number;committed:number;paid:number;held:number;refunded:number;status:string};

const dollars=(minor:number)=>minor/100;
const succeeded=(e:LedgerEntry,...operations:string[])=>e.state==='SUCCEEDED'&&operations.includes(e.operation);

/** Paid counts completed captures less refunds; held is a catering authorization that is neither paid nor released. */
export function dashboardRows(entries:LedgerEntry[],plans:Plan[]):{payments:PaymentRow[];plans:PlanRow[]} {
  const payments=entries.map(e=>({id:e.id,planId:e.workflowId,when:e.at.slice(0,10),plan:e.venue,merchant:e.merchantName,category:e.category==='TENTS'?'Tents':'Catering',
    step:operationLabels[e.operation]??e.operation,askedBy:requesterLabels[e.requestedBy]??e.requestedBy,decision:boundaryLabel(e.state),amount:dollars(e.amountMinor),
    paid:succeeded(e,'CAPTURE_ORDER','CAPTURE_AUTHORIZATION')?dollars(e.amountMinor):succeeded(e,'REFUND_CAPTURE')?-dollars(e.amountMinor):0,
    refunded:succeeded(e,'REFUND_CAPTURE')?dollars(e.amountMinor):0,heldRequest:e.requestedBy==='AGENT'&&e.state!=='SUCCEEDED'?1:0,
    dossier:e.dossierId??'',reference:e.refundId??e.captureId??e.authorizationId??e.providerOrderId??''}));
  const planRows=plans.filter(p=>p.status==='APPROVED').map(p=>{
    const mine=entries.filter(e=>e.workflowId===p.id);
    const paid=mine.reduce((sum,e)=>sum+(succeeded(e,'CAPTURE_ORDER','CAPTURE_AUTHORIZATION')?e.amountMinor:succeeded(e,'REFUND_CAPTURE')?-e.amountMinor:0),0);
    const authorized=mine.find(e=>succeeded(e,'AUTHORIZE_ORDER'));
    const settled=mine.some(e=>succeeded(e,'CAPTURE_AUTHORIZATION','VOID_AUTHORIZATION'));
    const cancelled=mine.some(e=>succeeded(e,'REFUND_CAPTURE','VOID_AUTHORIZATION'));
    const refunded=mine.filter(e=>succeeded(e,'REFUND_CAPTURE')).reduce((sum,e)=>sum+e.amountMinor,0);
    return {id:p.id,plan:p.intent.venue,eventDate:p.intent.eventAt.slice(0,10),budget:dollars(p.intent.budgetMinor),committed:cancelled?0:dollars(p.totalMinor),
      paid:dollars(paid),held:authorized&&!settled?dollars(authorized.amountMinor):0,refunded:dollars(refunded),
      status:cancelled?'Cancelled':paid===p.totalMinor?'Paid':authorized?'Paying on delivery':'Approved'};
  });
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
      'Paid is completed captures less refunds. Held is a catering authorization not yet paid or released.',
    sources:[
      {id:'payments',name:'Payments',description:'One row per payment step or agent request. Sum Paid for money paid to merchants; Held Request counts agent requests AgentSafe held or blocked.',
        data:rows.payments,fields:fields([['id','Payment ID','textFormat',true],['planId','Plan ID','textFormat',true],['when','Date','dateFormat'],['plan','Plan','textFormat'],
          ['merchant','Merchant','textFormat'],['category','Category','textFormat'],['step','Step','textFormat'],['askedBy','Asked By','textFormat'],['decision','AgentSafe','textFormat'],
          ['amount','Amount','currencyFormat'],['paid','Paid','currencyFormat'],['refunded','Refunded','currencyFormat'],['heldRequest','Held Request','integerFormat'],
          ['dossier','Dossier','textFormat'],['reference','PayPal Reference','textFormat']])},
      {id:'plans',name:'Plans',description:'One row per approved plan: its budget, what was committed, paid, still held on delivery, and refunded.',
        data:rows.plans,fields:fields([['id','Plan ID','textFormat',true],['plan','Plan','textFormat'],['eventDate','Event Date','dateFormat'],['budget','Budget','currencyFormat'],
          ['committed','Committed','currencyFormat'],['paid','Paid to Merchants','currencyFormat'],['held','Held on Delivery','currencyFormat'],['refunded','Refunded','currencyFormat'],['status','Status','textFormat']])},
    ],
    relationships,
    calendars:[{id:'calendar',label:'Calendar',range:{from:{type:'date',value:dates[0]??today},to:{type:'date',value:dates.at(-1)??today}},fragments:['month','week','day']}],
  };
}
