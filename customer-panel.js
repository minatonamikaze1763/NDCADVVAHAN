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
    const plan = NDCPlans.all.find(p => p.id === planId), months = Number(document.querySelector('input[name="renewalMonths"]:checked')?.value || 1);
    if (!plan) { root.textContent = "Choose an available plan to preview your renewal."; return; }
    const now = Date.now() + serverClockOffset, current = Date.parse(account.expiresAt), base = Number.isFinite(current) ? Math.max(now, current) : now;
    const end = new Date(base + plan.durationDays * months * 86400000);
    const deviceLimit = appliedOffer?.maxDevices || planDevices(account, plan);
    const upgrade = Number(deviceLimit) > Number(account.maxDevices);
    const downgrade = Number(deviceLimit) < Number(account.maxDevices) && current > now;
    const switchAt = account.scheduledPlan?.startsAt || account.expiresAt;
    root.innerHTML = `<div class="ndc-preview-heading"><span class="ndc-eyebrow">LIVE RENEWAL PREVIEW</span><span>Updates as you choose</span></div><h3>${esc(plan.name)} · ${months} month${months === 1 ? "" : "s"}</h3>
      <div class="ndc-preview-comparison"><div><small>CURRENT PAID EXPIRY</small><strong>${Number.isFinite(current) ? esc(date(account.expiresAt)) : "No expiry assigned"}</strong><span>${Number(account.maxDevices) || 1} device logins</span></div><b aria-hidden="true">→</b><div><small>AFTER SUCCESSFUL PAYMENT</small><strong>${esc(date(end))}</strong><span>${downgrade ? `${account.maxDevices} logins until ${esc(date(switchAt))}; then ${deviceLimit} logins` : `${deviceLimit} device logins`} · +${months * plan.durationDays} days</span></div></div>
      <div class="ndc-preview-total"><span>Total payment</span><strong>${esc(money(appliedOffer ? appliedOffer.amountPaise / 100 : plan.monthlyPrice * months))}</strong></div><p>${downgrade ? `You keep all features and ${account.maxDevices} logins until ${esc(date(switchAt))}. Then your added duration uses ${deviceLimit} logins. ` : ""}${upgrade ? `Your device limit increases to ${deviceLimit} after payment confirmation. ` : ""}${Number.isFinite(current) && current > now ? "Your remaining paid time is preserved; new days start from your current expiry." : Number.isFinite(current) ? "Your new paid period starts when payment is confirmed." : "Your current account has no expiry. This purchase sets a paid expiry starting from payment confirmation."} Preview dates are estimates until the server confirms payment.</p>`;
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
                        class="ndc-small-danger"
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
              <div class="ndc-plan-options">${availablePlans(account).map((p, i) => `<label class="ndc-choice ndc-plan-choice"><input type="radio" name="renewalPlan" value="${esc(p.id)}" ${i === 0 ? "checked" : ""} required><span><small>${p.id === 'test' ? 'AUTHORIZED TESTING' : 'MONTHLY MEMBERSHIP'}</small><strong>${esc(p.name)}</strong><b>${esc(money(p.monthlyPrice))}<small> / month</small></b><em>${esc(planDevices(account, p))} devices · ${esc(p.durationDays)} days/month</em><ul>${Object.entries(p.features || {}).filter(([,v]) => v === true).map(([key]) => `<li>${esc(NDCPlans.featureLabel(p,key))}</li>`).join('')}</ul></span></label>`).join('')}</div></fieldset>
              <fieldset class="ndc-choice-group"><legend>02 · Add more time</legend><p>Each month adds 30 days. Choose 1–12 months.</p>
              <div class="ndc-month-options">${Array.from({ length: 12 }, (_, i) => `<label class="ndc-choice ndc-month-choice"><input type="radio" name="renewalMonths" value="${i + 1}" ${i === 0 ? 'checked' : ''}><span><strong>${i + 1}</strong><small>${i === 0 ? 'month' : 'months'}</small></span></label>`).join('')}</div></fieldset>
              <div id="ndcRenewalOffer"></div>
              <div id="ndcRenewalPreview" class="ndc-renewal-preview" aria-live="polite"></div>
              <p id="ndcRenewalTotal" aria-live="polite"></p>
              <button class="ndc-home-button" id="ndcRenewalSubmit" type="submit">Continue to secure payment</button>
              <p id="ndcRenewalStatus" role="status" aria-live="polite"></p>
            </form>
          </div>
        </section>
      `;
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

    if (activeSection === "contact") sectionHTML = `<section class="ndc-panel-card"><span class="ndc-eyebrow">WE ARE HERE TO HELP</span><h1>Contact NDC</h1><p>Get help with your account, setup, subscription or payments.</p><a class="ndc-home-button" href="https://wa.me/919052691719" target="_blank" rel="noopener noreferrer">Message support on WhatsApp ↗</a></section>`;
    const content = $("ndcDashboardContent");

    if (!content) return;

    if (["profile", "security", "payments"].includes(activeSection)) sectionHTML += emailSettings(account);
    sectionHTML += '<aside class="ndc-security-note" aria-label="Security information"><span class="ndc-security-icon" aria-hidden="true">🔒</span><div><h2>Security information</h2><p>NDC does not store your uploaded documents or the customer and any other details contained in those documents on our server.</p><p>Our server validates the document-upload process so the tool can follow the required upload steps. This validation does not mean your documents or their sensitive contents are stored on our server. Your documents are submitted to the intended Vahan portal only as part of your workflow.</p><p class="ndc-security-foot">Account, subscription and login security records are maintained separately to provide and protect your access. <a href="privacy-policy.html">Read our privacy policy ↗</a></p></div></aside>';
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
      if (planId) startRenewalPayment(planId, 1, "ndcQuickRenewStatus");
    });
    $("ndcMoreMonths")?.addEventListener("click", () => {
      if (activeSection !== "subscription") navigate("subscription");
      $("ndcRenewalForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector('input[name="renewalMonths"]')?.focus({ preventScroll: true });
    });
    setPaymentBusy(paymentBusy);

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
    if ($("ndcRenewalTotal") && RENEWAL_PRICES[plan]) $("ndcRenewalTotal").textContent = `Total: ${money(appliedOffer ? appliedOffer.amountPaise / 100 : RENEWAL_PRICES[plan] * months)} · ${months} month(s)`;
    renewalPreview();
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
        method: "POST", body: JSON.stringify({ planId, months, ...(statusId === "ndcRenewalStatus" && appliedOffer?.planId === planId && appliedOffer?.months === months ? { offerCode: appliedOffer.code } : {}) })
      });
      const order = result.data || result;
      if (!order.keyId || !order.orderId || !Number.isFinite(Number(order.amount))) throw Error("Invalid payment order response.");
      let verificationStarted = false;
      const checkout = new Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amount,
        currency: order.currency || "INR", name: "Next Dimension Customs",
        description: "Subscription renewal", theme: { color: "#d7bd55" },
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