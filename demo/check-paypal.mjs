import {readFileSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const sandbox='https://api-m.sandbox.paypal.com';
export const webhookEvents=Object.freeze([
  'CHECKOUT.ORDER.APPROVED','CHECKOUT.ORDER.COMPLETED',
  'PAYMENT.AUTHORIZATION.CREATED','PAYMENT.AUTHORIZATION.VOIDED',
  'PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.DECLINED',
]);

// No payment endpoints, redirects, callback probes or credential values in the report.
export async function checkPayPalSandbox(env,{fetchImpl=fetch,merchants=['tents','catering'],callbackOrigin}={}) {
  if(!merchants.length || merchants.some(name=>!['tents','catering'].includes(name)) || new Set(merchants).size!==merchants.length)
    throw new Error('Select tents, catering, or both merchants.');
  let expectedOrigin=null;
  if(callbackOrigin!==undefined) {
    try {
      const url=new URL(callbackOrigin);
      if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)
        throw new Error();
      expectedOrigin=url.origin;
    } catch { throw new Error('The expected callback origin must be an HTTPS origin without credentials, a path, query or fragment.'); }
  }
  const results=await Promise.all(merchants.map(async merchant=>{
    const prefix=`PAYPAL_${merchant.toUpperCase()}_`;
    const value=suffix=>env[prefix+suffix]?.trim()??'';
    const result={merchant,missingFields:['CLIENT_ID','CLIENT_SECRET','MERCHANT_ID','WEBHOOK_ID'].filter(name=>!value(name)).map(name=>prefix+name),
      authentication:'NOT_CHECKED',webhooks:'NOT_CHECKED',webhookCount:null,subscriptionMatches:false,callbackRouteMatches:false,
      callbackOriginMatches:expectedOrigin===null?null:false,configurationReady:false};
    if(!value('CLIENT_ID') || !value('CLIENT_SECRET')) return result;
    const options={redirect:'error'};
    try {
      const oauth=await fetchImpl(sandbox+'/v1/oauth2/token',{...options,method:'POST',signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Basic ${Buffer.from(`${value('CLIENT_ID')}:${value('CLIENT_SECRET')}`).toString('base64')}`,
          'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:'grant_type=client_credentials'});
      result.authentication=`HTTP_${oauth.status}`;
      if(oauth.status!==200) return result;
      const token=await oauth.json();
      if(typeof token.access_token!=='string' || !token.access_token.trim() || token.token_type?.toLowerCase()!=='bearer') {
        result.authentication='UNEXPECTED_RESPONSE'; return result;
      }
      result.authentication='VERIFIED';
      result.webhooks='REQUESTING';
      const response=await fetchImpl(sandbox+'/v1/notifications/webhooks',{...options,method:'GET',signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/json'}});
      result.webhooks=`HTTP_${response.status}`;
      if(response.status!==200) return result;
      const body=await response.json();
      if(!Array.isArray(body.webhooks)) { result.webhooks='UNEXPECTED_RESPONSE'; return result; }
      result.webhooks='VERIFIED'; result.webhookCount=body.webhooks.length;
      const hook=body.webhooks.find(h=>h.id===value('WEBHOOK_ID'));
      if(hook) {
        const events=new Set(hook.event_types?.map(e=>e.name)??[]);
        result.subscriptionMatches=events.has('*') || webhookEvents.every(event=>events.has(event));
        try {
          const url=new URL(hook.url);
          result.callbackRouteMatches=url.protocol==='https:' && url.pathname===`/webhooks/paypal/${merchant}`
            && !url.username && !url.password && !url.search && !url.hash;
          if(expectedOrigin!==null) result.callbackOriginMatches=url.origin===expectedOrigin;
        } catch { /* An invalid callback is reported without echoing its contents. */ }
      }
      result.configurationReady=!result.missingFields.length && result.subscriptionMatches && result.callbackRouteMatches
        && result.callbackOriginMatches!==false;
    } catch {
      if(result.authentication!=='VERIFIED') result.authentication='UNAVAILABLE';
      else result.webhooks='UNAVAILABLE';
    }
    return result;
  }));
  const tentId=env.PAYPAL_TENTS_MERCHANT_ID?.trim(), cateringId=env.PAYPAL_CATERING_MERCHANT_ID?.trim();
  const distinctMerchants=merchants.length===2 ? !!tentId && !!cateringId && tentId!==cateringId
    && env.PAYPAL_TENTS_CLIENT_ID?.trim()!==env.PAYPAL_CATERING_CLIENT_ID?.trim() : null;
  return {at:new Date().toISOString(),environment:'PAYPAL_SANDBOX',readOnly:true,merchants:results,distinctMerchants,callbackOriginChecked:expectedOrigin!==null,
    configurationReady:results.every(r=>r.configurationReady) && distinctMerchants!==false,
    merchantOwnership:'NOT_VERIFIED',paymentLifecycle:'NOT_TESTED',webhookDelivery:'NOT_TESTED',hostedAuthority:'NOT_TESTED',paymentRequestsSent:0};
}

const usage='Usage: node demo/check-paypal.mjs [environment-file] [--merchant tents|catering] [--callback-origin https://host]';
async function main() {
  const args=process.argv.slice(2);
  const envPath=resolve(root,args[0]&&!args[0].startsWith('--')?args.shift():'.env');
  let merchants,callbackOrigin;
  while(args.length) {
    const option=args.shift(),value=args.shift();
    if(option==='--merchant' && merchants===undefined && ['tents','catering'].includes(value)) merchants=[value];
    else if(option==='--callback-origin' && callbackOrigin===undefined && value && !value.startsWith('--')) callbackOrigin=value;
    else throw new Error(usage);
  }
  const report=await checkPayPalSandbox(parseEnv(readFileSync(envPath,'utf8')),{merchants,callbackOrigin});
  for(const merchant of report.merchants) {
    console.log(`${merchant.authentication==='VERIFIED'?'PASS':'PENDING'}: ${merchant.merchant} sandbox authentication (${merchant.authentication})`);
    if(merchant.missingFields.length) console.log(`PENDING: configure ${merchant.missingFields.join(', ')}`);
    console.log(`${merchant.subscriptionMatches && merchant.callbackRouteMatches && merchant.callbackOriginMatches!==false?'PASS':'PENDING'}: ${merchant.merchant} callback subscription (${merchant.webhookCount??'unknown'} webhooks registered)`);
    if(report.callbackOriginChecked) console.log(`${merchant.callbackOriginMatches?'PASS':'PENDING'}: ${merchant.merchant} callback origin matches the requested host`);
  }
  if(report.distinctMerchants===false) console.log('PENDING: two distinct seller accounts and apps are required.');
  const path=resolve(root,'.local/paypal-preflight.json');
  mkdirSync(resolve(root,'.local'),{recursive:true});
  writeFileSync(path,JSON.stringify(report,null,2)+'\n',{mode:0o600}); chmodSync(path,0o600);
  console.log('Saved .local/paypal-preflight.json. No credential values were printed or payment requests sent.');
  console.log('Seller ownership, native buyer approval, capture, callback delivery and hosted authority still need separate acceptance tests.');
  process.exitCode=report.configurationReady?0:1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch { console.error(`PayPal preflight could not run. Check the local file path and arguments. ${usage}`); process.exitCode=1; }
}
