import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fixtureSession} from './session.mjs';
import {sourceEvidence} from './source-evidence.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base=process.env.SWARM_TEST_URL??'https://localhost:5443';
const env=resolve(root,process.env.SWARM_TEST_ENV??'.local/hosted/.env');
const liveAi=process.argv.includes('--live-ai');
const {config,request}=await fixtureSession(base,env,{liveAi});
if(liveAi)assert.equal(config.aiProvider,'azure','The explicit live evaluation expects Azure OpenAI');
const bytes=readFileSync(new URL('./planning-cases.json',import.meta.url));
const cases=JSON.parse(bytes),results=[];
for(const scenario of cases) {
  if(scenario.tentMode==='BUY'&&!config.tentPurchases) {
    results.push({id:scenario.id,status:'blocked',prerequisite:'Channel3 is not configured in this fixture; run the explicit live-AI/listing evaluation with the provided catalog key.'});continue;
  }
  const started=Date.now();
  const typed=await request('/api/intent',{method:'POST',body:{request:scenario.request,timezone:'Europe/Stockholm'}});
  assert.equal(typed.attendees,scenario.attendees);assert.equal(typed.tents,scenario.tents);assert.equal(typed.budgetMinor,scenario.budgetMinor);
  const intent={request:scenario.request,attendees:scenario.attendees,tents:scenario.tents,budgetMinor:scenario.budgetMinor,weather:scenario.weather,tentMode:scenario.tentMode,
    venue:'Review Pavilion',timezone:'Europe/Stockholm',eventAt:new Date(Date.now()+3600000).toISOString()};
  const plan=await request('/api/plans',{method:'POST',body:{intent}});
  const offers=plan.lines.map(l=>l.offerId),catering=plan.lines.find(l=>l.category==='CATERING'),tents=plan.lines.find(l=>l.category==='TENTS');
  if(scenario.expectedOffers)assert.deepEqual(offers,scenario.expectedOffers,scenario.id);
  if(scenario.expectedCatering)assert.equal(catering.offerId,scenario.expectedCatering);
  assert.equal(catering.quantity,scenario.attendees);assert.equal(tents.quantity,scenario.tents);
  assert.equal(plan.totalMinor>scenario.budgetMinor,scenario.overBudget??false);
  if(scenario.tentMode==='BUY')assert.equal(tents.source?.provider,'Channel3');
  const flow=await request(`/api/plans/${plan.id}`),commands=await request(`/api/plans/${plan.id}/commands`);
  assert.equal(plan.status,'DRAFT');assert.equal(flow.committedMinor,0);assert.equal(flow.capturedMinor,0);assert.equal(commands.length,0);
  const measured=(await request('/api/measurements')).find(m=>m.workflowId===plan.id);
  assert.ok(measured.planningMillis>=0);assert.ok(measured.briefToPlanMillis>=measured.planningMillis);
  results.push({id:scenario.id,status:'passed',workflowId:plan.id,source:typed.source,offers,totalMinor:plan.totalMinor,withinBudget:!scenario.overBudget,
    planningMillis:measured.planningMillis,briefToPlanMillis:measured.briefToPlanMillis,elapsedMillis:Date.now()-started,
    assessments:plan.assessments.map(a=>({role:a.role,summary:a.summary,facts:a.facts,source:a.source})),paymentCommands:0});
  console.log(`PASS: ${scenario.id}; total ${plan.totalMinor} cents, no consent or payment commands`);
}
const valid={request:'Invalid-choice regression fixture',attendees:30,tents:5,budgetMinor:150000,weather:'Rain',tentMode:'RENT',venue:'Review Pavilion',timezone:'UTC',eventAt:new Date(Date.now()+3600000).toISOString()};
const invalid=[{id:'too-many-guests',intent:{...valid,attendees:201}},{id:'missing-tent-mode',intent:{...valid,tentMode:''}},
  {id:'outside-booking-window',intent:{...valid,eventAt:new Date(Date.now()+29*86400000).toISOString()}},
  {id:'foreign-offer',intent:valid,tentOfferId:'unlisted-tent',cateringOfferId:'catering-seasonal'}];
for(const scenario of invalid) {
  const {id,...body}=scenario;const rejected=await request('/api/plans',{method:'POST',body,expected:400});
  results.push({id,status:'passed',rejection:rejected.code});console.log(`PASS: ${id} rejected deterministically`);
}
const output=resolve(root,process.env.SWARM_EVAL_REPORT??`docs/review/evidence/technical/planning-${config.aiProvider}.json`);mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({date:new Date().toISOString(),...sourceEvidence(root),
  datasetSha256:createHash('sha256').update(bytes).digest('hex'),aiProvider:config.aiProvider,model:config.model,payments:'simulated; drafts only',cases:results,
  interpretation:'Weather is changed while price and counts stay fixed; both available tent offers cover these conditions, so an unchanged affordable pair is valid. Guest count forces a capacity change; the higher-service request and budget permit another pair. This small set is not customer impact or a general model benchmark.'},null,2)+'\n');
