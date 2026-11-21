"use strict";
(() => {
  const API = "https://server.nextdimensioncustoms.in";
  const $ = id => document.getElementById(id);
  const tokenKey = "ndcUploadPortalToken";
  let token = sessionStorage.getItem(tokenKey) || "";
  let currentCustomer = null;
  let searchTimer;
  let form20Slots = 3;
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
  const sessionDevice = localStorage.getItem("ndcUploadPortalDeviceId") || crypto.randomUUID();
  localStorage.setItem("ndcUploadPortalDeviceId", sessionDevice);
  function status(el, message, type = "") { el.textContent = message; el.className = `status ${type}`; }
  async function request(path, options = {}, binary = false) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(API + path, { ...options, headers });
    const type = response.headers.get("content-type") || "";
    if (!response.ok) {
      const data = type.includes("application/json") ? await response.json().catch(() => ({})) : null;
      if (response.status === 401 || response.status === 403) { token = ""; sessionStorage.removeItem(tokenKey); showLogin(); }
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }
    return binary ? response.blob() : type.includes("application/json") ? response.json() : null;
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
    try { await request("/api/auth/me"); showApp(); await searchCustomers(""); }
    catch { showLogin(); }
  }
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
    status($("loginStatus"), "Signing in…");
    try {
      const data = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value, deviceId: sessionDevice }) });
      token = data.token; sessionStorage.setItem(tokenKey, token); $("password").value = ""; showApp(); await searchCustomers("");
      status($("loginStatus"), "Signed in.", "success");
    } catch (error) { status($("loginStatus"), error.message, "error"); }
    finally { button.disabled = false; }
  });
  $("settingsView").hidden = true;
  $("logout").addEventListener("click", async () => { try { await request("/api/auth/logout", { method: "POST" }); } catch {} token = ""; sessionStorage.removeItem(tokenKey); currentCustomer = null; $("customerView").hidden = true; showLogin(); });
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
  function safeFileInput(category, isCamera, page) {
    const input = document.createElement("input"); input.type = "file"; input.accept = isCamera ? "image/*" : "image/*,.pdf"; if (isCamera) input.capture = "environment";
    input.accept = category === "form20" ? "image/*" : input.accept;
    input.addEventListener("change", () => {
      if (category === "form20") {
        const slot = document.querySelector(`[data-form20-page="${page}"]`); slot.dataset.file = "";
        slot._file = input.files?.[0] || null; slot.textContent = slot._file ? `Page ${page}: ${slot._file.name}` : `Page ${page}: Capture or choose`; const form20 = document.querySelector(`[data-doc="form20"]`); if (form20) setPreview(form20._selectedPreview, slot._file, "Selected");
      } else {
        const row = document.querySelector(`[data-doc="${category}"]`); row._file = input.files?.[0] || null;
        row.querySelector(".doc-state").textContent = row._file ? row._file.name : "Not selected"; setPreview(row._selectedPreview, row._file, "Selected");
      }
    });
    input.click();
  }
  function classifyFile(name) {
    return globalThis.NDCDocumentMatcher?.match(name)?.id || "";
  }
  function setPreview(box, file, label) {
    if (box._url) URL.revokeObjectURL(box._url);
    box.replaceChildren();
    const tag = document.createElement("span"); tag.className = "file-preview-title"; tag.textContent = label; box.append(tag);
    if (!file) { const empty = document.createElement("span"); empty.className = "file-preview-label"; empty.textContent = label === "Selected" ? "No file selected" : "No saved file"; box.append(empty); return; }
    const url = URL.createObjectURL(file); box._url = url;
    if (file.type?.startsWith("image/")) { const image = document.createElement("img"); image.src = url; image.alt = file.name || "Document preview"; box.append(image); }
    else { const object = document.createElement("object"); object.data = url; object.type = file.type || "application/pdf"; object.setAttribute("aria-label", file.name || "PDF preview"); box.append(object); }
    const name = document.createElement("span"); name.className = "file-preview-label"; name.textContent = file.name || "Document"; box.append(name);
  }
  function addPreviewPair(row, customer, category, saved) {
    const pair = document.createElement("div"); pair.className = "preview-pair";
    const selected = document.createElement("div"); selected.className = "file-preview"; setPreview(selected, null, "Selected");
    const stored = document.createElement("div"); stored.className = "file-preview";
    if (saved) {
      const tag = document.createElement("span"); tag.className = "file-preview-title"; tag.textContent = "Saved";
      const open = document.createElement("button"); open.type = "button"; open.className = "preview-open"; open.textContent = "Tap to preview saved file";
      open.addEventListener("click", async () => {
        open.disabled = true;
        try { const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, {}, true); setPreview(stored, new File([blob], saved.filename, {type:saved.contentType || blob.type}), "Saved"); }
        catch(error) { open.textContent = error.message; }
        finally { open.disabled = false; }
      });
      stored.append(tag, open);
    } else setPreview(stored, null, "Saved");
    pair.append(selected, stored); row.append(pair); row._selectedPreview = selected;
  }
  function queueFiles(files, host) {
    const queue = host.querySelector(".bulk-queue");
    const messages = [];
    for (const file of files) {
      const category = classifyFile(file.name);
      let assigned = "Unmatched";
      if (category === "form20" && file.type.startsWith("image/")) {
        if (form20Slots < 3) form20Slots = 3;
        let slot = [...host.querySelectorAll("[data-form20-page]")].find(item => !item._file);
        while (!slot && form20Slots < 30) { form20Slots++; addForm20PageSlot(host); slot = host.querySelector(`[data-form20-page="${form20Slots}"]`); }
        if (slot) { slot._file = file; slot.textContent = `Page ${slot.dataset.form20Page}: ${file.name}`; const form20 = host.querySelector(`[data-doc="form20"]`); if (form20) setPreview(form20._selectedPreview, file, "Selected"); assigned = `Form 20 page ${slot.dataset.form20Page}`; }
      } else if (category && category !== "form20") {
        const row = host.querySelector(`[data-doc="${category}"]`);
        if (row && !row._file) { row._file = file; row.querySelector(".doc-state").textContent = file.name; if (row._selectedPreview) setPreview(row._selectedPreview, file, "Selected"); assigned = row.querySelector("h3").textContent; }
        else if (row) assigned = "Already has a file; choose another document row";
      }
      const item = document.createElement("div"); item.className = "bulk-file";
      const name = document.createElement("span"); name.textContent = file.name;
      const result = document.createElement("small"); result.textContent = assigned;
      item.append(name, result); queue.append(item); messages.push(`${file.name} → ${assigned}`);
    }
    status(host.querySelector(".bulk-status"), `${files.length} file${files.length === 1 ? "" : "s"} added. Check each assignment below; unmatched or duplicate files can be selected in a document row.`);
  }
  function addForm20PageSlot(host) {
    const pages = host.querySelector(".form20-pages");
    const pageNumber = form20Slots;
    const group = document.createElement("div"); group.className = "form20-page-control";
    const slot = document.createElement("button"); slot.type = "button"; slot.className = "secondary"; slot.dataset.form20Page = pageNumber; slot.textContent = `Page ${pageNumber}: Capture`; slot.addEventListener("click", () => safeFileInput("form20", true, pageNumber));
    const choose = document.createElement("button"); choose.type = "button"; choose.className = "secondary"; choose.textContent = "Choose image"; choose.addEventListener("click", () => safeFileInput("form20", false, pageNumber));
    group.append(slot, choose); pages.append(group);
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
    const toolbar = document.createElement("div"); toolbar.className = "doc-toolbar"; const label = document.createElement("strong"); label.textContent = "VAHAN documents"; const count = document.createElement("span"); count.className = "muted"; count.textContent = `${Object.keys(customer.documents || {}).length} of 12 saved`; toolbar.append(label, count); host.append(toolbar);
    const list = document.createElement("div"); list.className = "doc-list";
    categories.filter(([id]) => id !== "form20").forEach(([id, name]) => {
      const row = document.createElement("section"); row.className = "doc-row"; row.dataset.doc = id; const h = document.createElement("h3"); h.textContent = name; const state = document.createElement("div"); state.className = "doc-state"; const saved = customer.documents?.[id]; state.textContent = saved ? `Saved · ${saved.filename}` : "Not selected"; if (saved) state.classList.add("saved"); row.append(h, state); addPreviewPair(row, customer, id, saved);
      if (id === "address-proof") { const select = document.createElement("select"); select.className = "subcat"; select.dataset.subcategory = "true"; select.innerHTML = '<option value="">Choose address proof type</option>'; addressTypes.forEach(type => { const option = document.createElement("option"); option.value = type; option.textContent = type; select.append(option); }); const current = saved?.subcategory; if (current) select.value = current; row.append(select); }
      const actions = document.createElement("div"); actions.className = "doc-actions"; const camera = document.createElement("button"); camera.type = "button"; camera.className = "secondary"; camera.textContent = "Camera"; camera.addEventListener("click", () => safeFileInput(id, true)); const browse = document.createElement("button"); browse.type = "button"; browse.className = "secondary"; browse.textContent = "Choose file"; browse.addEventListener("click", () => safeFileInput(id, false)); actions.append(camera, browse);
      if (saved) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Remove"; remove.addEventListener("click", async () => { if (!confirm(`Remove ${name}?`)) return; try { await request(`/api/upload-portal/customers/${customer._id}/documents/${id}`, { method: "DELETE" }); await openCustomer(customer._id); } catch (error) { alert(error.message); } }); actions.append(remove); }
      row.append(actions); list.append(row);
    });
    const form20 = document.createElement("section"); form20.className = "doc-row full"; form20.dataset.doc = "form20"; const ftitle = document.createElement("h3"); ftitle.textContent = "Form 20 (Finance) · multi-page PDF"; const saved20 = customer.documents?.form20; const fstate = document.createElement("div"); fstate.className = `doc-state${saved20 ? " saved" : ""}`; fstate.textContent = saved20 ? `Saved · ${saved20.filename}` : "Add at least three image pages"; form20.append(ftitle, fstate); addPreviewPair(form20, customer, "form20", saved20);
    const pages = document.createElement("div"); pages.className = "form20-pages";
    const addPageSlot = page => {
      const group = document.createElement("div"); group.className = "form20-page-control";
      const slot = document.createElement("button"); slot.type = "button"; slot.className = "secondary"; slot.dataset.form20Page = page; slot.textContent = `Page ${page}: Capture`; slot.addEventListener("click", () => safeFileInput("form20", true, page));
      const choose = document.createElement("button"); choose.type = "button"; choose.className = "secondary"; choose.textContent = "Choose image"; choose.addEventListener("click", () => safeFileInput("form20", false, page));
      group.append(slot, choose); pages.append(group);
    };
    for (let page = 1; page <= form20Slots; page++) addPageSlot(page);
    const addPage = document.createElement("button"); addPage.type = "button"; addPage.className = "secondary add-page"; addPage.textContent = "+ Add page"; addPage.addEventListener("click", () => { if (form20Slots < 30) { form20Slots++; addPageSlot(form20Slots); } if (form20Slots >= 30) addPage.disabled = true; }); form20.append(pages, addPage); list.append(form20); host.append(list);
    const bar = document.createElement("div"); bar.className = "save-bar"; const result = document.createElement("p"); result.id = "saveStatus"; result.className = "status"; result.textContent = "Choose any available documents. You can save fewer than 12."; const save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = "Save selected documents"; save.addEventListener("click", () => saveDocuments(customer, host, save)); bar.append(result, save); host.append(bar);
  }
  async function openCustomer(id) { try { const data = await request(`/api/upload-portal/customers/${id}`); currentCustomer = data.customer; renderCustomer(currentCustomer); } catch (error) { status($("searchStatus"), error.message, "error"); } }
  async function saveDocuments(customer, host, button) {
    button.disabled = true; const result = $("saveStatus"); let saved = 0; const failures = [];
    for (const [category] of categories.filter(([id]) => id !== "form20")) {
      const row = host.querySelector(`[data-doc="${category}"]`); const file = row?._file; if (!file) continue;
      const subcategory = row.querySelector("[data-subcategory]")?.value || ""; if (category === "address-proof" && !subcategory) { failures.push("Address Proof: select a type."); continue; }
      try { status(result, `Preparing ${row.querySelector("h3").textContent}…`); await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": file.type || "application/octet-stream", ...(subcategory ? { "X-NDC-Subcategory": subcategory } : {}) }, body: file }); saved++; }
      catch (error) { failures.push(`${row.querySelector("h3").textContent}: ${error.message}`); }
    }
    const pages = [...host.querySelectorAll("[data-form20-page]")].map(slot => slot._file).filter(Boolean);
    if (pages.length) {
      if (pages.length < 3) failures.push("Form 20: capture at least three pages to create the PDF.");
      else {
        try {
          await request(`/api/upload-portal/customers/${customer._id}/form20/stage`, { method: "DELETE" });
          for (let i = 0; i < pages.length; i++) { status(result, `Compressing Form 20 page ${i + 1} of ${pages.length}…`); await request(`/api/upload-portal/customers/${customer._id}/form20/pages/${i + 1}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": pages[i].type }, body: pages[i] }); }
          status(result, "Combining Form 20 pages…"); await request(`/api/upload-portal/customers/${customer._id}/form20/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); saved++;
        } catch (error) { failures.push(`Form 20: ${error.message}`); }
      }
    }
    try { const updated = await request(`/api/upload-portal/customers/${customer._id}`); currentCustomer = updated.customer; renderCustomer(currentCustomer); await searchCustomers($("search").value); status($("saveStatus"), failures.length ? `${saved} saved. ${failures.join(" ")}` : `${saved ? `${saved} document${saved === 1 ? "" : "s"} saved and compressed on the server.` : "No new documents selected."}`, failures.length ? "error" : "success"); }
    catch (error) { status(result, error.message, "error"); }
    finally { button.disabled = false; }
  }
  void validate();
})();
