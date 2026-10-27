import { Gateway, GatewayConfigLoader, GatewayHttpServer } from '@decionis/agentsafe';
import { commerceDemoPolicy } from './demo-policy.mjs';

const mode = process.env.SWARM_MODE;
if (!['demo', 'sandbox'].includes(mode)) throw new Error('SWARM_MODE must be demo or sandbox');
// Payments and authority are separate choices: PayPal sandbox can run under the
// disclosed local test authority until a hosted Decionis enforcement grant exists.
const authority = process.env.SWARM_AUTHORITY?.trim() || (mode === 'demo' ? 'local' : 'decionis');
if (!['local', 'decionis'].includes(authority)) throw new Error('SWARM_AUTHORITY must be local or decionis');
if (mode === 'demo' && authority !== 'local') throw new Error('Simulated payments use the local test authority');
const local = authority === 'local';
if (!local && (!process.env.DECIONIS_API_KEY_FILE || !process.env.DECIONIS_TENANT_ID || !process.env.DECIONIS_POLICY_VERSION)) {
  throw new Error('Decionis authority requires an owned enforcement key, tenant and policy version');
}
const config = GatewayConfigLoader.load({
  version: '0.2.5', env: { ...process.env, NODE_ENV: local ? 'development' : 'production' },
  file: {
    version: 1,
    gateway: { listen: '0.0.0.0:8082', upstream: 'http://payment-executor:8081', upstreamInsecure: true, system: 'paypal', environment: mode, upstreamTimeoutMs: 30000 },
    authority: { endpoint: local ? 'local' : 'https://api.decionis.com', mode: 'enforcement', failurePolicy: 'failClosed', ...(local ? {} : { tenantId: process.env.DECIONIS_TENANT_ID }) },
    interception: { routes: [{ path: '/internal/payments/**', action: 'payment.execute', methods: ['POST'] }], unmatched: 'govern' },
    actor: { id: 'swarm-pay-worker', type: 'service' },
    boundary: { id: `swarm-pay-${mode}-payment-boundary` },
    evidence: { enabled: true, journalDir: '/var/lib/agentsafe/evidence' },
    output: { format: 'json' },
  },
});
if (config.authority.mode !== 'ENFORCEMENT' || config.authority.failurePolicy !== 'FAIL_CLOSED') throw new Error('Payments require enforcement and fail closed');
if (config.authority.kind !== (local ? 'LOCAL' : 'DECIONIS')) throw new Error(`The gateway did not select the ${authority} authority`);
const dependencies = local ? {
  demoAuthority: async () => {
    const { LocalAuthority, LOCAL_AUTHORITY_API_KEY } = await import('@decionis/agent-safe-pipeline/testing');
    const fixture = new LocalAuthority({ policy: commerceDemoPolicy });
    await fixture.start();
    return { baseUrl: fixture.baseUrl, apiKey: LOCAL_AUTHORITY_API_KEY, stop: () => fixture.stop() };
  },
} : {};
const gateway = await Gateway.create(config, { ...dependencies, version: '0.2.5' });
const server = new GatewayHttpServer(gateway);
await server.listen(config.listen.port, config.listen.host);
gateway.started(`http://${config.listen.host}:${config.listen.port}`);
console.log(JSON.stringify({ payments: mode, source: local ? 'LOCAL_SYNTHETIC_AUTHORITY' : 'DECIONIS', policy: local ? 'swarm-pay-demo-v1' : process.env.DECIONIS_POLICY_VERSION }));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); await gateway.close(); process.exit(0); });
