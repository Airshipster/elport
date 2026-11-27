const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'};
let phase='start';
async function localCandidate(context){
  await context.route('https://review-api.elman.digital/**',r=>r.abort('blockedbyclient'));
  await context.route('https://elman.digital/**',async route=>{
    const u=new URL(route.request().url());
    const name=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const full=path.resolve(name),root=path.resolve('.')+path.sep;
    if(!full.startsWith(root)||!fs.existsSync(full)||!fs.statSync(full).isFile())return route.continue();
    await route.fulfill({status:200,contentType:types[path.extname(full)]||'application/octet-stream',body:fs.readFileSync(full)});
  });
}
async function inspectPage(page,lang){
  await page.goto(`https://elman.digital/?${lang}&light`,{waitUntil:'domcontentloaded',timeout:60000});
  const grid=page.locator('#research .artifact-grid');await grid.scrollIntoViewIfNeeded();
  assert.equal(await grid.locator('figure').count(),4,'four research items');
  const figure=grid.locator('figure').nth(3);
  assert.equal((await figure.locator('h3').innerText()).trim(),'Yolda');
  const preview=figure.locator('img');await preview.scrollIntoViewIfNeeded();
  await page.waitForFunction(img=>img.complete&&img.naturalWidth>0,await preview.elementHandle(),{timeout:30000});
  assert.equal(await figure.locator('h3 a').getAttribute('target'),'_blank');
  assert.equal(await figure.locator('[data-interactive]').getAttribute('href'),`https://airshipster.github.io/yolda/?lang=${lang}`);
  const arrows=page.locator('a.text-link > span[aria-hidden="true"]');assert.ok(await arrows.count()>0);
  assert.ok(await arrows.evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).display==='none')),'decorative link arrows hidden');
  const positions=await page.locator('.carousel.has-carousel-navigation').evaluateAll(nodes=>nodes.map(n=>{
    const button=n.querySelector('button[data-dir]'),slide=n.querySelector('.slide:not([data-loop-copy])');
    const media=slide?.querySelector('.work-art,.talk-shortlist-frame');
    const ref=(media||slide)?.getBoundingClientRect(),b=button?.getBoundingClientRect();
    return {section:n.closest('section')?.id,delta:Math.abs((b.top+b.height/2)-(ref.top+ref.height/2)),icon:getComputedStyle(button.querySelector('span'),'::before').content};
  }));
  for(const x of positions){assert.ok(x.delta<1.6,'carousel controls centered: '+JSON.stringify(x));assert.equal(x.icon,'""');}
  return {figure,positions};
}
(async()=>{
  fs.mkdirSync('qa-output',{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:900},ignoreHTTPSErrors:true});await localCandidate(context);
  const page=await context.newPage();
  try{
    for(const lang of ['ru','en','az']){
      phase='language '+lang;const {figure,positions}=await inspectPage(page,lang);
      if(lang==='ru'){
        await page.locator('#research').screenshot({path:'qa-output/research-candidate.png'});
        phase='existing dashboard';
        await page.locator('#research [data-interactive="dashboard"]').click();
        await page.waitForFunction(()=>!document.querySelector('#research-interactive').hidden);
        assert.match(await page.locator('#research-interactive iframe').getAttribute('src'),/scitopus-in-numbers-live/);
        await page.locator('#research-interactive [data-close-interactive]').click();
        phase='Yolda embedded map';
        await figure.locator('[data-interactive="yolda"]').click();
        const frame=page.frameLocator('#research-interactive iframe');
        await frame.locator('.tr-clock').waitFor({state:'visible',timeout:90000});
        await frame.locator('#player.tiles').waitFor({state:'visible',timeout:90000});
        assert.match(await page.locator('#research-interactive iframe').getAttribute('src'),/yolda\/\?lang=ru/);
        await page.locator('#research-interactive').screenshot({path:'qa-output/yolda-embedded.png'});
        await page.locator('#research-interactive [data-close-interactive]').click();
        await page.locator('#talks .carousel').scrollIntoViewIfNeeded();await sleep(500);
        await page.locator('#talks .carousel').screenshot({path:'qa-output/talks-candidate.png'});
        const track=page.locator('#talks .carousel-track');const before=await track.evaluate(n=>n.scrollLeft);
        await page.locator('#talks .carousel-controls button[data-dir="1"]').click();
        const after=await track.evaluate(n=>n.scrollLeft);assert.notEqual(before,after,'slider button works');
      } else {
        phase='localized Yolda '+lang;
        await figure.locator('[data-interactive="yolda"]').click();
        assert.match(await page.locator('#research-interactive iframe').getAttribute('src'),new RegExp('lang='+lang));
        await page.locator('#research-interactive [data-close-interactive]').click();
      }
      console.log(JSON.stringify({language:lang,carouselCenters:positions}));
    }
    phase='mobile';
    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});await localCandidate(mobile);
    const phone=await mobile.newPage();const {figure}=await inspectPage(phone,'ru');
    await figure.screenshot({path:'qa-output/yolda-mobile.png'});
    await figure.locator('[data-interactive="yolda"]').tap();
    const mobileFrame=phone.frameLocator('#research-interactive iframe');
    await mobileFrame.locator('.tr-clock').waitFor({state:'visible',timeout:90000});
    await mobileFrame.locator('#player.tiles').waitFor({state:'visible',timeout:90000});
    let clock='';for(let attempt=0;attempt<90;attempt++){
      clock=(await mobileFrame.locator('.tr-clock').innerText()).trim();
      if(/^\d{2}:\d{2}$/.test(clock))break;
      await sleep(1000);
    }
    assert.match(clock,/^\d{2}:\d{2}$/,'mobile model data finishes loading');
    await mobileFrame.locator('.tr-zoom button[data-z="1.6"]').tap();
    let zoom=0;for(let attempt=0;attempt<30;attempt++){
      zoom=parseInt(await mobileFrame.locator('.tr-zoom-value').innerText(),10);
      if(zoom>100)break;
      await sleep(200);
    }
    assert.ok(zoom>100,'embedded map zoom responds on mobile');
    await phone.locator('#research-interactive').screenshot({path:'qa-output/yolda-embedded-mobile.png'});
    await mobile.close();
    console.log(JSON.stringify({pass:true,localizedResearch:true,actualYoldaEmbed:true,existingDashboard:true,carouselCenters:true,carouselNavigation:true,linkArrowsHidden:true,mobile:true,reviewProductionWritesBlocked:true}));
  }catch(error){console.error(JSON.stringify({pass:false,phase,message:error.message.slice(0,700)}));process.exitCode=1;}
  finally{await context.close();await browser.close();}
})();
