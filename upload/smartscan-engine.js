/* NDC SmartScan: client-only image review and preparation. */
(() => {
  "use strict";
  const MAGIC = Object.freeze({ filter: "magic", brightness: 3, contrast: 117, autoCrop: true });
  const MODES = Object.freeze({
    "address-proof": "identity", "pan-card": "identity", insurance: "document",
    "dealer-invoice": "document", form20: "document", inspection: "document",
    form21: "document", form22: "document", "owner-signature": "signature",
    "owner-photo": "photo", frontphoto: "photo", "chassis-photo": "photo"
  });
  const limits = category => category === "form20" ? 390 * 1024 : 400000;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const imageFrom = async file => {
    if (typeof createImageBitmap === "function") return createImageBitmap(file, { imageOrientation: "from-image" });
    const url = URL.createObjectURL(file), image = new Image();
    try { image.src = url; await image.decode(); image.close = () => URL.revokeObjectURL(url); return image; }
    catch (error) { URL.revokeObjectURL(url); throw error; }
  };
  function detectBounds(data, width, height) {
    // Conservative edge/background estimate. Weak or fragmented results are rejected.
    const lum = new Float32Array(width * height);
    for (let p = 0, i = 0; i < data.length; i += 4, p++) lum[p] = .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
    const sample = (x, y) => lum[clamp(Math.round(y), 0, height - 1) * width + clamp(Math.round(x), 0, width - 1)];
    const corners = [sample(2, 2), sample(width - 3, 2), sample(2, height - 3), sample(width - 3, height - 3)];
    const bg = corners.reduce((a, b) => a + b, 0) / corners.length;
    const threshold = clamp(16 + corners.reduce((n, v) => n + Math.abs(v - bg), 0) / corners.length, 20, 54);
    let minX = width, minY = height, maxX = 0, maxY = 0, hits = 0, tested = 0;
    const step = Math.max(2, Math.floor(Math.max(width, height) / 320));
    for (let y = 1; y < height - 1; y += step) for (let x = 1; x < width - 1; x += step) {
      const value = sample(x, y), edge = Math.abs(value - sample(x + step, y)) + Math.abs(value - sample(x, y + step));
      tested++;
      if (Math.abs(value - bg) > threshold || edge > 38) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); hits++; }
    }
    const boxW = maxX - minX, boxH = maxY - minY;
    const area = boxW * boxH / (width * height);
    const confidence = clamp((hits / Math.max(1, tested) * 15) * Math.min(1, area / .22) * (boxW > width * .3 && boxH > height * .3 ? 1 : .25), 0, 1);
    if (confidence < .22 || area < .12 || boxW < width * .28 || boxH < height * .28) return { crop: null, confidence };
    const padX = Math.max(2, boxW * .018), padY = Math.max(2, boxH * .018);
    return { crop: { x: clamp((minX - padX) / width, 0, .98), y: clamp((minY - padY) / height, 0, .98), w: clamp((boxW + padX * 2) / width, .1, 1), h: clamp((boxH + padY * 2) / height, .1, 1) }, confidence };
  }
  async function detect(file) {
    let bitmap;
    try { bitmap = await imageFrom(file); const scale = Math.min(1, 500 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return { crop: null, confidence: 0 }; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); const result = detectBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height); canvas.width = canvas.height = 0; return result; }
    finally { bitmap?.close?.(); }
  }
  async function inspect(file) {
    let bitmap;
    try { bitmap = await imageFrom(file); } catch { return ["This image could not be decoded. Choose another photo."]; }
    try {
      const warnings = [], w = bitmap.width, h = bitmap.height;
      if (Math.min(w, h) < 700) warnings.push("Low resolution may make small text difficult to read.");
      const scale = Math.min(1, 500 / Math.max(w, h)), canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, sum2 = 0, bright = 0, dark = 0, edges = 0, count = 0;
      for (let y = 1; y < canvas.height - 1; y += 2) for (let x = 1; x < canvas.width - 1; x += 2) {
        const i = (y * canvas.width + x) * 4, v = .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2];
        const l = (y * canvas.width + x - 1) * 4, r = (y * canvas.width + x + 1) * 4;
        sum += v; sum2 += v * v; count++; if (v > 248) bright++; if (v < 30) dark++;
        edges += Math.abs(v - (.299 * pixels[l] + .587 * pixels[l + 1] + .114 * pixels[l + 2])) + Math.abs(v - (.299 * pixels[r] + .587 * pixels[r + 1] + .114 * pixels[r + 2]));
      }
      const mean = sum / Math.max(1, count), variance = sum2 / Math.max(1, count) - mean * mean;
      if (mean < 48) warnings.push("The photo is very dark. Retake it in brighter, even light if details are hard to see.");
      if (mean > 232 || bright / Math.max(1, count) > .28) warnings.push("Strong glare or overexposure may hide document details.");
      if (variance < 180 || edges / Math.max(1, count) < 8) warnings.push("The photo may be blurry. Check small text and numbers before saving.");
      canvas.width = canvas.height = 0;
      return warnings;
    } finally { bitmap.close?.(); }
  }
  function style() {
    if (document.getElementById("ndc-smartscan-style")) return;
    const node = document.createElement("style"); node.id = "ndc-smartscan-style";
    node.textContent = `.ndc-scan-dialog{width:min(900px,96vw);max-width:none;max-height:94dvh;padding:0;border:1px solid #423a27;border-radius:16px;background:#111;color:#f5f3ed}.ndc-scan-dialog::backdrop{background:#000c}.ndc-scan-head,.ndc-scan-foot{padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #302d25}.ndc-scan-foot{border:0;border-top:1px solid #302d25;justify-content:flex-end;flex-wrap:wrap}.ndc-scan-main{padding:14px;display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:14px}.ndc-scan-stage{position:relative;display:grid;place-items:center;min-height:45vh;max-height:60vh;overflow:hidden;background:#080808;border-radius:10px;touch-action:none}.ndc-scan-stage img{display:block;max-width:100%;max-height:58vh;object-fit:contain}.ndc-scan-stage img[data-source]{display:none}.ndc-scan-crop{position:absolute;border:2px solid #f0cb55;box-shadow:0 0 0 999px #0005;touch-action:none}.ndc-scan-crop[hidden]{display:none}.ndc-scan-handle{position:absolute;width:26px;height:26px;border:3px solid #111;border-radius:50%;background:#f0cb55;transform:translate(-50%,-50%);touch-action:none}.ndc-scan-handle[data-corner=nw]{left:0;top:0}.ndc-scan-handle[data-corner=ne]{left:100%;top:0}.ndc-scan-handle[data-corner=sw]{left:0;top:100%}.ndc-scan-handle[data-corner=se]{left:100%;top:100%}.ndc-scan-tools{display:grid;align-content:start;gap:11px}.ndc-scan-tools label:not(:first-child){display:none}.ndc-scan-actions button:not([data-action="autocrop"]){display:none}.ndc-scan-tools label{display:grid;gap:4px;font-size:12px}.ndc-scan-tools select,.ndc-scan-tools input{width:100%}.ndc-scan-warning{color:#ffd67a;font-size:12px;line-height:1.5}.ndc-scan-actions{display:flex;gap:8px;flex-wrap:wrap}.ndc-scan-actions button{min-height:42px}.ndc-scan-dialog button{border:1px solid #484334;border-radius:8px;background:#211f1a;color:#fff;padding:9px 12px}.ndc-scan-dialog button.ndc-scan-primary{background:#e3bd54;color:#18140a;font-weight:700}@media(max-width:700px){.ndc-scan-main{grid-template-columns:1fr}.ndc-scan-stage{min-height:48vh;max-height:calc(96dvh - 260px)}.ndc-scan-stage img{max-height:calc(96dvh - 280px)}.ndc-scan-tools{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.ndc-scan-actions{grid-column:2;grid-row:1}.ndc-scan-warning{grid-column:1/-1}.ndc-scan-head,.ndc-scan-foot{padding:12px}.ndc-scan-dialog{width:100vw;max-height:96dvh;border-radius:14px}.ndc-scan-handle{width:34px;height:34px}}`;
    document.head.append(node);
  }
  function canvasBlob(canvas, type, quality) { return new Promise(resolve => canvas.toBlob(resolve, type, quality)); }
  async function render(file, category, crop, options, limit) {
    let bitmap;
    try { bitmap = await imageFrom(file); } catch { throw new Error("This photo could not be opened. Retake or choose another image."); }
    let oriented;
    try {
      const sourceScale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const sourceW = Math.max(1, Math.round(bitmap.width * sourceScale)), sourceH = Math.max(1, Math.round(bitmap.height * sourceScale));
      const rotation = ((Number(options.rotation) || 0) % 360 + 360) % 360, swapped = rotation === 90 || rotation === 270;
      const orientedW = swapped ? sourceH : sourceW, orientedH = swapped ? sourceW : sourceH;
      oriented = document.createElement("canvas"); oriented.width = orientedW; oriented.height = orientedH;
      const octx = oriented.getContext("2d"); octx.translate(orientedW / 2, orientedH / 2); octx.rotate(rotation * Math.PI / 180); octx.drawImage(bitmap, -sourceW / 2, -sourceH / 2, sourceW, sourceH);
      const x = Math.round(crop.x * orientedW), y = Math.round(crop.y * orientedH);
      const w = Math.max(1, Math.min(orientedW - x, Math.round(crop.w * orientedW))), h = Math.max(1, Math.min(orientedH - y, Math.round(crop.h * orientedH)));
      let width = w, height = h, shrink = Math.min(1, 2400 / Math.max(w, h)); width = Math.max(1, Math.round(width * shrink)); height = Math.max(1, Math.round(height * shrink));
      for (let attempt = 0; attempt < 8; attempt++) {
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("Image processing is unavailable in this browser.");
        ctx.drawImage(oriented, x, y, w, h, 0, 0, width, height);
        if (options.mode !== "photo") {
          const frame = ctx.getImageData(0, 0, width, height), px = frame.data;
          const contrast = options.contrast / 100;
          let rMean = 0, gMean = 0, bMean = 0, samples = 0;
          for (let i = 0; i < px.length; i += 64) { rMean += px[i]; gMean += px[i + 1]; bMean += px[i + 2]; samples++; }
          const avg = (rMean + gMean + bMean) / (3 * Math.max(1, samples));
          const wb = options.filter === "magic" ? [clamp(avg / (rMean / samples || avg), .94, 1.06), clamp(avg / (gMean / samples || avg), .94, 1.06), clamp(avg / (bMean / samples || avg), .94, 1.06)] : [1, 1, 1];
          for (let start = 0; start < px.length; start += 262144) {
            const end = Math.min(px.length, start + 262144);
            for (let i = start; i < end; i += 4) {
              let r = px[i] * wb[0], g = px[i + 1] * wb[1], b = px[i + 2] * wb[2];
              r = contrast * (r - 128) + 128 + options.brightness * 2.55; g = contrast * (g - 128) + 128 + options.brightness * 2.55; b = contrast * (b - 128) + 128 + options.brightness * 2.55;
              if (options.filter === "gray") { const l = .299 * r + .587 * g + .114 * b; r = g = b = l; }
              if (options.filter === "bw") { const l = .299 * r + .587 * g + .114 * b, v = l > 172 ? 255 : 0; r = g = b = v; }
              px[i] = clamp(r, 0, 255); px[i + 1] = clamp(g, 0, 255); px[i + 2] = clamp(b, 0, 255);
            }
            if (end < px.length) await new Promise(resolve => setTimeout(resolve, 0));
          }
          ctx.putImageData(frame, 0, 0);
        }
        const qualities = [.9, .84, .78, .72, .66, .58, .5, .42, .34];
        let result = null;
        for (const quality of qualities) { result = await canvasBlob(canvas, "image/jpeg", quality); if (result && result.size <= limit) break; }
        canvas.width = canvas.height = 0;
        if (result?.size <= limit) { const output = new File([result], (file.name || "scan").replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() }); output.ndcSmartScan = true; return output; }
        width = Math.max(1, Math.round(width * .84)); height = Math.max(1, Math.round(height * .84));
      }
      throw new Error("The scan cannot meet the VAHAN size limit while preserving enough detail. Retake it closer and in good light.");
    } finally { bitmap.close?.(); if (oriented) oriented.width = oriented.height = 0; }
  }
  function openEditor({ file, category, maxBytes = limits(category), initialCrop = null }) {
    style();
    return new Promise(resolve => {
      const mode = MODES[category] || "document", previewUrl = URL.createObjectURL(file);
      const dialog = document.createElement("dialog"); dialog.className = "ndc-scan-dialog"; dialog.setAttribute("aria-label", "SmartScan document editor");
      dialog.innerHTML = `<header class="ndc-scan-head"><strong>SmartScan · Review before saving</strong><button type="button" data-action="close" aria-label="Close">×</button></header><div class="ndc-scan-main"><div class="ndc-scan-stage"><img data-preview alt="Processed document preview"><img data-source alt="Original document for crop adjustment"><div class="ndc-scan-crop"><i class="ndc-scan-handle" data-corner="nw"></i><i class="ndc-scan-handle" data-corner="ne"></i><i class="ndc-scan-handle" data-corner="sw"></i><i class="ndc-scan-handle" data-corner="se"></i></div></div><div class="ndc-scan-tools"><label>Mode<select data-mode><option value="identity">Identity card</option><option value="document">Document</option><option value="signature">Signature</option><option value="photo">Photo</option></select></label><label>Enhancement<select data-filter><option value="magic">Magic Color</option><option value="gray">Grayscale</option><option value="bw">Black and white</option><option value="color">Original color</option></select></label><label>Brightness <output data-brightness-value>+3</output><input data-brightness type="range" min="-30" max="30" value="3"></label><label>Contrast <output data-contrast-value>117%</output><input data-contrast type="range" min="70" max="160" value="117"></label><div class="ndc-scan-actions"><button type="button" data-action="autocrop">Auto-crop</button><button type="button" data-action="adjust">Adjust Crop</button><button type="button" data-action="compare">Original / enhanced</button><button type="button" data-action="reset">Reset</button></div><p class="ndc-scan-warning" role="status"></p><small data-size></small></div></div><footer class="ndc-scan-foot"><button type="button" data-action="retake">Retake</button><button type="button" data-action="cancel">Cancel</button><button class="ndc-scan-primary" type="button" data-action="save">Use scanned image</button></footer>`;
      document.body.append(dialog);
      const $ = selector => dialog.querySelector(selector), image = $("[data-source]"), processedImage = $("[data-preview]"), cropBox = $(".ndc-scan-crop"), warning = $(".ndc-scan-warning"), sizeLabel = $("[data-size]");
      image.src = previewUrl; $("[data-mode]").value = mode;
      const auto = { x: 0, y: 0, w: 1, h: 1 }, defaults = mode === "photo" ? { filter: "color", brightness: 0, contrast: 100 } : { filter: MAGIC.filter, brightness: MAGIC.brightness, contrast: MAGIC.contrast };
      $(`[data-filter]`).value = defaults.filter; $(`[data-brightness]`).value = defaults.brightness; $(`[data-contrast]`).value = defaults.contrast;
      let crop = initialCrop || { ...auto }, showOriginal = false, busy = false, drag = null, cancelled = false, previewGeneration = 0, previewObjectUrl = "", previewTimer = 0;
      const options = () => ({ mode: $("[data-mode]").value, filter: $("[data-filter]").value, brightness: Number($("[data-brightness]").value), contrast: Number($("[data-contrast]").value) });
      const draw = () => { image.style.display = showOriginal || !processedImage.src ? "block" : "none"; processedImage.style.display = showOriginal || !processedImage.src ? "none" : "block"; const stage = image.parentElement.getBoundingClientRect(), rect = image.getBoundingClientRect(); cropBox.style.left = `${rect.left - stage.left + crop.x * rect.width}px`; cropBox.style.top = `${rect.top - stage.top + crop.y * rect.height}px`; cropBox.style.width = `${crop.w * rect.width}px`; cropBox.style.height = `${crop.h * rect.height}px`; cropBox.hidden = !showOriginal; $("[data-brightness-value]").value = options().brightness > 0 ? `+${options().brightness}` : options().brightness; $("[data-contrast-value]").value = `${options().contrast}%`; };
      const schedulePreview = (showEnhanced = true) => { clearTimeout(previewTimer); const generation = ++previewGeneration; previewTimer = setTimeout(async () => { try { const output = await render(file, category, crop, options(), maxBytes); if (cancelled || generation !== previewGeneration) return; const url = URL.createObjectURL(output); processedImage.src = url; if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = url; sizeLabel.textContent = `Estimated final image: ${(output.size / 1024).toFixed(0)} KB`; if (showEnhanced) showOriginal = false; draw(); } catch (error) { if (!cancelled && generation === previewGeneration) warning.textContent = error.message; } }, 160); };
      const quality = inspect(file).then(messages => { if (messages.length) warning.textContent = messages.join(" "); });
      const detected = async () => { try { const found = await detect(file); if (found.crop && found.confidence >= .28) crop = found.crop; else warning.textContent = "Document edges are uncertain. Check the full page and adjust the crop manually; no automatic crop was applied."; } catch { warning.textContent = "Automatic crop was unavailable. Adjust the crop manually."; } finally { draw(); } };
      const cleanup = value => { cancelled = true; clearTimeout(previewTimer); URL.revokeObjectURL(previewUrl); if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl); dialog.close(); dialog.remove(); resolve(value || null); };
      dialog.addEventListener("click", async event => {
        const button = event.target.closest("[data-action]"); if (!button) return;
        const action = button.dataset.action;
        if (action === "close" || action === "cancel") return cleanup(null);
        if (action === "retake") { cleanup({ retake: true }); return; }
        if (action === "compare") { showOriginal = !showOriginal; draw(); return; }
        if (action === "adjust") { showOriginal = true; draw(); return; }
        if (action === "autocrop") { showOriginal = true; await detected(); schedulePreview(false); return; }
        if (action === "reset") { crop = { ...auto }; $("[data-mode]").value = mode; $("[data-filter]").value = defaults.filter; $("[data-brightness]").value = defaults.brightness; $("[data-contrast]").value = defaults.contrast; showOriginal = false; draw(); schedulePreview(); return; }
        if (action === "save" && !busy) {
          busy = true; button.disabled = true; button.textContent = "Processing…"; warning.textContent = "Processing locally on this device…";
          try { await quality; const output = await render(file, category, crop, options(), maxBytes); sizeLabel.textContent = `Final image: ${(output.size / 1024).toFixed(0)} KB · maximum ${(maxBytes / 1024).toFixed(0)} KB`; cleanup(output); }
          catch (error) { warning.textContent = error.message; busy = false; button.disabled = false; button.textContent = "Use scanned image"; }
        }
      });
      cropBox.addEventListener("pointerdown", event => { const handle = event.target.closest("[data-corner]"); if (!handle) return; drag = { corner: handle.dataset.corner, startX: event.clientX, startY: event.clientY, crop: { ...crop } }; handle.setPointerCapture(event.pointerId); event.preventDefault(); });
      dialog.addEventListener("pointermove", event => { if (!drag) return; const rect = image.getBoundingClientRect(), dx = (event.clientX - drag.startX) / rect.width, dy = (event.clientY - drag.startY) / rect.height, c = drag.crop, x2 = c.x + c.w, y2 = c.y + c.h; crop = { x: drag.corner.includes("w") ? clamp(c.x + dx, 0, x2 - .08) : c.x, y: drag.corner.includes("n") ? clamp(c.y + dy, 0, y2 - .08) : c.y, w: drag.corner.includes("e") ? clamp(c.w + dx, .08, 1 - c.x) : c.w, h: drag.corner.includes("s") ? clamp(c.h + dy, .08, 1 - c.y) : c.h }; if (drag.corner.includes("w")) crop.w = x2 - crop.x; if (drag.corner.includes("n")) crop.h = y2 - crop.y; draw(); schedulePreview(false); });
      dialog.addEventListener("pointerup", () => { if (!drag) return; drag = null; schedulePreview(false); });
      const modeControl = $("[data-mode]");
      dialog.querySelectorAll("input,select").forEach(control => control.addEventListener("input", () => { draw(); schedulePreview(control !== modeControl); }));
      modeControl.addEventListener("change", async () => { const keepCropVisible = showOriginal; if (!cancelled && options().mode !== "photo") { showOriginal = true; await detected(); } schedulePreview(!keepCropVisible); });
      dialog.addEventListener("cancel", event => { event.preventDefault(); cleanup(null); }, { once: true });
      draw(); dialog.showModal(); void quality.then(async () => { if (!cancelled && MAGIC.autoCrop && options().mode !== "photo") { showOriginal = true; await detected(); } schedulePreview(); });
    });
  }
  window.NDCSmartScan = Object.freeze({ openEditor, limits, inspect, detect, modes: MODES, process: render });
})();
