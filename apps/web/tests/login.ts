import {expect,type APIRequestContext,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';

/** Signs in from the landing with the example, or with `description`; either is read on arrival. */
export async function signIntoWorkspace(page:Page,request:APIRequestContext,description?:string) {
  const config=await (await request.get('/api/config')).json();
  expect(config.mode).toBe('demo');expect(config.aiProvider).toBe('demo');
  await page.goto('/');
  // The organizer describes the event on the landing; it comes along through sign-in and is read in the workspace.
  if(description)await page.getByLabel('Describe your event').fill(description);
  else await page.getByRole('button',{name:'Use an example'}).click();
  await page.getByRole('button',{name:'Plan my event'}).click();
  if(!config.demoSessionEnabled) {
    if(!process.env.SWARM_TEST_ENV)throw new Error('Hosted tests require their isolated fixture environment file');
    const env=parseEnv(readFileSync(process.env.SWARM_TEST_ENV,'utf8'));
    expect(env.SWARM_MODE).toBe('demo');expect(env.SWARM_AI_PROVIDER).toBe('demo');
    const dialog=page.getByRole('dialog',{name:'Sign in to plan your event'});
    await dialog.getByLabel('Organizer',{exact:true}).fill(env.ORGANIZER_USERNAME);
    await dialog.getByLabel('Password',{exact:true}).fill(env.ORGANIZER_PASSWORD);
    await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'Here’s what we understood.'})).toBeVisible();
  if(description)return;
  await expect(page.getByLabel('Your event')).toHaveValue(/outdoor tech meetup for 30 people/);
  await expect(page.getByLabel('Venue',{exact:true})).toHaveValue('Riverside Pavilion');
}
