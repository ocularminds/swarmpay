import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,statSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
mkdirSync(resolve(root,'.local'),{recursive:true});
test('bootstrap limits each workload to its credentials, keeps the signer private, and preserves existing settings',t=>{
  const temporary=mkdtempSync(resolve(root,'.local/secret-preparation-test-'));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
  const source=resolve(temporary,'source.env'),output=resolve(temporary,'bootstrap');
  writeFileSync(source,'AZURE_OPEANAI_KEY=fixture-azure-key\nAZURE_OPENAI_URL=https://fixture.openai.azure.com/openai/v1\nAZURE_OPENAI_LLM=gpt-6-astra\nPAYPAL_TENTS_CLIENT_SECRET=must-not-copy\n',{mode:0o600});
  const run=()=>spawnSync(process.execPath,['infra/azure/prepare-secrets.mjs',source,output],{cwd:root,encoding:'utf8'});
  const result=run();assert.equal(result.status,0);
  assert.ok(!result.stdout.includes('fixture-azure-key'));assert.ok(!result.stderr.includes('fixture-azure-key'));
  const text=readFileSync(resolve(output,'secrets.json'),'utf8');
  for(const secret of JSON.parse(text).items){assert.equal(secret.metadata.namespace,'decionis');assert.match(secret.metadata.name,/^swarm-pay-/);}
  const secrets=Object.fromEntries(JSON.parse(text).items.map(secret=>[secret.metadata.name,Object.fromEntries(Object.entries(secret.data).map(([k,v])=>[k,Buffer.from(v,'base64').toString()]))]));
  assert.equal(secrets['swarm-pay-commerce-secrets'].AZURE_OPENAI_API_KEY,'fixture-azure-key');
  assert.equal(secrets['swarm-pay-commerce-secrets'].DATABASE_PASSWORD,secrets['swarm-pay-postgres-secrets'].PG_APP_PASSWORD);
  assert.equal(secrets['swarm-pay-payment-secrets'].DATABASE_PASSWORD,secrets['swarm-pay-postgres-secrets'].PG_EXECUTOR_PASSWORD);
  assert.notEqual(secrets['swarm-pay-commerce-secrets'].DATABASE_PASSWORD,secrets['swarm-pay-payment-secrets'].DATABASE_PASSWORD);
  assert.equal(secrets['swarm-pay-commerce-secrets'].EXECUTOR_TOKEN,secrets['swarm-pay-payment-secrets'].EXECUTOR_TOKEN);
  assert.ok(!JSON.stringify(secrets['swarm-pay-payment-secrets']).includes('AZURE'));
  assert.deepEqual(secrets['swarm-pay-egress-settings'],{AZURE_OPENAI_ENDPOINT:'https://fixture.openai.azure.com/openai/v1'});
  assert.ok(!JSON.stringify(secrets).includes('must-not-copy'));
  assert.ok(!text.includes('PRIVATE KEY'));
  for(const file of ['secrets.json','venue-private.pem','organizer.env'])assert.equal(statSync(resolve(output,file)).mode&0o077,0);
  assert.notEqual(run().status,0);assert.equal(readFileSync(resolve(output,'secrets.json'),'utf8'),text);
});

