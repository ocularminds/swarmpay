import {test,expect} from '@playwright/test';
import {signIntoWorkspace} from './login';

test('hosted access requires sign-in, uses a secure session, and signs out completely',async({page,request,context},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Explore the local demo'})).toHaveCount(0);
  await expect(page.getByText('Payments, catalog and venue issuer are simulated.')).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==='JSESSIONID');
  expect(cookie?.secure).toBe(true);expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  await page.getByLabel('Password',{exact:true}).fill('incorrect-fixture-password');
  const refused=page.waitForResponse(response=>response.url().endsWith('/api/login'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  expect((await refused).status()).toBe(401);
  await expect(page.getByRole('alert')).toContainText('credentials were not accepted');
  await signIntoWorkspace(page,request);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'What are we planning?'})).toHaveCount(0);
  const status=await page.evaluate(async()=> (await fetch('/api/plans')).status);
  expect(status).toBe(401);
  await page.screenshot({path:info.outputPath('hosted-mobile-sign-in.png'),fullPage:true});
});
