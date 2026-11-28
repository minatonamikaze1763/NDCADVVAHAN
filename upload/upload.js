"use strict";
(() => {
  const API = "https://server.nextdimensioncustoms.in";
  const $ = id => document.getElementById(id);
  function localDateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  const tokenKey = "ndcCloudWorkspaceToken";
  const expiryKey = "ndcCloudWorkspaceExpiresAt";
  // Legacy workspace clients stored an extension-scope token. Clear only this page's old keys; never migrate or revoke that token.
  for (const key of ["ndcUploadPortalToken", "ndcUploadPortalExpiresAt"]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
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
  let autoForm20AsInspection = false;
  let smartScanEnabled = false;
  let smartScanModulePromise = null;
  let customerOCREnabled = false;
  let customerSmartScanModulePromise = null;
  let customerSmartScan = null;
  let sessionValidationPromise = null;
  let logoutInProgress = false;

  async function ensureCustomerSmartScan() {
    if (!customerSmartScanModulePromise) customerSmartScanModulePromise = import("./smart-scan/smart-scan.js").then(module => { customerSmartScan = module.mount($("ndcSmartScanCustomerHost"), { visibility: { enabled: customerOCREnabled, isNew: !editingCustomerId, purpose: $("customerPurpose").value }, bridge: { request, prepareUploadFile } }); return customerSmartScan; });
    return customerSmartScanModulePromise;
  }
  async function syncNdcSmartScanCustomer() {
    const visibility = { enabled: customerOCREnabled, isNew: !editingCustomerId, purpose: $("customerPurpose").value };
    if (!customerOCREnabled || !visibility.isNew || visibility.purpose !== "tr-and-documents-upload") { customerSmartScan?.setVisibility(visibility); return; }
    const scan = await ensureCustomerSmartScan(); scan.setVisibility(visibility);
  }

  let editingCustomerId = null;
  let editingCustomerPurpose = null;
  const categories = [
    ["frontphoto", "Owners Photo with Vehicle"], ["chassis-photo", "Photo of chassis"],
    ["address-proof", "Address Proof"], ["insurance", "Certificate of Insurance"],
    ["dealer-invoice", "Dealers Invoice"], ["form20", "Form 20 (Finance)"],
    ["inspection", "Inspection"], ["form22", "Form 22"],
    ["form21", "Form 21"], ["owner-signature", "Owners Signature"],
    ["pan-card", "PAN Card"], ["owner-photo", "Owners Photo"]
  ];
  const addressTypes = ["Aadhaar", "Bank Passbook", "Electricity Bill", "Gas Bill", "Water Bill", "Passport", "Voter ID", "Ration Card", "Telephone Bill", "GST Certificate"];
  const documentDisplayOrder = ["address-proof", "insurance", "dealer-invoice", "inspection", "form22", "form21", "frontphoto", "owner-photo", "owner-signature", "pan-card", "chassis-photo", "form20"];
  const sessionDevice = localStorage.getItem("ndcCloudWorkspaceDeviceId") || crypto.randomUUID();
  localStorage.setItem("ndcCloudWorkspaceDeviceId", sessionDevice);
  function status(el, message, type = "") { if (!el) return; el.textContent = message; el.className = `status ${type}`; }
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
    if (host?.querySelector(".bulk-queue .bulk-file")) return false;
    return [...host.querySelectorAll(".doc-row[data-doc]")].some(row =>
      Boolean(row._file) || (Array.isArray(row._pages) && row._pages.length > 0)
    );
  }
  function hasUnsavedEditorChanges(host) {
    return Boolean(host?.querySelector(".bulk-queue .bulk-file")) || [...host.querySelectorAll(".doc-row[data-doc]")].some(row =>
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
  }
  function updateDocumentSaveButton(host) {
    const button = host?.querySelector(".save-bar .primary");
    if (button) button.disabled = !hasPendingDocumentChanges(host);
  }
  function setSaveBarrier(active, title = "Preparing your documents", description = "Please wait. Documents are being renamed, compressed, and saved to the cloud.") {
    const barrier = $("saveBarrier");
    if (!barrier) return;
    if (active) {
      $("saveBarrierTitle").textContent = title;
      $("saveBarrierDescription").textContent = description;
      const eyebrow = barrier.querySelector(".eyebrow");
      if (eyebrow) eyebrow.textContent = title === "Preparing your documents" ? "VAHAN CLOUD · SAVE IN PROGRESS" : "VAHAN CLOUD · PLEASE WAIT";
    }
    barrier.hidden = !active;
    document.body.classList.toggle("save-active", active);
    if (active) barrier.focus({preventScroll:true});
  }
  async function withLoadingBarrier(title, description, action) {
    setSaveBarrier(true, title, description);
    try { return await action(); }
    finally { setSaveBarrier(false); }
  }
  function hasCloudSubscription(user) { return user?.cloudAddon?.active === true; }
  async function rejectCloudSubscription() {
    const message = "Cloud subscription not taken. Choose a Cloud Storage add-on in your customer panel to use /upload.";
    const oldToken = token;
    if (oldToken) {
      try { await fetch(API + "/api/cloud/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + oldToken } }); } catch {}
    }
    clearClientSession();
    showLogin();
    status($("loginStatus"), message, "error");
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
          const data = await request("/api/cloud/auth/me");
          if (!hasCloudSubscription(data.user)) {
            await rejectCloudSubscription();
            return false;
          }
          if (!saveSessionExpiry(data.sessionExpiresAt)) {
            expireSession();
            return false;
          }
          setWelcomeBack(data.user?.username || "");
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
    const isAuthCheck = path === "/api/cloud/auth/login" || path === "/api/cloud/auth/me";
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
      if (data?.code === "CLOUD_ENTITLEMENT_REQUIRED" || data?.code === "CLOUD_SUBSCRIPTION_REQUIRED") {
        expireSession("Cloud subscription not taken. Choose a Cloud Storage add-on in your customer panel to use /upload.");
      } else if (data?.code === "SESSION_REVOKED") expireSession("This Cloud Workspace session was signed out or revoked. Sign in again to continue.");
      else if (data?.code === "SESSION_EXPIRED" || response.status === 401 || response.status === 403) expireSession("Your Cloud Workspace session is no longer valid. Sign in again to continue.");
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.code = data?.code || null;
      throw error;
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
  function setWelcomeBack(username) {
    const welcome = $("welcomeBack");
    if (!welcome) return;
    const accountName = typeof username === "string" ? username.trim() : "";
    welcome.textContent = accountName ? "Welcome back, " + accountName : "Welcome back";
    welcome.hidden = false;
  }
  function showLogin() { $("loginView").hidden = false; $("appView").hidden = true; $("logout").hidden = true; $("settingsToggle").hidden = true; $("welcomeBack").hidden = true; }
  function showApp() { $("loginView").hidden = true; $("appView").hidden = false; $("logout").hidden = false; $("settingsToggle").hidden = false; if ($("welcomeBack").hidden) setWelcomeBack(""); }
  async function loadSettings() {
    const data = await request("/api/upload-portal/settings");
    autoForm20AsInspection = data.autoForm20AsInspection === true;
    smartScanEnabled = data.smartScanEnabled === true;
    customerOCREnabled = data.customerOCREnabled === true;
    void syncNdcSmartScanCustomer();
    $("autoForm20AsInspection").checked = autoForm20AsInspection;
    $("saveRetention").disabled = true;
    status($("settingsStatus"), "");
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
  const updateSettingsSaveState = () => {
    $("saveRetention").disabled = $("autoForm20AsInspection").checked === autoForm20AsInspection;
  };
  const restoreSettingsControls = () => {
    $("autoForm20AsInspection").checked = autoForm20AsInspection;
    updateSettingsSaveState();
  };
  $("autoForm20AsInspection").addEventListener("change", async () => {
    if (!(await ensureActiveSession())) { restoreSettingsControls(); return; }
    status($("settingsStatus"), "");
    updateSettingsSaveState();
  });
  $("saveRetention").addEventListener("click", async () => {
    const button = $("saveRetention");
    if (button.disabled) return;
    if (!(await ensureActiveSession())) { restoreSettingsControls(); return; }
    button.disabled = true;
    try {
      const data = await request("/api/upload-portal/settings", {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({autoForm20AsInspection:$("autoForm20AsInspection").checked})
      });
      autoForm20AsInspection = data.autoForm20AsInspection === true;
      $("autoForm20AsInspection").checked = autoForm20AsInspection;
      button.disabled = true;
      status($("settingsStatus"), "Settings saved", "success");
    } catch (error) {
      status($("settingsStatus"), error.message, "error");
      updateSettingsSaveState();
    }
  });
  function setSessionBarrier(active) {
    $("sessionBarrier").hidden = !active;
  }
  async function validate() {
    if (!token) return showLogin();
    if (sessionExpiry && Date.now() >= sessionExpiry) return expireSession();
    setSessionBarrier(true);
    try {
      const data = await request("/api/cloud/auth/me");
      if (!hasCloudSubscription(data.user)) return rejectCloudSubscription();
      if (!saveSessionExpiry(data.sessionExpiresAt)) return expireSession();
      showApp();
      setSessionBarrier(false);
      await Promise.all([
        searchCustomers(""),
        loadSettings().catch(error => status($("settingsStatus"), error.message, "error"))
      ]);
    } catch (error) {
      if (error.code === "CLOUD_SUBSCRIPTION_REQUIRED") return rejectCloudSubscription();
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
      const data = await request("/api/cloud/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: $("password").value, deviceId: sessionDevice }) });
      token = data.token;
      if (!hasCloudSubscription(data.user)) {
        await rejectCloudSubscription();
        button.disabled = false;
        return;
      }
      localStorage.setItem(tokenKey, token);
      sessionStorage.removeItem(tokenKey);
      if (!saveSessionExpiry(data.expiresAt)) throw new Error("The server did not return a valid 24-hour session expiry.");
      saveRememberedAccount(username);
      setWelcomeBack(data.user?.username || username); $("password").value = ""; showApp();
      await Promise.all([
        searchCustomers(""),
        loadSettings().catch(error => status($("settingsStatus"), error.message, "error"))
      ]);
      status($("loginStatus"), "Signed in. Your session is valid for up to 24 hours.", "success");
    } catch (error) { status($("loginStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  $("settingsView").hidden = true;
  async function closeLogoutDialog() {
    const dialog = $("logoutDialog");
    if (!dialog.open) return;
    dialog.classList.add("is-closing");
    await new Promise(resolve => setTimeout(resolve, 180));
    dialog.close();
    dialog.classList.remove("is-closing");
  }
  $("logout").addEventListener("click", () => {
    if (logoutInProgress || $("logoutDialog").open) return;
    $("logoutLoading").hidden = true;
    $("logoutMessage").hidden = false;
    $("cancelLogout").disabled = false;
    $("confirmLogout").disabled = false;
    $("logoutDialog").classList.remove("is-closing");
    $("logoutDialog").showModal();
  });
  $("cancelLogout").addEventListener("click", () => { void closeLogoutDialog(); });
  $("logoutDialog").addEventListener("cancel", event => {
    event.preventDefault();
    if (!logoutInProgress) void closeLogoutDialog();
  });
  $("logoutDialog").addEventListener("click", event => {
    if (event.target === $("logoutDialog") && !logoutInProgress) void closeLogoutDialog();
  });
  $("confirmLogout").addEventListener("click", async () => {
    if (logoutInProgress) return;
    logoutInProgress = true;
    $("cancelLogout").disabled = true;
    $("confirmLogout").disabled = true;
    $("logoutLoading").hidden = false;
    $("logoutMessage").hidden = true;

    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let logoutWarning = "";
    let logoutRequest;
    try {
      // Start server-side revocation immediately; do not wait for a UI animation or auth preflight.
      logoutRequest = fetch(API + "/api/cloud/auth/logout", { method: "POST", headers });
    } catch (error) {
      logoutWarning = "This device was signed out, but the server could not confirm session revocation. Reconnect and sign out again.";
    }
    clearClientSession();
    try {
      const response = await logoutRequest;
      if (response && !response.ok && response.status !== 401 && response.status !== 403) {
        logoutWarning = "This device was signed out, but the server could not confirm session revocation. Reconnect and sign out again.";
      }
    } catch (error) {
      logoutWarning = "This device was signed out, but the server could not confirm session revocation. Reconnect and sign out again.";
    }

    currentCustomer = null;
    $("customerView").hidden = true;
    await closeLogoutDialog();
    const appView = $("appView");
    appView.classList.add("logout-fade-out");
    await new Promise(resolve => setTimeout(resolve, 200));
    showLogin();
    appView.classList.remove("logout-fade-out");
    if (logoutWarning) status($("loginStatus"), logoutWarning, "error");
    logoutInProgress = false;
  });
  function syncFinancerField() { const financing = $("paymentMode").value === "Finance"; $("financerField").hidden = !financing; $("financerName").disabled = !financing; $("financerName").required = financing; if (!financing) $("financerName").value = ""; }
  function syncDistrictOptions(selectedCode = "") {
    const selector = $("districtCode");
    const stateName = $("stateName").value;
    const districts = (window.NDC_TELANGANA_DISTRICT_MANDALS || [])
      .filter(item => item.stateName === stateName);
    selector.replaceChildren(new Option("Select district", ""));
    for (const item of districts) selector.add(new Option(item.district, item.districtCode));
    selector.disabled = districts.length === 0;
    selector.value = districts.some(item => item.districtCode === String(selectedCode)) ? String(selectedCode) : "";
    syncMandalOptions();
  }
  function syncMandalOptions(selectedValue = "", legacyName = "") {
    const selector = $("talukaCode");
    const district = (window.NDC_TELANGANA_DISTRICT_MANDALS || []).find(item =>
      item.stateName === $("stateName").value && item.districtCode === $("districtCode").value);
    selector.replaceChildren(new Option(district ? "Select Mandal / taluka" : "Select district first", ""));
    const options = district?.mandals || [];
    for (const mandal of options) selector.add(new Option(mandal.name, mandal.value));
    selector.disabled = !district || options.length === 0;
    let wanted = String(selectedValue || "");
    if (!wanted && legacyName) {
      const matches = options.filter(item => item.name.trim().toLocaleLowerCase() === String(legacyName).trim().toLocaleLowerCase());
      if (matches.length === 1) wanted = matches[0].value;
    }
    selector.value = options.some(item => item.value === wanted) ? wanted : "";
  }
  function syncAddressFields() {
    const usePermanentAddress = $("addressFillType").value === "1";
    document.querySelectorAll("[data-address-manual-field]").forEach(label => {
      const input = label.querySelector("input");
      label.hidden = usePermanentAddress;
      if (input) { input.required = !usePermanentAddress; input.disabled = usePermanentAddress; }
    });
  }
  let purposeFieldStates = null;
  function restorePurposeFieldStates() {
    if (!purposeFieldStates) return;
    purposeFieldStates.forEach((state, control) => {
      control.disabled = state.disabled;
      control.required = state.required;
    });
    purposeFieldStates = null;
  }
  function syncCustomerPurpose() {
    void syncNdcSmartScanCustomer();
    const documentOnly = $("customerPurpose").value === "document-upload";
    const keepVisible = new Set(["customerName", "chassisNumber", "customerPurpose"]);
    const fields = [...$("customerForm").querySelectorAll(".customer-field")];
    const canUpgradePurpose = Boolean(editingCustomerId) && editingCustomerPurpose === "document-upload";
    $("customerPurpose").closest(".customer-field").hidden = Boolean(editingCustomerId) && !canUpgradePurpose;
    if (documentOnly) {
      if (!purposeFieldStates) purposeFieldStates = new Map();
      fields.forEach(label => {
        const controls = [...label.querySelectorAll("input, select, textarea")];
        if (controls.some(control => keepVisible.has(control.id))) return;
        label.hidden = true;
        controls.forEach(control => {
          if (!purposeFieldStates.has(control)) purposeFieldStates.set(control, { disabled: control.disabled, required: control.required });
          control.disabled = true;
          control.required = false;
        });
      });
      return;
    }
    fields.forEach(label => { label.hidden = false; });
    $("customerPurpose").closest(".customer-field").hidden = Boolean(editingCustomerId) && !canUpgradePurpose;
    restorePurposeFieldStates();
    syncFinancerField();
    syncAddressFields();
    syncDistrictOptions($("districtCode").value);
  }
  $("stateName").addEventListener("change", () => syncDistrictOptions());
  $("districtCode").addEventListener("change", () => syncMandalOptions());
  $("paymentMode").addEventListener("change", syncFinancerField);
  $("addressFillType").addEventListener("change", syncAddressFields);
  $("customerPurpose").addEventListener("change", syncCustomerPurpose);
  $("newCustomer").addEventListener("click", async () => { if (!(await ensureActiveSession())) return; if (customerSmartScan?.pendingCustomerId) { status($("createStatus"), "Retry the pending customer document attachments before starting another customer.", "error"); return; } customerSmartScan?.reset(); restorePurposeFieldStates(); editingCustomerId = null; editingCustomerPurpose = null; $("customerForm").reset(); syncFinancerField(); syncAddressFields(); syncDistrictOptions(); syncCustomerPurpose(); $("dialogEyebrow").textContent = "NEW CUSTOMER"; $("dialogTitle").textContent = "Create customer"; $("customerForm").querySelector("button[type=submit]").textContent = "Create customer"; status($("createStatus"), ""); $("customerDialog").showModal(); void syncNdcSmartScanCustomer(); });
  $("closeDialog").addEventListener("click", () => { if (!customerSmartScan?.pendingCustomerId) customerSmartScan?.clear(); $("customerDialog").close(); });
  $("customerDialog").addEventListener("close", () => { if (!customerSmartScan?.pendingCustomerId) customerSmartScan?.clear(); });
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
  const formatAadhaar = value => (value.replace(/[^0-9]/g, "").slice(0, 12).match(/.{1,4}/g) || []).join(" ");
  $("aadhaarNumber").addEventListener("input", event => {
    const field = event.target;
    const digitsBefore = field.value.slice(0, field.selectionStart).replace(/[^0-9]/g, "").length;
    field.value = formatAadhaar(field.value);
    const cursor = Math.min(field.value.length, digitsBefore + Math.floor(Math.max(0, digitsBefore - 1) / 4));
    field.setSelectionRange(cursor, cursor);
  });
  $("customerForm").addEventListener("submit", async event => {
    event.preventDefault();
    const id = editingCustomerId;
    const chassisNumber = $("chassisNumber").value.trim();
    if (!id && !/^[A-Za-z0-9]{17}$/.test(chassisNumber)) {
      status($("createStatus"), "Enter a 17-character chassis number using letters and numbers only.", "error");
      $("chassisNumber").focus();
      return;
    }
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    status($("createStatus"), id ? "Saving customer…" : "Creating customer…");
    try {
      if (!id && customerSmartScan?.pendingCustomerId) { const pendingId = customerSmartScan.pendingCustomerId; const retry = await customerSmartScan.retryAttachments(); if (!retry.success) { status($("createStatus"), "Customer exists. Retry the pending document attachments above; do not submit again.", "error"); return; } customerSmartScan.clear(); $("customerDialog").close(); await openCustomer(pendingId); await searchCustomers($("search").value); return; }
      const customerPurpose = $("customerPurpose").value || "tr-and-documents-upload";
      const customerData = { chassisNumber: id ? $("chassisNumber").value : chassisNumber, customerName: $("customerName").value };
      if (!id) customerData.customerPurpose = customerPurpose;
      else if (editingCustomerPurpose === "document-upload" && customerPurpose === "tr-and-documents-upload") customerData.customerPurpose = customerPurpose;
      if (customerPurpose !== "document-upload") Object.assign(customerData, { careOfName: $("careOfName").value.trim().toUpperCase(), stateName: $("stateName").value, ownershipType: $("ownershipType").value, specialNumberSelection: $("specialNumberSelection").value, engineNumber: $("engineNumber").value, ownerCategory: $("ownerCategory").value, mobileNumber: $("mobileNumber").value, panNumber: $("panNumber").value.trim().toUpperCase(), aadhaarNumber: $("aadhaarNumber").value.replace(/[^0-9]/g, ""), addressFillType: $("addressFillType").value, houseNumber: $("houseNumber").value, villageTown: $("villageTown").value, landmark: $("landmark").value, districtCode: $("districtCode").value, talukaCode: $("talukaCode").value, talukaName: $("talukaCode").selectedOptions[0]?.textContent.trim() || "", pincode: $("pincode").value, paymentMode: $("paymentMode").value, financerName: $("financerName").value, insuranceType: $("insuranceType").value, insuranceCompany: $("insuranceCompany").value, insurancePolicyNumber: $("insurancePolicyNumber").value, insuranceStartDate: $("insuranceStartDate").value, applicationNumber: $("applicationNumber").value });
      const body = JSON.stringify(customerData);
      const data = await request(id ? `/api/upload-portal/customers/${id}` : "/api/upload-portal/customers", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body });
      if (!id && customerSmartScan?.hasFiles()) { const attached = await customerSmartScan.afterCreate(data.customer._id, { request, prepareUploadFile }); if (!attached.success) { status($("createStatus"), "Customer was created, but attachments failed. Retry them above; do not submit again.", "error"); return; } customerSmartScan.clear(); }
      $("customerDialog").close(); if (id) await openCustomer(id); else await openCustomer(data.customer._id); await searchCustomers($("search").value);
    } catch (error) { status($("createStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  const defaultRecordDate = localDateInputValue();
  $("customerFromDate").value = defaultRecordDate;
  $("customerToDate").value = defaultRecordDate;
  $("customerDateFilter").addEventListener("submit", event => {
    event.preventDefault();
    const from = $("customerFromDate").value;
    const to = $("customerToDate").value;
    if (!from || !to) { status($("searchStatus"), "Choose both From and To dates.", "error"); return; }
    if (from > to) { status($("searchStatus"), "From date must be on or before To date.", "error"); return; }
    searchCustomers($("search").value);
  });
  $("todayDateFilter").addEventListener("click", () => {
    const today = localDateInputValue();
    $("customerFromDate").value = today;
    $("customerToDate").value = today;
    searchCustomers($("search").value);
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
      const params = new URLSearchParams({
        q: query,
        from: $("customerFromDate").value || localDateInputValue(),
        to: $("customerToDate").value || localDateInputValue()
      });
      const data = await request(`/api/upload-portal/customers?${params.toString()}`);
      if (requestSequence !== customerSearchSequence) return;
      host.replaceChildren();
      host.removeAttribute("aria-busy");
      data.customers.forEach(customer => {
        const button = document.createElement("button"); button.type = "button"; button.className = "result-row";
        const title = document.createElement("span"); title.textContent = customer.customerName; const meta = document.createElement("small"); meta.textContent = `${customer.chassisNumber} · Created ${formatRecordCreatedAt(customer.createdAt)} · ${Object.keys(customer.documents || {}).length} documents saved`;
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
      let selected = input.files[0];
      if (isCamera && (smartScanEnabled || category === "inspection")) {
        try {
          await ensureSmartScanModule();
          while (selected) {
            const scanned = await window.NDCSmartScan.openEditor({file:selected,category,maxBytes:category === "form20" ? 390 * 1024 : 400000});
            if (!scanned) return;
            if (scanned.retake) {
              selected = await capturePhotoFromDefaultCamera();
              continue;
            }
            selected = scanned;
            break;
          }
          if (!selected) return;
        } catch (error) {
          status($("saveStatus"), error.message, "error");
          return;
        }
      }
      row._file = selected; row._pages = [];
      row.querySelector(".doc-state").textContent = row._savedDocument ? (isCamera && smartScanEnabled ? "Scanned replacement ready" : "Replacement selected") : (isCamera && smartScanEnabled ? "Scanned image ready" : "File selected");
      updateDocumentSaveButton($("customerView"));
      await loadSelectedFilePreview(row, row._file);
    });
    input.click();
  }
  async function selectSmartScan(category, multiple = false) {
    if (!smartScanEnabled || !(await ensureActiveSession())) return null;
    await ensureSmartScanModule();
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = multiple;
    const files = await new Promise(resolve => {
      input.addEventListener("change", () => resolve([...(input.files || [])]), {once:true});
      input.addEventListener("cancel", () => resolve([]), {once:true}); input.click();
    });
    if (category === "form20" && multiple && files.length && files.length !== 3) { status($("saveStatus"), "Select exactly three Form 20 pages.", "error"); return []; }
    const outputs = [];
    for (const selected of files) {
      let source = selected;
      while (source) {
        const maxBytes = category === "form20" && files.length > 1 ? Math.floor((390 * 1024 - 20 * 1024) / files.length) : category === "form20" ? 390 * 1024 : 400000;
        const result = await window.NDCSmartScan.openEditor({file:source, category, maxBytes});
        if (result?.retake) {
          const retry = document.createElement("input"); retry.type = "file"; retry.accept = "image/*";
          source = await new Promise(resolve => { retry.addEventListener("change", () => resolve(retry.files?.[0] || null), {once:true}); retry.addEventListener("cancel", () => resolve(null), {once:true}); retry.click(); });
          continue;
        }
        source = null;
        if (result) outputs.push(result);
      }
    }
    return outputs;
  }
  function ensureSmartScanModule() {
    if (window.NDCSmartScan) return Promise.resolve(window.NDCSmartScan);
    if (!smartScanModulePromise) smartScanModulePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "/upload/smartscan-engine.js?v=magic-color-enhancement-20261126";
      script.onload = () => window.NDCSmartScan ? resolve(window.NDCSmartScan) : reject(new Error("SmartScan did not initialize. Refresh the page and retry."));
      script.onerror = () => { smartScanModulePromise = null; reject(new Error("SmartScan could not be loaded. Check your connection and retry.")); };
      document.head.append(script);
    });
    return smartScanModulePromise;
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
          if (smartScanEnabled) {
            await ensureSmartScanModule();
            const scanned = await window.NDCSmartScan.openEditor({file:photo,category:row.dataset.doc,maxBytes:row.dataset.doc === "form20" ? Math.floor((390 * 1024 - 20 * 1024) / labels.length) : 180000});
            if (!scanned) { progress.textContent = `Scan canceled for ${label}. You can try again.`; return; }
            if (scanned.retake) { progress.textContent = `Retake ${label} and scan it again.`; return; }
            photos[index] = scanned;
          } else photos[index] = photo;
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
    if (file.ndcSmartScan && file.type === "image/jpeg" && file.size <= targetBytes) {
      const scannedBitmap = await createImageBitmap(file);
      try { return {bytes:new Uint8Array(await file.arrayBuffer()),width:scannedBitmap.width,height:scannedBitmap.height}; }
      finally { scannedBitmap.close?.(); }
    }
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
    row._savedDocument = saved || null;
    const state = row.querySelector(".doc-state");
    state.textContent = "";
    state.classList.add("saved");
    const titleRow = row.querySelector(".doc-row-header");
    if (titleRow && !titleRow.querySelector(".cloud-saved-indicator")) titleRow.append(createCloudSavedIndicator());
    const selector = row.querySelector("[data-subcategory]");
    const actions = row.querySelector(".doc-actions");
    row.querySelector(".preview-pair")?.remove();
    row.querySelector(".file-details")?.remove();
    selector?.remove();
    actions?.remove();
    addPreviewPair(row, customer, category, saved);
    if (selector) row.append(selector);
    if (actions) row.append(actions);
    updateDocumentRowDeleteButton(row);
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

    const dialog = document.createElement("dialog");
    dialog.className = "native-preview-dialog";
    dialog.setAttribute("aria-label", `Preview ${file.name || "document"}`);
    const header = document.createElement("header");
    header.className = "native-preview-header";
    const title = document.createElement("strong");
    title.className = "native-preview-title";
    title.textContent = file.name || "Document preview";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "quiet native-preview-close";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    header.append(title, close);

    const content = document.createElement("div");
    content.className = "native-preview-content";
    let mimeType = file.type;
    if (isPdf) mimeType = "application/pdf";
    else if (!mimeType) {
      const extension = String(file.name || "").split(".").pop().toLowerCase();
      mimeType = ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"})[extension] || "application/octet-stream";
    }
    const previewSource = URL.createObjectURL(file.slice(0, file.size, mimeType));
    if (isPdf) {
      const frame = document.createElement("iframe");
      frame.className = "native-preview-pdf";
      frame.title = `Browser PDF preview: ${file.name || "document"}`;
      frame.src = previewSource;
      content.append(frame);
    } else {
      const image = document.createElement("img");
      image.className = "native-preview-image";
      image.alt = file.name || "Image preview";
      image.src = previewSource;
      content.append(image);
    }
    dialog.append(header, content);
    dialog.addEventListener("close", () => {
      URL.revokeObjectURL(previewSource);
      dialog.remove();
    }, {once:true});
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
  }

  function updateDocumentRowDeleteButton(row) {
    const button = row?.querySelector(".doc-delete-action");
    if (!button) return;
    const hasSelected = Boolean(row._file)
      || (Array.isArray(row._pages) && row._pages.length > 0)
      || (Array.isArray(row._nativeCameraPhotos) && row._nativeCameraPhotos.some(Boolean));
    const hasSaved = Boolean(row._savedDocument);
    button.disabled = !hasSelected && !hasSaved;
    const name = row._documentName || "document";
    button.title = hasSelected ? "Clear selected " + name
      : hasSaved ? "Delete saved " + name
      : "No document to delete";
  }
  function setPreview(box, file, label, savedDetails = null) {
    if (box._url) URL.revokeObjectURL(box._url);
    box._previewReady = Promise.resolve();
    box.replaceChildren();
    const tag = document.createElement("span"); tag.className = "file-preview-title"; tag.textContent = label; box.append(tag);
    if (!file) {
      const empty = document.createElement("span"); empty.className = "file-preview-label"; empty.textContent = label === "Selected" ? "No file selected" : "No saved file"; box.append(empty);
    } else {
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
        hint.textContent = "Open in browser PDF viewer";
        pdfButton.append(mark, hint);
        pdfButton.addEventListener("click", () => showFullscreenPreview(file, savedDetails));
        box.append(pdfButton);
      } else {
        const unsupported = document.createElement("span"); unsupported.className = "file-preview-label"; unsupported.textContent = "Preview unavailable"; box.append(unsupported);
      }
      const full = document.createElement("button"); full.type = "button"; full.className = "preview-fullscreen"; full.textContent = "Open browser preview"; full.addEventListener("click", () => showFullscreenPreview(file, savedDetails)); box.append(full);
    }
    const row = box.closest(".doc-row");
    const pair = box.closest(".preview-pair");
    if (row && pair && box === pair.firstElementChild) {
      const filename = row.querySelector(".doc-file-summary-name");
      const preview = row.querySelector(".doc-summary-preview");
      const summary = row.querySelector(".doc-file-summary");
      const hasDocument = Boolean(file || row._savedDocument || row._pages?.length);
      if (summary) summary.hidden = !hasDocument;
      if (filename) filename.textContent = file?.name || row._savedDocument?.filename || (hasDocument ? "Document selected" : "No document saved");
      if (preview) {
        preview.disabled = !(file || row._savedDocument || row._pages?.length);
        preview.setAttribute("aria-label", file || row._pages?.length ? "Preview selected document" : row._savedDocument ? "Preview saved document" : "No document to preview");
        preview.title = preview.getAttribute("aria-label");
      }
      updateDocumentRowDeleteButton(row);
    }
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
  function formatRecordCreatedAt(value) {
    if (!value) return "Date unavailable";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable"
      : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }
  function createCloudSavedIndicator() {
    const indicator = document.createElement("span");
    indicator.className = "cloud-saved-indicator";
    indicator.setAttribute("role", "img");
    indicator.setAttribute("aria-label", "Saved to cloud");
    indicator.title = "Saved to cloud";
    indicator.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.2 18h9.6a4.2 4.2 0 0 0 .4-8.4A5.5 5.5 0 0 0 7 8.4 4.8 4.8 0 0 0 7.2 18Z"/><path d="m9.4 13.2 1.8 1.8 3.8-3.8"/></svg>';
    return indicator;
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
        try {
          await withLoadingBarrier("Loading preview", "Please wait while we load this document preview.", async () => {
            const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, {}, true);
            const savedFile = new File([blob], saved.filename, {type:saved.contentType || blob.type});
            setPreview(stored, savedFile, "Saved", saved);
            await showFullscreenPreview(savedFile, saved);
          });
        } catch(error) { openLabel.textContent = "Preview unavailable"; open.title = error.message; }
        finally { open.disabled = false; }
      });
      stored.append(tag, open);
    } else setPreview(stored, null, "Saved");
    pair.append(selected, stored);
    row.append(pair);
    const summary = document.createElement("div"); summary.className = "doc-file-summary"; summary.hidden = !saved;
    const filename = document.createElement("span"); filename.className = "doc-file-summary-name"; filename.textContent = saved?.filename || "No document saved";
    const preview = document.createElement("button"); preview.type = "button"; preview.className = "secondary icon-only doc-summary-preview"; preview.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const previewLabel = document.createElement("span"); previewLabel.className = "button-label"; previewLabel.textContent = "Preview"; preview.append(previewLabel);
    preview.disabled = !saved; preview.setAttribute("aria-label", saved ? "Preview saved document" : "No document to preview"); preview.title = preview.getAttribute("aria-label");
    preview.addEventListener("click", async () => {
      if (row._file) { showFullscreenPreview(row._file); return; }
      if (row._pages?.length) { showFullscreenPreview(row._pages[0]); return; }
      if (!row._savedDocument) return;
      preview.disabled = true;
      try {
        await withLoadingBarrier("Loading preview", "Please wait while we load this document preview.", async () => {
          const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, {}, true);
          const savedFile = new File([blob], row._savedDocument.filename, {type:row._savedDocument.contentType || blob.type});
          await showFullscreenPreview(savedFile, row._savedDocument);
        });
      } catch(error) { preview.title = error.message || "Preview unavailable"; }
      finally { preview.disabled = false; }
    });
    summary.append(filename, preview); row.append(summary); row._summaryPreviewButton = preview;
    addModifiedLabel(row, saved); row._selectedPreview = selected; row._savedDocument = saved || null; addFileDetails(row, saved);
  }
  function bulkFileAssignmentLabel(category, file) {
    if (!category) return "Unmatched";
    if (category === "form20" && (file.type?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name || ""))) return "Form 20 photos";
    const categoryIndex = categories.findIndex(([id]) => id === category);
    if (categoryIndex < 0) return "Unmatched";
    const displayIndex = documentDisplayOrder.indexOf(category);
    return `${displayIndex >= 0 ? displayIndex + 1 : categoryIndex + 1}. ${categories[categoryIndex][1]}`;
  }
  function resetBulkAssignedRow(row, category, assignedFile) {
    if (!row) return;
    if (row._bulkAssignedFile === assignedFile) {
      row._file = null;
      row._bulkAssignedFile = null;
    }
    if (category === "form20" && Array.isArray(row._bulkAssignedPhotos) && row._bulkAssignedPhotos.includes(assignedFile)) {
      row._pages = (row._pages || []).filter(file => file !== assignedFile);
      row._bulkAssignedPhotos = row._bulkAssignedPhotos.filter(file => file !== assignedFile);
    }
    const state = row.querySelector(".doc-state");
    if (state) {
      state.textContent = category === "form20"
        ? (row._savedDocument ? "" : "Upload a PDF (3+ pages) or capture three photos")
        : (row._savedDocument ? "" : "Not selected");
    }
    if (category === "form20" && row._pages?.length) {
      state.textContent = `${row._pages.length} Form 20 photos selected`;
      void loadSelectedFilePreview(row, row._pages[0]);
    } else if (row._selectedPreview) setPreview(row._selectedPreview, null, "Selected");
  }
  function releaseBulkFilePreview(item) {
    const preview = item?.querySelector(".bulk-file-preview");
    if (preview?._url) {
      URL.revokeObjectURL(preview._url);
      preview._url = null;
    }
  }
  function setDocumentRowStatus(row, message) {
    if (!row) return;
    let state = row.querySelector(".doc-state");
    if (!state) {
      state = document.createElement("div");
      state.className = "doc-state";
      const title = row.querySelector(".doc-row-header");
      if (title) title.insertAdjacentElement("afterend", state);
      else row.prepend(state);
    }
    state.textContent = message;
  }
  function updateBulkQueueStatus(host) {
    const count = host?.querySelectorAll(".bulk-queue .bulk-file").length || 0;
    const message = count
      ? count + " loaded file" + (count === 1 ? " still needs" : "s still need") + " a document assignment or removal before saving."
      : "All loaded files are assigned or removed.";
    status(host?.querySelector(".bulk-status"), message);
  }
  async function setBulkFileAssignment(file, item, category, host, automatic = false) {
    const previousCategory = item.dataset.category || "";
    const select = item.querySelector(".bulk-file-category");
    const result = item.querySelector(".bulk-file-message");
    const restoreUnmatched = message => {
      if (select) select.value = previousCategory;
      if (result) result.textContent = message;
      return false;
    };
    if (category === previousCategory) {
      if (result) result.textContent = bulkFileAssignmentLabel(category, file);
      return Boolean(category);
    }
    const targetRow = category ? host.querySelector('[data-doc="' + category + '"]') : null;
    if (category && !targetRow) return restoreUnmatched("Document row is unavailable.");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    const isImage = file.type?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name || "");
    if (category && automatic && targetRow._savedDocument) {
      return restoreUnmatched("Already has an uploaded document. Select this type to overwrite it, or choose another document row.");
    }
    if (category === "form20") {
      const alreadyHasDifferentFile = targetRow._file && targetRow._file !== file;
      const alreadyHasDifferentPages = isPdf && (targetRow._pages || []).length > 0;
      if (alreadyHasDifferentFile || alreadyHasDifferentPages) {
        return restoreUnmatched("Already has another file selected. Choose another document row.");
      }
      if (!isPdf && !isImage) return restoreUnmatched("Form 20 supports PDF or image files.");
    } else if (category && targetRow._file && targetRow._file !== file) {
      return restoreUnmatched("Already has another file selected. Choose another document row.");
    }
    if (previousCategory) {
      const previousRow = host.querySelector('[data-doc="' + previousCategory + '"]');
      if (previousRow?._bulkAssignedFile === file) resetBulkAssignedRow(previousRow, previousCategory, file);
      if (previousCategory === "form20" && previousRow?._bulkAssignedPhotos?.includes(file)) resetBulkAssignedRow(previousRow, previousCategory, file);
    }
    if (category === "form20") {
      if (isPdf) {
        targetRow._file = file;
        targetRow._bulkAssignedFile = file;
        targetRow._pages = [];
        targetRow._bulkAssignedPhotos = [];
        setDocumentRowStatus(targetRow, targetRow._savedDocument ? "Replacement selected" : "Form 20 file selected");
        await loadSelectedFilePreview(targetRow, file);
      } else {
        targetRow._pages = [...(targetRow._pages || []), file];
        targetRow._bulkAssignedPhotos = [...(targetRow._bulkAssignedPhotos || []), file];
        targetRow._file = null;
        setDocumentRowStatus(targetRow, targetRow._savedDocument ? "Replacement selected" : targetRow._pages.length + " Form 20 photos selected");
        if (targetRow._pages.length === 1) await loadSelectedFilePreview(targetRow, file);
      }
    } else if (category) {
      targetRow._file = file;
      targetRow._bulkAssignedFile = file;
      setDocumentRowStatus(targetRow, targetRow._savedDocument ? "Replacement selected" : "File selected");
      await loadSelectedFilePreview(targetRow, file);
    }
    item.dataset.category = category;
    if (category) {
      releaseBulkFilePreview(item);
      item.remove();
    } else {
      if (result) result.textContent = "Unmatched";
    }
    updateDocumentSaveButton(host);
    updateBulkQueueStatus(host);
    return Boolean(category);
  }
  async function queueFiles(files, host) {
    if (!(await ensureActiveSession())) return;
    const queue = host.querySelector(".bulk-queue");
    for (const file of files) {
      const item = document.createElement("div");
      item.className = "bulk-file";
      const name = document.createElement("span");
      name.className = "bulk-file-name";
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "quiet bulk-file-remove";
      setIconButton(remove, "close", "Remove file");
      const preview = document.createElement("div");
      preview.className = "file-preview bulk-file-preview";
      setPreview(preview, file, "Loaded");
      const select = document.createElement("select");
      select.className = "bulk-file-category";
      select.setAttribute("aria-label", "Document type for " + file.name);
      select.add(new Option("Unmatched", ""));
      categories.forEach(([id, label]) => {
        const displayIndex = documentDisplayOrder.indexOf(id);
        select.add(new Option((displayIndex >= 0 ? displayIndex + 1 : categories.findIndex(([category]) => category === id) + 1) + ". " + label, id));
      });
      const result = document.createElement("small");
      result.className = "bulk-file-message";
      const suggestedCategory = classifyFile(file.name);
      const initialCategory = categories.some(([id]) => id === suggestedCategory) ? suggestedCategory : "";
      item.dataset.category = "";
      item.append(name, preview, select, result, remove);
      queue.append(item);
      remove.addEventListener("click", () => {
        releaseBulkFilePreview(item);
        item.remove();
        updateDocumentSaveButton(host);
        updateBulkQueueStatus(host);
      });
      select.addEventListener("change", () => {
        void setBulkFileAssignment(file, item, select.value, host).catch(error => {
          select.value = item.dataset.category || "";
          result.textContent = error.message;
        });
      });
      select.value = initialCategory;
      if (initialCategory) {
        await setBulkFileAssignment(file, item, initialCategory, host, true);
      } else {
        result.textContent = "Unmatched. Choose a document type or remove this file.";
      }
    }
    updateDocumentSaveButton(host);
    updateBulkQueueStatus(host);
  }
  const actionIconSvg = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m18 6-12 12M6 6l12 12"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h-4L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4Z"/><circle cx="12" cy="13" r="3.5"/></svg>',
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
    const host = $("customerView"); host.replaceChildren(); host.hidden = false;
    const head = document.createElement("div"); head.className = "customer-heading";
    const titleBlock = document.createElement("div"); titleBlock.className = "customer-title-block"; const title = document.createElement("h2"); title.textContent = customer.customerName + " - " + customer.chassisNumber;
    const created = document.createElement("p"); created.className = "customer-created-date"; created.textContent = `Created ${formatRecordCreatedAt(customer.createdAt)}`; titleBlock.append(title, created);
    const controls = document.createElement("div"); controls.className = "customer-controls";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "quiet"; setIconButton(edit, "edit", "Edit details"); edit.addEventListener("click", async () => { if (!(await ensureActiveSession())) return; restorePurposeFieldStates(); editingCustomerId = customer._id; editingCustomerPurpose = customer.customerPurpose || "tr-and-documents-upload"; $("customerForm").reset(); $("customerPurpose").value = editingCustomerPurpose; for (const key of ["specialNumberSelection", "customerName", "careOfName", "stateName", "ownershipType", "chassisNumber", "engineNumber", "mobileNumber", "panNumber", "aadhaarNumber", "addressFillType", "houseNumber", "villageTown", "landmark", "pincode", "paymentMode", "financerName", "insuranceType", "insuranceCompany", "insurancePolicyNumber", "insuranceStartDate", "ownerCategory", "applicationNumber"]) $(key).value = customer[key] ?? (key === "ownershipType" ? "Individual" : key === "addressFillType" ? "2" : key === "insuranceType" ? "2" : key === "ownerCategory" ? "7" : ""); $("stateName").value = customer.stateName || "Telangana"; syncDistrictOptions(customer.districtCode || ""); syncMandalOptions(customer.talukaCode, customer.talukaName); $("aadhaarNumber").value = formatAadhaar($("aadhaarNumber").value); syncFinancerField(); syncAddressFields(); syncCustomerPurpose(); $("dialogEyebrow").textContent = "EDIT CUSTOMER"; $("dialogTitle").textContent = "Edit customer"; $("customerForm").querySelector("button[type=submit]").textContent = "Save changes"; status($("createStatus"), ""); $("customerDialog").showModal(); });
    const close = document.createElement("button"); close.type = "button"; close.className = "quiet"; setIconButton(close, "close", "Close customer"); close.addEventListener("click", () => {
      if (!hasUnsavedEditorChanges(host)) {
        closeCustomerEditor(host);
        return;
      }
      pendingCloseHost = host;
      $("discardChangesDialog").showModal();
    }); controls.append(edit, close); head.append(titleBlock, controls); host.append(head);
    const fields = document.createElement("div"); fields.className = "customer-fields"; const savedAddress = [["House number", customer.houseNumber], ["Village / town", customer.villageTown], ["Landmark", customer.landmark], ["State", customer.stateName || "Telangana"], ["District", customer.districtName], ["Pincode", customer.pincode], ["Mandal / taluka", customer.talukaName]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(", "); [["Address", savedAddress || customer.address], ["Special number", customer.specialNumberSelection], ["Engine number", customer.engineNumber], ["Father / C/O / S/O", customer.careOfName], ["Mobile", customer.mobileNumber], ["PAN", customer.panNumber], ["Owner category", customer.ownerCategoryName], ["Cash or finance", customer.paymentMode], ["Financer", customer.financerName], ["Insurance type", customer.insuranceTypeName], ["Insurance company", customer.insuranceCompanyName], ["Insurance policy no.", customer.insurancePolicyNumber], ["Insurance start date", customer.insuranceStartDate], ["HP", customer.hp], ["Application no.", customer.applicationNumber]].forEach(([label, value]) => { if (value) { const span = document.createElement("span"); span.textContent = `${label}: ${value}`; fields.append(span); } }); host.append(fields);
    const expires = document.createElement("p"); expires.className = "customer-expiry muted"; expires.textContent = "Customer records are retained for cloud usage history. Uploaded documents are automatically deleted after 30 days."; host.append(expires);
    const bulk = document.createElement("details"); bulk.className = "bulk-upload"; bulk.tabIndex = 0; bulk.open = window.matchMedia("(max-width:680px)").matches; bulk.setAttribute("aria-label", "Add multiple documents");
    const bulkHeading = document.createElement("summary"); bulkHeading.className = "bulk-upload-heading";
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
    dropzone.addEventListener("click", async event => { if (event.target !== chooseFiles && !event.target.closest("button") && await ensureActiveSession()) picker.click(); });
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
      const row = document.createElement("section"); row.className = "doc-row"; row.dataset.doc = id; row._documentName = name; const titleText = (documentDisplayOrder.indexOf(id) + 1) + ". " + name; const state = document.createElement("div"); state.className = "doc-state"; const saved = customer.documents?.[id]; state.textContent = saved ? "" : "Not selected"; if (saved) state.classList.add("saved"); row.append(createDocTitleRow(titleText, saved), state); addPreviewPair(row, customer, id, saved);
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
      const actions = document.createElement("div"); actions.className = "doc-actions"; const camera = document.createElement("button"); camera.type = "button"; camera.className = "secondary"; setIconButton(camera, "camera", "Camera"); camera.addEventListener("click", () => safeFileInput(id, true)); const browse = document.createElement("button"); browse.type = "button"; browse.className = "secondary"; setIconButton(browse, "upload", "Upload"); browse.addEventListener("click", () => safeFileInput(id, false)); actions.append(camera, browse);
      if (smartScanEnabled) { const scan = document.createElement("button"); scan.type = "button"; scan.className = "secondary smartscan-action"; scan.textContent = "Scan Document"; scan.addEventListener("click", async () => { if (id === "address-proof" && !addressTypeSelect?.value) { status($("saveStatus"), "Choose an Address Proof type before scanning.", "error"); return; } scan.disabled = true; try { const files = await selectSmartScan(id); if (!files?.length) return; row._file = files[0]; row._pages = []; row.querySelector(".doc-state").textContent = row._savedDocument ? "Scanned replacement ready" : "Scanned image ready"; updateDocumentSaveButton($("customerView")); await loadSelectedFilePreview(row, row._file); } catch (error) { status($("saveStatus"), error.message, "error"); } finally { scan.disabled = false; } }); actions.append(scan); }
      actions.append(row._summaryPreviewButton);
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
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger doc-delete-action"; setIconButton(remove, "trash", "Delete"); remove.addEventListener("click", async () => { if (row._file || row._pages?.length || row._nativeCameraPhotos?.some(Boolean)) { row._file = null; row._pages = []; row._nativeCameraPhotos = []; setPreview(row._selectedPreview, null, "Selected"); state.textContent = row._savedDocument ? "" : "Not selected"; state.classList.toggle("saved", Boolean(row._savedDocument)); updateDocumentRowDeleteButton(row); updateDocumentSaveButton(host); return; } const currentSaved = row._savedDocument; if (!currentSaved || !confirm(`Delete ${name}?`)) return; remove.disabled = true; try { await withLoadingBarrier(`Deleting ${name}`, `Please wait. Deleting ${name} from this customer record.`, async () => { await request(`/api/upload-portal/customers/${customer._id}/documents/${id}`, { method: "DELETE" }); }); await openCustomer(customer._id); } catch (error) { alert(error.message); updateDocumentRowDeleteButton(row); } }); actions.append(remove);
      row.append(actions); updateDocumentRowDeleteButton(row); list.append(row);
    });
    const form20 = document.createElement("section"); form20.className = "doc-row full"; form20.dataset.doc = "form20"; form20._documentName = "Form 20 (Finance)"; const saved20 = customer.documents?.form20; form20._savedDocument = saved20 || null; const ftitle = createDocTitleRow("Form 20 (Finance)", saved20); const fstate = document.createElement("div"); fstate.className = `doc-state${saved20 ? " saved" : ""}`; fstate.textContent = saved20 ? "" : "Upload a PDF (3+ pages) or capture three photos"; form20.append(ftitle, fstate); addPreviewPair(form20, customer, "form20", saved20);
    const form20Actions = document.createElement("div"); form20Actions.className = "doc-actions form20-actions form20-action-strip";
    const form20Preview = document.createElement("button"); form20Preview.type = "button"; form20Preview.className = "secondary doc-summary-preview form20-action-preview";
    form20Preview.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span class="button-label">Preview</span>';
    const updateForm20PreviewButton = () => { const available = !!(form20._file || form20._pages?.length || form20._savedDocument); form20Preview.disabled = !available; form20Preview.setAttribute("aria-label", available ? "Preview Form 20" : "No Form 20 to preview"); form20Preview.title = form20Preview.getAttribute("aria-label"); };
    form20Preview.addEventListener("click", async () => {
      if (form20._file) { showFullscreenPreview(form20._file); return; }
      if (form20._pages?.length) { showFullscreenPreview(form20._pages[0]); return; }
      const saved = form20._savedDocument;
      if (!saved) return;
      form20Preview.disabled = true;
      try {
        await withLoadingBarrier("Loading preview", "Please wait while we load this document preview.", async () => {
          const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/form20`, {}, true);
          const savedFile = new File([blob], saved.filename, {type:saved.contentType || blob.type});
          await showFullscreenPreview(savedFile, saved);
        });
      } catch(error) { form20Preview.title = error.message || "Preview unavailable"; }
      finally { updateForm20PreviewButton(); }
    });
    updateForm20PreviewButton();
    form20Actions.append(form20Preview);
    const form20CaptureControls = document.createElement("div"); form20CaptureControls.className = "doc-actions native-capture-group"; form20CaptureControls.hidden = !window.matchMedia("(max-width:680px)").matches;
    addNativeMultiPhotoCapture(form20CaptureControls, form20, {
      labels:["Page 1", "Page 2", "Page 3"], documentName:"Form 20", saveLabel:"Combine and save Form 20 PDF",
      onSave:(photos, progress) => saveCapturedForm20(customer, host, form20, photos, progress)
    });
    form20Actions.append(form20CaptureControls);
    const choose20 = document.createElement("button"); choose20.type = "button"; choose20.className = "secondary"; setIconButton(choose20, "upload", "Upload");
    choose20.addEventListener("click", async () => { if (!(await ensureActiveSession())) return; const input = document.createElement("input"); input.type = "file"; input.accept = "application/pdf,image/*"; input.multiple = true; input.addEventListener("change", async () => {
      if (!(await ensureActiveSession())) return;
      const files = [...(input.files || [])]; const pdfs = files.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length) { if (pdfs.length !== 1 || files.length !== 1) { status($("saveStatus"), "Choose one Form 20 PDF by itself.", "error"); return; } form20._file = pdfs[0]; form20._pages = []; form20.querySelector(".doc-state").textContent = form20._savedDocument ? "Replacement selected" : "Form 20 file selected"; updateDocumentSaveButton(host); updateForm20PreviewButton(); await loadSelectedFilePreview(form20, pdfs[0]); }
      else { form20._file = null; form20._pages = files.slice(0, 30); form20.querySelector(".doc-state").textContent = files.length ? `${files.length} Form 20 photos selected` : "Upload a PDF (3+ pages) or capture three photos"; updateDocumentSaveButton(host); updateForm20PreviewButton(); if (files[0]) await loadSelectedFilePreview(form20, files[0]); else setPreview(form20._selectedPreview, null, "Selected"); }
    }); input.click(); });
    form20Actions.append(choose20);
    if (smartScanEnabled) {
      const scan20 = document.createElement("button"); scan20.type = "button"; scan20.className = "secondary smartscan-action"; scan20.textContent = "Scan Document";
      scan20.addEventListener("click", async () => { scan20.disabled = true; try { const files = await selectSmartScan("form20", true); if (!files?.length) return; if (files.length !== 3) { status($("saveStatus"), "Select or scan exactly three Form 20 pages.", "error"); return; } form20._file = null; form20._pages = files; fstate.textContent = `${files.length} scanned Form 20 page${files.length === 1 ? "" : "s"} ready`; updateForm20PreviewButton(); updateDocumentSaveButton(host); await loadSelectedFilePreview(form20, files[0]); } catch (error) { status($("saveStatus"), error.message, "error"); } finally { scan20.disabled = false; } }); form20Actions.append(scan20);
    }
    const delete20 = document.createElement("button"); delete20.type = "button"; delete20.className = "danger doc-delete-action"; setIconButton(delete20, "trash", "Delete"); delete20.addEventListener("click", async () => { if (form20._file || form20._pages?.length) { form20._file = null; form20._pages = []; setPreview(form20._selectedPreview, null, "Selected"); fstate.textContent = form20._savedDocument ? "" : "Upload a PDF (3+ pages) or capture three photos"; fstate.classList.toggle("saved", Boolean(form20._savedDocument)); updateForm20PreviewButton(); updateDocumentRowDeleteButton(form20); updateDocumentSaveButton(host); return; } const currentSaved = form20._savedDocument; if (!currentSaved || !confirm("Delete Form 20?")) return; delete20.disabled = true; try { await withLoadingBarrier("Deleting Form 20 (Finance)", "Please wait. Deleting Form 20 (Finance) from this customer record.", async () => { await request(`/api/upload-portal/customers/${customer._id}/documents/form20`, { method:"DELETE" }); }); await openCustomer(customer._id); } catch(error) { alert(error.message); updateDocumentRowDeleteButton(form20); } }); form20Actions.append(delete20); form20.append(form20Actions); updateDocumentRowDeleteButton(form20);
    const form20Section = document.createElement("section"); form20Section.className = "form20-section"; form20Section.setAttribute("aria-labelledby", "form20SectionTitle");
    const form20SectionTitle = document.createElement("h2"); form20SectionTitle.id = "form20SectionTitle"; form20SectionTitle.className = "form20-section-title"; form20SectionTitle.textContent = "Form 20 document";
    form20Section.append(form20SectionTitle, form20);
    host.append(list, form20Section);
    const bar = document.createElement("div"); bar.className = "save-bar"; const result = document.createElement("p"); result.id = "saveStatus"; result.className = "status save-description"; result.textContent = "Select files to save (up to 12)."; const save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = "Save selected"; save.disabled = true; save.addEventListener("click", () => saveDocuments(customer, host, save)); bar.append(result, save); host.append(bar); updateDocumentSaveButton(host);
  }
  function scrollCustomerToUploadArea(host) {
    if (!host || !window.matchMedia("(max-width:680px)").matches) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bulk = host.querySelector(".bulk-upload");
      const head = host.querySelector(".customer-heading");
      if (host.hidden || !bulk || !head) return;
      const uploadTop = bulk.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - head.getBoundingClientRect().height - 12;
      host.scrollTo({ top: Math.max(0, uploadTop), behavior: "smooth" });
    }));
  }
  async function openCustomer(id) {
    let loaded = false;
    await withLoadingBarrier("Loading upload panel", "Please wait while we load the customer upload panel.", async () => {
      try {
        const data = await request(`/api/upload-portal/customers/${id}`);
        currentCustomer = data.customer;
        renderCustomer(currentCustomer);
        loaded = true;
      } catch (error) { status($("searchStatus"), error.message, "error"); }
    });
    if (loaded) scrollCustomerToUploadArea($("customerView"));
  }
  async function saveDocuments(customer, host, button) {
    if (!hasPendingDocumentChanges(host)) return;
    button.disabled = true;
    if (!(await ensureActiveSession())) { updateDocumentSaveButton(host); return; }
    setSaveBarrier(true); const result = $("saveStatus"); let saved = 0; const failures = [];
    for (const [category] of categories.filter(([id]) => id !== "form20")) {
      const row = host.querySelector(`[data-doc="${category}"]`); const file = row?._file; if (!file) continue;
      const subcategory = row.querySelector("[data-subcategory]")?.value || ""; if (category === "address-proof" && !subcategory) { failures.push("Address Proof: select a type."); continue; }
      try { status(result, `Preparing ${row.querySelector("h3").textContent}…`); const prepared = await prepareUploadFile(file, category); await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": file.type || "application/octet-stream", "X-NDC-Upload-Type": prepared.type || file.type, "X-NDC-Original-Filename": file.name, "X-NDC-Original-Size": String(file.size), "X-NDC-Original-Last-Modified": String(file.lastModified || Date.now()), ...(file.ndcSmartScan ? {"X-NDC-Processed":"smartscan-v1"} : {}), ...(subcategory ? { "X-NDC-Subcategory": subcategory } : {}) }, body: prepared }); saved++; }
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
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && token && sessionExpiry && Date.now() >= sessionExpiry) expireSession();
  });
  void validate();
})();


