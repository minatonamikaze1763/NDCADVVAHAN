import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".wasm":"application/wasm",".gz":"application/gzip",".traineddata":"application/octet-stream",".json":"application/json"};
const smokePage=String.raw`<!doctype html><meta charset="utf-8"><title>NDC Smart Scan OCR smoke</title><body><script type="module">
import {extractDocuments} from "/upload/smart-scan/ocr-engine.js";
async function synthetic(lines,name){
 const canvas=document.createElement("canvas");canvas.width=1500;canvas.height=Math.max(240,lines.length*70+40);
 const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle="#111";ctx.font="bold 42px Arial";
 lines.forEach((line,index)=>ctx.fillText(line,35,70+index*68));
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
 return new File([blob],name,{type:"image/png"});
}
try {
 const docs=[
  {file:await synthetic(["UIDAI Aadhaar","Name: SAMPLE PERSON","Date of Birth: 01/02/1990","Gender: MALE","Address:","Door No: 12-34","Village: DEMO TOWN","District: DEMO DISTRICT","Telangana 503001","XXXX XXXX 9012"],"synthetic-aadhaar.png"),kind:"aadhaar"},
  {file:await synthetic(["INCOME TAX DEPARTMENT","Name","SAMPLE PERSON","Father's Name","GUARDIAN SAMPLE","ABCDE1234F","01/02/1990"],"synthetic-pan.png"),kind:"pan"},
  {file:await synthetic(["Chassis No: 1HGCM82633A004352","Engine No: EN123456","Mobile: 9052691719","Invoice No: INV-123","Ex-showroom price: 100000"],"synthetic-sale.png"),kind:"salecard"}
 ];
 const results=await extractDocuments(docs);
 const aadhaar=results[0],pan=results[1],sale=results[2];
 const ok=results.every(item=>item.success)
  &&aadhaar.fields.customerName?.value.toUpperCase().includes("SAMPLE PERSON")
  &&aadhaar.fields.aadhaarLast4?.value==="9012"
  &&pan.fields.panNumber?.value==="ABCDE1234F"
  &&sale.fields.chassisNumber?.value==="1HGCM82633A004352"
  &&sale.fields.invoiceNumber?.value==="INV-123";
 window.ocrResult={ok,summary:results.map(item=>({success:item.success,fieldCount:Object.keys(item.fields||{}).length})),error:ok?"":"Structured extraction did not return all expected synthetic fields."};
} catch(error) { window.ocrResult={ok:false,error:error?.message||String(error)}; }
</script></body>`;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://127.0.0.1").pathname;
  if(pathname==="/__ocr_smoke"){res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(smokePage);return;}
  const target=path.resolve(root,"."+decodeURIComponent(pathname));
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(target,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);res.end("Not found");return;}res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream","cache-control":"no-store"});fs.createReadStream(target).pipe(res);});
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const address=server.address();
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  page.on("pageerror",e=>console.error("[browser]",e.message));
  await page.goto("http://127.0.0.1:"+address.port+"/__ocr_smoke");
  await page.waitForFunction(()=>window.ocrResult!==undefined,null,{timeout:180000});
  const result=await page.evaluate(()=>window.ocrResult);
  if(!result.ok)throw new Error("Synthetic browser OCR extraction failed: "+(result.error||JSON.stringify(result.summary)));
  console.log("Synthetic Aadhaar, PAN and Sale Card extraction passed using same-origin self-hosted OCR assets.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
