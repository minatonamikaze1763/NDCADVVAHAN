(() => {
  "use strict";
  const root = document.querySelector("#automation");
  if (!root) return;
  const list = root.querySelector(".ndc-settings-catalog");
  const heading = root.querySelector("#ndcAutomationTitle");
  const eyebrow = root.querySelector(".section-head .kicker");
  const description = root.querySelector(".section-head .section-desc");
  const notice = root.querySelector(".notice");
  if (!list) return;
  const add = (parent, tag, className, value) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value;
    parent.append(el);
    return el;
  };
  fetch("https://server.nextdimensioncustoms.in/api/public/vahan/website-settings", {cache:"no-store",headers:{Accept:"application/json"}})
    .then(response => {if (!response.ok) throw Error("Settings unavailable"); return response.json();})
    .then(data => {
      if (data.success !== true || data.schemaVersion !== 1 || !Array.isArray(data.settings) ||
          !data.settings.length || data.settings.length > 100) return;
      if (data.settings.some(item => !item || ["kind","title","description"].some(key => typeof item[key] !== "string"))) return;
      // Avoid touching DOM when the approved API catalog matches the current HTML exactly.
      const existing = [...list.querySelectorAll(":scope > article.ndc-setting-guide")];
      const unchanged = existing.length === data.settings.length && data.settings.every((item,i) =>
        existing[i].querySelector(".ndc-setting-kind")?.textContent.trim() === item.kind &&
        existing[i].querySelector("h3")?.textContent.trim() === item.title &&
        existing[i].querySelector("p")?.textContent.trim() === item.description);
      if (!unchanged) {
        const fragment = document.createDocumentFragment();
        for (const item of data.settings) {
          const article = document.createElement("article");
          article.className = "ndc-setting-guide";
          add(article,"span","ndc-setting-kind",item.kind);
          add(article,"h3","",item.title);
          add(article,"p","",item.description);
          fragment.append(article);
        }
        list.replaceChildren(fragment);
      }
      if (typeof data.eyebrow === "string" && eyebrow && eyebrow.textContent.trim() !== data.eyebrow) eyebrow.textContent = data.eyebrow;
      if (typeof data.description === "string" && description && description.textContent.trim() !== data.description) description.textContent = data.description;
      if (typeof data.notice === "string" && notice && notice.textContent.trim() !== data.notice) notice.textContent = data.notice;
      if (heading && typeof data.headingPrefix === "string" && typeof data.headingSuffix === "string") {
        const prefix = heading.querySelector(".gold");
        if (prefix && prefix.textContent !== data.headingPrefix) prefix.textContent = data.headingPrefix;
        const tail = [...heading.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes("on Your Terms"));
        if (tail && tail.textContent !== data.headingSuffix) tail.textContent = data.headingSuffix;
      }
    })
    .catch(error => console.warn("[NDC SETTINGS] Keeping existing settings:", error.message));
})();
