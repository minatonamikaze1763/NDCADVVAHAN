'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const front=path.resolve(__dirname,'..'),backend=path.resolve(front,'../Server/ndcserver');
const backendRequire=require('node:module').createRequire(backend+'/package.json');
const {JSDOM,VirtualConsole}=backendRequire('jsdom'),express=backendRequire('express'),{ObjectId}=backendRequire('mongodb');
const register=require(backend+'/offers.js');
const tick=()=>new Promise(r=>setTimeout(r,35));
const offer={offerId:'612345678901234567890123',code:'6PLUS1',title:'Six months. One month on us.',description:'Six months of Basic with a retained extra device.',rules:'Once per account.',planId:'basic',planName:'Basic',months:6,durationDays:180,monthlyPrice:199,subtotalPaise:119400,discountPaise:19900,amountPaise:99500,currency:'INR',maxDevices:2,extraDevices:1,retainDevicesOnRenewal:true,startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()};
async function ui(t,records=[offer],fail=false){
 const vc=new VirtualConsole(),errors=[];vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(front+'/index.html','utf8'),{url:'https://example.test',runScripts:'outside-only',virtualConsole:vc});t.after(()=>dom.window.close());
 const w=dom.window;await tick();w.AbortSignal=AbortSignal;w.HTMLElement.prototype.scrollIntoView=function(){};w.fetch=async()=>({ok:!fail,json:async()=>({records,total:records.length,serverTime:new Date().toISOString()})});
 w.eval(fs.readFileSync(front+'/offers-showcase.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();return {w,d:w.document,errors};
}
test('offer-code and showcase styles use the site root colors exclusively',()=>{
 for(const name of ['offer-code.css','offers-showcase.css']){const css=fs.readFileSync(front+'/'+name,'utf8');assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css),false);for(const variable of ['--bg','--panel','--gold','--light','--text','--muted','--line','--green'])assert.ok(css.includes(`var(${variable})`));}
});
test('landing cards show code, savings, benefits, validity, rules and copy/use actions safely',async t=>{
 const f=await ui(t,[{...offer,title:'Offer <img src=x onerror=alert(1)>'}]);let code='';f.w.NDCApplySignupOffer=async value=>(code=value,true);
 const card=f.d.querySelector('.ndc-offer-showcard');assert.ok(card);assert.match(card.textContent,/6PLUS1/);assert.match(card.textContent,/995/);assert.match(card.textContent,/199/);assert.match(card.textContent,/2 device logins/);assert.match(card.textContent,/IST/);assert.match(card.textContent,/Once per account/);assert.equal(card.querySelector('img'),null);
 Object.defineProperty(f.w.navigator,'clipboard',{value:{writeText:async value=>{code=value;}}});card.querySelector('.ndc-offer-public-code button').click();await tick();assert.equal(code,'6PLUS1');assert.match(card.textContent,/Code copied/);
 code='';card.querySelector('button.btn-primary').click();await tick();assert.equal(code,'6PLUS1');assert.match(card.textContent,/Offer applied at signup/);assert.deepEqual(f.errors,[]);
});
test('showcase use button applies through real signup logic and selects the required plan and months',async t=>{
 const f=await ui(t),{w,d}=f;const plans=[{id:'basic',name:'Basic',monthlyPrice:199,maxDevices:1,durationDays:30,features:{}}];w.NDCPlans={all:plans,visible:plans,ready:Promise.resolve(),label:k=>k};
 w.fetch=async(url)=>({ok:true,json:async()=>url.includes('/preview')?{offer}:{records:[offer],total:1,serverTime:new Date().toISOString()}});
 w.eval(fs.readFileSync(front+'/offer-code.js','utf8'));w.eval(fs.readFileSync(front+'/signup.js','utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();
 d.querySelector('.ndc-offer-showcard .btn-primary').click();await tick();assert.match(d.getElementById('selectedPlanName').textContent,/Basic/);assert.equal(d.getElementById('signupMonths').value,'6');assert.match(d.getElementById('selectedPlanAmount').textContent,/995/);assert.match(d.getElementById('selectedPlanLogins').textContent,/2 devices/);assert.deepEqual(f.errors,[]);
});
test('empty, expired and failed catalogues never advertise an unavailable campaign',async t=>{
 const empty=await ui(t,[]);assert.match(empty.d.getElementById('ndcOffersStatus').textContent,/No active offers/);assert.equal(empty.d.querySelectorAll('.ndc-offer-showcard').length,0);
 const expired=await ui(t,[{...offer,endsAt:new Date(Date.now()-1000).toISOString()}]);assert.equal(expired.d.querySelectorAll('.ndc-offer-showcard').length,0);
 const failed=await ui(t,[],true);assert.match(failed.d.getElementById('ndcOffersStatus').textContent,/couldn’t load/);assert.equal(failed.d.getElementById('ndcOffersRetry').hidden,false);
});
test('public offer API lists active in-window terms only, without customer or purchase data',async t=>{
 const now=Date.now(),base={_id:new ObjectId(),...offer,status:'active',startsAt:new Date(now-10000),endsAt:new Date(now+10000),revision:1};
 const rows=[base,{...base,_id:new ObjectId(),code:'DRAFT',status:'draft'},{...base,_id:new ObjectId(),code:'PAUSED',status:'paused'},{...base,_id:new ObjectId(),code:'EXPIRED',endsAt:new Date(now-1000)},{...base,_id:new ObjectId(),code:'FUTURE',startsAt:new Date(now+5000)}];
 const match=(row,q)=>Object.entries(q).every(([k,v])=>v&&typeof v==='object'?Object.entries(v).every(([op,b])=>op==='$lte'?row[k]<=b:op==='$gt'?row[k]>b:false):row[k]===v);
 const collection={findOne:async q=>rows.find(r=>match(r,q)),countDocuments:async q=>rows.filter(r=>match(r,q)).length,find:q=>{let list=rows.filter(r=>match(r,q));const c={sort:()=>c,skip:n=>(list=list.slice(n),c),limit:n=>(list=list.slice(0,n),c),toArray:async()=>list};return c;}};
 const app=express();app.use(express.json());const next=(_q,_s,n)=>n();register({app,db:()=>({collection:()=>collection}),users:()=>{throw Error('Public route must not read users');},plans:{basic:{id:'basic',name:'Basic',monthlyPrice:199,maxDevices:1,durationDays:30,currency:'INR'}},ObjectId,requireAuth:next,requireAdmin:next,requirePanelAuth:next,writeAuditLog:async()=>{},lifecycle:{},assertRenewalPlanAllowed:async()=>{},rateLimit:()=>next});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const response=await fetch(`http://127.0.0.1:${server.address().port}/api/public/offers`),body=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(body.total,1);assert.deepEqual(body.records.map(r=>r.code),['6PLUS1']);assert.equal(body.records[0].amountPaise,99500);assert.equal(body.records[0].userId,undefined);assert.equal(body.records[0].status,undefined);
});
