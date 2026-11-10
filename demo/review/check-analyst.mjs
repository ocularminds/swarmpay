import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {sourceEvidence} from './source-evidence.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const environmentFile=resolve(root,process.env.SWARM_TEST_ENV??'.local/review-ai.env');
assert.equal(statSync(environmentFile).mode&0o077,0);
const env=parseEnv(readFileSync(environmentFile,'utf8'));assert.equal(env.SWARM_MODE,'demo');assert.equal(env.SWARM_AI_PROVIDER,'azure');
const browser=await chromium.launch();
try {
  const context=await browser.newContext({baseURL:'https://localhost:5443',ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});
  const get=async path=>(await context.request.get(path)).json();
  const config=await get('/api/config');assert.equal(config.mode,'demo');assert.equal(config.aiProvider,'azure');
  const csrf=await get('/api/session');
  const login=await context.request.post('/api/login',{form:{username:env.ORGANIZER_USERNAME,password:env.ORGANIZER_PASSWORD},headers:{[csrf.csrfHeader]:csrf.csrfToken}});
  assert.equal(login.status(),204);
  const entries=await get('/api/ledger');
  const held=entries.find(entry=>['HELD','ESCALATE','BLOCKED','BLOCK'].includes(entry.state)&&entry.dossierId);
  assert.ok(held,'Seed a real held request in this isolated fixture first');
  const before=await get(`/api/plans/${held.workflowId}`),commandsBefore=await get(`/api/plans/${held.workflowId}/commands`);
  const page=await context.newPage();
  // Observe a clone of each actual browser response; Playwright cannot always retain a streamed response body.
  await page.addInitScript(()=>{
    const original=window.fetch;window.__reviewAi={active:0,finished:0,replies:[]};
    window.fetch=async(...args)=>{
      const response=await original(...args),url=typeof args[0]==='string'?args[0]:args[0]?.url;
      if(url?.endsWith('/api/ai/responses')) {
        const state=window.__reviewAi;state.active++;
        response.clone().text().then(raw=>{
          const answer=[];for(const line of raw.split('\n'))if(line.startsWith('data: {')) {
            const event=JSON.parse(line.slice(6));if(event.type==='response.output_text.delta')answer.push(event.delta);
          }
          state.replies.push({status:response.status,text:answer.join('')});
        }).catch(()=>state.replies.push({status:0,text:'Response observation failed'}))
          .finally(()=>{state.active--;state.finished=Date.now();});
      }
      return response;
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'All payments'}).click();
  await page.getByRole('button',{name:'Ask the agents'}).click();
  const prompt=`Why was request ${held.id} for plan ${held.workflowId} held? Cite that request ID and its dossier ID, explain the missing receipt, and distinguish any later completed capture.`;
  await page.getByRole('textbox',{name:'Message input'}).fill(prompt);
  await page.getByRole('button',{name:'Send message'}).click();
  let observed;
  for(let attempt=0;attempt<60;attempt++) {
    await page.waitForTimeout(3000);
    observed=await page.evaluate(()=>window.__reviewAi);
    if(observed.replies.length&&observed.active===0&&Date.now()-observed.finished>6000)break;
  }
  const replies=observed.replies;
  if(!replies.length||replies.some(reply=>reply.status!==200))writeFileSync(resolve(root,'.local/review-20261110/analyst-diagnostic.txt'),await page.locator('body').ariaSnapshot(),{mode:0o600});
  assert.ok(replies.length,'No model response');assert.ok(replies.every(reply=>reply.status===200));
  const answer=replies.map(reply=>reply.text).filter(Boolean).join('\n\n');
  assert.ok(answer.includes(held.id),'The answer must cite the real request ID');
  assert.ok(answer.includes(held.dossierId),'The answer must cite the matching dossier');
  assert.match(answer,/receipt/i);assert.match(answer,/held|blocked/i);
  const after=await get(`/api/plans/${held.workflowId}`),commandsAfter=await get(`/api/plans/${held.workflowId}/commands`);
  assert.equal(after.capturedMinor,before.capturedMinor);assert.deepEqual(commandsAfter.map(c=>c.command.id),commandsBefore.map(c=>c.command.id));
  const output=resolve(root,'docs/review/evidence/technical');mkdirSync(output,{recursive:true});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.getByRole('textbox',{name:'Message input'}).blur();
  await page.screenshot({path:resolve(output,'analyst.png'),fullPage:true});
  writeFileSync(resolve(output,'analyst.json'),JSON.stringify({date:new Date().toISOString(),...sourceEvidence(root),environment:'localhost HTTPS; real Azure model; simulated payments, catalog and venue; local test authority',
    prompt,answer,requestId:held.id,dossierId:held.dossierId,workflowId:held.workflowId,modelRequests:replies.length,
    capturedBeforeMinor:before.capturedMinor,capturedAfterMinor:after.capturedMinor,paymentCommandCount:commandsAfter.length,
    checks:'Actual AG Studio UI → lead/analyst → recorded decision tools. Matching request and dossier cited; explanation names the receipt condition; no payment command or captured-total change.'},null,2)+'\n');
  console.log('PASS: actual dashboard answer cites the held request and dossier; payment state unchanged');
} finally {await browser.close();}
