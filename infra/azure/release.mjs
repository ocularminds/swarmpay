import {createHash,randomBytes} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';

const root=fileURLToPath(new URL('../../',import.meta.url));
const registry='decionisacr',resourceGroup='decionis-rg',server=`${registry}.azurecr.io`;
const repository='ocularminds/swarmpay',platform='linux/amd64';
export const components=['web','commerce-app','payment-executor','agentsafe','egress','venue','identity'];
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');

function execute(command,args,{captureOutput=false,...options}={}) {
  const result=spawnSync(command,args,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...options});
  if(result.status!==0) {
    const refusal=String(result.stderr??'').match(/\b(AuthorizationFailed|RequestsDisallowedForResource|TasksOperationsNotAllowed|Unauthorized|Forbidden)\b/)?.[1];
    const error=new Error(refusal?`${command} refused the request: ${refusal}`:`${command} failed; private command output was not printed`);
    error.refusal=refusal;
    if(captureOutput)error.privateOutput={stdout:result.stdout??'',stderr:result.stderr??'',exitCode:result.status};
    throw error;
  }
  return captureOutput?{stdout:result.stdout,stderr:result.stderr,exitCode:result.status}:result.stdout;
}
function save(file,value){writeFileSync(`${file}.tmp`,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(`${file}.tmp`,file);}
function json(run,command,args){try{return JSON.parse(run(command,args));}catch(error){if(error instanceof SyntaxError)throw new Error(`${command} returned invalid metadata; raw output was not printed`);throw error;}}
function sourceEntries(repo,commit,run) {
  return String(run('git',['ls-tree','-rz','--full-tree',commit],{cwd:repo})).split('\0').filter(Boolean).map(entry=>{
    const fields=entry.split('\t'),[metadata,path]=fields;
    if(fields.length!==2||!/^(100644|100755) blob [a-f0-9]{40}$/.test(metadata)||!path||path.split('/').some(p=>p==='..'||p==='')||privatePath(path))
      throw new Error('Committed source contains private material, a symlink or a submodule; review it before packaging');
    return {path:`source/${path}`,mode:metadata.startsWith('100755')?0o755:0o644,oid:metadata.split(' ')[2]};
  });
}
function privatePath(path) {
  const parts=path.split('/');
  return parts.some(p=>['.git','.local','.secrets','node_modules','build','dist','test-results','playwright-report'].includes(p)
    ||(p.startsWith('.env')&&p!=='.env.example')||/\.(pem|key|p12|jks|log)$/.test(p));
}
function materializeSource(repo,entries,directory,run) {
  const objects=run('git',['cat-file','--batch'],{cwd:repo,encoding:null,input:entries.map(file=>file.oid).join('\n')+'\n'});
  let offset=0;
  for(const file of entries) {
    const end=objects.indexOf(10,offset),header=objects.subarray(offset,end).toString('ascii').split(' '),size=Number(header[2]);
    if(end<offset||header[0]!==file.oid||header[1]!=='blob'||!Number.isSafeInteger(size)||size<0||end+1+size>=objects.length||objects[end+1+size]!==10)
      throw new Error('Git did not return the expected committed source objects');
    const destination=resolve(directory,file.path);
    mkdirSync(resolve(destination,'..'),{recursive:true,mode:0o700});
    writeFileSync(destination,objects.subarray(end+1,end+1+size),{mode:file.mode,flag:'wx'});
    offset=end+size+2;
  }
  if(offset!==objects.length)throw new Error('Git returned unexpected source objects');
}
function files(directory,prefix='') {
  return readdirSync(resolve(directory,prefix)).sort().flatMap(name=>{
    const path=prefix?`${prefix}/${name}`:name,stat=lstatSync(resolve(directory,path));
    if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||privatePath(path))throw new Error('The release context contains a private path or non-regular file');
    if(stat.isDirectory())return files(directory,path);
    const contents=readFileSync(resolve(directory,path));
    return [{path,mode:stat.mode&0o111?0o755:0o644,sha256:hash(contents),oid:createHash('sha1').update(`blob ${contents.length}\0`).update(contents).digest('hex')}];
  });
}
export function taskDefinition(commit,tag) {
  if(!sha(commit)||!new RegExp(`^${commit}-[a-f0-9]{12}$`).test(tag))throw new Error('Invalid release tag');
  const label=`--label org.opencontainers.image.revision=${commit} --label org.opencontainers.image.source=https://github.com/${repository}`;
  const build=(component,file,context,extra='')=>({build:`${label} ${extra} -t ${server}/swarm-pay/${component}:${tag} -f ${file} ${context}`.trim()});
  return {version:'v1.1.0',stepTimeout:1800,env:['DOCKER_BUILDKIT=1'],steps:[
    build('web','source/apps/web/Dockerfile','source/apps/web'),
    build('commerce-app','source/infra/java.Dockerfile','source','--build-arg APP=commerce-app'),
    build('payment-executor','source/infra/java.Dockerfile','source','--build-arg APP=payment-executor'),
    build('agentsafe','source/infra/agentsafe/Dockerfile','source/infra/agentsafe'),
    build('egress','source/infra/egress/Dockerfile','source/infra/egress'),
    build('venue','source/infra/venue/Dockerfile','source/infra/venue'),
    build('identity','source/infra/identity/Dockerfile','source/infra/identity'),
    {push:components.map(component=>`${server}/swarm-pay/${component}:${tag}`)}
  ]};
}

