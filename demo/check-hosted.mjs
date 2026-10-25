import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';

const base=process.env.SWARM_HOSTED_TEST_URL??'https://localhost:5443';
assert.equal(base,'https://localhost:5443','Use the isolated localhost TLS rehearsal');
const get=path=>fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
const configured=await get('/api/config');
assert.equal(configured.status,200);const config=await configured.json();
assert.equal(config.mode,'demo');assert.equal(config.aiProvider,'demo');assert.equal(config.demoSessionEnabled,false);
for(const [name,value] of Object.entries({'strict-transport-security':'max-age=31536000','x-content-type-options':'nosniff','x-frame-options':'DENY'}))
  assert.ok(configured.headers.get(name)?.includes(value),`Hosted API must send ${name}`);
assert.ok(configured.headers.get('cache-control')?.includes('no-store'));
const sessionResponse=await get('/api/session');const session=await sessionResponse.json();assert.equal(session.authenticated,false);
const sessionCookie=sessionResponse.headers.getSetCookie().find(c=>c.startsWith('JSESSIONID='));
assert.ok(sessionCookie,'Session cookie must exist');
for(const attribute of ['Secure','HttpOnly','SameSite=Strict'])assert.ok(sessionCookie.includes(attribute),`Session cookie must include ${attribute}`);
const cookie=sessionCookie.split(';')[0];
const demo=await fetch(base+'/api/demo-session',{method:'POST',headers:{Cookie:cookie,Origin:base,[session.csrfHeader]:session.csrfToken}});
assert.equal(demo.status,404);assert.equal((await demo.json()).code,'DEMO_DISABLED');
for(const path of ['/api/intent','/api/plans']) {
  const response=await fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:base,[session.csrfHeader]:session.csrfToken,'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,401,'Anonymous clients cannot use model or plan endpoints');
}
for(const path of ['/api/session','/mcp']) {
  const response=await fetch(base+path,{headers:{Origin:'https://attacker.test'}});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'INVALID_ORIGIN');
}
// Fetch owns the Host header. Use the raw HTTP client to put a conflicting
// Host on the wire while retaining the real TLS server name and verification.
const wrongHost=await new Promise((resolve,reject)=>{
  const request=httpsRequest(base+'/api/session',{servername:'localhost',headers:{Host:'attacker.test',Forwarded:'host=localhost:5443;proto=https','X-Forwarded-Host':'localhost:5443'}},response=>{
    let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
    response.on('end',()=>resolve({status:response.statusCode,body}));response.on('error',reject);
  });
  request.setTimeout(15000,()=>request.destroy(new Error('Hosted probe timed out')));request.on('error',reject);request.end();
});
assert.equal(wrongHost.status,403);assert.equal(JSON.parse(wrongHost.body).code,'INVALID_HOST');
const anonymousMcp=await get('/mcp');assert.equal(anonymousMcp.status,401);
console.log('PASS: TLS, secure session cookies, origin/host binding, anonymous model denial and disabled one-click organizer access');
