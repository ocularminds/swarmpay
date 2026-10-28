import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blueprint } from '../../infra/render/blueprint.mjs';

// Run the local stack wired as on Render (host:port peers, inline venue key, resolver from the
// container), prove the journey with the smoke test, then restore the ordinary wiring.
const root = fileURLToPath(new URL('../../', import.meta.url));
const pem = readFileSync(resolve(root, '.secrets/venue-public.pem'), 'utf8').trim().replaceAll('\n', '\\n');
const gateway = Object.fromEntries(blueprint.services.find(s => s.name === 'swarm-pay-agentsafe').envVars
  .filter(v => v.value !== undefined).map(v => [v.key, v.value]));
const env = { ...process.env, SWARM_AI_PROVIDER: 'demo', SWARM_RENDER_VENUE_PUBLIC_KEY: pem,
  SWARM_RENDER_GATEWAY_PORT: gateway.PORT, SWARM_RENDER_GATEWAY_LISTEN: gateway.AGENTSAFE_LISTEN };
const run = (command, args, childEnv = env) => spawnSync(command, args, { cwd: root, env: childEnv, stdio: 'inherit' }).status;
const files = ['-f', 'compose.yml', '-f', 'demo/render/compose.yml'];
let status = run('docker', ['compose', ...files, 'up', '-d', '--wait', '--wait-timeout', '240']);
if (status === 0) status = run('node', ['demo/smoke.mjs']);
// Restore with the caller's environment so a local Azure/OpenAI configuration survives the rehearsal.
const restored = run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '240'], process.env);
console.log(status === 0 && restored === 0 ? 'PASS: the Render-wired journey passed and ordinary wiring was restored' : 'FAIL: the journey or restoring ordinary wiring failed');
process.exit((status === 0 ? restored : status) ?? 1);
