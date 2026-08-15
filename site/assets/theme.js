(function(){
  var el=document.documentElement,btn=document.getElementById('theme-toggle');
  var saved=localStorage.getItem('alliby-theme');
  if(saved)el.dataset.theme=saved;
  if(btn)btn.addEventListener('click',function(){
    var next=el.dataset.theme==='light'?'dark':'light';
    el.dataset.theme=next;
    localStorage.setItem('alliby-theme',next);
  });

  // Мобильное меню: ссылки уже есть в разметке, бургер добавляем скриптом,
  // чтобы не дублировать его в каждом файле подстраницы.
  var nav=document.querySelector('nav');
  var links=nav&&nav.querySelector('.nav-links');
  if(!nav||!links)return;

  var b=document.createElement('button');
  b.type='button';
  b.className='nav-burger';
  b.setAttribute('aria-label','Меню');
  b.setAttribute('aria-expanded','false');
  b.innerHTML=
    '<svg class="bx bx-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'+
    '<svg class="bx bx-close" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function setOpen(on){
    nav.classList.toggle('open',on);
    b.setAttribute('aria-expanded',on?'true':'false');
    if(!on){
      links.querySelectorAll('.nav-sub-t[aria-expanded="true"]').forEach(function(t){
        t.setAttribute('aria-expanded','false');
      });
    }
  }
  b.addEventListener('click',function(e){
    e.stopPropagation();
    setOpen(!nav.classList.contains('open'));
  });
  links.addEventListener('click',function(e){
    var t=e.target.closest('.nav-sub-t');
    if(t){
      e.preventDefault();
      t.setAttribute('aria-expanded',t.getAttribute('aria-expanded')==='true'?'false':'true');
      return;
    }
    if(e.target.closest('a'))setOpen(false);
  });
  document.addEventListener('click',function(e){
    if(!nav.contains(e.target))setOpen(false);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')setOpen(false);
  });

  nav.appendChild(b);
})();