function queuedRun(output) {
  const {stdout,stderr}=typeof output==='string'?{stdout:output,stderr:''}:output;
  if(stdout.trim())return json(()=>stdout,'az',[]);
  // Azure CLI suppresses JSON for --no-wait; its queued-run warning is the submission receipt.
  const matches=[...stderr.matchAll(/^(?:WARNING: )?Queued a run with ID: ([a-zA-Z0-9_-]{1,100})\s*$/gm)];
  if(matches.length!==1)throw new Error('Azure did not return a unique build identity; private output was retained');
  return {runId:matches[0][1]};
}

export function prepareRelease(commit,destination,{repo=root,run=execute}={}) {
  if(!sha(commit))throw new Error('Use a full commit SHA from the merged master branch');
  const output=resolve(destination),record=resolve(output,'release.json');
  if(existsSync(output))throw new Error('Release directory exists; its source and build record were preserved');
  run('git',['merge-base','--is-ancestor',commit,'origin/master'],{cwd:repo});
  run('git',['check-ignore','-q',record],{cwd:repo});
  const tree=String(run('git',['rev-parse',`${commit}^{tree}`],{cwd:repo})).trim();
  const tag=`${commit}-${randomBytes(6).toString('hex')}`,context=resolve(output,'context');
  const entries=sourceEntries(repo,commit,run);
  mkdirSync(resolve(context,'source'),{recursive:true,mode:0o700});
  materializeSource(repo,entries,context,run);
  const recipe=taskDefinition(commit,tag);
  writeFileSync(resolve(context,'task.yaml'),JSON.stringify(recipe,null,2)+'\n',{mode:0o600,flag:'wx'});
  const contextFiles=files(context);
  const configured=existsSync(resolve(repo,'.env'))?parseEnv(readFileSync(resolve(repo,'.env'),'utf8')):{};
  const secrets=Object.entries(configured).filter(([name,value])=>/(?:^|_)(?:KEY|SECRET|PASSWORD|TOKEN)$/.test(name)&&value.length>=12).flatMap(([,value])=>[value,Buffer.from(value).toString('base64')]);
  for(const file of contextFiles) {
    const contents=readFileSync(resolve(context,file.path)).toString();
    if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)||secrets.some(secret=>contents.includes(secret)))
      throw new Error('Private credential material was found in the committed source; nothing was uploaded');
  }
  const release={version:1,commit,tree,registry:server,resourceGroup,repository,platform,tag,
    contextSha256:hash(JSON.stringify(contextFiles)),files:contextFiles,state:'PREPARED',ci:null,runId:null,images:null};
  save(record,release);return release;
}

function loadRelease(directory,repo,run) {
  const record=resolve(directory,'release.json'),release=JSON.parse(readFileSync(record,'utf8'));
  if(release.version!==1||!sha(release.commit)||!sha(release.tree)||release.registry!==server||release.resourceGroup!==resourceGroup||release.repository!==repository||release.platform!==platform
    ||(release.runId!==null&&(typeof release.runId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(release.runId)))
    ||!new RegExp(`^${release.commit}-[a-f0-9]{12}$`).test(release.tag))throw new Error('Release identity does not match the approved Azure target');
  const context=resolve(directory,'context');
  run('git',['merge-base','--is-ancestor',release.commit,'origin/master'],{cwd:repo});
  const tree=String(run('git',['rev-parse',`${release.commit}^{tree}`],{cwd:repo})).trim();
  const current=files(context),source=current.filter(file=>file.path.startsWith('source/'));
  const expected=sourceEntries(repo,release.commit,run);
  if(tree!==release.tree||source.length!==expected.length||expected.some(file=>!source.some(actual=>actual.path===file.path&&actual.mode===file.mode&&actual.oid===file.oid)))
    throw new Error('Build context does not match the committed Git source');
  if(hash(JSON.stringify(current))!==release.contextSha256
    ||JSON.stringify(JSON.parse(readFileSync(resolve(context,'task.yaml'),'utf8')))!==JSON.stringify(taskDefinition(release.commit,release.tag)))
    throw new Error('Release source or build recipe changed after packaging; nothing was uploaded');
  return {record,release,context};
}

