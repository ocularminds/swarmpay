import {expect,type APIRequestContext,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';

export async function signIntoWorkspace(page:Page,request:APIRequestContext) {
  const config=await (await request.get('/api/config')).json();
  expect(config.mode).toBe('demo');expect(config.aiProvider).toBe('demo');
  await page.goto('/');
  if(config.demoSessionEnabled)await page.getByRole('button',{name:'Plan my event'}).click();
  else {
    if(!process.env.SWARM_TEST_ENV)throw new Error('Hosted tests require their isolated fixture environment file');
    const env=parseEnv(readFileSync(process.env.SWARM_TEST_ENV,'utf8'));
    expect(env.SWARM_MODE).toBe('demo');expect(env.SWARM_AI_PROVIDER).toBe('demo');
    await page.getByLabel('Organizer',{exact:true}).fill(env.ORGANIZER_USERNAME);
    await page.getByLabel('Password',{exact:true}).fill(env.ORGANIZER_PASSWORD);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'Tell us about your event.'})).toBeVisible();
}
