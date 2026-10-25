import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:45000,fullyParallel:false,workers:1,
  use:{baseURL:process.env.SWARM_TEST_URL??'http://localhost:5173',headless:true,trace:'retain-on-failure',
    ...(process.env.SWARM_TEST_BROWSER?{channel:process.env.SWARM_TEST_BROWSER}:{})},
  reporter:[['list'],['html',{open:'never'}]],outputDir:'test-results'});
