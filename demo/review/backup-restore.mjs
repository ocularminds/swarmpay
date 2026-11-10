import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createServer} from 'node:net';
import {fixtureSession} from './session.mjs';
import {sourceEvidence} from './source-evidence.mjs';

// Two newly created demo projects: seed through the actual REST/MCP stack, then restore its database and journal.
// The existing localhost rehearsal supplies built images and synthetic configuration; its data is never changed.
const root=fileURLToPath(new URL('../../',import.meta.url));
const seedFile=resolve(root,'.local/hosted/.env'),settings=parseEnv(readFileSync(seedFile,'utf8'));
assert.equal(settings.SWARM_MODE,'demo');assert.equal(settings.SWARM_AI_PROVIDER,'demo');
const donorConfig=await(await fetch('https://localhost:5443/api/config',{signal:AbortSignal.timeout(10000)})).json();
assert.equal(donorConfig.mode,'demo','The image donor must use simulated payments');
const snapshot=mkdtempSync(join(tmpdir(),'swarmpay-restore-'));
const sourceName=`swarm-pay-review-source-${randomUUID().slice(0,8)}`,restoredName=`swarm-pay-review-restore-${randomUUID().slice(0,8)}`;
const services=['postgres','payment-executor','agentsafe','commerce-app','web','venue','identity','egress'];
const donor=['compose','--env-file',seedFile,'-p','swarm-pay-hosted-test','-f',resolve(root,'compose.yml'),'-f',resolve(root,'demo/hosted/compose.yml')];
let lastAction='initialization';
function run(args,input) {lastAction=args.filter(a=>!a.startsWith('/')).slice(0,12).join(' ');return execFileSync('docker',args,{cwd:root,input,maxBuffer:96*1024*1024,stdio:['pipe','pipe','pipe']});}
const port=()=>new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const number=server.address().port;server.close(()=>resolve(number));});});
const images={services:{}};
for(const service of services) {
  const id=run([...donor,'ps','-q',service]).toString().trim();assert.ok(id,`Start the built ${service} fixture first`);
  images.services[service]={image:run(['inspect','--format','{{.Config.Image}}',id]).toString().trim()};
}
const imageFile=join(snapshot,'images.json');writeFileSync(imageFile,JSON.stringify(images),{mode:0o600});
async function project(name) {
  const webPort=await port(),webhookPort=await port(),base=`http://127.0.0.1:${webPort}`;
  const environmentFile=join(snapshot,`${name}.env`);
  const env={...settings,WEB_PORT:String(webPort),WEBHOOK_PORT:String(webhookPort),SWARM_PUBLIC_ORIGIN:'',SWARM_SESSION_COOKIE_SECURE:'false'};
  writeFileSync(environmentFile,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
  const args=['compose','--env-file',environmentFile,'-p',name,'-f',resolve(root,'compose.yml'),'-f',imageFile];
  return {base,environmentFile,run:(extra,input)=>run([...args,...extra],input)};
}
const source=await project(sourceName),restored=await project(restoredName);
const verifyChain=['exec','-T','agentsafe','node','node_modules/@decionis/agentsafe/dist/Cli.js','verify','chain','/var/lib/agentsafe/evidence/evidence.jsonl'];
const countsSql="SELECT json_build_object('plans',(SELECT count(*) FROM commerce.plans),'orders',(SELECT count(*) FROM commerce.orders),'commands',(SELECT count(*) FROM commerce.commands),'events',(SELECT count(*) FROM commerce.events),'receipts',(SELECT count(*) FROM commerce.receipts),'reservations',(SELECT count(*) FROM commerce.reservations),'planningMeasurements',(SELECT count(*) FROM commerce.planning_measurements))";
const counts=project=>JSON.parse(project.run(['exec','-T','postgres','psql','-U','postgres','-d','swarm','-Atc',countsSql]).toString());
let sourceCreated=false,restoredCreated=false;
try {
  sourceCreated=true;source.run(['up','-d','--no-build','--wait','--wait-timeout','180']);
  execFileSync(process.execPath,[resolve(root,'demo/smoke.mjs')],{cwd:root,stdio:'pipe',env:{...process.env,
    SWARM_TEST_URL:source.base,SWARM_TEST_ENV:source.environmentFile,SWARM_TEST_OUTPUT_DIR:snapshot,SWARM_TEST_VENUE_KEY_PATH:resolve(root,'.local/hosted/venue-private.pem')}});
  source.run(verifyChain);
  const original=JSON.parse(readFileSync(join(snapshot,'smoke-workflow.json'),'utf8'));
  const originalCommands=JSON.parse(readFileSync(join(snapshot,'smoke-evidence.json'),'utf8')).commands.map(c=>c.command.id).sort();
  assert.equal(original.mode,'demo');assert.equal(original.capturedMinor,140000);
  const sourceAgent=source.run(['ps','-q','agentsafe']).toString().trim();
  source.run(['stop','commerce-app','venue','agentsafe','payment-executor']);
  const before=counts(source);
  const dump=source.run(['exec','-T','postgres','pg_dump','-U','postgres','-d','swarm','--format=custom']);
  writeFileSync(join(snapshot,'database.dump'),dump,{mode:0o600});
  run(['cp',`${sourceAgent}:/var/lib/agentsafe/evidence`,join(snapshot,'journal')]);
  // Release this run's networks before creating the second stack; Docker Desktop's default subnet pool is finite.
  source.run(['down','--remove-orphans']);
  console.log('PASS: fresh REST/MCP fixture, verified native chain and quiesced database/journal snapshot');

  const started=Date.now();restoredCreated=true;
  restored.run(['up','-d','--no-build','--wait','--wait-timeout','90','postgres']);
  restored.run(['exec','-T','postgres','pg_restore','-U','postgres','-d','swarm','--clean','--if-exists'],dump);
  assert.deepEqual(counts(restored),before,'Restored row counts match before services restart');
  restored.run(['create','--no-build','agentsafe']);
  run(['run','--rm','--network','none','--user','0','-v',`${restoredName}_authority-evidence:/restore`,'-v',`${join(snapshot,'journal')}:/snapshot:ro`,images.services.agentsafe.image,
    'sh','-c','cp -a /snapshot/. /restore/\nchown -R 1000:1000 /restore']);
  restored.run(['up','-d','--no-build','--wait','--wait-timeout','180']);
  const {request}=await fixtureSession(restored.base,restored.environmentFile);
  const path=`/api/plans/${original.plan.id}`,after=await request(path);
  assert.equal(after.capturedMinor,original.capturedMinor);assert.equal(after.committedMinor,original.committedMinor);
  assert.equal((await request(path+'/evidence')).applicationChainVerified,true);
  await request(path+'/milestone',{method:'POST'});
  const replayed=await request(path),commands=await request(path+'/commands');
  assert.equal(replayed.capturedMinor,140000);assert.deepEqual(commands.map(c=>c.command.id).sort(),originalCommands);
  restored.run(verifyChain);
  const report={date:new Date().toISOString(),environment:'two newly created isolated demo Compose projects; simulated payments, model and venue',
    ...sourceEvidence(root),
    snapshotSha256:createHash('sha256').update(dump).digest('hex'),snapshotBytes:dump.length,restoredRows:before,
    restoreAndReplayMillis:Date.now()-started,applicationChainVerified:true,nativeAuthorityChainVerified:true,
    capturedBeforeMinor:original.capturedMinor,capturedAfterReplayMinor:replayed.capturedMinor,preservedCommandCount:commands.length,
    scope:'Both database schemas, role grants and native evidence journal restored. Same milestone replayed without another capture. No existing journal was reset or repaired. This does not validate production retention, encryption, recovery objectives or operational ownership.'};
  const output=resolve(root,process.env.SWARM_RESTORE_REPORT??'docs/review/evidence/technical/restore.json');mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log('PASS: restored data and both chains; payment replay preserves five command identities and the $1,400 total');
} catch(error) {
  if(error?.stderr) {
    let diagnostic=error.stderr.toString();for(const value of Object.values(settings))if(value.length>8)diagnostic=diagnostic.split(value).join('[redacted]');
    const path=join(tmpdir(),`swarmpay-restore-diagnostic-${Date.now()}.log`);writeFileSync(path,diagnostic,{mode:0o600});
    throw new Error(`Restore rehearsal failed (exit ${error.status}) during ${lastAction}; private diagnostic: ${path}`);
  }
  throw error;
} finally {
  if(restoredCreated)restored.run(['down','--volumes','--remove-orphans']);
  if(sourceCreated)source.run(['down','--volumes','--remove-orphans']);
  rmSync(snapshot,{recursive:true,force:true});
}
