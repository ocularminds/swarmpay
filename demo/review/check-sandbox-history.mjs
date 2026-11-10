// Read existing sandbox records only. This never approves, retries, reconciles or sends a payment command.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve,dirname} from 'node:path';

const base='https://swarm.decionis.com';
const environmentFile=resolve(process.env.SWARM_LIVE_TEST_ENV??'.env.sandbox');
assert.equal(statSync(environmentFile).mode&0o077,0,'Use the private sandbox environment');
const env=parseEnv(readFileSync(environmentFile,'utf8'));
assert.ok(env.ORGANIZER_USERNAME&&env.ORGANIZER_PASSWORD,'Provide the deployed organizer credentials');
const ids=process.argv.slice(2);assert.ok(ids.length,'Pass existing workflow UUIDs to inspect');
assert.ok(ids.every(id=>/^[\da-f-]{36}$/.test(id)));
let cookie='';
async function request(path,options={}) {
  const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(30000),redirect:'error',headers:{Cookie:cookie,...options.headers}});
  for(const value of response.headers.getSetCookie())if(value.startsWith('JSESSIONID='))cookie=value.split(';')[0];
  assert.equal(response.status,options.method==='POST'?204:200,`${path}: HTTP ${response.status}`);
  return response.status===204?null:response.json();
}
const config=await request('/api/config');assert.equal(config.mode,'sandbox');
const session=await request('/api/session');
await request('/api/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',[session.csrfHeader]:session.csrfToken},
  body:new URLSearchParams({username:env.ORGANIZER_USERNAME,password:env.ORGANIZER_PASSWORD})});
const records=[];
for(const id of ids) {
  const flow=await request(`/api/plans/${id}`),evidence=await request(`/api/plans/${id}/evidence`);
  records.push({workflowId:id,eventAt:flow.plan.intent.eventAt,capturedMinor:flow.capturedMinor,receiptVerified:flow.receiptVerified,
    applicationChainVerified:evidence.applicationChainVerified,
    renewalEvents:flow.events.filter(event=>/reauth|renew/i.test(event.type+' '+event.message)).map(event=>({type:event.type,at:event.at,message:event.message})),
    orders:flow.orders.map(o=>({category:o.category,status:o.status,amountMinor:o.amountMinor,authorizationId:o.authorizationId,captureId:o.captureId,refundId:o.refundId})),
    commands:evidence.commands.map(c=>({id:c.command.id,operation:c.command.operation,state:c.state,providerStatus:c.result?.result?.status,
      authorizationId:c.result?.result?.authorizationId,captureId:c.result?.result?.captureId,refundId:c.result?.result?.refundId}))});
}
const output=resolve('docs/review/evidence/technical/sandbox-history.json');mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),site:base,mode:config.mode,authority:config.authority,
  scope:'Authenticated GET of existing October sandbox workflows and their stored evidence. No new payment, renewal, refund, reconciliation or delivery was requested. This is a current read of historical application/provider records, not a fresh provider settlement test.',records},null,2)+'\n');
console.log('PASS: existing sandbox workflow records read; no payment action requested');
