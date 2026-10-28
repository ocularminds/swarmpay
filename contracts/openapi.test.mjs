import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The OpenAPI document APIMatic builds SDKs and the portal from must match the routes the application serves.
const root = fileURLToPath(new URL('../', import.meta.url));
const spec = JSON.parse(readFileSync(resolve(root, 'contracts/apimatic/src/spec/openapi.json'), 'utf8'));
const controllers = resolve(root, 'apps/commerce-app/src/main/java/com/swarmpay/app');
const served = new Set();
for (const file of readdirSync(controllers).filter(f => f.endsWith('.java')))
  for (const [, verb, path] of readFileSync(resolve(controllers, file), 'utf8').matchAll(/@(Get|Post|Delete|Put)Mapping\("([^"]+)"/g))
    served.add(`${verb.toUpperCase()} ${path}`);
// Spring Security serves these two itself.
for (const route of ['POST /api/login', 'POST /api/logout']) served.add(route);
const documented = new Set(Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops).map(verb => `${verb.toUpperCase()} ${path}`)));

test('every route the application serves is documented, and nothing else', () => {
  assert.deepEqual([...served].filter(r => !documented.has(r)).sort(), [], 'served but undocumented');
  assert.deepEqual([...documented].filter(r => !served.has(r)).sort(), [], 'documented but not served');
});

test('every reference resolves and every operation says how it authenticates', () => {
  const text = JSON.stringify(spec);
  for (const [, kind, name] of text.matchAll(/"#\/components\/(schemas|responses)\/([A-Za-z]+)"/g))
    assert.ok(spec.components[kind][name], `#/components/${kind}/${name}`);
  for (const [path, ops] of Object.entries(spec.paths)) for (const [verb, op] of Object.entries(ops)) {
    assert.ok(Array.isArray(op.security), `${verb} ${path} declares its security`);
    assert.ok(op.summary && op.tags?.length === 1, `${verb} ${path} has a summary and one tag`);
    for (const name of op.security.flatMap(s => Object.keys(s))) assert.ok(spec.components.securitySchemes[name], name);
    const params = (path.match(/\{(\w+)\}/g) ?? []).map(p => p.slice(1, -1));
    assert.deepEqual((op.parameters ?? []).filter(p => p.in === 'path').map(p => p.name), params, `${verb} ${path} path parameters`);
  }
  assert.equal(spec.openapi, '3.1.0');
});

test('state-changing human routes require the CSRF header, reads only the session', () => {
  for (const [path, ops] of Object.entries(spec.paths)) for (const [verb, op] of Object.entries(ops)) {
    const schemes = op.security.flatMap(s => Object.keys(s));
    if (!schemes.includes('session') || path === '/api/logout') continue;
    assert.equal(schemes.includes('csrf'), verb !== 'get', `${verb} ${path}`);
  }
});
