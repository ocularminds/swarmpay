import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {render} from './render.mjs';

const base=JSON.parse(readFileSync(new URL('./target.json',import.meta.url),'utf8'));
const target={...base,ingressClass:'fixture-nginx',ingressNamespace:'fixture-ingress',
  ingressPodLabels:{'app.kubernetes.io/name':'ingress-nginx','app.kubernetes.io/component':'controller'},clusterIssuer:'fixture-dns01',certificateChallenge:'dns01'};
const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
const images=Object.fromEntries(['web','commerce-app','payment-executor','agentsafe','egress','venue','identity'].map(component=>[component,`${target.registry}/swarm-pay/${component}@sha256:${'a'.repeat(64)}`]));

test('unverified ingress and mutable images cannot produce a deployment',()=>{
  assert.throws(()=>render({...target,ingressClass:''},images,key),/verified/);
  assert.throws(()=>render({...target,ingressProvider:'unverified'},images,key),/application-routing/);
  assert.throws(()=>render({...target,ingressPodLabels:{}},images,key),/pod selector/);
  assert.throws(()=>render({...target,certificateChallenge:'http01'},images,key),/DNS-01/);
  assert.throws(()=>render(target,{...images,web:`${target.registry}/swarm-pay/web:latest`},key),/immutable/);
  assert.throws(()=>render({...target,namespace:'default'},images,key),/existing decionis/);
  const privateKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
  assert.throws(()=>render(target,images,privateKey),/public key/);
  for(const payments of [undefined,'live','production'])assert.throws(()=>render({...target,payments},images,key),/demo or sandbox payments/);
});

test('the public entry point and credentials remain separated from private execution',()=>{
  const bundle=render(target,images,key),items=bundle.privateResources.items;
  assert.ok(!items.some(item=>item.kind==='Ingress'||item.kind==='Secret'));
  assert.deepEqual(bundle.ingress.spec.rules.map(r=>[r.host,r.http.paths[0].backend.service.name]),[['swarm.decionis.com','swarm-pay-web']]);
  assert.equal(bundle.ingress.spec.tls[0].secretName,'swarm-pay-tls');
  for(const service of items.filter(i=>i.kind==='Service'))assert.equal(service.spec.type,'ClusterIP');
  const app=items.find(i=>i.kind==='Deployment'&&i.metadata.name==='swarm-pay-commerce-app').spec.template.spec;
  const executor=items.find(i=>i.kind==='Deployment'&&i.metadata.name==='swarm-pay-payment-executor').spec.template.spec;
  assert.ok(app.containers[0].env.some(e=>e.name==='SWARM_SESSION_COOKIE_SECURE'&&e.value==='true'));
  assert.ok(app.containers[0].env.some(e=>e.name==='SWARM_PUBLIC_ORIGIN'&&e.value==='https://swarm.decionis.com'));
  // Besides its own credentials the app gets only PayPal sign-in's public client ID and the token to ask the identity service.
  assert.deepEqual(app.containers[0].envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['swarm-pay-commerce-secrets','swarm-pay-login-client','swarm-pay-catalog-settings']);
  assert.deepEqual(executor.containers[0].envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['swarm-pay-payment-secrets']);
  // Per-client limits trust forwarded addresses only because the ingress is the web's sole peer.
  const web=items.find(i=>i.kind==='Deployment'&&i.metadata.name==='swarm-pay-web').spec.template.spec;
  assert.ok(web.containers[0].env.some(e=>e.name==='SWARM_TRUSTED_PROXY'&&e.value==='0.0.0.0/0'));
  assert.ok(!JSON.stringify(items).includes('venue-private'));
  // Only the simulated venue receives its signing key, from its own secret.
  const venue=items.find(i=>i.kind==='Deployment'&&i.metadata.name==='swarm-pay-venue').spec.template.spec.containers[0];
  assert.deepEqual(venue.envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['swarm-pay-venue-secrets']);
  assert.equal(venue.image,images.venue);
  for(const name of ['swarm-pay-commerce-app','swarm-pay-payment-executor','swarm-pay-web','swarm-pay-agentsafe','swarm-pay-egress','swarm-pay-identity']) {
    const container=items.find(i=>i.kind==='Deployment'&&i.metadata.name===name).spec.template.spec.containers[0];
    assert.ok(!(container.envFrom??[]).some(v=>v.secretRef?.name==='swarm-pay-venue-secrets'));
  }
});

