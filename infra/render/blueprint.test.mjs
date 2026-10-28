import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blueprint, rendered } from './blueprint.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const services = Object.fromEntries(blueprint.services.map(s => [s.name, s]));
const env = (service, key) => services[service].envVars.find(v => v.key === key);

test('render.yaml is the generated Blueprint', () => {
  assert.equal(readFileSync(resolve(root, 'render.yaml'), 'utf8'), rendered(), 'run node infra/render/blueprint.mjs');
});

test('every reference names a service, and a variable it really has', () => {
  for (const service of blueprint.services) for (const v of service.envVars) {
    if (!v.fromService) continue;
    const target = services[v.fromService.name];
    assert.ok(target && target.type === v.fromService.type, `${service.name} ${v.key} → ${v.fromService.name}`);
    if (v.fromService.envVarKey) assert.ok(env(target.name, v.fromService.envVarKey), `${v.fromService.name} has ${v.fromService.envVarKey}`);
    else assert.equal(v.fromService.property, 'hostport');
  }
  for (const service of blueprint.services) {
    assert.ok(existsSync(resolve(root, service.dockerfilePath)) && existsSync(resolve(root, service.dockerContext)), service.name);
    assert.ok(env(service.name, 'PORT'), `${service.name} names its port`);
  }
});

test('no secret is written into the Blueprint, and this copy never holds PayPal credentials', () => {
  for (const service of blueprint.services) for (const v of service.envVars) {
    if (/PASSWORD|TOKEN|SECRET|PRIVATE_KEY/.test(v.key)) assert.ok(v.generateValue || v.sync === false || v.fromService, `${service.name} ${v.key}`);
    assert.ok(!/^PAYPAL_/.test(v.key), `${service.name} ${v.key}`);
    if (v.key === 'SWARM_MODE') assert.equal(v.value, 'demo');
  }
  assert.deepEqual(blueprint.services.filter(s => s.type === 'web').map(s => s.name), ['swarm-pay-web'], 'only the web front end is public');
  // The application's HTTPS still leaves through the egress proxy, which refuses PayPal by name.
  assert.ok(env('swarm-pay-commerce', 'EGRESS_HOSTPORT'));
  assert.equal(env('swarm-pay-commerce', 'SWARM_SESSION_COOKIE_SECURE').value, 'true');
});
