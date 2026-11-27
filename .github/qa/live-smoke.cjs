const {chromium}=require('playwright-core');
const fs=require('node:fs');
const assert=require('node:assert/strict');
fs.mkdirSync('qa-output',{recursive:true});
let phase='startup';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});
 await context.route('https://review-api.elman.digital/**',route=>route.abort('blockedbyclient'));
 const page=await context.newPage();
 try{
  for(const language of ['ru','en','az']){
   phase='live '+language;await page.goto('https://elman.digital/?'+language+'&light',{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#research').scrollIntoViewIfNeeded();
   const cards=page.locator('#research .artifact-grid figure');assert.equal(await cards.count(),4);
   const card=cards.nth(3);assert.equal((await card.locator('h3').innerText()).trim(),'Yolda');
   const img=card.locator('img');await img.scrollIntoViewIfNeeded();
   await page.waitForFunction(e=>e.complete&&e.naturalWidth>0,await img.elementHandle(),{timeout:30000});
   assert.ok(await page.locator('a.text-link > span[aria-hidden="true"]').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).display==='none')));
   assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/i);
   assert.equal(await card.locator('h3 a').getAttribute('target'),'_blank');
   await card.locator('[data-interactive="yolda"]').click();
   assert.match(await page.locator('#research-interactive iframe').getAttribute('src'),new RegExp('lang='+language));
   if(language==='ru'){
     const frame=page.frameLocator('#research-interactive iframe');
     await frame.locator('.tr-clock').waitFor({state:'visible',timeout:90000});
     await frame.locator('#player.tiles').waitFor({state:'visible',timeout:90000});
     await page.locator('#research-interactive').screenshot({path:'qa-output/yolda-live.png'});
   }
   await page.locator('#research-interactive [data-close-interactive]').click();
   if(language==='ru')await page.locator('#research').screenshot({path:'qa-output/research-live.png'});
  }
  phase='live slider';await page.locator('#talks .carousel').scrollIntoViewIfNeeded();
  const controls=page.locator('#talks .carousel-controls button[data-dir]');
  const delta=await controls.first().evaluate(b=>{const c=b.closest('.carousel'),card=c.querySelector('.slide:not([data-loop-copy]) .talk-shortlist-frame').getBoundingClientRect(),r=b.getBoundingClientRect();return Math.abs((card.top+card.height/2)-(r.top+r.height/2));});
  assert.ok(delta<1.6);
  const track=page.locator('#talks .carousel-track'),before=await track.evaluate(e=>e.scrollLeft);
  await controls.last().click();assert.notEqual(await track.evaluate(e=>e.scrollLeft),before);
  console.log(JSON.stringify({pass:true,live:true,languages:true,preview:true,embeddedYolda:true,noindex:true,arrows:true,slider:true,productionReviewWritesBlocked:true}));
 }catch(e){console.error(JSON.stringify({pass:false,phase,message:e.message.slice(0,600)}));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})();
