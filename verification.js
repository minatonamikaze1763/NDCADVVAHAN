/* NDC Customer Panel UI and session verification. Load after auth.js. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function setMessage(message, type = "error") {
    const el = $("ndcAuthMessage");
    if (!el) return;
    el.textContent = message || "";
    el.dataset.type = type;
    el.hidden = !message;
  }

  function showLogin() {
    $("ndcLoginModal").hidden = false;
    $("ndcCustomerDashboard").hidden = true;
    $("ndcLoginUsername").focus();
  }

  function showDashboard(user) {
    const username = user?.username || "Customer";
    $("ndcUserButton").setAttribute("aria-label", `Open customer dashboard for ${username}`);
    $("ndcUserButton").classList.add("is-authenticated");
    $("ndcLoginModal").hidden = true;
    $("ndcCustomerDashboard").hidden = false;
    $("ndcPanelUsername").textContent = username;
    $("ndcPanelIdentity").textContent =
      user?.useradminUsername || `${username}_admin`;
    $("ndcPanelStatus").textContent = "Authenticated";
    $("ndcPanelExpiry").textContent = user?.expiresAt
      ? new Date(user.expiresAt).toLocaleString()
      : "No account expiry";
  }

  function showLoggedOut() {
    $("ndcUserButton").classList.remove("is-authenticated");
    $("ndcUserButton").setAttribute("aria-label", "Customer login");
    $("ndcCustomerDashboard").hidden = true;
    $("ndcLoginModal").hidden = true;
  }

  async function verifyOnLoad() {
    if (!window.NDCAuth.isLoggedIn()) {
      showLoggedOut();
      return;
    }
    try {
      const user = await window.NDCAuth.verifySession();
      if (user) showDashboard(user);
      else showLoggedOut();
    } catch {
      showLoggedOut();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const userButton = $("ndcUserButton");
    const loginModal = $("ndcLoginModal");
    const dashboard = $("ndcCustomerDashboard");
    const loginForm = $("ndcLoginForm");
    const loginSubmit = $("ndcLoginSubmit");

    userButton.addEventListener("click", async () => {
      if (window.NDCAuth.isLoggedIn()) {
        try {
          const user = await window.NDCAuth.verifySession();
          if (user) showDashboard(user);
          else showLogin();
        } catch {
          showLoggedOut();
          showLogin();
        }
      } else {
        showLogin();
      }
    });

    document.querySelectorAll("[data-ndc-close]").forEach((button) => {
      button.addEventListener("click", () => {
        loginModal.hidden = true;
        dashboard.hidden = true;
      });
    });

    [loginModal, dashboard].forEach((overlay) => {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) overlay.hidden = true;
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        loginModal.hidden = true;
        dashboard.hidden = true;
      }
    });

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      loginSubmit.disabled = true;
      loginSubmit.textContent = "Signing in…";

      try {
        const user = await window.NDCAuth.login(
          $("ndcLoginUsername").value,
          $("ndcLoginPassword").value,
        );
        loginForm.reset();
        showDashboard(user);
      } catch (error) {
        setMessage(error.message || "Login failed.");
      } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Sign In";
      }
    });

    $("ndcLogoutButton").addEventListener("click", async () => {
      const button = $("ndcLogoutButton");
      button.disabled = true;
      try {
        await window.NDCAuth.logout();
      } catch {
        // Local credentials are cleared by NDCAuth even if the server is offline.
      } finally {
        button.disabled = false;
        showLoggedOut();
      }
    });

    verifyOnLoad();
  });
})();
