import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {render} from './render.mjs';

const base=JSON.parse(readFileSync(new URL('./target.json',import.meta.url),'utf8'));
const target={...base,ingressClass:'fixture-nginx',ingressController:'k8s.io/ingress-nginx',ingressNamespace:'fixture-ingress',
  ingressPodLabels:{'app.kubernetes.io/name':'ingress-nginx','app.kubernetes.io/component':'controller'},clusterIssuer:'fixture-dns01',certificateChallenge:'dns01'};
const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
const images=Object.fromEntries(['web','commerce-app','payment-executor','agentsafe'].map(component=>[component,`${target.registry}/swarm-pay/${component}@sha256:${'a'.repeat(64)}`]));

test('unverified ingress and mutable images cannot produce a deployment',()=>{
  assert.throws(()=>render(base,images,key),/verified/);
  assert.throws(()=>render({...target,ingressPodLabels:{}},images,key),/pod selector/);
  assert.throws(()=>render({...target,certificateChallenge:'http01'},images,key),/DNS-01/);
  assert.throws(()=>render(target,{...images,web:`${target.registry}/swarm-pay/web:latest`},key),/immutable/);
  assert.throws(()=>render({...target,namespace:'default'},images,key),/isolated/);
  const privateKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
  assert.throws(()=>render(target,images,privateKey),/public key/);
});

test('the public entry point and credentials remain separated from private execution',()=>{
  const bundle=render(target,images,key),items=bundle.privateResources.items;
  assert.ok(!items.some(item=>item.kind==='Ingress'||item.kind==='Secret'));
  assert.deepEqual(bundle.ingress.spec.rules.map(r=>[r.host,r.http.paths[0].backend.service.name]),[['swarm.decionis.com','web']]);
  assert.equal(bundle.ingress.spec.tls[0].secretName,'swarm-pay-tls');
  for(const service of items.filter(i=>i.kind==='Service'))assert.equal(service.spec.type,'ClusterIP');
  const app=items.find(i=>i.kind==='Deployment'&&i.metadata.name==='commerce-app').spec.template.spec;
  const executor=items.find(i=>i.kind==='Deployment'&&i.metadata.name==='payment-executor').spec.template.spec;
  assert.ok(app.containers[0].env.some(e=>e.name==='SWARM_SESSION_COOKIE_SECURE'&&e.value==='true'));
  assert.ok(app.containers[0].env.some(e=>e.name==='SWARM_PUBLIC_ORIGIN'&&e.value==='https://swarm.decionis.com'));
  assert.deepEqual(app.containers[0].envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['commerce-secrets']);
  assert.deepEqual(executor.containers[0].envFrom.filter(v=>v.secretRef).map(v=>v.secretRef.name),['payment-secrets']);
  assert.ok(!JSON.stringify(items).includes('venue-private'));
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
  const policies=render(target,images,key).privateResources.items.filter(i=>i.kind==='NetworkPolicy');
  const pod=(component,namespace=target.namespace,ip='10.48.1.2')=>({namespace,ip,labels:{'app.kubernetes.io/part-of':'swarm-pay','app.kubernetes.io/component':component}});
  const app=pod('commerce-app'),executor=pod('payment-executor'),gate=pod('agentsafe'),db=pod('postgres'),web=pod('web');
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
  const internet={namespace:null,ip:'20.1.2.3',labels:{}};
  assert.ok(allowed(app,internet,443,policies));
  assert.equal(allowed(app,internet,80,policies),false);
  assert.equal(allowed(web,internet,443,policies),false);
  for(const ip of ['169.254.169.254','168.63.129.16','10.64.0.1','172.16.0.2','192.168.0.2'])
    assert.equal(allowed(app,{namespace:null,ip,labels:{}},443,policies),false);
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
