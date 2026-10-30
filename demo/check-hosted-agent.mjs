import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Postman plays the agent against the HTTPS rehearsal, which enforces the live site's host, origin, cookie and sign-in rules.
// The organizer signs in with the password (the one-click session is disabled), funds a plan and issues a token; then the
// collection's "2 · Be the agent" folder runs with the live environment file, exactly as the README tells people to use it.
const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.SWARM_HOSTED_TEST_URL??'https://localhost:5443';
assert.equal(base,'https://localhost:5443','Use the isolated localhost TLS rehearsal');
if(!process.env.SWARM_TEST_ENV)throw new Error('The hosted agent check requires its isolated fixture environment file');
const env=parseEnv(readFileSync(process.env.SWARM_TEST_ENV,'utf8'));
assert.equal(env.SWARM_MODE,'demo');assert.equal(env.SWARM_AI_PROVIDER,'demo');
let cookie='',csrf={};
async function request(path,{method='GET',body,form,token,origin,expect=200}={}) {
  const headers={...(token?{Authorization:`Bearer ${token}`}:{Cookie:cookie}),...(method!=='GET'&&!token?{[csrf.header]:csrf.token}:{}),...(origin?{Origin:origin}:{})};
  for(let attempt=0;;attempt++) {
    const r=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{...headers,...(body?{'Content-Type':'application/json',Accept:'application/json, text/event-stream'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      body:body?JSON.stringify(body):form?new URLSearchParams(form):undefined});
    // Sign-in and planning are rate-limited per client; wait out a limit left by earlier checks rather than fail on it.
    if(r.status===429&&attempt<5){await new Promise(done=>setTimeout(done,7000));continue;}
    for(const c of r.headers.getSetCookie()) if(c.startsWith('JSESSIONID=')) cookie=c.split(';')[0];
    const text=await r.text();const value=text&&r.headers.get('content-type')?.includes('json')?JSON.parse(text):text;
    assert.equal(r.status,expect,`${method} ${path}: ${typeof value==='string'?value:JSON.stringify(value)}`);return value;
  }
}
async function readSession(){const s=await request('/api/session');csrf={header:s.csrfHeader,token:s.csrfToken};return s;}
await readSession();
await request('/api/login',{method:'POST',form:{username:env.ORGANIZER_USERNAME,password:env.ORGANIZER_PASSWORD},expect:204});
assert.equal((await readSession()).authenticated,true);
const plan=await request('/api/plans',{method:'POST',body:{intent:{request:'Hosted agent check: rainy meetup for 30 people, five tent rentals.',attendees:30,tents:5,budgetMinor:150000,
  eventAt:new Date(Date.now()+3600000).toISOString(),timezone:'UTC',venue:'Hosted check pavilion',weather:'Rain',tentMode:'RENT'}}});
const path=`/api/plans/${plan.id}`;
await request(`${path}/approve`,{method:'POST',body:{version:plan.version}});
for(const line of plan.lines) {
  await request(`${path}/orders/${line.id}/checkout`,{method:'POST'});
  // The worker may still be sending the checkout; observe the one command rather than ask again.
  let order;
  for(const deadline=Date.now()+20000;!order&&Date.now()<deadline;await new Promise(done=>setTimeout(done,100)))
    order=(await request(path+'/commands')).find(c=>c.command.orderId===line.id&&c.command.operation==='CREATE_ORDER'&&c.result)?.result;
  assert.equal(order?.state,'SUCCEEDED',`Checkout did not succeed: ${JSON.stringify(order)}`);
  assert.equal((await request(`${path}/orders/${line.id}/buyer-approved`,{method:'POST',body:{providerOrderId:order.result.providerOrderId}})).state,'SUCCEEDED');
}
const issued=await request('/api/agent-tokens',{method:'POST',body:{label:'Postman hosted check'}});
assert.match(issued.token,/^swp_/);
// Postman's browser client sends its own origin, which the site refuses; the desktop app sends none.
const browserClient=await request('/mcp',{method:'POST',token:issued.token,origin:'https://web.postman.co',body:{jsonrpc:'2.0',method:'tools/list',id:1,params:{}},expect:403});
assert.equal(browserClient.code,'INVALID_ORIGIN');
const newman=spawnSync('npx',['--yes','newman@6.2.1','run','postman/SwarmPay-agent.postman_collection.json','-e','postman/SwarmPay-live.postman_environment.json',
  '--folder','2 · Be the agent','--env-var',`baseUrl=${base}`,'--env-var',`agentToken=${issued.token}`,'--env-var',`workflowId=${plan.id}`,
  '--ssl-extra-ca-certs',resolve(root,'.local/hosted/tls.crt')],{cwd:root,stdio:'inherit'});
assert.equal(newman.status,0,'The Postman agent folder failed against the hosted rehearsal');
await request(`/api/agent-tokens/${issued.grant.id}`,{method:'DELETE',expect:204});
await request('/mcp',{method:'POST',token:issued.token,body:{jsonrpc:'2.0',method:'tools/list',id:2,params:{}},expect:401});
console.log('PASS: an organizer-issued agent token drives the Postman agent folder over hosted HTTPS; a browser origin and a revoked token are refused');
