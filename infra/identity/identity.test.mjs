import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { identityServer, profile } from './identity.mjs';

const listen = server => new Promise(done => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(done => server.close(done));
const token = 'internal-test-token';
const userinfo = { user_id: 'https://www.paypal.com/webapps/auth/identity/user/abc123', name: 'Ada Organizer', payer_id: 'WDJJHEBZ4X2LY',
  verified_account: 'true', emails: [{ value: 'other@example.com', primary: false, confirmed: true }, { value: 'ada@example.com', primary: true, confirmed: true }] };

async function fixture(t, { tokenStatus = 200 } = {}) {
  const seen = [];
  const paypal = createServer(async (request, response) => {
    let body = '';
    for await (const part of request) body += part;
    seen.push({ method: request.method, url: request.url, headers: request.headers, body });
    if (request.url === '/v1/oauth2/token') return response.writeHead(tokenStatus, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: 'paypal-access' }));
    if (request.url.startsWith('/v1/identity/oauth2/userinfo')) return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(userinfo));
    response.writeHead(404).end();
  });
  const api = await listen(paypal);
  const identity = identityServer({ api, clientId: 'swarm-client', clientSecret: 'swarm-secret', token, log: () => {} });
  const url = await listen(identity);
  t.after(async () => { await close(identity); await close(paypal); });
  const ask = (body, auth = `Bearer ${token}`) => fetch(`${url}/identity/paypal`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });
  return { seen, ask, url };
}

test('exchanges the code with the app secret and returns who signed in, never the access token', async t => {
  const { seen, ask } = await fixture(t);
  const response = await ask({ code: 'C21AAK-one-time.code' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { userId: userinfo.user_id, payerId: 'WDJJHEBZ4X2LY', name: 'Ada Organizer', email: 'ada@example.com', emailVerified: true, verifiedAccount: true });
  assert.ok(!JSON.stringify(body).includes('paypal-access'));
  const [exchange, info] = seen;
  assert.equal(exchange.headers.authorization, `Basic ${Buffer.from('swarm-client:swarm-secret').toString('base64')}`);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(exchange.body)), { grant_type: 'authorization_code', code: 'C21AAK-one-time.code' });
  assert.equal(info.url, '/v1/identity/oauth2/userinfo?schema=paypalv1.1');
  assert.equal(info.headers.authorization, 'Bearer paypal-access');
});

test('answers only the commerce application, and only with a well-formed code', async t => {
  const { seen, ask } = await fixture(t);
  assert.equal((await ask({ code: 'C21AAK-one-time.code' }, 'Bearer wrong')).status, 401);
  assert.equal((await ask({ code: 'C21AAK-one-time.code' }, '')).status, 401);
  assert.equal((await ask({ code: 'short' })).status, 400);
  assert.equal((await ask({ code: 'has spaces and & signs' })).status, 400);
  assert.equal((await ask({})).status, 400);
  assert.equal(seen.length, 0);
});

test('a code PayPal refuses is a refusal, not an error', async t => {
  const { seen, ask } = await fixture(t, { tokenStatus: 400 });
  const response = await ask({ code: 'C21AAK-expired-code' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'REFUSED');
  assert.equal(seen.length, 1);
});

test('without the app credentials it stays healthy but signs no one in', async t => {
  const identity = identityServer({ api: 'http://127.0.0.1:9', clientId: '', clientSecret: '', token: '', log: () => {} });
  const url = await listen(identity);
  t.after(() => close(identity));
  assert.deepEqual(await (await fetch(`${url}/healthz`)).json(), { status: 'ok', configured: false });
  assert.equal((await fetch(`${url}/identity/paypal`, { method: 'POST', body: '{}' })).status, 503);
});

test('reads the profile defensively', () => {
  assert.throws(() => profile({}), /no user ID/);
  assert.deepEqual(profile({ user_id: 'u1', given_name: 'Ada', family_name: 'Lovelace' }),
    { userId: 'u1', payerId: null, name: 'Ada Lovelace', email: null, emailVerified: false, verifiedAccount: false });
});
