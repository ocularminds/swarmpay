import assert from 'node:assert/strict';
import {connect} from 'node:tls';

// A daily look at the live demo while judges may use it. Anonymous and read-only: no sign-in, no model call,
// no plan and no PayPal request; it checks what a judge meets first and what would fail before anyone signs in.
const base=process.argv[2]??'https://swarm.decionis.com';
assert.equal(base,'https://swarm.decionis.com','Only the approved SwarmPay HTTPS host is checked');
const get=(path,options={})=>fetch(base+path,{signal:AbortSignal.timeout(15000),...options});
const landing=await get('/',{redirect:'error'});
assert.equal(landing.status,200);const html=await landing.text();
assert.match(html,/<title>SwarmPay/);
for(const asset of html.match(/\/assets\/[^"]+\.(js|css)/g)??[])assert.equal((await get(asset)).status,200,`The landing's ${asset} must load`);
const config=await (await get('/api/config',{redirect:'error'})).json();
assert.equal(config.mode,'sandbox','The live demo runs PayPal sandbox payments');
assert.equal(config.aiProvider,'azure');assert.equal(config.demoSessionEnabled,false);
assert.equal(config.paypalSignIn,true);assert.equal(config.tentPurchases,true);
for(const merchant of ['tents','catering'])assert.ok(config.clientIds?.[merchant],`The ${merchant} seller's PayPal client ID must be configured`);
assert.equal((await get('/api/plans',{redirect:'error'})).status,401);
assert.equal((await get('/mcp',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:'{}'})).status,401,'MCP must answer, and refuse a client without a token');
// Sign-up with PayPal starts at PayPal's sandbox; this builds the redirect only and asks PayPal nothing.
const signIn=await get('/api/paypal/start',{redirect:'manual'});
assert.equal(signIn.status,302);assert.match(signIn.headers.get('location')??'',/^https:\/\/www\.sandbox\.paypal\.com\/signin\/authorize\?.*client_id=./);
const certificate=await new Promise((resolve,reject)=>{
  const socket=connect({host:new URL(base).hostname,port:443,servername:new URL(base).hostname},()=>{resolve(socket.getPeerCertificate());socket.end();});
  socket.setTimeout(15000,()=>socket.destroy(new Error('TLS probe timed out')));socket.on('error',reject);
});
const days=(Date.parse(certificate.valid_to)-Date.now())/86400000;
assert.ok(days>21,`The TLS certificate expires in ${Math.floor(days)} days`);
console.log(`PASS: landing and assets, sandbox configuration, anonymous denial, MCP, PayPal sign-in redirect; TLS valid for ${Math.floor(days)} more days`);
