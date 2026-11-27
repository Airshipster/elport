const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
fs.mkdirSync('qa-output',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let phase='start';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
async function useCandidate(context){
 await context.route('https://review-api.elman.digital/**',r=>r.abort('blockedbyclient'));
 await context.route('https://elman.digital/**',async route=>{
  const u=new URL(route.request().url()),name=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
  const full=path.resolve(name),root=path.resolve('.')+path.sep;
  if(!full.startsWith(root)||!fs.existsSync(full)||!fs.statSync(full).isFile())return route.continue();
  await route.fulfill({status:200,contentType:types[path.extname(full)]||'application/octet-stream',body:fs.readFileSync(full)});
 });
}
async function openMap(page,language){
 await page.goto('https://elman.digital/?'+language+'&light',{waitUntil:'domcontentloaded',timeout:60000});
 const figure=page.locator('#research .artifact-grid figure').nth(3);await figure.scrollIntoViewIfNeeded();
 assert.equal((await figure.locator('h3').innerText()).trim(),'Yolda');
 assert.equal(await figure.locator('figcaption .yolda-attribution').count(),0);
 assert.equal(await figure.locator('.yolda-credit-overlay a').count(),1);
 assert.match(await page.locator('link[rel="icon"]').getAttribute('href'),/favicon-clear-20261127\.png/);
 assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
 const footer=page.locator('#research .link-row a');assert.ok(await footer.count()>0);
 assert.ok(await footer.evaluateAll(links=>links.every(a=>new URL(a.href).hostname==='github.com')));
 await figure.locator('[data-interactive="yolda"]').click();
 const iframe=page.locator('#research-interactive iframe');
 assert.match(await iframe.getAttribute('src'),/yolda-embed\.html\?lang=/);
 const frame=iframe.contentFrame();
 await frame.locator('#loading').waitFor({state:'hidden',timeout:90000});
 await frame.locator('#player.tiles').waitFor({state:'visible',timeout:90000});
 let zoom=0;for(let i=0;i<50;i++){zoom=parseInt(await frame.locator('.tr-zoom-value').textContent(),10);if(zoom>=220)break;await sleep(200);}
 assert.ok(zoom>=220&&zoom<=230,'initial map zoom: '+zoom);
 const rect=await iframe.boundingBox();
 return {figure,iframe,frame,zoom,rect};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});await useCandidate(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  phase='desktop map';const desktop=await openMap(page,'ru');
  assert.ok(desktop.rect.width>desktop.rect.height,'desktop iframe landscape');
  assert.equal((await desktop.figure.locator('p').innerText()).trim(),'Модель движения общественного транспорта Азербайджана.');
  await page.locator('#research-interactive').screenshot({path:'qa-output/embed-desktop.png'});
  await page.locator('#research-interactive [data-close-interactive]').click();
  await page.locator('#research').screenshot({path:'qa-output/research-desktop.png'});
  phase='English and Azerbaijani';
  for(const [lang,expected] of [['en','A model of public transport across Azerbaijan.'],['az','Azərbaycan üzrə ictimai nəqliyyatın hərəkət modeli.']]){
   await page.goto('https://elman.digital/?'+lang+'&light',{waitUntil:'domcontentloaded'});
   const f=page.locator('#research .artifact-grid figure').nth(3);assert.equal((await f.locator('p').innerText()).trim(),expected);
   assert.equal(await f.locator('figcaption .yolda-attribution').count(),0);
  }
  phase='mobile map';
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});await useCandidate(mobile);
  const phone=await mobile.newPage(),m=await openMap(phone,'ru');
  assert.ok(m.rect.height<m.rect.width*1.1,'mobile map is not overly tall: '+JSON.stringify(m.rect));
  await phone.locator('#research-interactive').screenshot({path:'qa-output/embed-mobile.png'});
  const plus=m.frame.locator('.tr-zoom button[data-z="1.6"]');await plus.tap();
  let after=0;for(let i=0;i<30;i++){after=parseInt(await m.frame.locator('.tr-zoom-value').textContent(),10);if(after>m.zoom+50)break;await sleep(200);}
  assert.ok(after>m.zoom+50,'manual zoom works: '+after);
  await mobile.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,desktopZoom:desktop.zoom,desktopSize:desktop.rect,mobileZoom:m.zoom,mobileSize:m.rect,manualZoom:after,threeLanguages:true,cleanCaption:true,emptyFavicon:true,noindex:true,productionReviewWritesBlocked:true}));
 }catch(e){console.error(JSON.stringify({pass:false,phase,message:e.message.slice(0,850),pageErrors:errors.slice(-4)}));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})();
