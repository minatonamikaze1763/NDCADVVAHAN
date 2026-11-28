import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".wasm":"application/wasm",".gz":"application/gzip",".traineddata":"application/octet-stream",".json":"application/json"};
const smokePage=`<!doctype html><meta charset="utf-8"><title>NDC Smart Scan OCR smoke</title><body><script type="module">
import {extractDocuments} from "/upload/smart-scan/ocr-engine.js";
try {
 const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=220;
 const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,1200,220);
 ctx.fillStyle="#111";ctx.font="bold 64px Arial";ctx.fillText("NDC SMART SCAN TEST",40,105);
 ctx.font="48px Arial";ctx.fillText("503001",40,175);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
 const result=await extractDocuments([{file:new File([blob],"synthetic.png",{type:"image/png"}),kind:"salecard"}]);
 window.ocrResult={ok:result[0]?.success===true,text:result[0]?.text||"",error:result[0]?.error||""};
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
  await page.goto(`http://127.0.0.1:${address.port}/__ocr_smoke`);
  await page.waitForFunction(()=>window.ocrResult!==undefined,{timeout:120000});
  const result=await page.evaluate(()=>window.ocrResult);
  if(!result.ok||!/NDC\s+SMART\s+SCAN\s+TEST/i.test(result.text))throw new Error("Local OCR smoke test failed: "+(result.error||result.text));
  console.log("Local browser OCR smoke test passed using self-hosted assets.");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
