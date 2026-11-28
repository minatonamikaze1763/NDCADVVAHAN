import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium,firefox} from "playwright";

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
async function combinedAadhaar(layout,{rotation=0,blur=0}={}){
 const horizontal=layout==="horizontal",canvas=document.createElement("canvas");
 canvas.width=horizontal?2300:1200;canvas.height=horizontal?900:1800;
 const ctx=canvas.getContext("2d");ctx.fillStyle="#ddd";ctx.fillRect(0,0,canvas.width,canvas.height);
 const front=["UIDAI Aadhaar","Name: SAMPLE PERSON","Date of Birth: 01/02/1990","Gender: MALE","XXXX XXXX 9012"];
 const back=["Address:","Door No: 12-34","Street: MAIN ROAD","Village: DEMO TOWN","Mandal: DEMO MANDAL","District: DEMO DISTRICT","Telangana 503001"];
 const draw=(lines,x,y,w,h)=>{ctx.fillStyle="#fff";ctx.fillRect(x,y,w,h);ctx.strokeStyle="#555";ctx.lineWidth=5;ctx.strokeRect(x,y,w,h);ctx.fillStyle="#111";ctx.font="bold 38px Arial";ctx.filter=blur?("blur("+blur+"px)"):"none";lines.forEach((line,i)=>ctx.fillText(line,x+32,y+75+i*90));ctx.filter="none";};
 if(horizontal){draw(front,25,25,1100,850);draw(back,1175,25,1100,850);}
 else{draw(front,25,25,1150,850);draw(back,25,925,1150,850);}
 let output=canvas;
 if(rotation){output=document.createElement("canvas");output.width=canvas.width;output.height=canvas.height;const g=output.getContext("2d");g.translate(output.width/2,output.height/2);g.rotate(rotation*Math.PI/180);g.drawImage(canvas,-canvas.width/2,-canvas.height/2);}
 const blob=await new Promise(resolve=>output.toBlob(resolve,"image/png"));
 return new File([blob],"synthetic-aadhaar-"+layout+"-"+rotation+"-"+blur+".png",{type:"image/png"});
}
try {
 const basicAadhaar=["UIDAI Aadhaar","Name: SAMPLE PERSON","Date of Birth: 01/02/1990","Gender: MALE","Address:","Door No: 12-34","Village: DEMO TOWN","District: DEMO DISTRICT","Telangana 503001","XXXX XXXX 9012"];
 const docs=[
  {file:await synthetic(basicAadhaar,"synthetic-aadhaar.png"),kind:"aadhaar"},
  {file:await synthetic(["INCOME TAX DEPARTMENT","Name","SAMPLE PERSON","Father's Name","GUARDIAN SAMPLE","ABCDE1234F","01/02/1990"],"synthetic-pan.png"),kind:"pan"},
  {file:await synthetic(["Chassis No: 1HGCM82633A004352","Engine No: EN123456","Mobile: 9052691719","Invoice No: INV-123","Ex-showroom price: 100000"],"synthetic-sale.png"),kind:"salecard"}
 ];
 const results=await extractDocuments(docs);
 const aadhaar=results[0],pan=results[1],sale=results[2];
 const layouts=[
  {name:"horizontal",file:await combinedAadhaar("horizontal")},
  {name:"vertical",file:await combinedAadhaar("vertical")},
  {name:"rotated",file:await combinedAadhaar("horizontal",{rotation:180})},
  {name:"blurred",file:await combinedAadhaar("horizontal",{blur:.8})}
 ];
 const combined=await extractDocuments(layouts.map(item=>({file:item.file,kind:"aadhaar"})));
 const combinedOk=combined.every(item=>item.success&&item.fields.customerName?.value.toUpperCase().includes("SAMPLE PERSON")&&item.fields.pincode?.value==="503001"&&item.fields.houseNumber?.value==="12-34");
 const ok=results.every(item=>item.success)
  &&aadhaar.fields.customerName?.value.toUpperCase().includes("SAMPLE PERSON")
  &&aadhaar.fields.aadhaarLast4?.value==="9012"
  &&pan.fields.panNumber?.value==="ABCDE1234F"
  &&sale.fields.chassisNumber?.value==="1HGCM82633A004352"
  &&sale.fields.invoiceNumber?.value==="INV-123"&&combinedOk;
 window.ocrResult={ok,summary:results.concat(combined).map(item=>({success:item.success,fieldCount:Object.keys(item.fields||{}).length})),combinedLayouts:combined.map((item,index)=>({layout:layouts[index].name,success:item.success,name:!!item.fields.customerName,pincode:!!item.fields.pincode,house:!!item.fields.houseNumber,error:item.error||""})),error:ok?"":"Structured extraction did not return all expected synthetic fields."};
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
try{
 const browserTypes=process.env.SMARTSCAN_TEST_FIREFOX==="1"?[chromium,firefox]:[chromium];
 for(const browserType of browserTypes){
  const launchOptions={headless:true};if(browserType===chromium&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)launchOptions.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser=await browserType.launch(launchOptions);
  try{
  const page=await browser.newPage();
  page.on("pageerror",e=>console.error("[browser]",e.message));
  await page.goto("http://127.0.0.1:"+address.port+"/__ocr_smoke");
  await page.waitForFunction(()=>window.ocrResult!==undefined,null,{timeout:180000});
  const result=await page.evaluate(()=>window.ocrResult);
  if(!result.ok)throw new Error("Synthetic browser OCR extraction failed: "+(result.error||JSON.stringify(result.summary)));
  console.log("Synthetic Aadhaar, PAN and Sale Card extraction passed in "+browserType.name()+" using same-origin self-hosted OCR assets.");
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
