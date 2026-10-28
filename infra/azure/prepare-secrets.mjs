import {randomBytes,generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const secretList=items=>JSON.stringify({apiVersion:'v1',kind:'List',items},null,2)+'\n';
const secretItem=(name,data)=>({apiVersion:'v1',kind:'Secret',type:'Opaque',metadata:{name:`swarm-pay-${name}`,namespace:'decionis',labels:{'app.kubernetes.io/part-of':'swarm-pay'}},
  data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Buffer.from(v).toString('base64')]))});
// Only the simulated venue's deployment mounts this secret; it is kept out of secrets.json.
const venueSecret=privateKey=>secretList([secretItem('venue-secrets',{VENUE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'der'}).toString('base64')})]);

/**
 * PayPal sign-in, kept apart like the venue key: the identity service gets the login secret and the
 * app gets only the public client ID and the token it asks the service with. Null when not configured.
 */
function identitySecret(configured) {
  const clientId=configured.PAYPAL_LOGIN_CLIENT_ID?.trim(),clientSecret=configured.PAYPAL_LOGIN_CLIENT_SECRET?.trim();
  if(!clientId&&!clientSecret)return null;
  if(!clientId||!clientSecret)throw new Error('Sign-in with PayPal needs both PAYPAL_LOGIN_CLIENT_ID and PAYPAL_LOGIN_CLIENT_SECRET.');
  const token=randomBytes(32).toString('hex');
  return secretList([secretItem('identity-secrets',{PAYPAL_LOGIN_CLIENT_ID:clientId,PAYPAL_LOGIN_CLIENT_SECRET:clientSecret,IDENTITY_TOKEN:token}),
    secretItem('login-client',{PAYPAL_LOGIN_CLIENT_ID:clientId,IDENTITY_TOKEN:token})]);
}
const privateSource=file=>{if((statSync(file).mode&0o077)!==0)throw new Error('The source environment file must be private to its owner.');return parseEnv(readFileSync(file,'utf8'));};

const [first,second,option]=process.argv.slice(2);
if(first==='--catalog-secret') {
  // Channel3's key for tents to buy: the application alone receives it, beside its other credentials.
  if(!second||!option)throw new Error('Usage: node infra/azure/prepare-secrets.mjs --catalog-secret private-source.env existing-private-directory');
  const key=privateSource(second).CHANNEL3_API_KEY?.trim();
  if(!key)throw new Error('The source has no CHANNEL3_API_KEY.');
  writeFileSync(resolve(option,'catalog-secret.json'),secretList([secretItem('catalog-settings',{CHANNEL3_API_KEY:key})]),{mode:0o600,flag:'wx'});
  console.log('Prepared the Channel3 catalog secret. No cloud resource was changed.');
  process.exit(0);
}
if(first==='--identity-secret') {
  // An existing bootstrap: add PayPal sign-in without touching any other credential.
  if(!second||!option)throw new Error('Usage: node infra/azure/prepare-secrets.mjs --identity-secret private-source.env existing-private-directory');
  const secret=identitySecret(privateSource(second));
  if(!secret)throw new Error('The source has no PAYPAL_LOGIN_CLIENT_ID and PAYPAL_LOGIN_CLIENT_SECRET.');
  writeFileSync(resolve(option,'identity-secret.json'),secret,{mode:0o600,flag:'wx'});
  console.log('Prepared the PayPal sign-in secrets. No cloud resource was changed.');
  process.exit(0);
}
if(first==='--venue-secret') {
  // An existing bootstrap: add the venue's secret from the key the deployment already admits.
  if(!second)throw new Error('Usage: node infra/azure/prepare-secrets.mjs --venue-secret existing-private-directory');
  const directory=resolve(second),key=createPrivateKey(readFileSync(resolve(directory,'venue-private.pem')));
  if(key.asymmetricKeyType!=='ed25519')throw new Error('The venue key must be Ed25519');
  writeFileSync(resolve(directory,'venue-secret.json'),venueSecret(key),{mode:0o600,flag:'wx'});
  console.log('Prepared the simulated venue secret from the existing venue key. No cloud resource was changed.');
  process.exit(0);
}
const source=first,output=second,sandbox=option==='--sandbox';
if(!source||!output||option&&!sandbox)throw new Error('Usage: node infra/azure/prepare-secrets.mjs private-source.env private-output-directory [--sandbox]');
const destination=resolve(output);
if(existsSync(destination))throw new Error('The output directory already exists; existing deployment credentials were left unchanged.');
const root=fileURLToPath(new URL('../../',import.meta.url));
if(spawnSync('git',['check-ignore','-q',resolve(destination,'secrets.json')],{cwd:root}).status!==0)
  throw new Error('Choose an ignored private output directory, such as .local/azure/bootstrap.');
