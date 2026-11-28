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
    activeWorker=await window.Tesseract.createWorker("eng",window.Tesseract.OEM.LSTM_ONLY,{workerPath:BASE+"/tesseract/worker.min.js",corePath:BASE+"/tesseract/",langPath:BASE+"/models",gzip:true,logger:()=>{}});
    return activeWorker;})();
  try{return await workerPromise;}catch(e){workerPromise=null;throw e;}
}
async function getPdf(){
  if(!pdfPromise)pdfPromise=import(BASE+"/pdfjs/pdf.mjs").then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=BASE+"/pdfjs/pdf.worker.mjs";return pdf;});
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
async function recognizeSource(source,worker){
  const canvas=preprocess(source);
  try{const {data}=await worker.recognize(canvas);return {text:data.text||"",confidence:Number(data.confidence||0)/100};}
  finally{canvas.width=canvas.height=0;}
}
function rotateSource(source,degrees){
  const radians=degrees*Math.PI/180,swap=degrees%180!==0,canvas=document.createElement("canvas");
  canvas.width=swap?source.height:source.width;canvas.height=swap?source.width:source.height;
  const ctx=canvas.getContext("2d");ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(radians);ctx.drawImage(source,-source.width/2,-source.height/2);
  return canvas;
}
function cropSource(source,x,y,width,height){
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.floor(width));canvas.height=Math.max(1,Math.floor(height));
  canvas.getContext("2d").drawImage(source,x,y,width,height,0,0,canvas.width,canvas.height);return canvas;
}
function combineText(candidates){
  const seen=new Set(),lines=[];
  for(const item of candidates){for(const line of item.text.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean)){
    const normalized=line.toLowerCase().replace(/[^a-z0-9]/g,"");if(normalized&&!seen.has(normalized)){seen.add(normalized);lines.push(line);}
  }}
  return lines.join("\\n");
}
async function imageText(file,worker,kind){
  let bitmap;
  try{
    bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    const candidates=[await recognizeSource(bitmap,worker)],base=candidates[0];
    if(kind==="aadhaar"&&(base.confidence<.76||!/(aadhaar|uidai|address|date of birth|year of birth|male|female|pin)/i.test(base.text))){
      const regions=[
        cropSource(bitmap,0,0,bitmap.width/2,bitmap.height),
        cropSource(bitmap,bitmap.width/2,0,bitmap.width/2,bitmap.height),
        cropSource(bitmap,0,0,bitmap.width,bitmap.height/2),
        cropSource(bitmap,0,bitmap.height/2,bitmap.width,bitmap.height/2)
      ];
      for(const region of regions){try{candidates.push(await recognizeSource(region,worker));}finally{region.width=region.height=0;}}
    }
    if(base.confidence<.55){
      for(const angle of [90,180,270]){const rotated=rotateSource(bitmap,angle);try{candidates.push(await recognizeSource(rotated,worker));}finally{rotated.width=rotated.height=0;}}
    }
    const best=[...candidates].sort((a,b)=>b.confidence-a.confidence)[0];
    return {text:combineText(candidates),confidence:best.confidence};
  }finally{bitmap?.close?.();}
}
async function pdfText(file,worker,onProgress){
  const pdfjs=await getPdf(),bytes=new Uint8Array(await file.arrayBuffer());
  const task=pdfjs.getDocument({data:bytes,cMapUrl:BASE+"/pdfjs/cmaps/",cMapPacked:true,standardFontDataUrl:BASE+"/pdfjs/standard_fonts/"});let doc;
  try{
    doc=await task.promise;
  }catch(e){
    try{await task.destroy();}catch{}
    if(/password/i.test(e?.message||""))throw new Error("This PDF is password-protected. Save an unlocked copy and try again.");
    throw new Error("PDF could not be opened. It may be corrupted or unsupported.");
  }
  try{
    if(doc.numPages>MAX_PAGES)throw new Error("PDF has more than 8 pages. Split it into smaller files.");
    const parts=[];let confidenceTotal=0;
    for(let n=1;n<=doc.numPages;n++){
      if(cancelled)throw new DOMException("Cancelled","AbortError");
      const page=await doc.getPage(n),content=await page.getTextContent(),embedded=content.items.map(x=>x.str).join(" ").trim();
      let text=embedded,confidence=embedded?0.9:0.0;
      if(!embedded){
        const baseViewport=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:Math.min(2.2,MAX_SIDE/Math.max(baseViewport.width,baseViewport.height))});
        const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        try{
          await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
          const prepared=preprocess(canvas);
          try{const {data}=await worker.recognize(prepared);text=data.text;confidence=data.confidence/100;}
          finally{prepared.width=prepared.height=0;}
        }finally{canvas.width=canvas.height=0;}
      }
      parts.push(text);confidenceTotal+=confidence;onProgress?.(n,doc.numPages);page.cleanup();
    }
    return {text:parts.join("\n"),confidence:parts.length?confidenceTotal/parts.length:0};
  }finally{
    try{await task.destroy();}catch{}
  }
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
