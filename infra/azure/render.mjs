import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createPublicKey} from 'node:crypto';
import {isIP} from 'node:net';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const components=['web','commerce-app','payment-executor','agentsafe'];
const postgresImage='postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929';
const partOf={'app.kubernetes.io/part-of':'swarm-pay'};
const labels=component=>({...partOf,'app.kubernetes.io/component':component});
const selector=component=>({matchLabels:labels(component)});
const peer=component=>({podSelector:selector(component)});
const port=number=>({protocol:'TCP',port:number});
const name=value=>typeof value==='string'&&/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)&&value.length<=63;
const resourceName=component=>`swarm-pay-${component}`;

export function render(target,images,venuePublicKey) {
  for(const field of ['namespace','storageClass','ingressClass','ingressNamespace','clusterIssuer'])
    if(!name(target[field]))throw new Error(`Configure a verified ${field} before rendering the Azure deployment`);
  if(target.ingressProvider!=='aks-application-routing'||target.certificateChallenge!=='dns01')
    throw new Error('This bundle requires the existing AKS application-routing NGINX and a DNS-01 ClusterIssuer');
  if(target.namespace!=='decionis')throw new Error('This deployment bundle uses the approved existing decionis namespace');
  if(target.publicHost!=='swarm.decionis.com'||isIP(target.dnsResolver)!==4)throw new Error('Configure the approved public host and the cluster IPv4 DNS resolver');
  if(!target.ingressPodLabels||Object.keys(target.ingressPodLabels).length===0||Object.values(target.ingressPodLabels).some(v=>typeof v!=='string'||!v))
    throw new Error('The ingress controller needs an explicit, verified pod selector');
  for(const component of components) {
    const prefix=`${target.registry}/swarm-pay/${component}@sha256:`;
    if(typeof images[component]!=='string'||!images[component].startsWith(prefix)||!/^[a-f0-9]{64}$/.test(images[component].slice(prefix.length)))
      throw new Error(`Provide the immutable registry digest for ${component}`);
  }
  const admittedKey=createPublicKey(venuePublicKey);
  if(admittedKey.asymmetricKeyType!=='ed25519')throw new Error('Use the admitted venue Ed25519 public key');
  const publicPem=admittedKey.export({type:'spki',format:'pem'});
  if(venuePublicKey.replaceAll('\r\n','\n').trim()!==publicPem.trim())
    throw new Error('Pass only the canonical public key; private signing material is never part of a deployment');
  const ns=target.namespace,items=[];
  const host=component=>`${resourceName(component)}.${ns}.svc.cluster.local`;
  const object=(apiVersion,kind,name,body={})=>({apiVersion,kind,metadata:{name:resourceName(name),namespace:ns,labels:partOf},...body});
  const configEnv={SWARM_MODE:'demo',VENUE_ISSUER:'demo-venue-fixture',DECIONIS_POLICY_VERSION:'swarm-pay-demo-v1'};
  items.push(object('v1','ConfigMap','runtime',{data:configEnv}));
  items.push(object('v1','ConfigMap','venue-public-key',{data:{'venue-public.pem':venuePublicKey}}));
  items.push(object('v1','ConfigMap','postgres-bootstrap',{data:{'01-roles.sql':readFileSync(new URL('../postgres/01-roles.sql',import.meta.url),'utf8')}}));
  const nginxTemplate=readFileSync(new URL('../../apps/web/nginx.conf',import.meta.url),'utf8')
    .replaceAll('commerce-app:8080',`${host('commerce-app')}:8080`).replaceAll('payment-executor:8081',`${host('payment-executor')}:8081`);
  items.push(object('v1','ConfigMap','nginx-template',{data:{'default.conf.template':nginxTemplate}}));
  items.push(object('v1','ServiceAccount','runtime',{automountServiceAccountToken:false}));
  for(const [volume,size] of [['postgres-data','8Gi'],['authority-evidence','4Gi']])
    items.push(object('v1','PersistentVolumeClaim',volume,{spec:{storageClassName:target.storageClass,accessModes:['ReadWriteOnce'],resources:{requests:{storage:size}}}}));

  const secretEnv=secret=>[{configMapRef:{name:resourceName('runtime')}},...(secret?[{secretRef:{name:resourceName(secret)}}]:[])];
  const env=values=>Object.entries(values).map(([name,value])=>({name,value}));
  const publicKey={name:'venue-public',configMap:{name:resourceName('venue-public-key'),defaultMode:0o444}};
  const publicKeyMount={name:'venue-public',mountPath:'/run/secrets/venue',readOnly:true};
  const temporary=name=>({name,emptyDir:{sizeLimit:'64Mi'}});
  function deployment(component,image,user,environment,secret,volumes,mounts,memory,probe) {
    const container={name:component,image,imagePullPolicy:'IfNotPresent',env:env(environment),envFrom:secretEnv(secret),
      securityContext:{allowPrivilegeEscalation:false,readOnlyRootFilesystem:true,capabilities:{drop:['ALL']}},
      resources:{requests:{cpu:'100m',memory},limits:{cpu:'1',memory}},volumeMounts:[...mounts,{name:'tmp',mountPath:'/tmp'}],
      startupProbe:{...probe,periodSeconds:5,failureThreshold:60},readinessProbe:{...probe,periodSeconds:5,timeoutSeconds:3},
      livenessProbe:{...probe,periodSeconds:15,timeoutSeconds:3,failureThreshold:4}};
    items.push(object('apps/v1','Deployment',component,{spec:{replicas:1,strategy:{type:'Recreate'},selector:selector(component),
      template:{metadata:{labels:labels(component)},spec:{serviceAccountName:resourceName('runtime'),automountServiceAccountToken:false,
        terminationGracePeriodSeconds:45,nodeSelector:{'kubernetes.io/os':'linux'},
        securityContext:{runAsNonRoot:true,runAsUser:user,runAsGroup:user,fsGroup:user,seccompProfile:{type:'RuntimeDefault'}},
        containers:[container],volumes:[...volumes,temporary('tmp')]}}}}));
  }
  const javaProbe=number=>({httpGet:{path:'/actuator/health',port:number}});
  deployment('postgres',postgresImage,999,{POSTGRES_DB:'swarm',POSTGRES_USER:'postgres',PGDATA:'/var/lib/postgresql/data/pgdata'},'postgres-secrets',
    [{name:'data',persistentVolumeClaim:{claimName:resourceName('postgres-data')}},{name:'bootstrap',configMap:{name:resourceName('postgres-bootstrap')}},temporary('postgres-run')],
    [{name:'data',mountPath:'/var/lib/postgresql/data'},{name:'bootstrap',mountPath:'/docker-entrypoint-initdb.d',readOnly:true},{name:'postgres-run',mountPath:'/var/run/postgresql'}],
    '512Mi',{exec:{command:['pg_isready','-U','postgres','-d','swarm']}});
  deployment('payment-executor',images['payment-executor'],10001,{DATABASE_URL:`jdbc:postgresql://${host('postgres')}:5432/swarm`,DATABASE_USER:'swarm_executor',VENUE_PUBLIC_KEY_FILE:'/run/secrets/venue/venue-public.pem'},
    'payment-secrets',[publicKey],[publicKeyMount],'512Mi',javaProbe(8081));
  deployment('agentsafe',images.agentsafe,1000,{AGENTSAFE_UPSTREAM:`http://${host('payment-executor')}:8081`},null,
    [{name:'evidence',persistentVolumeClaim:{claimName:resourceName('authority-evidence')}}],[{name:'evidence',mountPath:'/var/lib/agentsafe/evidence'}],'384Mi',
    {exec:{command:['node','-e',"fetch('http://localhost:8082/_agentsafe/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]}});
  deployment('commerce-app',images['commerce-app'],10001,{DATABASE_URL:`jdbc:postgresql://${host('postgres')}:5432/swarm`,DATABASE_USER:'swarm_app',AGENTSAFE_URL:`http://${host('agentsafe')}:8082`,
    ORGANIZER_USERNAME:'organizer',SWARM_AI_PROVIDER:'azure',SWARM_PUBLIC_ORIGIN:`https://${target.publicHost}`,SWARM_SESSION_COOKIE_SECURE:'true',
    VENUE_PUBLIC_KEY_FILE:'/run/secrets/venue/venue-public.pem'},'commerce-secrets',[publicKey],[publicKeyMount],'768Mi',javaProbe(8080));
  deployment('web',images.web,101,{SWARM_NGINX_RESOLVER:target.dnsResolver},null,
    [temporary('nginx-cache'),temporary('nginx-run'),temporary('nginx-config'),{name:'nginx-template',configMap:{name:resourceName('nginx-template'),defaultMode:0o444}}],
    [{name:'nginx-cache',mountPath:'/var/cache/nginx'},{name:'nginx-run',mountPath:'/var/run'},{name:'nginx-config',mountPath:'/etc/nginx/conf.d'},{name:'nginx-template',mountPath:'/etc/nginx/templates',readOnly:true}],
    '96Mi',{httpGet:{path:'/',port:8080}});
  for(const [component,number] of [['postgres',5432],['payment-executor',8081],['agentsafe',8082],['commerce-app',8080],['web',8080]])
    items.push(object('v1','Service',component,{spec:{type:'ClusterIP',selector:labels(component),ports:[{name:'service',port:number,targetPort:number}]}}));

  items.push(object('networking.k8s.io/v1','NetworkPolicy','default-deny',{spec:{podSelector:{matchLabels:partOf},policyTypes:['Ingress','Egress']}}));
  const dns={to:[{namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':'kube-system'}},podSelector:{matchLabels:{'k8s-app':'kube-dns'}}}],ports:[{protocol:'UDP',port:53},port(53)]};
  const externalHttps={to:[{ipBlock:{cidr:'0.0.0.0/0',except:['0.0.0.0/8','10.0.0.0/8','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.168.0.0/16','168.63.129.16/32','224.0.0.0/4','240.0.0.0/4']}}],ports:[port(443)]};
  const to=(component,number)=>({to:[peer(component)],ports:[port(number)]});
  const from=(components,number)=>({from:components.map(peer),ports:[port(number)]});
  const ingressPeer={namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':target.ingressNamespace}},podSelector:{matchLabels:target.ingressPodLabels}};
  for(const [component,ingress,egress] of [
    ['web',[{from:[ingressPeer],ports:[port(8080)]}],[dns,to('commerce-app',8080),to('payment-executor',8081)]],
    ['commerce-app',[from(['web'],8080)],[dns,to('postgres',5432),to('agentsafe',8082),externalHttps]],
    ['agentsafe',[from(['commerce-app'],8082)],[dns,to('payment-executor',8081),externalHttps]],
    ['payment-executor',[from(['agentsafe','web'],8081)],[dns,to('postgres',5432),externalHttps]],
    ['postgres',[from(['commerce-app','payment-executor'],5432)],[]]
  ])items.push(object('networking.k8s.io/v1','NetworkPolicy',component,{spec:{podSelector:selector(component),policyTypes:['Ingress','Egress'],ingress,egress}}));

  const ingress=object('networking.k8s.io/v1','Ingress','ingress',{spec:{ingressClassName:target.ingressClass,
    tls:[{hosts:[target.publicHost],secretName:'swarm-pay-tls'}],rules:[{host:target.publicHost,http:{paths:[{path:'/',pathType:'Prefix',backend:{service:{name:resourceName('web'),port:{number:8080}}}}]}}]}});
  ingress.metadata.annotations={'cert-manager.io/cluster-issuer':target.clusterIssuer,'nginx.ingress.kubernetes.io/force-ssl-redirect':'true',
    'nginx.ingress.kubernetes.io/proxy-read-timeout':'150','nginx.ingress.kubernetes.io/proxy-body-size':'2m','nginx.ingress.kubernetes.io/proxy-buffering':'off'};
  return {networkPolicies:{apiVersion:'v1',kind:'List',items:items.filter(item=>item.kind==='NetworkPolicy')},
    privateResources:{apiVersion:'v1',kind:'List',items:items.filter(item=>item.kind!=='NetworkPolicy')},ingress};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [targetFile,imagesFile,keyFile,output]=process.argv.slice(2);
  if(!output)throw new Error('Usage: node infra/azure/render.mjs target.json images.json venue-public.pem output-directory');
  if(existsSync(output))throw new Error('Choose a new output directory; existing deployment manifests were preserved');
  const result=render(JSON.parse(readFileSync(targetFile,'utf8')),JSON.parse(readFileSync(imagesFile,'utf8')),readFileSync(keyFile,'utf8'));
  mkdirSync(output,{recursive:true,mode:0o700});
  for(const [name,value] of Object.entries(result))writeFileSync(resolve(output,`${name}.json`),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  console.log('Rendered SwarmPay-scoped workloads and ingress for the existing decionis namespace. No namespace object or cloud change was created.');
}
