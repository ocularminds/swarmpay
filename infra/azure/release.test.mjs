import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,chmodSync,symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareRelease,submitRelease,collectRelease,verifiedImages,components} from './release.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
function local(command,args,options={}) {
  const result=spawnSync(command,args,{encoding:'utf8',...options});
  if(result.status!==0)throw new Error(`${command} fixture failed`);
  return result.stdout;
}
function fixture(t) {
  mkdirSync(resolve(root,'.local'),{recursive:true});
  const repo=mkdtempSync(resolve(root,'.local/release-test-'));
  t.after(()=>rmSync(repo,{recursive:true,force:true}));
  const git=(...args)=>local('git',args,{cwd:repo});
  git('init','--initial-branch=master');git('config','user.name','SwarmPay Test');git('config','user.email','test@swarmpay.invalid');git('config','commit.gpgsign','false');git('config','core.hooksPath','/dev/null');
  const write=(file,text)=>{mkdirSync(resolve(repo,file,'..'),{recursive:true});writeFileSync(resolve(repo,file),text);};
  write('.gitignore','.local/\n.env\n');
  write('.gitattributes','* text=auto eol=lf\n*.bat text eol=crlf\n');
  for(const file of ['apps/web/Dockerfile','infra/java.Dockerfile','infra/agentsafe/Dockerfile','infra/egress/Dockerfile'])write(file,'FROM scratch\n');
  write('gradlew','#!/bin/sh\nexit 0\n');chmodSync(resolve(repo,'gradlew'),0o755);
  write('gradlew.bat','@rem Committed with LF\nexit 0\n');
  write('fixture.bin',Buffer.from([0,255,128,10,13,0]));
  const commit=()=>{git('add','.');git('commit','--quiet','-m','Fixture source');return git('rev-parse','HEAD').trim();};
  const sha=commit();git('update-ref','refs/remotes/origin/master',sha);
  return {repo,git,write,commit,sha,output:resolve(repo,'.local/release')};
}
function cloud(f,overrides={}) {
  const calls=[];
  const run=(command,args,options)=>{
    if(command==='git')return local(command,args,options);
    calls.push({command,args});
    if(command==='gh')return JSON.stringify(overrides.ci??[{databaseId:123,headSha:f.sha,status:'completed',conclusion:'success',event:'push'}]);
    if(args[1]==='show')return JSON.stringify(overrides.target??{loginServer:'decionisacr.azurecr.io',roleAssignmentMode:'LegacyRegistryPermissions'});
    if(args[1]==='run') {if(overrides.submitError)throw overrides.submitError;return overrides.submitOutput??JSON.stringify({runId:'fixture-run',status:'Queued'});}
    if(args[1]==='task')return JSON.stringify(overrides.result);
    if(args[1]==='repository')return JSON.stringify({digest:overrides.registryDigest??args[args.indexOf('--image')+1].split('@')[1]});
    throw new Error('Unexpected external operation');
  };
  return {run,repo:f.repo,calls};
}
function complete(release) {return {status:'Succeeded',platform:{os:'linux',architecture:'amd64'},outputImages:components.map((component,index)=>({registry:'decionisacr.azurecr.io',repository:`swarm-pay/${component}`,tag:release.tag,digest:`sha256:${String(index).repeat(64)}`}))};}

