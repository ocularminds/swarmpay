import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script=fileURLToPath(new URL('../../apps/web/resolver.envsh',import.meta.url));
function configure(resolver,{missing=false}={}) {
  const dir=mkdtempSync(join(tmpdir(),'swarm-nginx-dns-'));
  // Model libc's canonical answer after applying resolv.conf search domains.
  // Nginx's own resolver cannot resolve the short aliases in this fixture.
  writeFileSync(join(dir,'getent'),`#!/bin/sh
[ "$1" = hosts ] || exit 2
[ "$SWARM_TEST_DNS_MISSING" != true ] || exit 2
case "$2" in
 commerce) printf '10.0.0.1 service-commerce.workspace.test commerce.workspace.test\\n' ;;
 executor) printf '10.0.0.2 service-executor.workspace.test executor.workspace.test\\n' ;;
 venue) printf '10.0.0.3 service-venue.workspace.test venue.workspace.test\\n' ;;
 *) exit 2 ;;
esac
`,{mode:0o755});
  try {
    return spawnSync('sh',['-ec','. "$1"; printf "%s\\n" "$SWARM_COMMERCE_UPSTREAM" "$SWARM_EXECUTOR_UPSTREAM" "$SWARM_VENUE_UPSTREAM"','sh',script],{
      encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`,SWARM_TEST_DNS_MISSING:String(missing),
        SWARM_NGINX_RESOLVER:resolver,SWARM_COMMERCE_UPSTREAM:'commerce:8080',SWARM_EXECUTOR_UPSTREAM:'executor:8081',SWARM_VENUE_UPSTREAM:'venue:8084'}});
  } finally {rmSync(dir,{recursive:true,force:true});}
}

test('automatic DNS uses system-resolved canonical names and preserves upstream ports',()=>{
  const result=configure('auto');assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'),[
    'service-commerce.workspace.test:8080','service-executor.workspace.test:8081','service-venue.workspace.test:8084']);
});

test('an explicit resolver preserves the configured upstreams without a system lookup',()=>{
  const result=configure('127.0.0.11',{missing:true});assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'commerce:8080\nexecutor:8081\nvenue:8084\n');
});

test('automatic DNS fails startup when a required upstream cannot be resolved',()=>{
  const result=configure('auto',{missing:true});assert.notEqual(result.status,0);
  assert.match(result.stderr,/Cannot resolve Nginx upstream commerce/);
});