test('invalid source credentials do not create a deployment directory or leak the invalid endpoint',t=>{
  const temporary=mkdtempSync(resolve(root,'.local/secret-preparation-test-'));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
  const source=resolve(temporary,'source.env'),output=resolve(temporary,'bootstrap');
  writeFileSync(source,'AZURE_OPENAI_API_KEY=fixture-key\nAZURE_OPENAI_ENDPOINT=endpoint-that-must-not-be-printed\nAZURE_OPENAI_DEPLOYMENT=gpt-6-astra\n',{mode:0o600});
  const result=spawnSync(process.execPath,['infra/azure/prepare-secrets.mjs',source,output],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.ok(!result.stderr.includes('endpoint-that-must-not-be-printed'));assert.equal(existsSync(output),false);
});

test('the venue key reaches only its own secret, and sandbox copies PayPal settings for the executor only',t=>{
  const temporary=mkdtempSync(resolve(root,'.local/secret-preparation-test-'));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
  const source=resolve(temporary,'source.env'),output=resolve(temporary,'bootstrap');
  const paypal=['TENTS','CATERING'].flatMap(merchant=>['CLIENT_ID','CLIENT_SECRET','MERCHANT_ID','WEBHOOK_ID'].map(suffix=>`PAYPAL_${merchant}_${suffix}=${`fixture-${merchant}-${suffix}`.toLowerCase()}`));
  writeFileSync(source,`AZURE_OPENAI_API_KEY=fixture-key\nAZURE_OPENAI_ENDPOINT=https://fixture.openai.azure.com/openai/v1\nAZURE_OPENAI_DEPLOYMENT=gpt-6-astra\n${paypal.join('\n')}\n`,{mode:0o600});
  const result=spawnSync(process.execPath,['infra/azure/prepare-secrets.mjs',source,output,'--sandbox'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0);assert.ok(!result.stdout.includes('fixture-tents-client_secret'));
  const decode=file=>Object.fromEntries(JSON.parse(readFileSync(resolve(output,file),'utf8')).items.map(secret=>[secret.metadata.name,Object.fromEntries(Object.entries(secret.data).map(([k,v])=>[k,Buffer.from(v,'base64').toString()]))]));
  const secrets=decode('secrets.json'),venue=decode('venue-secret.json');
  assert.equal(secrets['swarm-pay-payment-secrets'].PAYPAL_TENTS_CLIENT_SECRET,'fixture-tents-client_secret');
  assert.equal(secrets['swarm-pay-payment-secrets'].PAYPAL_CATERING_WEBHOOK_ID,'fixture-catering-webhook_id');
  assert.equal(secrets['swarm-pay-commerce-secrets'].PAYPAL_CATERING_CLIENT_ID,'fixture-catering-client_id');
  assert.ok(!JSON.stringify(secrets['swarm-pay-commerce-secrets']).includes('client_secret'));
  assert.ok(!JSON.stringify(secrets).includes('VENUE_PRIVATE_KEY'));
  assert.deepEqual(Object.keys(venue),['swarm-pay-venue-secrets']);
  const signer=createPrivateKey({key:Buffer.from(venue['swarm-pay-venue-secrets'].VENUE_PRIVATE_KEY,'base64'),format:'der',type:'pkcs8'});
  assert.ok(createPublicKey(signer).export({type:'spki',format:'pem'})===readFileSync(resolve(output,'venue-public.pem'),'utf8'));
  assert.equal(statSync(resolve(output,'venue-secret.json')).mode&0o077,0);
  // An existing bootstrap gains the venue secret from the key it already admits, once.
  rmSync(resolve(output,'venue-secret.json'));
  const added=()=>spawnSync(process.execPath,['infra/azure/prepare-secrets.mjs','--venue-secret',output],{cwd:root,encoding:'utf8'});
  assert.equal(added().status,0);assert.deepEqual(decode('venue-secret.json'),venue);assert.notEqual(added().status,0);
  // A sandbox bootstrap without both merchants' settings creates nothing.
  writeFileSync(source,'AZURE_OPENAI_API_KEY=fixture-key\nAZURE_OPENAI_ENDPOINT=https://fixture.openai.azure.com/openai/v1\nAZURE_OPENAI_DEPLOYMENT=gpt-6-astra\nPAYPAL_TENTS_CLIENT_ID=only-one\n',{mode:0o600});
  const partial=spawnSync(process.execPath,['infra/azure/prepare-secrets.mjs',source,resolve(temporary,'partial'),'--sandbox'],{cwd:root,encoding:'utf8'});
  assert.notEqual(partial.status,0);assert.equal(existsSync(resolve(temporary,'partial')),false);
});
