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
let interacted=false,initialized=false,resizeTimer=0;
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
function projectedCity(width,height){
  const radians=n=>n*Math.PI/180;
  const mercator=latitude=>Math.log(Math.tan(Math.PI/4+radians(latitude)/2));
  const west=radians(49.76),east=radians(49.98),south=mercator(40.33),north=mercator(40.47);
  const scale=Math.min(width/(east-west),height/(north-south));
  return {x:width/2+(radians(49.84)-(west+east)/2)*scale,
    y:height/2-(mercator(40.384)-(south+north)/2)*scale};
}
function fitPreview(){
  const canvas=root.querySelector(':scope > canvas'),box=canvas?.getBoundingClientRect();
  if(!box?.width||!box.height)return;
  const current=parseFloat(root.querySelector('.tr-zoom-value')?.textContent)||100;
  const factor=225/current;if(!Number.isFinite(factor)||factor<=1.001)return;
  const city=projectedCity(box.width,box.height);
  const goalX=box.width*.5,goalY=box.height*(box.width/box.height>1.2?.46:.50);
  const anchorX=(factor*city.x-goalX)/(factor-1),anchorY=(factor*city.y-goalY)/(factor-1);
  canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,
    deltaY:-100*Math.log(factor),clientX:box.left+anchorX,clientY:box.top+anchorY}));
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
