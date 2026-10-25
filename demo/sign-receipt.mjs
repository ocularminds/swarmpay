import { randomUUID, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
// Input is an exported workflow JSON. The private key never enters either app.
const [input,output,option]=process.argv.slice(2);
if(!input || !output || option&&option!=='--sandbox-test') throw new Error('Usage: node demo/sign-receipt.mjs workflow.json receipt.json [--sandbox-test]');
const root=fileURLToPath(new URL('../',import.meta.url));
const workflow=JSON.parse(readFileSync(input,'utf8'));
if(workflow.mode!=='demo' && !(workflow.mode==='sandbox'&&option==='--sandbox-test'))
  throw new Error('Non-demo workflows require the explicit --sandbox-test flag. Production is unsupported.');
const line=workflow.plan.lines.find(l=>l.category==='CATERING');
const now=new Date().toISOString();
const body={issuer:'demo-venue-fixture',workflowId:workflow.plan.id,orderId:line.id,merchantId:line.merchantId,
  venue:workflow.plan.intent.venue,quantity:line.quantity,deliveredAt:now,issuedAt:now,nonce:randomUUID()};
const bytes=Buffer.from(JSON.stringify(body));
const key=readFileSync(resolve(root,'.secrets/venue-private.pem'));
writeFileSync(output,JSON.stringify({payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')},null,2)+'\n',{mode:0o600});
console.log(`Created a simulated delivery receipt. Upload it through the evidence panel within 15 minutes.${workflow.mode==='sandbox'?' It can trigger a PayPal sandbox capture; the venue must be configured as demo-venue-fixture.':''}`);
