/* NDC Customer Panel authentication client.
   Uses the separate customer-panel endpoints; it does not use /api/admin routes. */
(() => {
  "use strict";

  const API_BASE = "https://server.nextdimensioncustoms.in";
  const TOKEN_KEY = "ndc_customer_panel_token";
  const USER_KEY = "ndc_customer_panel_user";

  async function request(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new Error("Unable to connect to the NDC server. Please try again.");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) clearSession();
      throw new Error(data.error || data.message || `Request failed (${response.status}).`);
    }
    return data;
  }

  function saveSession(data) {
    if (!data || !data.token || !data.user || data.user.useradmin !== true) {
      throw new Error("The server returned an invalid customer-panel session.");
    }
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function getCachedUser() {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      clearSession();
      return null;
    }
  }

  async function login(username, password) {
    const cleanUsername = String(username || "").trim().toLowerCase();
    if (!cleanUsername.endsWith("_admin")) {
      throw new Error("Use your customer-panel username ending in _admin.");
    }
    if (!password) throw new Error("Enter your password.");

    const data = await request("/api/panel/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: cleanUsername, password }),
    });
    return saveSession(data);
  }

  async function verifySession() {
    if (!sessionStorage.getItem(TOKEN_KEY)) return null;

    const data = await request("/api/panel/auth/me", { method: "GET" });
    const user = data.user || data;
    if (!user || user.useradmin !== true) {
      clearSession();
      throw new Error("This account is not authorized for the customer panel.");
    }
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  async function logout() {
    try {
      if (sessionStorage.getItem(TOKEN_KEY)) {
        await request("/api/panel/auth/logout", { method: "POST" });
      }
    } finally {
      clearSession();
    }
  }

  window.NDCAuth = Object.freeze({
    login,
    verifySession,
    logout,
    getCachedUser,
    isLoggedIn: () => Boolean(sessionStorage.getItem(TOKEN_KEY)),
  });
})();
