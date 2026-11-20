(() => {
  "use strict";
  // Approved content catalog; the original HTML remains an identical offline fallback.
  const targets = [
    ["features", "#features .features"],
    ["latestFeatures", "#latest-features .features"],
    ["faq", "#faq .faq-grid"]
  ];
  fetch("https://server.nextdimensioncustoms.in/api/public/vahan/website-content", { cache: "no-store", headers: { Accept: "application/json" } })
    .then(response => { if (!response.ok) throw Error("Content catalog unavailable"); return response.json(); })
    .then(catalog => {
      if (catalog.success !== true || catalog.schemaVersion !== 1 || !catalog.sections) return;
      for (const [key, selector] of targets) {
        const root = document.querySelector(selector), markup = catalog.sections[key];
        if (!root || typeof markup !== "string" || !markup.trim() || markup.length > 100000) continue;
        // Never replace identical markup: preserve event listeners, focus and current UI state.
        if (root.innerHTML.trim() === markup.trim()) continue;
        const template = document.createElement("template");
        template.innerHTML = markup;
        if (template.content.querySelector("script, iframe, object, embed, form, style, link, base, meta, svg script")) continue;
        if ([...template.content.querySelectorAll("*")].some(el =>
          [...el.attributes].some(attr => /^on/i.test(attr.name) ||
            ((attr.name === "href" || attr.name === "src") && /^\\s*javascript:/i.test(attr.value))))) continue;
        // Content is same-origin and curated; preserve the original semantic HTML structure.
        root.replaceChildren(template.content.cloneNode(true));
      }
    })
    .catch(error => console.warn("[NDC CONTENT] Keeping existing approved content:", error.message));
})();
