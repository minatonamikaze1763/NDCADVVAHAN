"use strict";
(() => {
  const API = "https://server.nextdimensioncustoms.in";
  const $ = id => document.getElementById(id);
  const tokenKey = "ndcUploadPortalToken";
  const expiryKey = "ndcUploadPortalExpiresAt";
  let token = sessionStorage.getItem(tokenKey) || "";
  let sessionExpiry = Number(sessionStorage.getItem(expiryKey)) || 0;
  let expiryTimer = null;
  let currentCustomer = null;
  let searchTimer;

  let editingCustomerId = null;
  const categories = [
    ["frontphoto", "Owners Photo with Vehicle"], ["chassis-photo", "Photo of chassis"],
    ["address-proof", "Address Proof"], ["insurance", "Certificate of Insurance"],
    ["dealer-invoice", "Dealers Invoice"], ["form20", "Form 20 (Finance)"],
    ["inspection", "Form 20 (Signed + Chassis)"], ["form22", "Form 22"],
    ["form21", "Form 21"], ["owner-signature", "Owners Signature"],
    ["pan-card", "PAN Card"], ["owner-photo", "Owners Photo"]
  ];
  const addressTypes = ["Aadhaar", "Bank Passbook", "Electricity Bill", "Gas Bill", "Water Bill", "Passport", "Voter ID", "Ration Card", "Telephone Bill", "GST Certificate"];
  const documentDisplayOrder = ["address-proof", "insurance", "dealer-invoice", "form20", "inspection", "form22", "form21", "frontphoto", "owner-photo", "owner-signature", "pan-card", "chassis-photo"];
  const sessionDevice = localStorage.getItem("ndcUploadPortalDeviceId") || crypto.randomUUID();
  localStorage.setItem("ndcUploadPortalDeviceId", sessionDevice);
  function status(el, message, type = "") { el.textContent = message; el.className = `status ${type}`; }
  function setSaveBarrier(active) {
    const barrier = $("saveBarrier");
    if (!barrier) return;
    barrier.hidden = !active;
    document.body.classList.toggle("save-active", active);
    if (active) barrier.focus({preventScroll:true});
  }
  function clearClientSession() {
    clearTimeout(expiryTimer);
    expiryTimer = null;
    sessionExpiry = 0;
    token = "";
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(expiryKey);
  }
  function expireSession(message = "Your 24-hour session has expired. Sign in again to continue.") {
    clearClientSession();
    currentCustomer = null;
    if ($("customerDialog").open) $("customerDialog").close();
    $("password").value = "";
    showLogin();
    status($("loginStatus"), message, "error");
  }
  function saveSessionExpiry(value) {
    const expiresAt = typeof value === "number" ? value : Date.parse(value || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearClientSession();
      return false;
    }
    sessionExpiry = expiresAt;
    sessionStorage.setItem(expiryKey, String(expiresAt));
    clearTimeout(expiryTimer);
    const checkExpiry = () => {
      const remaining = sessionExpiry - Date.now();
      if (remaining <= 0) expireSession();
      else expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
    };
    expiryTimer = setTimeout(checkExpiry, Math.min(expiresAt - Date.now(), 2147483647));
    return true;
  }
  async function request(path, options = {}, binary = false) {
    if (token && sessionExpiry && Date.now() >= sessionExpiry) {
      expireSession();
      throw new Error("Your 24-hour session has expired. Sign in again to continue.");
    }
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(API + path, { ...options, headers });
    const type = response.headers.get("content-type") || "";
    if (!response.ok) {
      const data = type.includes("application/json") ? await response.json().catch(() => ({})) : null;
      if (response.status === 401 || response.status === 403) expireSession("Your session is no longer valid. Sign in again to continue.");
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }
    return binary ? response.blob() : type.includes("application/json") ? response.json() : null;
  }
  const MAX_UPLOAD_BYTES = 400000;
  const MAX_FORM20_UPLOAD_BYTES = 390 * 1024;
  function uploadLimit(category) { return category === "form20" ? MAX_FORM20_UPLOAD_BYTES : MAX_UPLOAD_BYTES; }
  async function prepareUploadFile(file, category) {
    const targetBytes = uploadLimit(category);
    const name = String(file.name || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name);
    if (isPdf) return file.size > targetBytes ? compressUploadPdf(file, targetBytes) : file;
    if (isImage) return file.size > targetBytes ? compressUploadImage(file, targetBytes) : file;
    throw new Error("Only PDF, JPEG, PNG, or WebP documents are supported.");
  }
  async function compressUploadImage(file, targetBytes) {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error("Image could not be decoded for compression."); }
    try {
      let width = bitmap.width, height = bitmap.height;
      const maxDimension = 2200;
      if (Math.max(width, height) > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      let bestBlob = null;
      for (let resizeAttempt = 0; resizeAttempt < 8; resizeAttempt++) {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d", {alpha:false});
        if (!context) throw new Error("Could not create the image compression canvas.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        for (let quality = 0.88; quality >= 0.28; quality -= 0.1) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", Math.max(0.2, quality)));
          if (!blob) continue;
          if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
          if (blob.size <= targetBytes) return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {type:"image/jpeg",lastModified:file.lastModified});
        }
        width = Math.max(1, Math.round(width * 0.78));
        height = Math.max(1, Math.round(height * 0.78));
      }
      if (bestBlob && bestBlob.size < file.size && bestBlob.size <= targetBytes) {
        return new File([bestBlob], file.name.replace(/\.[^.]+$/, ".jpg"), {type:"image/jpeg",lastModified:file.lastModified});
      }
      throw new Error("Could not compress this image below the VAHAN file-size limit.");
    } finally { bitmap.close?.(); }
  }
  async function compressUploadPdf(file, targetBytes) {
    const pdfjs = window.pdfjsLib;
    const jsPDF = window.jspdf?.jsPDF;
    if (!pdfjs?.getDocument || !jsPDF) throw new Error("PDF preparation libraries could not be loaded. Refresh the page and try again.");
    const sourcePdf = await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:false,isEvalSupported:false,disableWorker:true}).promise;
    const attempts = [
      {scale:1.5,quality:0.7},{scale:1.3,quality:0.6},{scale:1.1,quality:0.5},
      {scale:0.9,quality:0.42},{scale:0.75,quality:0.35}
    ];
    try {
      for (const attempt of attempts) {
        const output = new jsPDF({orientation:"portrait",unit:"pt",format:"a4",compress:true,putOnlyUsedFonts:true});
        for (let pageNumber=1;pageNumber<=sourcePdf.numPages;pageNumber++) {
          const page = await sourcePdf.getPage(pageNumber);
          const originalViewport = page.getViewport({scale:1});
          const dimensionScale = Math.min(1,2200/Math.max(originalViewport.width,originalViewport.height));
          const viewport = page.getViewport({scale:attempt.scale*dimensionScale});
          const canvas = document.createElement("canvas");
          canvas.width=Math.max(1,Math.ceil(viewport.width)); canvas.height=Math.max(1,Math.ceil(viewport.height));
          const context=canvas.getContext("2d",{alpha:false});
          if (!context) throw new Error("Could not create a PDF rendering canvas.");
          context.fillStyle="#ffffff"; context.fillRect(0,0,canvas.width,canvas.height);
          try {
            await page.render({canvasContext:context,viewport,background:"#ffffff"}).promise;
            const jpegBlob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not encode a PDF page.")),"image/jpeg",attempt.quality));
            const imageData=await blobToDataUrl(jpegBlob);
            if (pageNumber>1) output.addPage("a4","portrait");
            const pageWidth=output.internal.pageSize.getWidth(), pageHeight=output.internal.pageSize.getHeight();
            const ratio=Math.min(pageWidth/canvas.width,pageHeight/canvas.height);
            const width=canvas.width*ratio, height=canvas.height*ratio;
            output.addImage(imageData,"JPEG",(pageWidth-width)/2,(pageHeight-height)/2,width,height,undefined,"FAST");
          } finally { canvas.width=0; canvas.height=0; page.cleanup(); }
        }
        const blob=output.output("blob");
        if (blob.size<=targetBytes) return new File([blob],file.name,{type:"application/pdf",lastModified:Date.now()});
      }
    } finally { await sourcePdf.destroy(); }
    throw new Error("This PDF could not be prepared below " + Math.ceil(targetBytes / 1024) + " KB. Try a clearer scan with fewer pages.");
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve,reject) => {
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error("Could not read a prepared document page."));
      reader.readAsDataURL(blob);
    });
  }
  function showLogin() { $("loginView").hidden = false; $("appView").hidden = true; $("logout").hidden = true; $("settingsToggle").hidden = true; }
  function showApp() { $("loginView").hidden = true; $("appView").hidden = false; $("logout").hidden = false; $("settingsToggle").hidden = false; }
  async function loadSettings() {
    const data = await request("/api/upload-portal/settings");
    $("retentionDays").value = String(data.retentionDays || 20);
  }
  function showWorkspace() {
    $("settingsView").hidden = true;
    $("customerResults").closest(".search-card").hidden = false;
    $("appView").querySelector(".intro").hidden = false;
    if (currentCustomer) $("customerView").hidden = false;
    $("settingsToggle").textContent = "Settings";
  }
  async function showSettings() {
    $("settingsView").hidden = false;
    $("customerResults").closest(".search-card").hidden = true;
    $("customerView").hidden = true;
    $("appView").querySelector(".intro").hidden = true;
    $("settingsToggle").textContent = "Workspace";
    try { await loadSettings(); status($("settingsStatus"), ""); }
    catch (error) { status($("settingsStatus"), error.message, "error"); }
  }
  $("settingsToggle").addEventListener("click", () => $("settingsView").hidden ? showSettings() : showWorkspace());
  $("backToWorkspace").addEventListener("click", showWorkspace);
  $("saveRetention").addEventListener("click", async () => {
    const button = $("saveRetention"); button.disabled = true; status($("settingsStatus"), "Saving setting…");
    try {
      const data = await request("/api/upload-portal/settings", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({retentionDays:Number($("retentionDays").value)})});
      status($("settingsStatus"), data.message || "Document retention updated.", "success");
    } catch (error) { status($("settingsStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  async function validate() {
    if (!token) return showLogin();
    if (sessionExpiry && Date.now() >= sessionExpiry) return expireSession();
    try {
      const data = await request("/api/auth/me");
      if (!saveSessionExpiry(data.sessionExpiresAt)) return expireSession();
      showApp();
      await searchCustomers("");
    } catch { showLogin(); }
  }
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    status($("loginStatus"), "Signing in…");
    try {
      const data = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value, deviceId: sessionDevice }) });
      token = data.token;
      sessionStorage.setItem(tokenKey, token);
      if (!saveSessionExpiry(data.expiresAt)) throw new Error("The server did not return a valid 24-hour session expiry.");
      $("password").value = ""; showApp(); await searchCustomers("");
      status($("loginStatus"), "Signed in. Your session is valid for up to 24 hours.", "success");
    } catch (error) { status($("loginStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  $("settingsView").hidden = true;
  $("logout").addEventListener("click", async () => { try { await request("/api/auth/logout", { method: "POST" }); } catch {} clearClientSession(); currentCustomer = null; $("customerView").hidden = true; showLogin(); });
  $("newCustomer").addEventListener("click", () => { editingCustomerId = null; $("customerForm").reset(); $("dialogEyebrow").textContent = "NEW CUSTOMER"; $("dialogTitle").textContent = "Create customer"; $("customerForm").querySelector("button[type=submit]").textContent = "Create customer"; status($("createStatus"), ""); $("customerDialog").showModal(); });
  $("closeDialog").addEventListener("click", () => $("customerDialog").close());
  $("customerForm").addEventListener("submit", async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; status($("createStatus"), editingCustomerId ? "Saving customer…" : "Creating customer…");
    try {
      const body = JSON.stringify({ chassisNumber: $("chassisNumber").value, customerName: $("customerName").value, address: $("address").value, hp: $("hp").value, applicationNumber: $("applicationNumber").value });
      const id = editingCustomerId;
      const data = await request(id ? `/api/upload-portal/customers/${id}` : "/api/upload-portal/customers", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body });
      $("customerDialog").close(); if (id) await openCustomer(id); else await openCustomer(data.customer._id); await searchCustomers($("search").value);
    } catch (error) { status($("createStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  $("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchCustomers($("search").value), 250); });
  async function searchCustomers(query) {
    try {
      const data = await request(`/api/upload-portal/customers?q=${encodeURIComponent(query)}`);
      const host = $("customerResults"); host.replaceChildren();
      data.customers.forEach(customer => {
        const button = document.createElement("button"); button.type = "button"; button.className = "result-row";
        const title = document.createElement("span"); title.textContent = customer.customerName; const meta = document.createElement("small"); meta.textContent = `${customer.chassisNumber} · ${Object.keys(customer.documents || {}).length} documents saved`;
        const right = document.createElement("span"); right.append(title, meta); const arrow = document.createElement("b"); arrow.textContent = "›"; button.append(right, arrow); button.addEventListener("click", () => openCustomer(customer._id)); host.append(button);
      });
      status($("searchStatus"), data.customers.length ? `${data.customers.length} customer${data.customers.length === 1 ? "" : "s"} found.` : query ? "No matching customer found." : "Create a customer to start uploading.");
    } catch (error) { status($("searchStatus"), error.message, "error"); }
  }
  function safeFileInput(category, isCamera) {
    const input = document.createElement("input"); input.type = "file"; input.accept = isCamera ? "image/*" : "image/*,.pdf"; if (isCamera) input.capture = "environment";
    input.addEventListener("change", () => {
      const row = document.querySelector(`[data-doc="${category}"]`); row._file = input.files?.[0] || null;
      row.querySelector(".doc-state").textContent = row._file ? row._file.name : "Not selected"; updateFileDetails(row, row._file); setPreview(row._selectedPreview, row._file, "Selected");
    });
    input.click();
  }
  function capturePhotoFromDefaultCamera() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      let settled = false;
      const finish = file => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file || null);
      };
      input.addEventListener("change", () => finish(input.files?.[0]), {once:true});
      input.addEventListener("cancel", () => finish(null), {once:true});
      input.click();
    });
  }
  function addNativeMultiPhotoCapture(actions, row, {labels, documentName, saveLabel, onSave}) {
    const photos = Array(labels.length).fill(null);
    const captureButtons = [];
    const progress = document.createElement("p");
    progress.className = "status native-capture-status";
    progress.setAttribute("role", "status");
    progress.textContent = `Capture ${labels.length} photos to create the ${documentName} PDF.`;
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary full native-capture-save";
    save.textContent = saveLabel;
    save.disabled = true;
    const update = () => {
      const captured = photos.filter(Boolean).length;
      captureButtons.forEach((button, index) => {
        button.disabled = saving;
        button.textContent = photos[index] ? `Retake ${labels[index]}` : `Capture ${labels[index]}`;
      });
      save.disabled = saving || saved || captured !== photos.length;
      if (saved) {
        save.textContent = "PDF saved";
        progress.textContent = `${documentName} PDF saved successfully.`;
      } else {
        save.textContent = saveLabel;
        progress.textContent = captured === photos.length
          ? `All ${captured} photos captured. Combine and save the PDF.`
          : `${captured} of ${photos.length} photos captured.`;
      }
    };
    let saving = false;
    let saved = false;
    labels.forEach((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary native-capture-page";
      button.textContent = `Capture ${label}`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = `Opening camera for ${label}…`;
        try {
          const photo = await capturePhotoFromDefaultCamera();
          if (!photo) {
            progress.textContent = `No photo selected for ${label}. You can try again.`;
            return;
          }
          photos[index] = photo;
          saved = false;
          update();
        } catch (error) {
          progress.textContent = error.message || `Could not capture ${label}. Try again.`;
        } finally {
          if (!saving) button.disabled = false;
        }
      });
      captureButtons.push(button);
      actions.append(button);
    });
    save.addEventListener("click", async () => {
      if (saving || saved || photos.some(photo => !photo)) return;
      saving = true;
      update();
      try {
        await onSave(photos.slice(), progress);
        saved = true;
      } catch (error) {
        progress.textContent = error.message || `Could not save the ${documentName} PDF. Try again.`;
      } finally {
        saving = false;
        update();
      }
    });
    actions.append(save, progress);
    row._nativeCameraPhotos = photos;
    update();
  }
  async function photoAsJpeg(file, targetBytes) {
    const bitmap = await createImageBitmap(file);
    try {
      let width = bitmap.width, height = bitmap.height;
      const maxDimension = 2200, longest = Math.max(width, height);
      if (longest > maxDimension) { const scale = maxDimension / longest; width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale)); }
      let best = null;
      for (let resizeAttempt = 0; resizeAttempt < 8; resizeAttempt++) {
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d", {alpha:false});
        if (!context) throw new Error("Could not prepare the camera photo.");
        context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
        for (let quality = .88; quality >= .28; quality -= .1) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", Math.max(.2, quality)));
          if (!blob) continue;
          if (!best || blob.size < best.size) best = blob;
          if (blob.size <= targetBytes) return {bytes:new Uint8Array(await blob.arrayBuffer()), width, height};
        }
        width = Math.max(1, Math.round(width * .78)); height = Math.max(1, Math.round(height * .78));
      }
      if (best && best.size <= targetBytes) { const last = await createImageBitmap(best); try { return {bytes:new Uint8Array(await best.arrayBuffer()),width:last.width,height:last.height}; } finally { last.close?.(); } }
      throw new Error("Could not compress the captured photo within the VAHAN file-size limit.");
    } finally { bitmap.close?.(); }
  }
  async function imagePagesPdf(pages) {
    const jsPDF = window.jspdf?.jsPDF;
    if (typeof jsPDF !== "function") throw new Error("The browser PDF library did not load. Refresh the page and try again.");
    const output = new jsPDF({orientation:"portrait",unit:"pt",format:"a4",compress:true,putOnlyUsedFonts:true});
    for (let index = 0; index < pages.length; index++) {
      const image = pages[index];
      if (index > 0) output.addPage("a4", "portrait");
      const pageWidth = output.internal.pageSize.getWidth();
      const pageHeight = output.internal.pageSize.getHeight();
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const width = image.width * scale, height = image.height * scale;
      const dataUrl = await blobToDataUrl(new Blob([image.bytes], {type:"image/jpeg"}));
      output.addImage(dataUrl, "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
    }
    return output.output("blob");
  }
  async function createCapturedPhotoPdf(photos, filename, targetBytes, documentName) {
    let imageBudget = Math.floor((targetBytes - 16 * 1024) / photos.length);
    for (let attempt = 0; attempt < 6 && imageBudget > 0; attempt++) {
      const pages = [];
      for (const photo of photos) pages.push(await photoAsJpeg(photo, imageBudget));
      const pdf = await imagePagesPdf(pages);
      if (pdf.size <= targetBytes) return new File([pdf], filename, {type:"application/pdf", lastModified:Date.now()});
      imageBudget = Math.floor(imageBudget * .8);
    }
    throw new Error("The " + documentName + " photos could not be combined below the VAHAN size limit. Retake the photos in good light and try again.");
  }
  function updateSavedDocumentRow(customer, host, row, category, saved) {
    customer.documents = {...(customer.documents || {}), [category]:saved};
    currentCustomer = customer;
    row._file = null;
    row._pages = [];
    const state = row.querySelector(".doc-state");
    state.textContent = "Saved · " + saved.filename;
    state.classList.add("saved");
    const selector = row.querySelector("[data-subcategory]");
    const actions = row.querySelector(".doc-actions");
    row.querySelector(".preview-pair")?.remove();
    row.querySelector(".file-details")?.remove();
    selector?.remove();
    actions?.remove();
    addPreviewPair(row, customer, category, saved);
    if (selector) row.append(selector);
    if (actions) row.append(actions);
    const savedCount = Object.keys(customer.documents).length;
    const count = host.querySelector(".doc-toolbar .muted");
    if (count) count.textContent = savedCount + " of 12 saved";
    host.querySelectorAll(".zip-download,.zip-share").forEach(button => { button.disabled = savedCount === 0; });
  }
  async function saveCapturedForm20(customer, host, row, photos, progress) {
    status(progress, "Combining the Form 20 photos into one PDF…");
    const file = await createCapturedPhotoPdf(photos, safeFilenamePart(customer.customerName) + "_form20.pdf", MAX_FORM20_UPLOAD_BYTES, "Form 20");
    const preparedFile = await prepareUploadFile(file, "form20");
    const result = await request("/api/upload-portal/customers/" + customer._id + "/documents/form20", {
      method:"PUT",
      headers:{"Content-Type":"application/octet-stream","X-NDC-Original-Type":"application/pdf","X-NDC-Upload-Type":preparedFile.type || file.type,"X-NDC-Original-Filename":file.name,"X-NDC-Original-Size":String(file.size),"X-NDC-Original-Last-Modified":String(file.lastModified || Date.now())},
      body:preparedFile
    });
    const saved = {...result,contentType:"application/pdf",subcategory:null,uploadedAt:new Date().toISOString(),modifiedAt:result.originalLastModified || new Date().toISOString()};
    updateSavedDocumentRow(customer, host, row, "form20", saved);
    await searchCustomers($("search").value);
    status($("saveStatus"), "Form 20 saved as one PDF. Continue with the next document.", "success");
  }
  async function saveCapturedAadhaar(customer, host, row, photos, progress) {
    status(progress, "Combining Aadhaar front and back into one PDF…");
    const file = await createCapturedPhotoPdf(photos, safeFilenamePart(customer.customerName) + "_aadhaar_front_back.pdf", 380000, "Aadhaar front and back");
    const preparedFile = await prepareUploadFile(file, "address-proof");
    const result = await request("/api/upload-portal/customers/" + customer._id + "/documents/address-proof", {
      method:"PUT",
      headers:{"Content-Type":"application/octet-stream","X-NDC-Original-Type":"application/pdf","X-NDC-Upload-Type":preparedFile.type || file.type,"X-NDC-Original-Filename":file.name,"X-NDC-Original-Size":String(file.size),"X-NDC-Original-Last-Modified":String(file.lastModified || Date.now()),"X-NDC-Subcategory":"Aadhaar"},
      body:preparedFile
    });
    result.subcategory = "Aadhaar";
    result.uploadedAt = new Date().toISOString();
    updateSavedDocumentRow(customer, host, row, "address-proof", result);
    await searchCustomers($("search").value);
    status($("saveStatus"), "Aadhaar front and back saved together as one PDF. Continue with the next document.", "success");
  }
  function safeFilenamePart(value) { return String(value || "customer").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "customer"; }
  function classifyFile(name) {
    return globalThis.NDCDocumentMatcher?.match(name)?.id || "";
  }
  async function showFullscreenPreview(file) {
    if (!file) return;
    const isImage = file.type?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name || "");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isImage && !isPdf) return;
    const overlay = document.createElement("div");
    overlay.className = "fullscreen-preview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `Preview ${file.name || "document"}`);
    const panel = document.createElement("section");
    panel.className = "fullscreen-preview-panel";
    const header = document.createElement("header");
    header.className = "fullscreen-preview-header";
    const fileInfo = document.createElement("div");
    fileInfo.className = "fullscreen-preview-file";
    const title = document.createElement("strong");
    title.className = "fullscreen-preview-title";
    title.textContent = file.name || "Document preview";
    const metadata = document.createElement("span");
    metadata.className = "fullscreen-preview-meta";
    metadata.textContent = `${readableSize(file.size)} · ${isPdf ? "PDF document" : "Image"}`;
    fileInfo.append(title, metadata);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "fullscreen-preview-close";
    close.textContent = "Close";
    close.setAttribute("aria-label", "Close preview");
    const toolbar = document.createElement("div");
    toolbar.className = "fullscreen-preview-toolbar";
    const zoomControls = document.createElement("div");
    zoomControls.className = "preview-control-group";
    const makeButton = (label, labelTitle, handler, extraClass = "") => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `preview-tool-button ${extraClass}`.trim();
      button.textContent = label;
      button.title = labelTitle;
      button.addEventListener("click", handler);
      return button;
    };
    let zoom = 1, fitScale = 1, pdfDocument = null, loadingTask = null, renderTask = null, renderSequence = 0, pageNumber = 1, closed = false, image = null, imageUrl = "";
    const zoomValue = document.createElement("span");
    zoomValue.className = "preview-zoom-value";
    zoomValue.setAttribute("aria-live", "polite");
    const updateZoomLabel = () => { zoomValue.textContent = `${Math.round(zoom * 100)}%`; };
    const stage = document.createElement("div");
    stage.className = "fullscreen-preview-stage";
    const body = document.createElement("div");
    body.className = "fullscreen-preview-body";
    body.setAttribute("role", "region");
    body.setAttribute("aria-label", "Document preview");
    const pageControls = document.createElement("div");
    pageControls.className = "preview-control-group preview-page-controls";
    const pageValue = document.createElement("span");
    pageValue.className = "preview-page-value";
    pageValue.setAttribute("aria-live", "polite");
    const previousPage = makeButton("‹", "Previous page", () => { if (pageNumber > 1) { pageNumber--; updatePageControls(); void renderPdfPage(); } });
    const nextPage = makeButton("›", "Next page", () => { if (pdfDocument && pageNumber < pdfDocument.numPages) { pageNumber++; updatePageControls(); void renderPdfPage(); } });
    const updatePageControls = () => {
      pageValue.textContent = pdfDocument ? `${pageNumber} / ${pdfDocument.numPages}` : "Loading PDF…";
      previousPage.disabled = !pdfDocument || pageNumber <= 1;
      nextPage.disabled = !pdfDocument || pageNumber >= pdfDocument.numPages;
    };
    if (!isPdf) pageControls.hidden = true;
    const updateImageSize = () => {
      if (!image?.naturalWidth || closed) return;
      const w = Math.max(120, body.clientWidth - 44), h = Math.max(120, body.clientHeight - 44);
      fitScale = Math.min(1, w / image.naturalWidth, h / image.naturalHeight);
      image.style.width = `${Math.max(1, image.naturalWidth * fitScale * zoom)}px`;
      image.style.height = `${Math.max(1, image.naturalHeight * fitScale * zoom)}px`;
    };
    const renderPdfPage = async () => {
      if (!pdfDocument || closed) return;
      const sequence = ++renderSequence;
      if (renderTask) { try { renderTask.cancel(); } catch {} renderTask = null; }
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (closed || sequence !== renderSequence) return;
        const initial = page.getViewport({scale:1});
        const w = Math.max(120, body.clientWidth - 44), h = Math.max(120, body.clientHeight - 44);
        fitScale = Math.min(1, w / initial.width, h / initial.height);
        const viewport = page.getViewport({scale:fitScale * zoom});
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        canvas.className = "custom-pdf-page";
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d", {alpha:false});
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        stage.replaceChildren(canvas);
        const task = page.render({canvasContext:context, viewport, transform:outputScale === 1 ? null : [outputScale,0,0,outputScale,0,0]});
        renderTask = task;
        await task.promise;
        if (sequence === renderSequence) renderTask = null;
      } catch (error) {
        if (error?.name === "RenderingCancelledException" || closed || sequence !== renderSequence) return;
        const message = document.createElement("p");
        message.className = "preview-error";
        message.textContent = "This PDF could not be displayed. It may be damaged or password protected.";
        stage.replaceChildren(message);
      }
    };
    const setZoom = next => {
      zoom = Math.min(4, Math.max(.25, Math.round(next * 20) / 20));
      updateZoomLabel();
      if (isImage) updateImageSize();
      else if (pdfDocument) void renderPdfPage();
    };
    zoomControls.append(
      makeButton("−", "Zoom out", () => setZoom(zoom - .15)),
      zoomValue,
      makeButton("+", "Zoom in", () => setZoom(zoom + .15)),
      makeButton("Fit", "Fit document to preview", () => setZoom(1), "preview-fit-button")
    );
    pageControls.prepend(previousPage);
    pageControls.append(pageValue, nextPage);
    const hint = document.createElement("span");
    hint.className = "preview-zoom-hint";
    hint.textContent = "Scroll or Ctrl + scroll to zoom";
    toolbar.append(zoomControls, pageControls, hint);
    body.append(stage);
    header.append(fileInfo, close);
    panel.append(header, toolbar, body);
    overlay.append(panel);
    const previousFocus = document.activeElement;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (renderTask) { try { renderTask.cancel(); } catch {} }
      if (loadingTask) void loadingTask.destroy().catch(() => {});
      if (pdfDocument) void pdfDocument.destroy().catch(() => {});
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      if (previousFocus instanceof HTMLElement) previousFocus.focus({preventScroll:true});
    };
    const onKeyDown = event => {
      if (event.key === "Escape") cleanup();
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom(zoom + .15); }
      else if (event.key === "-") { event.preventDefault(); setZoom(zoom - .15); }
      else if (event.key === "0") { event.preventDefault(); setZoom(1); }
      else if (event.key === "ArrowLeft" && isPdf && pageNumber > 1) { pageNumber--; updatePageControls(); void renderPdfPage(); }
      else if (event.key === "ArrowRight" && isPdf && pdfDocument && pageNumber < pdfDocument.numPages) { pageNumber++; updatePageControls(); void renderPdfPage(); }
    };
    const onResize = () => { if (isImage) updateImageSize(); else if (pdfDocument) void renderPdfPage(); };
    const onWheel = event => { event.preventDefault(); if (event.deltaY) setZoom(zoom + (event.deltaY < 0 ? .1 : -.1)); };
    close.addEventListener("click", cleanup);
    overlay.addEventListener("click", event => { if (event.target === overlay) cleanup(); });
    body.addEventListener("wheel", onWheel, {passive:false});
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    document.body.append(overlay);
    updateZoomLabel();
    updatePageControls();
    if (isImage) {
      imageUrl = URL.createObjectURL(file);
      image = document.createElement("img");
      image.className = "custom-image-page";
      image.alt = file.name || "Image preview";
      image.addEventListener("load", updateImageSize, {once:true});
      image.addEventListener("error", () => {
        const message = document.createElement("p");
        message.className = "preview-error";
        message.textContent = "This image could not be displayed.";
        stage.replaceChildren(message);
      }, {once:true});
      stage.replaceChildren(image);
      image.src = imageUrl;
    } else {
      const pdfjs = globalThis.pdfjsLib;
      if (!pdfjs?.getDocument) stage.textContent = "The custom PDF viewer could not be loaded. Refresh the page and try again.";
      else {
        pdfjs.GlobalWorkerOptions.workerSrc = "/upload/vendor/pdf.worker.min.js?v=3.11.174";
        try {
          const data = await file.arrayBuffer();
          if (closed) return;
          loadingTask = pdfjs.getDocument({data});
          pdfDocument = await loadingTask.promise;
          if (closed) return;
          updatePageControls();
          await renderPdfPage();
        } catch (error) {
          if (closed) return;
          const message = document.createElement("p");
          message.className = "preview-error";
          message.textContent = "This PDF could not be opened. It may be damaged or password protected.";
          stage.replaceChildren(message);
        }
      }
    }
    if (!closed) close.focus();
  }

  async function renderPdfThumbnail(file, button, mark, hint) {
    const pdfjs = window.pdfjsLib;
    if (!pdfjs || typeof pdfjs.getDocument !== "function") return;
    let loadingTask, pdf;
    try {
      loadingTask = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWorkerFetch:false,isEvalSupported:false,disableWorker:true});
      pdf = await loadingTask.promise;
      const page = await pdf.getPage(1), base = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(220 / base.width,112 / base.height)});
      const canvas = document.createElement("canvas"); canvas.className = "pdf-preview-canvas";
      canvas.width = Math.max(1,Math.ceil(viewport.width)); canvas.height = Math.max(1,Math.ceil(viewport.height)); canvas.setAttribute("aria-hidden","true");
      const context = canvas.getContext("2d",{alpha:false}); if (!context) return;
      context.fillStyle = "#fff"; context.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:context,viewport,background:"#fff"}).promise;
      if (button.isConnected) { mark.hidden = true; hint.textContent = "Page 1 · Open full preview"; button.insertBefore(canvas,hint); }
      page.cleanup();
    } catch (_) { hint.textContent = "Open PDF preview"; }
    finally { if (pdf) await pdf.destroy().catch(()=>{}); else if (loadingTask) await loadingTask.destroy().catch(()=>{}); }
  }
  function setPreview(box, file, label) {
    if (box._url) URL.revokeObjectURL(box._url);
    box.replaceChildren();
    const tag = document.createElement("span"); tag.className = "file-preview-title"; tag.textContent = label; box.append(tag);
    if (!file) { const empty = document.createElement("span"); empty.className = "file-preview-label"; empty.textContent = label === "Selected" ? "No file selected" : "No saved file"; box.append(empty); return; }
    const isImage = file.type?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name || "");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (isImage) {
      const url = URL.createObjectURL(file); box._url = url;
      const image = document.createElement("img"); image.src = url; image.alt = file.name || "Document preview"; image.className = "file-preview-thumb"; image.addEventListener("click", () => showFullscreenPreview(file)); box.append(image);
    } else if (isPdf) {
      const pdfButton = document.createElement("button"); pdfButton.type = "button"; pdfButton.className = "pdf-preview-thumb"; pdfButton.setAttribute("aria-label", `Preview PDF ${file.name || ""} · ${readableSize(file.size)}`);
      const mark = document.createElement("span"); mark.className = "pdf-preview-mark"; mark.textContent = "PDF";
      const hint = document.createElement("span"); hint.className = "pdf-preview-hint"; hint.textContent = "Loading first page…";
      pdfButton.append(mark, hint); pdfButton.addEventListener("click", () => showFullscreenPreview(file)); box.append(pdfButton);
      void renderPdfThumbnail(file, pdfButton, mark, hint);
    } else {
      const unsupported = document.createElement("span"); unsupported.className = "file-preview-label"; unsupported.textContent = "Preview unavailable"; box.append(unsupported);
    }
    const name = document.createElement("span"); name.className = "file-preview-label"; name.textContent = file.name || "Document"; box.append(name);
    const size = document.createElement("span"); size.className = "file-preview-size"; size.textContent = readableSize(file.size); box.append(size);
    const full = document.createElement("button"); full.type = "button"; full.className = "preview-fullscreen"; full.textContent = "Open preview"; full.addEventListener("click", () => showFullscreenPreview(file)); box.append(full);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.rel = "noopener";
    anchor.style.position = "fixed"; anchor.style.left = "-9999px"; document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function readableSize(value) { const n = Number(value); if (!Number.isFinite(n) || n < 0) return "—"; if (n < 1024) return `${n} B`; if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }
  function formatModifiedDate(saved) {
    const value = saved?.originalLastModified ?? saved?.modifiedAt ?? saved?.uploadedAt;
    if (value === undefined || value === null || value === "") return "Date unavailable";
    const date = value instanceof Date ? value : typeof value === "number" || /^\\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
  }
  function addModifiedLabel(row, saved) {
    if (!saved) { row.querySelector(".doc-modified")?.remove(); return; }
    let label = row.querySelector(".doc-modified");
    if (!label) { label = document.createElement("p"); label.className = "doc-modified"; label.setAttribute("aria-label", "Document modified time"); }
    label.textContent = `Modified · ${formatModifiedDate(saved)}`;
    row.querySelector(".doc-state")?.insertAdjacentElement("afterend", label);
  }
  function addFileDetails(row, saved) {
    const details = document.createElement("dl"); details.className = "file-details";
    const entries = [["Original filename", saved?.originalFilename || "—"], ["Original size", readableSize(saved?.originalSize)], ["Saved filename", saved?.filename || "—"], ["Saved size", readableSize(saved?.size)], ["Modified", formatModifiedDate(saved)]];
    for (const [label, value] of entries) { const wrap = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd"); dd.dataset.detail = label; dd.textContent = value; wrap.append(dt, dd); details.append(wrap); }
    row.append(details); row._fileDetails = details;
  }
  function addPreviewPair(row, customer, category, saved) {
    const pair = document.createElement("div"); pair.className = "preview-pair";
    const selected = document.createElement("div"); selected.className = "file-preview"; setPreview(selected, null, "Selected");
    const stored = document.createElement("div"); stored.className = "file-preview";
    if (saved) {
      const tag = document.createElement("span"); tag.className = "file-preview-title"; tag.textContent = "Saved";
      const open = document.createElement("button"); open.type = "button"; open.className = "preview-open";
      const openIcon = document.createElement("span"); openIcon.className = "preview-open-icon"; openIcon.textContent = "↗"; openIcon.setAttribute("aria-hidden", "true");
      const openLabel = document.createElement("span"); openLabel.className = "preview-open-label"; openLabel.textContent = "Preview saved file";
      open.append(openIcon, openLabel);
      open.addEventListener("click", async () => {
        open.disabled = true;
        try { const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, {}, true); const savedFile = new File([blob], saved.filename, {type:saved.contentType || blob.type}); setPreview(stored, savedFile, "Saved"); showFullscreenPreview(savedFile); }
        catch(error) { openLabel.textContent = "Preview unavailable"; open.title = error.message; }
        finally { open.disabled = false; }
      });
      stored.append(tag, open);
    } else setPreview(stored, null, "Saved");
    pair.append(selected, stored); row.append(pair); addModifiedLabel(row, saved); row._selectedPreview = selected; addFileDetails(row, saved);
  }
  function queueFiles(files, host) {
    const queue = host.querySelector(".bulk-queue");
    const messages = [];
    for (const file of files) {
      const category = classifyFile(file.name);
      let assigned = "Unmatched";
      if (category === "form20") {
        const row = host.querySelector('[data-doc="form20"]');
        if (row && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) { row._file = file; row._pages = []; row.querySelector(".doc-state").textContent = `${file.name} → Form 20`; updateFileDetails(row, file); setPreview(row._selectedPreview, file, "Selected"); assigned = "Form 20"; }
        else if (row && file.type.startsWith("image/")) { row._pages = [...(row._pages || []), file]; row._file = null; row.querySelector(".doc-state").textContent = `${row._pages.length} photos selected · Form 20`; if (row._pages.length === 1) { updateFileDetails(row, file); setPreview(row._selectedPreview, file, "Selected"); } assigned = "Form 20 photos"; }
      } else if (category) {
        const row = host.querySelector(`[data-doc="${category}"]`);
        if (row && !row._file) { row._file = file; row.querySelector(".doc-state").textContent = file.name; updateFileDetails(row, file); if (row._selectedPreview) setPreview(row._selectedPreview, file, "Selected"); assigned = row.querySelector("h3").textContent; }
        else if (row) assigned = "Already has a file; choose another document row";
      }
      const item = document.createElement("div"); item.className = "bulk-file";
      const name = document.createElement("span"); name.textContent = file.name;
      const result = document.createElement("small"); result.textContent = assigned;
      item.append(name, result); queue.append(item); messages.push(`${file.name} → ${assigned}`);
    }
    status(host.querySelector(".bulk-status"), `${files.length} file${files.length === 1 ? "" : "s"} added. Check each assignment below; unmatched or duplicate files can be selected in a document row.`);
  }
  function renderCustomer(customer) {
    const host = $("customerView"); host.replaceChildren(); host.hidden = false;
    const head = document.createElement("div"); head.className = "customer-heading";
    const titleBlock = document.createElement("div"); const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "CUSTOMER WORKSPACE"; const title = document.createElement("h2"); title.textContent = customer.customerName; const chassis = document.createElement("p"); chassis.className = "muted"; chassis.textContent = `Chassis: ${customer.chassisNumber}`; titleBlock.append(eyebrow, title, chassis);
    const controls = document.createElement("div"); controls.className = "customer-controls";
    const edit = document.createElement("button"); edit.className = "quiet"; edit.textContent = "Edit details"; edit.addEventListener("click", () => { editingCustomerId = customer._id; $("customerForm").reset(); for (const key of ["chassisNumber", "customerName", "address", "hp", "applicationNumber"]) $(key).value = customer[key] || ""; $("dialogEyebrow").textContent = "EDIT CUSTOMER"; $("dialogTitle").textContent = "Edit customer"; $("customerForm").querySelector("button[type=submit]").textContent = "Save changes"; status($("createStatus"), ""); $("customerDialog").showModal(); });
    const removeCustomer = document.createElement("button"); removeCustomer.className = "danger"; removeCustomer.textContent = "Delete customer"; removeCustomer.addEventListener("click", async () => { if (!confirm(`Delete ${customer.customerName} and all of its stored documents? This cannot be undone.`)) return; try { await request(`/api/upload-portal/customers/${customer._id}`, { method: "DELETE" }); host.hidden = true; currentCustomer = null; await searchCustomers($("search").value); } catch (error) { alert(error.message); } });
    const close = document.createElement("button"); close.className = "quiet"; close.textContent = "Close"; close.addEventListener("click", () => { host.hidden = true; currentCustomer = null; }); controls.append(edit, removeCustomer, close); head.append(titleBlock, controls); host.append(head);
    const fields = document.createElement("div"); fields.className = "customer-fields"; [["Address", customer.address], ["HP", customer.hp], ["Application no.", customer.applicationNumber]].forEach(([label, value]) => { if (value) { const span = document.createElement("span"); span.textContent = `${label}: ${value}`; fields.append(span); } }); host.append(fields);
    const expires = document.createElement("p"); expires.className = "customer-expiry muted"; expires.textContent = `Customer record is automatically deleted after ${new Date(customer.expiresAt).toLocaleDateString()}. Uploaded documents follow your cloud retention setting.`; host.append(expires);
    const bulk = document.createElement("section"); bulk.className = "bulk-upload"; bulk.tabIndex = 0; bulk.setAttribute("aria-label", "Add multiple documents");
    const bulkTitle = document.createElement("strong"); bulkTitle.textContent = "Add multiple documents"; const bulkHint = document.createElement("span"); bulkHint.textContent = "Drop files here or tap to choose. Filenames are used to suggest document rows.";
    const picker = document.createElement("input"); picker.type = "file"; picker.multiple = true; picker.accept = "image/*,.pdf"; picker.className = "bulk-picker"; picker.setAttribute("aria-label", "Choose multiple documents");
    const chooseFiles = document.createElement("button"); chooseFiles.type = "button"; chooseFiles.className = "secondary"; chooseFiles.textContent = "Choose multiple files"; chooseFiles.addEventListener("click", event => { event.stopPropagation(); picker.click(); });
    const queue = document.createElement("div"); queue.className = "bulk-queue"; const bulkStatus = document.createElement("p"); bulkStatus.className = "status bulk-status"; bulk.append(bulkTitle, bulkHint, chooseFiles, picker, queue, bulkStatus);
    bulk.addEventListener("click", event => { if (event.target !== chooseFiles) picker.click(); });
    bulk.addEventListener("dragover", event => { event.preventDefault(); bulk.classList.add("dragging"); });
    bulk.addEventListener("dragleave", () => bulk.classList.remove("dragging"));
    bulk.addEventListener("drop", event => { event.preventDefault(); bulk.classList.remove("dragging"); queueFiles([...event.dataTransfer.files], host); });
    picker.addEventListener("change", () => { queueFiles([...picker.files], host); picker.value = ""; }); host.append(bulk);
    const toolbar = document.createElement("div"); toolbar.className = "doc-toolbar";
    const label = document.createElement("strong"); label.textContent = "VAHAN documents";
    const count = document.createElement("span"); count.className = "muted"; count.textContent = Object.keys(customer.documents || {}).length + " of 12 saved";
    const zipEnabled = Object.keys(customer.documents || {}).length > 0;
    const zipStatus = document.createElement("span"); zipStatus.className = "status zip-share-status"; zipStatus.setAttribute("role", "status"); zipStatus.hidden = true;
    const zip = document.createElement("button"); zip.type = "button"; zip.className = "secondary zip-download"; zip.textContent = "Download ZIP"; zip.disabled = !zipEnabled;
    const shareZip = document.createElement("button"); shareZip.type = "button"; shareZip.className = "secondary zip-share"; shareZip.textContent = "Share ZIP"; shareZip.disabled = !zipEnabled;
    const setZipBusy = busy => { zip.disabled = busy || !zipEnabled; shareZip.disabled = busy || !zipEnabled; };
    zip.addEventListener("click", async () => {
      setZipBusy(true); zip.textContent = "Preparing ZIP…"; zipStatus.hidden = false; status(zipStatus, "Preparing customer ZIP…");
      try {
        const blob = await request("/api/upload-portal/customers/" + customer._id + "/documents.zip", {}, true);
        downloadBlob(blob, safeFilenamePart(customer.customerName) + "_" + safeFilenamePart(customer.chassisNumber) + ".zip");
        status(zipStatus, "Customer ZIP downloaded.", "success");
      } catch (error) { zipStatus.hidden = false; status(zipStatus, error.message, "error"); }
      finally { zip.textContent = "Download ZIP"; setZipBusy(false); }
    });
        shareZip.addEventListener("click", async () => {
      setZipBusy(true); shareZip.textContent = "Preparing ZIP…"; zipStatus.hidden = false; status(zipStatus, "Preparing customer ZIP…");
      let blob = null;
      const filename = safeFilenamePart(customer.customerName) + "_" + safeFilenamePart(customer.chassisNumber) + ".zip";
      try {
        blob = await request("/api/upload-portal/customers/" + customer._id + "/documents.zip", {}, true);
        const file = new File([blob], filename, {type:"application/zip"});
        const supportsFileShare = typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({files:[file]}));
        if (supportsFileShare) {
          await navigator.share({files:[file], title:customer.customerName + " documents", text:"VAHAN customer documents"});
          status(zipStatus, "ZIP shared successfully.", "success");
        } else {
          downloadBlob(blob, filename);
          status(zipStatus, "Direct ZIP sharing is unavailable here. The ZIP was downloaded; share it from your Downloads app.", "success");
        }
      } catch (error) {
        if (error.name === "AbortError") status(zipStatus, "Sharing canceled.");
        else if (blob && ["NotAllowedError","SecurityError"].includes(error.name)) {
          downloadBlob(blob, filename);
          status(zipStatus, "The browser blocked direct sharing. The ZIP was downloaded; share it from your Downloads app.", "success");
        } else status(zipStatus, error.message, "error");
      } finally { shareZip.textContent = "Share ZIP"; setZipBusy(false); }
    });
    toolbar.append(label, count, shareZip, zip, zipStatus); host.append(toolbar);
    const list = document.createElement("div"); list.className = "doc-list";
    documentDisplayOrder.filter(id => id !== "form20").forEach(id => {
      const name = categories.find(([category]) => category === id)?.[1] || id;
      const row = document.createElement("section"); row.className = "doc-row"; row.dataset.doc = id; const h = document.createElement("h3"); h.textContent = (documentDisplayOrder.indexOf(id) + 1) + ". " + name; const state = document.createElement("div"); state.className = "doc-state"; const saved = customer.documents?.[id]; state.textContent = saved ? `Saved · ${saved.filename}` : "Not selected"; if (saved) state.classList.add("saved"); row.append(h, state); addPreviewPair(row, customer, id, saved);
      let addressTypeSelect = null, aadhaarCaptureHint = null, aadhaarCaptureControls = null;
      if (id === "address-proof") {
        const select = document.createElement("select"); select.className = "subcat"; select.dataset.subcategory = "true"; select.innerHTML = '<option value="">Choose address proof type</option>'; addressTypes.forEach(type => { const option = document.createElement("option"); option.value = type; option.textContent = type; select.append(option); }); if (saved?.subcategory) select.value = saved.subcategory; addressTypeSelect = select;
        aadhaarCaptureHint = document.createElement("p"); aadhaarCaptureHint.className = "aadhar-capture-hint muted"; aadhaarCaptureHint.textContent = "Optional: capture Aadhaar front and back to save them together as one PDF."; aadhaarCaptureHint.hidden = true;
        aadhaarCaptureControls = document.createElement("div"); aadhaarCaptureControls.className = "doc-actions native-capture-group aadhaar-native-capture"; aadhaarCaptureControls.hidden = true;
        addNativeMultiPhotoCapture(aadhaarCaptureControls, row, {
          labels:["Front side", "Back side"], documentName:"Aadhaar", saveLabel:"Combine and save Aadhaar PDF",
          onSave:(photos, progress) => saveCapturedAadhaar(customer, host, row, photos, progress)
        });
        row.append(select, aadhaarCaptureHint, aadhaarCaptureControls);
      }
      const actions = document.createElement("div"); actions.className = "doc-actions"; const camera = document.createElement("button"); camera.type = "button"; camera.className = "secondary"; camera.textContent = "Camera"; camera.addEventListener("click", () => safeFileInput(id, true)); const browse = document.createElement("button"); browse.type = "button"; browse.className = "secondary"; browse.textContent = "Choose file"; browse.addEventListener("click", () => safeFileInput(id, false)); actions.append(camera, browse);
      if (id === "address-proof") {
        const updateAadhaarOption = () => { const visible = addressTypeSelect.value === "Aadhaar"; aadhaarCaptureControls.hidden = !visible; aadhaarCaptureHint.hidden = !visible; };
        addressTypeSelect.addEventListener("change", updateAadhaarOption);
        updateAadhaarOption();
      }
      if (saved) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Remove"; remove.addEventListener("click", async () => { if (!confirm(`Remove ${name}?`)) return; try { await request(`/api/upload-portal/customers/${customer._id}/documents/${id}`, { method: "DELETE" }); await openCustomer(customer._id); } catch (error) { alert(error.message); } }); actions.append(remove); }
      row.append(actions); list.append(row);
    });
    const form20 = document.createElement("section"); form20.className = "doc-row full"; form20.dataset.doc = "form20"; const ftitle = document.createElement("h3"); ftitle.textContent = (documentDisplayOrder.indexOf("form20") + 1) + ". Form 20 (Finance)"; const saved20 = customer.documents?.form20; const fstate = document.createElement("div"); fstate.className = `doc-state${saved20 ? " saved" : ""}`; fstate.textContent = saved20 ? `Saved · ${saved20.filename}` : "Upload a PDF (3+ pages) or capture three photos"; form20.append(ftitle, fstate); addPreviewPair(form20, customer, "form20", saved20);
    const form20Actions = document.createElement("div"); form20Actions.className = "doc-actions form20-actions";
    const form20CaptureControls = document.createElement("div"); form20CaptureControls.className = "doc-actions native-capture-group";
    addNativeMultiPhotoCapture(form20CaptureControls, form20, {
      labels:["Page 1", "Page 2", "Page 3"], documentName:"Form 20", saveLabel:"Combine and save Form 20 PDF",
      onSave:(photos, progress) => saveCapturedForm20(customer, host, form20, photos, progress)
    });
    form20Actions.append(form20CaptureControls);
    const choose20 = document.createElement("button"); choose20.type = "button"; choose20.className = "secondary"; choose20.textContent = "Choose PDF or photos";
    choose20.addEventListener("click", () => { const input = document.createElement("input"); input.type = "file"; input.accept = "application/pdf,image/*"; input.multiple = true; input.addEventListener("change", () => {
      const files = [...(input.files || [])]; const pdfs = files.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length) { if (pdfs.length !== 1 || files.length !== 1) { status($("saveStatus"), "Choose one Form 20 PDF by itself.", "error"); return; } form20._file = pdfs[0]; form20._pages = []; form20.querySelector(".doc-state").textContent = `${pdfs[0].name} → Form 20`; updateFileDetails(form20, pdfs[0]); setPreview(form20._selectedPreview, pdfs[0], "Selected"); }
      else { form20._file = null; form20._pages = files.slice(0, 30); form20.querySelector(".doc-state").textContent = files.length ? `${files.length} photos selected · Form 20` : "Upload a PDF (3+ pages) or capture three photos"; if (files[0]) updateFileDetails(form20, files[0]); setPreview(form20._selectedPreview, files[0] || null, "Selected"); }
    }); input.click(); });
    form20Actions.append(choose20); form20.append(form20Actions); list.insertBefore(form20, list.children[3] || null); host.append(list);
    const bar = document.createElement("div"); bar.className = "save-bar"; const result = document.createElement("p"); result.id = "saveStatus"; result.className = "status"; result.textContent = "Choose any available documents. You can save fewer than 12."; const save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = "Save selected documents"; save.addEventListener("click", () => saveDocuments(customer, host, save)); bar.append(result, save); host.append(bar);
  }
  async function openCustomer(id) { try { const data = await request(`/api/upload-portal/customers/${id}`); currentCustomer = data.customer; renderCustomer(currentCustomer); } catch (error) { status($("searchStatus"), error.message, "error"); } }
  async function saveDocuments(customer, host, button) {
    button.disabled = true; setSaveBarrier(true); const result = $("saveStatus"); let saved = 0; const failures = [];
    for (const [category] of categories.filter(([id]) => id !== "form20")) {
      const row = host.querySelector(`[data-doc="${category}"]`); const file = row?._file; if (!file) continue;
      const subcategory = row.querySelector("[data-subcategory]")?.value || ""; if (category === "address-proof" && !subcategory) { failures.push("Address Proof: select a type."); continue; }
      try { status(result, `Preparing ${row.querySelector("h3").textContent}…`); const prepared = await prepareUploadFile(file, category); await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": file.type || "application/octet-stream", "X-NDC-Upload-Type": prepared.type || file.type, "X-NDC-Original-Filename": file.name, "X-NDC-Original-Size": String(file.size), "X-NDC-Original-Last-Modified": String(file.lastModified || Date.now()), ...(subcategory ? { "X-NDC-Subcategory": subcategory } : {}) }, body: prepared }); saved++; }
      catch (error) { failures.push(`${row.querySelector("h3").textContent}: ${error.message}`); }
    }
    const form20Row = host.querySelector('[data-doc="form20"]');
    const form20File = form20Row?._file;
    const pages = form20Row?._pages || [];
    if (form20File) {
      try {
        status(result, "Preparing Form 20 PDF…");
        const preparedForm20 = await prepareUploadFile(form20File, "form20");
        await request(`/api/upload-portal/customers/${customer._id}/documents/form20`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": form20File.type || "application/pdf", "X-NDC-Upload-Type": preparedForm20.type || form20File.type, "X-NDC-Original-Filename": form20File.name, "X-NDC-Original-Size": String(form20File.size), "X-NDC-Original-Last-Modified": String(form20File.lastModified || Date.now()) }, body: preparedForm20 }); saved++;
      } catch (error) { failures.push(`Form 20: ${error.message}`); }
    }
    if (pages.length) {
      if (pages.length < 3) failures.push("Form 20: choose or capture at least three photos.");
      else {
        try {
          status(result, "Combining Form 20 photos into one PDF in this browser…");
          const form20Pdf = await createCapturedPhotoPdf(pages, safeFilenamePart(customer.customerName) + "_form20.pdf", MAX_FORM20_UPLOAD_BYTES, "Form 20");
          const preparedForm20 = await prepareUploadFile(form20Pdf, "form20");
          await request(`/api/upload-portal/customers/${customer._id}/documents/form20`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": "application/pdf", "X-NDC-Upload-Type": preparedForm20.type || form20Pdf.type, "X-NDC-Original-Filename": form20Pdf.name, "X-NDC-Original-Size": String(form20Pdf.size), "X-NDC-Original-Last-Modified": String(form20Pdf.lastModified || Date.now()) },
            body: preparedForm20
          });
          saved++;
        } catch (error) { failures.push(`Form 20: ${error.message}`); }
      }
    }
    try { const updated = await request(`/api/upload-portal/customers/${customer._id}`); currentCustomer = updated.customer; renderCustomer(currentCustomer); await searchCustomers($("search").value); status($("saveStatus"), failures.length ? `${saved} saved. ${failures.join(" ")}` : `${saved ? `${saved} document${saved === 1 ? "" : "s"} saved and prepared for VAHAN.` : "No new documents selected."}`, failures.length ? "error" : "success"); }
    catch (error) { const response = host.querySelector("#saveStatus") || result; status(response, error.message, "error"); }
    finally { button.disabled = false; setSaveBarrier(false); }
  }
  void validate();
})();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && token && sessionExpiry && Date.now() >= sessionExpiry) expireSession();
  });
