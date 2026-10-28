import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Validate SwarmPay's OpenAPI document with APIMatic, then generate a TypeScript SDK and the API docs portal from it.
// Needs APIMATIC_API_KEY in the environment or the private .env; it is passed to the CLI and never printed.
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = ['--yes', '@apimatic/cli@1.5.0'];
const input = resolve(root, 'contracts/apimatic');
const spec = resolve(input, 'src/spec/openapi.json');
const portal = resolve(root, process.argv[2] ?? '.local/apimatic/portal');
// The CLI appends the language to its destination directory.
const sdkRoot = resolve(root, '.local/apimatic/sdk');
const sdk = resolve(sdkRoot, 'typescript');

let key = process.env.APIMATIC_API_KEY?.trim();
const envFile = resolve(root, '.env');
if (!key && existsSync(envFile)) {
  if ((statSync(envFile).mode & 0o077) !== 0) throw new Error('The .env file must be private to its owner.');
  key = parseEnv(readFileSync(envFile, 'utf8')).APIMATIC_API_KEY?.trim();
}
if (!key) throw new Error('Add APIMATIC_API_KEY to the private .env (from your APIMatic account), then run this again.');

function apimatic(label, args) {
  console.log(`APIMatic: ${label}`);
  const result = spawnSync('npx', [...cli, ...args, `--auth-key=${key}`], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
apimatic('validating the OpenAPI document', ['api', 'validate', `--file=${spec}`]);
apimatic('generating the TypeScript SDK', ['sdk', 'generate', '--language=typescript', `--input=${input}`, `--destination=${sdkRoot}`, '--force']);
apimatic('generating the API docs portal', ['portal', 'generate', `--input=${input}`, `--destination=${portal}`, '--force']);
console.log(`Generated the SDK in ${sdk} and the portal in ${portal}.`);
