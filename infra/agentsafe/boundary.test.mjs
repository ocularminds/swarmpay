import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Gateway,GatewayConfigLoader,GatewayHttpServer } from '@decionis/agentsafe';
import { LocalAuthority,LOCAL_AUTHORITY_API_KEY } from '@decionis/agent-safe-pipeline/testing';
import { commerceDemoPolicy } from './demo-policy.mjs';

test('real AgentSafe gateway claims one grant, overwrites spoofed proof headers, and stops unsafe requests',async()=>{
  const forwarded=[];
  const upstream=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;forwarded.push({headers:req.headers,body});res.writeHead(200,{'Content-Type':'application/json'});res.end('{"simulated":true}');});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const authority=new LocalAuthority({policy:commerceDemoPolicy});await authority.start();
  const config=GatewayConfigLoader.load({version:'0.2.5',env:{NODE_ENV:'test'},file:{version:1,
    gateway:{upstream:`http://127.0.0.1:${upstream.address().port}`,system:'paypal',environment:'demo'},
    authority:{endpoint:'local',mode:'enforcement',failurePolicy:'failClosed',timeoutMs:1000},
    interception:{routes:[{path:'/internal/payments/**',action:'payment.execute',methods:['POST']}],unmatched:'govern'},
    evidence:{enabled:false},output:{format:'json'}}});
  const gateway=await Gateway.create(config,{io:{stdout:()=>{},stderr:()=>{},color:false},demoAuthority:async()=>({baseUrl:authority.baseUrl,apiKey:LOCAL_AUTHORITY_API_KEY,stop:()=>authority.stop()})});
  const server=new GatewayHttpServer(gateway);const address=await server.listen(0,'127.0.0.1');
  const url=`http://127.0.0.1:${address.port}/internal/payments/commands`;
  const workflowId=randomUUID();
  const c={id:randomUUID(),workflowId,orderId:randomUUID(),merchantId:'catering',amountMinor:90000,currency:'USD',operation:'AUTHORIZE_ORDER',reservationId:workflowId,planVersion:1,policyVersion:'swarm-pay-demo-v1'};
  const post=body=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-agent-safe-intent-hash':'forged','x-agent-safe-dossier-id':'forged'},body:JSON.stringify(body)});
  try {
    let result=await post(c);await result.text();assert.equal(result.status,200);assert.equal(result.headers.get('agentsafe-execution'),'FORWARDED');
    assert.equal(forwarded.length,1);assert.match(forwarded[0].headers['x-agent-safe-intent-hash'],/^sha256:[0-9a-f]{64}$/);
    assert.notEqual(forwarded[0].headers['x-agent-safe-dossier-id'],'forged');assert.deepEqual(JSON.parse(forwarded[0].body),c);
    assert.equal([...authority.grants.values()].filter(g=>g.claimed).length,1);
    result=await post({...c,id:randomUUID(),amountMinor:160000});await result.text();assert.equal(result.status,403);assert.equal(forwarded.length,1);
    result=await post({...c,id:randomUUID(),operation:'CAPTURE_AUTHORIZATION'});await result.text();assert.equal(result.status,202);assert.equal(forwarded.length,1);
    await authority.stop();
    result=await post({...c,id:randomUUID()});const failure=await result.json();assert.equal(result.status,503);assert.equal(failure.state,'AUTHORITY_UNAVAILABLE');assert.equal(forwarded.length,1);
  } finally {await server.close();await gateway.close();await new Promise(resolve=>upstream.close(resolve));}
});

test('a payment the executor reports as not taken is relayed, and the same command is decided and forwarded again',async()=>{
  const forwarded=[];let decline=true;
  const upstream=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;forwarded.push(body);
    if(decline){decline=false;res.writeHead(422,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'BUYER_ACTION_REQUIRED',state:'BUYER_ACTION_REQUIRED',execution:'NOT_FORWARDED',message:'Choose another way to pay.'}));return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"status":"CAPTURED"}');});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const authority=new LocalAuthority({policy:commerceDemoPolicy});await authority.start();
  const config=GatewayConfigLoader.load({version:'0.2.5',env:{NODE_ENV:'test'},file:{version:1,
    gateway:{upstream:`http://127.0.0.1:${upstream.address().port}`,system:'paypal',environment:'demo'},
    authority:{endpoint:'local',mode:'enforcement',failurePolicy:'failClosed',timeoutMs:1000},
    interception:{routes:[{path:'/internal/payments/**',action:'payment.execute',methods:['POST']}],unmatched:'govern'},
    evidence:{enabled:false},output:{format:'json'}}});
  const gateway=await Gateway.create(config,{io:{stdout:()=>{},stderr:()=>{},color:false},demoAuthority:async()=>({baseUrl:authority.baseUrl,apiKey:LOCAL_AUTHORITY_API_KEY,stop:()=>authority.stop()})});
  const server=new GatewayHttpServer(gateway);const address=await server.listen(0,'127.0.0.1');
  const workflowId=randomUUID();
  const c={id:randomUUID(),workflowId,orderId:randomUUID(),merchantId:'tents',amountMinor:50000,currency:'USD',operation:'CAPTURE_ORDER',providerResourceId:'ORDER-1',reservationId:workflowId,planVersion:1,policyVersion:'swarm-pay-demo-v1'};
  const post=()=>fetch(`http://127.0.0.1:${address.port}/internal/payments/commands`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});
  try {
    let result=await post();const declined=await result.json();
    assert.equal(result.status,422);assert.equal(declined.state,'BUYER_ACTION_REQUIRED');assert.equal(declined.execution,'NOT_FORWARDED');
    assert.notEqual(result.headers.get('agentsafe-execution'),'FORWARDED');
    result=await post();await result.text();
    assert.equal(result.status,200);assert.equal(result.headers.get('agentsafe-execution'),'FORWARDED');
    assert.equal(forwarded.length,2);assert.deepEqual(forwarded.map(body=>JSON.parse(body)),[c,c]);
    assert.equal([...authority.grants.values()].filter(g=>g.claimed).length,2,'each dispatch claims its own fresh grant');
  } finally {await server.close();await gateway.close();await new Promise(resolve=>upstream.close(resolve));}
});
