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
const plan=await create(150000),path=`/api/plans/${plan.id}`;
await request(`${path}/orders/${plan.lines[0].id}/checkout`,{method:'POST',expect:409});
await Promise.all(Array.from({length:6},()=>request(`${path}/approve`,{method:'POST',body:{version:1}})));
for(const line of plan.lines){
  const results=await Promise.all(Array.from({length:4},()=>request(`${path}/orders/${line.id}/checkout`,{method:'POST'})));
  const known=results.find(r=>r.result?.providerOrderId);
  assert.ok(known,'At least one checkout request confirms an order');
  await request(`${path}/orders/${line.id}/buyer-approved`,{method:'POST',body:{providerOrderId:'CHANGED-ORDER'},expect:409});
  const approved=await request(`${path}/orders/${line.id}/buyer-approved`,{method:'POST',body:{providerOrderId:known.result.providerOrderId}});
  assert.equal(approved.state,'SUCCEEDED');assert.ok(approved.dossierId);assert.match(approved.intentHash,/^sha256:[a-f0-9]{64}$/);
}
let flow=await request(path);assert.equal(flow.committedMinor,140000);assert.equal(flow.capturedMinor,50000);assert.equal(flow.orders.find(o=>o.category==='CATERING').status,'AUTHORIZED');
console.log('PASS: separate tent capture and catering authorization; one whole-budget reservation');
const photoForm=new FormData();photoForm.set('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'delivery.png');
const photo=await fetch(base+path+'/photo',{method:'POST',headers:{Cookie:cookie,'X-CSRF-TOKEN':csrf},body:photoForm});assert.equal(photo.status,200);
await request(path+'/milestone',{method:'POST',expect:409});assert.equal((await request(path)).capturedMinor,50000);
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
const env=Object.fromEntries(readFileSync(resolve(root,'.env'),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
let mcpSession='',protocol='2025-11-25';
async function mcp(payload){
  const r=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${env.MCP_TOKEN}`,...(mcpSession?{'Mcp-Session-Id':mcpSession,'MCP-Protocol-Version':protocol}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  assert.ok(r.status===200||r.status===202,`MCP response ${r.status}`);mcpSession=r.headers.get('mcp-session-id')??mcpSession;const text=await r.text();
  if(!text)return null;
  if(r.headers.get('content-type')?.includes('text/event-stream')) {
    const frames=text.split(/\r?\n\r?\n/).map(frame=>frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean).map(value=>JSON.parse(value));
    const response=frames.find(frame=>frame.id===payload.id);assert.ok(response,'MCP stream contains the requested response');return response;
  }
  return JSON.parse(text);
}
const initialized=await mcp({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:protocol,capabilities:{},clientInfo:{name:'swarm-pay-smoke',version:'1.0'}}});protocol=initialized.result.protocolVersion;
await mcp({jsonrpc:'2.0',method:'notifications/initialized'});
const listed=await mcp({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});assert.equal(listed.result.tools.length,7);
assert.equal(listed.result.tools.some(t=>t.name==='approve_plan'||t.name==='buyer_approve'),false);
const searched=await mcp({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_offers',arguments:{category:'ALL'}}});assert.equal(searched.result.isError??false,false);
assert.ok(searched.result.content.some(c=>c.text?.includes('Canopy Collective')));
const denied=await fetch(base+path+'/approve',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.MCP_TOKEN}`},body:'{"version":1}'});assert.equal(denied.status,403);
console.log('PASS: authenticated MCP initialize/list/call; agent token cannot record human consent');
mkdirSync(resolve(root,'.local'),{recursive:true});
writeFileSync(resolve(root,'.local/smoke-workflow.json'),JSON.stringify(flow,null,2));
writeFileSync(resolve(root,'.local/smoke-evidence.json'),JSON.stringify(evidence,null,2));
console.log(`PASS: local demo smoke complete (${plan.id}); no real provider was called`);
