(() => {
  'use strict';
  const nav=document.getElementById('primaryNav'),menu=document.getElementById('menuToggle'),more=document.querySelector('.ndc-nav-more');
  if(!nav||!menu)return;
  function close(){nav.classList.remove('is-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');if(more)more.open=false;}
  menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';nav.classList.toggle('is-open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');if(!open&&more)more.open=false;});
  document.addEventListener('click',event=>{if(more?.open&&!more.contains(event.target))more.open=false;if(nav.contains(event.target)&&event.target.closest('a'))close();if(!event.target.closest('.topbar'))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(more?.open||nav.classList.contains('is-open'))){close();if(getComputedStyle(menu).display!=='none')menu.focus();else more?.querySelector('summary')?.focus();}});
  matchMedia('(min-width:1181px)').addEventListener('change',event=>{if(event.matches)close();});
})();
