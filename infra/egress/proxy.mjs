// The commerce application's only route out of its internal network: an HTTPS
// CONNECT proxy that admits the model endpoint it is configured for and
// nothing else. PayPal, and every other host, is refused here, and the
// application's network has no gateway to reach them around it.
import { createServer } from 'node:http';
import { connect, isIP } from 'node:net';

const PORT = 3128;
/** Hosts the application never reaches, whatever the allowlist says. */
const REFUSED = /(^|\.)paypal\.com$|(^|\.)paypalobjects\.com$|(^|\.)braintreegateway\.com$/;

/** The hosts the application's configured model providers live at. */
export function allowedHosts(env) {
  const hosts = new Set();
  const azure = env.AZURE_OPENAI_ENDPOINT || env.AZURE_OPENAI_URL;
  if (azure) hosts.add(new URL(azure).hostname.toLowerCase());
  if (env.OPENAI_API_KEY) hosts.add('api.openai.com');
  for (const host of (env.EGRESS_ALLOW_HOSTS ?? '').split(',')) {
    if (host.trim()) hosts.add(host.trim().toLowerCase());
  }
  for (const host of hosts) {
    if (isIP(host) || REFUSED.test(host)) throw new Error(`EGRESS_HOST_REFUSED: ${host}`);
  }
  return hosts;
}

/** Whether a CONNECT target is admitted: an allowed name, on 443, never an address. */
export function admits(hosts, target) {
  const match = /^([a-z0-9.-]+):(\d{1,5})$/i.exec(target ?? '');
  if (!match) return false;
  const host = match[1].toLowerCase();
  return match[2] === '443' && !isIP(host) && !REFUSED.test(host) && hosts.has(host);
}

export function egressProxy(hosts, log = (line) => console.log(JSON.stringify(line))) {
  const server = createServer((request, response) => {
    // Plain HTTP is never proxied; only the health probe answers.
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
      return;
    }
    log({ event: 'EGRESS_REFUSED', method: request.method, reason: 'NOT_CONNECT' });
    response.writeHead(405).end();
  });
  server.on('connect', (request, client, head) => {
    if (!admits(hosts, request.url)) {
      log({ event: 'EGRESS_REFUSED', target: request.url });
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const [host] = request.url.split(':');
    const upstream = connect(443, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client).pipe(upstream);
    });
    const close = () => { upstream.destroy(); client.destroy(); };
    upstream.on('error', () => { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
    client.on('error', close);
    upstream.setTimeout(120_000, close);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hosts = allowedHosts(process.env);
  egressProxy(hosts).listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'EGRESS_PROXY_STARTED', port: PORT, allowed: [...hosts].sort() }));
  });
}
