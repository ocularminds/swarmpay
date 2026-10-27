import {existsSync,readFileSync,statSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const path=resolve(root,process.argv[2]??'.env');
if(!existsSync(path)) {console.error('Configuration file is missing. Run node demo/setup.mjs for the local demo.');process.exit(1);}
const env=parseEnv(readFileSync(path,'utf8'));
let failures=0;
function check(ok,label,detail='') {console.log(`${ok?'PASS':'MISSING'}: ${label}${detail?` (${detail})`:''}`);if(!ok)failures++;}
function fields(label,names) {const missing=names.filter(name=>!env[name]?.trim());check(missing.length===0,label,missing.length?missing.join(', '):'all names configured');}
function file(label,name,fallback) {
  const path=resolve(root,env[name]||fallback);
  const ok=existsSync(path)&&statSync(path).isFile()&&statSync(path).size>0;
  check(ok,label,ok?'nonempty file present':`${name} or its default file`);
}
check(['demo','sandbox'].includes(env.SWARM_MODE),'Explicit demo or sandbox mode');
if(env.SWARM_PUBLIC_ORIGIN?.trim()) {
  let valid=false;
  try {const origin=new URL(env.SWARM_PUBLIC_ORIGIN);valid=origin.protocol==='https:'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash&&origin.pathname==='/';} catch {}
  check(valid,'Hosted origin is one HTTPS origin');
  check(env.SWARM_SESSION_COOKIE_SECURE==='true','Hosted sessions require secure cookies');
  console.log('INFO: Hosted mode requires organizer sign-in, including when payments are simulated.');
}
check((statSync(path).mode&0o077)===0,'Environment file is private to its owner');
fields('Local database, service and organizer settings',['PG_ADMIN_PASSWORD','PG_APP_PASSWORD','PG_EXECUTOR_PASSWORD','EXECUTOR_TOKEN','MCP_TOKEN','ORGANIZER_USERNAME','ORGANIZER_PASSWORD','DECIONIS_POLICY_VERSION','VENUE_ISSUER']);
check(new Set([env.PG_ADMIN_PASSWORD,env.PG_APP_PASSWORD,env.PG_EXECUTOR_PASSWORD,env.EXECUTOR_TOKEN,env.MCP_TOKEN]).size===5,'Database passwords and service tokens are distinct');
file('Trusted venue public key','VENUE_PUBLIC_KEY_HOST_FILE','.secrets/venue-public.pem');
const ai=env.SWARM_AI_PROVIDER||'demo';
check(['demo','azure','openai'].includes(ai),'Explicit AI provider');
if(ai==='azure') {
  check(!!(env.AZURE_OPENAI_API_KEY||env.AZURE_OPEANAI_KEY||env.AZURE_OPENAI_KEY),'Azure OpenAI key configured');
  check(!!(env.AZURE_OPENAI_ENDPOINT||env.AZURE_OPENAI_URL),'Azure OpenAI endpoint configured');
  check(!!(env.AZURE_OPENAI_DEPLOYMENT||env.AZURE_OPENAI_LLM),'Azure OpenAI deployment configured');
} else if(ai==='openai') fields('OpenAI key',['OPENAI_API_KEY']);
const authority=env.SWARM_AUTHORITY?.trim()||(env.SWARM_MODE==='demo'?'local':'decionis');
check(['local','decionis'].includes(authority)&&(env.SWARM_MODE!=='demo'||authority==='local'),'Explicit payment authority',authority);
if(env.SWARM_MODE==='sandbox') {
  fields('PayPal sandbox merchant configuration',['TENTS','CATERING'].flatMap(merchant=>['CLIENT_ID','CLIENT_SECRET','MERCHANT_ID','WEBHOOK_ID'].map(suffix=>`PAYPAL_${merchant}_${suffix}`)));
  check((env.OPENAI_MODEL||'gpt-6-astra')==='gpt-6-astra','Requested GPT-6 Astra model');
  if(authority==='decionis') {
    fields('Hosted Decionis configuration',['DECIONIS_TENANT_ID','DECIONIS_POLICY_VERSION']);
    file('Decionis source key for installation','DECIONIS_KEY_HOST_FILE','.secrets/decionis-api-key');
    console.log('NEXT: install the authority key into the sandbox project volume; then verify actual account capabilities.');
  } else {
    check(env.DECIONIS_POLICY_VERSION==='swarm-pay-demo-v1','Local test authority policy','DECIONIS_POLICY_VERSION=swarm-pay-demo-v1');
    console.log('INFO: PayPal sandbox payments are decided by the disclosed local test authority, not hosted Decionis.');
  }
} else {
  console.log(`INFO: Payments and authority are synthetic. AI provider: ${ai}.`);
}
console.log('No credential values were printed, and no external service was contacted.');
process.exitCode=failures?1:0;
