import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {render} from './render.mjs';

const base=JSON.parse(readFileSync(new URL('./target.json',import.meta.url),'utf8'));
const target={...base,ingressClass:'fixture-nginx',ingressNamespace:'fixture-ingress',
  ingressPodLabels:{'app.kubernetes.io/name':'ingress-nginx','app.kubernetes.io/component':'controller'},clusterIssuer:'fixture-dns01',certificateChallenge:'dns01'};
const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
const images=Object.fromEntries(['web','commerce-app','payment-executor','agentsafe','egress'].map(component=>[component,`${target.registry}/swarm-pay/${component}@sha256:${'a'.repeat(64)}`]));

test('unverified ingress and mutable images cannot produce a deployment',()=>{
  assert.throws(()=>render({...target,ingressClass:''},images,key),/verified/);
  assert.throws(()=>render({...target,ingressProvider:'unverified'},images,key),/application-routing/);
  assert.throws(()=>render({...target,ingressPodLabels:{}},images,key),/pod selector/);
  assert.throws(()=>render({...target,certificateChallenge:'http01'},images,key),/DNS-01/);
  assert.throws(()=>render(target,{...images,web:`${target.registry}/swarm-pay/web:latest`},key),/immutable/);
  assert.throws(()=>render({...target,namespace:'default'},images,key),/existing decionis/);
  const privateKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
  assert.throws(()=>render(target,images,privateKey),/public key/);
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
  assert.deepEqual(app.containers[0].envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['swarm-pay-commerce-secrets']);
  assert.deepEqual(executor.containers[0].envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['swarm-pay-payment-secrets']);
  assert.ok(!JSON.stringify(items).includes('venue-private'));
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
    for(const setting of pod.containers[0].env.filter(e=>['DATABASE_URL','AGENTSAFE_URL','AGENTSAFE_UPSTREAM'].includes(e.name))) {
      const hostname=new URL(setting.value.replace(/^jdbc:/,'')).hostname;
      assert.ok(hostname.endsWith('.decionis.svc.cluster.local'));assert.ok(exists('Service',hostname.split('.')[0]));
    }
  }
  for(const pvc of items.filter(i=>i.kind==='PersistentVolumeClaim'))assert.equal(pvc.spec.storageClassName,'decionis-zrs');
  const nginx=items.find(i=>i.kind==='ConfigMap'&&i.metadata.name==='swarm-pay-nginx-template').data['default.conf.template'];
  assert.ok(nginx.includes('server swarm-pay-commerce-app.decionis.svc.cluster.local:8080 resolve;'));
  assert.ok(nginx.includes('server swarm-pay-payment-executor.decionis.svc.cluster.local:8081 resolve;'));
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
  assert.equal(policies.length,7);
  const pod=(component,namespace=target.namespace,ip='10.48.1.2')=>({namespace,ip,labels:{'app.kubernetes.io/part-of':'swarm-pay','app.kubernetes.io/component':component}});
  const app=pod('commerce-app'),executor=pod('payment-executor'),gate=pod('agentsafe'),db=pod('postgres'),web=pod('web'),egress=pod('egress');
  const ingress={namespace:target.ingressNamespace,ip:'10.48.2.2',labels:target.ingressPodLabels};
  assert.ok(allowed(ingress,web,8080,policies));
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
  assert.deepEqual(env('swarm-pay-egress'),[{name:'EGRESS_ALLOW_HOSTS',value:'swarm.decionisedge.com'}]);
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
