// The simulated venue: a separate issuer that holds the venue signing key, so
// neither the commerce application nor its agents can attest a delivery. It
// confirms a delivery only when the signed-in organizer asks for their own
// plan, signs what the application recorded with the current time, and submits
// the receipt through the same public ingress a real venue would use.
import { createServer, request as httpRequest } from 'node:http';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PORT = 8084;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Browser headers the application needs to recognize the organizer's session and site. */
const FORWARDED = ['host', 'origin', 'cookie', 'x-csrf-token'];

export function venueKey(encoded) {
  if (!encoded) throw new Error('VENUE_PRIVATE_KEY is required; rerun node demo/setup.mjs');
  const key = createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('The venue key must be Ed25519');
  return key;
}

/** The receipt for what the application recorded, signed now with a fresh nonce. */
export function receipt(issuer, key, facts, now = new Date()) {
  const body = { issuer, workflowId: facts.workflowId, orderId: facts.orderId, merchantId: facts.merchantId,
    venue: facts.venue, quantity: facts.quantity, deliveredAt: now.toISOString(), issuedAt: now.toISOString(), nonce: randomUUID() };
  const bytes = Buffer.from(JSON.stringify(body));
  return { payload: bytes.toString('base64'), signature: sign(null, bytes, key).toString('base64') };
}

function call(base, method, path, headers, body) {
  return new Promise((done, fail) => {
    const target = new URL(path, base);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const outgoing = httpRequest(target, { method, timeout: 30000,
      headers: { ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}) } }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', part => { if ((text += part).length > 64000) outgoing.destroy(new Error('Response too large')); });
      response.on('end', () => {
        let value = null;
        try { value = JSON.parse(text); } catch { /* A non-JSON answer keeps its status alone. */ }
        done({ status: response.statusCode, value });
      });
    });
    outgoing.on('timeout', () => outgoing.destroy(new Error('Timed out')));
    outgoing.on('error', fail);
    outgoing.end(payload);
  });
}

function reply(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value));
}

export function venueServer({ issuer, key, commerce, log = line => console.log(JSON.stringify(line)) }) {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') return reply(response, 200, { status: 'ok' });
    if (request.url !== '/venue/deliveries') return reply(response, 404, { code: 'NOT_FOUND', message: 'Not found' });
    if (request.method !== 'POST') return reply(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
    // A cross-site form cannot send JSON without a CORS preflight, which this service never grants.
    if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '') || request.headers['sec-fetch-site'] === 'cross-site')
      return reply(response, 403, { code: 'FORBIDDEN', message: 'Ask the venue from the SwarmPay site.' });
    let text = '';
    for await (const part of request) if ((text += part).length > 512) return reply(response, 413, { code: 'TOO_LARGE', message: 'Request too large' });
    let workflowId;
    try { workflowId = JSON.parse(text).workflowId; } catch { /* Checked below. */ }
    if (typeof workflowId !== 'string' || !UUID.test(workflowId)) return reply(response, 400, { code: 'INVALID_REQUEST', message: 'Choose a plan.' });
    const headers = Object.fromEntries(FORWARDED.filter(name => request.headers[name]).map(name => [name, request.headers[name]]));
    try {
      // The application checks the organizer's session, CSRF token and site, and
      // answers with the order it recorded; the venue never takes facts from the browser.
      const asked = await call(commerce, 'POST', `/api/plans/${workflowId}/venue-request`, headers);
      if (asked.status !== 200) return reply(response, asked.status, asked.value ?? { code: 'REFUSED', message: 'The plan is not ready for delivery confirmation.' });
      const signed = receipt(issuer, key, asked.value);
      const submitted = await call(commerce, 'POST', '/api/venue/receipts', { host: headers.host }, signed);
      log({ event: 'VENUE_RECEIPT_SUBMITTED', workflowId, status: submitted.status });
      if (submitted.status !== 200) return reply(response, submitted.status, submitted.value ?? { code: 'REFUSED', message: 'The receipt was not accepted.' });
      return reply(response, 200, { accepted: true, issuer });
    } catch {
      log({ event: 'VENUE_UNAVAILABLE', workflowId });
      return reply(response, 502, { code: 'VENUE_UNAVAILABLE', message: 'The simulated venue could not reach SwarmPay. Try again.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issuer = process.env.VENUE_ISSUER;
  if (!issuer) throw new Error('VENUE_ISSUER is required');
  const server = venueServer({ issuer, key: venueKey(process.env.VENUE_PRIVATE_KEY), commerce: process.env.COMMERCE_URL ?? 'http://commerce-app:8080' });
  server.listen(PORT, '0.0.0.0', () => console.log(JSON.stringify({ event: 'VENUE_READY', issuer, simulated: true })));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
