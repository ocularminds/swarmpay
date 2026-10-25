import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,statSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
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
  const secrets=Object.fromEntries(JSON.parse(text).items.map(secret=>[secret.metadata.name,Object.fromEntries(Object.entries(secret.data).map(([k,v])=>[k,Buffer.from(v,'base64').toString()]))]));
  assert.equal(secrets['commerce-secrets'].AZURE_OPENAI_API_KEY,'fixture-azure-key');
  assert.equal(secrets['commerce-secrets'].DATABASE_PASSWORD,secrets['postgres-secrets'].PG_APP_PASSWORD);
  assert.equal(secrets['payment-secrets'].DATABASE_PASSWORD,secrets['postgres-secrets'].PG_EXECUTOR_PASSWORD);
  assert.notEqual(secrets['commerce-secrets'].DATABASE_PASSWORD,secrets['payment-secrets'].DATABASE_PASSWORD);
  assert.equal(secrets['commerce-secrets'].EXECUTOR_TOKEN,secrets['payment-secrets'].EXECUTOR_TOKEN);
  assert.ok(!JSON.stringify(secrets['payment-secrets']).includes('AZURE'));
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
