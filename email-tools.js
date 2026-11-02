/* Self-service email requests; authentication logic stays in auth.js. */
(() => {
  'use strict';
  const API='https://server.nextdimensioncustoms.in';
  async function request(path,body,authenticated=false){
    const token=authenticated?sessionStorage.getItem('ndc_customer_panel_token'):null;
    if(authenticated&&!token)throw Error('Sign in again to request this email.');
    const response=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit'});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error || 'Unable to request email. Try again later.');return data;
  }
  document.addEventListener('change',event=>{
    const form=event.target.closest('form[data-ndc-email-resend],form[data-ndc-public-setup]');
    if(form&&event.target.name==='confirmed')form.querySelector('[type="submit"]').disabled=!event.target.checked;
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!form.matches('[data-ndc-email-resend],[data-ndc-public-setup],[data-ndc-forgot]'))return;
    event.preventDefault();const button=form.querySelector('[type="submit"]'),status=form.querySelector('[data-email-status]');if(button.disabled)return;
    button.disabled=true;status.textContent='Requesting email…';
    try {
      const values=new FormData(form);let data;
      if(form.matches('[data-ndc-email-resend]'))data=await request('/api/panel/emails/resend',{type:values.get('type'),confirmedNotReceived:values.get('confirmed')==='on'},true);
      else if(form.matches('[data-ndc-public-setup]'))data=await request('/api/public/auth/resend-setup',{username:values.get('username'),email:values.get('email')});
      else data=await request('/api/public/auth/forgot-password',{username:values.get('username'),email:values.get('email')});
      status.textContent=data.message || 'Email requested. Check your inbox and spam.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=form.querySelector('[name="confirmed"]')?!form.querySelector('[name="confirmed"]').checked:false;}
  });
  document.addEventListener('click',async event=>{
    const reset=event.target.closest('[data-ndc-send-reset]');
    if(reset){if(reset.disabled)return;reset.disabled=true;const status=reset.parentElement.querySelector('[data-reset-status]');try{const data=await request('/api/public/auth/forgot-password',{username:reset.dataset.username,email:reset.dataset.email});status.textContent=data.message;}catch(error){status.textContent=error.message;}finally{reset.disabled=false;}return;}
    const button=event.target.closest('[data-ndc-load-emails]');if(!button||button.disabled)return;
    button.disabled=true;const records=button.parentElement.querySelector('[data-email-records]');records.textContent='Loading…';
    try {const data=await request('/api/panel/emails',undefined,true);records.replaceChildren();for(const j of data.records || []){const p=document.createElement('p');p.textContent=`${j.type.replace(/_/g,' ')} · ${j.status} · ${new Date(j.createdAt).toLocaleString()}`;records.append(p);}if(!data.records?.length)records.textContent='No email activity yet.';const help=document.createElement('small');help.textContent='Accepted means the email provider accepted the request; inbox delivery may vary.';records.append(help);}catch(error){records.textContent=error.message;}finally{button.disabled=false;}
  });
})();
