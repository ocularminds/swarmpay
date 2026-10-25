import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { admits, allowedHosts, egressProxy } from './proxy.mjs';

test('allows only the configured model hosts, and never PayPal or an address', () => {
  const hosts = allowedHosts({ AZURE_OPENAI_ENDPOINT: 'https://swarm.openai.azure.com/openai/v1' });
  assert.deepEqual([...hosts], ['swarm.openai.azure.com']);
  assert.ok(admits(hosts, 'swarm.openai.azure.com:443'));
  assert.ok(admits(hosts, 'SWARM.openai.azure.com:443'));
  for (const target of ['swarm.openai.azure.com:80', 'api-m.paypal.com:443', 'api-m.sandbox.paypal.com:443',
    'www.paypal.com:443', '151.101.1.1:443', '[::1]:443', 'evil.example:443', 'swarm.openai.azure.com', '']) {
    assert.equal(admits(hosts, target), false, target);
  }
  assert.deepEqual([...allowedHosts({ OPENAI_API_KEY: 'x' })], ['api.openai.com']);
  assert.equal(allowedHosts({}).size, 0);
  assert.throws(() => allowedHosts({ EGRESS_ALLOW_HOSTS: 'api-m.paypal.com' }), /EGRESS_HOST_REFUSED/);
  assert.throws(() => allowedHosts({ EGRESS_ALLOW_HOSTS: '10.0.0.4' }), /EGRESS_HOST_REFUSED/);
});

test('refuses a CONNECT to PayPal and any plain HTTP request', async () => {
  const lines = [];
  const server = egressProxy(new Set(['swarm.openai.azure.com']), (line) => lines.push(line));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const status = await new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, method: 'CONNECT', path: 'api-m.sandbox.paypal.com:443' })
      .on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode); })
      .on('error', reject).end();
  });
  assert.equal(status, 403);
  const plain = await fetch(`http://127.0.0.1:${port}/`, { headers: { host: 'api-m.paypal.com' } });
  assert.equal(plain.status, 405);
  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(lines.map((line) => line.event), ['EGRESS_REFUSED', 'EGRESS_REFUSED']);
  await new Promise((resolve) => server.close(resolve));
});
