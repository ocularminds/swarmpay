import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';

/** A private, local fixture session. Nothing here can approve a real sandbox or production payment. */
export async function fixtureSession(base,environmentFile,{liveAi=false}={}) {
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Review fixtures require localhost');
  assert.equal(statSync(environmentFile).mode&0o077,0,'Use a private fixture environment file');
  const environment=parseEnv(readFileSync(environmentFile,'utf8'));
  assert.equal(environment.SWARM_MODE,'demo','Review actions require simulated payments');
  const config=await(await fetch(base+'/api/config',{signal:AbortSignal.timeout(10000)})).json();
  assert.equal(config.mode,'demo');if(!liveAi)assert.equal(config.aiProvider,'demo');
  let cookie='',csrf={};
  async function request(path,{method='GET',body,form,expected=200}={}) {
    let response;
    for(let attempt=0;attempt<6;attempt++) {
      response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(150000),
      headers:{Cookie:cookie,...(method!=='GET'?{[csrf.csrfHeader??'X-CSRF-TOKEN']:csrf.csrfToken??''}:{}),...(body?{'Content-Type':'application/json'}:form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      body:body?JSON.stringify(body):form?new URLSearchParams(form):undefined});
      if(response.status!==429||expected===429||attempt===5)break;
      const retryMillis=Number(response.headers.get('Retry-After'))*1000;
      await response.text();
      await delay(Math.min(30000,Math.max(4000,Number.isFinite(retryMillis)?retryMillis:4000)));
    }
    for(const value of response.headers.getSetCookie())if(value.startsWith('JSESSIONID='))cookie=value.split(';')[0];
    const raw=await response.text();let value;try{value=raw?JSON.parse(raw):null;}catch{value=null;}
    assert.equal(response.status,expected,`${method} ${path} returned HTTP ${response.status} (${value?.code??'no diagnostic exported'})`);
    return value;
  }
  csrf=await request('/api/session');
  await request('/api/login',{method:'POST',form:{username:environment.ORGANIZER_USERNAME,password:environment.ORGANIZER_PASSWORD},expected:204});
  csrf=await request('/api/session');assert.equal(csrf.authenticated,true);
  return {config,request};
}
