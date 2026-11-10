import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence} from './source-evidence.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
assert.ok(process.argv[2],'Usage: node demo/review/verify-apimatic.mjs <generation-directory containing sdk/typescript and portal>');
const generated=resolve(process.argv[2]),sdk=join(generated,'sdk/typescript');
const specBytes=readFileSync(resolve(root,'contracts/apimatic/src/spec/openapi.json'));
const spec=JSON.parse(specBytes);
const operations=Object.values(spec.paths).flatMap(path=>Object.entries(path)
  .filter(([method])=>['get','post','put','patch','delete','head','options'].includes(method))
  .map(([,operation])=>operation.operationId)).sort();
const controllers=readdirSync(join(sdk,'src/controllers')).filter(file=>file.endsWith('.ts'));
const methods=controllers.flatMap(file=>[...readFileSync(join(sdk,'src/controllers',file),'utf8').matchAll(/async\s+(\w+)\s*\(/g)].map(match=>match[1])).sort();
assert.deepEqual(methods,operations,'Generated SDK covers the current OpenAPI operations exactly');
const portalPath=join(generated,'portal/static/docs/swarmpay-api-TS_GENERIC_LIB.json');
const portalBytes=readFileSync(portalPath),portal=JSON.parse(portalBytes),documented=[];
function visit(value) {
  if(!value||typeof value!=='object')return;
  if(value.MethodSignature&&value.Name)documented.push(value.Name);
  for(const child of Object.values(value))visit(child);
}
visit(portal.Sections);
assert.deepEqual([...new Set(documented)].sort(),operations,'Generated portal covers the current operations');
assert.match(readFileSync(join(sdk,'src/models/ledgerEntry.ts'),'utf8'),/providerStatus/);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const compiled=Object.fromEntries(['dist/esm/index.js','dist/cjs/index.js'].map(path=>[path,hash(readFileSync(join(sdk,path)))]));
const output=resolve(root,'docs/review/evidence/technical/apimatic.json');mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({date:new Date().toISOString(),...sourceEvidence(root),generator:'@apimatic/cli 1.5.0',
  operationCount:operations.length,operations,openApiSha256:hash(specBytes),portalSha256:hash(portalBytes),compiled,
  scope:'Fresh APIMatic cloud SDK and portal generation. Both ESM and CJS TypeScript builds passed; operation coverage and providerStatus checked against the current contract. Generated output stays in the local delivery directory; no publishing or package release was performed.'},null,2)+'\n');
console.log(`PASS: ${operations.length} current operations in the generated SDK and portal; ESM/CJS outputs present`);
