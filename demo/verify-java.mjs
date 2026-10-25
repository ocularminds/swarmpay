import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const socket=process.env.SWARM_DOCKER_SOCKET??'/var/run/docker.sock';
// Bind sources are resolved by the Docker daemon. On Docker Desktop this socket
// exists inside its VM even when there is no /var/run/docker.sock on the host.
const args=['run','--rm','--mount',`type=bind,source=${root},target=/workspace`,'--mount','type=volume,source=swarm-pay-gradle-cache,target=/root/.gradle',
  '--mount',`type=bind,source=${socket},target=/var/run/docker.sock`];
if(process.platform==='darwin'||process.platform==='win32')args.push('-e','TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal');
args.push('-w','/workspace','maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320','./gradlew','verify','--no-daemon','--console=plain');
const result=spawnSync('docker',args,{stdio:'inherit'});process.exit(result.status??1);
