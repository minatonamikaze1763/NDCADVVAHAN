(() => {
  "use strict";
  const API = "https://server.nextdimensioncustoms.in/api/public/vahan/version";
  const section = document.getElementById("updates");
  if (!section) return;
  const heading = section.querySelector("#ndcReleaseHeading");
  const description = section.querySelector(".section-desc");
  const status = section.querySelector(".ndc-release-coming-soon");
  const badge = section.querySelector(".ndc-version-badge strong");
  const grid = section.querySelector(".ndc-release-grid");
  const note = section.querySelector(".ndc-release-note");
  const downloadLinks = [...document.querySelectorAll('a[href*="chromewebstore.google.com/detail/vahan-ndc-tool/"]')];
  function lock() {
    if (status) status.textContent = "Currently unavailable for download — coming soon";
    for (const link of downloadLinks) {
      link.dataset.originalHref ||= link.getAttribute("href");
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      link.style.opacity = "0.55";
      link.style.cursor = "not-allowed";
    }
  }
  function unlock(url) {
    for (const link of downloadLinks) {
      link.href = url;
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
      link.style.opacity = "";
      link.style.cursor = "";
    }
  }
  lock();
  fetch(API, {cache:"no-store",headers:{"Accept":"application/json"}})
    .then(r => { if (!r.ok) throw new Error("Version service unavailable"); return r.json(); })
    .then(data => {
      if (!data.success || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(data.latestVersion)) throw new Error("Invalid release");
      if (heading) heading.textContent = "What's new in v" + data.latestVersion;
      if (badge) badge.textContent = data.latestVersion;
      if (description) description.textContent = data.description || "";
      if (grid) {
        grid.replaceChildren();
        for (const item of (Array.isArray(data.notes) ? data.notes : []).slice(0,30)) {
          const article = document.createElement("article");
          article.className = "ndc-release-card";
          const title = document.createElement("h3");
          title.textContent = item.title || "";
          const p = document.createElement("p");
          p.textContent = item.description || "";
          article.append(title,p);
          grid.append(article);
        }
      }
      const available = data.download?.available === true && data.download?.status === "available" &&
        data.chromeStoreVersion === data.latestVersion &&
        data.download?.url === "https://chromewebstore.google.com/detail/vahan-ndc-tool/omohbolpkkehdkgifcdmpbhmfeegijea";
      if (status) status.textContent = available ? "Available for public download." : "Currently unavailable for download — coming soon";
      if (note) note.textContent = available ? "Version " + data.latestVersion + " is verified and available in the Chrome Web Store." : "Version " + data.latestVersion + " is awaiting verified Chrome Web Store availability.";
      if (available) unlock(data.download.url);
    }).catch(() => {
      if (note) note.textContent = "Release verification is temporarily unavailable. Please check again later.";
      lock();
    });
})();