test('shared-namespace manifests own only prefixed resources and resolve every service, credential and volume reference',()=>{
  const bundle=render(target,images,key),items=bundle.privateResources.items;
  assert.equal('namespace' in bundle,false);
  for(const item of [...items,...bundle.networkPolicies.items,bundle.ingress]) {
    assert.equal(item.metadata.namespace,'decionis');assert.match(item.metadata.name,/^swarm-pay-/);
    assert.equal(item.metadata.labels['app.kubernetes.io/part-of'],'swarm-pay');
    assert.ok(!['Namespace','Role','RoleBinding','ClusterRole','ClusterRoleBinding'].includes(item.kind));
  }
  const exists=(kind,name)=>items.some(i=>i.kind===kind&&i.metadata.name===name);
  for(const item of items.filter(i=>i.kind==='Deployment')) {
    const pod=item.spec.template.spec;
    assert.ok(exists('ServiceAccount',pod.serviceAccountName));
    for(const ref of pod.volumes) {
      if(ref.configMap)assert.ok(exists('ConfigMap',ref.configMap.name));
      if(ref.persistentVolumeClaim)assert.ok(exists('PersistentVolumeClaim',ref.persistentVolumeClaim.claimName));
    }
    for(const ref of pod.containers[0].envFrom)if(ref.configMapRef)assert.ok(exists('ConfigMap',ref.configMapRef.name));
    for(const setting of pod.containers[0].env.filter(e=>['DATABASE_URL','AGENTSAFE_URL','AGENTSAFE_UPSTREAM','COMMERCE_URL'].includes(e.name))) {
      const hostname=new URL(setting.value.replace(/^jdbc:/,'')).hostname;
      assert.ok(hostname.endsWith('.decionis.svc.cluster.local'));assert.ok(exists('Service',hostname.split('.')[0]));
    }
  }
  for(const pvc of items.filter(i=>i.kind==='PersistentVolumeClaim'))assert.equal(pvc.spec.storageClassName,'decionis-zrs');
  const nginx=items.find(i=>i.kind==='ConfigMap'&&i.metadata.name==='swarm-pay-nginx-template').data['default.conf.template'];
  assert.ok(nginx.includes('server swarm-pay-commerce-app.decionis.svc.cluster.local:8080 resolve;'));
  assert.ok(nginx.includes('server swarm-pay-payment-executor.decionis.svc.cluster.local:8081 resolve;'));
  assert.ok(nginx.includes('server swarm-pay-venue.decionis.svc.cluster.local:8084 resolve;'));
  assert.ok(nginx.includes('location /internal/ { return 404; }'));
});

test('every runtime starts without root, Kubernetes credentials or a writable image filesystem',()=>{
  for(const item of render(target,images,key).privateResources.items.filter(i=>i.kind==='Deployment')) {
    const pod=item.spec.template.spec,container=pod.containers[0];
    assert.equal(pod.automountServiceAccountToken,false);
    assert.equal(pod.securityContext.runAsNonRoot,true);
    assert.ok(pod.securityContext.runAsUser>0);
    assert.equal(container.securityContext.readOnlyRootFilesystem,true);
    assert.equal(container.securityContext.allowPrivilegeEscalation,false);
    assert.deepEqual(container.securityContext.capabilities.drop,['ALL']);
    assert.equal(item.spec.replicas,1);
  }
});

