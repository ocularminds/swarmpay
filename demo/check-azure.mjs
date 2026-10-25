import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Explicit live AI check: three bounded model calls through the actual Java
// application. It creates a draft plan and never approves or checks out orders.
const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.SWARM_TEST_URL??'http://localhost:5173';
const config=await(await fetch(base+'/api/config')).json();
assert.equal(config.mode,'demo','Use simulated payments for the AI connectivity check');
assert.equal(config.aiProvider,'azure','Select SWARM_AI_PROVIDER=azure first');
let cookie='',csrf='';
async function request(path,body) {
  const method=body===undefined?'GET':'POST';
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,...(method==='POST'?{'Content-Type':'application/json','X-CSRF-TOKEN':csrf}:{})},
    body:method==='POST'?JSON.stringify(body):undefined,signal:AbortSignal.timeout(150000)});
  for(const c of r.headers.getSetCookie())if(c.startsWith('JSESSIONID='))cookie=c.split(';')[0];
  const result=await r.json();
  assert.equal(r.status,200,`${path}: HTTP ${r.status}; ${result.code??'unexpected response'}; ${result.message??''}`);return result;
}
csrf=(await request('/api/session')).csrfToken;
await request('/api/demo-session',{});csrf=(await request('/api/session')).csrfToken;
const started=Date.now();
const text='I am hosting a rainy outdoor technology meetup for 30 people at the Azure test pavilion. I need five tent rentals and catering with a total budget of $1,500.';
const suggestion=await request('/api/intent',{request:text,timezone:'UTC'});
assert.equal(suggestion.attendees,30);assert.equal(suggestion.tents,5);assert.equal(suggestion.budgetMinor,150000);
assert.match(suggestion.source,/^Azure OpenAI/);
console.log('PASS: Azure GPT-6 Astra returned a typed intent through the Java Responses adapter');
const intent={request:text,attendees:30,tents:5,budgetMinor:150000,eventAt:new Date(Date.now()+3600000).toISOString(),timezone:'UTC',venue:'Azure test pavilion',weather:'Rain',tentMode:'RENT'};
const plan=await request('/api/plans',{intent,tentOfferId:'tents-standard',cateringOfferId:'catering-seasonal'});
assert.equal(plan.status,'DRAFT');assert.equal(plan.totalMinor,140000);assert.equal(plan.assessments.length,2);
for(const assessment of plan.assessments){assert.match(assessment.source,/^Azure OpenAI/);assert.ok(assessment.summary.length>0);}
const workflow=await request(`/api/plans/${plan.id}`),commands=await request(`/api/plans/${plan.id}/commands`);
assert.equal(workflow.committedMinor,0);assert.equal(workflow.capturedMinor,0);assert.equal(commands.length,0);
const report={at:new Date().toISOString(),provider:'azure',model:config.model,workflowId:plan.id,
  typedIntentVerified:true,sourcingAndRiskVerified:true,planTotalMinor:140000,paymentCommands:0,elapsedMs:Date.now()-started};
mkdirSync(resolve(root,'.local'),{recursive:true});writeFileSync(resolve(root,'.local/azure-integration.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: both Azure agent roles assessed the reviewed catalog; draft ${plan.id} has no payment commands (${report.elapsedMs} ms)`);
