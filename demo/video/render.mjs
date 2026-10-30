import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Writes the video's slide, title card and lower third as 1920×1080 PNGs next to slides.html.
// Needs the web app's dependencies (npm --prefix apps/web ci); SWARM_TEST_BROWSER=chrome uses an installed Chrome.
const directory=fileURLToPath(new URL('.',import.meta.url));
const require=createRequire(resolve(directory,'../../apps/web/package.json'));
const {chromium}=require('@playwright/test');
const browser=await chromium.launch(process.env.SWARM_TEST_BROWSER?{channel:process.env.SWARM_TEST_BROWSER}:{});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.goto(pathToFileURL(resolve(directory,'slides.html')).href);
await page.evaluate(()=>document.fonts.ready);
// The grey page only separates the frames on screen; the lower third keeps its transparency.
await page.evaluate(()=>{document.body.style.background='transparent';});
for(const id of ['architecture','title','lower-third'])
  await page.locator('#'+id).screenshot({path:resolve(directory,`${id}.png`),omitBackground:id==='lower-third'});
await browser.close();
console.log('Wrote architecture.png, title.png and lower-third.png');