test('the rendered policy permits the workflow and rejects private bypasses, cross-namespace traffic and metadata access',()=>{
  const policies=render(target,images,key).networkPolicies.items;
  assert.equal(policies.length,9);
  const pod=(component,namespace=target.namespace,ip='10.48.1.2')=>({namespace,ip,labels:{'app.kubernetes.io/part-of':'swarm-pay','app.kubernetes.io/component':component}});
  const app=pod('commerce-app'),executor=pod('payment-executor'),gate=pod('agentsafe'),db=pod('postgres'),web=pod('web'),egress=pod('egress'),venue=pod('venue');
  const ingress={namespace:target.ingressNamespace,ip:'10.48.2.2',labels:target.ingressPodLabels};
  assert.ok(allowed(ingress,web,8080,policies));
  for(const peer of [app,executor,gate,db,egress,venue])assert.equal(allowed(peer,web,8080,policies),false);
  // The venue answers the web alone and reaches only the application.
  assert.ok(allowed(web,venue,8084,policies));
  assert.ok(allowed(venue,app,8080,policies));
  for(const peer of [app,executor,gate,db,egress,ingress])assert.equal(allowed(peer,venue,8084,policies),false);
  for(const [other,number] of [[executor,8081],[gate,8082],[db,5432],[egress,3128]])assert.equal(allowed(venue,other,number,policies),false);
  assert.equal(allowed(venue,{namespace:null,ip:'20.1.2.3',labels:{}},443,policies),false);
  assert.ok(allowed(web,app,8080,policies));
  assert.ok(allowed(app,gate,8082,policies));
  assert.ok(allowed(gate,executor,8081,policies));
  assert.ok(allowed(web,executor,8081,policies)); // Exact webhook path is enforced by nginx plus executor authentication.
  assert.ok(allowed(app,db,5432,policies));
  assert.ok(allowed(executor,db,5432,policies));
  assert.equal(allowed(app,executor,8081,policies),false);
  assert.equal(allowed(app,executor,443,policies),false);
  assert.equal(allowed(ingress,executor,8081,policies),false);
  assert.equal(allowed(web,db,5432,policies),false);
  assert.equal(allowed(pod('commerce-app','other-namespace'),gate,8082,policies),false);
  assert.equal(allowed(pod('unknown'),app,8080,policies),false);
  const core={namespace:target.namespace,ip:'10.48.3.3',labels:{app:'decionis-api'}};
  const coreWeb={namespace:target.namespace,ip:'10.48.3.4',labels:{app:'decionis-web'}};
  assert.equal(policies.some(p=>matches(p.spec.podSelector,core.labels)),false,'SwarmPay must not select existing Decionis pods');
  assert.ok(allowed(coreWeb,core,8080,policies),'Existing namespace traffic is unaffected');
  assert.equal(allowed(core,executor,8081,policies),false);assert.equal(allowed(core,db,5432,policies),false);
  const internet={namespace:null,ip:'20.1.2.3',labels:{}};
  // The agent reaches nothing outside the cluster directly, PayPal included;
  // its HTTPS goes through the egress proxy, which alone reaches the internet.
  assert.equal(allowed(app,internet,443,policies),false);
  assert.equal(allowed(app,{namespace:null,ip:'151.101.1.21',labels:{}},443,policies),false,'api-m.paypal.com and every public host');
  assert.ok(allowed(app,egress,3128,policies));
  assert.ok(allowed(egress,internet,443,policies));
  assert.equal(allowed(egress,internet,80,policies),false);
  assert.equal(allowed(web,egress,3128,policies),false);
  assert.equal(allowed(executor,egress,3128,policies),false);
  assert.equal(allowed(app,internet,80,policies),false);
  assert.equal(allowed(web,internet,443,policies),false);
  for(const ip of ['169.254.169.254','168.63.129.16','10.64.0.1','172.16.0.2','192.168.0.2'])
    for(const from of [app,egress])assert.equal(allowed(from,{namespace:null,ip,labels:{}},443,policies),false);
});

test('PayPal sign-in answers the app alone, holds the only login secret, and is the app\'s only path to PayPal identity',()=>{
  const bundle=render(target,images,key),items=bundle.privateResources.items,policies=bundle.networkPolicies.items;
  const container=name=>items.find(i=>i.kind==='Deployment'&&i.metadata.name===name).spec.template.spec.containers[0];
  const secretRefs=name=>(container(name).envFrom??[]).filter(v=>v.secretRef).map(v=>v.secretRef);
  // Both start without their secrets, with sign-in off, until the PayPal app's credentials are applied.
  assert.deepEqual(secretRefs('swarm-pay-identity'),[{name:'swarm-pay-identity-secrets',optional:true}]);
  assert.deepEqual(secretRefs('swarm-pay-commerce-app'),[{name:'swarm-pay-commerce-secrets'},{name:'swarm-pay-login-client',optional:true},{name:'swarm-pay-catalog-settings',optional:true}]);
  for(const name of ['swarm-pay-payment-executor','swarm-pay-web','swarm-pay-agentsafe','swarm-pay-egress','swarm-pay-venue'])
    assert.ok(!secretRefs(name).some(ref=>['swarm-pay-identity-secrets','swarm-pay-login-client'].includes(ref.name)),name);
  assert.equal(container('swarm-pay-identity').image,images.identity);
  assert.deepEqual(container('swarm-pay-identity').env,[{name:'PAYPAL_API_BASE',value:'https://api-m.sandbox.paypal.com'}]);
  assert.ok(container('swarm-pay-commerce-app').env.some(v=>v.name==='IDENTITY_URL'&&v.value==='http://swarm-pay-identity.decionis.svc.cluster.local:8085'));
  const pod=component=>({namespace:target.namespace,ip:'10.48.1.2',labels:{'app.kubernetes.io/part-of':'swarm-pay','app.kubernetes.io/component':component}});
  const identity=pod('identity'),internet={namespace:null,ip:'20.1.2.3',labels:{}};
  assert.ok(allowed(pod('commerce-app'),identity,8085,policies));
  for(const other of ['web','venue','payment-executor','agentsafe','egress','postgres'])assert.equal(allowed(pod(other),identity,8085,policies),false,other);
  assert.ok(allowed(identity,internet,443,policies));
  assert.equal(allowed(identity,internet,80,policies),false);
  for(const [other,number] of [['commerce-app',8080],['payment-executor',8081],['postgres',5432],['egress',3128]])assert.equal(allowed(identity,pod(other),number,policies),false,other);
  // The app itself still reaches nothing outside the cluster directly.
  assert.equal(allowed(pod('commerce-app'),internet,443,policies),false);
});

