import test from 'node:test';
import assert from 'node:assert/strict';
import {analystEvidence,balanceStatus,decisionGroup,orderStatus,paidSign,receiptNotice} from '../src/payment-state.ts';
import type {Command,LedgerEntry,Order,PlanBalance,Workflow} from '../src/types.ts';

const entry=(changes:Partial<LedgerEntry>={}):LedgerEntry=>({id:'capture',workflowId:'plan',at:'2026-11-10T10:00:00Z',settledAt:'2026-11-10T10:00:01Z',venue:'Pavilion',eventAt:'2026-11-10T11:00:00Z',
  merchantName:'Caterer',category:'CATERING',operation:'CAPTURE_AUTHORIZATION',requestedBy:'SWARMPAY',amountMinor:90000,state:'SUCCEEDED',execution:'FORWARDED',message:'Provider response',
  dossierId:'dossier-1',providerOrderId:'order',authorizationId:'auth',captureId:'capture',refundId:null,providerStatus:'CAPTURED',...changes});
const catering={id:'catering',category:'CATERING',status:'AUTHORIZED',amountMinor:90000} as Order;
const command=(state:string,operation='CAPTURE_AUTHORIZATION',providerStatus:string|null=null):Command=>({command:{id:'request-1',orderId:'catering',merchantId:'catering',amountMinor:90000,operation},state,
  result:{state,execution:state==='SUCCEEDED'?'FORWARDED':'INDETERMINATE',message:'Check outcome',decisionId:'decision',dossierId:'dossier',intentHash:null,intentId:null,
    result:providerStatus?{status:providerStatus,providerOrderId:'order',authorizationId:'auth',captureId:'capture',source:'FIXTURE'}:null}});

test('gateway permission with a pending capture or refund never changes settled paid totals',()=>{
  const capture=entry({providerStatus:'PENDING'}),refund=entry({id:'refund',operation:'REFUND_CAPTURE',providerStatus:'PENDING',refundId:'refund'});
  assert.equal(paidSign(capture),0);assert.equal(paidSign(refund),0);
  assert.equal(paidSign(entry()),1);assert.equal(paidSign({...refund,providerStatus:'REFUNDED'}),-1);
  assert.equal(paidSign(entry({providerStatus:null})),0,'missing settlement evidence does not imply paid');
});
test('an accepted receipt can still have an unknown, held or retryable payment outcome',()=>{
  const flow={receiptVerified:true,orders:[catering]} as Workflow;
  assert.match(receiptNotice(flow,[command('EXECUTION_INDETERMINATE')]),/outcome unknown/);
  assert.doesNotMatch(receiptNotice(flow,[command('EXECUTION_INDETERMINATE')]),/payment is complete|was paid/);
  assert.equal(orderStatus(catering,[command('HELD')],true).label,'Payment request held');
  assert.equal(orderStatus(catering,[command('AUTHORITY_UNAVAILABLE')],true).label,'Payment not started');
  assert.match(receiptNotice({...flow,orders:[{...catering,status:'CAPTURED'}]},[]),/payment is complete/);
});
test('a pending refund keeps the paid order distinct from a completed refund',()=>{
  const paid={...catering,status:'CAPTURED'};
  assert.equal(orderStatus(paid,[command('SUCCEEDED','REFUND_CAPTURE','PENDING')],true).label,'Refund pending');
  assert.equal(orderStatus({...paid,status:'REFUNDED'},[command('SUCCEEDED','REFUND_CAPTURE','REFUNDED')],true).label,'Refunded');
  const balance={cancellationRequested:true,committedMinor:140000,capturedMinor:50000} as PlanBalance;
  assert.equal(balanceStatus(balance),'Cancellation pending');
  assert.equal(balanceStatus({...balance,committedMinor:0,capturedMinor:0}),'Cancelled');
  assert.equal(balanceStatus({...balance,cancellationRequested:false,paymentFrozen:true}),'Payments paused');
});
test('the analyst receives correlated settlement evidence and unknown requests are not called held',()=>{
  const pending=entry({providerStatus:'PENDING'});
  const proof=analystEvidence([pending,entry({id:'settled'})]);
  assert.equal(proof[0].paidMinor,0);assert.equal(proof[1].paidMinor,90000);
  assert.equal(proof[0].requestId,pending.id);assert.equal(proof[0].planId,pending.workflowId);assert.equal(proof[0].dossier,pending.dossierId);
  assert.equal(proof[0].providerStatus,'PENDING');
  assert.equal(decisionGroup('EXECUTION_INDETERMINATE'),'Pending');assert.equal(decisionGroup('AUTHORITY_UNAVAILABLE'),'Not executed');
  assert.equal(decisionGroup('ESCALATE'),'Held');assert.equal(decisionGroup('BLOCK'),'Blocked');
});
