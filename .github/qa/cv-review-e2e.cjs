const {chromium}=require('playwright-core');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const token=process.env.CV_REVIEW_QA_COOKIE;
if(!/^[a-f0-9]{64}$/.test(token||''))throw new Error('Missing isolated staging session');
const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium-browser','/usr/bin/chromium'].find(fs.existsSync);
if(!executable)throw new Error('Remote browser executable unavailable');
let phase='starting';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function contextFor(browser){
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.addCookies([{name:'__Host-cv-review',value:token,url:'https://cv-review-test.elman.digital',httpOnly:true,secure:true,sameSite:'Strict'}]);
 await context.route('https://review-api.elman.digital/**',route=>route.abort('blockedbyclient'));
 await context.route('**/review/editor.js?*',async route=>{
  const response=await route.fetch(), body=await response.text();
  const old='https://review-api.elman.digital',replacement='https://cv-review-test.elman.digital';
  if(body.split(old).length!==2)throw new Error('Unexpected editor source');
  await route.fulfill({response,body:body.replace(old,replacement)});
 });
 return context;
}
async function findPencil(container,target){
 await target.scrollIntoViewIfNeeded();await target.hover({position:{x:15,y:8}});
 for(let attempt=0;attempt<60;attempt++){
  const area=await target.boundingBox();const pens=container.locator('.cv-review-pencil:not([hidden])');
  for(let i=0,n=await pens.count();i<n;i++){
   const box=await pens.nth(i).boundingBox();
   if(area&&box&&box.y>=area.y-25&&box.y<=area.y+area.height+15&&box.x>=area.x-25&&box.x<=area.x+area.width+30)return pens.nth(i);
  }
  await delay(100);
 }
 throw new Error('Pencil not found near target');
}
async function enterReview(page){
 await page.goto('https://elman.digital/?az',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>localStorage.setItem('cv-review-active','1'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.cv-review-toolbar').waitFor({state:'visible',timeout:30000});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
 const context=await contextFor(browser),page=await context.newPage();
 try{
  phase='login form';
  await page.goto('https://elman.digital/login/',{waitUntil:'domcontentloaded'});
  for(const field of ['login','password','name'])assert.equal(await page.locator(`input[name="${field}"]`).inputValue(),'');
  await page.locator('[data-lang="ru"]').click();assert.match(await page.locator('h1').innerText(),/Согласование/);
  await page.locator('[data-lang="az"]').click();assert.match(await page.locator('h1').innerText(),/razılaşdırılması/i);
  phase='save and reload';await enterReview(page);
  let note=page.locator('.hero-note');let pen=await findPencil(page,note);await pen.click();
  let input=page.locator('.cv-review-dialog textarea');await input.waitFor({state:'visible'});
  const first='TEST REVIEW '+Date.now();await input.fill(first);await page.locator('.cv-review-dialog .primary').click();
  await page.locator('.cv-review-dialog').waitFor({state:'detached'});await page.waitForFunction(value=>document.querySelector('.hero-note')?.textContent.includes(value),first);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cv-review-toolbar').waitFor({state:'visible'});
  await page.waitForFunction(value=>document.querySelector('.hero-note')?.textContent.includes(value),first);
  phase='concurrent edits';const context2=await contextFor(browser),page2=await context2.newPage();await enterReview(page2);
  note=page.locator('.hero-note');const note2=page2.locator('.hero-note');
  await (await findPencil(page,note)).click();await (await findPencil(page2,note2)).click();
  await page.locator('.cv-review-dialog textarea').fill(first+' A');await page2.locator('.cv-review-dialog textarea').fill(first+' B');
  await page.locator('.cv-review-dialog .primary').click();await page.locator('.cv-review-dialog').waitFor({state:'detached'});
  await page2.locator('.cv-review-dialog .primary').click();
  await page2.waitForFunction(()=>document.querySelector('.cv-review-message')?.textContent.includes('başqa iştirakçı'));
  assert.match(await page2.locator('.cv-review-dialog textarea').inputValue(),/ B$/);
  phase='shared comments';await page2.locator('.cv-review-dialog .cv-review-actions button').nth(1).click();
  await page2.locator('.cv-review-comments').click();const comment='QA comment '+Date.now();
  await page2.locator('.cv-review-dialog textarea').fill(comment);await page2.locator('.cv-review-dialog .primary').click();
  await page2.waitForFunction(value=>document.querySelector('.cv-review-dialog')?.textContent.includes(value),comment);
  await page.locator('.cv-review-comments').click();await page.waitForFunction(value=>document.querySelector('.cv-review-dialog')?.textContent.includes(value),comment);
  await page.locator('.cv-review-dialog .cv-review-actions button').nth(1).click();
  phase='chronicle';const iframe=page.locator('#chronicle-frame');await iframe.scrollIntoViewIfNeeded();
  const frame=page.frameLocator('#chronicle-frame');await frame.locator('#timelineViewport').waitFor({state:'visible',timeout:30000});
  await frame.locator('#timelineViewport').evaluate(e=>{e.scrollLeft=0});
  const label=frame.locator('.item-label .item-role').first();await (await findPencil(frame,label)).click();
  await page.locator('.cv-review-dialog textarea').waitFor({state:'visible'});
  const chronicleText='QA chronicle '+Date.now();await page.locator('.cv-review-dialog textarea').fill(chronicleText);
  await page.locator('.cv-review-dialog .primary').click();await page.locator('.cv-review-dialog').waitFor({state:'detached'});
  await label.waitFor({state:'visible'});assert.match(await label.innerText(),/QA chronicle/);
  phase='languages';
  for(const [language,labelText] of [['ru','Комментарии'],['en','Comments']]){
   await page.goto('https://elman.digital/?'+language,{waitUntil:'domcontentloaded'});
   await page.locator('.cv-review-toolbar').waitFor({state:'visible',timeout:30000});
   assert.equal(await page.locator('.cv-review-comments').innerText(),labelText);
  }
  phase='public visitors';const guest=await browser.newContext(),guestPage=await guest.newPage();
  await guestPage.goto('https://elman.digital/?az',{waitUntil:'domcontentloaded'});await delay(1000);
  assert.equal(await guestPage.locator('.cv-review-toolbar').count(),0);await guest.close();
  await context2.close();console.log(JSON.stringify({pass:true,remoteBrowser:true,loginInputsEmpty:true,persistedEdit:true,conflictPreserved:true,sharedComments:true,chronicle:true,languages:true,guestUnchanged:true,productionWritesBlocked:true}));
 }catch(error){console.error(JSON.stringify({pass:false,phase,message:error.message.slice(0,350)}));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})();
