// Role-based dashboard rendering. Reuses complaintCardHtml/statusBadge/
// priorityBadge from complaints.js (loaded alongside this file).

function renderStats(statsEl, stats) {
  statsEl.innerHTML = stats.map(({ value, label, icon }) => `
    <div class="stat-card">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${icon ? icon + " " : ""}${label}</div>
    </div>`).join("");
}

async function initUserDashboard() {
  const user = requireAuth(["user"]);
  if (!user) return;

  const statsEl = document.getElementById("stats-row");
  const listEl = document.getElementById("dashboard-list");

  try {
    const { data } = await api.get("/complaints");
    const complaints = data.complaints;
    const open = complaints.filter((c) => !["CLOSED", "REJECTED"].includes(c.status)).length;
    const resolved = complaints.filter((c) => ["RESOLVED", "CLOSED"].includes(c.status)).length;

    renderStats(statsEl, [
      { value: complaints.length, label: "Total filed" },
      { value: open, label: "Open / in progress" },
      { value: resolved, label: "Resolved" },
    ]);

    listEl.innerHTML = complaints.length
      ? `<div class="complaint-list">${complaints.slice(0, 8).map(complaintCardHtml).join("")}</div>`
      : `<div class="empty-state"><div class="empty-icon">📭</div><p>No complaints yet — <a href="/complaints/create.html">file your first one</a>.</p></div>`;
  } catch (err) {
    statsEl.innerHTML = "";
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><p>Dashboard data could not be loaded.</p><p class="text-muted text-sm">${escapeHtml(err.message)}</p></div>`;
    toast(err.message, "error");
  }
}

async function initStaffDashboard() {
  const user = requireAuth(["staff"]);
  if (!user) return;

  const statsEl = document.getElementById("stats-row");
  const listEl = document.getElementById("dashboard-list");
  let currentFilter = "all";
  let allMine = [];

  function renderQueue() {
    let filtered = allMine;
    if (currentFilter === "active") {
      filtered = allMine.filter((c) => !["CLOSED", "REJECTED", "RESOLVED"].includes(c.status));
    } else if (currentFilter === "resolved") {
      filtered = allMine.filter((c) => ["RESOLVED", "CLOSED"].includes(c.status));
    }

    listEl.innerHTML = filtered.length
      ? `<div class="complaint-list">${filtered.map(complaintCardHtml).join("")}</div>`
      : `<div class="empty-state"><div class="empty-icon">✅</div><p>No complaints matching this filter.</p></div>`;
  }

  document.querySelectorAll(".staff-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".staff-filter-btn").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
      currentFilter = btn.dataset.filter;
      renderQueue();
    });
  });

  try {
    const { data } = await api.get("/complaints");
    allMine = data.complaints || [];
    const active = allMine.filter((c) => !["CLOSED", "REJECTED", "RESOLVED"].includes(c.status)).length;
    const escalated = allMine.filter((c) => c.status === "ESCALATED").length;

    renderStats(statsEl, [
      { value: allMine.length, label: "Assigned to me" },
      { value: active, label: "Active" },
      { value: escalated, label: "Escalated" },
    ]);

    renderQueue();
  } catch (err) {
    statsEl.innerHTML = "";
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><p>Dashboard data could not be loaded.</p><p class="text-muted text-sm">${escapeHtml(err.message)}</p></div>`;
    toast(err.message, "error");
  }
}

async function initAdminDashboard() {
  const user = requireAuth(["admin"]);
  if (!user) return;

  const statsEl = document.getElementById("stats-row");
  const listEl = document.getElementById("dashboard-list");

  try {
    const [{ data: analytics }, { data: complaintsData }] = await Promise.all([
      api.get("/admin/analytics?period=7d"),
      api.get("/complaints"),
    ]);

    renderStats(statsEl, [
      { value: analytics.total, label: "Complaints (7 days)" },
      { value: analytics.avgResolutionHours ?? "—", label: "Avg resolution hrs" },
      { value: analytics.slaBreachRatePercent + "%", label: "SLA breach rate" },
    ]);

    listEl.innerHTML = complaintsData.complaints.length
      ? `<div class="complaint-list">${complaintsData.complaints.slice(0, 10).map(complaintCardHtml).join("")}</div>`
      : `<div class="empty-state"><div class="empty-icon">📭</div><p>No complaints yet.</p></div>`;
  } catch (err) {
    statsEl.innerHTML = "";
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><p>Dashboard data could not be loaded.</p><p class="text-muted text-sm">${escapeHtml(err.message)}</p></div>`;
    toast(err.message, "error");
  }
}
