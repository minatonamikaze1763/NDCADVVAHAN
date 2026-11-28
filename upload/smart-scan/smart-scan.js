import {extractDocuments,cancel as cancelOCR,releaseWorker} from "./ocr-engine.js";
import {mergeDocuments} from "./confidence-engine.js";
import {mapFields} from "./form-mapper.js";
import {attachDocuments} from "./document-attachment.js";

const TYPES={aadhaar:"Aadhaar",pan:"PAN Card",salecard:"Sale Card"};
const ACCEPT=".jpg,.jpeg,.png,.webp,.pdf,application/pdf,image/jpeg,image/png,image/webp";
const state={host:null,mode:"combined",conflictChoices:{},files:{combinedAadhaar:null,aadhaarFront:null,aadhaarBack:null,pan:null,salecard:null},urls:new Set(),running:false,sequence:0,results:[],conflicts:{},pendingCustomerId:null,attachmentsComplete:false,bridge:null,visible:false,populated:0,reviewAccepted:false};
const escape=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const iconPaths={
  file:"<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><path d='M14 2v6h6M12 12v6m-3-3h6'/>",
  camera:"<path d='M14 4h-4l-2 3H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z'/><circle cx='12' cy='13' r='3'/>",
  preview:"<path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z'/><circle cx='12' cy='12' r='2.5'/>",
  scan:"<path d='M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10'/><path d='m14 9 3 3-3 3'/>",
  remove:"<path d='M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6m4 4v6m6-6v6'/>",
  review:"<path d='m5 12 4 4L19 6'/>",
  cancel:"<path d='m6 6 12 12M18 6 6 18'/>",
  retry:"<path d='M20 7v5h-5M4 17v-5h5'/><path d='M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.5-3'/>"
};
function icon(name){return "<svg class=\"ndc-ss-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\">"+(iconPaths[name]||"")+"</svg>";}
function revoke(url){if(url){URL.revokeObjectURL(url);state.urls.delete(url);}}
function clearFiles(){for(const file of Object.values(state.files))if(file?.previewUrl)revoke(file.previewUrl);state.files={combinedAadhaar:null,aadhaarFront:null,aadhaarBack:null,pan:null,salecard:null};state.results=[];state.conflicts={};state.pendingCustomerId=null;state.attachmentsComplete=false;state.populated=0;state.reviewAccepted=false;}
function fileItem(slot,label,kind){
  return `<article class="ndc-ss-file ndc-ss-file--${kind}" data-slot="${slot}"><div class="ndc-ss-file-heading"><strong>${escape(label)}</strong><span class="ndc-ss-optional">Optional</span></div><div class="ndc-ss-file-meta"><small class="ndc-ss-file-name" data-name title="No file selected">No file selected</small><span class="ndc-ss-status" data-status role="status"></span></div><input data-file type="file" accept="${ACCEPT}" hidden><div class="ndc-ss-actions ndc-ss-file-actions"><button type="button" class="secondary" data-select>${icon("file")}<span>Choose file</span></button><button type="button" class="secondary" data-camera>${icon("camera")}<span>Camera</span></button><button type="button" class="secondary" data-preview hidden>${icon("preview")}<span>Preview</span></button><button type="button" class="secondary" data-extract hidden>${icon("scan")}<span>Extract</span></button><button type="button" class="danger" data-remove hidden aria-label="Remove document" title="Remove document">${icon("remove")}<span>Remove</span></button></div></article>`;
}
function render(host){
  const slotHtml=()=>state.mode==="combined"?fileItem("combinedAadhaar","Combined Aadhaar · front/back, single or multi-page PDF","aadhaar"):`${fileItem("aadhaarFront","Aadhaar Card Front","aadhaar")}${fileItem("aadhaarBack","Aadhaar Card Back","aadhaar")}`;
  host.innerHTML=`<details class="ndc-smart-scan" id="ndcSmartScanSection"><summary><span>NDC Smart Scan — Scan, Extract &amp; Autofill</span></summary><div class="ndc-ss-body"><p class="ndc-ss-notice">With the customer’s consent, select documents to prepare a draft. OCR runs in this browser. Review every value before saving; extraction is not official identity verification.</p><fieldset class="ndc-ss-mode"><legend>Aadhaar upload mode</legend><label><input type="radio" name="ndcSmartScanMode" value="combined" ${state.mode==="combined"?"checked":""}><span>Combined Aadhaar</span></label><label><input type="radio" name="ndcSmartScanMode" value="separate" ${state.mode==="separate"?"checked":""}><span>Separate Front &amp; Back</span></label></fieldset><div class="ndc-ss-files ndc-ss-aadhaar" data-aadhaar>${slotHtml()}</div><div class="ndc-ss-files ndc-ss-other-docs">${fileItem("pan","PAN Card","pan")}${fileItem("salecard","Sale Card","salecard")}</div><div class="ndc-ss-progress-wrap"><div class="ndc-ss-progress" data-progress role="status" aria-live="polite"></div><progress class="ndc-ss-progress-bar" data-bar max="100" value="0" aria-label="OCR processing progress" hidden></progress></div><div class="ndc-ss-actions ndc-ss-main-actions"><button type="button" class="primary" data-extract-all>${icon("scan")}<span>Extract Customer Details</span></button><button type="button" class="secondary" data-cancel hidden>${icon("cancel")}<span>Cancel processing</span></button><button type="button" class="secondary" data-autofill hidden>${icon("review")}<span>Review &amp; Autofill</span></button><button type="button" class="secondary" data-retry hidden>${icon("retry")}<span>Retry document attachments</span></button></div><div data-summary class="ndc-ss-summary" aria-live="polite"></div><div data-results class="ndc-ss-results"></div></div></details>`;
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
  const name=row.querySelector("[data-name]");name.textContent=file.name;name.title=file.name;
  row.querySelector("[data-preview]").hidden=false;row.querySelector("[data-remove]").hidden=false;row.querySelector("[data-extract]").hidden=false;
  row.querySelector("[data-status]").textContent="Selected locally; not uploaded.";
  setProgress("");
}
function removeFile(slot,renderAgain=true){
  cancelCurrent("Document removed. Previous OCR result discarded.");
  const old=state.files[slot];if(old?.previewUrl)revoke(old.previewUrl);state.files[slot]=null;
  const row=state.host?.querySelector(`[data-slot="${slot}"]`);
  if(row){const input=row.querySelector("[data-file]");if(input)input.value="";const name=row.querySelector("[data-name]");name.textContent="No file selected";name.title="No file selected";row.querySelector("[data-preview]").hidden=true;row.querySelector("[data-remove]").hidden=true;row.querySelector("[data-extract]").hidden=true;row.querySelector("[data-status]").textContent="";}
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
    const status=["confident","review","invalid"].includes(entry.status)?entry.status:"review";
    const row=document.createElement("div");row.className="ndc-ss-field ndc-ss-field--"+status;
    const heading=document.createElement("div");heading.className="ndc-ss-field-heading";
    const keyLabel=document.createElement("strong");keyLabel.textContent=key;
    const statusLabel=document.createElement("span");statusLabel.className="ndc-ss-field-status";statusLabel.textContent=status==="confident"?"Confident · review before saving":status==="invalid"?"Invalid · check value":"Review required";
    const value=document.createElement("p");value.textContent=entry.value;
    const source=document.createElement("small");source.textContent=(entry.source||"Document")+" · "+Math.round((entry.confidence||0)*100)+"% OCR confidence";
    heading.append(keyLabel,statusLabel);row.append(heading,value,source);root.append(row);
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
