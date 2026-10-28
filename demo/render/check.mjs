import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the local stack wired as on Render (host:port peers, inline venue key, resolver from the
// container), prove the journey with the smoke test, then restore the ordinary wiring.
const root = fileURLToPath(new URL('../../', import.meta.url));
const pem = readFileSync(resolve(root, '.secrets/venue-public.pem'), 'utf8').trim().replaceAll('\n', '\\n');
const env = { ...process.env, SWARM_AI_PROVIDER: 'demo', SWARM_RENDER_VENUE_PUBLIC_KEY: pem };
const run = (command, args) => spawnSync(command, args, { cwd: root, env, stdio: 'inherit' }).status;
const files = ['-f', 'compose.yml', '-f', 'demo/render/compose.yml'];
let status = run('docker', ['compose', ...files, 'up', '-d', '--wait', '--wait-timeout', '240']);
if (status === 0) status = run('node', ['demo/smoke.mjs']);
console.log(status === 0 ? 'PASS: the journey works with every peer found by host:port, as the Render Blueprint wires it' : 'FAIL: see above');
run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '240']);
process.exit(status ?? 1);
