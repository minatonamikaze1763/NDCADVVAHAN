(() => {
  "use strict";
  const API = "https://server.nextdimensioncustoms.in/api/public/vahan/version";
  const section = document.getElementById("updates");
  if (!section) return;
  const heading = section.querySelector("#ndcReleaseHeading");
  const description = section.querySelector(".section-desc");
  const status = section.querySelector(".ndc-release-coming-soon");
  const badge = section.querySelector(".ndc-version-badge strong");
  const releaseDownload = section.querySelector("#ndcReleaseDownload");
  const grid = section.querySelector(".ndc-release-grid");
  const note = section.querySelector(".ndc-release-note");
  const downloadLinks = [...document.querySelectorAll('a[href*="chromewebstore.google.com/detail/vahan-ndc-tool/"]')];
  function lock() {
    if (releaseDownload) {
      releaseDownload.style.display = "none";
      releaseDownload.removeAttribute("href");
      releaseDownload.setAttribute("aria-disabled", "true");
    }
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
    if (releaseDownload) {
      releaseDownload.href = url;
      releaseDownload.style.display = "";
      releaseDownload.removeAttribute("aria-disabled");
      releaseDownload.removeAttribute("tabindex");
    }
    for (const link of downloadLinks) {
      link.href = url;
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
      link.style.opacity = "";
      link.style.cursor = "";
    }
  }
  lock();
  if (heading) heading.textContent = "Checking latest release…";
  if (description) description.textContent = "Verifying the latest published Chrome Web Store version.";
  if (badge) badge.textContent = "Checking…";
  if (grid) grid.replaceChildren();
  if (note) note.textContent = "Checking release availability.";
  fetch(API, {cache:"no-store",headers:{"Accept":"application/json"}})
    .then(r => { if (!r.ok) throw new Error("Version service unavailable"); return r.json(); })
    .then(data => {
      if (!data.success || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(data.latestVersion)) throw new Error("Invalid release");
      if (heading) heading.textContent = "What's new in v" + data.latestVersion;
      if (badge) badge.textContent = data.latestVersion;
      if (releaseDownload) releaseDownload.textContent = "Download v" + data.latestVersion;
      const heroVersion = document.querySelector(".ndc-hero-version");
      if (heroVersion) {
        for (const element of heroVersion.querySelectorAll("strong, b")) {
          if (/^v?\d+\.\d+\.\d+/.test(element.textContent.trim())) element.textContent = "v" + data.latestVersion;
        }
      }
      // Keep release-specific text synchronized without changing unrelated copy.
      const announcement = document.querySelector(".ndc-hero-announcement");
      if (announcement && typeof data.announcement === "string" && data.announcement.trim()) {
        const statusDot = announcement.querySelector(".ndc-status-dot");
        const versionTag = announcement.querySelector("span:last-child");
        if (statusDot && versionTag) {
          for (const node of [...announcement.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE) node.remove();
          }
          announcement.insertBefore(document.createTextNode(" " + data.announcement + " "), versionTag);
          versionTag.textContent = "v" + data.latestVersion + " ↗";
        }
      }
      if (heroVersion) {
        const versionText = [...heroVersion.children].find(el => el.tagName === "SPAN");
        if (versionText) versionText.textContent = "v" + data.latestVersion;
      }
      const tour = document.querySelector("#latest-features")?.previousElementSibling;
      const tourDescription = document.querySelector("#feature-tour .section-desc, #try-features .section-desc");
      if (tourDescription) tourDescription.textContent = tourDescription.textContent.replace(/v\d+\.\d+\.\d+/g, "v" + data.latestVersion);
      if (typeof data.releaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.releaseDate)) {
        const date = new Date(data.releaseDate + "T12:00:00Z");
        if (!Number.isNaN(date.getTime())) {
          const short = new Intl.DateTimeFormat("en-GB", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(date);
          const long = new Intl.DateTimeFormat("en-GB", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date);
          for (const time of section.querySelectorAll(".ndc-release-meta time")) {
            time.dateTime = data.releaseDate; time.textContent = long;
          }
          for (const time of document.querySelectorAll(".ndc-hero-version time")) {
            time.dateTime = data.releaseDate; time.textContent = short;
          }
        }
      }
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
      if (heading) heading.textContent = "Latest release verification unavailable";
      if (description) description.textContent = "We could not verify the currently published extension version.";
      if (badge) badge.textContent = "Unverified";
      if (grid) grid.replaceChildren();
      if (note) note.textContent = "Release verification is temporarily unavailable. Please check again later.";
      lock();
    });
})();