const configured=privateSource(source);
const identity=identitySecret(configured);
const key=configured.AZURE_OPEANAI_KEY||configured.AZURE_OPENAI_API_KEY;
const endpoint=configured.AZURE_OPENAI_ENDPOINT||configured.AZURE_OPENAI_URL;
const deployment=configured.AZURE_OPENAI_DEPLOYMENT||configured.AZURE_OPENAI_LLM;
if(!key||!endpoint||!deployment)throw new Error('The source must contain the configured Azure OpenAI key, endpoint and deployment.');
let url;
try {url=new URL(endpoint);} catch {throw new Error('The source has an invalid Azure endpoint.');}
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use the verified HTTPS Azure endpoint without credentials in its URL.');
// PayPal sandbox credentials are copied only for an explicit sandbox deployment.
const paypal=sandbox?Object.fromEntries(['TENTS','CATERING'].flatMap(merchant=>['CLIENT_ID','CLIENT_SECRET','MERCHANT_ID','WEBHOOK_ID'].map(suffix=>`PAYPAL_${merchant}_${suffix}`)).map(name=>[name,configured[name]?.trim()])):{};
if(Object.values(paypal).some(value=>!value))throw new Error('A sandbox deployment needs both merchants\' PayPal sandbox client, merchant and webhook settings.');
const secret=()=>randomBytes(32).toString('hex');
const administrator=secret(),application=secret(),executor=secret(),service=secret(),organizer=secret(),mcp=secret();
const values={
  'postgres-secrets':{POSTGRES_PASSWORD:administrator,PG_APP_PASSWORD:application,PG_EXECUTOR_PASSWORD:executor},
  'payment-secrets':{DATABASE_PASSWORD:executor,EXECUTOR_TOKEN:service,...paypal},
  // The browser's PayPal buttons need each merchant's public client ID; no PayPal secret reaches the app.
  'commerce-secrets':{DATABASE_PASSWORD:application,EXECUTOR_TOKEN:service,ORGANIZER_PASSWORD:organizer,MCP_TOKEN:mcp,
    AZURE_OPENAI_API_KEY:key,AZURE_OPENAI_ENDPOINT:endpoint,AZURE_OPENAI_DEPLOYMENT:deployment,
    ...(sandbox?{PAYPAL_TENTS_CLIENT_ID:paypal.PAYPAL_TENTS_CLIENT_ID,PAYPAL_CATERING_CLIENT_ID:paypal.PAYPAL_CATERING_CLIENT_ID}:{})},
  // The egress proxy admits the model host; it never holds the model key.
  'egress-settings':{AZURE_OPENAI_ENDPOINT:endpoint}
};
mkdirSync(destination,{recursive:true,mode:0o700});
writeFileSync(resolve(destination,'secrets.json'),secretList(Object.entries(values).map(([name,data])=>secretItem(name,data))),{mode:0o600,flag:'wx'});
const pair=generateKeyPairSync('ed25519');
writeFileSync(resolve(destination,'venue-secret.json'),venueSecret(pair.privateKey),{mode:0o600,flag:'wx'});
if(identity)writeFileSync(resolve(destination,'identity-secret.json'),identity,{mode:0o600,flag:'wx'});
writeFileSync(resolve(destination,'venue-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
writeFileSync(resolve(destination,'venue-public.pem'),pair.publicKey.export({type:'spki',format:'pem'}),{mode:0o644,flag:'wx'});
writeFileSync(resolve(destination,'organizer.env'),`SWARM_PUBLIC_ORIGIN=https://swarm.decionis.com\nORGANIZER_USERNAME=organizer\nORGANIZER_PASSWORD=${organizer}\nMCP_TOKEN=${mcp}\n`,{mode:0o600,flag:'wx'});
console.log(`Prepared private credentials and a separate demo venue key. ${sandbox?'PayPal sandbox credentials were copied for the executor only':'No payment credentials were copied'} and no cloud resource was changed.`);
