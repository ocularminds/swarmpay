// Connects a SwarmPay sandbox stack to Decionis enforcement in one run, with an
// administrator key the organizer created for this and revokes afterwards:
//
//   node demo/connect-decionis.mjs .env.sandbox --admin-key-file .secrets/decionis-admin-key
//
// 1. Checks the administrator key belongs to DECIONIS_TENANT_ID.
// 2. Refuses to publish over another product's active policy in that
//    workspace (Decionis evaluates only the newest active bundle), unless
//    --replace-org-policy says that is intended.
// 3. Publishes infra/agentsafe/decionis-policy.json as a new bundle.
// 4. Mints the gateway's own key: MEMBER, `decision:enforce` alone, never
//    policy:write, writes it to .secrets/decionis-api-key (mode 0600) and
//    installs it into the stack's authority-key volume.
// 5. Sets DECIONIS_POLICY_VERSION in the env file.
//
// No key value is ever printed; the report names ids, scopes and versions.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.DECIONIS_API_URL ?? 'https://api.decionis.com';
const args = process.argv.slice(2);
const envFile = args.find((arg) => !arg.startsWith('--'));
const option = (name) => { const at = args.indexOf(name); return at === -1 ? null : args[at + 1]; };
const flag = (name) => args.includes(name);
const adminKeyFile = option('--admin-key-file');
const project = option('--project') ?? 'swarm-pay-sandbox';
if (!envFile || !adminKeyFile) {
  throw new Error('Usage: node demo/connect-decionis.mjs ENV_FILE --admin-key-file FILE [--project NAME] [--replace-org-policy] [--replace-key] [--dry-run]');
}

const envText = readFileSync(envFile, 'utf8');
const env = Object.fromEntries(envText.split('\n').map((line) => /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)).filter(Boolean).map((m) => [m[1], m[2]]));
if (env.SWARM_MODE !== 'sandbox') throw new Error(`${envFile} is not a sandbox configuration (SWARM_MODE=sandbox)`);
const org = env.DECIONIS_TENANT_ID;
if (!/^[0-9a-f-]{36}$/i.test(org ?? '')) throw new Error('DECIONIS_TENANT_ID must be the workspace id');
const adminKey = readFileSync(adminKeyFile, 'utf8').trim();
if (!adminKey) throw new Error(`${adminKeyFile} is empty`);

async function call(method, path, key, body) {
  const response = await fetch(`${API}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* reported by status */ }
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status} ${json?.error ?? ''}`.trim());
  return json;
}

const report = { workspace: org };
const admin = await call('POST', '/v1/auth/credential-context', adminKey, {});
if (admin.org_id !== org) throw new Error('The administrator key belongs to another workspace than DECIONIS_TENANT_ID');
if (!['ADMIN', 'OWNER'].includes(admin.role)) throw new Error(`The administrator key's role is ${admin.role}; ADMIN or OWNER is needed to mint the gateway key`);
report.admin_key_id = admin.api_key_id;

const template = JSON.parse(readFileSync(resolve(root, 'infra/agentsafe/decionis-policy.json'), 'utf8'));
const listed = await call('GET', `/v1/protocol/policies/bundles?org_id=${org}&limit=50`, adminKey);
const bundles = Array.isArray(listed?.bundles) ? listed.bundles : [];
const now = Date.now();
const active = bundles.filter((bundle) => (bundle.lifecycle_state ?? 'ACTIVE') === 'ACTIVE'
  && (!bundle.effective_to || Date.parse(bundle.effective_to) > now));
const foreign = active.filter((bundle) => !String(bundle.version ?? '').startsWith('swarm-pay-'));
report.active_bundles_before = active.map((bundle) => bundle.version);
if (foreign.length > 0 && !flag('--replace-org-policy')) {
  throw new Error(`This workspace already enforces ${foreign.map((b) => b.version).join(', ')}. Publishing SwarmPay's policy would replace it for every product here. Use a dedicated workspace, or pass --replace-org-policy if that is intended.`);
}
const published = active.find((bundle) => bundle.version === template.version);
if (flag('--dry-run')) {
  console.log(JSON.stringify({ ...report, would_publish: published ? null : template.version, would_mint: 'MEMBER decision:enforce' }, null, 1));
  process.exit(0);
}
if (published) {
  report.policy = { version: template.version, bundle_id: published.bundle_id, published: 'already active' };
} else {
  const bundle = { ...template, bundle_id: randomUUID(), org_id: org, effective_from: new Date(Date.now() - 60_000).toISOString() };
  await call('POST', '/v1/protocol/policies/bundles', adminKey, bundle);
  report.policy = { version: template.version, bundle_id: bundle.bundle_id, published: 'now' };
}

const keyPath = resolve(root, '.secrets/decionis-api-key');
if (existsSync(keyPath) && readFileSync(keyPath, 'utf8').trim() && !flag('--replace-key')) {
  report.gateway_key = 'kept the existing .secrets/decionis-api-key (--replace-key mints a new one)';
} else {
  const minted = await call('POST', `/v1/orgs/${org}/api-keys`, adminKey, {
    name: `${project}-gateway`,
    description: 'SwarmPay sandbox AgentSafe gateway: enforcement evaluations and grant claims only',
    role: 'MEMBER', scopes: ['decision:enforce'], provision_default_policy: false,
  });
  writeFileSync(keyPath, `${minted.raw_key}\n`, { mode: 0o600 });
  const check = await call('POST', '/v1/auth/credential-context', minted.raw_key, {});
  if (check.org_id !== org || check.scopes.join() !== 'decision:enforce') throw new Error('The minted gateway key is not the narrow enforcement key; revoke it in the workspace');
  report.gateway_key = { id: minted.api_key?.id, role: check.role, scopes: check.scopes };
  const installed = spawnSync(process.execPath, [resolve(root, 'demo/install-authority-key.mjs'), keyPath, project, '--replace'], { encoding: 'utf8' });
  if (installed.status !== 0) throw new Error(`Installing the gateway key failed: ${installed.stderr.trim()}`);
  report.installed_into = `${project}_authority-key`;
}

writeFileSync(envFile, envText.replace(/^DECIONIS_POLICY_VERSION=.*$/m, `DECIONIS_POLICY_VERSION=${template.version}`), { mode: 0o600 });
report.env_file = `${envFile}: DECIONIS_POLICY_VERSION=${template.version}`;
report.next = 'Revoke the administrator key in the workspace now; the gateway runs on its own key.';
console.log(JSON.stringify(report, null, 1));
