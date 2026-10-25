import { Gateway, GatewayConfigLoader, GatewayHttpServer } from '@decionis/agentsafe';
import { commerceDemoPolicy } from './demo-policy.mjs';

const mode = process.env.SWARM_MODE;
if (!['demo', 'sandbox'].includes(mode)) throw new Error('SWARM_MODE must be demo or sandbox');
if (mode === 'sandbox' && (!process.env.DECIONIS_API_KEY_FILE || !process.env.DECIONIS_TENANT_ID || !process.env.DECIONIS_POLICY_VERSION)) {
  throw new Error('Sandbox requires an owned Decionis enforcement key, tenant and policy version');
}
const config = GatewayConfigLoader.load({
  version: '0.2.5', env: { ...process.env, NODE_ENV: mode === 'demo' ? 'development' : 'production' },
  file: {
    version: 1,
    gateway: { listen: '0.0.0.0:8082', upstream: 'http://payment-executor:8081', upstreamInsecure: true, system: 'paypal', environment: mode, upstreamTimeoutMs: 30000 },
    authority: { endpoint: mode === 'demo' ? 'local' : 'https://api.decionis.com', mode: 'enforcement', failurePolicy: 'failClosed', ...(mode === 'sandbox' ? { tenantId: process.env.DECIONIS_TENANT_ID } : {}) },
    interception: { routes: [{ path: '/internal/payments/**', action: 'payment.execute', methods: ['POST'] }], unmatched: 'govern' },
    actor: { id: 'swarm-pay-worker', type: 'service' },
    boundary: { id: `swarm-pay-${mode}-payment-boundary` },
    evidence: { enabled: true, journalDir: '/var/lib/agentsafe/evidence' },
    output: { format: 'json' },
  },
});
if (config.authority.mode !== 'ENFORCEMENT' || config.authority.failurePolicy !== 'FAIL_CLOSED') throw new Error('Payments require enforcement and fail closed');
if (mode === 'sandbox' && config.authority.kind !== 'DECIONIS') throw new Error('Sandbox requires hosted authority');
const dependencies = mode === 'demo' ? {
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
console.log(JSON.stringify({ source: mode === 'demo' ? 'LOCAL_SYNTHETIC_AUTHORITY' : 'DECIONIS', policy: mode === 'demo' ? 'swarm-pay-demo-v1' : process.env.DECIONIS_POLICY_VERSION }));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await server.close(); await gateway.close(); process.exit(0); });
