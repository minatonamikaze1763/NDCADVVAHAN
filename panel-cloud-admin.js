(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const api = () => window.NDCAdminApi?.request;
  let plans = [], demoUsers = [], editingId = null;

  function notice(id, message, good = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("hidden", !message);
    node.classList.toggle("good", good);
    node.classList.toggle("error", Boolean(message) && !good);
  }
  function clearPlanForm() {
    editingId = null;
    $("cloudPlanForm").reset();
    $("cloudPlanId").disabled = false;
    $("cloudPlanStructure").value = "fixed";
    $("cloudPlanMonthlyPrice").value = "599";
    $("cloudPlanCapacity").value = "1000";
    $("cloudPlanRecordPrice").value = "0.60";
    $("cloudPlanDocuments").value = "12";
    $("cloudPlanStatus").value = "draft";
    $("cloudPlanVisibility").value = "private";
    $("cloudPlanAcceptPurchases").checked = false;
    $("cloudPlanEditorTitle").textContent = "Create cloud plan";
    $("cloudPlanSave").textContent = "Save plan";
    toggleStructure();
    notice("cloudPlanNotice", "");
  }
  function toggleStructure() {
    $("cloudFixedPriceField").hidden = $("cloudPlanStructure").value === "flex";
  }
  function renderPlans() {
    const body = $("cloudPlansBody");
    body.replaceChildren();
    if (!plans.length) {
      const row = document.createElement("tr"), cell = document.createElement("td");
      cell.colSpan = 5; cell.textContent = "No cloud plans are configured."; row.append(cell); body.append(row); return;
    }
    for (const plan of plans) {
      const row = document.createElement("tr");
      const summary = document.createElement("td"); summary.textContent = plan.name + "\n" + plan.id + "\n12 document slots per customer";
      const structure = document.createElement("td");
      structure.textContent = plan.structure === "flex"
        ? "Flex · ₹" + plan.perCustomerPrice + " / record / month"
        : "Fixed · ₹" + plan.monthlyPrice + " / month · ₹" + plan.perCustomerPrice + " reference charge / record";
      const cap = document.createElement("td"); cap.textContent = Number(plan.maxCustomersPerMonth).toLocaleString("en-IN") + " records/month";
      const state = document.createElement("td"); state.textContent = plan.status + " · " + plan.visibility + " · " + (plan.acceptPurchases ? "accepts purchases" : "purchases off");
      const actions = document.createElement("td"); actions.className = "rowactions";
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.addEventListener("click", () => editPlan(plan));
      const archive = document.createElement("button"); archive.type = "button"; archive.className = "danger"; archive.textContent = "Archive"; archive.disabled = plan.status === "deleted";
      archive.addEventListener("click", async () => {
        if (!confirm("Archive " + plan.name + "? New purchases will stop; existing entitlements remain unchanged.")) return;
        const result = await api()("/api/admin/cloud-addon-plans/" + encodeURIComponent(plan.id), { method: "DELETE", body: { revision: plan.revision } });
        if (!result.ok) return notice("cloudPlanNotice", result.body?.error || "Could not archive this plan.");
        await loadPlans(); notice("cloudPlanNotice", "Plan archived. Existing purchases remain intact.", true);
      });
      actions.append(edit, archive); row.append(summary, structure, cap, state, actions); body.append(row);
    }
  }
  function editPlan(plan) {
    editingId = plan.id;
    $("cloudPlanId").value = plan.id; $("cloudPlanId").disabled = true;
    $("cloudPlanName").value = plan.name;
    $("cloudPlanStructure").value = plan.structure;
    $("cloudPlanMonthlyPrice").value = plan.monthlyPrice ?? "";
    $("cloudPlanCapacity").value = plan.maxCustomersPerMonth;
    $("cloudPlanRecordPrice").value = plan.perCustomerPrice;
    $("cloudPlanDocuments").value = "12";
    $("cloudPlanStatus").value = plan.status === "deleted" ? "inactive" : plan.status;
    $("cloudPlanVisibility").value = plan.visibility;
    $("cloudPlanAcceptPurchases").checked = plan.acceptPurchases === true;
    $("cloudPlanEditorTitle").textContent = "Edit " + plan.name;
    $("cloudPlanSave").textContent = "Save changes";
    toggleStructure();
    $("cloudPlanForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function loadPlans() {
    if (window.NDCAdminApi?.currentUser()?.role !== "admin") return;
    const result = await api()("/api/admin/cloud-addon-plans");
    if (!result.ok) return notice("cloudPlanNotice", result.body?.error || "Unable to load cloud plans.");
    plans = result.body?.plans || [];
    renderPlans();
    const select = $("demoCloudAddonPlan"), previous = select.value;
    select.replaceChildren();
    const none = document.createElement("option"); none.value = ""; none.textContent = "No demo cloud access"; select.append(none);
    for (const plan of plans.filter(item => item.status !== "deleted")) {
      const option = document.createElement("option"); option.value = plan.id;
      option.textContent = plan.name + (plan.structure === "flex" ? " · ₹" + plan.perCustomerPrice + "/record" : " · ₹" + plan.monthlyPrice + "/month") + (plan.visibility === "private" ? " · private demo" : "");
      select.append(option);
    }
    select.value = previous;
    toggleDemoQuantity();
  }
  function toggleDemoQuantity() {
    const plan = plans.find(item => item.id === $("demoCloudAddonPlan").value);
    const field = $("demoCloudQuantityField"), input = $("demoCloudQuantity");
    const flex = plan?.structure === "flex";
    field.hidden = !flex;
    input.required = flex;
    if (flex) { input.max = String(plan.maxCustomersPerMonth); input.value = String(Math.min(Number(input.value) || 100, Number(plan.maxCustomersPerMonth))); }
  }
  async function loadCloudUsage() {
    if (window.NDCAdminApi?.currentUser()?.role !== "admin") return;
    const result = await api()("/api/admin/cloud-usage");
    const body = $("cloudUsageBody"); body.replaceChildren();
    if (!result.ok) {
      const row = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 7; cell.textContent = result.body?.error || "Unable to load usage evidence."; row.append(cell); body.append(row); return;
    }
    const rows = result.body?.periods || [];
    if (!rows.length) {
      const row = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 7; cell.textContent = "No cloud usage has been recorded."; row.append(cell); body.append(row); return;
    }
    for (const item of rows) {
      const row = document.createElement("tr");
      const account = document.createElement("td"); account.textContent = item.username + (item.isDemo ? " · demo" : "") + "\n" + item.userId;
      const plan = document.createElement("td"); plan.textContent = item.planName + " · " + item.structure;
      const count = document.createElement("td"); count.textContent = Number(item.recordsCreated).toLocaleString("en-IN") + " / " + Number(item.recordLimit).toLocaleString("en-IN");
      const months = document.createElement("td"); months.textContent = (item.months || []).map(month => "Month " + month.monthIndex + ": " + Number(month.recordsCreated).toLocaleString("en-IN")).join("\n") || "No monthly usage";
      const unit = document.createElement("td"); unit.textContent = item.structure === "flex" ? "₹" + Number(item.perCustomerPrice).toFixed(2) + " / record" : "₹" + Number(item.monthlyPrice).toFixed(2) + " fixed / month";
      const value = document.createElement("td"); value.textContent = item.demo ? "Demo · not billed" : "₹" + Number(item.usageValue).toFixed(2) + (item.structure === "fixed" ? " fixed plan" : " usage value");
      const period = document.createElement("td"); period.textContent = new Date(item.startsAt).toLocaleDateString("en-IN") + " – " + new Date(item.expiresAt).toLocaleDateString("en-IN");
      row.append(account, plan, count, months, unit, value, period); body.append(row);
    }
  }
  async function loadDemoUsers() {
    if (window.NDCAdminApi?.currentUser()?.role !== "admin") return;
    const result = await api()("/api/admin/demo-users");
    const body = $("demoUsersBody"); body.replaceChildren();
    if (!result.ok) {
      const row = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 5; cell.textContent = result.body?.error || "Unable to load demo accounts."; row.append(cell); body.append(row); return;
    }
    demoUsers = result.body?.users || [];
    if (!demoUsers.length) {
      const row = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 5; cell.textContent = "No demo accounts yet."; row.append(cell); body.append(row); return;
    }
    for (const user of demoUsers) {
      const row = document.createElement("tr");
      const account = document.createElement("td"); account.textContent = user.username + "\n" + (user.name || "Demo account") + "\n" + (user.email || "No email");
      const id = document.createElement("td"); id.textContent = user.id;
      const cloud = document.createElement("td"); cloud.textContent = user.cloudAddon?.active ? user.cloudAddon.planName + " · " + Number(user.cloudAddon.maxCustomersPerMonth).toLocaleString("en-IN") + "/month" : "No demo cloud add-on";
      const expiry = document.createElement("td"); expiry.textContent = (user.disabled ? "Disabled · " : "") + (user.expiresAt ? new Date(user.expiresAt).toLocaleString("en-IN") : "No expiry") + " · " + (user.maxDevices || 1) + " sessions";
      const actions = document.createElement("td"); actions.className = "rowactions";
      const extend = document.createElement("button"); extend.type = "button"; extend.textContent = "Extend 3 days";
      extend.addEventListener("click", async () => {
        const base = Math.max(Date.now(), Date.parse(user.expiresAt || "") || 0);
        const end = new Date(base + 3 * 86400000).toISOString();
        const r = await api()("/api/admin/users/" + encodeURIComponent(user.id), { method: "PATCH", body: { expiresAt: end, demoExpiresAt: end } });
        if (!r.ok) return notice("demoAccountNotice", r.body?.error || "Could not extend demo.");
        await loadDemoUsers(); notice("demoAccountNotice", "Demo expiry extended by three days.", true);
      });
      const disable = document.createElement("button"); disable.type = "button"; disable.className = user.disabled ? "good" : "danger"; disable.textContent = user.disabled ? "Enable" : "Disable";
      disable.addEventListener("click", async () => {
        const r = await api()("/api/admin/users/" + encodeURIComponent(user.id), { method: "PATCH", body: { disabled: !user.disabled } });
        if (!r.ok) return notice("demoAccountNotice", r.body?.error || "Could not update demo account.");
        await loadDemoUsers(); notice("demoAccountNotice", user.disabled ? "Demo account enabled." : "Demo account disabled.", true);
      });
      actions.append(extend, disable); row.append(account, id, cloud, expiry, actions); body.append(row);
    }
  }
  $("cloudPlanStructure").addEventListener("change", toggleStructure);
  $("cloudPlanReset").addEventListener("click", clearPlanForm);
  $("cloudPlanRefresh").addEventListener("click", () => { void loadPlans(); void loadCloudUsage(); });
  $("cloudUsageRefresh").addEventListener("click", () => void loadCloudUsage());
  $("demoUsersRefresh").addEventListener("click", () => void loadDemoUsers());
  $("demoCloudAddonPlan").addEventListener("change", toggleDemoQuantity);
  $("demoCloudQuantity").addEventListener("input", toggleDemoQuantity);
  $("cloudPlanForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("cloudPlanSave"); button.disabled = true;
    try {
      const structure = $("cloudPlanStructure").value;
      const body = {
        id: $("cloudPlanId").value.trim(), name: $("cloudPlanName").value.trim(), structure,
        ...(structure === "fixed" ? { monthlyPrice: Number($("cloudPlanMonthlyPrice").value) } : {}),
        maxCustomersPerMonth: Number($("cloudPlanCapacity").value),
        perCustomerPrice: Number($("cloudPlanRecordPrice").value), documentsPerCustomer: 12,
        status: $("cloudPlanStatus").value, visibility: $("cloudPlanVisibility").value,
        acceptPurchases: $("cloudPlanAcceptPurchases").checked,
      };
      if (editingId) body.revision = plans.find(plan => plan.id === editingId)?.revision;
      const result = await api()(editingId ? "/api/admin/cloud-addon-plans/" + encodeURIComponent(editingId) : "/api/admin/cloud-addon-plans", { method: editingId ? "PUT" : "POST", body });
      if (!result.ok) return notice("cloudPlanNotice", result.body?.error || "Could not save cloud plan.");
      clearPlanForm(); await loadPlans(); notice("cloudPlanNotice", "Cloud plan saved. Public checkout only shows active, public plans that accept purchases.", true);
    } finally { button.disabled = false; }
  });
  $("demoAccountForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (window.NDCAdminApi?.currentUser()?.role !== "admin") return;
    const button = $("demoCreateButton"), password = $("demoPassword").value; button.disabled = true;
    try {
      const addonPlanId = $("demoCloudAddonPlan").value;
      const body = {
        username: $("demoUsername").value.trim(), password,
        ...( $("demoName").value.trim() ? { name: $("demoName").value.trim() } : {}),
        ...( $("demoEmail").value.trim() ? { email: $("demoEmail").value.trim() } : {}),
        ...( $("demoGstin").value.trim() ? { gstin: $("demoGstin").value.trim().toUpperCase() } : {}),
        ...( $("demoExpiry").value ? { expiresAt: new Date($("demoExpiry").value).toISOString() } : {}),
        maxDevices: Number($("demoMaxDevices").value),
        ...(addonPlanId ? { cloudAddonPlanId: addonPlanId } : {}),
        ...(addonPlanId && plans.find(plan => plan.id === addonPlanId)?.structure === "flex" ? { cloudAddonQuantity: Number($("demoCloudQuantity").value) } : {}),
      };
      const result = await api()("/api/admin/demo-users", { method: "POST", body });
      if (!result.ok) return notice("demoAccountNotice", result.body?.error || "Could not create demo account.");
      const user = result.body.user;
      $("demoCreatedCredentials").textContent = "Demo credentials · copy securely\nUsername: " + user.username + "\nPassword: " + password + "\nCustomer panel username: " + result.body.panelUsername + "\nAccount ID: " + user.id + "\nExpires: " + new Date(user.expiresAt).toLocaleString("en-IN");
      $("demoCreatedCredentials").classList.remove("hidden");
      $("demoAccountForm").reset();
      $("demoMaxDevices").value = "1"; toggleDemoQuantity();
      notice("demoAccountNotice", result.body.message || "Demo account created.", true);
      await loadDemoUsers();
    } finally { button.disabled = false; }
  });
  window.NDCloudAdmin = {
    setAuthenticated(admin) {
      $("cloudAddonNav").classList.toggle("hidden", !admin);
      $("demoUsersNav").classList.toggle("hidden", !admin);
      $("sec-cloud-plans").classList.toggle("hidden", !admin);
      $("sec-demo-users").classList.toggle("hidden", !admin);
    }
  };
  $("cloudAddonNav").addEventListener("click", () => { void loadPlans(); void loadCloudUsage(); });
  $("demoUsersNav").addEventListener("click", () => { void loadPlans(); void loadDemoUsers(); });
  toggleStructure();
})();