import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// Stage a mounted secret with the UID and mode required by AgentSafe. Docker
// Desktop bind mounts otherwise retain the host owner's incompatible UID.
const [path,project,option]=process.argv.slice(2);
if(!path||!project||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(project)||option&&!['--replace'].includes(option))
  throw new Error('Usage: node demo/install-authority-key.mjs KEY_FILE COMPOSE_PROJECT [--replace]');
const bytes=readFileSync(path);
if(bytes.length>16384||!bytes.toString('utf8').trim())throw new Error('The key file must be nonempty and smaller than 16 KiB');
const volume=`${project}_authority-key`;
function docker(args,input) {
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000});
  if(result.status!==0)throw new Error(`Docker key installation failed. ${result.stderr.trim()}`);
  return result.stdout;
}
const script=`import{readFileSync,writeFileSync,chmodSync,chownSync,renameSync,existsSync}from'node:fs';
const path='/keys/decionis-api-key';
if(existsSync(path)&&process.argv[1]!=='--replace')throw new Error('A key is already installed; use --replace for intentional rotation');
const bytes=readFileSync(0);const next=path+'.next';
writeFileSync(next,bytes,{mode:0o600});chmodSync(next,0o600);chownSync(next,1000,1000);renameSync(next,path);bytes.fill(0);`;
try {
  docker(['volume','create','--label',`com.docker.compose.project=${project}`,'--label','com.docker.compose.volume=authority-key',volume]);
  docker(['run','--rm','-i','--network','none','--mount',`type=volume,source=${volume},target=/keys`,
    'node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9',
    'node','--input-type=module','-e',script,'--',option??'--install'],bytes);
  console.log(`Installed the key into ${volume} (UID 1000, mode 0600). Only AgentSafe mounts this volume. No authority request was made.`);
} finally {bytes.fill(0);}
