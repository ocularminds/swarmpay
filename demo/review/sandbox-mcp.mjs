// Opt-in proof client for an already approved, fictional workflow on the public sandbox.
// Does not create plans, grant consent, approve checkout, sign receipts, or mint tokens.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';

const [phase,workflowId]=process.argv.slice(2);
assert.ok(['hold','replay','revoked'].includes(phase),'Usage: node demo/review/sandbox-mcp.mjs hold|replay|revoked WORKFLOW_UUID');
assert.match(workflowId??'',/^[a-f\d-]{36}$/);
const base='https://swarm.decionis.com';
const tokenFile=resolve(process.env.SWARM_REVIEW_MCP_TOKEN_FILE??'.local/review-20261110/submission/mcp-token.private');
assert.equal(statSync(tokenFile).mode&0o077,0,'Token file must have owner-only permissions');
const bearer=readFileSync(tokenFile,'utf8').trim();assert.match(bearer,/^swp_[A-Za-z0-9_-]{43}$/);
const config=await (await fetch(base+'/api/config',{signal:AbortSignal.timeout(15000)})).json();
assert.equal(config.mode,'sandbox','This client must never run against real-money mode');
let session='',protocol='2025-11-25',id=0;
const exchange=[];
async function rpc(method,params={}) {
  const payload={jsonrpc:'2.0',...(method.startsWith('notifications/')?{}:{id:++id}),method,params};
  const response=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${bearer}`,...(session?{'Mcp-Session-Id':session,'MCP-Protocol-Version':protocol}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(phase==='revoked'){assert.equal(response.status,401);return {httpStatus:401};}
  assert.ok([200,202].includes(response.status),`MCP HTTP ${response.status}`);
  session=response.headers.get('mcp-session-id')??session;
  const body=await response.text();let reply=null;
  if(body){
    if(response.headers.get('content-type')?.includes('text/event-stream')){
      const messages=body.split(/\r?\n\r?\n/).map(f=>f.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n')).filter(Boolean).map(JSON.parse);
      reply=messages.find(m=>m.id===payload.id);assert.ok(reply,'Expected response in MCP stream');
    }else reply=JSON.parse(body);
  }
  if(reply?.result?.protocolVersion)protocol=reply.result.protocolVersion;
  exchange.push({request:payload,httpStatus:response.status,response:reply});return reply;
}
function value(reply){assert.equal(reply.result?.isError??false,false,'MCP tool must succeed');return JSON.parse(reply.result.content.find(c=>c.type==='text').text);}
async function call(name){return value(await rpc('tools/call',{name,arguments:{workflowId}}));}
const initialized=await rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'swarmpay-review-outside-agent',version:'2026-11-10'}});
const outputDir=resolve('docs/review/evidence/submission');mkdirSync(outputDir,{recursive:true});
const save=proof=>writeFileSync(outputDir+`/mcp-${phase}.json`,JSON.stringify(proof,null,2)+'\n');
if(phase==='revoked'){
  save({checkedAt:new Date().toISOString(),site:base,workflowId,httpStatus:initialized.httpStatus,revokedTokenRejected:true});
  console.log('PASS: revoked sandbox MCP token is refused with HTTP 401');
}else{
  await rpc('notifications/initialized');
  const listed=await rpc('tools/list');const names=listed.result.tools.map(t=>t.name).sort();assert.equal(names.length,7);assert.ok(!names.some(n=>/approve|consent/.test(n)));
  const before=await call('get_workflow_status');assert.equal(before.mode,'sandbox');assert.equal(before.plan.id,workflowId);
  assert.equal(before.plan.totalMinor,140000,'Only the prepared $1,400 rehearsal is permitted');
  const beforeCatering=before.orders.find(o=>o.category==='CATERING');assert.ok(beforeCatering);
  if(phase==='hold'){assert.equal(before.receiptVerified,false);assert.equal(beforeCatering.status,'AUTHORIZED');assert.equal(before.capturedMinor,50000);}
  else{assert.equal(before.receiptVerified,true);assert.equal(before.capturedMinor,140000);assert.equal(beforeCatering.status,'CAPTURED');}
  const approval=await fetch(`${base}/api/plans/${workflowId}/approve`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},body:'{"version":1}',signal:AbortSignal.timeout(15000)});
  assert.equal(approval.status,403,'An outside agent cannot grant human consent');
  const result=await call('request_milestone_payment');
  const after=await call('get_workflow_status');
  assert.equal(after.capturedMinor,before.capturedMinor,'Request must not add another capture');
  assert.deepEqual(after.orders.map(o=>o.captureId),before.orders.map(o=>o.captureId),'Capture identities must be unchanged');
  if(phase==='hold'){assert.equal(result.state,'ESCALATE');assert.equal(result.execution,'HELD');assert.equal(after.receiptVerified,false);}
  else{assert.equal(result.state,'SUCCEEDED');assert.equal(result.result?.status,'CAPTURED');assert.equal(result.result?.captureId,beforeCatering.captureId,'Replay must return the stored catering capture');}
  const summarize=f=>({capturedMinor:f.capturedMinor,receiptVerified:f.receiptVerified,committedMinor:f.committedMinor,
    orders:f.orders.map(o=>({id:o.id,category:o.category,status:o.status,amountMinor:o.amountMinor,providerOrderId:o.providerOrderId,authorizationId:o.authorizationId,captureId:o.captureId}))});
  const proof={checkedAt:new Date().toISOString(),site:base,mode:config.mode,authority:config.authority,workflowId,
    scope:'Real HTTP MCP client outside the browser, dedicated fictional recording buyer, PayPal sandbox test money. Public deployment; not proof that the review PR is deployed.',
    protocol,tools:names,humanConsentDenied:approval.status,request:{method:'tools/call',name:'request_milestone_payment',arguments:{workflowId}},
    result,before:summarize(before),after:summarize(after),captureIdsUnchanged:true};
  save(proof);
  const privateDir=resolve('.local/review-20261110/submission');mkdirSync(privateDir,{recursive:true});
  writeFileSync(privateDir+`/mcp-${phase}.private.json`,JSON.stringify({exchange,before,after},null,2),{mode:0o600});
  console.log(JSON.stringify({phase,workflowId,state:result.state,execution:result.execution,dossierId:result.dossierId,beforeMinor:before.capturedMinor,afterMinor:after.capturedMinor,humanConsentHttp:approval.status,captureIdsUnchanged:true},null,2));
}
