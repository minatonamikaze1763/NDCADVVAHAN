'use strict';
(() => {
  const root = document.getElementById('ndcInteractiveDemo');
  if (!root) return;
  const content = document.getElementById('ndcDemoContent');
  const dialog = document.getElementById('ndcSamplePreview');
  const files = [{name:'Address proof.pdf',type:'PDF',size:'248 KB',label:'Address proof'}, {name:'Insurance.pdf',type:'PDF',size:'186 KB',label:'Insurance certificate'}, {name:'Dealer invoice.jpg',type:'JPG',size:'312 KB',label:'Dealer invoice'}];
  const preferences = ['Convert images to PDF','Automatic upload','Skip already uploaded documents','Automatic file movement & submission','Show log on page after submission','Auto copy logs to clipboard','Automatic ZIP download'];
  const descriptions = ['Prepare supported images within 400 KB.','Start after document preparation.','Keep existing documents in place.','Choose how your workflow finishes.','Display the completed submission summary.','Copy the summary when the workflow completes.','Download eligible prepared documents after successful uploads.'];
  let view = 'workspace', tab = 'Preferences', selected = new Set([0,1,2]), state = 'Ready', timer, returnFocus;
  const values = new Map(preferences.map((p,i) => [p,[1,2,4].includes(i)]));
  ['Customer name','Full owner details','Full insurance details','HP / hypothecation details','Chassis number','Application date'].forEach(name=>values.set(name,true));
  const tabs = ['Preferences','Log contents','Filename hints','Session'];
  const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const setting = (name,description='') => `<label class="ndc-demo-setting"><span>${escape(name)}<small>${escape(description)}</small></span><input type="checkbox" data-pref="${escape(name)}" ${values.get(name)?'checked':''}></label>`;
  function rows() {
    return files.map((file,i) => `<div class="ndc-demo-file"><label>${view==='monitor'?'':`<input type="checkbox" data-file="${i}" aria-label="Select ${file.name}" ${selected.has(i)?'checked':''}>`}<span class="ndc-demo-type">${file.type}</span><span><strong>${file.name}</strong><small>${file.label} · ${file.size}${view==='monitor'?' · Prepared copy':''}</small></span></label><span class="ndc-demo-status">${selected.has(i)?state:'Not selected'}</span><button type="button" data-preview="${i}" aria-label="Preview ${file.name}">◉ Preview</button></div>`).join('');
  }
  function render() {
    root.querySelectorAll('[data-demo-view]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.demoView===view)));
    if (view === 'settings') {
      content.innerHTML = `<h3>Workspace settings</h3><p>Explore the current extension settings. Changes apply to this demo only.</p><div class="ndc-demo-tabs" aria-label="Settings sections">${tabs.map(t=>`<button type="button" data-tab="${t}" aria-pressed="${t===tab}">${t}</button>`).join('')}</div><div id="ndcDemoSettingsBody"></div>`;
      const body = content.querySelector('#ndcDemoSettingsBody');
      if (tab === 'Preferences') body.innerHTML = `<p>Customer root folder · Sample customers / Demo customer</p>${preferences.map((name,i)=>setting(name,descriptions[i])).join('')}`;
      if (tab === 'Log contents') body.innerHTML = `<p>Always included: application number, completion status, and RTA office after submission.</p>${['Customer name','Full owner details','Full insurance details','HP / hypothecation details','Chassis number','Application date','Add a custom message'].map(name=>setting(name)).join('')}<textarea aria-label="Custom log message" placeholder="Your optional message" maxlength="1000" ${values.get('Add a custom message')?'':'disabled'}></textarea>`;
      if (tab === 'Filename hints') body.innerHTML = '<h4>Let filenames do the matching</h4><p>Case, spaces, punctuation, numbered copies, and customer names are supported. Conflicting document labels remain available for manual choice.</p><div class="ndc-demo-file"><strong>Address proof</strong><small>Aadhaar · Address · Aadhaar2</small></div><div class="ndc-demo-file"><strong>Insurance</strong><small>Insurance · Policy · Certificate</small></div><div class="ndc-demo-file"><strong>Dealer invoice</strong><small>Invoice · Dealer invoice</small></div><p class="ndc-demo-notice">Specific document names take priority over generic photo or signature words.</p>';
      if (tab === 'Session') body.innerHTML = '<h4>Sample session</h4><p class="ndc-demo-notice">Demo mode · No account connected</p><p>Session activity and account information appear here in the extension. This showcase does not connect to your account.</p>';
      return;
    }
    const titles = {workspace:['Your documents','Review the prepared copy before the next step.'],folder:['Customer root folder','Demo customer / Documents · Select individual files or choose all.'],monitor:['Upload monitor','Follow each prepared document through a sample upload.']};
    content.innerHTML = `<h3>${titles[view][0]}</h3><p>${titles[view][1]}</p><div class="ndc-demo-toolbar">${view!=='monitor'?`<button type="button" data-action="select">${selected.size===3?'Deselect all':'Select all'}</button>`:''}<span id="ndcDemoCount">${selected.size} / 3 selected</span></div>${rows()}<div class="ndc-demo-toolbar"><button type="button" class="ndc-demo-primary" data-action="start" ${selected.size===0||state==='Preparing…'||state==='Uploading…'?'disabled':''}>${view==='monitor'?'Run sample upload':'Prepare selected documents'}</button>${state==='Preparing…'?'<button type="button" class="ndc-demo-cancel" data-action="cancel">Cancel preparation</button>':''}<button type="button" data-preview="0">Open sample preview ↗</button></div><p class="ndc-demo-notice ndc-demo-live" role="status">${state==='Cancelled'?'Preparation cancelled. Completed documents remain available. Queued uploads have not started.':state==='Uploaded'?'Sample upload complete. Your actual documents and VAHAN portal were not accessed.':state==='Prepared'?'Selected documents are prepared. Open Upload monitor to try the next step.':state==='Preparing…'?'Preparing sample documents… You can cancel before uploads begin.':state==='Uploading…'?'Uploading sample documents…':'Choose a document to preview, or try the sample workflow.'}</p>`;
  }
  function preview(index,trigger) {
    returnFocus = trigger;
    document.getElementById('ndcViewerTitle').textContent=files[index].name;
    document.getElementById('ndcDemoPaper').innerHTML=`<div class="paper-brand">ND / NEXT DIMENSION CUSTOMS</div><h2>${files[index].label}</h2><p>Prepared document preview</p><dl><dt>Customer</dt><dd>Demo customer</dd><dt>Document</dt><dd>${files[index].name}</dd><dt>Review status</dt><dd>Sample copy · Ready for review</dd></dl><p>Check the document is readable and belongs to the correct customer before continuing.</p><div class="paper-stamp">DEMONSTRATION ONLY<br>No customer information. No files uploaded.</div>`;
    dialog.showModal(); document.getElementById('ndcCloseDocumentPreview').focus();
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button'); if(!button) return;
    if(button.dataset.demoView){view=button.dataset.demoView;render();}
    if(button.dataset.tab){tab=button.dataset.tab;render();content.querySelector(`[data-tab="${tab}"]`).focus();}
    if(button.dataset.preview!==undefined) preview(Number(button.dataset.preview),button);
    if(button.dataset.action==='select'){selected=selected.size===3?new Set():new Set([0,1,2]);render();}
    if(button.dataset.action==='start') {clearTimeout(timer);state=view==='monitor'?'Uploading…':'Preparing…';render();timer=setTimeout(()=>{state=state==='Uploading…'?'Uploaded':'Prepared';render();},2400);}
    if(button.dataset.action==='cancel'){clearTimeout(timer);state='Cancelled';render();content.querySelector('[data-action="start"]')?.focus();}
    if(button.id==='ndcDemoReset'){clearTimeout(timer);view='workspace';tab='Preferences';selected=new Set([0,1,2]);state='Ready';values.clear();preferences.forEach((p,i)=>values.set(p,[1,2,4].includes(i)));['Customer name','Full owner details','Full insurance details','HP / hypothecation details','Chassis number','Application date'].forEach(name=>values.set(name,true));render();}
  });
  root.addEventListener('change',event=>{
    if(event.target.dataset.file!==undefined){const i=Number(event.target.dataset.file);event.target.checked?selected.add(i):selected.delete(i);document.getElementById('ndcDemoCount').textContent=`${selected.size} / 3 selected`;content.querySelector('[data-action="start"]').disabled=!selected.size||['Preparing…','Uploading…'].includes(state);}
    if(event.target.dataset.pref){values.set(event.target.dataset.pref,event.target.checked);if(event.target.dataset.pref==='Add a custom message') content.querySelector('textarea').disabled=!event.target.checked;}
  });
  document.getElementById('ndcCloseDocumentPreview').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();else root.querySelector('[data-demo-view]')?.focus();});
  // The compact hero uses the same current settings and document viewer.
  const heroSettings=document.getElementById('ndcPreviewSettings');
  if(heroSettings){const oldTabs=heroSettings.querySelector('.ndc-landing-preview-tabs');oldTabs.innerHTML=tabs.map(t=>`<button type="button" data-hero-tab="${t}" aria-pressed="${t==='Preferences'}">${t}</button>`).join('');heroSettings.querySelectorAll('.ndc-landing-preview-setting-row').forEach(row=>row.remove());const pane=document.createElement('div');pane.id='ndcHeroSettingsPane';oldTabs.after(pane);const showHero=t=>{oldTabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.heroTab===t)));pane.innerHTML=t==='Preferences'?preferences.map((name,i)=>`<label class="ndc-demo-setting"><span>${name}<small>${descriptions[i]}</small></span><input type="checkbox" ${[1,2,4].includes(i)?'checked':''}></label>`).join(''):t==='Log contents'?['Customer name','Full owner details','Full insurance details','HP / hypothecation details','Chassis number','Application date'].map(name=>`<label class="ndc-demo-setting"><span>${name}</span><input type="checkbox" checked></label>`).join(''):t==='Filename hints'?'<p>Address proof → Aadhaar / Address<br>Insurance → Insurance / Policy<br>Dealer invoice → Invoice</p>':'<p>Sample session · No account connected<br>Activity and account details appear here in the extension.</p>';};oldTabs.addEventListener('click',event=>{if(event.target.dataset.heroTab)showHero(event.target.dataset.heroTab);});showHero('Preferences');}
  document.querySelectorAll('.ndc-landing-preview-files>div').forEach((row,i)=>{const b=document.createElement('button');b.type='button';b.className='ndc-hero-preview-file';b.textContent='Preview';b.setAttribute('aria-label','Preview '+files[i].name);b.addEventListener('click',()=>preview(i,b));row.append(b);});
  render();
})();
