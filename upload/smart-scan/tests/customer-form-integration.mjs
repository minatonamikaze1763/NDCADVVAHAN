import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {validAadhaar} from "../validators.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".wasm":"application/wasm",".gz":"application/gzip",".traineddata":"application/octet-stream",".json":"application/json"};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://127.0.0.1").pathname;
  const target=path.resolve(root,"."+decodeURIComponent(pathname));
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(target,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);res.end("Not found");return;}res.writeHead(200,{"content-type":mime[path.extname(target)]||"application/octet-stream","cache-control":"no-store"});fs.createReadStream(target).pipe(res);});
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
const api="https://server.nextdimensioncustoms.in";
const launchOptions={headless:true};if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)launchOptions.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser=await chromium.launch(launchOptions);
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(error.message));
  await page.addInitScript(({api})=>{
    const state={calls:[],creates:[],uploads:[],customerOCREnabled:true,failPanOnce:true,customer:null};
    window.__smartScanMock=state;
    const original=window.fetch.bind(window);
    window.fetch=async(input,options={})=>{
      const url=new URL(typeof input==="string"?input:input.url,location.href);
      if(url.origin!==api)return original(input,options);
      const method=String(options.method||"GET").toUpperCase();
      const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
      state.calls.push({path:url.pathname,method});
      if(url.pathname==="/api/cloud/auth/login")return json({token:"synthetic-token",expiresAt:Date.now()+3600000,user:{username:"synthetic",cloudAddon:{active:true}}});
      if(url.pathname==="/api/cloud/auth/me")return json({user:{username:"synthetic",cloudAddon:{active:true}},sessionExpiresAt:Date.now()+3600000});
      if(url.pathname==="/api/cloud/auth/logout")return json({success:true});
      if(url.pathname==="/api/upload-portal/settings")return json({autoForm20AsInspection:false,smartScanEnabled:true,customerOCREnabled:state.customerOCREnabled});
      if(url.pathname==="/api/upload-portal/customers"&&method==="GET")return json({customers:[]});
      if(url.pathname==="/api/upload-portal/customers"&&method==="POST"){
        const body=JSON.parse(options.body||"{}");state.creates.push(body);
        state.customer={...body,_id:"synthetic-customer-1",documents:{}};
        return json({customer:state.customer});
      }
      if(url.pathname==="/api/upload-portal/customers/synthetic-customer-1"&&method==="GET")return json({customer:state.customer});
      if(url.pathname.startsWith("/api/upload-portal/customers/synthetic-customer-1/documents/")&&method==="PUT"){
        const category=url.pathname.split("/").at(-1),headers=new Headers(options.headers||{});
        state.uploads.push({customerId:"synthetic-customer-1",category,bytes:Number(options.body?.size||0),filename:headers.get("X-NDC-Original-Filename"),subcategory:headers.get("X-NDC-Subcategory"),processed:headers.get("X-NDC-Processed")});
        if(category==="pan-card"&&state.failPanOnce){state.failPanOnce=false;return json({error:"Synthetic first PAN attachment failure"},500);}
        state.customer.documents={...(state.customer.documents||{}),[category]:{filename:headers.get("X-NDC-Original-Filename"),contentType:headers.get("X-NDC-Upload-Type"),subcategory:headers.get("X-NDC-Subcategory")}};
        return json({success:true});
      }
      return json({success:true});
    };
  },{api});
  await page.goto(base+"/upload/index.html");
  await page.locator("#loginForm").waitFor();
  await page.locator("#username").fill("synthetic-dealer");
  await page.locator("#password").fill("synthetic-password");
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator("#newCustomer").waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(()=>window.__smartScanMock?.calls.some(x=>x.path==="/api/upload-portal/settings"));
  const makePng=async lines=>{
    const bytes=await page.evaluate(async rows=>{
      const c=document.createElement("canvas");c.width=1600;c.height=Math.max(300,rows.length*72+40);
      const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.fillStyle="#111";g.font="bold 42px Arial";
      rows.forEach((line,i)=>g.fillText(line,35,65+i*68));
      const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },lines);
    return {name:"synthetic.png",mimeType:"image/png",buffer:Buffer.from(bytes)};
  };
  const makePdf=async (first,second=[])=>{
    const bytes=await page.evaluate(async ({first,second})=>{
      const doc=new window.jspdf.jsPDF({unit:"pt",format:"a4"});
      doc.setFont("helvetica","bold");doc.setFontSize(18);
      first.forEach((line,i)=>doc.text(line,35,55+i*28));
      if(second.length){doc.addPage();second.forEach((line,i)=>doc.text(line,35,55+i*28));}
      const blob=doc.output("blob");return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },{first,second});
    return {name:"synthetic-aadhaar.pdf",mimeType:"application/pdf",buffer:Buffer.from(bytes)};
  };
  let validNumber="";
  for(let i=0;i<10;i++){const candidate="12345678901"+i;if(validAadhaar(candidate)){validNumber=candidate;break;}}
  if(!validNumber)throw new Error("Could not generate a synthetic checksum-valid test number.");

  // Cancellation leaves only in-memory input and must not call customer creation or document APIs.
  await page.locator("#newCustomer").click();
  await page.locator("#ndcSmartScanCustomerHost").waitFor({state:"visible"});
  await page.locator("#ndcSmartScanSection > summary").click();
  await page.locator('[data-slot="combinedAadhaar"] [data-file]').setInputFiles(await makePng(["Name: SAMPLE PERSON","Address: 503001"]));
  await page.locator("#closeDialog").click();
  if(await page.locator("#customerDialog").evaluate(el=>el.open))throw new Error("Customer form did not close after cancellation.");
  if(await page.evaluate(()=>window.__smartScanMock.creates.length||window.__smartScanMock.uploads.length))throw new Error("Cancellation persisted customer data or documents.");

  // Exercise text-based, multi-page combined Aadhaar PDF extraction in the actual upload page.
  await page.locator("#newCustomer").click();
  await page.locator("#ndcSmartScanSection > summary").click();
  const addressLines=["Address:","Door No: 1-2-3","Street: MAIN ROAD","Village: NIZAMABAD","Mandal: Nizamabad","District: Nizamabad","Telangana","PIN: 503001"];
  const idLines=["UIDAI Aadhaar","Name: SAMPLE PERSON","Date of Birth: 01/02/1990","Gender: MALE","Aadhaar No: "+validNumber];
  await page.locator('[data-slot="combinedAadhaar"] [data-file]').setInputFiles(await makePdf(idLines,addressLines));
  await page.locator('[data-slot="combinedAadhaar"] [data-extract]').click();
  await page.waitForFunction(()=>{
    const progress=document.querySelector(".ndc-ss-progress")?.textContent||"";
    return progress.includes("Extraction finished")||progress.includes("OCR failed")||progress.includes("PDF could not")||progress.includes("password-protected");
  },null,{timeout:120000});
  const pdfDiagnostics=await page.evaluate(()=>({
    progress:document.querySelector(".ndc-ss-progress")?.textContent,
    summary:document.querySelector("[data-summary]")?.textContent,
    results:[...document.querySelectorAll("[data-results] > *")].map(el=>el.textContent)
  }));
  if(!pdfDiagnostics.results.some(line=>/customerName:\s*SAMPLE PERSON/i.test(line)))throw new Error("Synthetic PDF did not populate the expected structured customer name: "+JSON.stringify(pdfDiagnostics));
  if(!pdfDiagnostics.results.some(line=>/pincode:\s*503001/i.test(line)))throw new Error("Synthetic PDF did not populate the expected PIN: "+JSON.stringify(pdfDiagnostics));

  // Test separate Aadhaar sides, PAN, Sale Card, conflicts, real field mapping, and manual-value preservation.
  await page.locator('input[name="ndcSmartScanMode"][value="separate"]').check();
  await page.locator("#ndcSmartScanSection > summary").click();
  await page.locator('[data-slot="aadhaarFront"] [data-file]').setInputFiles(await makePng(["UIDAI Aadhaar","Name: SAMPLE PERSON","Date of Birth: 01/02/1990","Gender: MALE","Aadhaar No: "+validNumber]));
  await page.locator('[data-slot="aadhaarBack"] [data-file]').setInputFiles(await makePng(addressLines));
  await page.locator('[data-slot="pan"] [data-file]').setInputFiles(await makePng(["INCOME TAX DEPARTMENT","Name","OTHER PERSON","Father's Name","GUARDIAN SAMPLE","ABCDE1234F","01/02/1990"]));
  await page.locator('[data-slot="salecard"] [data-file]').setInputFiles(await makePng(["Chassis No: 1HGCM82633A004352","Engine No: EN123456","Mobile: 9052691719","Invoice No: INV-123","Financier: HDFC Bank","Ex-showroom price: 100000"]));
  await page.locator("#mobileNumber").fill("9999999999");
  await page.locator('[data-extract-all]').click();
  await page.getByText(/Conflicting customerName/i).waitFor({timeout:120000});
  await page.locator('[data-conflict="customerName"][value="0"]').check();
  page.on("dialog",dialog=>dialog.dismiss());
  await page.locator('[data-autofill]').click();
  await page.waitForFunction(()=>document.getElementById("customerName")?.value==="SAMPLE PERSON");
  const actual=await page.evaluate(()=>Object.fromEntries(["customerName","chassisNumber","engineNumber","mobileNumber","panNumber","aadhaarNumber","houseNumber","villageTown","landmark","districtCode","talukaCode","pincode","stateName","paymentMode","financerName"].map(id=>[id,document.getElementById(id)?.value])));
  if(actual.customerName!=="SAMPLE PERSON"||actual.chassisNumber!=="1HGCM82633A004352"||actual.engineNumber!=="EN123456")throw new Error("Smart Scan did not map identity/vehicle data to actual form controls: "+JSON.stringify(actual));
  if(actual.mobileNumber!=="9999999999")throw new Error("Smart Scan overwrote a manually entered mobile value.");
  if(actual.panNumber!=="ABCDE1234F"||actual.aadhaarNumber.replace(/\s/g,"")!==validNumber)throw new Error("PAN or Aadhaar field mapping failed.");
  if(actual.districtCode!=="533"||actual.talukaCode!=="217"||actual.pincode!=="503001"||actual.stateName!=="Telangana")throw new Error("Dependent state/district/mandal mapping failed: "+JSON.stringify(actual));
  if(actual.paymentMode!=="Finance"||actual.financerName!=="HDFC Bank")throw new Error("Financier dropdown was not matched after payment mode selection.");

  await page.locator("#specialNumberSelection").selectOption("No");
  await page.locator("#ownerCategory").selectOption({index:1});
  await page.locator("#insuranceType").selectOption("4");
  if(await page.evaluate(()=>window.__smartScanMock.uploads.length))throw new Error("Documents uploaded before employee saved the customer.");
  await page.locator('#customerForm button[type="submit"]').click();
  await page.getByText(/Customer was created, but attachments failed/i).waitFor({timeout:30000});
  const createsBeforeRetry=await page.evaluate(()=>window.__smartScanMock.creates.length);
  if(createsBeforeRetry!==1)throw new Error("Expected exactly one customer creation before retry.");
  await page.locator('[data-retry]').click();
  await page.getByText(/Customer created and selected Aadhaar\/PAN documents attached/i).waitFor({timeout:30000});
  await page.locator('#customerForm button[type="submit"]').click();
  await page.waitForFunction(()=>!document.getElementById("customerDialog").open, null,{timeout:30000});
  const finalState=await page.evaluate(()=>({creates:window.__smartScanMock.creates.length,uploads:window.__smartScanMock.uploads}));
  if(finalState.creates!==1)throw new Error("Retry created a duplicate customer.");
  if(!finalState.uploads.every(x=>x.customerId==="synthetic-customer-1"))throw new Error("Attachment retry did not reuse the same customer ID.");
  if(finalState.uploads.some(x=>x.category==="dealer-invoice"))throw new Error("Sale Card was incorrectly attached as a Dealer Invoice.");
  if(!finalState.uploads.some(x=>x.category==="address-proof"&&x.subcategory==="Aadhaar")||!finalState.uploads.some(x=>x.category==="pan-card"))throw new Error("Aadhaar/PAN document attachment slots or Aadhaar category were not used.");
  if(finalState.uploads.some(x=>x.bytes<=0||x.bytes>400000))throw new Error("Smart Scan attachment preparation did not preserve the 400 KB ceiling: "+JSON.stringify(finalState.uploads.map(x=>({category:x.category,bytes:x.bytes}))));

  // Exercise the pre-existing customer document upload and cropper in this same browser session.
  const addressRow=page.locator('.doc-row[data-doc="address-proof"]');
  await addressRow.locator('[data-subcategory]').selectOption("Aadhaar");
  const makePaddedPng=async(name,targetBytes)=>{
    const image=await makePng(["SYNTHETIC DOCUMENT","Aadhaar Address Proof","Nizamabad Telangana 503001"]);
    if(image.buffer.length>targetBytes)throw new Error("Synthetic image unexpectedly exceeds its requested byte test size.");
    const padded=Buffer.alloc(targetBytes);image.buffer.copy(padded);return {name,mimeType:"image/png",buffer:padded};
  };
  const saveExistingDocument=async(file)=>{
    await page.evaluate(({name,mimeType,bytes})=>{
      const row=document.querySelector('.doc-row[data-doc="address-proof"]');
      row._file=new File([Uint8Array.from(bytes)],name,{type:mimeType});
      row._pages=[];
      row.querySelector(".doc-state").textContent="Synthetic test document selected";
      const save=document.querySelector("#customerView .save-bar .primary");
      save.disabled=false;
    },{name:file.name,mimeType:file.mimeType,bytes:[...file.buffer]});
    await page.locator("#customerView .save-bar .primary").click();
    await page.waitForFunction(name=>window.__smartScanMock.uploads.some(x=>x.filename===name),file.name,{timeout:30000});
  };
  const belowLimit=await makePng(["SMALL SYNTHETIC PROOF"]);belowLimit.name="synthetic-below-400000.png";
  await saveExistingDocument(belowLimit);
  const belowCapture=await page.evaluate(name=>window.__smartScanMock.uploads.find(x=>x.filename===name),belowLimit.name);
  if(!belowCapture||belowCapture.bytes!==belowLimit.buffer.length||belowCapture.bytes>=400000)throw new Error("Below-limit document was not preserved by the existing preparation path.");
  await saveExistingDocument(await makePaddedPng("synthetic-exact-400000.png",400000));
  await saveExistingDocument(await makePaddedPng("synthetic-over-400000.png",400001));
  const compression=await page.evaluate(()=>window.__smartScanMock.uploads.filter(x=>/^synthetic-(exact|over)-400000/.test(x.filename||"")));
  if(compression.length!==2||compression[0].bytes!==400000||compression[1].bytes>400000||compression[1].bytes<=0)throw new Error("Existing compression did not handle the exact/over-400KB cases: "+JSON.stringify(compression));

  // Run the pre-existing scan editor after Smart Scan OCR in the same session.
  // The browser runner cannot provide a physical camera, so feed its synthetic capture directly
  // into the existing editor API and separately verify the mobile camera input requests rear capture.
  await page.evaluate(async()=>{
    const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=700;
    const context=canvas.getContext("2d");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle="#111";context.font="bold 44px Arial";context.fillText("SYNTHETIC CAMERA DOCUMENT",40,90);context.fillText("ADDRESS PROOF",40,160);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    const file=new File([blob],"synthetic-camera-capture.png",{type:"image/png"});
    window.__legacyCropResult=window.NDCSmartScan.openEditor({file,category:"address-proof",maxBytes:400000}).then(result=>{window.__legacyCropOutput=result;});
  });
  await page.locator(".ndc-scan-dialog").waitFor({state:"visible",timeout:30000});
  if(!await page.evaluate(()=>window.NDCSmartScan&&window.Tesseract))throw new Error("Existing cropper or independent Smart Scan OCR runtime is not present in the same session.");
  await page.locator('.ndc-scan-dialog [data-action="autocrop"]').click();
  await page.locator('.ndc-scan-dialog [data-action="save"]').click();
  await page.locator(".ndc-scan-dialog").waitFor({state:"detached",timeout:30000});
  await page.waitForFunction(()=>window.__legacyCropOutput?.size>0);
  if(!await addressRow.locator(".doc-state").innerText().then(text=>/Scanned replacement ready|Scanned image ready/.test(text)))throw new Error("Existing auto-crop output was not returned to the document row.");
  if(pageErrors.length)throw new Error("Smart Scan and existing auto-crop generated browser errors: "+JSON.stringify(pageErrors));
  console.log("Desktop customer-form integration passed OCR, attachment retry, compression boundary, and existing auto-crop/camera runtime checks.");
  await context.close();

  // Mobile viewport/touch simulation. The file chooser stands in for a camera picker; it is not a physical-device camera test.
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobilePage=await mobileContext.newPage();
  await mobilePage.addInitScript(({api})=>{
    const state={calls:[],creates:[],uploads:[],customerOCREnabled:true,failPanOnce:false,customer:null};window.__smartScanMock=state;
    const original=window.fetch.bind(window);
    window.fetch=async(input,options={})=>{
      const url=new URL(typeof input==="string"?input:input.url,location.href);if(url.origin!==api)return original(input,options);
      const method=String(options.method||"GET").toUpperCase(),json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
      state.calls.push({path:url.pathname,method});
      if(url.pathname==="/api/cloud/auth/login")return json({token:"mobile-token",expiresAt:Date.now()+3600000,user:{username:"synthetic",cloudAddon:{active:true}}});
      if(url.pathname==="/api/cloud/auth/me")return json({user:{username:"synthetic",cloudAddon:{active:true}},sessionExpiresAt:Date.now()+3600000});
      if(url.pathname==="/api/upload-portal/settings")return json({autoForm20AsInspection:false,smartScanEnabled:false,customerOCREnabled:true});
      if(url.pathname==="/api/upload-portal/customers"&&method==="GET")return json({customers:[]});
      if(url.pathname==="/api/upload-portal/customers"&&method==="POST"){state.creates.push(JSON.parse(options.body||"{}"));return json({customer:{_id:"mobile-customer"}});}
      if(url.pathname.endsWith("/documents/address-proof")||url.pathname.endsWith("/documents/pan-card")){state.uploads.push(url.pathname);return json({success:true});}
      return json({success:true});
    };
  },{api});
  await mobilePage.goto(base+"/upload/index.html");
  await mobilePage.locator("#username").fill("synthetic-dealer");
  await mobilePage.locator("#password").fill("synthetic-password");
  await mobilePage.locator('#loginForm button[type="submit"]').click();
  await mobilePage.locator("#newCustomer").waitFor({state:"visible",timeout:30000});
  await mobilePage.locator("#newCustomer").click();
  await mobilePage.locator("#ndcSmartScanSection > summary").click();
  const cols=await mobilePage.locator(".ndc-ss-files").first().evaluate(el=>getComputedStyle(el).gridTemplateColumns);
  if(cols.split(" ").length!==1)throw new Error("Smart Scan file cards do not collapse to a single mobile column: "+cols);
  const cameraChoice=mobilePage.waitForEvent("filechooser");
  await mobilePage.locator('[data-slot="combinedAadhaar"] [data-camera]').click();
  const chooser=await cameraChoice;
  const mobileBytes=await mobilePage.evaluate(async()=>{
    const c=document.createElement("canvas");c.width=1200;c.height=240;const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.fillStyle="#111";g.font="bold 48px Arial";g.fillText("Name: MOBILE SAMPLE",20,80);g.fillText("Address: 503001",20,160);const b=await new Promise(r=>c.toBlob(r,"image/png"));return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await chooser.setFiles({name:"synthetic-camera.png",mimeType:"image/png",buffer:Buffer.from(mobileBytes)});
  if(await mobilePage.locator('[data-slot="combinedAadhaar"] [data-file]').getAttribute("capture")!=="environment")throw new Error("Camera input did not request the rear camera.");
  await mobilePage.locator('[data-slot="combinedAadhaar"] [data-preview]').click();
  await mobilePage.locator(".ndc-ss-preview").waitFor({state:"visible"});
  await mobilePage.locator(".ndc-ss-preview button").click();
  await mobilePage.locator('[data-slot="combinedAadhaar"] [data-remove]').click();
  if(await mobilePage.locator('[data-slot="combinedAadhaar"] [data-name]').textContent()!=="No file selected")throw new Error("Mobile document removal did not clear the selected preview.");
  await mobilePage.locator('[data-slot="combinedAadhaar"] [data-file]').setInputFiles({name:"synthetic-camera.png",mimeType:"image/png",buffer:Buffer.from(mobileBytes)});
  await mobilePage.locator('[data-extract-all]').click();
  await mobilePage.getByText(/customerName: MOBILE SAMPLE/i).waitFor({timeout:120000});
  await mobilePage.locator("#closeDialog").click();
  if(await mobilePage.evaluate(()=>window.__smartScanMock.creates.length||window.__smartScanMock.uploads.length))throw new Error("Mobile scan persisted customer data before Save.");
  console.log("Mobile viewport/touch emulation passed file selection, camera-picker handoff, preview/removal, OCR, and cancellation. Physical camera hardware was not used.");
  await mobileContext.close();
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
