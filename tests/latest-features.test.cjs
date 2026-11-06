'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('node:module').createRequire(path.resolve(__dirname,'../../Server/ndcserver/package.json'))('jsdom');
const root=path.resolve(__dirname,'..');
test('public showcase describes new customer benefits without exposing upload implementation',()=>{
 const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8')),d=dom.window.document,section=d.getElementById('latest-features');assert.ok(section);assert.equal(section.querySelectorAll('article').length,3);for(const phrase of ['activity','Recovery assistance','summary','RTA office','saved locally','clipboard','off until'])assert.ok(section.textContent.includes(phrase));
 const publicCopy=section.textContent+d.getElementById('automation').textContent+d.getElementById('faq').textContent;assert.doesNotMatch(publicCopy,/formDocumentUpload|selectAndModifyFile|ui-messages-info|is updated\.|MutationObserver|waitForUpload|3\s*\+\s*2|selector|milliseconds/i);assert.match(d.getElementById('automation').textContent,/Show Log on Page After Submission/);assert.match(d.getElementById('faq').textContent,/without activity messages, branding or timestamps/);dom.window.close();
});
test('server feature flags receive clear public labels in the plan catalogue',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;w.fetch=async()=>({ok:true,json:async()=>({plans:[{id:'basic',features:{submissionSummary:true,autoCopySubmissionDetails:true}}]})});w.eval(fs.readFileSync(root+'/plan-catalog.js','utf8'));await w.NDCPlans.ready;assert.equal(w.NDCPlans.label('submissionSummary'),'Readable submission summary');assert.match(w.NDCPlans.label('autoCopySubmissionDetails'),/Optional clipboard/);dom.window.close();
});
