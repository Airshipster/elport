const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
fs.mkdirSync('qa-output',{recursive:true});const sleep=ms=>new Promise(r=>setTimeout(r,ms));let phase='start';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
async function setup(context){
 await context.addInitScript(()=>{
  const p=CanvasRenderingContext2D.prototype,fill=p.fillText,draw=p.drawImage;
  p.fillText=function(text,...args){if(/^\d/.test(String(text))&&this.canvas.height>=14&&this.canvas.height<=32&&this.canvas.width<=180&&this.font.includes('600'))this.canvas.__qaRouteBadge=true;return fill.call(this,text,...args)};
  p.drawImage=function(img,...args){if(img?.__qaRouteBadge)window.__qaBadgeDraws=(window.__qaBadgeDraws||0)+1;return draw.call(this,img,...args)};
 });
 await context.route('https://review-api.elman.digital/**',r=>r.abort('blockedbyclient'));
 await context.route('https://elman.digital/**',async route=>{
  const u=new URL(route.request().url()),name=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
  const full=path.resolve(name),root=path.resolve('.')+path.sep;
  if(!full.startsWith(root)||!fs.existsSync(full)||!fs.statSync(full).isFile())return route.continue();
  await route.fulfill({status:200,contentType:types[path.extname(full)]||'application/octet-stream',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(full)});
 });
}
async function openAndCompare(page){
 await page.goto('https://elman.digital/?ru&light',{waitUntil:'domcontentloaded',timeout:60000});
 const section=page.locator('#research');await section.scrollIntoViewIfNeeded();
 await section.locator('[data-interactive="dashboard"]').click();
 const iframe=page.locator('#research-interactive iframe');const first=await iframe.boundingBox();
 await page.locator('#research-interactive [data-close-interactive]').click();
 await section.locator('[data-interactive="yolda"]').click();
 const frame=iframe.contentFrame();await frame.locator('#loading').waitFor({state:'hidden',timeout:90000});
 await frame.locator('#player.tiles').waitFor({state:'visible',timeout:90000});
 let zoom=0;for(let i=0;i<60;i++){zoom=parseInt(await frame.locator('.tr-zoom-value').textContent(),10);if(zoom>=220)break;await sleep(200);}
 const rect=await iframe.boundingBox();assert.ok(Math.abs(first.height-rect.height)<1,'map height matches first interactive: '+JSON.stringify({first,rect}));
 assert.equal(zoom,220,'the minimum label zoom is displayed');
 assert.ok(!(await iframe.getAttribute('sandbox')).includes('allow-same-origin'));
 return {frame,iframe,first,rect,zoom};
}
async function wheelTo(frame,factor){
 await frame.locator('#player > canvas').first().evaluate((canvas,k)=>{
  const r=canvas.getBoundingClientRect();window.__qaBadgeDraws=0;
  canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-100*Math.log(k),clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
 },factor);
}
async function badges(frame){return frame.locator('#player').evaluate(()=>window.__qaBadgeDraws||0);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});await setup(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  phase='desktop layout';const d=await openAndCompare(page);
  for(let i=0;i<45&&!(await badges(d.frame));i++)await sleep(200);
  assert.ok(await badges(d.frame)>0,'actual route numbers are drawn at 220%');
  await sleep(2000);assert.equal(await d.frame.locator('.tr-zoom-value').textContent(),'220%');
  await page.screenshot({path:'qa-output/desktop-viewport.png'});
  phase='resize before interaction';
  await page.setViewportSize({width:1100,height:850});
  let resizeZoom='';for(let i=0;i<60;i++){await sleep(250);resizeZoom=await d.frame.locator('.tr-zoom-value').textContent();if(resizeZoom==='220%'&&i>=8)break;}
  assert.equal(resizeZoom,'220%','automatic resize preserves the minimum number-label zoom');
  phase='threshold boundary';
  await d.frame.locator('.tr-play').click();await sleep(800);
  await wheelTo(d.frame,219/220.01);await sleep(1600);
  const belowZoom=await d.frame.locator('.tr-zoom-value').textContent(),below=await badges(d.frame);
  assert.equal(belowZoom,'219%');assert.equal(below,0,'no route-number badges below 220%');
  await wheelTo(d.frame,220.01/219);
  for(let i=0;i<35&&!(await badges(d.frame));i++)await sleep(200);
  const at=await badges(d.frame);assert.ok(at>0,'route-number badges return at threshold');
  phase='Collab V2 after Yolda';
  await page.evaluate(()=>{
   window.__qaClicks=[];for(const [name,node] of [['document',document],['research',document.querySelector('#research')]])for(const capture of [true,false])node.addEventListener('click',e=>window.__qaClicks.push({name,capture,target:e.target.closest?.('a[data-interactive]')?.dataset.interactive||e.target.tagName,prevented:e.defaultPrevented}),capture);
  });
  const v2Card=page.locator('#research a[data-interactive="collabs-v2"]').first();
  const cardInfo=await v2Card.evaluate(e=>({loopCopy:!!e.closest('[data-loop-copy]'),parent:e.parentElement?.className,expanded:e.getAttribute('aria-expanded')}));
  await v2Card.scrollIntoViewIfNeeded();await sleep(1000);await v2Card.click();await sleep(500);
  console.log(JSON.stringify({v2Click:cardInfo,events:await page.evaluate(()=>window.__qaClicks),mode:await page.locator('#research-interactive').getAttribute('data-interactive')}));
  await page.screenshot({path:'qa-output/after-v2-click.png'});
  const v2=page.frameLocator('#research-interactive iframe');
  assert.equal(await page.locator('#research-interactive iframe').getAttribute('sandbox'),null);
  await v2.locator('#map').waitFor({state:'attached',timeout:90000});
  let summary='';for(let i=0;i<150;i++){
    summary=(await v2.locator('#selection-summary').textContent()).trim();
    if(/\d/.test(summary)&&/канал/i.test(summary))break;await sleep(400);
  }
  assert.match(summary,/\d.*канал/i,'V2 graph data loaded with actual channel count');
  const mapBox=await v2.locator('#map').boundingBox();assert.ok(mapBox&&mapBox.width>100&&mapBox.height>100,'V2 canvas visible');
  await v2.locator('body[data-intro="complete"]').waitFor({state:'attached',timeout:30000});await sleep(1500);
  await page.screenshot({path:'qa-output/v2-viewport.png'});
  phase='mobile layout';
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});await setup(mobile);
  const phone=await mobile.newPage(),m=await openAndCompare(phone);
  for(let i=0;i<45&&!(await badges(m.frame));i++)await sleep(200);
  assert.ok(await badges(m.frame)>0,'route numbers rendered on mobile');
  await sleep(2000);assert.equal(await m.frame.locator('.tr-zoom-value').textContent(),'220%');
  await phone.screenshot({path:'qa-output/mobile-viewport.png'});
  await mobile.close();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,desktopHeight:d.rect.height,dashboardHeight:d.first.height,mobileHeight:m.rect.height,mobileDashboardHeight:m.first.height,initialZoom:d.zoom,belowZoom,belowBadges:below,atThresholdBadges:at,collabV2Loaded:true,isolated:true,reviewProductionWritesBlocked:true}));
 }catch(error){console.error(JSON.stringify({pass:false,phase,message:error.message.slice(0,900),pageErrors:errors.slice(-4)}));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})();
