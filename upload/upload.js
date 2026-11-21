"use strict";
(() => {
  const API = "https://server.nextdimensioncustoms.in";
  const $ = id => document.getElementById(id);
  const tokenKey = "ndcUploadPortalToken";
  let token = sessionStorage.getItem(tokenKey) || "";
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
  function safeFileInput(category, isCamera) {
    const input = document.createElement("input"); input.type = "file"; input.accept = isCamera ? "image/*" : "image/*,.pdf"; if (isCamera) input.capture = "environment";
    input.addEventListener("change", () => {
      const row = document.querySelector(`[data-doc="${category}"]`); row._file = input.files?.[0] || null;
      row.querySelector(".doc-state").textContent = row._file ? row._file.name : "Not selected"; updateFileDetails(row, row._file); setPreview(row._selectedPreview, row._file, "Selected");
    });
    input.click();
  }
  async function openForm20Camera(form20) {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Camera capture is unavailable in this browser. Use Choose PDF or photos to select three images.");
      return;
    }
    const dialog = document.createElement("dialog");
    dialog.className = "dialog camera-dialog";
    const panel = document.createElement("div");
    panel.className = "camera-capture";
    const heading = document.createElement("div");
    heading.className = "camera-capture-heading";
    const title = document.createElement("h2");
    title.textContent = "Capture Form 20";
    const help = document.createElement("p");
    help.className = "muted";
    help.textContent = "Take three clear photos. Review them before adding Form 20.";
    heading.append(title, help);
    const video = document.createElement("video");
    video.className = "camera-capture-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.setAttribute("aria-label", "Live camera preview");
    const progress = document.createElement("p");
    progress.className = "status camera-capture-status";
    progress.setAttribute("role", "status");
    progress.textContent = "Starting camera…";
    const photoStrip = document.createElement("div");
    photoStrip.className = "camera-capture-photos";
    photoStrip.setAttribute("aria-label", "Captured Form 20 photos");
    const actions = document.createElement("div");
    actions.className = "camera-capture-actions";
    const capture = document.createElement("button");
    capture.type = "button";
    capture.className = "primary";
    capture.textContent = "Capture photo 1 of 3";
    const retake = document.createElement("button");
    retake.type = "button";
    retake.className = "secondary";
    retake.textContent = "Retake last";
    retake.disabled = true;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "quiet";
    cancel.textContent = "Cancel";
    const usePhotos = document.createElement("button");
    usePhotos.type = "button";
    usePhotos.className = "primary";
    usePhotos.textContent = "Use 3 photos";
    usePhotos.disabled = true;
    actions.append(capture, retake, cancel, usePhotos);
    panel.append(heading, video, progress, photoStrip, actions);
    dialog.append(panel);
    document.body.append(dialog);
    const photos = [];
    const previewUrls = [];
    let stream = null;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      stream?.getTracks().forEach(track => track.stop());
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      if (dialog.open) dialog.close();
      dialog.remove();
    };
    const updateControls = () => {
      const count = photos.length;
      capture.textContent = count < 3 ? "Capture photo " + (count + 1) + " of 3" : "Three photos captured";
      capture.disabled = count >= 3;
      retake.disabled = count === 0;
      usePhotos.disabled = count !== 3;
      progress.textContent = count ? count + " of 3 photos captured" : "Capture photo 1 of 3";
    };
    capture.addEventListener("click", async () => {
      if (photos.length >= 3 || !video.videoWidth) return;
      capture.disabled = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .9));
        if (!blob) throw new Error("The camera photo could not be created. Try again.");
        const index = photos.length + 1;
        const file = new File([blob], "form20_page_" + index + ".jpg", {type:"image/jpeg", lastModified:Date.now()});
        photos.push(file);
        const url = URL.createObjectURL(file);
        previewUrls.push(url);
        const item = document.createElement("div");
        item.className = "camera-photo-thumb";
        const image = document.createElement("img");
        image.src = url;
        image.alt = "Form 20 photo " + index;
        const caption = document.createElement("span");
        caption.textContent = "Page " + index;
        item.append(image, caption);
        photoStrip.append(item);
        updateControls();
      } catch (error) {
        status(progress, error.message, "error");
      } finally {
        if (photos.length < 3) capture.disabled = false;
      }
    });
    retake.addEventListener("click", () => {
      const item = photoStrip.lastElementChild;
      if (item) item.remove();
      const url = previewUrls.pop();
      if (url) URL.revokeObjectURL(url);
      photos.pop();
      updateControls();
    });
    usePhotos.addEventListener("click", () => {
      if (photos.length !== 3) return;
      form20._file = null;
      form20._pages = photos.slice();
      form20.querySelector(".doc-state").textContent = "3 photos captured · Form 20";
      updateFileDetails(form20, photos[0]);
      setPreview(form20._selectedPreview, photos[0], "Selected · 3 photos");
      cleanup();
    });
    cancel.addEventListener("click", cleanup);
    dialog.addEventListener("cancel", event => { event.preventDefault(); cleanup(); });
    dialog.addEventListener("click", event => { if (event.target === dialog) cleanup(); });
    dialog.showModal();
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:"environment"}}});
      if (closed) { stream.getTracks().forEach(track => track.stop()); return; }
      video.srcObject = stream;
      await video.play();
      status(progress, "Capture photo 1 of 3");
    } catch (error) {
      status(progress, error.name === "NotAllowedError" ? "Allow camera access in your browser settings, then try again." : "Could not start the camera. Use Choose PDF or photos instead.", "error");
      capture.disabled = true;
    }
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
      const hint = document.createElement("span"); hint.className = "pdf-preview-hint"; hint.textContent = "Custom preview";
      pdfButton.append(mark, hint); pdfButton.addEventListener("click", () => showFullscreenPreview(file)); box.append(pdfButton);
    } else {
      const unsupported = document.createElement("span"); unsupported.className = "file-preview-label"; unsupported.textContent = "Preview unavailable"; box.append(unsupported);
    }
    const name = document.createElement("span"); name.className = "file-preview-label"; name.textContent = file.name || "Document"; box.append(name);
    const size = document.createElement("span"); size.className = "file-preview-size"; size.textContent = readableSize(file.size); box.append(size);
    const full = document.createElement("button"); full.type = "button"; full.className = "preview-fullscreen"; full.textContent = "Open preview"; full.addEventListener("click", () => showFullscreenPreview(file)); box.append(full);
  }
  function readableSize(value) { const n = Number(value); if (!Number.isFinite(n) || n < 0) return "—"; if (n < 1024) return `${n} B`; if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }
  function addFileDetails(row, saved) {
    const details = document.createElement("dl"); details.className = "file-details";
    const entries = [["Original filename", saved?.originalFilename || "—"], ["Original size", readableSize(saved?.originalSize)], ["Saved filename", saved?.filename || "—"], ["Saved size", readableSize(saved?.size)], ["Modified", saved?.originalLastModified || saved?.modifiedAt ? new Date(saved.originalLastModified || saved.modifiedAt).toLocaleString() : "—"]];
    for (const [label, value] of entries) { const wrap = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd"); dd.dataset.detail = label; dd.textContent = value; wrap.append(dt, dd); details.append(wrap); }
    row.append(details); row._fileDetails = details;
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
        try { const blob = await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, {}, true); const savedFile = new File([blob], saved.filename, {type:saved.contentType || blob.type}); setPreview(stored, savedFile, "Saved"); showFullscreenPreview(savedFile); }
        catch(error) { open.textContent = error.message; }
        finally { open.disabled = false; }
      });
      stored.append(tag, open);
    } else setPreview(stored, null, "Saved");
    pair.append(selected, stored); row.append(pair); row._selectedPreview = selected; addFileDetails(row, saved);
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
      setZipBusy(true); zip.textContent = "Preparing ZIP…";
      try {
        const blob = await request("/api/upload-portal/customers/" + customer._id + "/documents.zip", {}, true);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = safeFilenamePart(customer.customerName) + "_" + safeFilenamePart(customer.chassisNumber) + ".zip"; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { alert(error.message); }
      finally { zip.textContent = "Download ZIP"; setZipBusy(false); }
    });
    shareZip.addEventListener("click", async () => {
      setZipBusy(true); shareZip.textContent = "Preparing ZIP…"; zipStatus.hidden = false; status(zipStatus, "Preparing customer ZIP…");
      try {
        if (typeof navigator.share !== "function") throw new Error("Sharing isn't supported on this browser. Use Download ZIP instead.");
        const blob = await request("/api/upload-portal/customers/" + customer._id + "/documents.zip", {}, true);
        const filename = safeFilenamePart(customer.customerName) + "_" + safeFilenamePart(customer.chassisNumber) + ".zip";
        const file = new File([blob], filename, {type:"application/zip"});
        if (navigator.canShare && !navigator.canShare({files:[file]})) throw new Error("This device cannot share ZIP files. Use Download ZIP instead.");
        await navigator.share({files:[file], title:customer.customerName + " documents", text:"VAHAN customer documents"});
        status(zipStatus, "ZIP shared successfully.", "success");
      } catch (error) {
        if (error.name === "AbortError") status(zipStatus, "Sharing canceled.");
        else status(zipStatus, error.message, "error");
      } finally { shareZip.textContent = "Share ZIP"; setZipBusy(false); }
    });
    toolbar.append(label, count, shareZip, zip, zipStatus); host.append(toolbar);
    const list = document.createElement("div"); list.className = "doc-list";
    documentDisplayOrder.filter(id => id !== "form20").forEach(id => {
      const name = categories.find(([category]) => category === id)?.[1] || id;
      const row = document.createElement("section"); row.className = "doc-row"; row.dataset.doc = id; const h = document.createElement("h3"); h.textContent = (documentDisplayOrder.indexOf(id) + 1) + ". " + name; const state = document.createElement("div"); state.className = "doc-state"; const saved = customer.documents?.[id]; state.textContent = saved ? `Saved · ${saved.filename}` : "Not selected"; if (saved) state.classList.add("saved"); row.append(h, state); addPreviewPair(row, customer, id, saved);
      if (id === "address-proof") { const select = document.createElement("select"); select.className = "subcat"; select.dataset.subcategory = "true"; select.innerHTML = '<option value="">Choose address proof type</option>'; addressTypes.forEach(type => { const option = document.createElement("option"); option.value = type; option.textContent = type; select.append(option); }); const current = saved?.subcategory; if (current) select.value = current; row.append(select); }
      const actions = document.createElement("div"); actions.className = "doc-actions"; const camera = document.createElement("button"); camera.type = "button"; camera.className = "secondary"; camera.textContent = "Camera"; camera.addEventListener("click", () => safeFileInput(id, true)); const browse = document.createElement("button"); browse.type = "button"; browse.className = "secondary"; browse.textContent = "Choose file"; browse.addEventListener("click", () => safeFileInput(id, false)); actions.append(camera, browse);
      if (saved) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Remove"; remove.addEventListener("click", async () => { if (!confirm(`Remove ${name}?`)) return; try { await request(`/api/upload-portal/customers/${customer._id}/documents/${id}`, { method: "DELETE" }); await openCustomer(customer._id); } catch (error) { alert(error.message); } }); actions.append(remove); }
      row.append(actions); list.append(row);
    });
    const form20 = document.createElement("section"); form20.className = "doc-row full"; form20.dataset.doc = "form20"; const ftitle = document.createElement("h3"); ftitle.textContent = (documentDisplayOrder.indexOf("form20") + 1) + ". Form 20 (Finance)"; const saved20 = customer.documents?.form20; const fstate = document.createElement("div"); fstate.className = `doc-state${saved20 ? " saved" : ""}`; fstate.textContent = saved20 ? `Saved · ${saved20.filename}` : "Upload a PDF (3+ pages) or capture three photos"; form20.append(ftitle, fstate); addPreviewPair(form20, customer, "form20", saved20);
    const form20Actions = document.createElement("div"); form20Actions.className = "doc-actions form20-actions";
    const capture = document.createElement("button"); capture.type = "button"; capture.className = "secondary"; capture.textContent = "Capture 3 photos"; capture.addEventListener("click", () => { void openForm20Camera(form20); });
    const choose20 = document.createElement("button"); choose20.type = "button"; choose20.className = "secondary"; choose20.textContent = "Choose PDF or photos";
    choose20.addEventListener("click", () => { const input = document.createElement("input"); input.type = "file"; input.accept = "application/pdf,image/*"; input.multiple = true; input.addEventListener("change", () => {
      const files = [...(input.files || [])]; const pdfs = files.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length) { if (pdfs.length !== 1 || files.length !== 1) { status($("saveStatus"), "Choose one Form 20 PDF by itself.", "error"); return; } form20._file = pdfs[0]; form20._pages = []; form20.querySelector(".doc-state").textContent = `${pdfs[0].name} → Form 20`; updateFileDetails(form20, pdfs[0]); setPreview(form20._selectedPreview, pdfs[0], "Selected"); }
      else { form20._file = null; form20._pages = files.slice(0, 30); form20.querySelector(".doc-state").textContent = files.length ? `${files.length} photos selected · Form 20` : "Upload a PDF (3+ pages) or capture three photos"; if (files[0]) updateFileDetails(form20, files[0]); setPreview(form20._selectedPreview, files[0] || null, "Selected"); }
    }); input.click(); });
    form20Actions.append(capture, choose20); form20.append(form20Actions); list.insertBefore(form20, list.children[3] || null); host.append(list);
    const bar = document.createElement("div"); bar.className = "save-bar"; const result = document.createElement("p"); result.id = "saveStatus"; result.className = "status"; result.textContent = "Choose any available documents. You can save fewer than 12."; const save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = "Save selected documents"; save.addEventListener("click", () => saveDocuments(customer, host, save)); bar.append(result, save); host.append(bar);
  }
  async function openCustomer(id) { try { const data = await request(`/api/upload-portal/customers/${id}`); currentCustomer = data.customer; renderCustomer(currentCustomer); } catch (error) { status($("searchStatus"), error.message, "error"); } }
  async function saveDocuments(customer, host, button) {
    button.disabled = true; const result = $("saveStatus"); let saved = 0; const failures = [];
    for (const [category] of categories.filter(([id]) => id !== "form20")) {
      const row = host.querySelector(`[data-doc="${category}"]`); const file = row?._file; if (!file) continue;
      const subcategory = row.querySelector("[data-subcategory]")?.value || ""; if (category === "address-proof" && !subcategory) { failures.push("Address Proof: select a type."); continue; }
      try { status(result, `Preparing ${row.querySelector("h3").textContent}…`); await request(`/api/upload-portal/customers/${customer._id}/documents/${category}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": file.type || "application/octet-stream", "X-NDC-Original-Filename": file.name, "X-NDC-Original-Size": String(file.size), "X-NDC-Original-Last-Modified": String(file.lastModified || Date.now()), ...(subcategory ? { "X-NDC-Subcategory": subcategory } : {}) }, body: file }); saved++; }
      catch (error) { failures.push(`${row.querySelector("h3").textContent}: ${error.message}`); }
    }
    const form20Row = host.querySelector('[data-doc="form20"]');
    const form20File = form20Row?._file;
    const pages = form20Row?._pages || [];
    if (form20File) {
      try {
        status(result, "Preparing Form 20 PDF…");
        await request(`/api/upload-portal/customers/${customer._id}/documents/form20`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": form20File.type || "application/pdf", "X-NDC-Original-Filename": form20File.name, "X-NDC-Original-Size": String(form20File.size), "X-NDC-Original-Last-Modified": String(form20File.lastModified || Date.now()) }, body: form20File }); saved++;
      } catch (error) { failures.push(`Form 20: ${error.message}`); }
    }
    if (pages.length) {
      if (pages.length < 3) failures.push("Form 20: choose or capture at least three photos.");
      else {
        try {
          await request(`/api/upload-portal/customers/${customer._id}/form20/stage`, { method: "DELETE" });
          for (let i = 0; i < pages.length; i++) { status(result, `Compressing Form 20 photo ${i + 1} of ${pages.length}…`); await request(`/api/upload-portal/customers/${customer._id}/form20/pages/${i + 1}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-NDC-Original-Type": pages[i].type, "X-NDC-Original-Filename": pages[i].name, "X-NDC-Original-Size": String(pages[i].size), "X-NDC-Original-Last-Modified": String(pages[i].lastModified || Date.now()) }, body: pages[i] }); }
          status(result, "Combining Form 20 photos…"); await request(`/api/upload-portal/customers/${customer._id}/form20/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); saved++;
        } catch (error) { failures.push(`Form 20: ${error.message}`); }
      }
    }
    try { const updated = await request(`/api/upload-portal/customers/${customer._id}`); currentCustomer = updated.customer; renderCustomer(currentCustomer); await searchCustomers($("search").value); status($("saveStatus"), failures.length ? `${saved} saved. ${failures.join(" ")}` : `${saved ? `${saved} document${saved === 1 ? "" : "s"} saved and compressed on the server.` : "No new documents selected."}`, failures.length ? "error" : "success"); }
    catch (error) { status(result, error.message, "error"); }
    finally { button.disabled = false; }
  }
  void validate();
})();
