(function(){
  var el=document.documentElement,btn=document.getElementById('theme-toggle');
  var saved=localStorage.getItem('alliby-theme');
  if(saved)el.dataset.theme=saved;
  if(!btn)return;
  btn.addEventListener('click',function(){
    var next=el.dataset.theme==='light'?'dark':'light';
    el.dataset.theme=next;
    localStorage.setItem('alliby-theme',next);
  });
})();
