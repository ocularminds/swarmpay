import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// SwarmPay's one-click Render copy: the whole stack with simulated payments, the
// local test authority and simulated agents. Every service finds its peers by
// the private host:port Render supplies through the Blueprint.
// Render can't enforce SwarmPay's network policies, so this copy never holds
// PayPal credentials; the hosted demo and AKS keep the enforced isolation.
const value = (key, v) => ({ key, value: String(v) });
const generated = key => ({ key, generateValue: true });
const prompted = key => ({ key, sync: false });
const hostport = (key, name) => ({ key, fromService: { type: 'pserv', name, property: 'hostport' } });
const shared = (key, name, envVarKey) => ({ key, fromService: { type: 'pserv', name, envVarKey } });
const docker = (dockerfilePath, dockerContext) => ({ runtime: 'docker', dockerfilePath, dockerContext });
const policy = [value('SWARM_MODE', 'demo'), value('SWARM_AUTHORITY', 'local'), value('DECIONIS_POLICY_VERSION', 'swarm-pay-demo-v1'), value('VENUE_ISSUER', 'demo-venue-fixture')];

export const blueprint = {
  services: [
    { type: 'web', name: 'swarm-pay-web', ...docker('./apps/web/Dockerfile', './apps/web'), plan: 'free', healthCheckPath: '/',
      envVars: [value('PORT', 8080), value('SWARM_NGINX_RESOLVER', 'auto'), value('SWARM_TRUSTED_PROXY', '0.0.0.0/0'),
        hostport('SWARM_COMMERCE_UPSTREAM', 'swarm-pay-commerce'), hostport('SWARM_EXECUTOR_UPSTREAM', 'swarm-pay-executor'), hostport('SWARM_VENUE_UPSTREAM', 'swarm-pay-venue')] },
    { type: 'pserv', name: 'swarm-pay-commerce', ...docker('./infra/java.Dockerfile', '.'), plan: 'starter',
      envVars: [value('APP', 'commerce-app'), value('PORT', 8080), ...policy, value('SWARM_AI_PROVIDER', 'demo'),
        // The public URL of swarm-pay-web, such as https://swarm-pay-web.onrender.com. It binds sessions and origins to it.
        prompted('SWARM_PUBLIC_ORIGIN'), value('SWARM_SESSION_COOKIE_SECURE', 'true'),
        value('ORGANIZER_USERNAME', 'organizer'), prompted('ORGANIZER_PASSWORD'), generated('MCP_TOKEN'),
        value('DATABASE_USER', 'swarm_app'), shared('DATABASE_PASSWORD', 'swarm-pay-postgres', 'PG_APP_PASSWORD'), hostport('DATABASE_HOSTPORT', 'swarm-pay-postgres'),
        hostport('AGENTSAFE_HOSTPORT', 'swarm-pay-agentsafe'), shared('EXECUTOR_TOKEN', 'swarm-pay-executor', 'EXECUTOR_TOKEN'),
        hostport('EGRESS_HOSTPORT', 'swarm-pay-egress'), shared('VENUE_PUBLIC_KEY', 'swarm-pay-executor', 'VENUE_PUBLIC_KEY')] },
    { type: 'pserv', name: 'swarm-pay-executor', ...docker('./infra/java.Dockerfile', '.'), plan: 'starter',
      envVars: [value('APP', 'payment-executor'), value('PORT', 8081), ...policy, generated('EXECUTOR_TOKEN'),
        value('DATABASE_USER', 'swarm_executor'), shared('DATABASE_PASSWORD', 'swarm-pay-postgres', 'PG_EXECUTOR_PASSWORD'), hostport('DATABASE_HOSTPORT', 'swarm-pay-postgres'),
        // The venue's Ed25519 public key; node demo/render-keys.mjs prints a fresh pair.
        prompted('VENUE_PUBLIC_KEY')] },
    { type: 'pserv', name: 'swarm-pay-agentsafe', ...docker('./infra/agentsafe/Dockerfile', './infra/agentsafe'), plan: 'starter',
      disk: { name: 'evidence', mountPath: '/var/lib/agentsafe/evidence', sizeGB: 1 },
      // PORT alone overrides the gateway's file listener with localhost.
      envVars: [value('PORT', 8082), value('AGENTSAFE_LISTEN', '0.0.0.0:8082'), ...policy, hostport('AGENTSAFE_UPSTREAM_HOSTPORT', 'swarm-pay-executor')] },
    { type: 'pserv', name: 'swarm-pay-venue', ...docker('./infra/venue/Dockerfile', './infra/venue'), plan: 'starter',
      envVars: [value('PORT', 8084), value('VENUE_ISSUER', 'demo-venue-fixture'), prompted('VENUE_PRIVATE_KEY'), hostport('COMMERCE_HOSTPORT', 'swarm-pay-commerce')] },
    { type: 'pserv', name: 'swarm-pay-egress', ...docker('./infra/egress/Dockerfile', './infra/egress'), plan: 'starter',
      envVars: [value('PORT', 3128), value('EGRESS_ALLOW_HOSTS', 'api.trychannel3.com')] },
    { type: 'pserv', name: 'swarm-pay-postgres', ...docker('./infra/render/postgres.Dockerfile', '.'), plan: 'starter',
      disk: { name: 'data', mountPath: '/var/lib/postgresql/data', sizeGB: 1 },
      envVars: [value('PORT', 5432), value('POSTGRES_DB', 'swarm'), value('POSTGRES_USER', 'postgres'), value('PGDATA', '/var/lib/postgresql/data/pgdata'),
        generated('POSTGRES_PASSWORD'), generated('PG_APP_PASSWORD'), generated('PG_EXECUTOR_PASSWORD')] },
  ],
};

/** YAML for the Blueprint's plain maps, lists and scalars. */
export function toYaml(node, indent = '') {
  const scalar = v => typeof v === 'boolean' || typeof v === 'number' ? String(v) : /^[A-Za-z0-9_./:-]+$/.test(v) && !/^(true|false|null|\d+)$/.test(v) ? v : JSON.stringify(v);
  if (Array.isArray(node)) return node.map(item => {
    const body = toYaml(item, indent + '  ');
    return `${indent}- ${body.slice(indent.length + 2)}`;
  }).join('\n');
  return Object.entries(node).map(([key, v]) => v !== null && typeof v === 'object'
    ? `${indent}${key}:\n${toYaml(v, indent + '  ')}`
    : `${indent}${key}: ${scalar(v)}`).join('\n');
}
export const header = '# Generated by node infra/render/blueprint.mjs; edit that file, not this one.\n# Deploys the simulated-payments SwarmPay to Render. See docs/render.md.\n';
export const rendered = () => header + toYaml(blueprint) + '\n';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const target = resolve(fileURLToPath(new URL('../../', import.meta.url)), 'render.yaml');
  writeFileSync(target, rendered());
  console.log(`Wrote ${target}`);
}
