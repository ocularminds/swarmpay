import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';

// Read-only discovery check, also runnable on the first foundation PR.
const base=process.env.SWARM_TEST_URL??'http://localhost:5173';
const config=await(await fetch(base+'/api/config')).json();
assert.equal(config.mode,'demo','Foundation check uses a local demo stack');
assert.equal((await fetch(base+'/api/catalog')).status,401);
assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
const env=parseEnv(readFileSync(new URL('../.env',import.meta.url),'utf8'));
let session='',protocol='2025-11-25';
async function mcp(payload) {
  const response=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',
    Authorization:`Bearer ${env.MCP_TOKEN}`,...(session?{'Mcp-Session-Id':session,'MCP-Protocol-Version':protocol}:{})},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  assert.ok([200,202].includes(response.status),`MCP HTTP ${response.status}`);
  session=response.headers.get('mcp-session-id')??session;
  const text=await response.text();if(!text)return null;
  if(!response.headers.get('content-type')?.includes('text/event-stream'))return JSON.parse(text);
  return text.split(/\r?\n\r?\n/).map(frame=>frame.split(/\r?\n/).filter(line=>line.startsWith('data:'))
    .map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean).map(value=>JSON.parse(value)).find(frame=>frame.id===payload.id);
}
const initialized=await mcp({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:protocol,capabilities:{},clientInfo:{name:'swarm-foundation',version:'1.0'}}});
protocol=initialized.result.protocolVersion;
await mcp({jsonrpc:'2.0',method:'notifications/initialized'});
const listed=await mcp({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
for(const name of ['search_offers','get_offer'])assert.ok(listed.result.tools.some(tool=>tool.name===name));
assert.equal(listed.result.tools.some(tool=>['approve_plan','buyer_approve'].includes(tool.name)),false);
const searched=await mcp({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_offers',arguments:{category:'ALL'}}});
assert.equal(searched.result.isError??false,false);
assert.ok(searched.result.content.some(item=>item.text?.includes('Canopy Collective')));
assert.equal((await fetch(base+'/internal/payments/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
console.log('PASS: authenticated MCP initialize/list/discovery, protected REST and absent public execution route');
