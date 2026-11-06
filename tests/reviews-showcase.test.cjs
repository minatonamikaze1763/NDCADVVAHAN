'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('node:module').createRequire(path.resolve(__dirname,'../../Server/ndcserver/package.json'))('jsdom');
const root=path.resolve(__dirname,'..');
test('review logos use CORS, load while hidden, and keep initials on failure',async t=>{
 const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://vahan.nextdimensioncustoms.in',runScripts:'outside-only'});
 t.after(()=>dom.window.close());const w=dom.window;await new Promise(resolve=>setTimeout(resolve,0));
 const src=Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype,'src');let requests=0;
 Object.defineProperty(w.HTMLImageElement.prototype,'src',{get:src.get,set(value){requests++;assert.equal(this.crossOrigin,'anonymous');assert.equal(this.loading,'eager');assert.equal(typeof this.onload,'function');assert.equal(typeof this.onerror,'function');src.set.call(this,value);}});
 w.AbortSignal=AbortSignal;w.fetch=async()=>({ok:true,json:async()=>({records:[{displayName:'Balaji',company:'John Deere',description:'Customer feedback',logoUrl:'/api/public/review-logos/6aed618119c08ed3e8a33eb7'}],total:1})});
 w.eval(fs.readFileSync(root+'/reviews-showcase.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(requests,1);const img=w.document.querySelector('.ndc-review-person img'),initials=w.document.querySelector('.ndc-review-initials');
 assert.equal(img.hidden,true);assert.equal(initials.hidden,false);
 img.dispatchEvent(new w.Event('load'));assert.equal(img.hidden,false);assert.equal(initials.hidden,true);
 img.dispatchEvent(new w.Event('error'));assert.equal(img.hidden,true);assert.equal(initials.hidden,false);
});
