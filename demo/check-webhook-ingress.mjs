import assert from 'node:assert/strict';

const base=(process.env.SWARM_WEBHOOK_TEST_URL??'http://127.0.0.1:5184').replace(/\/$/,'');
async function request(path,method='GET',body) {
  return fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'1',
    Authorization:'Bearer untrusted-ingress-fixture',Cookie:'JSESSIONID=untrusted-ingress-fixture'},body,signal:AbortSignal.timeout(10000)});
}
for(const path of ['/','/api/config','/api/demo-session','/mcp','/internal/payments/commands','/_agentsafe/status','/paypal/webhooks/unknown']) {
  for(const method of ['GET','POST']) assert.equal((await request(path,method,method==='POST'?'{}':undefined)).status,404,`${method} ${path} must not be public on the tunnel listener`);
}
for(const merchant of ['tents','catering']) {
  assert.equal((await request(`/paypal/webhooks/${merchant}`)).status,403,'Only POST may reach webhook processing');
  const response=await request(`/paypal/webhooks/${merchant}`,'POST','{}');
  const body=await response.json();
  assert.ok((response.status===404 && body.code==='SANDBOX_ONLY') || (response.status===400 && body.code==='INVALID_REQUEST'),
    'A malformed webhook must reach validation without authenticating, paying or returning a demo page');
}
assert.equal((await request('/paypal/webhooks/tents','POST','x'.repeat(140000))).status,413,'Oversized payloads must stop at ingress');
console.log('PASS: callback ingress exposes only the two POST webhook routes; organizer, MCP and command APIs stay private; malformed/oversized events are refused');
