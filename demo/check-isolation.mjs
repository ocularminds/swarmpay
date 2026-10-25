import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function docker(args,input){return spawnSync('docker',args,{encoding:'utf8',input,timeout:15000});}
const running=docker(['compose','ps','-q','payment-executor']);assert.equal(running.status,0);const id=running.stdout.trim();assert.ok(id);
const network=docker(['inspect','--format','{{json .NetworkSettings.Networks}}',id]);assert.equal(network.status,0);
const addresses=Object.entries(JSON.parse(network.stdout));const address=addresses.find(([key])=>key.endsWith('_execution'))?.[1].IPAddress;assert.ok(address);
const direct=docker(['compose','exec','-T','commerce-app','curl','--connect-timeout','2','--max-time','3','-fsS',`http://${address}:8081/actuator/health`]);
assert.notEqual(direct.status,0,'Public application must not reach private executor, even with its IP');
const secrets=docker(['compose','exec','-T','commerce-app','sh','-c','test -z "${PAYPAL_TENTS_CLIENT_SECRET+x}" && test -z "${PAYPAL_CATERING_CLIENT_SECRET+x}"']);assert.equal(secrets.status,0);
const privateKey=docker(['compose','exec','-T','commerce-app','sh','-c','test ! -e /run/secrets/venue-private.pem']);assert.equal(privateKey.status,0);
const database=docker(['compose','exec','-T','postgres','psql','-v','ON_ERROR_STOP=1','-U','swarm_app','-d','swarm','-c','SELECT count(*) FROM payments.attempts']);assert.notEqual(database.status,0);assert.match(database.stderr,/permission denied/);
const publicRoute=await fetch((process.env.SWARM_TEST_URL??'http://localhost:5173')+'/internal/payments/commands',{method:'POST',headers:{'Content-Type':'application/json','x-agent-safe-intent-hash':'forged'},body:'{}'});assert.equal(publicRoute.status,404);
console.log('PASS: private executor is unreachable from the app network; public command ingress is absent; payment secrets, signing key and payment-table writes are isolated');
