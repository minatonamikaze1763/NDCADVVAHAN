"use strict";
(() => {
  const API = "https://server.nextdimensioncustoms.in";
  const $ = id => document.getElementById(id);
  const tokenKey = "ndcUploadPortalToken";
  let token = sessionStorage.getItem(tokenKey) || "";
  let currentCustomer = null;
  let searchTimer;
  let form20Slots = 3;
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
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(API + path, { ...options, headers });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await response.json() : null;
    if (response.status === 401 || response.status === 403) { token = ""; sessionStorage.removeItem(tokenKey); showLogin(); }
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }
  function showLogin() { $("loginView").hidden = false; $("appView").hidden = true; $("logout").hidden = true; }
  function showApp() { $("loginView").hidden = true; $("appView").hidden = false; $("logout").hidden = false; }
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
  $("logout").addEventListener("click", async () => { try { await request("/api/auth/logout", { method: "POST" }); } catch {} token = ""; sessionStorage.removeItem(tokenKey); currentCustomer = null; $("customerView").hidden = true; showLogin(); });
  $("newCustomer").addEventListener("click", () => { $("customerForm").reset(); status($("createStatus"), ""); $("customerDialog").showModal(); });
  $("closeDialog").addEventListener("click", () => $("customerDialog").close());
  $("customerForm").addEventListener("submit", async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; status($("createStatus"), "Creating customer…");
    try {
      const data = await request("/api/upload-portal/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chassisNumber: $("chassisNumber").value, customerName: $("customerName").value, address: $("address").value, hp: $("hp").value, applicationNumber: $("applicationNumber").value }) });
      $("customerDialog").close(); await openCustomer(data.customer._id); await searchCustomers($("search").value);
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
        slot._file = input.files?.[0] || null; slot.textContent = slot._file ? `Page ${page}: ${slot._file.name}` : `Page ${page}: Capture or choose`;
      } else {
        const row = document.querySelector(`[data-doc="${category}"]`); row._file = input.files?.[0] || null;
        row.querySelector(".doc-state").textContent = row._file ? row._file.name : "Not selected";
      }
    });
    input.click();
  }
  function renderCustomer(customer) {
    const host = $("customerView"); host.replaceChildren(); host.hidden = false;
    const head = document.createElement("div"); head.className = "customer-heading";
    const titleBlock = document.createElement("div"); const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "CUSTOMER WORKSPACE"; const title = document.createElement("h2"); title.textContent = customer.customerName; const chassis = document.createElement("p"); chassis.className = "muted"; chassis.textContent = `Chassis: ${customer.chassisNumber}`; titleBlock.append(eyebrow, title, chassis);
    const close = document.createElement("button"); close.className = "quiet"; close.textContent = "Close"; close.addEventListener("click", () => { host.hidden = true; currentCustomer = null; }); head.append(titleBlock, close); host.append(head);
    const fields = document.createElement("div"); fields.className = "customer-fields"; [["Address", customer.address], ["HP", customer.hp], ["Application no.", customer.applicationNumber]].forEach(([label, value]) => { if (value) { const span = document.createElement("span"); span.textContent = `${label}: ${value}`; fields.append(span); } }); host.append(fields);
    const toolbar = document.createElement("div"); toolbar.className = "doc-toolbar"; const label = document.createElement("strong"); label.textContent = "VAHAN documents"; const count = document.createElement("span"); count.className = "muted"; count.textContent = `${Object.keys(customer.documents || {}).length} of 12 saved`; toolbar.append(label, count); host.append(toolbar);
    const list = document.createElement("div"); list.className = "doc-list";
    categories.filter(([id]) => id !== "form20").forEach(([id, name]) => {
      const row = document.createElement("section"); row.className = "doc-row"; row.dataset.doc = id; const h = document.createElement("h3"); h.textContent = name; const state = document.createElement("div"); state.className = "doc-state"; const saved = customer.documents?.[id]; state.textContent = saved ? `Saved · ${saved.filename}` : "Not selected"; if (saved) state.classList.add("saved"); row.append(h, state);
      if (id === "address-proof") { const select = document.createElement("select"); select.className = "subcat"; select.dataset.subcategory = "true"; select.innerHTML = '<option value="">Choose address proof type</option>'; addressTypes.forEach(type => { const option = document.createElement("option"); option.value = type; option.textContent = type; select.append(option); }); const current = saved?.subcategory; if (current) select.value = current; row.append(select); }
      const actions = document.createElement("div"); actions.className = "doc-actions"; const camera = document.createElement("button"); camera.type = "button"; camera.className = "secondary"; camera.textContent = "Camera"; camera.addEventListener("click", () => safeFileInput(id, true)); const browse = document.createElement("button"); browse.type = "button"; browse.className = "secondary"; browse.textContent = "Choose file"; browse.addEventListener("click", () => safeFileInput(id, false)); actions.append(camera, browse);
      if (saved) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Remove"; remove.addEventListener("click", async () => { if (!confirm(`Remove ${name}?`)) return; try { await request(`/api/upload-portal/customers/${customer._id}/documents/${id}`, { method: "DELETE" }); await openCustomer(customer._id); } catch (error) { alert(error.message); } }); actions.append(remove); }
      row.append(actions); list.append(row);
    });
    const form20 = document.createElement("section"); form20.className = "doc-row full"; form20.dataset.doc = "form20"; const ftitle = document.createElement("h3"); ftitle.textContent = "Form 20 (Finance) · multi-page PDF"; const saved20 = customer.documents?.form20; const fstate = document.createElement("div"); fstate.className = `doc-state${saved20 ? " saved" : ""}`; fstate.textContent = saved20 ? `Saved · ${saved20.filename}` : "Add at least three image pages"; form20.append(ftitle, fstate);
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
