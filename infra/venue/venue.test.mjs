import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, verify } from 'node:crypto';
import { venueKey, venueServer } from './venue.mjs';

const listen = server => new Promise(done => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(done => server.close(done));
const workflowId = '6f1c2a4e-1d1b-4c4e-9a43-0c3a1f2b9d10';
const facts = { workflowId, orderId: 'a5b0c1d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d', merchantId: 'catering', venue: 'Riverside Pavilion', quantity: 30 };

async function fixture(t, answer = () => ({ status: 200, value: facts })) {
  const pair = generateKeyPairSync('ed25519');
  const seen = [];
  const commerce = createServer(async (request, response) => {
    let body = '';
    for await (const part of request) body += part;
    seen.push({ method: request.method, url: request.url, headers: request.headers, body: body ? JSON.parse(body) : null });
    const { status, value } = request.url === '/api/venue/receipts' ? { status: 200, value: { accepted: true } } : answer(request);
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
  });
  const commerceUrl = await listen(commerce);
  const encoded = pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const venue = venueServer({ issuer: 'demo-venue-fixture', key: venueKey(encoded), commerce: commerceUrl, log: () => {} });
  const venueUrl = await listen(venue);
  t.after(async () => { await close(venue); await close(commerce); });
  return { pair, seen, venueUrl };
}

test('confirms delivery for the organizer\'s own plan with facts from the application, not the browser', async t => {
  const { pair, seen, venueUrl } = await fixture(t);
  const response = await fetch(`${venueUrl}/venue/deliveries`, { method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'SESSION=organizer', 'x-csrf-token': 'token', origin: 'http://localhost:5173', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ workflowId, quantity: 999, venue: 'Elsewhere' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, issuer: 'demo-venue-fixture' });
  const [asked, submitted] = seen;
  assert.equal(asked.url, `/api/plans/${workflowId}/venue-request`);
  assert.equal(asked.headers.cookie, 'SESSION=organizer');
  assert.equal(asked.headers['x-csrf-token'], 'token');
  assert.equal(asked.headers.origin, 'http://localhost:5173');
  assert.equal(asked.headers['x-forwarded-for'], undefined);
  // The receipt reaches the public ingress without the organizer's session.
  assert.equal(submitted.url, '/api/venue/receipts');
  assert.equal(submitted.headers.cookie, undefined);
  const bytes = Buffer.from(submitted.body.payload, 'base64');
  assert.ok(verify(null, bytes, pair.publicKey, Buffer.from(submitted.body.signature, 'base64')));
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.issuer, 'demo-venue-fixture');
  assert.equal(receipt.quantity, 30);
  assert.equal(receipt.venue, 'Riverside Pavilion');
  assert.equal(receipt.deliveredAt, receipt.issuedAt);
  assert.match(receipt.nonce, /^[0-9a-f-]{36}$/);
});

test('relays the application\'s refusal and signs nothing', async t => {
  const { seen, venueUrl } = await fixture(t, () => ({ status: 409, value: { code: 'HELD', message: 'Authorize catering first.' } }));
  const response = await fetch(`${venueUrl}/venue/deliveries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflowId }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).message, 'Authorize catering first.');
  assert.equal(seen.length, 1);
});

test('refuses cross-site, non-JSON, malformed and unknown requests before asking the application', async t => {
  const { seen, venueUrl } = await fixture(t);
  const post = (headers, body) => fetch(`${venueUrl}/venue/deliveries`, { method: 'POST', headers, body });
  assert.equal((await post({ 'content-type': 'text/plain' }, JSON.stringify({ workflowId }))).status, 403);
  assert.equal((await post({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, JSON.stringify({ workflowId }))).status, 403);
  assert.equal((await post({ 'content-type': 'application/json' }, JSON.stringify({ workflowId: '../admin' }))).status, 400);
  assert.equal((await post({ 'content-type': 'application/json' }, 'x'.repeat(600))).status, 413);
  assert.equal((await fetch(`${venueUrl}/venue/deliveries`)).status, 405);
  assert.equal((await fetch(`${venueUrl}/api/plans`)).status, 404);
  assert.equal((await fetch(`${venueUrl}/healthz`)).status, 200);
  assert.equal(seen.length, 0);
});

test('accepts only an Ed25519 signing key', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  assert.throws(() => venueKey(rsa), /Ed25519/);
  assert.throws(() => venueKey(''), /VENUE_PRIVATE_KEY is required/);
});
