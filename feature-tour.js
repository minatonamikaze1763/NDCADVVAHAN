(() => {
  "use strict";
  const root = document.getElementById("interactive-demos");
  if (!root) return;
  const buttons = root.querySelectorAll("[data-cache-example]");
  buttons.forEach(button => button.addEventListener("click", () => {
    const returning = button.dataset.cacheExample === "returning";
    buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    document.getElementById("ndcCacheAction").textContent = returning ? "Import unuploaded docs" : "Auto-import available docs";
    document.getElementById("ndcCacheExplanation").textContent = returning
      ? "Reuse the matching customer's saved remaining categories. Prepare only unique folder files matching those categories."
      : "Import unique document matches from the customer's folder, then prepare the selected files.";
    const tags = document.getElementById("ndcCacheCategories");
    tags.replaceChildren(...(returning ? ["Form 20", "Chassis photo", "Insurance"] : ["Available folder documents"]).map(text => {
      const tag = document.createElement("span"); tag.textContent = text; return tag;
    }));
  }));
  const input = document.getElementById("ndcRenameExample");
  input.addEventListener("input", () => {
    const name = input.value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0,100) || "customer";
    document.getElementById("ndcRenameResults").replaceChildren(...["aadhar.pdf", "form20.pdf", "chassis.jpg", "insurance.pdf"].map(file => {
      const row = document.createElement("li"); const dot = file.lastIndexOf("."); row.textContent = name + "_" + file.slice(0,dot) + "_MBLHAW427THH02338" + file.slice(dot); return row;
    }));
  });
  const originals = document.getElementById("ndcOriginalsExample");
  originals.addEventListener("change", () => {
    document.getElementById("ndcPreparedSource").textContent = originals.checked ? "Use main-folder originals" : "Prefer matching Compressed copies";
    document.getElementById("ndcPreparedBehavior").textContent = originals.checked
      ? "Ignore Compressed for this sample session. Prepare originals again and replace same-name prepared copies with write access."
      : "Reuse prepared files where available. Prepare originals for missing categories.";
  });
})();
