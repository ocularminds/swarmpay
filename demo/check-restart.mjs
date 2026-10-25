import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.SWARM_TEST_URL??'http://localhost:5173';
const config=await(await fetch(base+'/api/config')).json();
assert.equal(config.mode,'demo','Restart test refuses a non-demo stack');
assert.equal(config.aiProvider,'demo','Restart fixture test requires simulated AI');
const before=JSON.parse(readFileSync(new URL('../.local/smoke-workflow.json',import.meta.url),'utf8'));
const evidence=JSON.parse(readFileSync(new URL('../.local/smoke-evidence.json',import.meta.url),'utf8'));
assert.equal(before.mode,'demo');assert.equal(before.capturedMinor,140000,'Run the smoke test first');
const restart=spawnSync('docker',['compose','up','-d','--force-recreate','--no-deps','--wait','commerce-app','payment-executor','agentsafe'],{cwd:root,stdio:'inherit',env:{...process.env,SWARM_AI_PROVIDER:'demo'}});
assert.equal(restart.status,0);
let ready=false;
for(let n=0;n<30;n++) {
  try {if((await fetch(base+'/api/config',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}
  await delay(1000);
}
assert.ok(ready,'The ingress resolves the recreated application');
let cookie='',csrf='';
async function request(path,method='GET') {
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,...(method==='POST'?{'X-CSRF-TOKEN':csrf}:{})}});
  for(const value of r.headers.getSetCookie())if(value.startsWith('JSESSIONID='))cookie=value.split(';')[0];
  assert.equal(r.status,200);return r.json();
}
csrf=(await request('/api/session')).csrfToken;
await request('/api/demo-session','POST');csrf=(await request('/api/session')).csrfToken;
const path=`/api/plans/${before.plan.id}`;
const restored=await request(path);assert.equal(restored.capturedMinor,140000);assert.equal(restored.committedMinor,140000);
assert.equal(restored.orders.filter(order=>order.status==='CAPTURED').length,2);
await request(path+'/milestone','POST');
const after=await request(path+'/evidence');assert.equal(after.applicationChainVerified,true);
assert.deepEqual(after.commands.map(row=>row.command.id).sort(),evidence.commands.map(row=>row.command.id).sort());
assert.equal(after.commands.length,5);
console.log('PASS: completed payments and the audit chain survive service recreation; a replay keeps the original five command identities');
