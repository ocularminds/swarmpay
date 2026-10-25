import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const [source,output]=process.argv.slice(2);
if(!source||!output)throw new Error('Usage: node infra/azure/prepare-secrets.mjs private-source.env private-output-directory');
const destination=resolve(output);
if(existsSync(destination))throw new Error('The output directory already exists; existing deployment credentials were left unchanged.');
const root=fileURLToPath(new URL('../../',import.meta.url));
if(spawnSync('git',['check-ignore','-q',resolve(destination,'secrets.json')],{cwd:root}).status!==0)
  throw new Error('Choose an ignored private output directory, such as .local/azure/bootstrap.');
if((statSync(source).mode&0o077)!==0)throw new Error('The source environment file must be private to its owner.');
const configured=parseEnv(readFileSync(source,'utf8'));
const key=configured.AZURE_OPEANAI_KEY||configured.AZURE_OPENAI_API_KEY;
const endpoint=configured.AZURE_OPENAI_ENDPOINT||configured.AZURE_OPENAI_URL;
const deployment=configured.AZURE_OPENAI_DEPLOYMENT||configured.AZURE_OPENAI_LLM;
if(!key||!endpoint||!deployment)throw new Error('The source must contain the configured Azure OpenAI key, endpoint and deployment.');
let url;
try {url=new URL(endpoint);} catch {throw new Error('The source has an invalid Azure endpoint.');}
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use the verified HTTPS Azure endpoint without credentials in its URL.');
const secret=()=>randomBytes(32).toString('hex');
const administrator=secret(),application=secret(),executor=secret(),service=secret(),organizer=secret(),mcp=secret();
const values={
  'postgres-secrets':{POSTGRES_PASSWORD:administrator,PG_APP_PASSWORD:application,PG_EXECUTOR_PASSWORD:executor},
  'payment-secrets':{DATABASE_PASSWORD:executor,EXECUTOR_TOKEN:service},
  'commerce-secrets':{DATABASE_PASSWORD:application,EXECUTOR_TOKEN:service,ORGANIZER_PASSWORD:organizer,MCP_TOKEN:mcp,
    AZURE_OPENAI_API_KEY:key,AZURE_OPENAI_ENDPOINT:endpoint,AZURE_OPENAI_DEPLOYMENT:deployment},
  // The egress proxy admits the model host; it never holds the model key.
  'egress-settings':{AZURE_OPENAI_ENDPOINT:endpoint}
};
const items=Object.entries(values).map(([name,data])=>({apiVersion:'v1',kind:'Secret',type:'Opaque',metadata:{name:`swarm-pay-${name}`,namespace:'decionis',labels:{'app.kubernetes.io/part-of':'swarm-pay'}},
  data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Buffer.from(v).toString('base64')]))}));
mkdirSync(destination,{recursive:true,mode:0o700});
writeFileSync(resolve(destination,'secrets.json'),JSON.stringify({apiVersion:'v1',kind:'List',items},null,2)+'\n',{mode:0o600,flag:'wx'});
const pair=generateKeyPairSync('ed25519');
writeFileSync(resolve(destination,'venue-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
writeFileSync(resolve(destination,'venue-public.pem'),pair.publicKey.export({type:'spki',format:'pem'}),{mode:0o644,flag:'wx'});
writeFileSync(resolve(destination,'organizer.env'),`SWARM_PUBLIC_ORIGIN=https://swarm.decionis.com\nORGANIZER_USERNAME=organizer\nORGANIZER_PASSWORD=${organizer}\nMCP_TOKEN=${mcp}\n`,{mode:0o600,flag:'wx'});
console.log('Prepared private credentials and a separate demo venue key. No payment credentials were copied and no cloud resource was changed.');
