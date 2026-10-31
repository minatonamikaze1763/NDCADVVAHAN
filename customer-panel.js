/* NDC Customer Portal — Standalone Dashboard */
(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);

    const API_BASE = "https://server.nextdimensioncustoms.in";
    const TOKEN_KEY = "ndc_customer_panel_token";
    const DEFAULT_FEATURES = {
        assistedVahanUploads: true,
        smartDocumentIdentification: true,
        automaticImageCompression: true,
        skipAlreadyUploadedDocuments: true,
        autoStartAndFinalSubmission: true,
        supportedFileFormats: true,
        preparedDocumentZipDownload: true
    };
    let dashboardData = null;
    let activeSection = "overview";
    let redirecting = false;

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
        expired: "Expired"
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
            const response = await api("/api/panel/dashboard");

            dashboardData = response.dashboard || response;

            if (!dashboardData?.account) {
                throw new Error("Customer account information is unavailable.");
            }

            renderDashboard();

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

    function renderDashboard() {
        const data = dashboardData;

        if (!data?.account) return;

        const account = data.account;

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
        // DEFAULT FEATURES — FRONTEND ONLY
        // -------------------------------------------------------

        const featureEntries = [
            ...Object.entries(DEFAULT_FEATURES),
            ["maxDevices", Number(account.maxDevices) || 1]
        ];

        const features = featureEntries.map(([key, value]) => {
            const isMaxDevices = key === "maxDevices";

            const label = isMaxDevices
                ? "Maximum Allowed Devices"
                : key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

            return `
    <div class="ndc-feature">
      <span>${esc(label)}</span>
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

                <b>${sessionTitle}</b>

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

        else if (activeSection === "subscription") {
            sectionHTML = `

        <div class="ndc-page-heading">
          <span class="ndc-eyebrow">PLAN & BILLING</span>
          <h1>Subscription</h1>
          <p>Your current plan and renewal schedule.</p>
        </div>

        <section class="ndc-panel-card">

          <div class="ndc-plan-name">
            ${esc(planName)}
          </div>

          <div class="ndc-plan-price">
            ${esc(planPrice)}
          </div>

          <div class="ndc-detail-line">
            <span>Subscription started</span>
            <b>${esc(date(account.plan?.startedAt))}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Access expires</span>
            <b>${esc(date(account.expiresAt))}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Upcoming payment</span>
            <b>${esc(date(account.plan?.nextPaymentAt))}</b>
          </div>

          <div class="ndc-detail-line">
            <span>Last payment</span>
            <b>${esc(date(lastPayment))}</b>
          </div>

          <p class="ndc-note">
            Renewal and billing dates are shown only when they have been
            recorded by NDC.
          </p>

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

        const content = $("ndcDashboardContent");

        if (!content) return;

        content.innerHTML = sectionHTML;

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
            "subscription",
            "payments",
            "sessions",
            "features",
            "security"
        ];

        if (!allowedSections.includes(section)) {
            return;
        }

        activeSection = section;

        renderDashboard();
    }

    // ---------------------------------------------------------
    // INITIALIZATION
    // ---------------------------------------------------------

    document.addEventListener("DOMContentLoaded", async () => {

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