test('the uploaded context comes from Git, preserves executable files, and excludes local settings and work in progress',t=>{
  const f=fixture(t);f.write('apps/web/Dockerfile','uncommitted-change');f.write('.env','ORGANIZER_PASSWORD=private-untracked-fixture-password\nVENUE_PUBLIC_KEY_HOST_FILE=source/apps/web/Dockerfile\n');f.write('.local/browser-trace','private-session');
  const release=prepareRelease(f.sha,f.output,{repo:f.repo});
  assert.equal(readFileSync(resolve(f.output,'context/source/apps/web/Dockerfile'),'utf8'),'FROM scratch\n');
  assert.equal(readFileSync(resolve(f.output,'context/source/gradlew.bat'),'utf8'),'@rem Committed with LF\nexit 0\n');
  assert.deepEqual(readFileSync(resolve(f.output,'context/source/fixture.bin')),Buffer.from([0,255,128,10,13,0]));
  assert.ok(!existsSync(resolve(f.output,'context/source/.env')));assert.ok(!existsSync(resolve(f.output,'context/source/.local')));
  assert.equal(release.files.find(file=>file.path==='source/gradlew').mode,0o755);
  const task=JSON.parse(readFileSync(resolve(f.output,'context/task.yaml'),'utf8'));
  assert.ok(task.env.includes('DOCKER_BUILDKIT=1'));assert.equal(task.steps.length,6);
  assert.equal(task.steps[5].push.length,5);assert.ok(task.steps[0].build.includes(`org.opencontainers.image.revision=${f.sha}`));
  for(const step of task.steps.filter(s=>s.build))assert.ok(existsSync(resolve(f.output,'context',step.build.split(' -f ')[1].split(' ')[0])));
  assert.throws(()=>prepareRelease(f.sha,f.output,{repo:f.repo}),/preserved/);
});

test('unmerged commits, tracked secret paths and symlink source entries cannot be packaged',t=>{
  const f=fixture(t);f.write('new.txt','new source');const newer=f.commit();
  assert.throws(()=>prepareRelease(newer,f.output,{repo:f.repo}));assert.equal(existsSync(f.output),false);
  symlinkSync('/etc/passwd',resolve(f.repo,'source-link'));const linked=f.commit();f.git('update-ref','refs/remotes/origin/master',linked);
  assert.throws(()=>prepareRelease(linked,f.output,{repo:f.repo}),/symlink/);assert.equal(existsSync(f.output),false);
  f.git('rm','source-link');f.write('leaked.key','fixture-key');const key=f.commit();f.git('update-ref','refs/remotes/origin/master',key);
  assert.throws(()=>prepareRelease(key,f.output,{repo:f.repo}),/private material/);
});

test('a configured credential accidentally committed under an ordinary filename is refused before upload',t=>{
  const f=fixture(t);f.write('.env','AZURE_OPENAI_API_KEY=private-fixture-key-which-must-stay-local\n');f.write('notes.txt','private-fixture-key-which-must-stay-local');
  const sha=f.commit();f.git('update-ref','refs/remotes/origin/master',sha);
  assert.throws(()=>prepareRelease(sha,f.output,{repo:f.repo}),/credential material/);
  assert.equal(existsSync(resolve(f.output,'release.json')),false);
});

test('source edits after packaging are refused before any cloud request',t=>{
  const f=fixture(t);prepareRelease(f.sha,f.output,{repo:f.repo});f.write('.local/release/context/source/apps/web/Dockerfile','different source');
  const adapter=cloud(f);assert.throws(()=>submitRelease(f.output,adapter),/committed Git source/);assert.equal(adapter.calls.length,0);
});

test('publication requires successful CI for the exact commit and the approved registry',t=>{
  const f=fixture(t);prepareRelease(f.sha,f.output,{repo:f.repo});
  const failed=cloud(f,{ci:[{databaseId:123,headSha:f.sha,status:'completed',conclusion:'failure',event:'push'}]});
  assert.throws(()=>submitRelease(f.output,failed),/successful master/);assert.equal(failed.calls.filter(c=>c.command==='az').length,0);
  const wrong=cloud(f,{target:{loginServer:'other.azurecr.io',roleAssignmentMode:'LegacyRegistryPermissions'}});
  assert.throws(()=>submitRelease(f.output,wrong),/Registry identity/);assert.equal(wrong.calls.filter(c=>c.args[1]==='run').length,0);
  const adapter=cloud(f,{submitOutput:{stdout:'',stderr:'WARNING: Uploading archived source code...\nWARNING: Queued a run with ID: fixture-run\n',exitCode:0}});const release=submitRelease(f.output,adapter);
  assert.equal(release.state,'QUEUED');assert.equal(release.runId,'fixture-run');
  const queued=adapter.calls.find(c=>c.args[1]==='run');assert.ok(queued.args.includes('--no-wait'));assert.ok(queued.args.includes('--no-logs'));assert.ok(queued.args.includes('linux/amd64'));
  assert.ok(!queued.args.includes('--only-show-errors'));
  assert.throws(()=>submitRelease(f.output,adapter),/submission record/);assert.equal(adapter.calls.filter(c=>c.args[1]==='run').length,1);
  const concurrent=fixture(t);prepareRelease(concurrent.sha,concurrent.output,{repo:concurrent.repo});
  concurrent.write('.local/release/submission.claim','another process claimed this prepared release');
  const duplicate=cloud(concurrent);assert.throws(()=>submitRelease(concurrent.output,duplicate),/exclusively claim/);
  assert.equal(duplicate.calls.filter(c=>c.args[1]==='run').length,0);
});