export function submitRelease(directory,{repo=root,run=execute}={}) {
  const {record,release,context}=loadRelease(directory,repo,run);
  if(release.state!=='PREPARED')throw new Error('This release already has a submission record; inspect it rather than queueing another build');
  const runs=json(run,'gh',['run','list','--repo',repository,'--branch','master','--commit',release.commit,'--workflow','verify.yml','--limit','10','--json','databaseId,headSha,status,conclusion,event']);
  const passed=runs.find(r=>r.headSha===release.commit&&r.status==='completed'&&r.conclusion==='success'&&r.event==='push'&&Number.isSafeInteger(r.databaseId));
  if(!passed)throw new Error('A successful master verification run is required before publishing this commit');
  const target=json(run,'az',['acr','show','--name',registry,'--resource-group',resourceGroup,'--query','{loginServer:loginServer,roleAssignmentMode:roleAssignmentMode}','--output','json','--only-show-errors']);
  if(target.loginServer!==server||target.roleAssignmentMode!=='LegacyRegistryPermissions')throw new Error('Registry identity or authorization mode changed; review the release configuration');
  try {writeFileSync(resolve(directory,'submission.claim'),new Date().toISOString()+'\n',{mode:0o600,flag:'wx'});}
  catch {throw new Error('Could not exclusively claim this submission; inspect the preserved record before another attempt');}
  release.ci={id:passed.databaseId,url:`https://github.com/${repository}/actions/runs/${passed.databaseId}`};
  release.state='SUBMITTING';release.submittedAt=new Date().toISOString();save(record,release);
  try {
    const output=run('az',['acr','run','--registry',registry,'--resource-group',resourceGroup,'--file','task.yaml','--platform',platform,
      '--timeout','3600','--no-wait','--no-logs','--output','json','--query','{runId:runId,status:status}',context],{captureOutput:true});
    save(resolve(directory,'submission-response.json'),output);
    const queued=queuedRun(output);
    if(typeof queued.runId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(queued.runId))throw new Error('Azure did not return a usable build identity');
    release.runId=queued.runId;release.state='QUEUED';save(record,release);return release;
  } catch(error) {
    if(error.privateOutput)save(resolve(directory,'submission-response.json'),error.privateOutput);
    release.state=error.refusal?'REJECTED':'SUBMISSION_UNKNOWN';release.failure=error.refusal??'NO_CONFIRMED_RUN_ID';save(record,release);throw error;
  }
}

export function verifiedImages(release,result) {
  if(result.status!=='Succeeded'||result.platform?.os?.toLowerCase()!=='linux'||result.platform?.architecture!=='amd64')throw new Error('The Azure build must succeed on linux/amd64 before images can be released');
  if(!Array.isArray(result.outputImages))throw new Error('The build must return its image identities');
  const images={};
  for(const component of components) {
    const matches=(result.outputImages??[]).filter(i=>i.registry===server&&i.repository===`swarm-pay/${component}`&&i.tag===release.tag&&digest(i.digest));
    if(matches.length!==1)throw new Error(`The successful run must identify exactly one matching ${component} digest`);
    images[component]=`${server}/swarm-pay/${component}@${matches[0].digest}`;
  }
  if(result.outputImages.length!==components.length)throw new Error('The build returned unexpected images');
  return images;
}

export function collectRelease(directory,{repo=root,run=execute}={}) {
  const {record,release}=loadRelease(directory,repo,run);
  if(!release.runId||!['QUEUED','RUNNING','PUBLISHED','FAILED'].includes(release.state))throw new Error('No confirmed Azure run is available; do not retry an ambiguous submission');
  const result=json(run,'az',['acr','task','show-run','--registry',registry,'--resource-group',resourceGroup,'--run-id',release.runId,
    '--query','{status:status,platform:platform,outputImages:outputImages}','--output','json','--only-show-errors']);
  if(['Queued','Started','Running'].includes(result.status)){release.state='RUNNING';save(record,release);return release;}
  if(result.status!=='Succeeded'){release.state='FAILED';save(record,release);throw new Error('The Azure build failed; no deployment image map was generated');}
  const images=verifiedImages(release,result);
  for(const component of components) {
    const expected=images[component].split('@')[1];
    const image=json(run,'az',['acr','repository','show','--name',registry,'--image',`swarm-pay/${component}@${expected}`,
      '--query','{digest:digest}','--output','json','--only-show-errors']);
    if(image.digest!==expected)throw new Error('Registry manifest does not match the completed Azure run');
  }
  release.images=images;release.state='PUBLISHED';save(record,release);save(resolve(directory,'images.json'),images);return release;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [action,value,destination]=process.argv.slice(2);
    const output=action==='prepare'?resolve(destination??`.local/azure/releases/${value}`):resolve(value??'.');
    const result=action==='prepare'?prepareRelease(value,output):action==='submit'?submitRelease(output):action==='collect'?collectRelease(output):null;
    if(!result)throw new Error('Usage: node infra/azure/release.mjs prepare <merged-commit-sha> [private-directory] | submit <directory> | collect <directory>');
    console.log(JSON.stringify({state:result.state,commit:result.commit,runId:result.runId,ci:result.ci,images:result.images,directory:output},null,2));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
