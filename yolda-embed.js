const baseURL='https://airshipster.github.io/yolda/';
const requested=new URLSearchParams(location.search).get('lang');
const language=['ru','en','az'].includes(requested)?requested:'az';
const copy={
  ru:{loading:'Загружаем карту…',error:'Не удалось загрузить карту.',open:'Открыть Yolda'},
  en:{loading:'Loading the map…',error:'The map could not be loaded.',open:'Open Yolda'},
  az:{loading:'Xəritə yüklənir…',error:'Xəritəni yükləmək olmadı.',open:'Yolda-nı aç'},
}[language];
document.documentElement.lang=language;
const root=document.getElementById('player'),loading=document.getElementById('loading');
loading.textContent=copy.loading;

// Yolda resolves its own data and attribution assets from document.baseURI.
const base=document.createElement('base');base.href=baseURL;document.head.prepend(base);
const round=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
let interacted=false,initialized=false,resizeTimer=0,initialFitScale=0;
for(const name of ['pointerdown','wheel','keydown'])root.addEventListener(name,event=>{
  if(event.isTrusted)interacted=true;
},{capture:true,passive:true});

function waitForMap(){
  return new Promise(resolve=>{
    if(root.classList.contains('tiles'))return resolve();
    const observer=new MutationObserver(()=>{if(root.classList.contains('tiles'))finish();});
    const timer=setTimeout(finish,17000);
    function finish(){clearTimeout(timer);observer.disconnect();resolve();}
    observer.observe(root,{attributes:true,attributeFilter:['class']});
  });
}

// Match Yolda's opening Baku bounds and center the city above the bay.
function openingGeometry(width,height){
  const radians=n=>n*Math.PI/180,mercator=latitude=>Math.log(Math.tan(Math.PI/4+radians(latitude)/2));
  const west=radians(49.76),east=radians(49.98),south=mercator(40.33),north=mercator(40.47);
  const scale=Math.min(width/(east-west),height/(north-south));
  return {scale,x:width/2+(radians(49.84)-(west+east)/2)*scale,
    y:height/2-(mercator(40.384)-(south+north)/2)*scale};
}
function fitPreview(){
  const canvas=root.querySelector(':scope > canvas'),box=canvas?.getBoundingClientRect();
  if(!box?.width||!box.height)return;
  const city=openingGeometry(box.width,box.height);
  if(!initialFitScale)initialFitScale=city.scale;
  const current=100*city.scale/initialFitScale;
  // Yolda draws route numbers at 220%; a tiny margin avoids floating-point rounding below the threshold.
  const factor=220.01/current;if(!Number.isFinite(factor)||factor<=0)return;
  const goalX=box.width*.5,goalY=box.height*(box.width/box.height>1.2?.46:.50);
  canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,
    deltaY:-100*Math.log(factor),clientX:box.left+box.width/2,clientY:box.top+box.height/2}));
  // Yolda's zoom remains centered; use its normal drag handler to place the bay below the city.
  const scaledX=box.width/2+(city.x-box.width/2)*factor;
  const scaledY=box.height/2+(city.y-box.height/2)*factor;
  const dx=goalX-scaledX,dy=goalY-scaledY,startX=box.left+box.width/2,startY=box.top+box.height/2;
  const previous=Object.getOwnPropertyDescriptor(canvas,'setPointerCapture');
  Object.defineProperty(canvas,'setPointerCapture',{configurable:true,value:()=>{}});
  try{
    const pointer={pointerId:98761,pointerType:'mouse',isPrimary:true,bubbles:true,cancelable:true};
    canvas.dispatchEvent(new PointerEvent('pointerdown',{...pointer,button:0,buttons:1,clientX:startX,clientY:startY}));
    canvas.dispatchEvent(new PointerEvent('pointermove',{...pointer,button:0,buttons:1,clientX:startX+dx,clientY:startY+dy}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{...pointer,button:0,buttons:0,clientX:startX+dx,clientY:startY+dy}));
  }finally{
    if(previous)Object.defineProperty(canvas,'setPointerCapture',previous);else delete canvas.setPointerCapture;
  }
}

try{
  const {mount}=await import('https://airshipster.github.io/yolda/player.js');
  await mount(root,new URL('baku-day.json',baseURL).href,{language,localeUrls:false});
  await waitForMap();await round();
  if(!interacted)fitPreview();
  initialized=true;await round();loading.hidden=true;
  window.addEventListener('resize',()=>{
    if(!initialized||interacted)return;
    clearTimeout(resizeTimer);resizeTimer=setTimeout(async()=>{
      if(interacted)return;
      root.querySelector('.tr-zoom button[data-z="0"]')?.click();
      await round();if(!interacted)fitPreview();
    },250);
  },{passive:true});
}catch(error){
  console.error('Yolda embed:',error);
  loading.textContent='';const message=document.createElement('span');message.textContent=copy.error+' ';
  const link=document.createElement('a');link.href=baseURL+'?lang='+language;link.target='_blank';link.rel='noopener noreferrer';link.textContent=copy.open;
  message.append(link);loading.append(message);
}
