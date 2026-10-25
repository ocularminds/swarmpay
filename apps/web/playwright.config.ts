import {defineConfig} from '@playwright/test';
const hosted=process.env.SWARM_HOSTED_TEST_URL;
if(hosted&&hosted!=='https://localhost:5443')throw new Error('Hosted browser tests only use the isolated localhost TLS fixture');
export default defineConfig({testDir:'./tests',timeout:45000,fullyParallel:false,workers:1,
  use:{baseURL:process.env.SWARM_TEST_URL??'http://localhost:5173',headless:true,trace:'retain-on-failure',
    ...(process.env.SWARM_TEST_BROWSER?{channel:process.env.SWARM_TEST_BROWSER}:{})},
  projects:[{name:'local',testMatch:'**/commerce.spec.ts'},...(hosted?[{name:'hosted',testMatch:'**/*.spec.ts',use:{baseURL:hosted,ignoreHTTPSErrors:true}}]:[])],
  reporter:[['list'],['html',{open:'never',outputFolder:`playwright-report/${hosted?'hosted':'local'}`}]],outputDir:`test-results/${hosted?'hosted':'local'}`});
