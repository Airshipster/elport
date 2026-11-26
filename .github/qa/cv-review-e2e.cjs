const {chromium}=require('playwright-core');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const password=process.env.CV_REVIEW_QA_PASSWORD;
if(!password||password.length<20)throw new Error('Missing isolated staging credentials');
const executable=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium-browser','/usr/bin/chromium'].find(fs.existsSync);
if(!executable)throw new Error('Remote browser executable unavailable');
let phase='starting';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function contextFor(browser,options={}){
 const context=await browser.newContext({viewport:{width:1280,height:900},...options});
 await context.route('https://review-api.elman.digital/**',route=>route.abort('blockedbyclient'));
 await context.route('**/review/login.js*',async route=>{
  const response=await route.fetch(),body=fs.readFileSync('review/login.js','utf8');
  const old='https://review-api.elman.digital',replacement='https://cv-review-test.elman.digital';
  if(body.split(old).length!==2)throw new Error('Unexpected login source');
  await route.fulfill({response,body:body.replace(old,replacement)});
 });
 await context.route('**/review/editor.js?*',async route=>{
  const response=await route.fetch(), body=fs.readFileSync('review/editor.js','utf8');
  const old='https://review-api.elman.digital',replacement='https://cv-review-test.elman.digital';
  if(body.split(old).length!==2)throw new Error('Unexpected editor source');
  await route.fulfill({response,body:body.replace(old,replacement)});
 });
 return context;
}
async function findPencil(container,target,method='hover'){
 await target.scrollIntoViewIfNeeded();if(method==='tap')await target.tap({position:{x:15,y:8}});else await target.hover({position:{x:15,y:8}});
 const targetSelector=await target.evaluate(el=>{const parts=[];let x=el;while(x&&x.nodeType===1){if(x.id&&document.getElementById(x.id)===x){parts.unshift('#'+CSS.escape(x.id));break;}let i=1,p=x.previousElementSibling;while(p){if(p.localName===x.localName)i++;p=p.previousElementSibling;}parts.unshift(x.localName+':nth-of-type('+i+')');if(x===document.body)break;x=x.parentElement;}return parts.join(' > ');});
 for(let attempt=0;attempt<60;attempt++){
  for(const selector of ['.cv-review-pencil:not(.is-changed):not([hidden])','.cv-review-pencil.is-changed:not([hidden])']){
   const pens=container.locator(selector);
   for(let i=0,n=await pens.count();i<n;i++){
    const key=await pens.nth(i).getAttribute('data-review-key');
    if(key&&key.startsWith(targetSelector+'|text:'))return pens.nth(i);
   }
  }
  await delay(100);
 }
 throw new Error('Pencil not found near target');
}
async function enterReview(page,name){
 await page.goto('https://elman.digital/login/',{waitUntil:'domcontentloaded'});
 await page.locator('input[name="login"]').fill('review');
 await page.locator('input[name="password"]').fill(password);
 await page.locator('input[name="name"]').fill(name);
 await page.locator('button[type="submit"]').click();
 await page.waitForURL(url=>url.origin==='https://elman.digital'&&!url.pathname.startsWith('/login'),{timeout:30000});
 await page.locator('.cv-review-toolbar').waitFor({state:'visible',timeout:30000});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
 const context=await contextFor(browser),page=await context.newPage();const responses=[],editRequests=[];
 page.on('response',r=>{if(r.url().startsWith('https://cv-review-test.elman.digital/'))responses.push({path:new URL(r.url()).pathname,status:r.status()});});
 page.on('request',r=>{if(r.url()==='https://cv-review-test.elman.digital/edits'&&r.method()==='POST'){try{const j=r.postDataJSON();editRequests.push({page:j.page,expectedRevision:j.expectedRevision,keyLength:j.key?.length,originalLength:j.original?.length})}catch{}}});
 try{
  phase='login form';
  await page.goto('https://elman.digital/login/',{waitUntil:'domcontentloaded'});
  for(const field of ['login','password','name'])assert.equal(await page.locator(`input[name="${field}"]`).inputValue(),'');
  await page.locator('[data-lang="ru"]').click();assert.match(await page.locator('h1').innerText(),/Согласование/);
  await page.locator('[data-lang="az"]').click();assert.match(await page.locator('h1').innerText(),/razılaşdırılması/i);
  phase='save and reload';await enterReview(page,'Reviewer A');
  let note=page.locator('.hero-note');let pen=await findPencil(page,note);await pen.click();
  let input=page.locator('.cv-review-dialog textarea');await input.waitFor({state:'visible'});
  const first='TEST REVIEW '+Date.now();await input.fill(first);await page.locator('.cv-review-dialog .primary').click();
  await page.locator('.cv-review-dialog').waitFor({state:'detached'});await page.waitForFunction(value=>document.querySelector('.hero-note')?.textContent.includes(value),first);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('.cv-review-toolbar').waitFor({state:'visible'});
  await page.waitForFunction(value=>document.querySelector('.hero-note')?.textContent.includes(value),first);
  phase='concurrent edits';const context2=await contextFor(browser),page2=await context2.newPage();await enterReview(page2,'Reviewer B');
  note=page.locator('.hero-note');const note2=page2.locator('.hero-note');
  await (await findPencil(page,note)).click();await (await findPencil(page2,note2)).click();
  await page.locator('.cv-review-dialog textarea').fill(first+' A');await page2.locator('.cv-review-dialog textarea').fill(first+' B');
  await page.locator('.cv-review-dialog .primary').click();
  await page.waitForFunction(()=>!document.querySelector('.cv-review-dialog')||Boolean(document.querySelector('.cv-review-dialog .cv-review-message')?.textContent),null,{timeout:15000});
  if(await page.locator('.cv-review-dialog').count())throw new Error('First concurrent save response: '+await page.locator('.cv-review-dialog .cv-review-message').innerText());
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
  await frame.locator('.cv-review-layer[data-review-ready="1"]').waitFor({state:'attached',timeout:30000});
  await frame.locator('#timelineViewport').evaluate(e=>{e.scrollLeft=0});
  const label=frame.locator('.item-label .item-role').first();await (await findPencil(frame,label)).click();
  await page.locator('.cv-review-dialog textarea').waitFor({state:'visible'});
  const labelText=await label.innerText(),inputText=await page.locator('.cv-review-dialog textarea').inputValue();
  if(labelText!==inputText)throw new Error('Pencil selected a different text; lengths='+labelText.length+','+inputText.length);
  const chronicleText='QA chronicle '+Date.now();await page.locator('.cv-review-dialog textarea').fill(chronicleText);
  await page.locator('.cv-review-dialog .primary').click();
  await page.waitForFunction(()=>!document.querySelector('.cv-review-dialog')||Boolean(document.querySelector('.cv-review-dialog .cv-review-message')?.textContent),null,{timeout:15000});
  if(await page.locator('.cv-review-dialog').count())throw new Error('Chronicle save response: '+await page.locator('.cv-review-dialog .cv-review-message').innerText());
  await page.waitForFunction(value=>document.querySelector('#chronicle-frame')?.contentDocument?.querySelector('.item-label .item-role')?.textContent.includes(value),chronicleText,{timeout:15000});
  phase='languages';
  for(const [language,labelText] of [['ru','Комментарии'],['en','Comments']]){
   await page.goto('https://elman.digital/?'+language,{waitUntil:'domcontentloaded'});
   await page.locator('.cv-review-toolbar').waitFor({state:'visible',timeout:30000});
   assert.equal(await page.locator('.cv-review-comments').innerText(),labelText);
  }
  phase='mobile';const mobile=await contextFor(browser,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const mobilePage=await mobile.newPage();await enterReview(mobilePage,'Reviewer Mobile');
  const mobileNote=mobilePage.locator('.hero-note');await (await findPencil(mobilePage,mobileNote,'tap')).tap();
  await mobilePage.locator('.cv-review-dialog textarea').waitFor({state:'visible'});
  await mobilePage.locator('.cv-review-dialog .cv-review-actions button').nth(1).tap();await mobile.close();
  phase='public visitors';const guest=await browser.newContext(),guestPage=await guest.newPage();
  await guestPage.goto('https://elman.digital/?az',{waitUntil:'domcontentloaded'});await delay(1000);
  assert.equal(await guestPage.locator('.cv-review-toolbar').count(),0);await guest.close();
  await context2.close();console.log(JSON.stringify({pass:true,remoteBrowser:true,loginInputsEmpty:true,persistedEdit:true,conflictPreserved:true,sharedComments:true,chronicle:true,languages:true,mobile:true,guestUnchanged:true,productionWritesBlocked:true}));
 }catch(error){console.error(JSON.stringify({pass:false,phase,message:error.message.slice(0,350),lastResponses:responses.slice(-8),lastEditRequests:editRequests.slice(-4)}));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})();