test('the egress proxy gets its model host from its own secret and the app sends HTTPS through it',()=>{
  const items=render(target,images,key).privateResources.items;
  const pod=name=>items.find(i=>i.kind==='Deployment'&&i.metadata.name===name).spec.template.spec.containers[0];
  const proxy=pod('swarm-pay-egress');
  assert.deepEqual(proxy.envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['swarm-pay-egress-settings']);
  assert.equal(proxy.image,images.egress);
  const tool=pod('swarm-pay-commerce-app').env.find(e=>e.name==='JAVA_TOOL_OPTIONS').value;
  assert.match(tool,/-Dhttps\.proxyHost=swarm-pay-egress\.decionis\.svc\.cluster\.local -Dhttps\.proxyPort=3128/);
  assert.match(tool,/\*\.svc\.cluster\.local/);
  assert.ok(items.some(i=>i.kind==='Service'&&i.metadata.name==='swarm-pay-egress'&&i.spec.ports[0].port===3128));
});

test('hosted mode fronts the executor for the fleet alone and runs no gateway in the cluster',()=>{
  const hostedGateway={url:'https://swarm.decionisedge.com',fleetEgressIp:'20.88.59.229',executorHost:'swarm-executor.decionis.com',policyVersion:'swarm-pay-sandbox-v1'};
  const {agentsafe:_unused,...withoutGateway}=images;
  const bundle=render({...target,hostedGateway},withoutGateway,key),items=bundle.privateResources.items,policies=bundle.networkPolicies.items;
  assert.ok(!items.some(i=>i.metadata.name==='swarm-pay-agentsafe'||i.metadata.name==='swarm-pay-authority-evidence'));
  assert.ok(!policies.some(p=>p.metadata.name==='swarm-pay-agentsafe'));
  const env=name=>items.find(i=>i.kind==='Deployment'&&i.metadata.name===name).spec.template.spec.containers[0].env;
  assert.equal(env('swarm-pay-commerce-app').find(e=>e.name==='AGENTSAFE_URL').value,'https://swarm.decionisedge.com');
  assert.deepEqual(env('swarm-pay-egress'),[{name:'EGRESS_ALLOW_HOSTS',value:'swarm.decionisedge.com,api.trychannel3.com'}]);
  assert.equal(items.find(i=>i.kind==='ConfigMap'&&i.metadata.name==='swarm-pay-runtime').data.DECIONIS_POLICY_VERSION,'swarm-pay-sandbox-v1');
  const ingress=bundle.executorIngress;
  assert.equal(ingress.metadata.name,'swarm-pay-executor');
  assert.equal(ingress.metadata.annotations['nginx.ingress.kubernetes.io/whitelist-source-range'],'20.88.59.229/32');
  assert.deepEqual(ingress.spec.tls,[{hosts:['swarm-executor.decionis.com'],secretName:'swarm-pay-executor-tls'}]);
  assert.deepEqual(ingress.spec.rules[0].http.paths.map(p=>[p.path,p.pathType,p.backend.service.name]),
    [['/internal/payments','Prefix','swarm-pay-payment-executor'],['/.well-known/agentsafe-upstream','Exact','swarm-pay-payment-executor']]);
  const pod=(component)=>({namespace:target.namespace,ip:'10.48.1.2',labels:{'app.kubernetes.io/part-of':'swarm-pay','app.kubernetes.io/component':component}});
  const controller={namespace:target.ingressNamespace,ip:'10.48.2.2',labels:target.ingressPodLabels};
  assert.ok(allowed(controller,pod('payment-executor'),8081,policies));
  assert.equal(allowed(pod('commerce-app'),pod('payment-executor'),8081,policies),false);
  assert.ok(allowed(pod('commerce-app'),pod('egress'),3128,policies));
  assert.equal(allowed(pod('commerce-app'),{namespace:null,ip:'20.98.51.136',labels:{}},443,policies),false,'the gateway is reached through the proxy only');
  // The public site is unchanged, and the executor host is not the public host.
  assert.deepEqual(bundle.ingress.spec.rules.map(r=>r.host),['swarm.decionis.com']);
  for(const invalid of [{...hostedGateway,url:'http://swarm.decionisedge.com'},{...hostedGateway,url:'https://swarm.example.com'},
    {...hostedGateway,fleetEgressIp:'10.0.0.1/8'},{...hostedGateway,executorHost:'swarm.decionis.com'},{...hostedGateway,executorHost:'bad host'},{...hostedGateway,policyVersion:''}])
    assert.throws(()=>render({...target,hostedGateway:invalid},withoutGateway,key),/hosted gateway|fleet egress|executor hostname|policyVersion/);
  // Without hostedGateway the in-cluster gateway is still required.
  assert.throws(()=>render(target,withoutGateway,key),/agentsafe/);
});

