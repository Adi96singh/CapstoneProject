// Admin console pages: analytics, users, staff workload, categories,
// departments, SLA rules, escalations, audit logs. One file, one init
// function per page, each triggered only if its root element exists.

async function initAdminAnalytics() {
  const root = document.getElementById("analytics-root");
  if (!root) return;
  if (!requireAuth(["admin"])) return;

  const periodSel = document.getElementById("period-select");

  async function load() {
    root.innerHTML = `<p class="text-muted">Loading…</p>`;
    try {
      const { data } = await api.get(`/admin/analytics?period=${periodSel.value}`);
      root.innerHTML = `
        <div class="stats-row">
          <div class="stat-card"><div class="stat-value">${data.total}</div><div class="stat-label">Total complaints</div></div>
          <div class="stat-card"><div class="stat-value">${data.avgResolutionHours ?? "—"}</div><div class="stat-label">Avg resolution (hrs)</div></div>
          <div class="stat-card"><div class="stat-value">${data.slaBreachRatePercent}%</div><div class="stat-label">SLA breach rate</div></div>
        </div>
        <div class="detail-grid">
          <div class="card">
            <h4>By status</h4>
            ${renderCountTable(data.byStatus)}
          </div>
          <div class="card">
            <h4>By priority</h4>
            ${renderCountTable(data.byPriority)}
          </div>
        </div>
        <div class="card mt-4">
          <h4>Daily trend</h4>
          ${
            data.trend.length
              ? `<table><thead><tr><th>Day</th><th>Complaints</th></tr></thead><tbody>${data.trend
                  .map((t) => `<tr><td>${t.day}</td><td>${t.count}</td></tr>`)
                  .join("")}</tbody></table>`
              : `<p class="text-muted text-sm">No data in this period.</p>`
          }
        </div>
      `;
    } catch (err) {
      root.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderCountTable(obj) {
    const entries = Object.entries(obj || {});
    if (!entries.length) return `<p class="text-muted text-sm">No data.</p>`;
    return `<table><tbody>${entries.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table>`;
  }

  periodSel.addEventListener("change", load);
  load();
}

async function initAdminUsers() {
  const root = document.getElementById("users-root");
  if (!root) return;
  if (!requireAuth(["admin"])) return;

  async function load() {
    root.innerHTML = `<p class="text-muted">Loading…</p>`;
    try {
      const [{ data: usersData }, { data: deptsData }] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/departments"),
      ]);
      const departments = deptsData.departments || [];

      root.innerHTML = `<table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Active</th></tr></thead>
        <tbody>${usersData.users
          .map(
            (u) => `<tr>
              <td><strong>${escapeHtml(u.name)}</strong></td>
              <td>${escapeHtml(u.email)}</td>
              <td>
                <select data-id="${u.id}" class="role-select">
                  ${["user", "staff", "admin"].map((r) => `<option value="${r}" ${r === u.role ? "selected" : ""}>${r.toUpperCase()}</option>`).join("")}
                </select>
              </td>
              <td>
                <select data-id="${u.id}" class="dept-select">
                  <option value="" ${!u.departmentId ? "selected" : ""}>— None / General —</option>
                  ${departments.map((d) => `<option value="${d.id}" ${u.departmentId === d.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
                </select>
              </td>
              <td><input type="checkbox" data-id="${u.id}" class="active-toggle" ${u.isActive ? "checked" : ""} /></td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`;

      root.querySelectorAll(".role-select").forEach((el) => {
        el.addEventListener("change", () => updateUser(el.dataset.id, { role: el.value }));
      });
      root.querySelectorAll(".dept-select").forEach((el) => {
        el.addEventListener("change", () => updateUser(el.dataset.id, { departmentId: el.value || null }));
      });
      root.querySelectorAll(".active-toggle").forEach((el) => {
        el.addEventListener("change", () => updateUser(el.dataset.id, { isActive: el.checked }));
      });
    } catch (err) {
      root.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
    }
  }

  async function updateUser(id, patch) {
    try {
      await api.patch(`/admin/users/${id}`, patch);
      toast("User updated successfully!", "success");
    } catch (err) {
      toast(err.message, "error");
      load();
    }
  }

  load();
}

async function initAdminStaffWorkload() {
  const root = document.getElementById("staff-workload-root");
  if (!root) return;
  if (!requireAuth(["admin"])) return;

  try {
    const { data } = await api.get("/admin/staff-workload");
    root.innerHTML = data.staff.length
      ? `<table><thead><tr><th>Staff</th><th>Email</th><th>Department</th><th>Active complaints</th></tr></thead>
        <tbody>${data.staff
          .map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.department || "—")}</td><td>${s.activeComplaints}</td></tr>`)
          .join("")}</tbody></table>`
      : `<div class="empty-state">No staff accounts yet.</div>`;
  } catch (err) {
    root.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
  }
}

// ---- Generic CRUD resource pages: categories, departments, SLA rules ----
function initAdminResourcePage(config) {
  const root = document.getElementById(config.rootId);
  if (!root) return;
  if (!requireAuth(["admin"])) return;

  async function load() {
    root.innerHTML = `<p class="text-muted">Loading…</p>`;
    try {
      const { data } = await api.get(config.listPath);
      const items = data[config.dataKey];
      root.innerHTML = `
        <table><thead><tr>${config.columns.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
        <tbody>${items
          .map(
            (item) => `<tr>
              ${config.columns.map((c) => `<td>${c.render ? c.render(item) : escapeHtml(item[c.key] ?? "—")}</td>`).join("")}
              <td><button class="btn btn-danger btn-sm" data-id="${item.id}">Delete</button></td>
            </tr>`
          )
          .join("")}</tbody></table>
      `;
      root.querySelectorAll("button[data-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this item?")) return;
          try {
            await api.del(`${config.basePath}/${btn.dataset.id}`);
            toast("Deleted", "success");
            load();
          } catch (err) {
            toast(err.message, "error");
          }
        });
      });
    } catch (err) {
      root.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
    }
  }

  const form = document.getElementById(config.formId);
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = config.buildPayload(form);
      try {
        await api.post(config.basePath, payload);
        toast("Created", "success");
        form.reset();
        load();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }

  load();
}

function initAdminCategories() {
  initAdminResourcePage({
    rootId: "categories-root",
    formId: "category-form",
    listPath: "/admin/categories",
    basePath: "/admin/categories",
    dataKey: "categories",
    columns: [
      { key: "name", label: "Name" },
      { key: "description", label: "Description" },
      { label: "Department", render: (c) => escapeHtml(c.Department ? c.Department.name : "—") },
    ],
    buildPayload: (form) => ({
      name: form.name.value.trim(),
      description: form.description.value.trim() || undefined,
      departmentId: form.departmentId.value || undefined,
    }),
  });
}

function initAdminDepartments() {
  initAdminResourcePage({
    rootId: "departments-root",
    formId: "department-form",
    listPath: "/admin/departments",
    basePath: "/admin/departments",
    dataKey: "departments",
    columns: [
      { key: "name", label: "Name" },
      { key: "description", label: "Description" },
      { label: "Head", render: (d) => escapeHtml(d.head ? d.head.name : "—") },
    ],
    buildPayload: (form) => ({
      name: form.name.value.trim(),
      description: form.description.value.trim() || undefined,
    }),
  });
}

function initAdminSlaRules() {
  initAdminResourcePage({
    rootId: "sla-rules-root",
    formId: "sla-rule-form",
    listPath: "/admin/sla-rules",
    basePath: "/admin/sla-rules",
    dataKey: "slaRules",
    columns: [
      { key: "priority", label: "Priority" },
      { label: "Category", render: (r) => escapeHtml(r.Category ? r.Category.name : "Any") },
      { key: "responseHours", label: "Response (hrs)" },
      { key: "resolutionHours", label: "Resolution (hrs)" },
    ],
    buildPayload: (form) => ({
      priority: form.priority.value,
      responseHours: Number(form.responseHours.value),
      resolutionHours: Number(form.resolutionHours.value),
      categoryId: form.categoryId.value || undefined,
    }),
  });
}

async function initAdminEscalations() {
  const root = document.getElementById("escalations-root");
  if (!root) return;
  if (!requireAuth(["admin"])) return;

  try {
    const { data } = await api.get("/admin/escalations");
    root.innerHTML = data.escalations.length
      ? `<table><thead><tr><th>Complaint</th><th>Reason</th><th>Priority change</th><th>When</th></tr></thead>
        <tbody>${data.escalations
          .map(
            (e) => `<tr>
              <td><a href="/complaints/detail.html?id=${e.complaintId}">${e.Complaint ? escapeHtml(e.Complaint.refNo) : e.complaintId}</a></td>
              <td>${escapeHtml(e.reason)}</td>
              <td>${e.fromPriority} → ${e.toPriority}</td>
              <td>${formatDate(e.triggeredAt || e.createdAt)}</td>
            </tr>`
          )
          .join("")}</tbody></table>`
      : `<div class="empty-state">No escalations yet.</div>`;
  } catch (err) {
    root.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
  }
}

async function initAdminAuditLogs() {
  const root = document.getElementById("audit-logs-root");
  if (!root) return;
  if (!requireAuth(["admin"])) return;

  try {
    const { data } = await api.get("/admin/audit-logs?limit=100");
    root.innerHTML = data.logs.length
      ? `<table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody>${data.logs
          .map(
            (l) => `<tr>
              <td>${formatDate(l.createdAt)}</td>
              <td>${l.User ? escapeHtml(l.User.name) : "System"}</td>
              <td>${escapeHtml(l.action)}</td>
              <td>${escapeHtml(l.entityType)}${l.entityId ? " #" + String(l.entityId).slice(0, 8) : ""}</td>
            </tr>`
          )
          .join("")}</tbody></table>`
      : `<div class="empty-state">No audit log entries yet.</div>`;
  } catch (err) {
    root.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
  }
}
