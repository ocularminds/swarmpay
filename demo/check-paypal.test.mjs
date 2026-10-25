import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPayPalSandbox,webhookEvents} from './check-paypal.mjs';

const env={PAYPAL_TENTS_CLIENT_ID:'fixture-client',PAYPAL_TENTS_CLIENT_SECRET:'private-fixture-secret',PAYPAL_TENTS_MERCHANT_ID:'TENTSELLER',PAYPAL_TENTS_WEBHOOK_ID:'HOOK1'};
const hook={id:'HOOK1',url:'https://swarm.example.com/paypal/webhooks/tents',event_types:webhookEvents.map(name=>({name}))};
const reply=(status,body)=>({status,json:async()=>body});

test('preflight only authenticates and reads sandbox webhooks, with no secrets in its report',async()=>{
  const requests=[];
  const report=await checkPayPalSandbox(env,{merchants:['tents'],fetchImpl:async(url,options)=>{
    requests.push({url,options});
    return url.endsWith('/token') ? reply(200,{access_token:'private-fixture-token',token_type:'Bearer'}) : reply(200,{webhooks:[hook]});
  }});
  assert.equal(report.configurationReady,true);
  assert.equal(report.paymentLifecycle,'NOT_TESTED'); assert.equal(report.merchantOwnership,'NOT_VERIFIED');
  assert.equal(report.paymentRequestsSent,0);
  assert.deepEqual(requests.map(r=>[r.options.method,r.url]),[
    ['POST','https://api-m.sandbox.paypal.com/v1/oauth2/token'],['GET','https://api-m.sandbox.paypal.com/v1/notifications/webhooks']]);
  for(const {options} of requests) {assert.equal(options.redirect,'error');assert.ok(options.signal);}
  const output=JSON.stringify(report);
  for(const value of [...Object.values(env),'private-fixture-token',hook.url]) assert.ok(!output.includes(value));
});

test('partial configuration checks available access without pretending payments are ready',async()=>{
  let calls=0;
  const report=await checkPayPalSandbox({...env,PAYPAL_TENTS_WEBHOOK_ID:''},{fetchImpl:async url=>{
    calls++; return url.endsWith('/token')?reply(200,{access_token:'token',token_type:'Bearer'}):reply(200,{webhooks:[]});
  }});
  assert.equal(calls,2);assert.equal(report.configurationReady,false);
  assert.equal(report.merchants[0].authentication,'VERIFIED');assert.equal(report.merchants[0].webhookCount,0);
  assert.equal(report.merchants[1].authentication,'NOT_CHECKED');
  assert.equal(report.merchants[1].missingFields.length,4);
});

test('a configured webhook ID must match the callback path and required events',async()=>{
  for(const changed of [
    {...hook,id:'OTHERHOOK'}, {...hook,url:'http://swarm.example.com/paypal/webhooks/tents'},
    {...hook,url:'https://swarm.example.com/paypal/webhooks/catering'}, {...hook,event_types:[{name:'PAYMENT.CAPTURE.COMPLETED'}]},
  ]) {
    const report=await checkPayPalSandbox(env,{merchants:['tents'],fetchImpl:async url=>url.endsWith('/token')?
      reply(200,{access_token:'token',token_type:'Bearer'}):reply(200,{webhooks:[changed]})});
    assert.equal(report.configurationReady,false);
  }
});

test('authentication errors and malformed OAuth responses cannot trigger a webhook request',async()=>{
  for(const response of [reply(401,{error:'invalid_client'}),reply(200,{}),reply(200,{access_token:'token',token_type:'unexpected'})]) {
    let calls=0;
    const report=await checkPayPalSandbox(env,{merchants:['tents'],fetchImpl:async()=>{calls++;return response;}});
    assert.equal(calls,1);assert.equal(report.configurationReady,false);
    assert.equal(report.merchants[0].webhooks,'NOT_CHECKED');
  }
});

test('network failures cannot echo credentials from a thrown error',async()=>{
  const report=await checkPayPalSandbox(env,{merchants:['tents'],fetchImpl:async()=>{throw new Error(env.PAYPAL_TENTS_CLIENT_SECRET);}});
  assert.equal(report.merchants[0].authentication,'UNAVAILABLE');
  assert.ok(!JSON.stringify(report).includes(env.PAYPAL_TENTS_CLIENT_SECRET));
});

test('the two-merchant gate rejects reuse of the same seller account',async()=>{
  const both={...env,...Object.fromEntries(Object.entries(env).map(([name,value])=>[name.replace('TENTS','CATERING'),value]))};
  const report=await checkPayPalSandbox(both,{fetchImpl:async url=>url.endsWith('/token')?
    reply(200,{access_token:'token',token_type:'Bearer'}):reply(200,{webhooks:[hook]})});
  assert.equal(report.distinctMerchants,false);assert.equal(report.configurationReady,false);
});
