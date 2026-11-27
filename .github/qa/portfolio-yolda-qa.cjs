const {chromium}=require('playwright-core');
const fs=require('node:fs');
const assert=require('node:assert/strict');
fs.mkdirSync('qa-output',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let phase='start';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1200,height:846},deviceScaleFactor:1,ignoreHTTPSErrors:true});
  try{
    phase='Yolda map';
    const page=await context.newPage();
    page.on('pageerror',e=>console.log('pageerror',e.message.slice(0,180)));
    await page.goto('https://airshipster.github.io/yolda/?lang=ru',{waitUntil:'domcontentloaded',timeout:90000});
    await page.locator('.tr-zoom-value').waitFor({state:'visible',timeout:90000});
    await page.waitForFunction(()=>document.querySelector('.tr-clock')?.textContent?.length>0,null,{timeout:90000});
    await page.locator('.tr-range').evaluate(el=>{el.value='32400';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await sleep(4000);
    const cv=page.locator('#player > canvas').first(),box=await cv.boundingBox();
    await cv.dispatchEvent('wheel',{deltaY:-400*Math.log(2.215),clientX:box.x+box.width/2,clientY:box.y+box.height/2,bubbles:true,cancelable:true});
    await sleep(5000);
    const zoom=await page.locator('.tr-zoom-value').innerText();
    const clock=await page.locator('.tr-clock').innerText();
    const hasBasemap=await page.locator('.tr-map canvas').count();
    await page.screenshot({path:'qa-output/yolda-full.png'});
    await page.addStyleTag({content:'.tr-head,.tr-topbar,.tr-legend,.tr-zoom,.tr-bar,.tr-hint,.tr-panel{visibility:hidden!important}'});
    await sleep(400);
    await page.screenshot({path:'qa-output/yolda-initial.png'});
    await page.mouse.move(600,420);await page.mouse.down();
    await page.mouse.move(950,150,{steps:12});await page.mouse.up();
    await sleep(3500);
    await page.screenshot({path:'qa-output/yolda-map.png'});
    console.log(JSON.stringify({phase,zoom,clock,hasBasemap,canvasBox:box}));
    phase='Yolda thumbnail-size capture';
    const small=await browser.newContext({viewport:{width:320,height:226},deviceScaleFactor:2,ignoreHTTPSErrors:true});
    const thumbnail=await small.newPage();
    await thumbnail.goto('https://airshipster.github.io/yolda/?lang=ru',{waitUntil:'domcontentloaded',timeout:90000});
    await thumbnail.locator('.tr-zoom-value').waitFor({state:'attached',timeout:90000});
    await thumbnail.waitForFunction(()=>document.querySelector('.tr-clock')?.textContent?.length>0,null,{timeout:90000});
    await thumbnail.locator('.tr-range').evaluate(el=>{el.value='32400';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await thumbnail.waitForFunction(()=>document.querySelector('.tr-count')?.textContent?.match(/\d/),null,{timeout:90000});
    await sleep(5000);
    const smcv=thumbnail.locator('#player > canvas').first(),smBox=await smcv.boundingBox();
    await smcv.dispatchEvent('wheel',{deltaY:-100*Math.log(2.215),ctrlKey:true,clientX:smBox.x+smBox.width/2,clientY:smBox.y+smBox.height/2,bubbles:true,cancelable:true});
    await thumbnail.waitForFunction(()=>parseInt(document.querySelector('.tr-zoom-value')?.textContent||'0',10)>=220,null,{timeout:30000});
    await sleep(2500);
    await thumbnail.addStyleTag({content:'.tr-head,.tr-topbar,.tr-legend,.tr-zoom,.tr-bar,.tr-hint,.tr-panel,.tr-tip{visibility:hidden!important}'});
    await thumbnail.mouse.move(160,110);await thumbnail.mouse.down();
    await thumbnail.mouse.move(253,38,{steps:12});await thumbnail.mouse.up();await sleep(2500);
    await thumbnail.screenshot({path:'qa-output/yolda-thumb.png'});
    console.log(JSON.stringify({phase,zoom:await thumbnail.locator('.tr-zoom-value').textContent(),hasBasemap:await thumbnail.locator('.tr-map canvas').count()}));
    await small.close();
    phase='portfolio baseline';
    const portfolio=await context.newPage();
    await portfolio.goto('https://elman.digital/?ru&light',{waitUntil:'domcontentloaded',timeout:90000});
    await portfolio.locator('#research').scrollIntoViewIfNeeded();
    await sleep(2000);
    await portfolio.locator('#research').screenshot({path:'qa-output/research-before.png'});
    for(const id of ['selected-work','initiatives','publications','talks','partners']){
      const section=portfolio.locator('#'+id);
      if(!await section.count())continue;
      const carousel=section.locator('.carousel').first();
      if(!await carousel.count())continue;
      await carousel.scrollIntoViewIfNeeded();await sleep(300);
      if(id==='selected-work'||id==='talks')await carousel.screenshot({path:'qa-output/'+id+'-before.png'});
    }
    const measures=await portfolio.locator('.carousel.has-carousel-navigation').evaluateAll(nodes=>nodes.map(n=>{
      const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,height:b.height,mid:b.top+b.height/2}};
      const button=n.querySelector('button[data-dir]'),slide=n.querySelector('.slide:not([data-loop-copy])');
      const media=slide?.querySelector('.work-art,.talk-shortlist-frame');
      return {section:n.closest('section')?.id,button:r(button),slide:r(slide),media:media?r(media):null};
    }));
    const arrows=await portfolio.locator('a.text-link > span[aria-hidden="true"]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.textContent.trim()))]);
    console.log(JSON.stringify({phase,measures,arrows}));
  }catch(e){console.error(JSON.stringify({failed:phase,error:e.message.slice(0,700)}));process.exitCode=1;}
  finally{await context.close();await browser.close();}
})();
