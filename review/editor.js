(() => {
  'use strict';
  if (localStorage.getItem('cv-review-active') !== '1' || location.origin !== 'https://elman.digital') return;
  const script=document.currentScript;
  const API='https://review-api.elman.digital';
  const lang=(()=>{try{return (window.top.document.documentElement.lang||'ru').slice(0,2)}catch{return (document.documentElement.lang||'ru').slice(0,2)}})();
  if(!['ru','en','az'].includes(lang))return;
  const copy={
    ru:{comments:'Комментарии',logout:'Выйти',edit:'Редактировать текст',original:'Исходный текст',translation:'Новый текст',save:'Сохранить',cancel:'Отмена',history:'История изменений',empty:'Пока комментариев нет.',newComment:'Общий комментарий',send:'Отправить',close:'Закрыть',conflict:'Другой участник уже изменил этот текст. Ваша версия сохранена в поле выше. Текущая версия:',refresh:'Продолжить с текущей версией',network:'Не удалось сохранить. Проверьте соединение и повторите попытку.',frozen:'Согласование временно закрыто для сохранения результатов. Ваш текст остался в поле.',saved:'Сохранено',by:'Автор',at:'Дата',scope:'Страница',session:'Сессия закончилась. Войдите снова.'},
    en:{comments:'Comments',logout:'Sign out',edit:'Edit text',original:'Original text',translation:'New text',save:'Save',cancel:'Cancel',history:'Change history',empty:'No comments yet.',newComment:'General comment',send:'Send',close:'Close',conflict:'Another participant has changed this text. Your draft remains above. Current version:',refresh:'Continue from current version',network:'Could not save. Check your connection and try again.',frozen:'Review is temporarily closed while results are saved. Your draft remains in the field.',saved:'Saved',by:'Author',at:'Date',scope:'Page',session:'Your session has expired. Please sign in again.'},
    az:{comments:'Şərhlər',logout:'Çıxış',edit:'Mətni redaktə et',original:'İlkin mətn',translation:'Yeni mətn',save:'Yadda saxla',cancel:'Ləğv et',history:'Dəyişiklik tarixçəsi',empty:'Hələ şərh yoxdur.',newComment:'Ümumi şərh',send:'Göndər',close:'Bağla',conflict:'Bu mətni başqa iştirakçı dəyişib. Yazdığınız mətn yuxarıdakı sahədə qalıb. Cari versiya:',refresh:'Cari versiya ilə davam et',network:'Yadda saxlamaq alınmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.',frozen:'Nəticələr saxlanıldığı üçün razılaşdırma müvəqqəti bağlanıb. Yazdığınız mətn sahədə qalıb.',saved:'Yadda saxlanıldı',by:'Müəllif',at:'Tarix',scope:'Səhifə',session:'Sessiya başa çatdı. Yenidən daxil olun.'}
  }[lang];
  const nodeInfo=new WeakMap(), pending=new WeakMap(), known=new Set(), records=new Map();
  const inFrame=window!==window.top;
  let page=location.pathname.split('/').filter(Boolean).pop()||`index-${lang}.html`;
  if(page==='index.html')page=`index-${lang}.html`;
  let itemId='';
  if(page==='talk-shortlist-card.html'){
    try {const item=JSON.parse(new URLSearchParams(location.search).get('item')||'{}');itemId=String(item.id||item.pick||'').replace(/[^a-z0-9_.-]/gi,'').slice(0,100)}catch{}
    page='talk:'+ (itemId||'unknown');
  }
  if(!/^(?:index-(?:ru|en|az)\.html|chronicle(?:-(?:en|az))?\.html|talk:[a-z0-9_.-]+)$/i.test(page))return;
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('editor.css'+new URL(script.src).search,script.src).href;document.head.append(css);
  const layer=document.createElement('div');layer.className='cv-review-layer';layer.dataset.reviewUi='';document.body.append(layer);
  const pencilSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.4-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Zm10.7-13.3 3 3"/></svg>';
  const hover=makePencil(false);hover.hidden=true;
  let hovered=null,scanTimer=0,positionQueued=false,resizeTimer=0,ready=false;

  function makePencil(changed){const b=document.createElement('button');b.type='button';b.className='cv-review-pencil'+(changed?' is-changed':'');b.dataset.reviewUi='';b.setAttribute('aria-label',copy.edit);b.title=copy.edit;b.innerHTML=pencilSvg;layer.append(b);return b;}
  function element(tag,cls,value){const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e;}
  async function request(path,options={}){
    const response=await fetch(API+path,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const data=await response.json().catch(()=>({error:'server_error'}));
    if(response.status===401){localStorage.removeItem('cv-review-active');throw Object.assign(new Error(copy.session),{status:401});}
    if(!response.ok)throw Object.assign(new Error(data.error||copy.network),{status:response.status,data});
    return data;
  }
  async function fingerprint(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(b)].slice(0,16).map(x=>x.toString(16).padStart(2,'0')).join('');}
  function pathFor(el){
    const parts=[];let x=el;
    while(x&&x.nodeType===1){
      if(x.id&&document.getElementById(x.id)===x){parts.unshift('#'+CSS.escape(x.id));break;}
      let i=1,prev=x.previousElementSibling;while(prev){if(prev.localName===x.localName)i++;prev=prev.previousElementSibling;}
      parts.unshift(x.localName+':nth-of-type('+i+')');
      if(x===document.body)break;x=x.parentElement;
    }
    return parts.join(' > ');
  }
  function canonicalElement(el){
    const clone=el.closest('[data-loop-copy]');if(!clone)return el;
    const original=[...clone.parentElement.children].find(x=>!x.hasAttribute('data-loop-copy')&&x.dataset.order===clone.dataset.order);
    if(!original)return el;
    const indexes=[];let current=el;
    while(current&&current!==clone){indexes.unshift([...current.parentElement.children].indexOf(current));current=current.parentElement;}
    if(current!==clone)return el;
    let result=original;for(const index of indexes){result=result.children[index];if(!result)return el;}
    return result;
  }
  function sourceContext(node){
    const panel=node.parentElement?.closest('#detailPanel');
    if(!panel)return '';
    const t=document.getElementById('detailTitle')?.firstChild;
    return t ? (nodeInfo.get(t)?.original || t.nodeValue || '').trim() : '';
  }
  function allowed(node){
    if(!node||node.nodeType!==Node.TEXT_NODE||!node.nodeValue?.trim()||node.nodeValue.length>10000)return false;
    const p=node.parentElement;if(!p||p.closest('[data-review-ui],script,style,noscript,svg,canvas,textarea,input,select,option,pre,code'))return false;
    return Boolean(p.closest('body'));
  }
  function trimParts(raw){const a=raw.match(/^\s*/)[0],b=raw.match(/\s*$/)[0];return {before:a,after:b,original:raw.slice(a.length,raw.length-b.length)};}
  function sourceParent(){try{const p=window.top.location.pathname;return p==='/'||p==='/index.html'?`/index-${lang}.html`:p}catch{return location.pathname}}
  function timelineContext(node){
    const owner=node.parentElement?.closest('.timeline-item');if(!owner)return null;
    const d=owner.dataset;
    return {category:d.category||'',type:d.type||'',start:d.actualStart||d.start||'',end:d.actualEnd||d.end||'',year:d.year||'',kind:d.kind||'',
      label:(owner.querySelector('.item-label strong,.event-title')?.textContent||'').trim().slice(0,200)};
  }
  async function register(node){
    if(!node)return null;
    if(pending.has(node))return pending.get(node);
    const job=registerOne(node);pending.set(node,job);
    try{return await job}finally{if(pending.get(node)===job)pending.delete(node);}
  }
  async function registerOne(node){
    if(!allowed(node))return null;
    let info=nodeInfo.get(node);
    if(info&&info.rendered===node.nodeValue)return info;
    if(info){if(info.pencil)info.pencil.remove();known.delete(info);nodeInfo.delete(node);}
    const raw=node.nodeValue,canonical=canonicalElement(node.parentElement),parts=trimParts(raw),selector=pathFor(canonical);
    const index=[...node.parentElement.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).indexOf(node);
    const originalNode=[...canonical.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE)[index],originalInfo=nodeInfo.get(originalNode);
    if(originalInfo&&originalNode!==node&&(raw===originalInfo.rendered||raw===originalInfo.before+originalInfo.original+originalInfo.after)){
      parts.original=originalInfo.original;parts.before=originalInfo.before;parts.after=originalInfo.after;
    }
    const context=sourceContext(node);
    const key=selector+'|text:'+index+'|'+await fingerprint(parts.original+'\n'+context);
    if(!node.isConnected || !allowed(node) || node.nodeValue!==raw)return null;
    info={node,selector,index,context,key,page,language:lang,original:parts.original,before:parts.before,after:parts.after,rendered:node.nodeValue,
      locator:JSON.stringify({document:location.pathname,selector,textIndex:index,context,parentPage:sourceParent(),itemId,timeline:timelineContext(node)})};
    nodeInfo.set(node,info);known.add(info);apply(info);return info;
  }
  function apply(info){
    if(!info.node.isConnected)return;
    const rec=records.get(info.key);if(rec&&rec.original_text!==info.original)return;
    const value=rec?rec.current_text:info.original, rendered=info.before+value+info.after;
    if(info.node.nodeValue!==rendered){info.rendered=rendered;info.node.nodeValue=rendered;if(page.startsWith('chronicle')){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>window.dispatchEvent(new Event('resize')),350);}}
    else info.rendered=rendered;
    if(rec&&!info.pencil){info.pencil=makePencil(true);info.pencil.dataset.reviewKey=info.key;info.pencil.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openEditor(info)});}
    if(rec&&hovered===info){hovered=null;hover.hidden=true;}
    if(!rec&&info.pencil){info.pencil.remove();info.pencil=null;}
  }
  async function scan(){
    scanTimer=0;
    for(const info of known)if(!info.node.isConnected){info.pencil?.remove();known.delete(info);}
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    const original=[],clones=[];while((n=walker.nextNode()))if(allowed(n))(n.parentElement.closest('[data-loop-copy]')?clones:original).push(n);
    await Promise.all(original.map(register));await Promise.all(clones.map(register));schedulePosition();
  }
  function scheduleScan(){if(!scanTimer)scanTimer=setTimeout(scan,180);}
  function rectFor(info){
    try{const r=document.createRange();r.selectNodeContents(info.node);let box=r.getBoundingClientRect();if(!box.width&&!box.height)box=info.node.parentElement.getBoundingClientRect();return box}catch{return null}
  }
  function place(button,info){
    const r=rectFor(info);if(!r||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth){button.hidden=true;return;}
    button.hidden=false;button.style.left=Math.max(0,Math.min(innerWidth-28,r.right-10))+'px';button.style.top=Math.max(0,Math.min(innerHeight-28,r.top-8))+'px';
  }
  function position(){positionQueued=false;for(const info of known)if(info.pencil)place(info.pencil,info);if(hovered)place(hover,hovered);}
  function schedulePosition(){if(!positionQueued){positionQueued=true;requestAnimationFrame(position);}}
  function findText(target,x,y){
    const hit=document.caretPositionFromPoint?.(x,y)?.offsetNode || document.caretRangeFromPoint?.(x,y)?.startContainer;
    if(allowed(hit)&&target&&(target===hit.parentElement||target.contains?.(hit.parentElement)))return hit;
    if(!target||target.nodeType!==1)return null;
    const direct=[...target.childNodes].find(allowed);if(direct)return direct;
    const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))if(allowed(n))return n;
    return null;
  }
  async function showPencil(event){
    if(!ready)return;
    if(event.target.closest?.('[data-review-ui]'))return;
    const node=findText(event.target,event.clientX,event.clientY);
    if(!node){hovered=null;hover.hidden=true;return;}
    const info=await register(node);if(!info||records.has(info.key)){hovered=null;hover.hidden=true;return;}
    hovered=info;hover.dataset.reviewKey=info.key;place(hover,info);
  }
  document.addEventListener('pointermove',showPencil,{passive:true});
  document.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')showPencil(event);},{passive:true});
  document.addEventListener('focusin',async event=>{if(!ready||event.target.closest?.('[data-review-ui]'))return;const n=findText(event.target,-1,-1);const info=await register(n);if(info&&!records.has(info.key)){hovered=info;hover.dataset.reviewKey=info.key;place(hover,info);}});
  hover.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(hovered)openEditor(hovered)});
  window.addEventListener('scroll',schedulePosition,true);window.addEventListener('resize',schedulePosition);

  function modal(title){
    const overlay=element('div','cv-review-overlay');overlay.dataset.reviewUi='';
    const box=element('section','cv-review-dialog');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',title);
    box.append(element('h2','',title));overlay.append(box);document.body.append(overlay);
    const prior=document.activeElement;
    const close=()=>{overlay.remove();if(prior?.isConnected)prior.focus?.({preventScroll:true});};
    overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
    return {box,close};
  }
  function action(label,primary=false){const b=element('button',primary?'primary':'',label);b.type='button';return b;}
  function parentEditor(info){
    if(inFrame){try{if(window.top.CVReview?.edit){info.record=records.get(info.key)||null;window.top.CVReview.edit(info,()=>refresh());return true;}}catch{}}
    return false;
  }
  function openEditor(info){if(parentEditor(info))return;editModal(info,()=>refresh());}
  function editModal(info,onSaved){
    const {box,close}=modal(copy.edit), rec=(info.page===page?records.get(info.key):info.record) || null;
    let expected=rec?.revision||0;
    box.append(element('p','cv-review-muted',copy.original));box.append(element('div','cv-review-original',info.original));
    box.append(element('h3','',copy.translation));const input=element('textarea');input.value=rec?.current_text??info.original;input.maxLength=10000;box.append(input);
    const message=element('p','cv-review-message');box.append(message);
    const conflictText=element('div','cv-review-original');conflictText.hidden=true;box.append(conflictText);
    const row=element('div','cv-review-actions'), save=action(copy.save,true), cancel=action(copy.cancel), refreshButton=action(copy.refresh);
    refreshButton.hidden=true;row.append(save,cancel,refreshButton);box.append(row);cancel.addEventListener('click',close);
    let conflict=null;
    refreshButton.addEventListener('click',()=>{expected=conflict?.revision||0;message.textContent='';conflictText.hidden=true;refreshButton.hidden=true;});
    save.addEventListener('click',async()=>{
      save.disabled=true;message.textContent='';
      try{await request('/edits',{method:'POST',body:JSON.stringify({page:info.page,language:info.language,key:info.key,locator:info.locator,original:info.original,value:input.value,expectedRevision:expected})});close();await onSaved?.();}
      catch(error){if(error.status===409){conflict=error.data.current;message.textContent=copy.conflict;conflictText.textContent=conflict?.current_text??'';conflictText.hidden=false;refreshButton.hidden=false;}else message.textContent=error.status===423?copy.frozen:error.message===copy.session?copy.session:copy.network;}
      finally{save.disabled=false;}
    });
    const details=element('details','cv-review-history'),summary=element('summary','',copy.history),list=element('div');details.append(summary,list);box.append(details);
    details.addEventListener('toggle',async()=>{if(!details.open)return;list.textContent='';try{const p=new URLSearchParams({page:info.page,language:info.language,key:info.key});const data=await request('/history?'+p);for(const item of data.items){list.append(element('p','',`${item.author} · ${new Date(item.edited_at).toLocaleString()}\n${item.old_text} → ${item.new_text}`));}}catch{list.textContent=copy.network;}});
    input.focus();
  }
  async function refresh(){
    const p=new URLSearchParams({page,language:lang});const data=await request('/edits?'+p);records.clear();for(const item of data.items)records.set(item.item_key,item);
    for(const info of known)apply(info);schedulePosition();
  }
  function commentsModal(){
    const {box,close}=modal(copy.comments), list=element('div');box.append(list);
    box.append(element('h3','',copy.newComment));const input=element('textarea');input.maxLength=5000;box.append(input);
    const message=element('p','cv-review-message');box.append(message);const row=element('div','cv-review-actions'),send=action(copy.send,true),cancel=action(copy.close);row.append(send,cancel);box.append(row);cancel.addEventListener('click',close);
    async function load(){const data=await request('/comments');list.textContent='';if(!data.items.length)list.append(element('p','cv-review-muted',copy.empty));for(const item of data.items){const article=element('article','cv-review-comment');article.append(element('div','cv-review-muted',`${item.author} · ${new Date(item.created_at).toLocaleString()} · ${item.page} · ${item.language.toUpperCase()}`));article.append(element('p','',item.body));list.append(article);}}
    send.addEventListener('click',async()=>{if(!input.value.trim())return;send.disabled=true;message.textContent='';try{await request('/comments',{method:'POST',body:JSON.stringify({page,language:lang,body:input.value})});input.value='';await load();}catch(error){message.textContent=error.status===423?copy.frozen:copy.network;}finally{send.disabled=false;}});
    load().catch(()=>{message.textContent=copy.network});input.focus();
  }
  async function start(){
    try{await request('/session');await refresh();ready=true;await scan();}catch(error){
      layer.remove();
      if(!inFrame){
        const notice=element('div','cv-review-toolbar');notice.dataset.reviewUi='';
        const b=element('button','cv-review-comments',error.status===401?copy.session:copy.network);b.type='button';
        b.addEventListener('click',()=>{location.href='/login/?next='+encodeURIComponent(location.pathname+location.search+location.hash)});notice.append(b);document.body.append(notice);
      }else css.remove();
      return;
    }
    const observer=new MutationObserver(scheduleScan);observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    if(!inFrame){
      window.CVReview={edit:(info,done)=>editModal(info,done)};
      const toolbar=element('div','cv-review-toolbar');toolbar.dataset.reviewUi='';const comments=element('button','cv-review-comments',copy.comments),logout=element('button','cv-review-logout',copy.logout);comments.type=logout.type='button';toolbar.append(comments,logout);document.body.append(toolbar);comments.addEventListener('click',commentsModal);
      logout.addEventListener('click',async()=>{try{await request('/logout',{method:'POST'})}finally{localStorage.removeItem('cv-review-active');location.reload();}});
    }
    setInterval(()=>{if(document.visibilityState==='visible')refresh().catch(()=>{});},30000);
  }
  start();
})();
