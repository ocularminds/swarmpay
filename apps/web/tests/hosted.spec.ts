import {test,expect} from '@playwright/test';
import {signIntoWorkspace} from './login';

test('hosted access requires sign-in, uses a secure session, and signs out completely',async({page,request,context},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByLabel('Describe your event')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByText(/Payments, catalog and venue are simulated in this demo\./)).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==='JSESSIONID');
  expect(cookie?.secure).toBe(true);expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  // Describing the event while signed out asks for sign-in first; nothing is read anonymously.
  await page.getByLabel('Describe your event').fill('A rooftop dinner for 12');
  await page.getByRole('button',{name:'Plan my event'}).click();
  const dialog=page.getByRole('dialog',{name:'Sign in to plan your event'});
  await expect(dialog).toContainText('A rooftop dinner for 12');
  await dialog.getByLabel('Password',{exact:true}).fill('incorrect-fixture-password');
  const refused=page.waitForResponse(response=>response.url().endsWith('/api/login'));
  await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
  expect((await refused).status()).toBe(401);
  await expect(dialog.getByRole('alert')).toContainText('That password didn’t work');
  await signIntoWorkspace(page,request);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Here’s what we understood.'})).toHaveCount(0);
  await expect(page.getByLabel('Describe your event')).toHaveValue('');
  const status=await page.evaluate(async()=> (await fetch('/api/plans')).status);
  expect(status).toBe(401);
  await page.screenshot({path:info.outputPath('hosted-mobile-sign-in.png'),fullPage:true});
});
