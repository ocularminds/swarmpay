import assert from 'node:assert/strict';
import {randomUUID,sign} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

// Explicit acceptance run against the deployed demo. It spends two Azure model
// calls and creates one simulated workflow. Ordinary fixture CI never runs it.
const [base,credentialDirectory,outputDirectory]=process.argv.slice(2);
assert.equal(base,'https://swarm.decionis.com','Only the approved SwarmPay HTTPS host is accepted');
assert.ok(credentialDirectory&&outputDirectory,'Usage: node demo/check-deployed.mjs https://swarm.decionis.com private-credential-directory new-private-report-directory');
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0','TLS verification must remain enabled');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(outputDirectory),credentials=resolve(credentialDirectory);
assert.equal(existsSync(output),false,'Preserve prior acceptance records; choose a new output directory');
assert.equal(spawnSync('git',['check-ignore','-q',resolve(output,'report.json')],{cwd:root}).status,0,'Reports must be outside source control');
for(const name of ['organizer.env','venue-private.pem'])
  assert.equal(statSync(resolve(credentials,name)).mode&0o077,0,'Credential and signing-key files must be owner-only');
const env=parseEnv(readFileSync(resolve(credentials,'organizer.env'),'utf8'));
assert.equal(env.SWARM_PUBLIC_ORIGIN,base);
assert.ok(env.ORGANIZER_USERNAME&&env.ORGANIZER_PASSWORD,'Organizer credentials are required');
const privateKey=readFileSync(resolve(credentials,'venue-private.pem'));

const response=await fetch(base+'/api/config',{redirect:'error',signal:AbortSignal.timeout(15000)});
assert.equal(response.status,200);
const config=await response.json();
assert.equal(config.mode,'demo','This run must never create a real or PayPal sandbox payment');
assert.equal(config.aiProvider,'azure');
assert.equal(config.demoSessionEnabled,false);
// A deployment on the shared hosted gateway asks Decionis while payments stay simulated.
assert.equal(config.authority,process.env.SWARM_EXPECTED_AUTHORITY??'AgentSafe · local test authority');
assert.equal(config.receiptIssuer,'demo-venue-fixture');
assert.equal(config.policyVersion,process.env.SWARM_EXPECTED_POLICY_VERSION??'swarm-pay-demo-v1');
assert.ok(Object.values(config.clientIds).every(id=>id===''),'No PayPal client should be configured in this demo');
assert.match(response.headers.get('strict-transport-security')??'',/max-age=[1-9][0-9]+/);
for(const [header,value] of [['x-content-type-options','nosniff'],['x-frame-options','DENY']]) {
  const values=(response.headers.get(header)??'').split(',').map(v=>v.trim());
  assert.ok(values.length>0&&values.every(v=>v===value),`Expected ${header}: ${value}`);
}
assert.match(response.headers.get('cache-control')??'',/no-store/);
const redirected=await fetch('http://swarm.decionis.com/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
assert.ok([301,302,307,308].includes(redirected.status));
assert.equal(new URL(redirected.headers.get('location')).href,base+'/');
for(const path of ['/internal/payments/commands','/_agentsafe/status'])
  assert.equal((await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(15000)})).status,404);
assert.equal((await fetch(base+'/mcp',{redirect:'error',signal:AbortSignal.timeout(15000)})).status,401);
assert.equal((await fetch(base+'/api/session',{headers:{Origin:'https://attacker.test'},redirect:'error',signal:AbortSignal.timeout(15000)})).status,403);

