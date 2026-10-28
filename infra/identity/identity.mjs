// PayPal sign-in: the one service that holds the SwarmPay app's PayPal login
// secret and reaches PayPal's identity API. The commerce application, where
// the agents run, never reaches PayPal; it hands this service the one-time
// code PayPal returned to the browser and gets back who signed in. The access
// token never leaves this process, and it is used for the profile alone.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PORT = 8085;
export const PAYPAL_APIS = ['https://api-m.sandbox.paypal.com', 'https://api-m.paypal.com'];
// PayPal's authorization codes are opaque URL-safe tokens.
const CODE = /^[A-Za-z0-9._~-]{8,2048}$/;

function reply(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value));
}
function sameSecret(given, expected) {
  const a = Buffer.from(given ?? ''), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null;

/** Who signed in, from PayPal's profile: a stable user ID, a display name and the primary email. */
export function profile(info) {
  const userId = text(info?.user_id, 300);
  if (!userId) throw new Error('PayPal returned no user ID');
  const emails = Array.isArray(info.emails) ? info.emails : [];
  const primary = emails.find(e => e?.primary) ?? emails[0];
  const name = text(info.name, 120) ?? ([text(info.given_name, 60), text(info.family_name, 60)].filter(Boolean).join(' ') || null);
  return { userId, payerId: text(info.payer_id, 40), name, email: text(primary?.value, 254),
    emailVerified: primary?.confirmed === true || primary?.confirmed === 'true',
    verifiedAccount: info.verified_account === true || info.verified_account === 'true' };
}

export async function exchange({ api, clientId, clientSecret, fetchImpl = fetch }, code) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const token = await fetchImpl(`${api}/v1/oauth2/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }) });
  if (token.status === 400 || token.status === 401) return { refused: true };
  if (!token.ok) throw new Error(`PayPal token exchange answered ${token.status}`);
  const access = (await token.json())?.access_token;
  if (typeof access !== 'string' || !access) throw new Error('PayPal returned no access token');
  const info = await fetchImpl(`${api}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, { redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${access}`, accept: 'application/json' } });
  if (!info.ok) throw new Error(`PayPal profile answered ${info.status}`);
  return { profile: profile(await info.json()) };
}

export function identityServer({ api, clientId, clientSecret, token, fetchImpl = fetch, log = line => console.log(JSON.stringify(line)) }) {
  const configured = !!(clientId && clientSecret && token);
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') return reply(response, 200, { status: 'ok', configured });
    if (request.url !== '/identity/paypal') return reply(response, 404, { code: 'NOT_FOUND', message: 'Not found' });
    if (request.method !== 'POST') return reply(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
    if (!configured) return reply(response, 503, { code: 'NOT_CONFIGURED', message: 'Sign-in with PayPal is not configured.' });
    // Only the commerce application holds this token; nothing else may ask who a code belongs to.
    if (!sameSecret((request.headers.authorization ?? '').replace(/^Bearer /, ''), token))
      return reply(response, 401, { code: 'UNAUTHORIZED', message: 'Not allowed' });
    let body = '';
    for await (const part of request) if ((body += part).length > 4096) return reply(response, 413, { code: 'TOO_LARGE', message: 'Request too large' });
    let code;
    try { code = JSON.parse(body).code; } catch { /* Checked below. */ }
    if (typeof code !== 'string' || !CODE.test(code)) return reply(response, 400, { code: 'INVALID_REQUEST', message: 'A PayPal authorization code is required.' });
    try {
      const result = await exchange({ api, clientId, clientSecret, fetchImpl }, code);
      if (result.refused) { log({ event: 'PAYPAL_SIGN_IN_REFUSED' }); return reply(response, 403, { code: 'REFUSED', message: 'PayPal did not accept this sign-in. Try again.' }); }
      log({ event: 'PAYPAL_SIGN_IN', verifiedAccount: result.profile.verifiedAccount });
      return reply(response, 200, result.profile);
    } catch {
      log({ event: 'PAYPAL_UNAVAILABLE' });
      return reply(response, 502, { code: 'PAYPAL_UNAVAILABLE', message: 'PayPal could not confirm the sign-in. Try again.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const api = process.env.PAYPAL_API_BASE ?? PAYPAL_APIS[0];
  if (!PAYPAL_APIS.includes(api)) throw new Error(`PAYPAL_API_BASE must be one of ${PAYPAL_APIS.join(', ')}`);
  const server = identityServer({ api, clientId: process.env.PAYPAL_LOGIN_CLIENT_ID, clientSecret: process.env.PAYPAL_LOGIN_CLIENT_SECRET, token: process.env.IDENTITY_TOKEN });
  server.listen(PORT, '0.0.0.0', () => console.log(JSON.stringify({ event: 'IDENTITY_READY', api, configured: !!(process.env.PAYPAL_LOGIN_CLIENT_ID && process.env.PAYPAL_LOGIN_CLIENT_SECRET && process.env.IDENTITY_TOKEN) })));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
