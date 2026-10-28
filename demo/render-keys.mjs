import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A fresh simulated-venue keypair for a Render copy, in the one-line forms its Blueprint prompts take.
// Written owner-only to an ignored file; paste each value into Render, then delete the file.
const root = fileURLToPath(new URL('../', import.meta.url));
const file = resolve(root, '.local/render/venue-keys.env');
if (existsSync(file)) throw new Error(`${file} exists; use it or delete it first.`);
const pair = generateKeyPairSync('ed25519');
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).trim().replaceAll('\n', '\\n');
const privateDer = pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
mkdirSync(resolve(root, '.local/render'), { recursive: true, mode: 0o700 });
writeFileSync(file, `# swarm-pay-executor: VENUE_PUBLIC_KEY\nVENUE_PUBLIC_KEY=${publicPem}\n# swarm-pay-venue: VENUE_PRIVATE_KEY\nVENUE_PRIVATE_KEY=${privateDer}\n`, { mode: 0o600, flag: 'wx' });
console.log(`Wrote a fresh venue keypair to ${file}. Paste each value into Render's prompts, then delete the file.`);
