"use strict";
(() => {
  const API = "https://server.nextdimensioncustoms.in";
  const $ = id => document.getElementById(id);
  const tokenKey = "ndcUploadPortalToken";
  const expiryKey = "ndcUploadPortalExpiresAt";
  const storedLocalToken = localStorage.getItem(tokenKey) || "";
  const storedSessionToken = sessionStorage.getItem(tokenKey) || "";
  let token = storedLocalToken || storedSessionToken;
  let sessionExpiry = Number(storedLocalToken ? localStorage.getItem(expiryKey) : sessionStorage.getItem(expiryKey)) || 0;
  if (token && !storedLocalToken) {
    localStorage.setItem(tokenKey, token);
    if (sessionExpiry) localStorage.setItem(expiryKey, String(sessionExpiry));
  }
  sessionStorage.removeItem(tokenKey);
  sessionStorage.removeItem(expiryKey);
  let expiryTimer = null;
  let currentCustomer = null;
  let pendingCloseHost = null;
  let searchTimer;
  let desktopCameraCheckTimer = null;
  let autoForm20AsInspection = false;
  let persistedRetentionDays = "20";
  let sessionValidationPromise = null;

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
  // Best-effort browser-page shortcut deterrence only; browser chrome can still open DevTools.
  document.addEventListener("contextmenu", event => event.preventDefault(), true);
  document.addEventListener("keydown", event => {
    const key = String(event.key || "").toLowerCase();
    const devtoolsCombo = key === "f12"
      || ((event.ctrlKey || event.metaKey) && event.shiftKey && ["i", "j", "c"].includes(key))
      || ((event.ctrlKey || event.metaKey) && event.altKey && ["i", "j", "c"].includes(key))
      || (event.shiftKey && key === "f10")
      || key === "contextmenu";
    if (devtoolsCombo) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  function hasPendingDocumentChanges(host) {
    return [...host.querySelectorAll(".doc-row[data-doc]")].some(row =>
      Boolean(row._file) || (Array.isArray(row._pages) && row._pages.length > 0)
    );
  }
  function hasUnsavedEditorChanges(host) {
    return [...host.querySelectorAll(".doc-row[data-doc]")].some(row =>
      Boolean(row._file)
      || (Array.isArray(row._pages) && row._pages.length > 0)
      || (Array.isArray(row._nativeCameraPhotos) && row._nativeCameraPhotos.some(Boolean))
    );
  }
  function closeCustomerEditor(host, discardPending = false) {
    if (discardPending) {
      host.querySelectorAll(".file-preview").forEach(preview => {
        if (preview._url) {
          URL.revokeObjectURL(preview._url);
          preview._url = null;
        }
      });
      host.querySelectorAll(".doc-row[data-doc]").forEach(row => {
        row._file = null;
        row._pages = [];
        row._nativeCameraPhotos = [];
      });
      host.replaceChildren();
    }
    host.hidden = true;
    currentCustomer = null;
    document.body.classList.remove("customer-editor-open");
  }
  function updateDocumentSaveButton(host) {
    const button = host?.querySelector(".save-bar .primary");
    if (button) button.disabled = !hasPendingDocumentChanges(host);
    updateCustomerCloudStatus(host);
  }
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
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(expiryKey);
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
    localStorage.setItem(expiryKey, String(expiresAt));
    sessionStorage.removeItem(expiryKey);
    clearTimeout(expiryTimer);
    const checkExpiry = () => {
      const remaining = sessionExpiry - Date.now();
      if (remaining <= 0) expireSession();
      else expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
    };
    expiryTimer = setTimeout(checkExpiry, Math.min(expiresAt - Date.now(), 2147483647));
    return true;
  }
  async function ensureActiveSession() {
    if (!token) { showLogin(); return false; }
    if (sessionExpiry && Date.now() >= sessionExpiry) {
      expireSession();
      return false;
    }
    if (!sessionValidationPromise) {
      sessionValidationPromise = (async () => {
        try {
          const data = await request("/api/auth/me");
          if (!saveSessionExpiry(data.sessionExpiresAt)) {
            expireSession();
            return false;
          }
          showApp();
          return true;
        } catch (error) {
          if (!token || (sessionExpiry && Date.now() >= sessionExpiry)) return false;
          status($("searchStatus"), "Could not verify your session because the server is unreachable. Reconnect and retry; your saved session is still available.", "error");
          return false;
        } finally {
          sessionValidationPromise = null;
        }
      })();
    }
    return sessionValidationPromise;
  }
  async function request(path, options = {}, binary = false) {
    const isAuthCheck = path === "/api/auth/login" || path === "/api/auth/me";
    if (!isAuthCheck && !(await ensureActiveSession())) {
      throw new Error(token
        ? "Session could not be verified. Check your connection and retry."
        : "Your session is no longer valid. Sign in again to continue.");
    }
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
  function showLogin() { $("loginView").hidden = false; $("appView").hidden = true; $("logout").hidden = true; $("settingsToggle").hidden = true; document.body.classList.remove("customer-editor-open"); }
  function showApp() { $("loginView").hidden = true; $("appView").hidden = false; $("logout").hidden = false; $("settingsToggle").hidden = false; }
  async function loadSettings() {
    const data = await request("/api/upload-portal/settings");
    persistedRetentionDays = String(data.retentionDays || 20);
    $("retentionDays").value = persistedRetentionDays;
    autoForm20AsInspection = data.autoForm20AsInspection === true;
    $("autoForm20AsInspection").checked = autoForm20AsInspection;
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
  $("settingsToggle").addEventListener("click", async () => {
    if (!(await ensureActiveSession())) return;
    if ($("settingsView").hidden) await showSettings(); else showWorkspace();
  });
  $("backToWorkspace").addEventListener("click", async () => {
    if (await ensureActiveSession()) showWorkspace();
  });
  const restoreSettingsControls = () => {
    $("retentionDays").value = persistedRetentionDays;
    $("autoForm20AsInspection").checked = autoForm20AsInspection;
  };
  $("retentionDays").addEventListener("change", async () => {
    if (!(await ensureActiveSession())) restoreSettingsControls();
  });
  $("autoForm20AsInspection").addEventListener("change", async () => {
    if (!(await ensureActiveSession())) restoreSettingsControls();
  });
  $("saveRetention").addEventListener("click", async () => {
    if (!(await ensureActiveSession())) { restoreSettingsControls(); return; }
    const button = $("saveRetention"); button.disabled = true; status($("settingsStatus"), "Saving setting…");
    try {
      const data = await request("/api/upload-portal/settings", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({retentionDays:Number($("retentionDays").value),autoForm20AsInspection:$("autoForm20AsInspection").checked})});
      autoForm20AsInspection = data.autoForm20AsInspection === true;
      persistedRetentionDays = String(data.retentionDays || $("retentionDays").value || 20);
      $("retentionDays").value = persistedRetentionDays;
      $("autoForm20AsInspection").checked = autoForm20AsInspection;
      status($("settingsStatus"), data.message || "Workspace settings updated.", "success");
    } catch (error) { status($("settingsStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  function setSessionBarrier(active) {
    $("sessionBarrier").hidden = !active;
  }
  async function validate() {
    if (!token) return showLogin();
    if (sessionExpiry && Date.now() >= sessionExpiry) return expireSession();
    setSessionBarrier(true);
    try {
      const data = await request("/api/auth/me");
      if (!saveSessionExpiry(data.sessionExpiresAt)) return expireSession();
      showApp();
      setSessionBarrier(false);
      await Promise.all([
        searchCustomers(""),
        loadSettings().catch(error => status($("settingsStatus"), error.message, "error"))
      ]);
    } catch (error) {
      if (!token || (sessionExpiry && Date.now() >= sessionExpiry)) return showLogin();
      showApp();
      setSessionBarrier(false);
      status($("searchStatus"), "Could not verify your saved session because the server is unreachable. Check your connection and reload.", "error");
    } finally {
      setSessionBarrier(false);
    }
  }
  const rememberedAccountsKey = "ndcUploadPortalRememberedAccounts";
  function getRememberedAccounts() {
    try {
      const stored = JSON.parse(localStorage.getItem(rememberedAccountsKey) || "[]");
      if (!Array.isArray(stored)) return [];
      return [...new Set(stored.filter(name => typeof name === "string").map(name => name.trim()).filter(Boolean))].slice(0, 10);
    } catch { return []; }
  }
  function refreshRememberedAccounts(selectedName = "") {
    const select = $("savedAccounts");
    const accounts = getRememberedAccounts();
    select.replaceChildren(new Option("Choose a saved account", ""));
    accounts.forEach(name => select.add(new Option(name, name)));
    $("savedAccountsField").hidden = accounts.length === 0;
    select.value = accounts.find(name => name.toLowerCase() === selectedName.toLowerCase()) || "";
  }
  function syncRememberAccountChoice() {
    const username = $("username").value.trim().toLowerCase();
    $("rememberAccount").checked = Boolean(username) && getRememberedAccounts().some(name => name.toLowerCase() === username);
  }
  function saveRememberedAccount(username) {
    const normalized = username.trim();
    let accounts = getRememberedAccounts().filter(name => name.toLowerCase() !== normalized.toLowerCase());
    if ($("rememberAccount").checked) accounts.unshift(normalized);
    localStorage.setItem(rememberedAccountsKey, JSON.stringify(accounts.slice(0, 10)));
    refreshRememberedAccounts($("rememberAccount").checked ? normalized : "");
  }
  refreshRememberedAccounts();
  $("savedAccounts").addEventListener("change", () => {
    const account = $("savedAccounts").value;
    if (account) {
      $("username").value = account;
      $("rememberAccount").checked = true;
    }
  });
  $("username").addEventListener("input", syncRememberAccountChoice);
  $("togglePassword").addEventListener("click", () => {
    const password = $("password");
    const showing = password.type === "password";
    password.type = showing ? "text" : "password";
    const label = showing ? "Hide password" : "Show password";
    const button = $("togglePassword");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.setAttribute("aria-pressed", String(showing));
    button.innerHTML = showing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3 3.8"/><path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.8 10.8 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  });
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    status($("loginStatus"), "Signing in…");
    const username = $("username").value.trim();
    try {
      const data = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: $("password").value, deviceId: sessionDevice }) });
      token = data.token;
      localStorage.setItem(tokenKey, token);
      sessionStorage.removeItem(tokenKey);
      if (!saveSessionExpiry(data.expiresAt)) throw new Error("The server did not return a valid 24-hour session expiry.");
      saveRememberedAccount(username);
      $("password").value = ""; showApp();
      await Promise.all([
        searchCustomers(""),
        loadSettings().catch(error => status($("settingsStatus"), error.message, "error"))
      ]);
      status($("loginStatus"), "Signed in. Your session is valid for up to 24 hours.", "success");
    } catch (error) { status($("loginStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  $("settingsView").hidden = true;
  $("logout").addEventListener("click", async () => { try { await request("/api/auth/logout", { method: "POST" }); } catch {} clearClientSession(); currentCustomer = null; $("customerView").hidden = true; document.body.classList.remove("customer-editor-open"); showLogin(); });
  $("newCustomer").addEventListener("click", async () => { if (!(await ensureActiveSession())) return; editingCustomerId = null; $("customerForm").reset(); $("dialogEyebrow").textContent = "NEW CUSTOMER"; $("dialogTitle").textContent = "Create customer"; $("customerForm").querySelector("button[type=submit]").textContent = "Create customer"; status($("createStatus"), ""); $("customerDialog").showModal(); });
  $("closeDialog").addEventListener("click", () => $("customerDialog").close());
  $("keepEditing").addEventListener("click", () => {
    pendingCloseHost = null;
    $("discardChangesDialog").close();
  });
  $("discardChangesDialog").addEventListener("cancel", () => { pendingCloseHost = null; });
  $("discardAndClose").addEventListener("click", () => {
    const host = pendingCloseHost;
    pendingCloseHost = null;
    $("discardChangesDialog").close();
    if (host) closeCustomerEditor(host, true);
  });
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
  let customerSearchSequence = 0;
  function renderCustomerSkeletons(host) {
    host.replaceChildren();
    host.setAttribute("aria-busy", "true");
    for (let index = 0; index < 3; index++) {
      const row = document.createElement("div");
      row.className = "customer-skeleton";
      row.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "customer-skeleton-copy";
      const titleLine = document.createElement("span");
      titleLine.className = "customer-skeleton-line customer-skeleton-title";
      const metaLine = document.createElement("span");
      metaLine.className = "customer-skeleton-line customer-skeleton-meta";
      copy.append(titleLine, metaLine);
      const arrow = document.createElement("span");
      arrow.className = "customer-skeleton-line customer-skeleton-arrow";
      row.append(copy, arrow);
      host.append(row);
    }
  }
  async function searchCustomers(query) {
    const host = $("customerResults");
    const requestSequence = ++customerSearchSequence;
    renderCustomerSkeletons(host);
    status($("searchStatus"), "Loading customer records…");
    try {
      const data = await request(`/api/upload-portal/customers?q=${encodeURIComponent(query)}`);
      if (requestSequence !== customerSearchSequence) return;
      host.replaceChildren();
      host.removeAttribute("aria-busy");
      data.customers.forEach(customer => {
        const button = document.createElement("button"); button.type = "button"; button.className = "result-row";
        const title = document.createElement("span"); title.textContent = customer.customerName; const meta = document.createElement("small"); meta.textContent = `${customer.chassisNumber} · ${Object.keys(customer.documents || {}).length} documents saved`;
        const right = document.createElement("span"); right.append(title, meta); const arrow = document.createElement("b"); arrow.textContent = "›"; button.append(right, arrow); button.addEventListener("click", () => openCustomer(customer._id)); host.append(button);
      });
      status($("searchStatus"), data.customers.length ? `${data.customers.length} customer${data.customers.length === 1 ? "" : "s"} found.` : query ? "No matching customer found." : "Create a customer to start uploading.");
    } catch (error) {
      if (requestSequence !== customerSearchSequence) return;
      host.replaceChildren();
      host.removeAttribute("aria-busy");
      status($("searchStatus"), error.message, "error");
    }
  }
  async function safeFileInput(category, isCamera) {
    if (!(await ensureActiveSession())) return;
    const input = document.createElement("input"); input.type = "file"; input.accept = isCamera ? "image/*" : "image/*,.pdf"; if (isCamera) input.capture = "environment";
    input.addEventListener("change", async () => {
      if (!(await ensureActiveSession())) return;
      const row = document.querySelector(`[data-doc="${category}"]`);
      if (!row || !input.files?.[0]) return;
      row._file = input.files[0]; row._pages = [];
      row.querySelector(".doc-state").textContent = row._savedDocument ? "Replacement selected" : "File selected";
      updateDocumentSaveButton($("customerView"));
      await loadSelectedFilePreview(row, row._file);
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
    const capturePages = document.createElement("div");
    capturePages.className = "native-capture-pages";
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
        const action = photos[index] ? "Retake" : "Capture";
        button.disabled = saving;
        button.dataset.captured = String(Boolean(photos[index]));
        button.setAttribute("aria-label", `${action} ${labels[index]}`);
        button.title = `${action} ${labels[index]}`;
        button.innerHTML = `<span class="numbered-camera-icon">${actionIconSvg.camera}<span class="camera-number-badge">${index + 1}</span></span><span class="button-label">${action} ${labels[index]}</span>`;
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
      button.className = "secondary native-capture-page icon-only";
      button.setAttribute("aria-label", `Capture ${label}`);
      button.title = `Capture ${label}`;
      button.addEventListener("click", async () => {
        if (!(await ensureActiveSession())) return;
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
          if (!saving) update();
        }
      });
      captureButtons.push(button);
      capturePages.append(button);
    });
    actions.append(capturePages);
    save.addEventListener("click", async () => {
      if (saving || saved || photos.some(photo => !photo)) return;
      if (!(await ensureActiveSession())) return;
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
    row._nativeCameraPhotos = [];
    const state = row.querySelector(".doc-state");
    state.textContent = "";
    state.classList.add("saved");
    const titleRow = row.querySelector(".doc-row-header");
    if (titleRow && !titleRow.querySelector(".cloud-saved-indicator")) titleRow.append(createCloudSavedIndicator());
    const selector = row._subcategorySelect || row.querySelector("[data-subcategory]");
    const actions = row._documentActions || row.querySelector(".doc-actions");
    row._previewPair?.remove();
    row.querySelector(".file-details")?.remove();
    selector?.remove();
    actions?.remove();
    addPreviewPair(row, customer, category, saved);
    if (selector) row.append(selector);
    if (actions) row.append(actions);
    registerDesktopDocumentRow(row);
    if (host._activeDesktopRow === row) activateDesktopDocumentRow(row, host);
    updateCustomerCloudStatus(host);
    const savedCount = Object.keys(customer.documents).length;
    const count = host.querySelector(".doc-toolbar .muted");
    if (count) count.textContent = savedCount + " of 12 saved";
    host.querySelectorAll(".zip-download,.zip-share").forEach(button => { button.disabled = savedCount === 0; });
  }
  async function copyForm20ToInspection(customer, file, sourceFile) {
    if (!autoForm20AsInspection) return false;
    const prepared = await prepareUploadFile(file, "inspection");
    const saved = await request("/api/upload-portal/customers/" + customer._id + "/documents/inspection", {
      method:"PUT",
      headers:{"Content-Type":"application/octet-stream","X-NDC-Original-Type":sourceFile.type || "application/pdf","X-NDC-Upload-Type":prepared.type || file.type,"X-NDC-Original-Filename":sourceFile.name,"X-NDC-Original-Size":String(sourceFile.size),"X-NDC-Original-Last-Modified":String(sourceFile.lastModified || Date.now())},
      body:prepared
    });
    return {...saved, uploadedAt:new Date().toISOString()};
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
    let inspectionCopyError = "";
    let inspectionSaved = null;
    if (autoForm20AsInspection) {
      try { inspectionSaved = await copyForm20ToInspection(customer, preparedFile, file); }
      catch (error) { inspectionCopyError = error.message; }
    }
    updateSavedDocumentRow(customer, host, row, "form20", saved);
    if (inspectionSaved) {
      const inspectionRow = host.querySelector('[data-doc="inspection"]');
      if (inspectionRow) updateSavedDocumentRow(customer, host, inspectionRow, "inspection", inspectionSaved);
      else customer.documents = {...(customer.documents || {}), inspection:inspectionSaved};
    }
    await searchCustomers($("search").value);
    status($("saveStatus"), inspectionCopyError ? `Form 20 PDF saved, but Inspection copy failed: ${inspectionCopyError}` : autoForm20AsInspection ? "Form 20 PDF saved and copied to Inspection." : "Form 20 saved as one PDF. Continue with the next document.", inspectionCopyError ? "error" : "success");
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
  async function showFullscreenPreview(file, savedDetails = null) {
    if (!file || !(await ensureActiveSession())) return;
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
    metadata.textContent = savedDetails
      ? [savedDetails.originalSize != null ? `Original size: ${readableSize(savedDetails.originalSize)}` : "", savedDetails.size != null ? `Saved size: ${readableSize(savedDetails.size)}` : "", isPdf ? "PDF document" : "Image"].filter(Boolean).join(" · ")
      : `${readableSize(file.size)} · ${isPdf ? "PDF document" : "Image"}`;
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
  function setPreview(box, file, label, savedDetails = null) {
    if (box._url) URL.revokeObjectURL(box._url);
    box._previewReady = Promise.resolve();
    box.replaceChildren();
    const tag = document.createElement("span"); tag.className = "file-preview-title"; tag.textContent = label; box.append(tag);
    if (!file) { const empty = document.createElement("span"); empty.className = "file-preview-label"; empty.textContent = label === "Selected" ? "No file selected" : "No saved file"; box.append(empty); return box._previewReady; }
    const isImage = file.type?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name || "");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (isImage) {
      const url = URL.createObjectURL(file); box._url = url;
      const image = document.createElement("img"); image.alt = file.name || "Document preview"; image.className = "file-preview-thumb"; image.addEventListener("click", () => showFullscreenPreview(file, savedDetails));
      box._previewReady = new Promise(resolve => { image.addEventListener("load", resolve, {once:true}); image.addEventListener("error", resolve, {once:true}); });
      box.append(image); image.src = url;
    } else if (isPdf) {
      const pdfButton = document.createElement("button"); pdfButton.type = "button"; pdfButton.className = "pdf-preview-thumb"; pdfButton.setAttribute("aria-label", `Preview PDF ${file.name || ""} · ${readableSize(file.size)}`);
      const mark = document.createElement("span"); mark.className = "pdf-preview-mark"; mark.textContent = "PDF";
      const hint = document.createElement("span"); hint.className = "pdf-preview-hint"; hint.textContent = "Loading first page…";
      pdfButton.append(mark, hint); pdfButton.addEventListener("click", () => showFullscreenPreview(file, savedDetails)); box.append(pdfButton);
      box._previewReady = renderPdfThumbnail(file, pdfButton, mark, hint);
    } else {
      const unsupported = document.createElement("span"); unsupported.className = "file-preview-label"; unsupported.textContent = "Preview unavailable"; box.append(unsupported);
    }
    const full = document.createElement("button"); full.type = "button"; full.className = "preview-fullscreen"; full.textContent = "Open preview"; full.addEventListener("click", () => showFullscreenPreview(file, savedDetails)); box.append(full);
    return box._previewReady;
  }
  function setDocumentRowLoading(row, loading) {
    row.classList.toggle("file-loading", loading);
    row.setAttribute("aria-busy", loading ? "true" : "false");
    let barrier = row.querySelector(".file-loading-barrier");
    if (loading && !barrier) {
      barrier = document.createElement("div"); barrier.className = "file-loading-barrier"; barrier.setAttribute("role", "status");
      const spinner = document.createElement("span"); spinner.className = "file-loading-spinner"; spinner.setAttribute("aria-hidden", "true");
      const label = document.createElement("span"); label.textContent = "Loading file preview…";
      barrier.append(spinner, label); row.append(barrier);
    } else if (!loading) barrier?.remove();
  }
  async function loadSelectedFilePreview(row, file) {
    if (!row || !file) return;
    if (isDesktopWorkspace()) activateDesktopDocumentRow(row, row.closest(".customer-card"));
    setDocumentRowLoading(row, true);
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await setPreview(row._selectedPreview, file, "Selected");
    } finally { setDocumentRowLoading(row, false); }
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
    const date = value instanceof Date ? value : typeof value === "number" || /^\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
  }
  function createCloudSavedIndicator(pending = false) {
    const indicator = document.createElement("span");
    indicator.className = "cloud-saved-indicator";
    indicator.setAttribute("role", "img");
    indicator.setAttribute("aria-label", pending ? "Files not saved to cloud" : "Saved to cloud");
    indicator.title = pending ? "Files not saved to cloud" : "Saved to cloud";
    indicator.innerHTML = pending
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.2 18h9.6a4.2 4.2 0 0 0 .4-8.4A5.5 5.5 0 0 0 7 8.4 4.8 4.8 0 0 0 7.2 18Z"/><path d="M12 15V9m-3 3 3-3 3 3"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.2 18h9.6a4.2 4.2 0 0 0 .4-8.4A5.5 5.5 0 0 0 7 8.4 4.8 4.8 0 0 0 7.2 18Z"/><path d="m9.4 13.2 1.8 1.8 3.8-3.8"/></svg>';
    if (pending) indicator.classList.add("is-pending");
    return indicator;
  }
  function updateCustomerCloudStatus(host) {
    const indicator = host?.querySelector(".customer-cloud-status");
    if (!indicator) return;
    const replacement = createCloudSavedIndicator(hasUnsavedEditorChanges(host));
    replacement.classList.add("customer-cloud-status");
    indicator.replaceWith(replacement);
  }
  function isDesktopWorkspace() {
    return window.matchMedia("(min-width: 681px)").matches;
  }
  function registerDesktopDocumentRow(row) {
    const nodes = [row._previewPair, row._subcategorySelect, row._captureHint, row._nativeCaptureControls].filter(node => node?.parentNode);
    const parents = new Map();
    for (const node of nodes) {
      const parent = node.parentNode;
      if (!parents.has(parent)) parents.set(parent, [...parent.childNodes]);
    }
    row._desktopMovableNodes = nodes;
    row._desktopMobileOrders = parents;
  }
  function restoreDesktopDocumentRow(row) {
    if (!row?._desktopMobileOrders) return;
    for (const [parent, order] of row._desktopMobileOrders) {
      for (const child of order) parent.append(child);
    }
    row.classList.remove("is-preview-active");
  }
  function activateDesktopDocumentRow(row, host) {
    if (!row || !host || !isDesktopWorkspace()) return;
    const panel = host.querySelector(".desktop-preview-panel");
    const content = panel?.querySelector(".desktop-preview-content");
    if (!panel || !content) return;
    const previous = host._activeDesktopRow;
    if (previous) restoreDesktopDocumentRow(previous);
    content.replaceChildren();
    const title = panel.querySelector(".desktop-preview-title");
    if (title) title.textContent = row._docTitleText || row.querySelector(".doc-row-header h3")?.textContent || "Document preview";
    const state = panel.querySelector(".desktop-preview-status");
    if (state) state.textContent = row._docState?.textContent.trim() || (row._savedDocument ? "Saved to cloud" : "Choose a file or capture pages.");
    const modified = row.querySelector(".doc-modified");
    if (modified) content.append(modified.cloneNode(true));
    for (const node of row._desktopMovableNodes || []) content.append(node);
    row.classList.add("is-preview-active");
    host._activeDesktopRow = row;
  }
  function syncDesktopDocumentLayout(host) {
    if (!host || host.hidden) return;
    if (isDesktopWorkspace()) {
      const active = host._activeDesktopRow || host.querySelector(".doc-row[data-doc]");
      if (active) activateDesktopDocumentRow(active, host);
    } else if (host._activeDesktopRow) {
      restoreDesktopDocumentRow(host._activeDesktopRow);
      host._activeDesktopRow = null;
    }
  }
  async function updateDesktopCameraAvailability() {
    if (!isDesktopWorkspace()) {
      document.body.classList.remove("desktop-camera-unavailable");
      return;
    }
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.() || [];
      document.body.classList.toggle("desktop-camera-unavailable", !devices.some(device => device.kind === "videoinput"));
    } catch {
      document.body.classList.add("desktop-camera-unavailable");
    }
  }
  function createDocTitleRow(titleText, saved) {
    const header = document.createElement("div");
    header.className = "doc-row-header";
    const title = document.createElement("h3");
    title.textContent = titleText;
    header.append(title);
    if (saved) header.append(createCloudSavedIndicator());
    return header;
  }
  function addModifiedLabel(row, saved) {
    if (!saved) { row.querySelector(".doc-modified")?.remove(); return; }
    let label = row.querySelector(".doc-modified");
    if (!label) { label = document.createElement("p"); label.className = "doc-modified"; label.setAttribute("aria-label", "Document modified time"); }
    label.textContent = `Modified · ${formatModifiedDate(saved)}`;
    row.querySelector(".doc-state")?.insertAdjacentElement("afterend", label);
  }
  function addFileDetails(row, saved) {
    row._savedDocument = saved || null;
    row._fileDetails = null;
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
        try { const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, {}, true); const savedFile = new File([blob], saved.filename, {type:saved.contentType || blob.type}); setPreview(stored, savedFile, "Saved", saved); showFullscreenPreview(savedFile, saved); }
        catch(error) { openLabel.textContent = "Preview unavailable"; open.title = error.message; }
        finally { open.disabled = false; }
      });
      stored.append(tag, open);
    } else setPreview(stored, null, "Saved");
    pair.append(selected, stored); row.append(pair); row._previewPair = pair; addModifiedLabel(row, saved); row._selectedPreview = selected; row._savedDocument = saved || null; addFileDetails(row, saved);
  }
  async function queueFiles(files, host) {
    if (!(await ensureActiveSession())) return;
    const queue = host.querySelector(".bulk-queue");
    const messages = [];
    for (const file of files) {
      const category = classifyFile(file.name);
      let assigned = "Unmatched";
      if (category === "form20") {
        const row = host.querySelector('[data-doc="form20"]');
        if (row && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) { row._file = file; row._pages = []; row.querySelector(".doc-state").textContent = row._savedDocument ? "Replacement selected" : "Form 20 file selected"; updateDocumentSaveButton(host); await loadSelectedFilePreview(row, file); assigned = "Form 20"; }
        else if (row && file.type.startsWith("image/")) { row._pages = [...(row._pages || []), file]; row._file = null; row.querySelector(".doc-state").textContent = `${row._pages.length} Form 20 photos selected`; updateDocumentSaveButton(host); if (row._pages.length === 1) await loadSelectedFilePreview(row, file); assigned = "Form 20 photos"; }
      } else if (category) {
        const row = host.querySelector(`[data-doc="${category}"]`);
        if (row && !row._file) { row._file = file; row.querySelector(".doc-state").textContent = row._savedDocument ? "Replacement selected" : "File selected"; updateDocumentSaveButton(host); await loadSelectedFilePreview(row, file); assigned = row.querySelector("h3").textContent; }
        else if (row) assigned = "Already has a file; choose another document row";
      }
      const item = document.createElement("div"); item.className = "bulk-file";
      const name = document.createElement("span"); name.textContent = file.name;
      const result = document.createElement("small"); result.textContent = assigned;
      item.append(name, result); queue.append(item); messages.push(`${file.name} → ${assigned}`);
    }
    updateDocumentSaveButton(host);
    status(host.querySelector(".bulk-status"), `${files.length} file${files.length === 1 ? "" : "s"} added. Check each assignment below; unmatched or duplicate files can be selected in a document row.`);
  }
  const actionIconSvg = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m18 6-12 12M6 6l12 12"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h-4L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    preview: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 18v-7m-3 3 3-3 3 3"/></svg>'
  };
  function setIconButton(button, icon, label) {
    button.classList.add("icon-only");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = actionIconSvg[icon];
    const visibleLabel = document.createElement("span");
    visibleLabel.className = "button-label";
    visibleLabel.textContent = label;
    button.append(visibleLabel);
  }
  function renderCustomer(customer) {
    const host = $("customerView"); host.replaceChildren(); host.hidden = false; host._activeDesktopRow = null; document.body.classList.add("customer-editor-open");
    const head = document.createElement("div"); head.className = "customer-heading";
    const titleBlock = document.createElement("div"); const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "CUSTOMER WORKSPACE"; const title = document.createElement("h2"); title.textContent = customer.customerName; const chassis = document.createElement("p"); chassis.className = "muted"; chassis.textContent = customer.chassisNumber; const cloudStatus = createCloudSavedIndicator(false); cloudStatus.classList.add("customer-cloud-status"); titleBlock.append(eyebrow, title, chassis, cloudStatus);
    const controls = document.createElement("div"); controls.className = "customer-controls";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "quiet"; setIconButton(edit, "edit", "Edit details"); edit.addEventListener("click", async () => { if (!(await ensureActiveSession())) return; editingCustomerId = customer._id; $("customerForm").reset(); for (const key of ["chassisNumber", "customerName", "address", "hp", "applicationNumber"]) $(key).value = customer[key] || ""; $("dialogEyebrow").textContent = "EDIT CUSTOMER"; $("dialogTitle").textContent = "Edit customer"; $("customerForm").querySelector("button[type=submit]").textContent = "Save changes"; status($("createStatus"), ""); $("customerDialog").showModal(); });
    const removeCustomer = document.createElement("button"); removeCustomer.type = "button"; removeCustomer.className = "danger"; setIconButton(removeCustomer, "trash", "Delete customer"); removeCustomer.addEventListener("click", async () => { if (!confirm(`Delete ${customer.customerName} and all of its stored documents? This cannot be undone.`)) return; try { await request(`/api/upload-portal/customers/${customer._id}`, { method: "DELETE" }); host.hidden = true; currentCustomer = null; await searchCustomers($("search").value); } catch (error) { alert(error.message); } });
    const close = document.createElement("button"); close.type = "button"; close.className = "quiet"; setIconButton(close, "close", "Close customer"); close.addEventListener("click", () => {
      if (!hasUnsavedEditorChanges(host)) {
        closeCustomerEditor(host);
        return;
      }
      pendingCloseHost = host;
      $("discardChangesDialog").showModal();
    }); controls.append(edit, removeCustomer, close); head.append(titleBlock, controls); host.append(head);
    const fields = document.createElement("div"); fields.className = "customer-fields"; [["Address", customer.address], ["HP", customer.hp], ["Application no.", customer.applicationNumber]].forEach(([label, value]) => { if (value) { const span = document.createElement("span"); span.textContent = `${label}: ${value}`; fields.append(span); } }); host.append(fields);
    const expires = document.createElement("p"); expires.className = "customer-expiry muted"; expires.textContent = `Customer record is automatically deleted after ${new Date(customer.expiresAt).toLocaleDateString()}. Uploaded documents follow your cloud retention setting.`; host.append(expires);
    const bulk = document.createElement("section"); bulk.className = "bulk-upload"; bulk.tabIndex = 0; bulk.setAttribute("aria-label", "Add multiple documents");
    const bulkHeading = document.createElement("div"); bulkHeading.className = "bulk-upload-heading";
    const bulkIcon = document.createElement("span"); bulkIcon.className = "bulk-upload-icon"; bulkIcon.setAttribute("aria-hidden", "true"); bulkIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
    const bulkCopy = document.createElement("div"); bulkCopy.className = "bulk-upload-copy";
    const bulkTitle = document.createElement("strong"); bulkTitle.textContent = "Add multiple documents";
    const bulkHint = document.createElement("span"); bulkHint.textContent = "Drop files here or choose them from your device. Filenames help suggest document rows.";
    bulkCopy.append(bulkTitle, bulkHint); bulkHeading.append(bulkIcon, bulkCopy);
    const picker = document.createElement("input"); picker.type = "file"; picker.multiple = true; picker.accept = "image/*,.pdf"; picker.className = "bulk-picker"; picker.setAttribute("aria-label", "Choose multiple documents");
    const chooseFiles = document.createElement("button"); chooseFiles.type = "button"; chooseFiles.className = "secondary bulk-choose";
    chooseFiles.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 18v-7m-3 3 3-3 3 3"/></svg><span>Choose files</span>';
    chooseFiles.addEventListener("click", async event => { event.stopPropagation(); if (await ensureActiveSession()) picker.click(); });
    const dropzone = document.createElement("div"); dropzone.className = "bulk-upload-dropzone";
    const dropPrompt = document.createElement("span"); dropPrompt.className = "bulk-upload-prompt"; dropPrompt.textContent = "Tap anywhere here to browse, or drag files into this box";
    dropzone.append(dropPrompt, chooseFiles);
    const queue = document.createElement("div"); queue.className = "bulk-queue"; const bulkStatus = document.createElement("p"); bulkStatus.className = "status bulk-status";
    bulk.append(bulkHeading, dropzone, picker, queue, bulkStatus);
    bulk.addEventListener("click", async event => { if (event.target !== chooseFiles && await ensureActiveSession()) picker.click(); });
    bulk.addEventListener("dragover", event => { event.preventDefault(); bulk.classList.add("dragging"); });
    bulk.addEventListener("dragleave", () => bulk.classList.remove("dragging"));
    bulk.addEventListener("drop", event => { event.preventDefault(); bulk.classList.remove("dragging"); void queueFiles([...event.dataTransfer.files], host).catch(error => status(bulkStatus, error.message, "error")); });
    picker.addEventListener("change", () => { const files = [...picker.files]; picker.value = ""; void queueFiles(files, host).catch(error => status(bulkStatus, error.message, "error")); }); host.append(bulk);
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
      const row = document.createElement("section"); row.className = "doc-row"; row.dataset.doc = id; const titleText = (documentDisplayOrder.indexOf(id) + 1) + ". " + name; const state = document.createElement("div"); state.className = "doc-state"; const saved = customer.documents?.[id]; state.textContent = saved ? "" : "Not selected"; if (saved) state.classList.add("saved"); row.append(createDocTitleRow(titleText, saved), state); addPreviewPair(row, customer, id, saved);
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
      const actions = document.createElement("div"); actions.className = "doc-actions"; const camera = document.createElement("button"); camera.type = "button"; camera.className = "secondary"; setIconButton(camera, "camera", "Camera"); camera.addEventListener("click", () => safeFileInput(id, true)); const browse = document.createElement("button"); browse.type = "button"; browse.className = "secondary"; setIconButton(browse, "upload", "Choose file"); browse.addEventListener("click", () => safeFileInput(id, false)); actions.append(camera, browse);
      if (id === "address-proof") {
        const updateAadhaarOption = () => { const visible = addressTypeSelect.value === "Aadhaar"; aadhaarCaptureControls.hidden = !visible; aadhaarCaptureHint.hidden = !visible; };
        addressTypeSelect.addEventListener("change", async () => {
          if (!(await ensureActiveSession())) {
            addressTypeSelect.value = addressTypeSelect.dataset.savedValue || "";
            return;
          }
          addressTypeSelect.dataset.savedValue = addressTypeSelect.value;
          updateAadhaarOption();
        });
        addressTypeSelect.dataset.savedValue = addressTypeSelect.value;
        updateAadhaarOption();
      }
      if (saved) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; setIconButton(remove, "trash", "Remove document"); remove.addEventListener("click", async () => { if (!confirm(`Remove ${name}?`)) return; try { await request(`/api/upload-portal/customers/${customer._id}/documents/${id}`, { method: "DELETE" }); await openCustomer(customer._id); } catch (error) { alert(error.message); } }); actions.append(remove); }
      row.append(actions); list.append(row);
    });
    const form20 = document.createElement("section"); form20.className = "doc-row full"; form20.dataset.doc = "form20"; const saved20 = customer.documents?.form20; const ftitle = createDocTitleRow((documentDisplayOrder.indexOf("form20") + 1) + ". Form 20 (Finance)", saved20); const fstate = document.createElement("div"); fstate.className = `doc-state${saved20 ? " saved" : ""}`; fstate.textContent = saved20 ? "" : "Upload a PDF (3+ pages) or capture three photos"; form20.append(ftitle, fstate); addPreviewPair(form20, customer, "form20", saved20);
    const form20Actions = document.createElement("div"); form20Actions.className = "doc-actions form20-actions";
    const form20CaptureControls = document.createElement("div"); form20CaptureControls.className = "doc-actions native-capture-group";
    addNativeMultiPhotoCapture(form20CaptureControls, form20, {
      labels:["Page 1", "Page 2", "Page 3"], documentName:"Form 20", saveLabel:"Combine and save Form 20 PDF",
      onSave:(photos, progress) => saveCapturedForm20(customer, host, form20, photos, progress)
    });
    form20Actions.append(form20CaptureControls);
    const choose20 = document.createElement("button"); choose20.type = "button"; choose20.className = "secondary"; setIconButton(choose20, "upload", "Choose Form 20 PDF or photos");
    choose20.addEventListener("click", async () => { if (!(await ensureActiveSession())) return; const input = document.createElement("input"); input.type = "file"; input.accept = "application/pdf,image/*"; input.multiple = true; input.addEventListener("change", async () => {
      if (!(await ensureActiveSession())) return;
      const files = [...(input.files || [])]; const pdfs = files.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length) { if (pdfs.length !== 1 || files.length !== 1) { status($("saveStatus"), "Choose one Form 20 PDF by itself.", "error"); return; } form20._file = pdfs[0]; form20._pages = []; form20.querySelector(".doc-state").textContent = form20._savedDocument ? "Replacement selected" : "Form 20 file selected"; updateDocumentSaveButton(host); await loadSelectedFilePreview(form20, pdfs[0]); }
      else { form20._file = null; form20._pages = files.slice(0, 30); form20.querySelector(".doc-state").textContent = files.length ? `${files.length} Form 20 photos selected` : "Upload a PDF (3+ pages) or capture three photos"; updateDocumentSaveButton(host); if (files[0]) await loadSelectedFilePreview(form20, files[0]); else setPreview(form20._selectedPreview, null, "Selected"); }
    }); input.click(); });
    form20Actions.append(choose20); form20.append(form20Actions); list.insertBefore(form20, list.children[3] || null); host.append(list);
    const bar = document.createElement("div"); bar.className = "save-bar"; const result = document.createElement("p"); result.id = "saveStatus"; result.className = "status save-description"; result.textContent = "Select files to save (up to 12)."; const save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = "Save selected"; save.disabled = true; save.addEventListener("click", () => saveDocuments(customer, host, save)); bar.append(result, save); host.append(bar); updateDocumentSaveButton(host);
  }
  async function openCustomer(id) { try { const data = await request(`/api/upload-portal/customers/${id}`); currentCustomer = data.customer; renderCustomer(currentCustomer); } catch (error) { status($("searchStatus"), error.message, "error"); } }
  async function saveDocuments(customer, host, button) {
    if (!hasPendingDocumentChanges(host)) return;
    button.disabled = true;
    if (!(await ensureActiveSession())) { updateDocumentSaveButton(host); return; }
    setSaveBarrier(true); const result = $("saveStatus"); let saved = 0; const failures = [];
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
        if (autoForm20AsInspection) {
          try { await copyForm20ToInspection(customer, preparedForm20, form20File); saved++; }
          catch (error) { failures.push(`Form 20 Inspection copy: ${error.message}`); }
        }
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
          if (autoForm20AsInspection) {
            try { await copyForm20ToInspection(customer, preparedForm20, form20Pdf); saved++; }
            catch (error) { failures.push(`Form 20 Inspection copy: ${error.message}`); }
          }
        } catch (error) { failures.push(`Form 20: ${error.message}`); }
      }
    }
    try { const updated = await request(`/api/upload-portal/customers/${customer._id}`); currentCustomer = updated.customer; renderCustomer(currentCustomer); await searchCustomers($("search").value); status($("saveStatus"), failures.length ? `${saved} saved. ${failures.join(" ")}` : `${saved ? `${saved} document${saved === 1 ? "" : "s"} saved and prepared for VAHAN.` : "No new documents selected."}`, failures.length ? "error" : "success"); }
    catch (error) { const response = host.querySelector("#saveStatus") || result; status(response, error.message, "error"); }
    finally { setSaveBarrier(false); updateDocumentSaveButton(host); }
  }
  void validate();
})();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && token && sessionExpiry && Date.now() >= sessionExpiry) expireSession();
  });
