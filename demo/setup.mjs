import { randomBytes, generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const option=process.argv[2];
if(option&&option!=='--sandbox')throw new Error('Usage: node demo/setup.mjs [--sandbox]');
const mode=option==='--sandbox'?'sandbox':'demo';
const file=resolve(root,mode==='demo'?'.env':'.env.sandbox');
const privatePath=resolve(root,'.secrets/venue-private.pem'),publicPath=resolve(root,'.secrets/venue-public.pem');
// The simulated venue container signs with this key; it reaches no other service.
function venueKeyLine(admittedPublicPath) {
  const key=createPrivateKey(readFileSync(privatePath));
  const admitted=createPublicKey(readFileSync(admittedPublicPath)).export({type:'spki',format:'der'});
  if(!createPublicKey(key).export({type:'spki',format:'der'}).equals(admitted))
    throw new Error('The venue private key does not match the admitted venue public key. The configuration was left unchanged.');
  return `VENUE_PRIVATE_KEY=${key.export({type:'pkcs8',format:'der'}).toString('base64')}`;
}
if(existsSync(file)) {
  const existing=readFileSync(file,'utf8');
  if(!new RegExp(`^SWARM_MODE=${mode}$`,'m').test(existing)) throw new Error('Existing configuration has a different mode. It was left unchanged.');
  if(/^VENUE_PRIVATE_KEY=./m.test(existing)) { console.log(`Existing ${mode} configuration retained.`); process.exit(0); }
  const admitted=existing.match(/^VENUE_PUBLIC_KEY_HOST_FILE=(.+)$/m)?.[1]?.trim()||'./.secrets/venue-public.pem';
  appendFileSync(file,(existing.endsWith('\n')?'':'\n')+venueKeyLine(resolve(root,admitted))+'\n');
  console.log(`Existing ${mode} configuration retained; added the simulated venue's signing key for its own container.`);
  process.exit(0);
}
const secret=()=>randomBytes(32).toString('hex');
mkdirSync(resolve(root,'.secrets'),{recursive:true,mode:0o700});
if(existsSync(privatePath)!==existsSync(publicPath)) throw new Error('The existing venue fixture keypair is incomplete. It was left unchanged.');
if(!existsSync(privatePath)) {
  const pair=generateKeyPairSync('ed25519');
  writeFileSync(privatePath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
  writeFileSync(publicPath,pair.publicKey.export({type:'spki',format:'pem'}),{mode:0o644,flag:'wx'});
}
if(!existsSync(resolve(root,'.secrets/decionis-api-key')))writeFileSync(resolve(root,'.secrets/decionis-api-key'),'',{mode:0o600,flag:'wx'});
const config={ SWARM_MODE:mode,SWARM_AI_PROVIDER:mode==='demo'?'demo':'azure',WEB_PORT:mode==='demo'?'5173':'5175',WEBHOOK_PORT:mode==='demo'?'5184':'5186',SWARM_PUBLIC_ORIGIN:'',SWARM_SESSION_COOKIE_SECURE:'false',PG_ADMIN_PASSWORD:secret(),PG_APP_PASSWORD:secret(),PG_EXECUTOR_PASSWORD:secret(),
  EXECUTOR_TOKEN:secret(),MCP_TOKEN:secret(),ORGANIZER_USERNAME:'organizer',ORGANIZER_PASSWORD:secret(),
  // Sandbox starts under the disclosed local test authority; demo/connect-decionis.mjs switches it to Decionis.
  SWARM_AUTHORITY:'local',DECIONIS_POLICY_VERSION:'swarm-pay-demo-v1',DECIONIS_TENANT_ID:'',DECIONIS_KEY_HOST_FILE:'./.secrets/decionis-api-key',
  VENUE_ISSUER:'demo-venue-fixture',VENUE_PUBLIC_KEY_HOST_FILE:'./.secrets/venue-public.pem',VENUE_PRIVATE_KEY:venueKeyLine(publicPath).slice('VENUE_PRIVATE_KEY='.length),
  AZURE_OPENAI_API_KEY:'',AZURE_OPENAI_ENDPOINT:'',AZURE_OPENAI_DEPLOYMENT:'gpt-6-astra',
  OPENAI_API_KEY:'',OPENAI_MODEL:'gpt-6-astra',PAYPAL_TENTS_CLIENT_ID:'',PAYPAL_TENTS_CLIENT_SECRET:'',PAYPAL_TENTS_MERCHANT_ID:'',PAYPAL_TENTS_WEBHOOK_ID:'',
  PAYPAL_CATERING_CLIENT_ID:'',PAYPAL_CATERING_CLIENT_SECRET:'',PAYPAL_CATERING_MERCHANT_ID:'',PAYPAL_CATERING_WEBHOOK_ID:'' };
writeFileSync(file,Object.entries(config).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
chmodSync(file,0o600);
console.log(`Created private ${mode} settings and retained or generated the separate venue fixture key. External account credentials still need to be configured.`);
