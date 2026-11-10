import type {Command,LedgerEntry,Order,PlanBalance,Workflow} from './types.ts';

const completed:Record<string,string>={CREATE_ORDER:'APPROVAL_REQUIRED',AUTHORIZE_ORDER:'AUTHORIZED',CAPTURE_ORDER:'CAPTURED',
  CAPTURE_AUTHORIZATION:'CAPTURED',VOID_AUTHORIZATION:'VOIDED',REAUTHORIZE_AUTHORIZATION:'AUTHORIZED',REFUND_CAPTURE:'REFUNDED'};
export const isHeld=(state:string)=>['ESCALATE','HELD','BLOCK','BLOCKED'].includes(state);
export const isUncertain=(state:string)=>['QUEUED','DISPATCHING','INDETERMINATE','EXECUTION_INDETERMINATE'].includes(state);
export const isRetryable=(state:string)=>['NOT_EXECUTED','AUTHORITY_UNAVAILABLE'].includes(state);
/** Authority permission and provider settlement are separate facts. Missing provider evidence never means paid. */
export const settled=(entry:LedgerEntry,...operations:string[])=>entry.state==='SUCCEEDED'&&operations.includes(entry.operation)&&entry.providerStatus===completed[entry.operation];
export const paidSign=(entry:LedgerEntry)=>settled(entry,'CAPTURE_ORDER','CAPTURE_AUTHORIZATION')?1:settled(entry,'REFUND_CAPTURE')?-1:0;
export const decisionGroup=(state:string)=>['HELD','ESCALATE'].includes(state)?'Held':['BLOCK','BLOCKED'].includes(state)?'Blocked':state==='SUCCEEDED'?'Allowed':isUncertain(state)?'Pending':'Not executed';
export type PaymentStatus={label:string;tone:'good'|'waiting'|'bad'|'pending'|'neutral'|'cancelled';refunded?:boolean};
export function orderStatus(order:Order,commands:Command[],approved:boolean):PaymentStatus {
  if(order.status==='REFUNDED')return {label:'Refunded',tone:'cancelled',refunded:true};
  if(order.status==='VOIDED')return {label:'Authorization voided',tone:'cancelled'};
  const last=commands.filter(c=>c.command.orderId===order.id).at(-1);
  const finished=last?.state==='SUCCEEDED'&&last.result?.result?.status===completed[last.command.operation];
  if(last&&!finished&&last.command.operation!=='CREATE_ORDER') {
    const verb=last.command.operation==='REFUND_CAPTURE'?'Refund':last.command.operation==='VOID_AUTHORIZATION'?'Void':'Payment';
    if(isHeld(last.state))return {label:`${verb} request held`,tone:'bad'};
    if(isRetryable(last.state))return {label:`${verb} not started`,tone:'pending'};
    if(isUncertain(last.state)||last.result?.result?.status==='PENDING')return {label:`${verb} pending${last.state.includes('INDETERMINATE')?' · outcome unknown':''}`,tone:'pending'};
  }
  const labels:Record<string,PaymentStatus>={CAPTURED:{label:'Paid',tone:'good'},AUTHORIZED:{label:'Authorized · awaiting delivery',tone:'waiting'},
    APPROVAL_REQUIRED:{label:'Awaiting PayPal approval',tone:'neutral'},PENDING:{label:'Payment pending',tone:'pending'},
    DECLINED:{label:'Declined',tone:'bad'},EXPIRED:{label:'Expired',tone:'bad'}};
  return labels[order.status]??{label:approved?'Ready to pay':'Pay after you approve',tone:'neutral'};
}
export function receiptNotice(flow:Workflow,commands:Command[]):string {
  if(!flow.receiptVerified)return 'Delivery confirmation was requested. Check the recorded receipt and payment status.';
  const catering=flow.orders.find(o=>o.category==='CATERING');
  if(catering?.status==='CAPTURED')return 'The venue receipt was verified and the catering payment is complete.';
  return `Venue receipt verified. ${catering?orderStatus(catering,commands,true).label:'Payment status is unavailable'}. Check the payment record for the next action.`;
}
export function balanceStatus(p:PlanBalance):string {
  if(p.cancellationRequested)return p.committedMinor===0?'Cancelled':'Cancellation pending';
  if(p.paymentFrozen)return 'Payments paused';
  if(p.refundPendingMinor>0)return 'Refund pending';
  if(p.pendingMinor>0)return 'Payment pending';
  if(p.capturedMinor===p.totalMinor)return 'Paid';
  if(p.orderStates.includes('EXPIRED'))return 'Authorization expired';
  if(p.orderStates.includes('DECLINED'))return 'Payment declined';
  if(p.orderStates.includes('VOIDED'))return 'Catering hold released';
  if(p.authorizedMinor>0)return 'Awaiting delivery';
  return 'Awaiting merchant approval';
}
/** The analyst sees the same settlement rule as the ledger, plus stable evidence references. */
export const analystEvidence=(entries:LedgerEntry[])=>entries.map(e=>({requestId:e.id,planId:e.workflowId,at:e.at,plan:e.venue,merchant:e.merchantName,
  operation:e.operation,askedBy:e.requestedBy,amountMinor:e.amountMinor,paidMinor:paidSign(e)*e.amountMinor,
  authorityState:e.state,providerStatus:e.providerStatus,message:e.message,dossier:e.dossierId,
  paypal:e.refundId??e.captureId??e.authorizationId??e.providerOrderId}));
