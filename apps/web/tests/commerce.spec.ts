import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {signIntoWorkspace} from './login';

test.beforeEach(async({page,request})=>{
  await signIntoWorkspace(page,request);
});
test('agent sourcing, separate checkouts, photo hold, an agent request held by AgentSafe, venue delivery and proof export',async({page},info)=>{
  await page.setViewportSize({width:1366,height:950});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByLabel('Venue',{exact:true}).fill('Browser test pavilion');
  await page.getByRole('checkbox',{name:/Tent rentals work/}).check();
  await expect(page.getByLabel('Tent preference')).toHaveValue('');
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  await expect(page.getByText(/^Chose Weather-ready canopy/)).toBeVisible();
  await page.getByRole('checkbox',{name:/I approve these merchants/}).check();
  await page.getByRole('button',{name:'Approve $1,400 plan',exact:true}).click();
  const tents=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Canopy Collective'})});
  await tents.getByRole('button',{name:'Simulated checkout'}).click();
  await expect(page.getByRole('dialog')).toContainText('No PayPal transaction or real charge occurs.');
  await page.getByRole('button',{name:'Simulate payment',exact:true}).click();await expect(tents).toContainText('Payment confirmed');
  const catering=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Gather Kitchen'})});
  await catering.getByRole('button',{name:'Simulated checkout'}).click();await page.getByRole('button',{name:'Simulate authorization'}).click();
  await expect(catering).toContainText('Authorized · awaiting delivery');
  await page.getByRole('button',{name:'View delivery & proof',exact:true}).click();
  await page.getByLabel('Add a delivery photo').setInputFiles({name:'delivery.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64')});
  await expect(page.getByRole('status')).toContainText('Photo saved.');
  await page.getByRole('button',{name:'Request milestone payment'}).click();await expect(page.getByRole('alert')).toContainText('A photo alone cannot release payment');
  await page.getByRole('button',{name:'Let the agent request payment'}).click();
  await expect(page.getByRole('status')).toContainText('AgentSafe held the agent');
  const trail=page.locator('.proof-card');
  await expect(trail.getByText('HELD BY AGENTSAFE')).toBeVisible();await expect(trail.getByText(/^Dossier /).first()).toBeVisible();
  await page.getByRole('button',{name:'Confirm delivery as the venue'}).click();
  await expect(page.getByText('Both payments confirmed',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Venue receipt verified'})).toBeVisible();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download evidence'}).click();
  const evidence=JSON.parse(readFileSync((await(await downloaded).path())!,'utf8'));expect(evidence.applicationChainVerified).toBe(true);expect(evidence.commands).toHaveLength(5);
  expect(errors).toEqual([]);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('desktop-completed.png'),fullPage:true});
});
test('mobile budget refusal is readable and creates no checkout',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('spinbutton',{name:'Total budget in USD'}).fill('1300');await page.getByRole('checkbox',{name:/Tent rentals work/}).check();
  await page.getByRole('button',{name:'Prepare my plan'}).click();await page.getByRole('checkbox',{name:/I approve these merchants/}).check();
  await page.getByRole('button',{name:'Approve $1,400 plan',exact:true}).click();await expect(page.getByRole('alert')).toContainText(/budget/i);
  await expect(page.getByRole('button',{name:'Simulated checkout'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('mobile-budget-block.png'),fullPage:true});
});
