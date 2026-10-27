import {randomBytes,generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,readFileSync,chmodSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const root=fileURLToPath(new URL('../../',import.meta.url));
export const directory=resolve(root,'.local/hosted');
export const environmentFile=resolve(directory,'.env');

export function setup() {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const key=resolve(directory,'venue-private.pem'),publicKey=resolve(directory,'venue-public.pem');
  if(existsSync(key)!==existsSync(publicKey))throw new Error('The hosted fixture keypair is incomplete; it was left unchanged.');
  if(!existsSync(key)) {
    const pair=generateKeyPairSync('ed25519');
    writeFileSync(key,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
    writeFileSync(publicKey,pair.publicKey.export({type:'spki',format:'pem'}),{mode:0o644,flag:'wx'});
  }
  // Only the simulated venue container receives its signing key.
  const venueKey=()=>createPrivateKey(readFileSync(key)).export({type:'pkcs8',format:'der'}).toString('base64');
  if(!existsSync(environmentFile)) {
    const secret=()=>randomBytes(32).toString('hex');
    const config={SWARM_MODE:'demo',SWARM_AI_PROVIDER:'demo',SWARM_PUBLIC_ORIGIN:'https://localhost:5443',SWARM_SESSION_COOKIE_SECURE:'true',
      WEB_PORT:'5177',WEBHOOK_PORT:'5188',HOSTED_TLS_PORT:'5443',PG_ADMIN_PASSWORD:secret(),PG_APP_PASSWORD:secret(),PG_EXECUTOR_PASSWORD:secret(),
      EXECUTOR_TOKEN:secret(),MCP_TOKEN:secret(),ORGANIZER_USERNAME:'organizer',ORGANIZER_PASSWORD:secret(),
      DECIONIS_POLICY_VERSION:'swarm-pay-demo-v1',DECIONIS_TENANT_ID:'',VENUE_ISSUER:'demo-venue-fixture',VENUE_PUBLIC_KEY_HOST_FILE:publicKey,VENUE_PRIVATE_KEY:venueKey(),
      OPENAI_API_KEY:'',OPENAI_MODEL:'gpt-6-astra',AZURE_OPENAI_API_KEY:'',AZURE_OPEANAI_KEY:'',AZURE_OPENAI_ENDPOINT:'',AZURE_OPENAI_URL:'',
      AZURE_OPENAI_DEPLOYMENT:'',AZURE_OPENAI_LLM:'',
      ...Object.fromEntries(['TENTS','CATERING'].flatMap(merchant=>['CLIENT_ID','CLIENT_SECRET','MERCHANT_ID','WEBHOOK_ID'].map(suffix=>[`PAYPAL_${merchant}_${suffix}`,''])))};
    writeFileSync(environmentFile,Object.entries(config).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
  }
  if(!/^VENUE_PRIVATE_KEY=./m.test(readFileSync(environmentFile,'utf8')))appendFileSync(environmentFile,`VENUE_PRIVATE_KEY=${venueKey()}\n`);
  const config=parseEnv(readFileSync(environmentFile,'utf8'));
  if(config.SWARM_MODE!=='demo'||config.SWARM_AI_PROVIDER!=='demo'||config.SWARM_PUBLIC_ORIGIN!=='https://localhost:5443')
    throw new Error('The hosted rehearsal requires its isolated synthetic localhost configuration.');
  chmodSync(environmentFile,0o600);
  const certificate=resolve(directory,'tls.crt'),privateKey=resolve(directory,'tls.key');
  const current=existsSync(certificate)&&existsSync(privateKey)&&spawnSync('openssl',['x509','-checkend','3600','-noout','-in',certificate],{stdio:'ignore'}).status===0;
  if(!current) {
    const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',privateKey,'-out',certificate,'-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'pipe'});
    if(result.status!==0)throw new Error('Could not generate the local HTTPS fixture certificate.');
    chmodSync(privateKey,0o600);
  }
  return config;
}
