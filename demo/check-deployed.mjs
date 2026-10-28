import assert from 'node:assert/strict';
import {randomUUID,sign} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';

// Explicit acceptance run against the deployed demo. It spends three Azure model
// calls and creates one workflow. Ordinary fixture CI never runs it. With
// SWARM_EXPECTED_PAYMENTS=sandbox it checks a PayPal sandbox deployment and stops
// at the prepared plan: no checkout is opened, so no PayPal order is created.
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
const payments=process.env.SWARM_EXPECTED_PAYMENTS??'demo';
assert.ok(['demo','sandbox'].includes(payments),'SWARM_EXPECTED_PAYMENTS is demo or sandbox');
assert.equal(config.mode,payments,'The deployment must use the payments this run expects; it never creates a real payment');
assert.equal(config.aiProvider,'azure');
assert.equal(config.demoSessionEnabled,false);
// A deployment on the shared hosted gateway asks Decionis while payments stay simulated.
assert.equal(config.authority,process.env.SWARM_EXPECTED_AUTHORITY??'AgentSafe · local test authority');
assert.equal(config.receiptIssuer,'demo-venue-fixture');
assert.equal(config.policyVersion,process.env.SWARM_EXPECTED_POLICY_VERSION??'swarm-pay-demo-v1');
if(payments==='demo')assert.ok(Object.values(config.clientIds).every(id=>id===''),'No PayPal client should be configured in this demo');
else assert.ok(Object.values(config.clientIds).every(id=>/^[A-Za-z0-9_-]{20,}$/.test(id)),'Both merchants need their public sandbox client IDs');
// Sign-in with PayPal, when offered, starts at PayPal's sandbox for SwarmPay's own app and comes back to this site only.
let paypalSignInVerified=false;
if(config.paypalSignIn) {
  const started=await fetch(base+'/api/paypal/start',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(started.status,302);
  const to=new URL(started.headers.get('location'));
  assert.equal(to.origin+to.pathname,'https://www.sandbox.paypal.com/signin/authorize');
  assert.equal(to.searchParams.get('redirect_uri'),base+'/api/paypal/return');assert.equal(to.searchParams.get('response_type'),'code');
  assert.ok(to.searchParams.get('client_id')&&!Object.values(config.clientIds).includes(to.searchParams.get('client_id')),'Sign-in uses SwarmPay\'s app, not a merchant\'s');
  const state=started.headers.get('set-cookie')??'';
  assert.ok(state.startsWith(`SWARM_PAYPAL_STATE=${to.searchParams.get('state')};`)&&/HttpOnly/i.test(state)&&/Secure/i.test(state)&&/SameSite=Lax/i.test(state));
  const forged=await fetch(base+'/api/paypal/return?code=forged-code-value&state=forged',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(forged.headers.get('location'),'/?signin=paypal-failed','A return without this browser\'s state signs no one in');
  paypalSignInVerified=true;
}
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
  await expect(page.getByLabel('Describe your event')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  if(config.tentPurchases) {
    await expect(page.getByText(payments==='sandbox'
      ? /Payments run in the PayPal sandbox\./ : /Payments are simulated in this demo\./)).toBeVisible();
    await expect(page.getByText(/Tent purchases use Channel3 listings\. Rentals, catering and the venue are simulated\./)).toBeVisible();
  } else await expect(page.getByText(payments==='sandbox'
      ? /Payments run in the PayPal sandbox\. The catalog and venue are simulated\./
      : /Payments, catalog and venue are simulated in this demo\./)).toBeVisible();
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
  // The description typed on the landing comes along through sign-in and Azure reads it in the workspace.
  await page.getByRole('button',{name:'Use an example'}).click();
  await page.getByRole('button',{name:'Plan my event'}).click();
  const signIn=page.getByRole('dialog',{name:'Sign in to plan your event'});
  await signIn.getByLabel('Password',{exact:true}).fill('incorrect-acceptance-password');
  const denied=page.waitForResponse(r=>r.url().endsWith('/api/login'));
  await signIn.getByRole('button',{name:'Sign in',exact:true}).click();
  assert.equal((await denied).status(),401);
  await expect(signIn.getByRole('alert')).toContainText('That password didn’t work');
  await signIn.getByLabel('Organizer',{exact:true}).fill(env.ORGANIZER_USERNAME);
  await signIn.getByLabel('Password',{exact:true}).fill(env.ORGANIZER_PASSWORD);
  const read=page.waitForResponse(r=>r.url().endsWith('/api/intent'),{timeout:150000});
  await signIn.getByRole('button',{name:'Sign in',exact:true}).click();
  assert.equal((await read).status(),200,'Azure must read the landing description');
  await expect(page.getByRole('heading',{name:'Here’s what we understood.'})).toBeVisible();
  console.log('PASS: verified public TLS, HTTPS redirect, secure sign-in, anonymous denial and private-route rejection');

  await page.getByLabel('Venue',{exact:true}).fill('Azure acceptance pavilion');
  await page.getByRole('radio',{name:'Rent tents'}).check();
  const prepared=page.waitForResponse(r=>r.url().endsWith('/api/plans')&&r.request().method()==='POST',{timeout:150000});
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  const planResponse=await prepared;
  assert.equal(planResponse.status(),200,'Azure sourcing and risk assessment must succeed');
  const plan=await planResponse.json();
  assert.equal(plan.totalMinor,140000);assert.equal(plan.assessments.length,2);
  for(const assessment of plan.assessments)assert.match(assessment.source,/^Azure OpenAI/);
  const next=page.locator('.next-card');
  await expect(next.getByRole('heading',{name:'Approve $1,400 for 2 merchants'})).toBeVisible();
  let evidence=null;
  // Sandbox stops here: approving and paying would open real PayPal sandbox checkouts.
  if(payments==='demo') {
    await page.getByRole('checkbox',{name:/I approve these merchants/}).check();
    await page.getByRole('button',{name:'Approve $1,400',exact:true}).click();
    // Each step offers one next action: pay tents, authorize catering, then confirm delivery.
    const dialog=page.getByRole('dialog');
    await next.getByRole('button',{name:'Pay $500'}).click();
    await expect(dialog).toContainText('No PayPal transaction or real charge occurs.');
    await dialog.getByRole('button',{name:'Pay $500'}).click();
    await next.getByRole('button',{name:'Authorize $900'}).click({timeout:20000});
    await dialog.getByRole('button',{name:'Authorize $900'}).click();
    await expect(next.getByRole('heading',{name:'Confirm the catering delivery'})).toBeVisible({timeout:20000});
    await next.getByText('Other ways to confirm').click();
    await page.getByLabel('Add a delivery photo').setInputFiles({name:'delivery.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64')});
    await expect(page.getByRole('status')).toContainText('Photo saved.');
    await expect(page.locator('.merchant-list')).toContainText('Authorized · pays on delivery');
    const line=plan.lines.find(l=>l.category==='CATERING'),now=new Date().toISOString();
    const payload=Buffer.from(JSON.stringify({issuer:'demo-venue-fixture',workflowId:plan.id,orderId:line.id,merchantId:'catering',venue:plan.intent.venue,quantity:30,deliveredAt:now,issuedAt:now,nonce:randomUUID()}));
    const receipt={payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};
    await page.getByLabel('Upload venue receipt').setInputFiles({name:'receipt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(receipt))});
    await expect(next.getByRole('heading',{name:'Both merchants are paid'})).toBeVisible({timeout:20000});
    const downloaded=page.waitForEvent('download');
    await next.getByRole('button',{name:'Download evidence'}).click();
    evidence=JSON.parse(readFileSync(await(await downloaded).path(),'utf8'));
    assert.equal(evidence.applicationChainVerified,true);assert.equal(evidence.commands.length,5);
    writeFileSync(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:resolve(output,payments==='demo'?'desktop-completed.png':'desktop-plan.png'),fullPage:true});

  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'The mobile workflow must fit its viewport');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Here’s what we understood.'})).toHaveCount(0);
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
    privateRoutesRejected:true,landingDescriptionRead:true,paypalSignInVerified,azureSourcingAndRisk:true,
    ...(evidence?{photoOnlyHeld:true,signedFixtureCapture:true,applicationChainVerified:true,simulatedCommands:5}:{stoppedBeforeCheckout:true}),
    mobileLayout:true,loginRateLimitVerified,browserErrors:0},null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(evidence?'PASS: Azure sourcing/risk, two simulated merchant checkouts, photo hold, signed fixture capture, evidence export and mobile sign-out'
    :'PASS: Azure read the landing description and prepared the $1,400 plan; stopped before any PayPal sandbox checkout; mobile sign-out');
  console.log(`Private acceptance evidence: ${output}`);
} finally {
  await context.close();await browser.close();
}