mkdirSync(output,{recursive:true,mode:0o700});
const require=createRequire(resolve(root,'apps/web/package.json'));
const {chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true,...(process.env.SWARM_TEST_BROWSER?{channel:process.env.SWARM_TEST_BROWSER}:{})});
const context=await browser.newContext({baseURL:base,ignoreHTTPSErrors:false,viewport:{width:1366,height:950}});
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const started=Date.now();
try {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Plan my event'})).toHaveCount(0);
  await expect(page.getByText(/Payments, catalog and venue are simulated in this demo\./)).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==='JSESSIONID');
  assert.ok(cookie?.secure&&cookie?.httpOnly&&cookie?.sameSite==='Strict','A secure, HttpOnly, SameSite=Strict session is required');
  const anonymous=await page.evaluate(async()=>{
    const session=await(await fetch('/api/session')).json(),statuses=[];
    for(const path of ['/api/intent','/api/plans','/api/demo-session']) {
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',[session.csrfHeader]:session.csrfToken},body:'{}'});
      statuses.push(r.status);
    }
    return statuses;
  });
  assert.deepEqual(anonymous,[401,401,404]);
  await page.getByLabel('Password',{exact:true}).fill('incorrect-acceptance-password');
  const denied=page.waitForResponse(r=>r.url().endsWith('/api/login'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  assert.equal((await denied).status(),401);
  await expect(page.getByRole('alert')).toContainText('credentials were not accepted');
  await page.getByLabel('Organizer',{exact:true}).fill(env.ORGANIZER_USERNAME);
  await page.getByLabel('Password',{exact:true}).fill(env.ORGANIZER_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'What are we planning?'})).toBeVisible();
  console.log('PASS: verified public TLS, HTTPS redirect, secure sign-in, anonymous denial and private-route rejection');

  await page.getByLabel('Venue',{exact:true}).fill('Azure acceptance pavilion');
  await page.getByRole('checkbox',{name:/Tent rentals work/}).check();
  const prepared=page.waitForResponse(r=>r.url().endsWith('/api/plans')&&r.request().method()==='POST',{timeout:150000});
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  const planResponse=await prepared;
  assert.equal(planResponse.status(),200,'Azure sourcing and risk assessment must succeed');
  const plan=await planResponse.json();
  assert.equal(plan.totalMinor,140000);assert.equal(plan.assessments.length,2);
  for(const assessment of plan.assessments)assert.match(assessment.source,/^Azure OpenAI/);
  await page.getByRole('checkbox',{name:/I approve these merchants/}).check();
  await page.getByRole('button',{name:'Approve $1,400 plan',exact:true}).click();
  const tents=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Canopy Collective'})});
  await tents.getByRole('button',{name:'Simulated checkout'}).click();
  await expect(page.getByRole('dialog')).toContainText('No PayPal transaction or real charge occurs.');
  await page.getByRole('button',{name:'Simulate payment',exact:true}).click();
  await expect(tents).toContainText('Payment confirmed',{timeout:20000});
  const catering=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Gather Kitchen'})});
  await catering.getByRole('button',{name:'Simulated checkout'}).click();
  await page.getByRole('button',{name:'Simulate authorization'}).click();
  await expect(catering).toContainText('Authorized · awaiting delivery',{timeout:20000});
  await page.getByRole('button',{name:'View delivery & proof',exact:true}).click();
  await page.getByLabel('Add a delivery photo').setInputFiles({name:'delivery.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64')});
  await expect(page.getByRole('status')).toContainText('Photo saved.');
  await page.getByRole('button',{name:'Request milestone payment'}).click();
  await expect(page.getByRole('alert')).toContainText('A photo alone cannot release payment');
  const line=plan.lines.find(l=>l.category==='CATERING'),now=new Date().toISOString();
  const payload=Buffer.from(JSON.stringify({issuer:'demo-venue-fixture',workflowId:plan.id,orderId:line.id,merchantId:'catering',venue:plan.intent.venue,quantity:30,deliveredAt:now,issuedAt:now,nonce:randomUUID()}));
  const receipt={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};
  await page.getByLabel('Upload venue receipt').setInputFiles({name:'receipt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
  await expect(page.getByText('Both payments confirmed',{exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByRole('heading',{name:'Venue receipt verified'})).toBeVisible();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download evidence'}).click();
  const evidence=JSON.parse(readFileSync(await(await downloaded).path(),'utf8'));
  assert.equal(evidence.applicationChainVerified,true);assert.equal(evidence.commands.length,5);
  writeFileSync(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600,flag:'wx'});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:resolve(output,'desktop-completed.png'),fullPage:true});

  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'The mobile workflow must fit its viewport');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'What are we planning?'})).toHaveCount(0);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/plans')).status),401);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:resolve(output,'mobile-sign-in.png'),fullPage:true});
  // The web proxy limits its ingress peer, so this bounded negative check can
  // briefly throttle other public login attempts too. Run it only on request.
  let loginRateLimitVerified=null;
  if(process.env.SWARM_CHECK_LOGIN_LIMIT==='1') {
    const statuses=await page.evaluate(async()=>{
      const session=await(await fetch('/api/session')).json(),result=[];
      for(let i=0;i<8;i++) {
        const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',[session.csrfHeader]:session.csrfToken},body:new URLSearchParams({username:'acceptance-invalid',password:'incorrect-acceptance-password'})});
        result.push(r.status);
      }
      return result;
    });
    assert.ok(statuses.every(status=>[401,429].includes(status))&&statuses.includes(429),'A burst of invalid sign-ins must be throttled');
    loginRateLimitVerified=true;
  }
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(output,'report.json'),JSON.stringify({at:new Date().toISOString(),origin:base,mode:config.mode,aiProvider:config.aiProvider,authority:config.authority,
    workflowId:plan.id,elapsedMs:Date.now()-started,publicTls:true,httpsRedirect:true,secureCookies:true,organizerLoginLogout:true,anonymousModelDenial:true,originRejection:true,
    privateRoutesRejected:true,azureSourcingAndRisk:true,photoOnlyHeld:true,signedFixtureCapture:true,applicationChainVerified:true,simulatedCommands:5,mobileLayout:true,loginRateLimitVerified,browserErrors:0},null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('PASS: Azure sourcing/risk, two simulated merchant checkouts, photo hold, signed fixture capture, evidence export and mobile sign-out');
  console.log(`Private acceptance evidence: ${output}`);
} finally {
  await context.close();await browser.close();
}
