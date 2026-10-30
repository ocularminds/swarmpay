import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {signIntoWorkspace} from './login';

// Each test reads one description on arrival; the web's per-client planning limit (20 a minute) allows a whole run.
test('one next action per step: agent sourcing, both checkouts, an agent request held by AgentSafe, venue delivery and evidence',async({page,request},info)=>{
  await page.setViewportSize({width:1366,height:950});
  await signIntoWorkspace(page,request);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // A venue unique to this run, so the ledger's total covers this plan alone.
  const venue=`Browser test pavilion ${Date.now()}`;
  await page.getByLabel('Venue',{exact:true}).fill(venue);
  await expect(page.getByLabel('Tent preference')).toHaveValue('');
  await page.getByRole('radio',{name:'Rent tents'}).check();
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  await expect(page.locator('.agent-note')).toContainText(/^Chose Weather-ready canopy/);
  const next=page.locator('.next-card'),plan=page.locator('.merchant-list'),dialog=page.getByRole('dialog');
  await expect(next.getByRole('heading',{name:'Approve $1,400 for 2 merchants'})).toBeVisible();
  await page.getByRole('checkbox',{name:/I approve these merchants/}).check();
  await next.getByRole('button',{name:'Approve $1,400',exact:true}).click();
  await expect(next.getByRole('heading',{name:'Pay Canopy Collective'})).toBeVisible();
  await next.getByRole('button',{name:'Pay $500'}).click();
  await expect(dialog).toContainText('No PayPal transaction or real charge occurs.');
  await dialog.getByRole('button',{name:'Pay $500'}).click();
  await expect(next.getByRole('heading',{name:'Authorize Gather Kitchen'})).toBeVisible();
  await expect(plan.getByText('Paid',{exact:true})).toBeVisible();
  await expect(page.locator('.schedule-card')).toContainText('Paid $500',{timeout:10000});
  await next.getByRole('button',{name:'Authorize $900'}).click();await dialog.getByRole('button',{name:'Authorize $900'}).click();
  await expect(next.getByRole('heading',{name:'Confirm the catering delivery'})).toBeVisible();
  await expect(plan).toContainText('Authorized · pays on delivery');
  await next.getByText('Other ways to confirm').click();
  await page.getByLabel('Add a delivery photo').setInputFiles({name:'delivery.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64')});
  await expect(page.getByRole('status')).toContainText('Photo saved.');
  await expect(plan).toContainText('Authorized · pays on delivery');
  await next.getByRole('button',{name:'Let the agent ask'}).click();
  await expect(next.locator('.try-row')).toContainText('Held by AgentSafe. AgentSafe held the agent');
  await expect(page.locator('.timeline')).toContainText('AgentSafe held the agent');
  await page.getByText(/^Payment records and authority decisions/).click();
  const records=page.locator('.records');
  await expect(records.locator('.record.refused')).toContainText('Held by AgentSafe');await expect(records.getByText(/^Dossier /).first()).toBeVisible();
  await next.getByRole('button',{name:'Confirm delivery as the venue'}).click();
  await expect(next.getByRole('heading',{name:'Both merchants are paid'})).toBeVisible();
  await expect(page.getByRole('heading',{level:1,name:'Your event is booked and paid.'})).toBeVisible();
  const downloaded=page.waitForEvent('download');await next.getByRole('button',{name:'Download evidence'}).click();
  const evidence=JSON.parse(readFileSync((await(await downloaded).path())!,'utf8'));expect(evidence.applicationChainVerified).toBe(true);expect(evidence.commands).toHaveLength(5);
  await expect(page.getByText('The record chain verifies')).toBeVisible();
  await page.getByRole('button',{name:'All payments'}).click();
  await expect(page.getByRole('heading',{level:1,name:'All payments'})).toBeVisible();
  const ledger=page.locator('.ledger-grid');
  await page.getByLabel('Search payments').fill(venue);
  await expect(ledger).toContainText('Held by AgentSafe');
  await expect(ledger).toContainText('$1,400 · 2 payments');
  // Every word must match: the caterer's rows alone, and only its payment after delivery counts as paid.
  await page.getByLabel('Search payments').fill(`${venue} Gather`);
  await expect(ledger).toContainText('$900 · 1 payment');
  await page.getByRole('button',{name:'All payments'}).click();
  await expect(page.getByRole('heading',{level:1,name:'Your event is booked and paid.'})).toBeVisible();
  expect(errors).toEqual([]);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('desktop-completed.png'),fullPage:true});
});
test('a description that names no venue or weather leaves them blank, and planning asks for the venue',async({page,request})=>{
  await signIntoWorkspace(page,request,'A garden party for 40 guests. We need 6 tents and catering, $2,000 in total.');
  await expect(page.getByRole('spinbutton',{name:'Guests'})).toHaveValue('40');
  await expect(page.getByLabel('Venue',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Weather and context')).toHaveValue('');
  await page.getByRole('radio',{name:'Rent tents'}).check();
  const created=page.waitForResponse(r=>r.url().endsWith('/api/plans')&&r.request().method()==='POST',{timeout:2000}).then(()=>true,()=>false);
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  await expect(page.getByRole('alert')).toContainText('Add the venue so the merchants know where to deliver.');
  expect(await created).toBe(false);
});
test('mobile: an over-budget plan offers a new plan, never approval or checkout',async({page,request},info)=>{
  await page.setViewportSize({width:390,height:844});
  await signIntoWorkspace(page,request);
  await page.getByRole('spinbutton',{name:'Total budget in USD'}).fill('1300');await page.getByRole('radio',{name:'Rent tents'}).check();
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  await expect(page.getByRole('heading',{name:'Over budget by $100'})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Approve/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^(Pay|Authorize) \$/})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('mobile-budget-block.png'),fullPage:true});
});
test('sandbox checkout: each merchant loads its own PayPal SDK and intent, and the buttons pay tents and authorize catering',async({page,request})=>{
  // The browser alone is told payments run in the sandbox; the server stays simulated, so the buttons drive the simulated provider.
  await page.route('**/api/config',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),mode:'sandbox',clientIds:{tents:'test-tents-client',catering:'test-catering-client'}}});});
  // A stand-in for PayPal's SDK: its button runs the page's createOrder and onApprove, as a buyer approving in PayPal would.
  const sdks:URL[]=[];
  await page.route('https://www.paypal.com/sdk/js?**',route=>{sdks.push(new URL(route.request().url()));return route.fulfill({contentType:'text/javascript',
    body:`(()=>{const ns=document.currentScript.dataset.namespace;window[ns]={Buttons:o=>({render:async el=>{const b=document.createElement('button');b.textContent='PayPal '+ns;
      b.onclick=async()=>{try{await o.onApprove({orderID:await o.createOrder()},{restart:async()=>{}});}catch(e){o.onError(e);}};el.append(b);},close:async()=>{}})};})();`});});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signIntoWorkspace(page,request);
  await page.getByRole('radio',{name:'Rent tents'}).check();
  await page.getByRole('button',{name:'Prepare my plan'}).click();
  const next=page.locator('.next-card'),plan=page.locator('.merchant-list');
  await page.getByRole('checkbox',{name:/I approve these merchants/}).check();
  await next.getByRole('button',{name:'Approve $1,400',exact:true}).click();
  await expect(next.getByRole('heading',{name:'Pay Canopy Collective'})).toBeVisible();
  await expect(next.getByText('Simulated PayPal checkout')).toHaveCount(0);
  await next.getByRole('button',{name:'PayPal paypal_tents_capture'}).click();
  await expect(next.getByRole('heading',{name:'Authorize Gather Kitchen'})).toBeVisible();
  await expect(plan.getByText('Paid',{exact:true})).toBeVisible();
  await next.getByRole('button',{name:'PayPal paypal_catering_authorize'}).click();
  await expect(next.getByRole('heading',{name:'Confirm the catering delivery'})).toBeVisible();
  await expect(plan).toContainText('Authorized · pays on delivery');
  expect(sdks.map(u=>[u.searchParams.get('client-id'),u.searchParams.get('intent')])).toEqual([['test-tents-client','capture'],['test-catering-client','authorize']]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
