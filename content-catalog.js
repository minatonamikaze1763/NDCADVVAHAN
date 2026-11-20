(() => {
  "use strict";
  // The API provides only content data. This frontend owns all HTML and SVG structure.
  const targets = {
    features: document.querySelector("#features .features"),
    latestFeatures: document.querySelector("#latest-features .features"),
    faq: document.querySelector("#faq .faq-grid")
  };
  const iconNames = new Set(["folder", "settings", "merge", "image", "check", "compress", "bolt", "upload", "search", "download", "user", "clock", "database", "file", "refresh"]);
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  };
  function feature(item, latest) {
    const article = node("article", latest ? "feature ndc-latest-card" : "feature");
    const icon = node("div", "feature-icon");
    icon.setAttribute("aria-hidden", "true");
    if (latest) {
      icon.textContent = "✓";
      article.append(icon, node("span", "ndc-feature-tag", item.tag));
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "ndc-icon ndc-ui-icon ndc-feature-svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#ndc-i-" + (iconNames.has(item.icon) ? item.icon : "check"));
      svg.append(use);
      icon.append(svg);
      article.append(icon);
    }
    article.append(node("h3", "", item.title), node("p", "", item.description));
    return article;
  }
  function faq(item) {
    const details = node("details");
    details.append(node("summary", "", item.question), node("p", "", item.answer));
    return details;
  }
  function valid(items, fields, max) {
    return Array.isArray(items) && items.length > 0 && items.length <= max &&
      items.every(item => item && fields.every(key => typeof item[key] === "string" &&
        item[key].trim().length > 0 && item[key].length <= 3000));
  }
  fetch("https://server.nextdimensioncustoms.in/api/public/vahan/website-content", {
    cache: "no-store", headers: {Accept: "application/json"}
  })
    .then(response => {
      if (!response.ok) throw Error("Content catalog unavailable");
      return response.json();
    })
    .then(catalog => {
      if (catalog.success !== true || catalog.schemaVersion !== 2 || !catalog.sections) return;
      const sections = catalog.sections;
      const specs = [
        ["features", ["id", "title", "description", "icon"], 100],
        ["latestFeatures", ["id", "title", "description", "tag"], 30],
        ["faq", ["id", "question", "answer"], 100]
      ];
      // Validate every section before changing any part of the existing page.
      if (!specs.every(([key, fields, max]) => targets[key] && valid(sections[key], fields, max))) return;
      for (const [key] of specs) {
        const fragment = document.createDocumentFragment();
        for (const item of sections[key]) {
          fragment.append(key === "faq" ? faq(item) : feature(item, key === "latestFeatures"));
        }
        targets[key].replaceChildren(fragment);
      }
    })
    .catch(error => console.warn("[NDC CONTENT] Keeping existing approved content:", error.message));
})();
