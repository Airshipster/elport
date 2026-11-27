const {chromium}=require('playwright-core');
const fs=require('node:fs'),assert=require('node:assert/strict');
fs.mkdirSync('qa-output',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let phase='start';
async function openMap(page,lang){
 await page.goto('https://elman.digital/?'+lang+'&light',{waitUntil:'domcontentloaded',timeout:60000});
 const figure=page.locator('#research .artifact-grid figure').nth(3);await figure.scrollIntoViewIfNeeded();
 assert.equal((await figure.locator('h3').innerText()).trim(),'Yolda');
 assert.equal(await figure.locator('figcaption .yolda-attribution').count(),0);
 assert.match(await page.locator('link[rel="icon"]').getAttribute('href'),/favicon-clear-20261127\.png/);
 assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/i);
 const expected={ru:'Модель движения общественного транспорта Азербайджана.',en:'A model of public transport across Azerbaijan.',az:'Azərbaycan üzrə ictimai nəqliyyatın hərəkət modeli.'}[lang];
 assert.equal((await figure.locator('p').innerText()).trim(),expected);
 assert.ok(await page.locator('#research .link-row a').evaluateAll(aa=>aa.length>0&&aa.every(a=>new URL(a.href).hostname==='github.com')));
 await figure.locator('[data-interactive="yolda"]').click();const iframe=page.locator('#research-interactive iframe');
 assert.match(await iframe.getAttribute('src'),/yolda-embed\.html\?lang=/);
 assert.ok(!(await iframe.getAttribute('sandbox')).includes('allow-same-origin'));
 const frame=iframe.contentFrame();await frame.locator('#loading').waitFor({state:'hidden',timeout:90000});
 await frame.locator('#player.tiles').waitFor({state:'visible',timeout:90000});
 let zoom=0;for(let i=0;i<50;i++){zoom=parseInt(await frame.locator('.tr-zoom-value').textContent(),10);if(zoom>=220)break;await sleep(200);}
 assert.ok(zoom>=220&&zoom<=230,'initial zoom '+zoom);
 assert.equal(await frame.locator('#player').evaluate(()=>{try{return Boolean(parent.document)}catch{return false}}),false);
 return {frame,iframe,figure,zoom};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});await context.route('https://review-api.elman.digital/**',r=>r.abort('blockedbyclient'));
 const page=await context.newPage();
 try{
  phase='live desktop';const d=await openMap(page,'ru');
  const rect=await d.iframe.boundingBox();assert.ok(rect.width>rect.height);
  await page.locator('#research-interactive').screenshot({path:'qa-output/live-desktop.png'});
  const full=d.frame.locator('.tr-zoom button[data-fullscreen]');await full.click();
  await page.waitForFunction(()=>document.fullscreenElement!==null,null,{timeout:10000});
  await full.click();await page.waitForFunction(()=>document.fullscreenElement===null,null,{timeout:10000});
  await page.locator('#research-interactive [data-close-interactive]').click();
  await page.locator('#research').screenshot({path:'qa-output/live-research.png'});
  phase='live languages';
  for(const language of ['en','az']){await page.goto('https://elman.digital/?'+language+'&light',{waitUntil:'domcontentloaded'});const f=page.locator('#research .artifact-grid figure').nth(3);const p=(await f.locator('p').innerText()).trim();assert.ok(!/over the course of a day|bir gün ərzində/i.test(p));}
  phase='live mobile';
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});await mobile.route('https://review-api.elman.digital/**',r=>r.abort('blockedbyclient'));
  const phone=await mobile.newPage(),m=await openMap(phone,'ru'),mobileRect=await m.iframe.boundingBox();
  assert.ok(mobileRect.height<mobileRect.width*1.1);
  await phone.locator('#research-interactive').screenshot({path:'qa-output/live-mobile.png'});
  const plus=m.frame.locator('.tr-zoom button[data-z="1.6"]');await plus.tap();
  let after=0;for(let i=0;i<30;i++){after=parseInt(await m.frame.locator('.tr-zoom-value').textContent(),10);if(after>m.zoom+50)break;await sleep(200);}assert.ok(after>m.zoom+50);
  await mobile.close();
  console.log(JSON.stringify({pass:true,live:true,ruEnAz:true,desktopZoom:d.zoom,mobileZoom:m.zoom,mobileHeight:mobileRect.height,manualZoom:after,isolated:true,fullscreen:true,clearFavicon:true,noindex:true,reviewWritesBlocked:true}));
 }catch(e){console.error(JSON.stringify({pass:false,phase,message:e.message.slice(0,800)}));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})();