test('sandbox payments run on their own database and evidence volumes under a disclosed authority',()=>{
  const demo=render(target,images,key).privateResources.items,sandbox=render({...target,payments:'sandbox'},images,key).privateResources.items;
  const runtime=items=>items.find(i=>i.kind==='ConfigMap'&&i.metadata.name==='swarm-pay-runtime').data;
  const claims=items=>items.filter(i=>i.kind==='PersistentVolumeClaim').map(i=>i.metadata.name).sort();
  assert.equal(runtime(demo).SWARM_MODE,'demo');
  assert.deepEqual(claims(demo),['swarm-pay-authority-evidence','swarm-pay-postgres-data']);
  assert.equal(runtime(sandbox).SWARM_MODE,'sandbox');
  assert.equal(runtime(sandbox).SWARM_AUTHORITY,'local');
  assert.deepEqual(claims(sandbox),['swarm-pay-authority-sandbox-evidence','swarm-pay-postgres-sandbox-data']);
  const volume=(items,name)=>items.find(i=>i.kind==='Deployment'&&i.metadata.name===name).spec.template.spec.volumes.find(v=>v.persistentVolumeClaim).persistentVolumeClaim.claimName;
  assert.equal(volume(sandbox,'swarm-pay-postgres'),'swarm-pay-postgres-sandbox-data');
  assert.equal(volume(sandbox,'swarm-pay-agentsafe'),'swarm-pay-authority-sandbox-evidence');
  // With the hosted gateway, Decionis decides sandbox payments.
  const hostedGateway={url:'https://swarm.decionisedge.com',fleetEgressIp:'20.88.59.229',executorHost:'swarm-executor.decionis.com',policyVersion:'swarm-pay-sandbox-v1'};
  const {agentsafe:_unused,...withoutGateway}=images;
  assert.equal(runtime(render({...target,payments:'sandbox',hostedGateway},withoutGateway,key).privateResources.items).SWARM_AUTHORITY,'decionis');
  assert.equal(runtime(render({...target,hostedGateway},withoutGateway,key).privateResources.items).SWARM_AUTHORITY,'local');
});

// Evaluate the standard pod-selector, namespace-selector and IPv4 peer rules
// for representative connections. The actual AKS CNI still needs a live check.
function matches(selector,labels){return Object.entries(selector?.matchLabels??{}).every(([k,v])=>labels[k]===v);}
function address(ip){return ip.split('.').reduce((value,octet)=>(value<<8n)+BigInt(octet),0n);}
function contains(cidr,ip){const [network,bits]=cidr.split('/');const shift=32n-BigInt(bits);return (address(ip)>>shift)===(address(network)>>shift);}
function peerMatches(peer,other,namespace) {
  if(peer.ipBlock)return contains(peer.ipBlock.cidr,other.ip)&&!(peer.ipBlock.except??[]).some(cidr=>contains(cidr,other.ip));
  if(peer.namespaceSelector) {if(!matches(peer.namespaceSelector,{'kubernetes.io/metadata.name':other.namespace}))return false;}
  else if(other.namespace!==namespace)return false;
  return matches(peer.podSelector,other.labels);
}
function allowed(from,to,port,policies) {
  return [['Egress',from,to,'to'],['Ingress',to,from,'from']].every(([direction,subject,other,peers])=>{
    const selected=policies.filter(p=>p.metadata.namespace===subject.namespace&&p.spec.policyTypes.includes(direction)&&matches(p.spec.podSelector,subject.labels));
    return !selected.length||selected.some(p=>(p.spec[direction.toLowerCase()]??[]).some(rule=>
      (!rule.ports||rule.ports.some(candidate=>candidate.port===port&&(candidate.protocol??'TCP')==='TCP'))&&
      (!rule[peers]||rule[peers].some(peer=>peerMatches(peer,other,p.metadata.namespace)))));
  });
}
