'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('node:module').createRequire(path.resolve(__dirname,'../../Server/ndcserver/package.json'))('jsdom');
const root=path.resolve(__dirname,'..');
test('public showcase describes new customer benefits without exposing upload implementation',()=>{
 const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8')),d=dom.window.document,section=d.getElementById('latest-features');assert.ok(section);assert.equal(section.querySelectorAll('article').length,3);for(const phrase of ['activity','Recovery assistance','summary','RTA office','saved locally','clipboard','off until'])assert.ok(section.textContent.includes(phrase));
 const publicCopy=section.textContent+d.getElementById('automation').textContent+d.getElementById('faq').textContent;assert.doesNotMatch(publicCopy,/formDocumentUpload|selectAndModifyFile|ui-messages-info|is updated\.|MutationObserver|waitForUpload|3\s*\+\s*2|selector|milliseconds/i);assert.match(d.getElementById('automation').textContent,/Show Log on Page After Submission/);assert.match(d.getElementById('faq').textContent,/without activity messages or branding/);dom.window.close();
});
test('server feature flags receive clear public labels in the plan catalogue',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;w.fetch=async()=>({ok:true,json:async()=>({plans:[{id:'basic',features:{submissionSummary:true,autoCopySubmissionDetails:true}}]})});w.eval(fs.readFileSync(root+'/plan-catalog.js','utf8'));await w.NDCPlans.ready;assert.equal(w.NDCPlans.label('submissionSummary'),'Readable submission summary');assert.match(w.NDCPlans.label('autoCopySubmissionDetails'),/Optional clipboard/);dom.window.close();
});

test('included-with-every-plan list contains every current default feature without needing the API',()=>{
 const defaults=require(path.resolve(root,'../Server/ndcserver/subscription-features')).DEFAULT_SUBSCRIPTION_FEATURES;
 const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8')),items=[...dom.window.document.querySelectorAll('#ndcSharedFeatures li')];assert.equal(items.length,23);assert.deepEqual(items.map(item=>item.dataset.feature).sort(),Object.keys(defaults).sort());assert.ok(items.some(item=>item.textContent==='Optional Image to PDF Conversion'));assert.ok(items.some(item=>item.textContent==='Live Upload Activity Logs'));assert.ok(items.some(item=>item.textContent==='RTA Office in Submission Summary'));dom.window.close();
});
test('older plan responses and API failures cannot replace the complete public feature list',async t=>{
 for(const unavailable of [false,true]){
  const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://example.test',runScripts:'outside-only'}),w=dom.window,d=w.document;t.after(()=>w.close());await new Promise(resolve=>setTimeout(resolve,30));
  const plans=[{id:'basic',name:'Basic',monthlyPrice:777,maxDevices:4,durationDays:30,features:{automaticUpload:true}},{id:'starter',name:'Starter',monthlyPrice:888,maxDevices:5,durationDays:30,features:{}},{id:'pro',name:'Pro',monthlyPrice:999,maxDevices:6,durationDays:30,features:{}}];
  w.NDCPlans={all:plans,visible:plans,ready:unavailable?Promise.reject(Error('Plan API unavailable')):Promise.resolve(plans),label:key=>key};w.HTMLElement.prototype.scrollIntoView=function(){};w.eval(fs.readFileSync(root+'/signup.js','utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(d.querySelectorAll('#ndcSharedFeatures li').length,23);assert.match(d.getElementById('ndcSharedFeatures').textContent,/Upload Recovery Assistance/);assert.match(d.getElementById('ndcSharedFeatures').textContent,/Optional Clipboard Copy/);
  if(unavailable){assert.match(d.getElementById('ndcSignupStatus').textContent,/Plan API unavailable/);assert.equal(d.getElementById('paymentProceed').disabled,true);}else{assert.match(d.querySelector('.pricing .plan .price').textContent,/777/);assert.match(d.querySelector('.pricing .plan ul').textContent,/4 device logins/);}
 }
});
