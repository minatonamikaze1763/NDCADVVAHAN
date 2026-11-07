/* NDC Customer Portal — Homepage Login Handler */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const modal = $("ndcLoginModal");
  const form = $("ndcLoginForm");
  const message = $("ndcAuthMessage");
  const submitButton = $("ndcLoginSubmit");

  function showMessage(text, type = "error") {
    if (!message) return;

    message.textContent = text || "";
    message.dataset.type = type;
    message.hidden = !text;
  }

  let loginTrigger = null;
  let previousOverflow = "";

  function openLogin() {
    if (!modal) return;

    loginTrigger = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.hidden = false;
    $("ndcLoginUsername")?.focus();
  }

  function closeLogin() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = previousOverflow;
    const password = $("ndcLoginPassword");
    if (password) password.type = "password";
    const toggle = modal.querySelector(".ndc-password-toggle");
    if (toggle) {
      toggle.textContent = "Show";
      toggle.setAttribute("aria-label", "Show password");
      toggle.setAttribute("aria-pressed", "false");
    }
    loginTrigger?.focus();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Customer icon in the homepage navigation.
    $("ndcUserButton")?.addEventListener("click", async () => {
      if (window.NDCAuth?.isLoggedIn()) {
        try {
          const user = await window.NDCAuth.verifySession();

          if (user?.useradmin === true) {
            window.location.assign("customer-panel.html");
            return;
          }
        } catch (error) {
          console.warn("[NDC] Existing customer session is invalid:", error);
        }
      }

      openLogin();
    });

    // Close buttons.
    document.querySelectorAll("[data-ndc-close]").forEach((button) => {
      button.addEventListener("click", closeLogin);
    });

    // Close when clicking outside the login card.
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeLogin();
      }
    });

    // Escape key closes the login modal.
    document.addEventListener("keydown", (event) => {
      if (!modal || modal.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeLogin();
      }
      if (event.key === "Tab") {
        const focusable = [...modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),summary')]
          .filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });

    // Customer login.
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();

      showMessage("");

      if (!window.NDCAuth) {
        showMessage("Authentication service is unavailable. Please refresh.");
        return;
      }

      const username = $("ndcLoginUsername")?.value.trim();
      const password = $("ndcLoginPassword")?.value;

      submitButton.disabled = true;
      submitButton.textContent = "Signing in…";

      try {
        const user = await window.NDCAuth.login(username, password);

        if (user && user.useradmin !== true) {
          await window.NDCAuth.logout();
          throw new Error("This account does not have customer portal access.");
        }

        form.reset();

        // Open the separate dashboard page.
        window.location.assign("customer-panel.html");
      } catch (error) {
        showMessage(
          error.message || "Unable to sign in. Please try again."
        );
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Sign in to account";
      }
    });
  });
})();