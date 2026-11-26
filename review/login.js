(() => {
  const api='https://review-api.elman.digital';
  const form=document.getElementById('login-form'), error=document.getElementById('login-error');
  const labels={
    az:{eyebrow:'Müvəqqəti giriş',title:'Mətnlərin razılaşdırılması',intro:'Saytın mətnlərinə düzəliş təklif etmək və şərh yazmaq üçün daxil olun.',login:'İstifadəçi adı',password:'Şifrə',name:'Adınız',submit:'Daxil ol',footnote:'Adınız düzəliş və şərhlərinizin yanında görünəcək.',invalid:'İstifadəçi adını, şifrəni və adınızı yoxlayın.',limit:'Çox sayda cəhd edildi. Bir qədər sonra yenidən yoxlayın.',network:'Bağlantı alınmadı. İnterneti yoxlayıb yenidən cəhd edin.'},
    ru:{eyebrow:'Временный доступ',title:'Согласование текстов',intro:'Войдите, чтобы предложить правки и оставить комментарии к переводу сайта.',login:'Логин',password:'Пароль',name:'Ваше имя',submit:'Войти',footnote:'Имя появится рядом с вашими правками и комментариями.',invalid:'Проверьте логин, пароль и имя.',limit:'Слишком много попыток. Попробуйте позже.',network:'Не удалось подключиться. Проверьте соединение и повторите попытку.'},
    en:{eyebrow:'Temporary access',title:'Text review',intro:'Sign in to suggest edits and leave comments on the site’s text.',login:'Username',password:'Password',name:'Your name',submit:'Sign in',footnote:'Your name will appear alongside your edits and comments.',invalid:'Check your username, password and name.',limit:'Too many attempts. Please try again later.',network:'Could not connect. Check your connection and try again.'}
  };
  let language='az';
  function setLanguage(value){language=value;document.documentElement.lang=value;for(const node of document.querySelectorAll('[data-copy]'))node.textContent=labels[value][node.dataset.copy];for(const button of document.querySelectorAll('[data-lang]'))button.setAttribute('aria-pressed',String(button.dataset.lang===value));error.textContent='';}
  for(const button of document.querySelectorAll('[data-lang]'))button.addEventListener('click',()=>setLanguage(button.dataset.lang));
  setLanguage('az');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button'),values=new FormData(form);
    error.textContent='';button.disabled=true;
    try {
      const response=await fetch(api+'/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({login:values.get('login'),password:values.get('password'),name:values.get('name')})});
      if(!response.ok){error.textContent=response.status===429?labels[language].limit:labels[language].invalid;return;}
      localStorage.setItem('cv-review-active','1');
      let next=new URLSearchParams(location.search).get('next')||`/index-${language}.html?${language}`;
      const target=new URL(next,location.origin);
      if(target.origin!==location.origin||target.pathname.startsWith('/login')) next=`/index-${language}.html?${language}`;
      location.assign(next);
    } catch { error.textContent=labels[language].network; }
    finally { button.disabled=false; }
  });
})();
