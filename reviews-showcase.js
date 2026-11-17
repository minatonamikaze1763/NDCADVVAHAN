(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('ndcReviewCards');if(!root)return;
    const status=document.getElementById('ndcReviewsStatus'),more=document.getElementById('ndcReviewsMore'),retry=document.getElementById('ndcReviewsRetry');
    const previous=document.getElementById('ndcReviewsPrev'),nextButton=document.getElementById('ndcReviewsNext');
    const move=direction=>root.scrollBy({left:direction*(root.clientWidth*.85),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    function navigation(){previous.disabled=root.scrollLeft<2;nextButton.disabled=root.scrollLeft+root.clientWidth>=root.scrollWidth-2;}
    previous.onclick=()=>move(-1);nextButton.onclick=()=>move(1);root.addEventListener('scroll',navigation,{passive:true});new ResizeObserver(navigation).observe(root);
    root.addEventListener('keydown',event=>{if(event.target!==root)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}});
    let page=0,busy=false,total=0;const api='https://server.nextdimensioncustoms.in';
    const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
    function card(row){
      const article=node('article',null,'ndc-review-card');
      const brand=node('div',null,'ndc-review-brand');
      brand.append(node('strong',row.company||row.displayName));article.append(brand);
      row={...row,displayName:String(row.displayName||row.company||'NDC customer'),description:String(row.description||'')};
      const score=Number(row.rating);row.rating=Number.isFinite(score)?Math.min(5,Math.max(0,Math.round(score))):0;
      if(row.rating){const rating=node('div','★'.repeat(row.rating)+'☆'.repeat(5-row.rating),'ndc-review-stars');rating.setAttribute('role','img');rating.setAttribute('aria-label',`${row.rating} out of 5 stars`);rating.append(node('b', `${row.rating.toFixed(1)} / 5`, 'ndc-review-score'));article.append(rating);}
      article.append(node('blockquote',row.description));
      const person=node('div',null,'ndc-review-person'),initials=node('span',row.displayName.split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase(),'ndc-review-initials');initials.setAttribute('aria-hidden','true');person.append(initials);
      if(row.logoUrl&&/^\/api\/public\/review-logos\/[a-f0-9]{24}$/i.test(row.logoUrl)){
        // Use CORS for the API's same-origin resource policy. Hidden images must load eagerly.
        const img=node('img');img.crossOrigin='anonymous';img.alt=(row.company||row.displayName)+' logo';img.loading='eager';img.decoding='async';img.width=64;img.height=64;img.hidden=true;
        img.onload=()=>{img.hidden=false;brand.querySelector('strong').hidden=true;};img.onerror=()=>{img.hidden=true;initials.hidden=false;};img.src=api+row.logoUrl;brand.append(img);
      }
      const identity=node('div',null,'ndc-review-identity');const name=node('div',null,'ndc-review-name');name.append(node('strong',row.displayName));
      if(row.purchasedAccount){const badge=node('span','✓','ndc-review-verified');badge.setAttribute('aria-label','Verified paying customer');badge.title='Verified paying NDC customer';name.append(badge);}
      identity.append(name);
      const company=[row.designation,row.company].filter(Boolean).join(' · ');if(company)identity.append(node('span',company));
      if(row.userSince)identity.append(node('small','User since '+new Date(row.userSince+'T00:00:00Z').toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})));
      if(row.purchasedAccount)identity.append(node('small','NDC customer','ndc-review-customer'));
      person.append(identity);article.append(person);
      if(row.description.length>260){
        article.classList.add('is-collapsed');const toggle=node('button','Read full review','ndc-review-expand');toggle.type='button';toggle.setAttribute('aria-expanded','false');
        toggle.onclick=()=>{const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));article.classList.toggle('is-collapsed',!expanded);toggle.textContent=expanded?'Show less':'Read full review';};article.append(toggle);
      }return article;
    }
    async function load(reset=false){
      if(busy)return;busy=true;more.disabled=retry.disabled=true;retry.hidden=true;status.textContent=reset?'Loading customer stories…':'Loading more reviews…';
      try{
        const next=reset?1:page+1,response=await fetch(api+'/api/public/reviews?page='+next,{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Unavailable');const data=await response.json();if(!Array.isArray(data.records))throw Error('Unavailable');
        const firstNew=root.children.length;if(reset)root.replaceChildren();for(const row of data.records)if(row&&typeof row==='object')root.append(card(row));if(!reset&&root.children[firstNew])root.scrollTo({left:root.children[firstNew].offsetLeft-root.offsetLeft,behavior:'auto'});page=next;total=Number(data.total)||0;
        status.textContent=total?'Customer feedback, shared with you.':'Customer stories are coming soon. Published reviews will appear here.';more.hidden=page*12>=total;
      }catch{status.textContent='Customer reviews are temporarily unavailable. Please try again.';retry.hidden=false;}
      finally{navigation();busy=false;more.disabled=retry.disabled=false;}
    }
    more.onclick=()=>load();retry.onclick=()=>load(page===0);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load(true);});void load(true);
  });
})();