test('a lost or malformed submission response keeps an indeterminate record and cannot queue a second build',t=>{
  for(const submitOutput of ['private-output-that-must-not-be-printed',{stdout:'',stderr:''},
    {stdout:'',stderr:'WARNING: Queued a run with ID: first\nWARNING: Queued a run with ID: second\n'}]) {
    const f=fixture(t);prepareRelease(f.sha,f.output,{repo:f.repo});const adapter=cloud(f,{submitOutput});
    assert.throws(()=>submitRelease(f.output,adapter),error=>/invalid metadata|unique build identity/.test(error.message)&&!error.message.includes('private-output'));
    assert.equal(JSON.parse(readFileSync(resolve(f.output,'release.json'))).state,'SUBMISSION_UNKNOWN');
    assert.throws(()=>submitRelease(f.output,adapter),/submission record/);assert.throws(()=>collectRelease(f.output,adapter),/No confirmed/);
    assert.equal(adapter.calls.filter(c=>c.args[1]==='run').length,1);assert.equal(existsSync(resolve(f.output,'images.json')),false);
  }
});

test('an explicit Azure authorization refusal remains rejected without resubmission',t=>{
  const f=fixture(t);prepareRelease(f.sha,f.output,{repo:f.repo});
  const submitError=Object.assign(new Error('Request refused'),{refusal:'AuthorizationFailed'}),adapter=cloud(f,{submitError});
  assert.throws(()=>submitRelease(f.output,adapter),/Request refused/);
  assert.equal(JSON.parse(readFileSync(resolve(f.output,'release.json'))).state,'REJECTED');
  assert.throws(()=>submitRelease(f.output,adapter),/submission record/);
  assert.equal(adapter.calls.filter(c=>c.args[1]==='run').length,1);assert.equal(existsSync(resolve(f.output,'images.json')),false);
});

test('a build only yields deployable images when all five run identities and registry digests agree',t=>{
  const f=fixture(t);prepareRelease(f.sha,f.output,{repo:f.repo});const release=submitRelease(f.output,cloud(f));
  const result=complete(release),adapter=cloud(f,{result});
  const completeRelease=collectRelease(f.output,adapter);assert.equal(completeRelease.state,'PUBLISHED');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(resolve(f.output,'images.json')))),components);
  assert.equal(adapter.calls.filter(c=>c.args[1]==='repository').length,5);
  const wrong=cloud(f,{result,registryDigest:`sha256:${'f'.repeat(64)}`});assert.throws(()=>collectRelease(f.output,wrong),/Registry manifest/);
  for(const change of [
    r=>r.status='Running',r=>r.platform.architecture='arm64',r=>r.outputImages.pop(),
    r=>r.outputImages[0].registry='other.azurecr.io',r=>r.outputImages[0].tag='different-commit',
    r=>r.outputImages[0].digest='sha256:invalid',r=>r.outputImages.push(r.outputImages[0])
  ]){const altered=structuredClone(result);change(altered);assert.throws(()=>verifiedImages(release,altered));}
});

test('running and failed tasks never emit a deployment image map',t=>{
  const f=fixture(t);prepareRelease(f.sha,f.output,{repo:f.repo});submitRelease(f.output,cloud(f));
  assert.equal(collectRelease(f.output,cloud(f,{result:{status:'Running'}})).state,'RUNNING');
  assert.throws(()=>collectRelease(f.output,cloud(f,{result:{status:'Failed'}})),/Azure build failed/);
  assert.equal(existsSync(resolve(f.output,'images.json')),false);
});
