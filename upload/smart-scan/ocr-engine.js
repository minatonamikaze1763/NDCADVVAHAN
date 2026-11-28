import {parseAadhaar} from "./parsers/aadhaar-parser.js";
import {parsePan} from "./parsers/pan-parser.js";
import {parseSaleCard} from "./parsers/salecard-parser.js";
import {parseAddress} from "./parsers/address-parser.js";
import {assess} from "./confidence-engine.js";

const BASE="/upload/smart-scan/assets";
const MAX_BYTES=20*1024*1024, MAX_PAGES=8, MAX_SIDE=2400;
let workerPromise=null, pdfPromise=null, activeWorker=null, cancelled=false;
const supported=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
function loadScript(src){return new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error("Could not load the local OCR engine asset: "+src));document.head.append(s);});}
async function getWorker(){
  if(workerPromise)return workerPromise;
  workerPromise=(async()=>{await loadScript(BASE+"/tesseract/tesseract.min.js");if(!window.Tesseract)throw new Error("Tesseract.js did not initialize.");
    activeWorker=await window.Tesseract.createWorker("eng",window.Tesseract.OEM.LSTM_ONLY,{workerPath:BASE+"/tesseract/worker.min.js",corePath:BASE+"/tesseract/tesseract-core-lstm.wasm.js",langPath:BASE+"/models",gzip:true,logger:()=>{}});
    return activeWorker;})();
  try{return await workerPromise;}catch(e){workerPromise=null;throw e;}
}
async function getPdf(){
  if(!pdfPromise)pdfPromise=import(BASE+"/pdfjs/pdf.min.mjs").then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=BASE+"/pdfjs/pdf.worker.min.mjs";return pdf;});
  return pdfPromise;
}
function checkFile(file){
  if(!file||!supported.has(file.type)&&!(/\.(jpe?g|png|webp|pdf)$/i.test(file.name||"")))throw new Error("Choose a JPG, PNG, WEBP or PDF document.");
  if(file.size>MAX_BYTES)throw new Error("File exceeds the 20 MB Smart Scan processing limit.");
}
function preprocess(source){
  const scale=Math.min(1,MAX_SIDE/Math.max(source.width,source.height)),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data;
  for(let i=0;i<data.length;i+=4){const gray=(.299*data[i]+.587*data[i+1]+.114*data[i+2]-128)*1.28+128;const v=Math.max(0,Math.min(255,gray));data[i]=data[i+1]=data[i+2]=v;}
  ctx.putImageData(image,0,0);return canvas;
}
async function imageText(file,worker){
  let bitmap;
  try{
    bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    const canvas=preprocess(bitmap);const {data}=await worker.recognize(canvas);canvas.width=canvas.height=0;return {text:data.text,confidence:data.confidence/100};
  }finally{bitmap?.close?.();}
}
async function pdfText(file,worker,onProgress){
  const pdfjs=await getPdf(),bytes=new Uint8Array(await file.arrayBuffer());
  const task=pdfjs.getDocument({data:bytes});let doc;
  try{doc=await task.promise;}catch(e){if(/password/i.test(e?.message||""))throw new Error("This PDF is password-protected. Save an unlocked copy and try again.");throw new Error("PDF could not be opened. It may be corrupted or unsupported.");}
  if(doc.numPages>MAX_PAGES)throw new Error("PDF has more than 8 pages. Split it into smaller files.");
  const parts=[];
  for(let n=1;n<=doc.numPages;n++){
    if(cancelled)throw new DOMException("Cancelled","AbortError");
    const page=await doc.getPage(n),content=await page.getTextContent(),embedded=content.items.map(x=>x.str).join(" ").trim();
    let text=embedded,confidence=embedded?0.9:0.0;
    if(!embedded){
      const viewport=page.getViewport({scale:Math.min(2.2,MAX_SIDE/Math.max(page.getViewport({scale:1}).width,page.getViewport({scale:1}).height))});
      const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
      const {data}=await worker.recognize(preprocess(canvas));text=data.text;confidence=data.confidence/100;canvas.width=canvas.height=0;
    }
    parts.push(text);onProgress?.(n,doc.numPages);page.cleanup();
  }
  await doc.destroy();return {text:parts.join("\n"),confidence:parts.length?parts.reduce((s,_,i)=>s+i,0)/parts.length:0};
}
function parse(text,kind){
  const parsers=kind==="aadhaar"?[parseAadhaar,parseAddress]:kind==="pan"?[parsePan]:[parseSaleCard];
  return parsers.reduce((all,fn)=>Object.assign(all,fn(text)),{});
}
export async function extractDocuments(documents,{onProgress=()=>{},signal}={}){
  cancelled=false;const results=[];
  try{
    const worker=await getWorker();
    for(let i=0;i<documents.length;i++){
      if(cancelled||signal?.aborted)throw new DOMException("Cancelled","AbortError");
      const item=documents[i];checkFile(item.file);onProgress({index:i+1,total:documents.length,name:item.file.name,phase:"Reading"});
      try{
        const read=item.file.type==="application/pdf"||/\.pdf$/i.test(item.file.name||"")?await pdfText(item.file,worker,()=>{}):await imageText(item.file,worker);
        const fields=assess(parse(read.text,item.kind),item.kind);
        results.push({name:item.file.name,kind:item.kind,fields,text:read.text,confidence:read.confidence,success:true});
      }catch(error){results.push({name:item.file.name,kind:item.kind,error:error.message||"Could not read document.",success:false});}
      onProgress({index:i+1,total:documents.length,name:item.file.name,phase:"Complete"});
    }
    return results;
  }finally{await releaseWorker();}
}
export function cancel(){cancelled=true;const worker=activeWorker;activeWorker=null;workerPromise=null;if(worker)void worker.terminate();}
export async function releaseWorker(){const worker=activeWorker;activeWorker=null;workerPromise=null;if(worker)try{await worker.terminate();}catch{}}
