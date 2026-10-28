import assert from 'node:assert/strict';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { randomUUID,sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.SWARM_TEST_URL??'http://localhost:5173';
const config=await (await fetch(base+'/api/config')).json();
assert.equal(config.mode,'demo','Smoke test refuses any non-demo provider');
assert.equal(config.aiProvider,'demo','Use SWARM_AI_PROVIDER=demo for fixture tests; live inference is tested separately');
let cookie='',csrf='';
async function request(path,{method='GET',body,expect=200,headers={}}={}) {
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-TOKEN':csrf}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  for(const c of r.headers.getSetCookie()) if(c.startsWith('JSESSIONID=')) cookie=c.split(';')[0];
  const text=await r.text();const value=text?JSON.parse(text):null;
  assert.equal(r.status,expect,`${method} ${path}: ${JSON.stringify(value)}`);return value;
}
async function readSession(){const s=await request('/api/session');csrf=s.csrfToken;return s;}
assert.equal((await fetch(base+'/api/plans')).status,401);
assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
await readSession();await request('/api/demo-session',{method:'POST'});assert.equal((await readSession()).authenticated,true);
function intent(budgetMinor){return {request:'Smoke test: rainy meetup for 30 people, five tent rentals.',attendees:30,tents:5,budgetMinor,eventAt:new Date(Date.now()+3600000).toISOString(),timezone:'UTC',venue:'Smoke test pavilion',weather:'Rain',tentMode:'RENT'};}
const create=budgetMinor=>request('/api/plans',{method:'POST',body:{intent:intent(budgetMinor),tentOfferId:'tents-standard',cateringOfferId:'catering-seasonal'}});
const expensive=await create(130000);
await request(`/api/plans/${expensive.id}/approve`,{method:'POST',body:{version:1},expect:422});
assert.equal((await request(`/api/plans/${expensive.id}/commands`)).length,0);
console.log('PASS: above-budget approval creates no payment command');
const proposed=await request('/api/plans',{method:'POST',body:{intent:intent(150000)}});
assert.deepEqual(proposed.lines.map(l=>l.offerId),['tents-standard','catering-seasonal']);
assert.equal(proposed.assessments[0].role,'Sourcing');assert.match(proposed.assessments[0].summary,/^Chose /);
await request('/api/plans',{method:'POST',body:{intent:intent(150000),tentOfferId:'tents-standard'},expect:400});
console.log('PASS: the Sourcing Agent proposes the offer pair and the server builds the plan from its choice');
const plan=await create(150000),path=`/api/plans/${plan.id}`;
await request(`${path}/orders/${plan.lines[0].id}/checkout`,{method:'POST',expect:409});
await Promise.all(Array.from({length:6},()=>request(`${path}/approve`,{method:'POST',body:{version:1}})));
for(const line of plan.lines){
  const results=await Promise.all(Array.from({length:4},()=>request(`${path}/orders/${line.id}/checkout`,{method:'POST'})));
  assert.ok(results.every(r=>['QUEUED','SUCCEEDED'].includes(r.state)),`Unexpected checkout outcomes: ${JSON.stringify(results)}`);
  // The scheduled worker may claim the command before all four HTTP callers.
  // Observe that one command to completion; do not resubmit a payment request.
  let known;
  const deadline=Date.now()+20000;
  do {
    const checkouts=(await request(path+'/commands')).filter(c=>c.command.orderId===line.id&&c.command.operation==='CREATE_ORDER');
    assert.equal(checkouts.length,1,'Concurrent checkouts create exactly one command');
    const checkout=checkouts[0];
    if(checkout.result) {
      assert.equal(checkout.result.state,'SUCCEEDED',`Checkout failed: ${JSON.stringify(checkout.result)}`);
      known=checkout.result;break;
    }
    assert.ok(['QUEUED','DISPATCHING'].includes(checkout.state),`Unexpected command state: ${checkout.state}`);
    await new Promise(resolve=>setTimeout(resolve,100));
  } while(Date.now()<deadline);
  assert.ok(known?.result?.providerOrderId,'The single checkout command confirms an order before the deadline');
  await request(`${path}/orders/${line.id}/buyer-approved`,{method:'POST',body:{providerOrderId:'CHANGED-ORDER'},expect:409});
  const approved=await request(`${path}/orders/${line.id}/buyer-approved`,{method:'POST',body:{providerOrderId:known.result.providerOrderId}});
  assert.equal(approved.state,'SUCCEEDED');assert.ok(approved.dossierId);assert.match(approved.intentHash,/^sha256:[a-f0-9]{64}$/);
}
let flow=await request(path);assert.equal(flow.committedMinor,140000);assert.equal(flow.capturedMinor,50000);assert.equal(flow.orders.find(o=>o.category==='CATERING').status,'AUTHORIZED');
console.log('PASS: separate tent capture and catering authorization; one whole-budget reservation');
const photoForm=new FormData();photoForm.set('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'delivery.png');
const photo=await fetch(base+path+'/photo',{method:'POST',headers:{Cookie:cookie,'X-CSRF-TOKEN':csrf},body:photoForm});assert.equal(photo.status,200);
await request(path+'/milestone',{method:'POST',expect:409});assert.equal((await request(path)).capturedMinor,50000);
// The agent asks for the catering payment before delivery: AgentSafe decides, and nothing is queued.
const early=await request(path+'/agent-milestone',{method:'POST'});
assert.equal(early.state,'ESCALATE');assert.equal(early.execution,'HELD');assert.ok(early.dossierId);assert.equal(early.result,null);
flow=await request(path);assert.equal(flow.capturedMinor,50000);assert.equal(flow.agentRequests.length,1);assert.equal(flow.agentRequests[0].result.dossierId,early.dossierId);
assert.equal((await request(path+'/commands')).length,4);
console.log('PASS: AgentSafe holds an agent\'s early payment request; no payment command is queued');
const catering=plan.lines.find(l=>l.category==='CATERING'),now=new Date().toISOString();
const data={issuer:'demo-venue-fixture',workflowId:plan.id,orderId:catering.id,merchantId:'catering',venue:plan.intent.venue,quantity:30,deliveredAt:now,issuedAt:now,nonce:randomUUID()};
const bytes=Buffer.from(JSON.stringify(data));const key=readFileSync(resolve(root,'.secrets/venue-private.pem'));
const signed={payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')};
await request(path+'/receipt',{method:'POST',body:{...signed,payload:Buffer.from(JSON.stringify({...data,merchantId:'attacker'})).toString('base64')},expect:409});
assert.equal((await request(path)).capturedMinor,50000);
console.log('PASS: photo-only and altered receipt cannot release catering');
await request(path+'/receipt',{method:'POST',body:signed});
await Promise.all(Array.from({length:6},()=>request(path+'/receipt',{method:'POST',body:signed})));
await Promise.all(Array.from({length:6},()=>request(path+'/milestone',{method:'POST'})));
flow=await request(path);assert.equal(flow.capturedMinor,140000);assert.equal(flow.committedMinor,140000);
assert.equal(flow.orders.filter(o=>o.status==='CAPTURED').length,2);
const commands=await request(path+'/commands');assert.equal(commands.length,5);assert.equal(commands.filter(c=>c.command.operation==='CAPTURE_AUTHORIZATION').length,1);
const evidence=await request(path+'/evidence');assert.equal(evidence.applicationChainVerified,true);
await request(`/api/commands/${commands[0].command.id}/reconcile`,{method:'POST'});assert.equal((await request(path)).capturedMinor,140000);
console.log('PASS: duplicate receipt and worker requests produce one milestone capture; late reconciliation cannot rewind it');
const disputed=await create(150000),disputedPath=`/api/plans/${disputed.id}`;
await request(disputedPath+'/approve',{method:'POST',body:{version:1}});
const disputedLine=disputed.lines.find(line=>line.category==='CATERING');
const disputedCheckout=await request(`${disputedPath}/orders/${disputedLine.id}/checkout`,{method:'POST'});
await request(`${disputedPath}/orders/${disputedLine.id}/buyer-approved`,{method:'POST',body:{providerOrderId:disputedCheckout.result.providerOrderId}});
await request(disputedPath+'/freeze',{method:'POST'});
await request(disputedPath+'/milestone',{method:'POST',expect:409});
const voided=await request(disputedPath+'/void',{method:'POST'});assert.equal(voided.result.status,'VOIDED');
const disputedFlow=await request(disputedPath);assert.equal(disputedFlow.capturedMinor,0);assert.equal(disputedFlow.paymentFrozen,true);
assert.equal((await request(disputedPath+'/commands')).length,3);
console.log('PASS: a dispute freeze prevents capture while a fresh gated void cancels the existing authorization');
// A plan whose catering is authorized and awaiting delivery, for the agent and venue checks below.
const awaiting=await create(150000),awaitingPath=`/api/plans/${awaiting.id}`;
await request(awaitingPath+'/approve',{method:'POST',body:{version:1}});
const awaitingLine=awaiting.lines.find(line=>line.category==='CATERING');
const awaitingCheckout=await request(`${awaitingPath}/orders/${awaitingLine.id}/checkout`,{method:'POST'});
await request(`${awaitingPath}/orders/${awaitingLine.id}/buyer-approved`,{method:'POST',body:{providerOrderId:awaitingCheckout.result.providerOrderId}});
const env=Object.fromEntries(readFileSync(resolve(root,'.env'),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
// One MCP session per bearer: the operator's token, or an organizer's own agent token.
function mcpClient(bearer){
let mcpSession='',protocol='2025-11-25';
// Later requests carry the protocol version the server agreed in its initialize reply.
const agreed=value=>{if(value?.result?.protocolVersion)protocol=value.result.protocolVersion;return value;};
return async function mcp(payload){
  const r=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${bearer}`,...(mcpSession?{'Mcp-Session-Id':mcpSession,'MCP-Protocol-Version':protocol}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  assert.ok(r.status===200||r.status===202,`MCP response ${r.status}`);mcpSession=r.headers.get('mcp-session-id')??mcpSession;const text=await r.text();
  if(!text)return null;
  if(r.headers.get('content-type')?.includes('text/event-stream')) {
    const frames=text.split(/\r?\n\r?\n/).map(frame=>frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean).map(value=>JSON.parse(value));
    const response=frames.find(frame=>frame.id===payload.id);assert.ok(response,'MCP stream contains the requested response');return agreed(response);
  }
  return agreed(JSON.parse(text));
};
}
const mcp=mcpClient(env.MCP_TOKEN);
const initialized=await mcp({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'swarm-pay-smoke',version:'1.0'}}});
await mcp({jsonrpc:'2.0',method:'notifications/initialized'});
const listed=await mcp({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});assert.equal(listed.result.tools.length,7);
assert.equal(listed.result.tools.some(t=>t.name==='approve_plan'||t.name==='buyer_approve'),false);
const searched=await mcp({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_offers',arguments:{category:'ALL'}}});assert.equal(searched.result.isError??false,false);
assert.ok(searched.result.content.some(c=>c.text?.includes('Canopy Collective')));
const denied=await fetch(base+path+'/approve',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.MCP_TOKEN}`},body:'{"version":1}'});assert.equal(denied.status,403);
console.log('PASS: authenticated MCP initialize/list/call; agent token cannot record human consent');
const asked=await mcp({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'request_milestone_payment',arguments:{workflowId:awaiting.id}}});
assert.equal(asked.result.isError??false,false);assert.match(asked.result.content[0].text,/"state":"ESCALATE"/);
assert.equal((await request(awaitingPath)).capturedMinor,0);
console.log('PASS: the MCP milestone tool reaches AgentSafe, which holds a request without a delivery receipt');
// An organizer's own agent token acts for that organizer, is shown once, and stops working when revoked.
const issued=await request('/api/agent-tokens',{method:'POST',body:{label:'Smoke agent'}});
assert.match(issued.token,/^swp_[A-Za-z0-9_-]{43}$/);
const grants=await request('/api/agent-tokens');assert.ok(grants.some(g=>g.id===issued.grant.id)&&grants.every(g=>!('token' in g)));
const own=mcpClient(issued.token);
await own({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'swarm-pay-smoke-own-agent',version:'1.0'}}});
await own({jsonrpc:'2.0',method:'notifications/initialized'});
const ownStatus=await own({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_workflow_status',arguments:{workflowId:awaiting.id}}});
assert.equal(ownStatus.result.isError??false,false,JSON.stringify(ownStatus.result));assert.ok(ownStatus.result.content[0].text.includes(awaiting.id));
const minted=await fetch(base+'/api/agent-tokens',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${issued.token}`},body:'{}'});assert.ok([401,403].includes(minted.status),`an agent token cannot mint another (${minted.status})`);
await request(`/api/agent-tokens/${issued.grant.id}`,{method:'DELETE',expect:204});
const revoked=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${issued.token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'revoked',version:'1.0'}}})});
assert.equal(revoked.status,401);
console.log('PASS: an organizer\'s own agent token reads their plan over MCP, cannot mint another, and is refused once revoked');
const venue=(headers={})=>fetch(base+'/venue/deliveries',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-TOKEN':csrf,...headers},body:JSON.stringify({workflowId:awaiting.id}),signal:AbortSignal.timeout(30000)});
// Without the organizer's session, the application refuses (its CSRF check answers first) and nothing is signed.
assert.ok([401,403].includes((await venue({Cookie:''})).status));
assert.equal((await venue({'Sec-Fetch-Site':'cross-site'})).status,403);
assert.equal((await venue({'X-CSRF-TOKEN':'forged'})).status,403);
assert.equal((await request(awaitingPath)).receiptVerified,false);
const confirmed=await venue();assert.equal(confirmed.status,200,await confirmed.clone().text());
const delivered=await request(awaitingPath);assert.equal(delivered.receiptVerified,true);assert.equal(delivered.capturedMinor,90000);
assert.ok(delivered.events.some(e=>e.type==='VENUE_CONFIRMATION_REQUESTED'));
console.log('PASS: only the signed-in organizer can ask the separate venue to sign a receipt, which releases the catering capture');
mkdirSync(resolve(root,'.local'),{recursive:true});
writeFileSync(resolve(root,'.local/smoke-workflow.json'),JSON.stringify(flow,null,2));
writeFileSync(resolve(root,'.local/smoke-evidence.json'),JSON.stringify(evidence,null,2));
console.log(`PASS: local demo smoke complete (${plan.id}); no real provider was called`);
