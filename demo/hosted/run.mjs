import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {setup,root,directory,environmentFile} from './setup.mjs';

const action=process.argv[2];
if(!['up','check','down'].includes(action))throw new Error('Usage: node demo/hosted/run.mjs up|check|down');
if(action==='down'&&!existsSync(environmentFile))process.exit(0);
const settings=setup();
const env={...process.env,...settings,COMPOSE_PROJECT_NAME:'swarm-pay-hosted-test',
  COMPOSE_FILE:[resolve(root,'compose.yml'),resolve(root,'demo/hosted/compose.yml')].join(process.platform==='win32'?';':':'),
  SWARM_TEST_URL:settings.SWARM_PUBLIC_ORIGIN,SWARM_HOSTED_TEST_URL:settings.SWARM_PUBLIC_ORIGIN,
  SWARM_WEBHOOK_TEST_URL:`http://localhost:${settings.WEBHOOK_PORT}`,
  SWARM_TEST_ENV:environmentFile,SWARM_TEST_VENUE_KEY_PATH:resolve(directory,'venue-private.pem'),
  NODE_EXTRA_CA_CERTS:resolve(directory,'tls.crt')};
function run(command,args,cwd=root) {
  const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
if(action==='up')run('docker',['compose','--env-file',environmentFile,'up','--build','-d','--wait','--wait-timeout','240']);
if(action==='down')run('docker',['compose','--env-file',environmentFile,'down','--volumes','--remove-orphans']);
if(action==='check') {
  run('node',['demo/check-hosted.mjs']);
  run('node',['demo/check-isolation.mjs']);
  run('node',['demo/check-webhook-ingress.mjs']);
  run('npm',['run','test:e2e','--','--project=hosted'],resolve(root,'apps/web'));
  run('node',['demo/check-hosted-agent.mjs']);
  run('docker',['compose','--env-file',environmentFile,'exec','-T','agentsafe','node','node_modules/@decionis/agentsafe/dist/Cli.js','verify','chain','/var/lib/agentsafe/evidence/evidence.jsonl']);
}
