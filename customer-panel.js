/* NDC Customer Portal — Standalone Dashboard */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const API_BASE = "https://server.nextdimensioncustoms.in";

  const TOKEN_KEY = "ndc_customer_panel_token";
  let dashboardData = null;
  let activeSection = "overview";
  let redirecting = false;
  let paymentBusy = false;
  let appliedOffer = null, offerWidget = null;
  const planDevices = (account, plan) => Math.min(20, plan.maxDevices + Math.max(0, ...(account?.offerBenefits || []).filter(b => b.planId === plan.id && (b.retainDevicesOnRenewal || Date.parse(b.expiresAt) > Date.now() + serverClockOffset)).map(b => Number(b.extraDevices) || 0)));
  let serverClockOffset = 0;

  function availablePlans(account) {
    return NDCPlans.visible.filter(p => p.id !== "basic" || !(Number(account.minimumRenewalTier) >= 1));
  }
  function subscriptionVisual(account) {
    const expiry = Date.parse(account.expiresAt), now = Date.now() + serverClockOffset;
    const remaining = Number.isFinite(expiry) ? Math.max(0, expiry - now) : null;
    const start = Date.parse(account.plan?.startedAt || account.createdAt);
    const span = Number.isFinite(start) && start < expiry ? expiry - start : Math.max(30 * 86400000, remaining || 0);
    const percent = remaining == null ? 100 : Math.max(0, Math.min(100, remaining / span * 100));
    const text = remaining == null ? "No expiry date" : remaining > 0 ? `${Math.floor(remaining / 86400000)} days · ${Math.floor(remaining / 3600000) % 24} hours left` : "Paid access has ended";
    const blocked = account.disabled || account.banned || account.approved !== true;
    return `<section class="ndc-subscription-visual"><div class="ndc-subscription-top"><span class="ndc-eyebrow">YOUR MEMBERSHIP</span><span class="ndc-membership-state">${esc(blocked ? account.status || "Access restricted" : remaining === 0 ? "Renewal due" : "Active membership")}</span></div>
      ${account.scheduledPlan ? `<p class="ndc-renewal-preview">Scheduled change: ${esc(NDCPlans.all.find(p => p.id === account.scheduledPlan.planId)?.name || account.scheduledPlan.planId)} from ${esc(date(account.scheduledPlan.startsAt))}. Your current login limit remains until then.</p>` : ""}<div class="ndc-membership-head"><div><h2>${esc(account.plan?.name || "Your subscription")}</h2><p>${esc(money(account.plan?.price))}<span> / 30-day month</span></p></div><div class="ndc-device-orbit"><strong>${Number(account.maxDevices) || 1}</strong><span>device logins</span></div></div>
      <p class="ndc-time-left" data-ndc-time-left>${esc(text)}</p><div class="ndc-access-track" role="progressbar" aria-label="Paid access time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}" aria-valuetext="${esc(text)}"><span style="width:${percent.toFixed(2)}%"></span></div>
      <div class="ndc-membership-dates"><div><small>PAID ACCESS ENDS</small><strong>${Number.isFinite(expiry) ? esc(date(account.expiresAt)) : "No expiry assigned"}</strong></div><div><small>PANEL RENEWAL WINDOW ENDS</small><strong>${Number.isFinite(expiry) ? esc(date(account.panelExpiresAt || new Date(expiry + 5 * 86400000))) : "No expiry assigned"}</strong></div></div>
      <p class="ndc-membership-foot">${blocked ? "Your account restrictions still apply. Contact support for access assistance." : "Your extension uses paid access. The extra 5 days are for panel renewal only."}</p></section>`;
  }
  function referralCard(account) {
    const code = account.referralCode || '';
    return `<section class="ndc-referral-card" aria-label="Referral rewards">
      <div class="ndc-referral-top"><span class="ndc-eyebrow">YOUR REFERRAL REWARDS</span><span class="ndc-referral-perk">+10 DAYS EACH</span></div>
      <h2>Give 10 days. <span>Get 10 days.</span></h2>
      <p>A little extra time, for both of you. Invite a new customer to NDC.</p>
      <div class="ndc-referral-ticket"><div><span class="ndc-referral-label">YOUR EXCLUSIVE CODE</span>${code ? `<code data-referral-code tabindex="0">${esc(code)}</code>` : '<span class="ndc-referral-pending">Refresh your account to get your code.</span>'}</div>
      <button type="button" class="ndc-referral-copy" data-copy-referral ${code ? '' : 'disabled'}>Copy code <span aria-hidden="true">⧉</span></button></div>
      <p class="ndc-referral-status" data-referral-status role="status" aria-live="polite"></p>
      <div class="ndc-referral-stats"><span><strong>${Number(account.successfulReferrals) || 0}</strong> successful referrals</span><span><strong>${Number(account.referralBonusDays) || 0}</strong> bonus days earned</span></div>
      <details class="ndc-referral-details"><summary>How rewards work</summary><p>Each new customer can use one referral code at their first payment. You both receive 10 extra days after payment is confirmed. Share your code with as many new customers as you like.</p></details>
    </section>`;
  }

  function renewalPreview() {
    const root = $("ndcRenewalPreview"), account = dashboardData?.account;
    if (!root || !account) return;
    const planId = document.querySelector('input[name="renewalPlan"]:checked')?.value;
    const plan = NDCPlans.all.find(p => p.id === planId);
    const months = Number(document.querySelector('input[name="renewalMonths"]:checked')?.value || 1);
    if (!plan) { root.textContent = "Choose an available plan to preview your renewal."; return; }

    const now = Date.now() + serverClockOffset;
    const current = Date.parse(account.expiresAt);
    const base = Number.isFinite(current) ? Math.max(now, current) : now;
    const end = new Date(base + plan.durationDays * months * 86400000);
    const deviceLimit = appliedOffer?.maxDevices || planDevices(account, plan);
    const upgrade = Number(deviceLimit) > Number(account.maxDevices);
    const downgrade = Number(deviceLimit) < Number(account.maxDevices) && current > now;
    const switchAt = account.scheduledPlan?.startsAt || account.expiresAt;

    const listAmount = Number(plan.monthlyPrice) * months;
    const finalAmount = appliedOffer ? Number(appliedOffer.amountPaise) / 100 : listAmount;
    const priceBeforeOffer = appliedOffer && Number.isFinite(listAmount) &&
      Number.isFinite(finalAmount) && finalAmount < listAmount
      ? '<s class="ndc-preview-price-original">' + esc(money(listAmount)) + '</s>'
      : "";
    const timingNote = Number.isFinite(current) && current > now
      ? "Your remaining paid time is preserved; new days start from your current expiry."
      : Number.isFinite(current)
        ? "Your new paid period starts when payment is confirmed."
        : "Your current account has no expiry. This purchase sets a paid expiry starting from payment confirmation.";
    const deviceNote = downgrade
      ? "You keep all features and " + (Number(account.maxDevices) || 1) +
        " logins until " + esc(date(switchAt)) + ". Then your added duration uses " +
        Number(deviceLimit) + " logins. "
      : "";
    const upgradeNote = upgrade
      ? "Your device limit increases to " + Number(deviceLimit) + " after payment confirmation. "
      : "";
    const afterPaymentLogins = downgrade
      ? Number(account.maxDevices) + " logins until " + esc(date(switchAt)) +
        "; then " + Number(deviceLimit) + " logins"
      : Number(deviceLimit) + " device logins";

    root.innerHTML =
      '<div class="ndc-preview-heading"><span class="ndc-eyebrow">LIVE RENEWAL PREVIEW</span><span>Updates as you choose</span></div>' +
      '<h3>' + esc(plan.name) + ' · ' + months + ' month' + (months === 1 ? '' : 's') + '</h3>' +
      '<div class="ndc-preview-comparison">' +
        '<div><small>CURRENT PAID EXPIRY</small><strong>' +
          (Number.isFinite(current) ? esc(date(account.expiresAt)) : 'No expiry assigned') +
          '</strong><span>' + (Number(account.maxDevices) || 1) + ' device logins</span></div>' +
        '<b aria-hidden="true">→</b>' +
        '<div><small>AFTER SUCCESSFUL PAYMENT</small><strong>' + esc(date(end)) +
          '</strong><span>' + afterPaymentLogins + ' · +' +
          (months * plan.durationDays) + ' days</span></div>' +
      '</div>' +
      '<div class="ndc-preview-total"><span>Total payment</span>' +
        '<div class="ndc-preview-prices">' + priceBeforeOffer +
          '<strong>' + esc(money(finalAmount)) + '</strong></div></div>' +
      '<p>' + deviceNote + upgradeNote + timingNote +
        ' Preview dates are estimates until the server confirms payment.</p>';
  }

  function emailSettings(account) {
    return `<section class="ndc-panel-card ndc-email-settings">
      <span class="ndc-eyebrow">ACCOUNT EMAILS</span><h2>Your email & notifications</h2>
      <div class="ndc-detail-line"><span>Registered email</span><b>${esc(account.email || "No email registered — contact NDC support")}</b></div>
      <p>Payment receipts include your plan, added months, payment reference and paid expiry. Check your inbox and spam folder before requesting another copy.</p>
      <form data-ndc-email-resend>
        <label for="ndcEmailType">Email to resend</label><select id="ndcEmailType" name="type"><option value="receipt">Latest successful payment receipt</option>${account.passwordSetupPending ? '<option value="setup">Account password setup link</option>' : ''}</select>
        <label class="ndc-email-check"><input type="checkbox" name="confirmed" required> I checked my inbox and spam folder and did not receive this email.</label>
        <button type="submit" class="ndc-home-button" disabled>Resend email</button><p role="status" data-email-status></p>
      </form>
      <div class="ndc-email-secondary"><h3>Need a password reset?</h3><p>Send a secure, one-time reset link to your registered email. Your account remains signed in until the password is reset.</p>
      <button type="button" class="ndc-home-button" data-ndc-send-reset data-username="${esc(account.username)}" data-email="${esc(account.email || '')}" ${!account.email ? 'disabled' : ''}>Email me a reset link</button><p role="status" data-reset-status></p></div>
      <details><summary>Recent email activity</summary><div data-ndc-email-activity><button type="button" class="ndc-home-button" data-ndc-load-emails>Load email activity</button><div data-email-records></div></div></details>
    </section>`;
  }

  // ---------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);

  const date = (value) => {
    if (!value) return "Not available";

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "Not available";
    }

    return parsed.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  };

  const money = (amount, currency = "INR") => {
    if (
      amount === null ||
      amount === undefined ||
      amount === "" ||
      !Number.isFinite(Number(amount))
    ) {
      return "Not set";
    }

    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency
      }).format(Number(amount));
    } catch {
      return `${currency} ${amount}`;
    }
  };

  const statusLabel = (status) => ({
    active: "Active",
    disabled: "Disabled",
    banned: "Banned",
    pending_approval: "Pending approval",
    expired: "Expired",
    renewal_required: "Renewal required"
  }[status] || "Unknown");

  function showLoading() {
    const content = $("ndcDashboardContent");

    if (!content) return;

    content.innerHTML = `
      <div class="ndc-loading">
        <span class="ndc-spinner"></span>
        Loading your account…
      </div>
    `;
  }

  async function redirectToLogin() {
    if (redirecting) return;

    redirecting = true;

    try {
      await window.NDCAuth?.logout();
    } catch (error) {
      console.warn("[NDC] Could not clear server session:", error);
    }

    window.location.replace("index.html");
  }

  // ---------------------------------------------------------
  // API REQUEST
  // ---------------------------------------------------------

  async function api(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      await redirectToLogin();
      throw new Error("Your session has expired.");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,

      headers: {
        Accept: "application/json",

        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),

        Authorization: `Bearer ${token}`,

        ...(options.headers || {})
      },

      credentials: "omit",
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      await redirectToLogin();
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
      throw new Error(
        data.error || `Request failed (${response.status})`
      );
    }

    return data;
  }

  // ---------------------------------------------------------
  // DASHBOARD DATA
  // ---------------------------------------------------------

  async function loadDashboard() {
    const content = $("ndcDashboardContent");

    if (content) {
      content.innerHTML = `
        <div class="ndc-loading">
          <span class="ndc-spinner"></span>
          Loading your account…
        </div>
      `;
    }

    try {
      await NDCPlans.ready;
      for (const p of NDCPlans.all) RENEWAL_PRICES[p.id] = p.monthlyPrice;
      const response = await api("/api/panel/dashboard");

      dashboardData = response.dashboard || response;
      const extras = await Promise.allSettled([api("/api/panel/gst-profile"), api("/api/panel/gst-invoices")]);
      dashboardData.gstProfile = extras[0].status === "fulfilled" ? extras[0].value.profile : {};
      dashboardData.gstInvoicelocked = extras[0].status === "fulfilled" && extras[0].value.gstinLocked;
      dashboardData.gstProfileLocked = extras[0].status === "fulfilled" && extras[0].value.profileLocked;
      dashboardData.gstCheckout = { enabled: false, gstRate: 18 };
      try { const gst = await fetch(API_BASE + "/api/public/gst-checkout-settings", { cache: "no-store" }); if (gst.ok) { const settings = await gst.json(); dashboardData.gstCheckout = { enabled: settings.enabled === true, gstRate: Number(settings.gstRate) || 18 }; } } catch {}
      dashboardData.gstInvoices = extras[1].status === "fulfilled" ? (extras[1].value.invoices || []) : [];
      dashboardData.gstInvoiceError = extras[1].status === "rejected" ? (extras[1].reason?.message || "Unable to load invoice records.") : "";

      if (!dashboardData?.account) {
        throw new Error("Customer account information is unavailable.");
      }

      const serverTime = Date.parse(dashboardData.serverTime);
      serverClockOffset = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
      renderDashboard();
      renewalTotal();

    } catch (error) {
      if (redirecting) return;

      if (content) {
        content.innerHTML = `
          <div class="ndc-empty">
            <p>${esc(error.message)}</p>
            <button
              type="button"
              class="ndc-text-button"
              id="ndcRetryDashboard"
            >
              Try again
            </button>
          </div>
        `;

        $("ndcRetryDashboard")?.addEventListener(
          "click",
          loadDashboard
        );
      }
    }
  }

  // ---------------------------------------------------------
  // DASHBOARD RENDERER
  // ---------------------------------------------------------

  // Email guide section numbers include account sections omitted from the portal.
  function formatSetupGuide(content) {
    const guide = content.querySelector(".ndc-setup-guide");
    if (!guide) return;
    let step = 0;
    guide.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(heading => {
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const prefix = /^(\s*)(?:step\s+)?\d+\s*[.)\-:·]\s*/i;
        if (prefix.test(node.textContent)) {
          node.textContent = node.textContent.replace(prefix, (_, space) => `${space}${++step}. `);
        }
        break;
      }
    });
    guide.querySelectorAll("a[href]").forEach(link => {
      const label = link.textContent.trim();
      if (!/install|open.*(?:ext|chrome)|click here.*(?:ext|chrome)/i.test(label) &&
        !/chromewebstore\.google\.com|chrome\.google\.com\/webstore/i.test(link.getAttribute("href"))) return;
      link.classList.add("ndc-extension-button");
      link.textContent = /install/i.test(label) ? "Install extension ↗" : "Click here to open extension ↗";
    });
  }

  function currentPlanId(account) {
    // Never silently switch a customer with an unrecognised plan.
    const name = String(account.plan?.id || account.plan?.name || "").trim().toLowerCase();
    return Object.hasOwn(RENEWAL_PRICES, name) ? name : null;
  }

  function renewalCard(account) {
    const planId = currentPlanId(account);
    const expiry = Date.parse(account.expiresAt);
    const now = Date.now() + serverClockOffset;
    const remaining = expiry - now;
    const hasExpiry = Number.isFinite(expiry);
    const expired = hasExpiry && remaining <= 0;
    const days = hasExpiry ? Math.max(0, Math.ceil(remaining / 86400000)) : null;
    const urgent = hasExpiry && remaining <= 7 * 86400000;
    const panelEnd = Date.parse(account.renewal?.panelExpiresAt || account.panelExpiresAt) || (expiry + 5 * 86400000);
    const canRenew = account.approved === true && !account.disabled && !account.banned &&
      account.renewal?.canRenew !== false && (!hasExpiry || now < panelEnd);
    const start = hasExpiry && expiry > now ? expiry : now;
    const newExpiry = new Date(start + 30 * 86400000);
    const heading = expired ? "Your extension access has expired" : urgent
      ? `Your plan expires in ${days} day${days === 1 ? "" : "s"}` : "Want more time on your current plan?";
    const description = expired
      ? "Renew to restore extension access. Your new 30 days begin when payment is verified."
      : hasExpiry ? "Pay now to add 30 days after your current paid expiry. Your remaining paid days are preserved."
        : "Choose a paid plan below. Contact support before replacing access with no expiry.";
    return `
          <section class="ndc-renewal-card${urgent ? " is-urgent" : ""}" aria-labelledby="ndcRenewalHeading">
            <div>
              <span class="ndc-eyebrow">${expired ? "RENEWAL REQUIRED" : urgent ? "RENEWAL REMINDER" : "EXTEND YOUR SUBSCRIPTION"}</span>
              <h2 id="ndcRenewalHeading">${esc(heading)}</h2>
              <p>${esc(description)}</p>
              ${planId && hasExpiry ? `<p class="ndc-renewal-preview">${esc(account.plan.name)} · ${esc(money(RENEWAL_PRICES[planId]))} for 30 days<br>New paid expiry: ${esc(date(newExpiry))}${expired ? " (estimated)" : ""}</p>` : ""}
              ${expired && Number.isFinite(panelEnd) ? `<p>Panel access for renewal ends ${esc(date(panelEnd))}.</p>` : ""}
              ${!planId ? `<p>Choose your plan using the month selector below.</p>` : ""}
            </div>
            <div class="ndc-renewal-buttons">
              <button type="button" class="ndc-home-button" id="ndcQuickRenew" ${!canRenew || !planId || !hasExpiry || paymentBusy ? "disabled" : ""}>${urgent ? "Renew now" : "Pay now"} — add 30 days</button>
              <button type="button" class="ndc-renewal-more" id="ndcMoreMonths">Want more months?</button>
            </div>
            <p id="ndcQuickRenewStatus" class="ndc-renewal-message" role="status" aria-live="polite"></p>
          </section>`;
  }

  function renderDashboard() {
    const data = dashboardData;

    if (!data?.account) return;

    const account = data.account;
    const greeting = $("ndcCustomerWelcome");
    if (greeting) greeting.textContent = `Welcome back, ${account.name || account.username}`;

    const sessions = Array.isArray(data.sessions)
      ? data.sessions
      : [];

    const payments = Array.isArray(data.payments)
      ? data.payments
      : [];

    const activeSessions = sessions.filter(
      (session) => session.status === "active"
    );

    const status = account.status || "unknown";

    const safeStatus = String(status).replace(
      /[^a-z0-9_-]/gi,
      ""
    );

    const badge = `
      <span class="ndc-status ndc-status-${esc(safeStatus)}">
        ${esc(statusLabel(status))}
      </span>
    `;

    // -------------------------------------------------------
    // FEATURES
    // -------------------------------------------------------

    // -------------------------------------------------------
    // FEATURES FROM ACCOUNT API
    // -------------------------------------------------------

    const featureEntries = [
      ...Object.entries(account.features || {}).filter(([key]) => key !== "maxDevices"),
      ["maxDevices", Number(account.maxDevices) || 1]
    ];

    const enabledFeatureCount = featureEntries.filter(([key, value]) => key !== "maxDevices" && Boolean(value)).length;
    const featureSummary = `<div class="ndc-feature-summary"><strong>${enabledFeatureCount + 1}</strong><span>Feature${enabledFeatureCount === 1 ? "" : "s"} enabled</span></div>`;

    const features = featureEntries.map(([key, value], index) => {
      const isMaxDevices = key === "maxDevices";

      const label = isMaxDevices
        ? "Maximum Allowed Devices"
        : key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

      return `
    <div class="ndc-feature">
      <span class="ndc-feature-name"><span class="ndc-feature-number">${index + 1}</span><span>${esc(label)}</span></span>
      <b class="${isMaxDevices ? "is-on" : value ? "is-on" : "is-off"}">
        ${isMaxDevices ? `${value} Device${value === 1 ? "" : "s"}` : value ? "Enabled" : "Disabled"}
      </b>
    </div>
  `;
    }).join("");



    // -------------------------------------------------------
    // PAYMENT HISTORY
    // -------------------------------------------------------

    const paymentRows = payments.length
      ? payments.map((payment) => `
          <tr>
            <td>${esc(date(payment.paidAt || payment.createdAt))}</td>

            <td>
              ${esc(money(payment.amount, payment.currency))}
            </td>

            <td>${esc(payment.method || "—")}</td>

            <td>
              <span class="ndc-payment-status ndc-payment-${esc(
        String(payment.status || "unknown").replace(
          /[^a-z0-9_-]/gi,
          ""
        )
      )}">
                ${esc(payment.status || "Unknown")}
              </span>
            </td>

            <td>${esc(payment.reference || "—")}</td>
          </tr>
        `).join("")
      : `
          <tr>
            <td colspan="5" class="ndc-empty">
              No payment records available yet.
            </td>
          </tr>
        `;

    // -------------------------------------------------------
    // SESSION LIST
    // -------------------------------------------------------

    const sessionRows = sessions.length
      ? sessions.map((session) => {
        const isCurrent = session.current === true;
        const isActive = session.status === "active";

        const sessionTitle = isCurrent
          ? "This device · Current session"
          : session.type === "extension"
            ? "VAHAN extension session"
            : "Customer portal session";

        return `
            <div class="ndc-session">

              <div class="ndc-session-icon">
                ${isCurrent ? "◉" : "⌁"}
              </div>

              <div class="ndc-session-main">

                <b>${esc(session.alias || sessionTitle)}</b>
                <form class="ndc-device-alias-form" data-device-session="${esc(session.id)}" data-device-type="${esc(session.type)}">
                  <label>Device name<input name="alias" maxlength="80" placeholder="e.g. Nandhu’s laptop" value="${esc(session.alias || '')}" aria-label="Name this device" /></label>
                  <button type="submit" class="ndc-text-button">Save name</button><small role="status"></small>
                </form>

                <span>
                  ${esc(
          session.userAgent ||
          "Device details unavailable"
        )}
                </span>

                <small>
                  Signed in ${esc(date(session.createdAt))}
                  · Expires ${esc(date(session.expiresAt))}
                </small>

              </div>

              <div class="ndc-session-actions">

                <span class="ndc-status ndc-status-${isActive ? "active" : "expired"
          }">
                  ${esc(session.status || "Unknown")}
                </span>

                ${isActive && !isCurrent
            ? `
                      <button
                        type="button"
                        class="ndc-small-danger ndc-danger-button"
                        data-revoke-session="${esc(session.id)}"
                        data-session-type="${esc(session.type || "customer_portal")}"
                      >
                        Revoke
                      </button>
                    `
            : ""
          }

              </div>

            </div>
          `;
      }).join("")
      : `
          <div class="ndc-empty">
            No panel sessions found.
          </div>
        `;

    // -------------------------------------------------------
    // ACCOUNT DETAILS
    // -------------------------------------------------------

    const lastPayment =
      account.lastPaymentAt ||
      payments.find((payment) => payment.status === "paid")?.paidAt;

    const planName =
      account.plan?.name || "No plan assigned";

    const planPrice =
      account.plan?.price == null
        ? "Not set"
        : money(
          account.plan.price,
          account.plan.currency || "INR"
        );

    let sectionHTML = "";

    // =======================================================
    // OVERVIEW
    // =======================================================

    if (activeSection === "overview") {
      sectionHTML = `
        ${subscriptionVisual(account)}
        ${renewalCard(account)}
        ${referralCard(account)}


        <div class="ndc-welcome">

          <div>
            <span class="ndc-eyebrow">
              CUSTOMER CONTROL CENTER
            </span>

            <h1>
              Welcome back, ${esc(account.name || account.username)}
            </h1>

            <p>
              Your NDC account overview and subscription details.
            </p>
          </div>

          ${badge}

        </div>

        <div class="ndc-stat-grid">

          <article class="ndc-stat">
            <span>Current plan</span>
            <strong>${esc(planName)}</strong>
            <small>${esc(planPrice)}</small>
          </article>

          <article class="ndc-stat">
            <span>Account status</span>
            <strong>${esc(statusLabel(status))}</strong>
            <small>
              ${account.approved ? "Approved" : "Approval required"}
            </small>
          </article>

          <article class="ndc-stat">
            <span>Account expiry</span>
            <strong>
              ${account.expiresAt
          ? esc(new Date(account.expiresAt).toLocaleDateString())
          : "No expiry"
        }
            </strong>
            <small>Access validity</small>
          </article>

          <article class="ndc-stat">
            <span>Active panel sessions</span>
            <strong>
              ${activeSessions.length} / ${Number(account.maxDevices) || 1}
            </strong>
            <small>Device allowance</small>
          </article>

        </div>

        <div class="ndc-two-col">

          <section class="ndc-panel-card">

            <div class="ndc-card-heading">

              <div>
                <span class="ndc-eyebrow">SUBSCRIPTION</span>
                <h2>Plan overview</h2>
              </div>

              <span class="ndc-mini-icon">◇</span>

            </div>

            <div class="ndc-plan-name">
              ${esc(planName)}
            </div>

            <div class="ndc-plan-price">
              ${esc(planPrice)}
              <small>
                ${account.plan?.price == null ? "" : "/ plan"}
              </small>
            </div>

            <div class="ndc-detail-line">
              <span>Started</span>
              <b>${esc(date(account.plan?.startedAt))}</b>
            </div>

            <div class="ndc-detail-line">
              <span>Next payment</span>
              <b>${esc(date(account.plan?.nextPaymentAt))}</b>
            </div>

            <div class="ndc-detail-line">
              <span>Last payment</span>
              <b>${esc(date(lastPayment))}</b>
            </div>

          </section>

          <section class="ndc-panel-card">

            <div class="ndc-card-heading">

              <div>
                <span class="ndc-eyebrow">ACCOUNT HEALTH</span>
                <h2>Access & security</h2>
              </div>

              <span class="ndc-mini-icon">⌑</span>

            </div>

            <div class="ndc-detail-line">
              <span>Approval</span>
              <b>${account.approved ? "Approved" : "Pending"}</b>
            </div>

            <div class="ndc-detail-line">
              <span>Disabled</span>
              <b>${account.disabled ? "Yes" : "No"}</b>
            </div>

            <div class="ndc-detail-line">
              <span>Banned</span>
              <b>${account.banned ? "Yes" : "No"}</b>
            </div>

            <div class="ndc-detail-line">
              <span>Maximum devices</span>
              <b>${Number(account.maxDevices) || 1}</b>
            </div>

            <div class="ndc-detail-line">
              <span>Registered email</span>
            <b>${esc(account.email || "Not provided")}</b>
          </div>
          <div class="ndc-detail-line">
            <span>Panel identity</span>
              <b>${esc(account.useradminUsername || "—")}</b>
            </div>

          </section>

        </div>

        <section class="ndc-panel-card">

          <div class="ndc-card-heading">

            <div>
              <span class="ndc-eyebrow">YOUR ACCESS</span>
              <h2>Enabled features</h2>
            </div>

            <button
              class="ndc-text-button"
              data-go-section="features"
            >
              View all
            </button>

          </div>

          ${featureSummary}
          <div class="ndc-feature-grid">
            ${features}
          </div>

        </section>

        <section class="ndc-panel-card">

          <div class="ndc-card-heading">

            <div>
              <span class="ndc-eyebrow">RECENT ACTIVITY</span>
              <h2>Latest payments</h2>
            </div>

            <button
              class="ndc-text-button"
              data-go-section="payments"
            >
              Payment history
            </button>

          </div>

          <div class="ndc-table-wrap">

            <table class="ndc-table">

              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>

              <tbody>
                ${paymentRows}
              </tbody>

            </table>

          </div>

        </section>
      `;
    }

    // =======================================================
    // PROFILE
    // =======================================================

    else if (activeSection === "profile") {
      sectionHTML = `

        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">PERSONAL INFORMATION</span>
          <h1>My profile</h1>
          <p>Your registered customer identity.</p>
        </div>

        <section class="ndc-panel-card">

          <div class="ndc-detail-line">
            <span>Display name</span>
            <b>${esc(account.name || "Not provided")}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Username</span>
            <b>${esc(account.username)}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Registered email</span>
            <b>${esc(account.email || "Not provided")}</b>
          </div>
          <div class="ndc-detail-line">
            <span>Panel identity</span>
            <b>${esc(account.useradminUsername || "—")}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Account created</span>
            <b>${esc(date(account.createdAt))}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Account ID</span>
            <b class="ndc-mono">${esc(account.id)}</b>
          </div>

        </section>

        <section class="ndc-panel-card ndc-gst-profile-card">
          <div class="ndc-card-heading"><div><span class="ndc-eyebrow">BILLING DETAILS</span><h2>GST and business profile</h2></div></div>
          <p class="ndc-note">${dashboardData.gstProfileLocked ? "These GST billing details were submitted during signup and are locked. Contact NDC support if they need correction." : "Add your billing details to complete pending invoices and use GST enabled checkout. GSTIN locks after the first save; other business details can be edited."}</p>
          <form id="ndcGstProfileForm" class="ndc-gst-profile-form">
            <label>GSTIN<input name="gstin" maxlength="15" autocomplete="off" value="${esc(dashboardData.gstProfile?.gstin || "")}" ${dashboardData.gstInvoicelocked ? "readonly" : ""} ${dashboardData.gstProfileLocked ? "disabled" : ""} required></label>
            <label>Trade name<input name="tradeName" maxlength="120" value="${esc(dashboardData.gstProfile?.tradeName || "")}" ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
            <label>Business name<input name="businessName" maxlength="160" value="${esc(dashboardData.gstProfile?.businessName || "")}" required ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
            <label>Business billing address<textarea name="businessAddress" maxlength="500" rows="3" required ${dashboardData.gstProfileLocked ? "disabled" : ""}>${esc(dashboardData.gstProfile?.businessAddress || "")}</textarea></label>
            <label>State code<input name="stateCode" inputmode="numeric" maxlength="2" value="${esc(dashboardData.gstProfile?.stateCode || "")}" placeholder="For example, 36" required ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
            <label>Business phone<input name="phone" maxlength="20" inputmode="tel" value="${esc(dashboardData.gstProfile?.phone || "")}" ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
            <div class="ndc-gst-form-actions"><button type="submit" class="ndc-home-button" ${dashboardData.gstProfileLocked ? "disabled" : ""}>Save business details</button><span role="status" data-gst-profile-status></span></div>
          </form>
        </section>
      `;
    }

    // =======================================================
    // SUBSCRIPTION
    // =======================================================

    else if (activeSection === "setup") {
      sectionHTML = `<div class="ndc-page-heading"><span class="ndc-eyebrow">GET STARTED</span><h1>Setup & usage guide</h1><p>The same installation and usage instructions included in your setup email, with your account usernames.</p></div><section class="ndc-panel-card ndc-setup-guide">${account.setupGuideHtml ? `<table role="presentation" width="100%">${account.setupGuideHtml}</table>` : '<p>Your server needs the matching update to load the shared setup guide. Please deploy the included backend files.</p>'}</section>`;
    }

    else if (activeSection === "subscription") {
      sectionHTML = `
        ${renewalCard(account)}
        ${referralCard(account)}


        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">PLAN & BILLING</span>
          <h1>Subscription</h1>
          <p>Your current plan and renewal schedule.</p>
        </div>

        ${subscriptionVisual(account)}
        <section class="ndc-panel-card">
          <div class="ndc-billing-actions">
            <h3>Manage your subscription</h3>
            <p>Upgrades increase logins immediately after verified payment. A lower plan starts after your current paid entitlement ends. Existing paid time is preserved. Payments are processed securely through Razorpay.</p>
            <form id="ndcRenewalForm" tabindex="-1">
              <aside class="ndc-shared-features"><h3>Included in every plan</h3><ul>${Object.entries(NDCPlans.all[0]?.features || {}).filter(([k, v]) => v === true && NDCPlans.all.every(p => p.features?.[k] === true)).map(([k]) => `<li>${esc(NDCPlans.label(k))}</li>`).join('')}</ul></aside><fieldset class="ndc-choice-group"><legend>01 · Choose your plan</legend>
              <div class="ndc-plan-options">${availablePlans(account).map((p, i) => `<label class="ndc-choice ndc-plan-choice"><input type="radio" name="renewalPlan" value="${esc(p.id)}" ${i === 0 ? "checked" : ""} required><span><small>${p.id === 'test' ? 'AUTHORIZED TESTING' : 'MONTHLY MEMBERSHIP'}</small><strong>${esc(p.name)}</strong><b>${esc(money(p.monthlyPrice))}<small> / month</small></b><em>${esc(planDevices(account, p))} devices · ${esc(p.durationDays)} days/month</em><ul>${Object.entries(p.features || {}).filter(([, v]) => v === true).map(([key]) => `<li>${esc(NDCPlans.featureLabel(p, key))}</li>`).join('')}</ul></span></label>`).join('')}</div></fieldset>
              <div class="ndc-renewal-purchase-details">
              <fieldset class="ndc-choice-group"><legend>02 · Add more time</legend><p>Each month adds 30 days. Choose 1–12 months.</p>
              <div class="ndc-month-options">${Array.from({ length: 12 }, (_, i) => `<label class="ndc-choice ndc-month-choice"><input type="radio" name="renewalMonths" value="${i + 1}" ${i === 0 ? 'checked' : ''}><span><strong>${i + 1}</strong><small>${i === 0 ? 'month' : 'months'}</small></span></label>`).join('')}</div></fieldset>
              <div id="ndcRenewalOffer"></div>
              <div id="ndcRenewalPreview" class="ndc-renewal-preview" aria-live="polite"></div>
              ${dashboardData.gstProfile?.gstin ? "" : `
              <section class="ndc-checkout-billing"><span class="ndc-eyebrow">BILLING DETAILS</span><h3>Save your GST details</h3><p>Enter them now for future invoices. Optional while GST is off; required when GST checkout is enabled.</p>
                <div class="ndc-checkout-billing-grid">
                  <label>GSTIN<input id="renewalGstin" maxlength="15" autocomplete="off" value="${esc(dashboardData.gstProfile?.gstin || "")}" ${dashboardData.gstCheckout?.enabled && !dashboardData.gstProfile?.gstin ? "required" : ""} ${dashboardData.gstInvoicelocked ? "readonly" : ""} ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
                  <label>Trade name<input id="renewalTradeName" maxlength="120" value="${esc(dashboardData.gstProfile?.tradeName || "")}" ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
                  <label>Legal business name<input id="renewalBusinessName" maxlength="160" value="${esc(dashboardData.gstProfile?.businessName || "")}" ${dashboardData.gstCheckout?.enabled && !dashboardData.gstProfile?.businessName ? "required" : ""} ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
                  <label class="wide">Billing address<textarea id="renewalBusinessAddress" maxlength="500" rows="3" ${dashboardData.gstCheckout?.enabled && !dashboardData.gstProfile?.businessAddress ? "required" : ""} ${dashboardData.gstProfileLocked ? "disabled" : ""}>${esc(dashboardData.gstProfile?.businessAddress || "")}</textarea></label>
                  <label>State code<input id="renewalStateCode" inputmode="numeric" maxlength="2" placeholder="36" value="${esc(dashboardData.gstProfile?.stateCode || "")}" ${dashboardData.gstCheckout?.enabled && !dashboardData.gstProfile?.stateCode ? "required" : ""} ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
                  <label>Business phone<input id="renewalBusinessPhone" maxlength="20" inputmode="tel" value="${esc(dashboardData.gstProfile?.phone || "")}" ${dashboardData.gstProfileLocked ? "disabled" : ""}></label>
                </div>
                ${dashboardData.gstProfileLocked ? '<small>These details were submitted during signup and are locked. Contact support to request a correction.</small>' : ''}
              </section>
              `}
              <div id="ndcRenewalTotal" class="ndc-checkout-payment-summary" aria-live="polite"></div>
              <button class="ndc-home-button" id="ndcRenewalSubmit" type="submit">Continue to secure payment</button>
              <p id="ndcRenewalStatus" role="status" aria-live="polite"></p>
            </div>
            </form>
          </div>
        </section>
      `;
    }

    // =======================================================
    // GST INVOICES
    // =======================================================
    else if (activeSection === "gst-invoices") {
      const invoices = Array.isArray(data.gstInvoices) ? data.gstInvoices : [];
      const rows = invoices.length ? invoices.map((invoice) => {
        const invoiceDate = new Date(invoice.date);
        const filterDate = Number.isNaN(invoiceDate.getTime()) ? "" : invoiceDate.toISOString().slice(0, 10);
        const invoiceNumber = invoice.invoiceNumber || "";
        const description = invoice.description || "Subscription payment";
        return `
          <tr data-invoice-row data-invoice-number="${esc(invoiceNumber)}" data-invoice-search="${esc((invoiceNumber + " " + description).toLowerCase())}" data-invoice-date="${esc(filterDate)}">
            <td class="ndc-mono">${esc(invoiceNumber || "Pending")}</td>
            <td>${esc(date(invoice.date))}</td>
            <td>${esc(description)}</td>
            <td>${esc(money(invoice.amount, invoice.currency || "INR"))}</td>
            <td><span class="ndc-invoice-state ndc-invoice-${esc(invoice.status)}">${invoice.status === "ready" ? "Tax invoice ready" : invoice.status === "ready_no_gst" ? "Invoice ready · no GST" : "Pending"}</span><small class="ndc-invoice-reason">${esc(invoice.reason || invoice.invoiceNumber || "")}</small></td>
            <td>${["ready", "ready_no_gst"].includes(invoice.status) ? `<button type="button" class="ndc-home-button" data-download-gst-invoice="${esc(invoice.id)}" data-invoice-number="${esc(invoiceNumber)}">Download PDF</button>` : "Complete details to generate"}</td>
          </tr>`;
      }).join("") : `<tr><td colspan="6" class="ndc-empty">${data.gstInvoiceError ? "Invoice list could not be loaded. Select Refresh invoices or reload the page." : "No paid transactions are available for invoicing yet."}</td></tr>`;
      const invoiceError = data.gstInvoiceError ? `<p class="ndc-invoice-load-error" role="status">${esc(data.gstInvoiceError)}</p>` : "";
      sectionHTML = `
        <div class="ndc-page-heading"><span class="ndc-eyebrow">BILLING RECORDS</span><h1>GST invoices</h1><p>Every paid transaction, including signup, appears here. Our GSTIN allotment is currently pending. Until our GSTIN is allotted and GST billing is enabled, you can download a Commercial Invoice / Receipt; no GST is charged during this period, and the document is not a GST Tax Invoice. Once registration is approved, we will issue GST Tax Invoices for future purchases, with applicable GST clearly shown and calculated on the discounted plan or offer amount. These invoices will show our registered seller details and can support eligible input tax credit claims, subject to applicable GST rules. Earlier payments remain unchanged; GST will not be added retrospectively.</p></div>
        ${invoiceError}
        <section class="ndc-panel-card ndc-invoice-panel">
          <div class="ndc-invoice-filters" role="search" aria-label="Search invoices">
            <label>Invoice number or description<input type="search" id="ndcInvoiceSearch" placeholder="Search by invoice number" autocomplete="off"></label>
            <label>From date<input type="date" id="ndcInvoiceDateFrom"></label>
            <label>To date<input type="date" id="ndcInvoiceDateTo"></label>
            <button type="button" class="ndc-renewal-more" id="ndcInvoiceFilterReset">Clear filters</button><button type="button" class="ndc-renewal-more" id="ndcInvoiceRefresh">Refresh invoices</button>
          </div>
          <p id="ndcInvoiceFilterStatus" class="ndc-invoice-filter-status" aria-live="polite"></p>
          <div class="ndc-table-wrap"><table class="ndc-table"><thead><tr><th>Invoice number</th><th>Date</th><th>Description</th><th>Amount</th><th>Invoice status</th><th>Download</th></tr></thead><tbody>${rows}</tbody></table></div>
        </section>`;
    }

    // =======================================================
    // PAYMENTS
    // =======================================================

    else if (activeSection === "payments") {
      sectionHTML = `

        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">TRANSACTION RECORDS</span>
          <h1>Payment history</h1>
          <p>Payments recorded against your NDC account.</p>
        </div>

        <section class="ndc-panel-card">

          <div class="ndc-table-wrap">

            <table class="ndc-table">

              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>

              <tbody>
                ${paymentRows}
              </tbody>

            </table>

          </div>

        </section>
      `;
    }

    // =======================================================
    // ACTIVE SESSIONS
    // =======================================================

    else if (activeSection === "sessions") {
      sectionHTML = `

        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">SIGNED-IN DEVICES</span>
          <h1>Active sessions</h1>
          <p>Review devices with access to your customer portal.</p>
        </div>

        <section class="ndc-panel-card">

          <div class="ndc-card-heading">

            <h2>
              ${activeSessions.length} active session(s)
            </h2>

            <button
              class="ndc-text-button"
              id="ndcRefreshDashboard"
            >
              Refresh
            </button>

          </div>

          <div class="ndc-session-list">
            ${sessionRows}
          </div>

        </section>
      `;
    }

    // =======================================================
    // FEATURES
    // =======================================================

    else if (activeSection === "features") {
      sectionHTML = `

        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">ACCOUNT PERMISSIONS</span>
          <h1>Features & access</h1>
          <p>Feature access configured for your account.</p>
        </div>

        <section class="ndc-panel-card">

          ${featureSummary}
          <div class="ndc-feature-grid">
            ${features}
          </div>

        </section>
      `;
    }

    // =======================================================
    // SECURITY
    // =======================================================

    else if (activeSection === "security") {
      sectionHTML = `

        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">ACCOUNT PROTECTION</span>
          <h1>Security & status</h1>
          <p>Current access controls for your account.</p>
        </div>

        <section class="ndc-panel-card">

          <div class="ndc-detail-line">
            <span>Account status</span>
            ${badge}
          </div>

          <div class="ndc-detail-line">
            <span>Approved</span>
            <b>${account.approved ? "Yes" : "No"}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Disabled</span>
            <b>${account.disabled ? "Yes" : "No"}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Banned</span>
            <b>${account.banned ? "Yes" : "No"}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Expires</span>
            <b>${esc(date(account.expiresAt))}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Maximum devices</span>
            <b>${Number(account.maxDevices) || 1}</b>
          </div>

          <div class="ndc-password-settings">
            <h2>Change password</h2>
            <p>Update the password used for your customer panel and VAHAN extension. All devices will be signed out after the change.</p>
            <form id="ndcPasswordForm">
              <label for="ndcCurrentPassword">Current password</label>
              <input id="ndcCurrentPassword" type="password" autocomplete="current-password" required maxlength="72">
              <label for="ndcNewPassword">New password</label>
              <input id="ndcNewPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="72" aria-describedby="ndcPasswordHelp">
              <label for="ndcConfirmPassword">Confirm new password</label>
              <input id="ndcConfirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="72">
              <small id="ndcPasswordHelp">Use 12–72 UTF-8 bytes. Never share your password.</small>
              <label class="ndc-password-visibility"><input id="ndcShowPasswords" type="checkbox"> Show passwords</label>
              <button class="ndc-home-button" id="ndcPasswordSubmit" type="submit">Confirm password change</button>
              <p id="ndcPasswordStatus" role="status" aria-live="polite"></p>
            </form>
          </div>

          <p class="ndc-note">
            For account changes, renewals or payment questions, contact
            NDC support. Security restrictions can only be changed by
            an authorized administrator.
          </p>

        </section>
      `;
    }

    // -------------------------------------------------------
    // INSERT SECTION
    // -------------------------------------------------------

    if (activeSection === "contact") sectionHTML = "\u003csection\r\n        class=\"ndc-contact\"\r\n        id=\"contact\"\r\n        aria-labelledby=\"ndcContactHeading\"\r\n      \u003e\r\n        \u003cdiv class=\"container\"\u003e\r\n          \u003cdiv class=\"ndc-contact-heading\"\u003e\r\n            \u003cdiv\u003e\r\n              \u003cspan class=\"kicker\"\u003eLET’S TALK\u003c/span\u003e\r\n              \u003ch2 class=\"section-title\" id=\"ndcContactHeading\"\u003e\r\n                A real person.\u003cbr /\u003e\u003cspan class=\"gold\"\r\n                  \u003eA clearer next step.\u003c/span\r\n                \u003e\r\n              \u003c/h2\u003e\r\n            \u003c/div\u003e\r\n            \u003cp\u003e\r\n              From your first VAHAN upload to account and subscription\r\n              questions, get in touch with Next Dimension Customs.\r\n            \u003c/p\u003e\r\n          \u003c/div\u003e\r\n          \u003cdiv class=\"ndc-contact-grid\"\u003e\r\n            \u003cdiv class=\"ndc-contact-main\"\u003e\r\n              \u003cdiv class=\"ndc-contact-brand\"\u003e\r\n                \u003cimg\r\n                  src=\"logo.png\"\r\n                  alt=\"Next Dimension Customs\"\r\n                  width=\"48\"\r\n                  height=\"48\"\r\n                /\u003e\u003cspan\r\n                  \u003eNEXT DIMENSION CUSTOMS\u003csmall\r\n                    \u003eSupport for NDC VAHAN TOOL\u003c/small\r\n                  \u003e\u003c/span\r\n                \u003e\r\n              \u003c/div\u003e\r\n              \u003cspan class=\"ndc-contact-channel\"\u003eSTART A CONVERSATION\u003c/span\u003e\r\n              \u003ch3\u003eTell us what\u003cbr /\u003eyou need help with.\u003c/h3\u003e\r\n              \u003cp\u003e\r\n                Send your question on WhatsApp. For account or payment help,\r\n                include your username or payment reference so we can find the\r\n                right details.\r\n              \u003c/p\u003e\r\n              \u003ca\r\n                class=\"btn btn-primary\"\r\n                href=\"https://wa.me/919052691719?text=Hi%2C%20I%20need%20assistance%20with%20NDC%20VAHAN%20TOOL.\"\r\n                target=\"_blank\"\r\n                rel=\"noopener noreferrer\"\r\n                \u003eChat on WhatsApp \u003cspan aria-hidden=\"true\"\u003e↗\u003c/span\u003e\u003c/a\r\n              \u003e\r\n              \u003csmall class=\"ndc-contact-safety\"\r\n                \u003ePlease keep passwords and verification codes private.\u003c/small\r\n              \u003e\r\n            \u003c/div\u003e\r\n            \u003cdiv class=\"ndc-contact-options\"\u003e\r\n              \u003ca class=\"ndc-contact-option\" href=\"tel:+919052691719\"\r\n                \u003e\u003cspan class=\"ndc-contact-option-icon\" aria-hidden=\"true\"\r\n                  \u003e\u003csvg class=\"ndc-icon ndc-ui-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003cpath d=\"m7 3 3 5-3 3c2 3 3 4 6 6l3-3 5 3-2 4C10 22 2 14 3 5Z\"/\u003e\u003c/svg\u003e\u003c/span\r\n                \u003e\u003cspan\r\n                  \u003e\u003csmall\u003eGIVE US A CALL\u003c/small\u003e\u003cstrong\u003e+91 90526 91719\u003c/strong\r\n                  \u003e\u003cspan\u003eTalk through setup or account questions.\u003c/span\u003e\u003c/span\r\n                \u003e\u003cspan aria-hidden=\"true\"\u003e↗\u003c/span\u003e\u003c/a\r\n              \u003e\r\n              \u003ca\r\n                class=\"ndc-contact-option\"\r\n                href=\"mailto:nextdimensioncustoms@gmail.com\"\r\n                \u003e\u003cspan class=\"ndc-contact-option-icon\" aria-hidden=\"true\"\r\n                  \u003e\u003csvg class=\"ndc-icon ndc-ui-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"\u003e\u003crect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/\u003e\u003cpath d=\"m3 6 9 7 9-7\"/\u003e\u003c/svg\u003e\u003c/span\r\n                \u003e\u003cspan\r\n                  \u003e\u003csmall\u003eWRITE TO US\u003c/small\r\n                  \u003e\u003cstrong\u003enextdimensioncustoms@gmail.com\u003c/strong\r\n                  \u003e\u003cspan\r\n                    \u003eShare your question and any useful details.\u003c/span\r\n                  \u003e\u003c/span\r\n                \u003e\u003cspan aria-hidden=\"true\"\u003e↗\u003c/span\u003e\u003c/a\r\n              \u003e\r\n              \u003ca\r\n                class=\"ndc-contact-option\"\r\n                href=\"https://nextdimensioncustoms.in/\"\r\n                target=\"_blank\"\r\n                rel=\"noopener noreferrer\"\r\n                \u003e\u003cspan class=\"ndc-contact-option-icon\" aria-hidden=\"true\"\r\n                  \u003e\u003csvg class=\"ndc-icon ndc-ui-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"\u003e\r\n          \u003cpath d=\"M5 12h14m-6-6 6 6-6 6\" /\u003e\r\n        \u003c/svg\u003e\u003c/span\r\n                \u003e\u003cspan\r\n                  \u003e\u003csmall\u003eMEET NEXT DIMENSION CUSTOMS\u003c/small\r\n                  \u003e\u003cstrong\u003eExplore our company\u003c/strong\r\n                  \u003e\u003cspan\u003eDiscover more of what we do.\u003c/span\u003e\u003c/span\r\n                \u003e\u003cspan aria-hidden=\"true\"\u003e↗\u003c/span\u003e\u003c/a\r\n              \u003e\r\n            \u003c/div\u003e\r\n          \u003c/div\u003e\r\n          \u003cdiv class=\"ndc-contact-bottom\"\u003e\r\n            \u003cspan\u003eReady to get started on your own?\u003c/span\r\n            \u003e\u003ca href=\"index.html#access\"\u003eGet the extension ↗\u003c/a\r\n            \u003e\u003ca href=\"index.html#pricing\"\u003eCompare plans ↗\u003c/a\r\n            \u003e\u003ca href=\"index.html\"\u003eVisit website ↗\u003c/a\u003e\r\n          \u003c/div\u003e\r\n        \u003c/div\u003e\r\n      \u003c/section\u003e";
    const content = $("ndcDashboardContent");

    if (!content) return;

    if (["profile", "security", "payments"].includes(activeSection)) sectionHTML += emailSettings(account);
    if (activeSection === 'security') sectionHTML += '<aside class="ndc-security-note" aria-label="Security information"><span class="ndc-security-icon" aria-hidden="true">🔒</span><div><h2>Security information</h2><p><strong>VAHAN Cloud:</strong> Documents you upload are sent over HTTPS and stored encrypted at rest in the configured MongoDB Atlas storage. Signed-in users in your registered dealership account can retrieve them. Your company can choose a 7-, 14- or 20-day retention period (20 days by default); Cloud records and files are automatically deleted according to that setting.</p><p><strong>Desktop extension workflow:</strong> When you select local customer folders directly in the extension, matching and preparation happen on your device. Account and subscription checks do not send those local document files to NDC. The extension submits selected files to the official VAHAN portal as part of your workflow.</p><p class="ndc-security-foot">Manage Cloud retention in workspace settings. Account, subscription and login security records are maintained separately. <a href="privacy-policy.html">Read our privacy policy ↗</a></p></div></aside>';
    content.innerHTML = sectionHTML;
    content.querySelectorAll('.ndc-device-alias-form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault(); const button = form.querySelector('button'), status = form.querySelector('[role="status"]');
      button.disabled = true;
      try {
        await api(`/api/panel/sessions/${encodeURIComponent(form.dataset.deviceSession)}/alias`, { method: "PUT", body: JSON.stringify({ type: form.dataset.deviceType, alias: form.elements.alias.value }) });
        // Update every row for this device from fresh server data.
        await loadDashboard();
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    }));
    content.querySelector('[data-copy-referral]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget, code = content.querySelector('[data-referral-code]');
      const status = content.querySelector('[data-referral-status]');
      if (!code || !account.referralCode) return;
      button.disabled = true;
      try {
        await navigator.clipboard.writeText(String(account.referralCode));
        status.textContent = 'Code copied. Ready to share!';
      } catch {
        const selection = window.getSelection(), range = document.createRange();
        code.focus(); range.selectNodeContents(code); selection?.removeAllRanges(); selection?.addRange(range);
        status.textContent = 'Select and copy the highlighted code to share it.';
      } finally { button.disabled = false; }
    });
    if (activeSection === "setup") formatSetupGuide(content);

    const assignedPlan = currentPlanId(account);
    const selectedRadio = document.querySelector(`input[name="renewalPlan"][value="${assignedPlan}"]`);
    if (selectedRadio) selectedRadio.checked = true;
    mountRenewalOffer();
    renewalTotal();
    $("ndcQuickRenew")?.addEventListener("click", () => {
      const planId = currentPlanId(dashboardData.account);
      if (!planId) return;
      if (activeSection !== "subscription") navigate("subscription");
      const plan = document.querySelector(`input[name="renewalPlan"][value="${planId}"]`);
      if (plan) plan.checked = true;
      const month = document.querySelector('input[name="renewalMonths"][value="1"]'); if (month) month.checked = true;
      renewalTotal();
      $("ndcRenewalForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
      const message = $("ndcQuickRenewStatus"); if (message) message.textContent = "Review your billing details and payment summary, then continue to checkout.";
    });
    $("ndcMoreMonths")?.addEventListener("click", () => {
      if (activeSection !== "subscription") navigate("subscription");
      $("ndcRenewalForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector('input[name="renewalMonths"]')?.focus({ preventScroll: true });
    });
    setPaymentBusy(paymentBusy);

    content.querySelector("#ndcGstProfileForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget, status = form.querySelector("[data-gst-profile-status]"), button = form.querySelector('button[type="submit"]');
      const fields = Object.fromEntries(new FormData(form).entries());
      button.disabled = true; status.textContent = "Saving…";
      try {
        const result = await api("/api/panel/gst-profile", { method: "PATCH", body: JSON.stringify(fields) });
        dashboardData.gstProfile = result.profile; dashboardData.gstInvoicelocked = result.gstinLocked; dashboardData.gstProfileLocked = result.profileLocked === true;
        const invoices = await api("/api/panel/gst-invoices"); dashboardData.gstInvoices = invoices.invoices || [];
        status.textContent = "Business details saved."; renderDashboard();
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    });
    const invoiceSearch = content.querySelector("#ndcInvoiceSearch");
    const invoiceFrom = content.querySelector("#ndcInvoiceDateFrom");
    const invoiceTo = content.querySelector("#ndcInvoiceDateTo");
    const invoiceRows = [...content.querySelectorAll("[data-invoice-row]")];
    const applyInvoiceFilters = () => {
      const term = (invoiceSearch?.value || "").trim().toLowerCase(), from = invoiceFrom?.value || "", to = invoiceTo?.value || "";
      let visible = 0;
      for (const row of invoiceRows) {
        const match = (!term || row.dataset.invoiceSearch.includes(term)) && (!from || row.dataset.invoiceDate >= from) && (!to || row.dataset.invoiceDate <= to);
        row.hidden = !match; if (match) visible++;
      }
      const status = content.querySelector("#ndcInvoiceFilterStatus");
      if (status) status.textContent = invoicesSummary(visible, invoiceRows.length);
    };
    const invoicesSummary = (visible, total) => total ? `Showing ${visible} of ${total} invoice(s).` : (dashboardData?.gstInvoiceError ? "Invoice records could not be loaded." : "No paid invoices yet.");
    invoiceSearch?.addEventListener("input", applyInvoiceFilters);
    invoiceFrom?.addEventListener("change", applyInvoiceFilters);
    invoiceTo?.addEventListener("change", applyInvoiceFilters);
    content.querySelector("#ndcInvoiceFilterReset")?.addEventListener("click", () => { if (invoiceSearch) invoiceSearch.value = ""; if (invoiceFrom) invoiceFrom.value = ""; if (invoiceTo) invoiceTo.value = ""; applyInvoiceFilters(); });
    content.querySelector("#ndcInvoiceRefresh")?.addEventListener("click", () => { void loadDashboard(); });
    applyInvoiceFilters();

    content.querySelectorAll("[data-download-gst-invoice]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true; const token = sessionStorage.getItem(TOKEN_KEY);
      try {
        const response = await fetch(API_BASE + "/api/panel/gst-invoices/" + encodeURIComponent(button.dataset.downloadGstInvoice) + "/pdf", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || "Invoice download failed."); }
        const disposition = response.headers.get("Content-Disposition") || "";
        const headerFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "";
        const invoiceNumber = button.dataset.invoiceNumber || "";
        const invoiceFilename = invoiceNumber ? "NDC-GST-Invoice-" + invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_") + ".pdf" : "";
        const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = headerFilename || invoiceFilename || "NDC-GST-Invoice.pdf";
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { alert(error.message); } finally { button.disabled = false; }
    }));

    // Update active navigation button.
    document.querySelectorAll("[data-section]").forEach((element) => {
      element.classList.toggle(
        "is-active",
        element.dataset.section === activeSection
      );
    });

    // Dashboard internal navigation.
    document.querySelectorAll("[data-go-section]").forEach((element) => {
      element.addEventListener("click", () => {
        navigate(element.dataset.goSection);
      });
    });

    // Session revocation.
    document.querySelectorAll("[data-revoke-session]").forEach((element) => {
      element.addEventListener("click", async () => {
        const sessionId = element.dataset.revokeSession;

        const sessionType =
          element.dataset.sessionType || "customer_portal";

        if (!sessionId) {
          alert("Session ID is unavailable.");
          return;
        }

        if (
          !confirm(
            "Revoke this device session? That device will need to sign in again."
          )
        ) {
          return;
        }

        element.disabled = true;
        element.textContent = "Revoking…";

        try {
          await api(
            `/api/panel/sessions/${encodeURIComponent(sessionId)}?type=${encodeURIComponent(sessionType)}`,
            {
              method: "DELETE"
            }
          );

          await loadDashboard();

        } catch (error) {
          alert(error.message);

          element.disabled = false;
          element.textContent = "Revoke";
        }
      });
    });

    // Refresh dashboard data.
    $("ndcRefreshDashboard")?.addEventListener(
      "click",
      loadDashboard
    );
  }

  // ---------------------------------------------------------
  // SECTION NAVIGATION
  // ---------------------------------------------------------

  function navigate(section) {
    const allowedSections = [
      "overview",
      "profile",
      "setup",
      "subscription",
      "payments",
      "gst-invoices",
      "sessions",
      "features",
      "security",
      "contact"
    ];

    if (!allowedSections.includes(section)) {
      return;
    }

    activeSection = section;

    renderDashboard();
    renewalTotal();
  }

  function mountRenewalOffer() {
    appliedOffer = null; offerWidget = null;
    const root = $("ndcRenewalOffer");
    if (!root || !window.NDCOfferCode) return;
    offerWidget = NDCOfferCode.mount(root, {
      request: code => api('/api/panel/offers/preview', { method: 'POST', body: JSON.stringify({ code }) }), isBusy: () => paymentBusy,
      onApply: offer => {
        const plan = [...document.querySelectorAll('input[name="renewalPlan"]')].find(n => n.value === offer.planId);
        const months = [...document.querySelectorAll('input[name="renewalMonths"]')].find(n => Number(n.value) === offer.months);
        if (!plan || !months) throw Error('This offer is not available for your account.');
        appliedOffer = offer; plan.checked = true; months.checked = true; renewalTotal();
      },
      onClear: () => { appliedOffer = null; renewalTotal(); }
    });
    offerWidget.setBusy(paymentBusy);
  }
  const RENEWAL_PRICES = {};
  function renewalTotal() {
    const plan = document.querySelector('input[name="renewalPlan"]:checked')?.value, months = Number(document.querySelector('input[name="renewalMonths"]:checked')?.value || 1);
    if ($("ndcRenewalTotal") && RENEWAL_PRICES[plan]) {
      const list = RENEWAL_PRICES[plan] * months, taxable = appliedOffer ? appliedOffer.amountPaise / 100 : list;
      const gstRate = Number(dashboardData?.gstCheckout?.gstRate) || 18, gst = dashboardData?.gstCheckout?.enabled ? Math.round(taxable * gstRate) / 100 : 0;
      renderRenewalSummary({ list, taxable, discount: Math.max(0, list - taxable), gst, gstRate, gstEnabled: dashboardData?.gstCheckout?.enabled === true, total: taxable + gst });
    }
    renewalPreview();
  }

  function renderRenewalSummary(summary) {
    const root = $("ndcRenewalTotal"); if (!root) return;
    const rows = [ ["Plan / offer amount", summary.list], ...(summary.discount > 0 ? [["Discount / offer applied", summary.discount]] : []), ["Taxable amount", summary.taxable], [summary.gstEnabled ? "GST (" + summary.gstRate + "%)" : "GST · not charged", summary.gst], ["Total payable", summary.total] ];
    root.innerHTML = '<div class="ndc-checkout-summary-heading">PAYMENT SUMMARY</div><div class="ndc-checkout-summary-columns"><span>DESCRIPTION</span><span>AMOUNT</span></div>' + rows.map(([label, value]) => '<div class="ndc-checkout-tax-row' + (label === "Total payable" ? ' is-total' : '') + '"><span>' + esc(label) + '</span><strong>' + esc(money(value)) + '</strong></div>').join('') + '<small class="ndc-checkout-summary-note">' + (summary.gstEnabled ? 'GST is calculated after any plan or offer discount.' : 'GST is currently not charged. The amount shown is the amount you will pay.') + '</small>';
  }

  function renewalBillingPayload() {
    const profile = dashboardData?.gstProfile || {};
    const value = (id, key) => String($(id)?.value ?? profile[key] ?? "").trim();
    const values = {
      gstin: value("renewalGstin", "gstin").toUpperCase(),
      tradeName: value("renewalTradeName", "tradeName"),
      businessName: value("renewalBusinessName", "businessName"),
      businessAddress: value("renewalBusinessAddress", "businessAddress"),
      stateCode: value("renewalStateCode", "stateCode"),
      phone: value("renewalBusinessPhone", "phone")
    };
    return values;
  }

  function setPaymentBusy(busy) {
    paymentBusy = busy;
    offerWidget?.setBusy(busy);
    document.querySelectorAll('input[name="renewalPlan"], input[name="renewalMonths"]').forEach(input => input.disabled = busy);
    const quick = $("ndcQuickRenew");
    const account = dashboardData?.account || {};
    const paidExpiry = Date.parse(account.expiresAt);
    const panelExpiry = Date.parse(account.panelExpiresAt || account.renewal?.panelExpiresAt) || (paidExpiry + 5 * 86400000);
    if (quick) quick.disabled = busy || !currentPlanId(dashboardData?.account || {}) ||
      !dashboardData?.account?.expiresAt || dashboardData?.account?.renewal?.canRenew === false ||
      dashboardData?.account?.approved !== true || dashboardData?.account?.disabled || dashboardData?.account?.banned ||
      Date.now() + serverClockOffset >= panelExpiry;
    ["ndcRenewalSubmit", "ndcRenewalPlan", "ndcRenewalMonths"].forEach(id => {
      if ($(id)) $(id).disabled = busy;
    });
  }

  async function renewSubscription(event) {
    event.preventDefault();
    if (offerWidget?.isLoading() || offerWidget?.hasUnapplied()) { $("ndcRenewalStatus").textContent = 'Apply or remove your offer code before continuing.'; return; }
    await startRenewalPayment(document.querySelector('input[name="renewalPlan"]:checked').value, Number(document.querySelector('input[name="renewalMonths"]:checked').value), "ndcRenewalStatus");
  }

  async function startRenewalPayment(planId, months, statusId) {
    if (paymentBusy) return;
    const message = (text) => {
      // Resolve the current node: navigation may re-render during checkout.
      const node = $(statusId) || $("ndcQuickRenewStatus") || $("ndcRenewalStatus");
      if (node) node.textContent = text;
    };
    if (offerWidget?.isLoading() || offerWidget?.hasUnapplied()) {
      message("Apply or remove your offer code before continuing."); return;
    }
    if (statusId !== "ndcRenewalStatus" && appliedOffer) {
      message("An offer is applied. Use Continue to secure payment in the offer checkout below.");
      $("ndcRenewalForm")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    if (typeof Razorpay !== "function") {
      message("Razorpay Checkout did not load. Refresh and retry.");
      return;
    }
    setPaymentBusy(true);
    message("Creating secure payment order…");
    try {
      const result = await api("/api/panel/payments/orders", {
        method: "POST", body: JSON.stringify({ planId, months, ...renewalBillingPayload(), ...(statusId === "ndcRenewalStatus" && appliedOffer?.planId === planId && appliedOffer?.months === months ? { offerCode: appliedOffer.code } : {}) })
      });
      const order = result.data || result;
      if (!order.keyId || !order.orderId || !Number.isFinite(Number(order.amount))) throw Error("Invalid payment order response.");
      const quoteGst = order.gst || {};
      renderRenewalSummary({ list: Number(quoteGst.listPrice || order.baseAmount || order.amount) / 100, discount: Number(quoteGst.discountAmount || 0) / 100, taxable: Number(quoteGst.taxableAmount || order.baseAmount || order.amount) / 100, gst: Number(quoteGst.amount || 0) / 100, gstRate: Number(quoteGst.rate || dashboardData?.gstCheckout?.gstRate || 18), gstEnabled: quoteGst.enabled === true, total: Number(order.amount) / 100 });
      let verificationStarted = false;
      const checkout = new Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amount,
        currency: order.currency || "INR", name: "Next Dimension Customs",
        description: order.description || "VAHAN NDC TOOL - Subscription renewal", theme: { color: "#d7bd55" },
        handler: async payment => {
          if (verificationStarted) return;
          verificationStarted = true;
          message("Verifying your payment…");
          try {
            const result = await api("/api/panel/payments/verify", {
              method: "POST", body: JSON.stringify(payment)
            });
            if (result.manualReview) {
              message("Payment requires manual review. Contact support.");
            } else {
              await loadDashboard();
              message("Payment verified! Your subscription has been updated.");
            }
          } catch (err) {
            message(`Payment completed, but verification is pending: ${err.message}. Save payment ID ${payment.razorpay_payment_id}.`);
          } finally { setPaymentBusy(false); }
        },
        modal: {
          ondismiss: () => {
            if (verificationStarted) return;
            setPaymentBusy(false);
            message("Checkout closed. Check your account before retrying if you paid.");
          }
        }
      });
      checkout.on("payment.failed", e => {
        if (verificationStarted) return;
        setPaymentBusy(false);
        message(e.error?.description || "Payment failed.");
      });
      checkout.open();
    } catch (err) {
      setPaymentBusy(false);
      message(err.message);
    }
  }
  let passwordChangeBusy = false;
  async function changePassword(event) {
    event.preventDefault();
    if (passwordChangeBusy) return;
    const current = $("ndcCurrentPassword"), next = $("ndcNewPassword"), confirm = $("ndcConfirmPassword");
    const button = $("ndcPasswordSubmit"), message = $("ndcPasswordStatus");
    const currentPassword = current.value, newPassword = next.value, confirmPassword = confirm.value;
    if (!currentPassword || new TextEncoder().encode(newPassword).length < 12 || new TextEncoder().encode(newPassword).length > 72) {
      message.textContent = "Enter your current password and a new password of 12–72 UTF-8 bytes."; return;
    }
    if (newPassword !== confirmPassword) { message.textContent = "New passwords do not match."; return; }
    if (newPassword === currentPassword) { message.textContent = "Choose a different new password."; return; }
    passwordChangeBusy = true;
    button.disabled = true;
    message.textContent = "Updating your password…";
    try {
      await api("/api/panel/auth/change-password", {
        method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      current.value = next.value = confirm.value = "";
      message.textContent = "Password changed. All sessions have been signed out. Returning to sign in…";
      setTimeout(() => { void redirectToLogin(); }, 1800);
    } catch (error) {
      current.value = next.value = confirm.value = "";
      message.textContent = error.message;
      button.disabled = false;
      passwordChangeBusy = false;
    }
  }

  // ---------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------

  document.addEventListener("DOMContentLoaded", async () => {
    const toggle = $("ndcMenuToggle"), sidebar = $("ndcNavigation"), backdrop = $("ndcMenuBackdrop");
    function menu(open) {
      sidebar.classList.toggle("is-open", open); toggle.setAttribute("aria-expanded", String(open));
      backdrop.hidden = !open; document.body.classList.toggle("ndc-menu-open", open);
      if (open) $("ndcMenuClose").focus(); else toggle.focus();
    }
    toggle.addEventListener("click", () => menu(toggle.getAttribute("aria-expanded") !== "true"));
    $("ndcMenuClose").addEventListener("click", () => menu(false));
    backdrop.addEventListener("click", () => menu(false));
    sidebar.addEventListener("click", event => { if (event.target.closest('[data-section]') && toggle.getAttribute('aria-expanded') === 'true') menu(false); });
    document.addEventListener("keydown", event => {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (event.key === 'Escape') menu(false);
      if (event.key === 'Tab') {
        const items = [...sidebar.querySelectorAll('button, a[href]')].filter(el => el.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.matchMedia?.('(max-width: 760px)').addEventListener('change', () => { if (toggle.getAttribute('aria-expanded') === 'true') menu(false); });
    document.querySelector('[data-menu-logout]').addEventListener('click', () => $("ndcLogoutButton").click());


    document.addEventListener("change", e => { if (e.target?.name === "renewalPlan" || e.target?.name === "renewalMonths") { if (appliedOffer) offerWidget?.clear("Offer removed because your selection changed."); renewalTotal(); } });
    document.addEventListener("submit", e => {
      if (e.target?.id === "ndcRenewalForm") renewSubscription(e);
      if (e.target?.id === "ndcPasswordForm") changePassword(e);
    });
    document.addEventListener("change", e => {
      if (e.target?.id !== "ndcShowPasswords") return;
      ["ndcCurrentPassword", "ndcNewPassword", "ndcConfirmPassword"].forEach(id => {
        if ($(id)) $(id).type = e.target.checked ? "text" : "password";
      });
    });
    // Footer year.
    const year = $("ndcPortalYear");

    if (year) {
      year.textContent = new Date().getFullYear();
    }

    // Sidebar navigation.
    document.querySelectorAll("[data-section]").forEach((element) => {
      element.addEventListener("click", () => {
        navigate(element.dataset.section);
      });
    });

    // Logout.
    $("ndcLogoutButton")?.addEventListener("click", async () => {
      const button = $("ndcLogoutButton");

      button.disabled = true;
      button.textContent = "Signing out…";

      try {
        await window.NDCAuth.logout();
      } finally {
        window.location.replace("index.html");
      }
    });

    // Check authentication client.
    if (!window.NDCAuth) {
      window.location.replace("index.html");
      return;
    }

    // Check for an existing session.
    if (!window.NDCAuth.isLoggedIn()) {
      window.location.replace("index.html");
      return;
    }

    showLoading();

    try {
      const user = await window.NDCAuth.verifySession();

      if (!user || user.useradmin !== true) {
        await redirectToLogin();
        return;
      }

      await loadDashboard();

    } catch (error) {
      console.error("[NDC] Customer dashboard authentication failed:", error);

      await redirectToLogin();
    }
  });

})();