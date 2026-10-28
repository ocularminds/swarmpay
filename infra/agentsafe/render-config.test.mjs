import test from 'node:test';
import assert from 'node:assert/strict';
import {GatewayConfigLoader} from '@decionis/agentsafe';
import {blueprint} from '../render/blueprint.mjs';

test('Render PORT leaves the gateway reachable from other private services', () => {
  const service=blueprint.services.find(s=>s.name==='swarm-pay-agentsafe');
  const env=Object.fromEntries(service.envVars.filter(v=>v.value!==undefined).map(v=>[v.key,v.value]));
  const config=GatewayConfigLoader.load({version:'0.2.5',env:{...env,NODE_ENV:'development'},file:{
    version:1,
    gateway:{listen:'0.0.0.0:8082',upstream:'http://payment-executor:8081',upstreamInsecure:true},
    authority:{endpoint:'local',mode:'enforcement',failurePolicy:'failClosed'},
  }});
  assert.equal(config.listen.host,'0.0.0.0','PORT alone overrides the file listener with localhost');
  assert.equal(config.listen.port,Number(env.PORT));
  assert.equal(config.authority.mode,'ENFORCEMENT');
  assert.equal(config.authority.failurePolicy,'FAIL_CLOSED');
});
