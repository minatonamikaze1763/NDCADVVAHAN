(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('ndcReviewCards');if(!root)return;
    const status=document.getElementById('ndcReviewsStatus'),more=document.getElementById('ndcReviewsMore'),retry=document.getElementById('ndcReviewsRetry');
    let page=0,busy=false,total=0;const api='https://server.nextdimensioncustoms.in';
    const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
    function card(row){
      const article=node('article',null,'ndc-review-card');
      if(row.rating){const rating=node('div','★'.repeat(row.rating)+'☆'.repeat(5-row.rating),'ndc-review-stars');rating.setAttribute('role','img');rating.setAttribute('aria-label',`${row.rating} out of 5 stars`);article.append(rating);}
      article.append(node('blockquote',row.description));
      const person=node('div',null,'ndc-review-person'),initials=node('span',row.displayName.split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase(),'ndc-review-initials');initials.setAttribute('aria-hidden','true');person.append(initials);
      if(row.logoUrl&&/^\/api\/public\/review-logos\/[a-f0-9]{24}$/i.test(row.logoUrl)){
        const img=node('img');img.src=api+row.logoUrl;img.alt=(row.company||row.displayName)+' logo';img.loading='lazy';img.decoding='async';img.width=64;img.height=64;img.hidden=true;
        img.onload=()=>{img.hidden=false;initials.hidden=true;};img.onerror=()=>{img.hidden=true;initials.hidden=false;};person.append(img);
      }
      const identity=node('div',null,'ndc-review-identity');identity.append(node('strong',row.displayName));
      const company=[row.designation,row.company].filter(Boolean).join(' · ');if(company)identity.append(node('span',company));
      if(row.userSince)identity.append(node('small','User since '+new Date(row.userSince+'T00:00:00Z').toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})));
      if(row.purchasedAccount)identity.append(node('small','NDC customer','ndc-review-customer'));
      person.append(identity);article.append(person);return article;
    }
    async function load(reset=false){
      if(busy)return;busy=true;more.disabled=retry.disabled=true;retry.hidden=true;status.textContent=reset?'Loading customer stories…':'Loading more reviews…';
      try{
        const next=reset?1:page+1,response=await fetch(api+'/api/public/reviews?page='+next,{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Unavailable');const data=await response.json();if(!Array.isArray(data.records))throw Error('Unavailable');
        if(reset)root.replaceChildren();for(const row of data.records)root.append(card(row));page=next;total=Number(data.total)||0;
        status.textContent=total?'Customer feedback, shared with you.':'Customer stories are coming soon. Published reviews will appear here.';more.hidden=page*12>=total;
      }catch{status.textContent='Customer reviews are temporarily unavailable. Please try again.';retry.hidden=false;}
      finally{busy=false;more.disabled=retry.disabled=false;}
    }
    more.onclick=()=>load();retry.onclick=()=>load(page===0);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load(true);});void load(true);
  });
})();
