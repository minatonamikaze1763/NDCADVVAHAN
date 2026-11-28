import {extractDocuments,cancel as cancelOCR,releaseWorker} from "./ocr-engine.js";
import {mergeDocuments} from "./confidence-engine.js";
import {mapFields} from "./form-mapper.js";
import {attachDocuments} from "./document-attachment.js";

const TYPES={aadhaar:"Aadhaar",pan:"PAN Card",salecard:"Sale Card"};
const ACCEPT=".jpg,.jpeg,.png,.webp,.pdf,application/pdf,image/jpeg,image/png,image/webp";
const state={host:null,mode:"combined",conflictChoices:{},files:{combinedAadhaar:null,aadhaarFront:null,aadhaarBack:null,pan:null,salecard:null},urls:new Set(),running:false,sequence:0,results:[],conflicts:{},pendingCustomerId:null,attachmentsComplete:false,bridge:null,visible:false,populated:0,reviewAccepted:false};
const escape=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function revoke(url){if(url){URL.revokeObjectURL(url);state.urls.delete(url);}}
function clearFiles(){for(const file of Object.values(state.files))if(file?.previewUrl)revoke(file.previewUrl);state.files={combinedAadhaar:null,aadhaarFront:null,aadhaarBack:null,pan:null,salecard:null};state.results=[];state.conflicts={};state.pendingCustomerId=null;state.attachmentsComplete=false;state.populated=0;state.reviewAccepted=false;}
function fileItem(slot,label,kind){
  return `<article class="ndc-ss-file" data-slot="${slot}"><div><strong>${label}</strong><small class="ndc-ss-file-name" data-name>No file selected</small></div><input data-file type="file" accept="${ACCEPT}" hidden><div class="ndc-ss-actions"><button type="button" data-select>Select file</button><button type="button" data-camera>Camera</button><button type="button" data-preview disabled>Preview</button><button type="button" data-extract disabled>Extract this</button><button type="button" data-remove disabled>Remove</button></div><p class="ndc-ss-status" data-status role="status">Optional</p></article>`;
}
function render(host){
  const slotHtml=()=>state.mode==="combined"?fileItem("combinedAadhaar","Combined Aadhaar · front/back, single or multi-page PDF","aadhaar"):`${fileItem("aadhaarFront","Aadhaar Card Front","aadhaar")}${fileItem("aadhaarBack","Aadhaar Card Back","aadhaar")}`;
  host.innerHTML=`<details class="ndc-smart-scan" id="ndcSmartScanSection"><summary>NDC Smart Scan — Scan, Extract &amp; Autofill</summary><div class="ndc-ss-body"><p class="ndc-ss-notice">With the customer's consent, select identity and sale documents to prepare a draft. OCR runs in this browser. Review every value before saving. Extraction is not official identity verification.</p><fieldset class="ndc-ss-mode"><legend>Aadhaar upload mode</legend><label><input type="radio" name="ndcSmartScanMode" value="combined" ${state.mode==="combined"?"checked":""}> Combined Aadhaar</label><label><input type="radio" name="ndcSmartScanMode" value="separate" ${state.mode==="separate"?"checked":""}> Separate front and back</label></fieldset><div class="ndc-ss-files" data-aadhaar>${slotHtml()}</div><div class="ndc-ss-files">${fileItem("pan","PAN Card","pan")}${fileItem("salecard","Sale Card","salecard")}</div><div class="ndc-ss-progress" data-progress role="status" aria-live="polite"></div><progress data-bar max="100" value="0" hidden></progress><div class="ndc-ss-actions"><button type="button" class="primary" data-extract-all>Extract Customer Details</button><button type="button" data-cancel hidden>Cancel processing</button><button type="button" data-autofill hidden>Review &amp; Autofill</button><button type="button" data-retry hidden>Retry document attachments</button></div><div data-summary class="ndc-ss-summary" aria-live="polite"></div><div data-results class="ndc-ss-results"></div></div></details>`;
  host.querySelectorAll("[data-file]").forEach(input=>input.addEventListener("change",()=>setSelected(input.closest("[data-slot]"),input.files?.[0])));
  host.querySelectorAll("[data-select]").forEach(btn=>btn.addEventListener("click",()=>btn.closest("[data-slot]").querySelector("[data-file]").click()));
  host.querySelectorAll("[data-camera]").forEach(btn=>btn.addEventListener("click",()=>{const input=btn.closest("[data-slot]").querySelector("[data-file]");input.setAttribute("capture","environment");input.click();}));
  host.querySelectorAll("[data-preview]").forEach(btn=>btn.addEventListener("click",()=>preview(btn.closest("[data-slot]").dataset.slot)));
  host.querySelectorAll("[data-remove]").forEach(btn=>btn.addEventListener("click",()=>removeFile(btn.closest("[data-slot]").dataset.slot)));
  host.querySelectorAll("[data-extract]").forEach(btn=>btn.addEventListener("click",()=>runExtraction([btn.closest("[data-slot]").dataset.slot])));
  host.querySelectorAll('input[name="ndcSmartScanMode"]').forEach(input=>input.addEventListener("change",e=>{state.mode=e.target.value;if(state.mode==="combined"){removeFile("aadhaarFront",false);removeFile("aadhaarBack",false);}else removeFile("combinedAadhaar",false);render(host);}));
  host.querySelector("[data-extract-all]").addEventListener("click",()=>runExtraction(Object.keys(state.files)));
  host.querySelector("[data-cancel]").addEventListener("click",()=>cancelCurrent("OCR cancelled. You can continue with manual entry."));
  host.querySelector("[data-autofill]").addEventListener("click",applyResults);
  host.querySelector("[data-retry]").addEventListener("click",retryAttachments);
  host.addEventListener("change",event=>{if(event.target.matches("[data-conflict]")){const key=event.target.dataset.conflict;state.conflictChoices[key]=Number(event.target.value);}});
}
function cancelCurrent(message="OCR cancelled."){if(state.running){state.sequence++;cancelOCR();}state.running=false;state.results=[];state.fields={};state.conflicts={};state.conflictChoices={};const button=state.host?.querySelector("[data-extract-all]");if(button)button.disabled=false;const cancel=state.host?.querySelector("[data-cancel]");if(cancel)cancel.hidden=true;renderResults();if(message)setProgress(message);}
function setSelected(row,file){
  if(!file)return;
  cancelCurrent("Document changed. Previous OCR result discarded.");
  const slot=row.dataset.slot;
  removeFile(slot,false);
  const url=URL.createObjectURL(file);state.urls.add(url);
  state.files[slot]={file,previewUrl:url};
  row.querySelector("[data-name]").textContent=file.name;
  row.querySelector("[data-preview]").disabled=false;row.querySelector("[data-remove]").disabled=false;row.querySelector("[data-extract]").disabled=false;
  row.querySelector("[data-status]").textContent="Selected locally; not uploaded.";
  setProgress("");
}
function removeFile(slot,renderAgain=true){
  cancelCurrent("Document removed. Previous OCR result discarded.");
  const old=state.files[slot];if(old?.previewUrl)revoke(old.previewUrl);state.files[slot]=null;
  const row=state.host?.querySelector(`[data-slot="${slot}"]`);
  if(row){const input=row.querySelector("[data-file]");if(input)input.value="";row.querySelector("[data-name]").textContent="No file selected";row.querySelector("[data-preview]").disabled=true;row.querySelector("[data-remove]").disabled=true;row.querySelector("[data-extract]").disabled=true;row.querySelector("[data-status]").textContent="Optional";}
  state.results=[];if(renderAgain)renderResults();
}
function preview(slot){
  const item=state.files[slot];if(!item)return;
  const dlg=document.createElement("dialog");dlg.className="ndc-ss-preview";
  const content=item.file.type==="application/pdf"||/\.pdf$/i.test(item.file.name)?`<iframe title="Document preview" src="${item.previewUrl}"></iframe>`:`<img alt="Selected document preview" src="${item.previewUrl}">`;
  dlg.innerHTML=`<div><strong>${escape(item.file.name)}</strong><button type="button">Close</button></div>${content}`;
  dlg.querySelector("button").onclick=()=>dlg.close();dlg.addEventListener("close",()=>dlg.remove(),{once:true});document.body.append(dlg);dlg.showModal();
}
function setProgress(message,percent=null){
  const el=state.host?.querySelector("[data-progress]"),bar=state.host?.querySelector("[data-bar]");if(el)el.textContent=message||"";
  if(bar){bar.hidden=percent===null;if(percent!==null)bar.value=percent;}
}
function selectedDocs(slots){
  return slots.filter(k=>state.files[k]).map(k=>({file:state.files[k].file,kind:k.toLowerCase().includes("aadhaar")?"aadhaar":k==="pan"?"pan":"salecard"}));
}
async function runExtraction(slots){
  if(state.running)return;const docs=selectedDocs(slots);if(!docs.length){setProgress("Choose at least one document first.");return;}
  state.running=true;state.reviewAccepted=false;state.populated=0;const seq=++state.sequence,button=state.host.querySelector("[data-extract-all]");button.disabled=true;state.host.querySelector("[data-cancel]").hidden=false;setProgress("Starting browser OCR…",2);
  try{
    state.results=await extractDocuments(docs,{onProgress:p=>{if(seq!==state.sequence)return;setProgress(`${p.phase}: ${p.name} (${p.index} of ${p.total})`,Math.round(p.index/p.total*100));}});
    if(seq!==state.sequence)return;
    const merged=mergeDocuments(state.results.filter(x=>x.success));state.fields=merged.fields;state.conflicts=merged.conflicts;state.conflictChoices={};renderResults();setProgress("Extraction finished. Review values and sources before autofilling.",100);
  }catch(error){if(error.name!=="AbortError")setProgress(error.message||"OCR failed. You can continue with manual entry.");}
  finally{if(seq===state.sequence){state.running=false;button.disabled=false;state.host.querySelector("[data-cancel]").hidden=true;await releaseWorker();}}
}
function renderResults(){
  const root=state.host?.querySelector("[data-results]");if(!root)return;root.replaceChildren();
  const failed=state.results.filter(r=>!r.success),successful=state.results.filter(r=>r.success);
  const fields=state.fields||{},keys=Object.keys(fields),review=keys.filter(k=>fields[k].review).length;
  state.host.querySelector("[data-summary]").textContent=state.results.length?`Documents processed: ${successful.length}/${state.results.length} · Fields extracted: ${keys.length} · Fields populated: ${state.populated} · Review required: ${review+Object.keys(state.conflicts).length} · Conflicts: ${Object.keys(state.conflicts).length} · Failed: ${failed.length}`:"";
  for(const fail of failed){const p=document.createElement("p");p.className="ndc-ss-error";p.textContent=`${fail.name}: ${fail.error}`;root.append(p);}
  for(const key of Object.keys(state.conflicts)){
    const entries=state.conflicts[key],wrap=document.createElement("fieldset");wrap.className="ndc-ss-conflict";const legend=document.createElement("legend");legend.textContent=`Conflicting ${key} — choose a source`;wrap.append(legend);
    entries.forEach((entry,index)=>{const label=document.createElement("label");label.innerHTML=`<input type="radio" name="conflict-${escape(key)}" data-conflict="${escape(key)}" value="${index}" ${state.conflictChoices[key]===index?"checked":""}><span>${escape(entry.value)}</span><small>${escape(entry.source||"Document")} · ${Math.round((entry.confidence||0)*100)}% OCR</small>`;wrap.append(label);});
    root.append(wrap);
  }
  for(const [key,entry] of Object.entries(fields)){
    const row=document.createElement("p");row.className="ndc-ss-field";row.textContent=`${key}: ${entry.value} · ${entry.source} · ${entry.status||"Review"}`;root.append(row);
  }
  state.host.querySelector("[data-autofill]").hidden=!keys.length;
}
async function applyResults(){
  if(Object.keys(state.conflicts).some(key=>!Number.isInteger(state.conflictChoices[key]))){setProgress("Choose a value and source for each conflict before autofilling.");return;}
  const fields={...(state.fields||{})};
  for(const [key,entries] of Object.entries(state.conflicts)){const chosen=entries[state.conflictChoices[key]];if(chosen)fields[key]=chosen;}
  const res=await mapFields(fields,{conflicts:state.conflicts,confirmOverwrite:ctx=>window.confirm(`Replace existing ${ctx.key} value with ${ctx.extracted} from ${ctx.source}?`)});
  state.populated=res.populated.length;state.reviewAccepted=true;renderResults();
  setProgress(`Populated ${res.populated.length} fields. ${res.review.length} need review. Extracted values remain editable; review before saving.`);
  state.host.querySelectorAll("[data-field]")?.forEach(()=>{});
}
async function afterCreate(customerId,bridge){
  state.pendingCustomerId=customerId;state.attachmentsComplete=false;state.bridge=bridge;return retryAttachments();
}
async function retryAttachments(){
  if(!state.pendingCustomerId||!state.bridge)return {success:true,failed:[]};
  const documents=Object.fromEntries(Object.entries(state.files).map(([key,value])=>[key,value?.file||null]));
  const result=await attachDocuments(state.pendingCustomerId,documents,{request:state.bridge.request,prepareUploadFile:state.bridge.prepareUploadFile});
  state.attachmentsComplete=result.success;
  const btn=state.host?.querySelector("[data-retry]");if(btn)btn.hidden=result.success;
  if(!result.success)setProgress("Customer was created. Attachments failed: "+result.failed.map(x=>x.name+": "+x.error).join("; ")+" Retry is available.");
  else setProgress("Customer created and selected Aadhaar/PAN documents attached.");
  return result;
}
function setVisibility({enabled,isNew,purpose}={}){
  state.visible=enabled===true&&isNew===true&&purpose==="tr-and-documents-upload";
  const host=state.host;if(host){host.hidden=!state.visible;if(!state.visible)cancelOCR();}
}
function reset(){state.sequence++;cancelOCR();clearFiles();state.running=false;if(state.host){render(state.host);setVisibility(state.visibility||{});}}
export function mount(host,options={}){
  state.host=host;state.bridge=options.bridge||null;state.visibility=options.visibility||{};render(host);setVisibility(state.visibility);return {setVisibility,reset,afterCreate,retryAttachments,hasFiles:()=>Object.values(state.files).some(Boolean),isReviewComplete:()=>!state.results.some(r=>r.success)||state.reviewAccepted,get pendingCustomerId(){return state.pendingCustomerId;},get attachmentsComplete(){return state.attachmentsComplete;},clear:()=>{state.sequence++;cancelOCR();state.running=false;clearFiles();render(host);}};
}
