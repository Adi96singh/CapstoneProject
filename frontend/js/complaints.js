// Complaint list / create / detail page logic.

// crypto.randomUUID is only available on secure contexts (https / localhost).
// Fall back to a v4-shaped uuid so idempotency keys still work on plain http.
function randUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch (_) { /* fall through */ }
  }
  try {
    const g = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${g()}${g()}-${g()}-4${g().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${g().slice(1)}-${g()}${g()}${g()}`;
  } catch (_) {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function statusBadge(status) {
  return `<span class="badge badge-status-${status}">${status.replace(/_/g, " ")}</span>`;
}
function priorityBadge(priority) {
  const icons = { LOW: "▽", MEDIUM: "◈", HIGH: "▲", CRITICAL: "⚠" };
  return `<span class="badge badge-priority-${priority}">${icons[priority] || ""} ${priority}</span>`;
}

function complaintCardHtml(c) {
  const staffMeta = c.staff ? ` · 👤 <span class="text-primary font-medium">${escapeHtml(c.staff.name)}</span>` : ` · <span class="text-warning">⚠️ Unassigned</span>`;
  return `
    <a class="card card-clickable complaint-card complaint-link" href="/complaints/detail.html?id=${encodeURIComponent(c.id)}">
      <div class="complaint-row">
        <div class="complaint-card-body">
          <strong class="complaint-title">${escapeHtml(c.title)}</strong>
          <div class="meta">${escapeHtml(c.refNo)} · ${c.Category ? escapeHtml(c.Category.name) : "Uncategorized"}${staffMeta} · ${formatDate(c.createdAt)}</div>
        </div>
        <div class="flex gap-2 complaint-badges">${priorityBadge(c.priority)}${statusBadge(c.status)}</div>
      </div>
    </a>`;
}

// ---- Categories (public endpoint, available to all authenticated users) ----
async function loadCategoriesInto(selectEl) {
  try {
    const { data } = await api.get("/categories");
    if (data && data.categories && data.categories.length) {
      // Sort categories with "Other" pinned at the bottom
      const sorted = [...data.categories].sort((a, b) => {
        if (a.name.toLowerCase() === "other") return 1;
        if (b.name.toLowerCase() === "other") return -1;
        return a.name.localeCompare(b.name);
      });
      selectEl.innerHTML =
        `<option value="">-- Select category (AI will auto-categorize if left blank) --</option>` +
        sorted.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    } else {
      selectEl.innerHTML = `<option value="">-- No categories configured --</option>`;
    }
  } catch {
    selectEl.innerHTML = `<option value="">-- Category unavailable --</option>`;
  }
}

async function initComplaintCreate() {
  const user = requireAuth();
  if (!user) return;

  const categorySelect = document.getElementById("categoryId");
  // Use the public /categories endpoint — not /admin/categories which requires admin role
  await loadCategoriesInto(categorySelect);

  document.getElementById("create-complaint-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Submitting…`;
    try {
      const payload = {
        title: document.getElementById("title").value.trim(),
        description: document.getElementById("description").value.trim(),
        categoryId: categorySelect.value || null,
        priority: document.getElementById("priority").value,
        locationText: document.getElementById("locationText").value.trim(),
        idempotencyKey: randUuid(),
      };
      const { data } = await api.post("/complaints", payload);
      toast("Complaint filed successfully!", "success");
      window.location.href = `/complaints/detail.html?id=${data.complaint.id}`;
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `Submit complaint`;
    }
  });
}

// ---- List ----
async function initComplaintList() {
  const user = requireAuth();
  if (!user) return;

  const listEl = document.getElementById("complaint-list");
  const filters = { status: "", priority: "", search: "" };

  async function refresh() {
    listEl.innerHTML = `
      <div class="skeleton-list">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>`;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    try {
      const { data } = await api.get(`/complaints?${params.toString()}`);
      listEl.innerHTML = data.complaints.length
        ? `<div class="complaint-list">${data.complaints.map(complaintCardHtml).join("")}</div>`
        : `<div class="empty-state"><span class="empty-icon">📭</span><p>No complaints found.</p><p class="text-muted text-sm">Try clearing your filters.</p></div>`;
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state error-state"><span class="empty-icon">⚠️</span><p>Complaints could not be loaded.</p><p class="text-sm">${escapeHtml(err.message)}</p></div>`;
      toast(err.message, "error");
    }
  }

  document.getElementById("filter-status").addEventListener("change", (e) => { filters.status = e.target.value; refresh(); });
  document.getElementById("filter-priority").addEventListener("change", (e) => { filters.priority = e.target.value; refresh(); });
  document.getElementById("filter-search").addEventListener("input", debounce((e) => { filters.search = e.target.value; refresh(); }, 350));

  refresh();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---- Detail ----
const NEXT_STATUS_OPTIONS = {
  user: { RESOLVED: ["CLOSED", "REOPENED"] },
  staff: {
    OPEN: ["ASSIGNED", "IN_PROGRESS"],
    ASSIGNED: ["IN_PROGRESS", "RESOLVED"],
    IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED"],
    WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED"],
    REOPENED: ["IN_PROGRESS", "RESOLVED"],
  },
  admin: {
    OPEN: ["ASSIGNED", "IN_PROGRESS", "REJECTED", "ESCALATED"],
    ASSIGNED: ["IN_PROGRESS", "RESOLVED", "ESCALATED", "REJECTED"],
    IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "ESCALATED", "REJECTED"],
    WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED", "REJECTED"],
    RESOLVED: ["CLOSED", "REOPENED"],
    REOPENED: ["IN_PROGRESS", "ASSIGNED", "RESOLVED"],
    ESCALATED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
    REJECTED: ["REOPENED"],
    CLOSED: ["REOPENED"],
  },
};

function openStatusModal({ toStatus, onConfirm }) {
  const modal = document.getElementById("status-modal");
  const title = document.getElementById("status-modal-title");
  const desc = document.getElementById("status-modal-desc");
  const noteInput = document.getElementById("status-modal-note");
  const label = document.getElementById("status-modal-label");
  const cancelBtn = document.getElementById("status-modal-cancel");
  const confirmBtn = document.getElementById("status-modal-confirm");
  if (!modal || !confirmBtn) return;

  const niceStatus = toStatus.replace(/_/g, " ");
  title.textContent = `Update Status: ${niceStatus}`;
  noteInput.value = "";

  if (toStatus === "RESOLVED") {
    desc.textContent = "Please provide details on what was done to fix or resolve this complaint (visible to complainant).";
    label.textContent = "Resolution Note (Required)*";
    noteInput.placeholder = "Explain what actions were taken to resolve this...";
  } else if (toStatus === "REJECTED") {
    desc.textContent = "Please provide the reason for rejecting this complaint.";
    label.textContent = "Rejection Reason";
    noteInput.placeholder = "Enter reason for rejection...";
  } else {
    desc.textContent = `Enter optional remarks for moving this complaint to ${niceStatus}.`;
    label.textContent = "Remarks / Note (Optional)";
    noteInput.placeholder = "Enter any relevant notes or updates...";
  }

  modal.style.display = "flex";

  const close = () => {
    modal.style.display = "none";
    cancelBtn.onclick = null;
    confirmBtn.onclick = null;
  };

  cancelBtn.onclick = close;
  confirmBtn.onclick = async () => {
    const reason = noteInput.value.trim();
    if (toStatus === "RESOLVED" && !reason) {
      toast("Resolution note is required when resolving a complaint", "error");
      noteInput.focus();
      return;
    }
    close();
    await onConfirm(reason);
  };
}

async function setupAdminAssignment(user, c) {
  if (user.role !== "admin") return;
  const card = document.getElementById("admin-assign-card");
  const select = document.getElementById("admin-staff-select");
  const noteInput = document.getElementById("admin-assign-note");
  const assignBtn = document.getElementById("admin-assign-btn");
  if (!card || !select || !assignBtn) return;

  card.style.display = "block";

  try {
    const { data } = await api.get("/admin/staff-workload");
    const staffList = data.staff || [];
    if (staffList.length) {
      select.innerHTML =
        `<option value="">-- Choose staff member --</option>` +
        staffList
          .map(
            (s) =>
              `<option value="${s.id}" ${c.staffId === s.id ? "selected" : ""}>
                ${escapeHtml(s.name)} (${escapeHtml(s.department || "No dept")}) — ${s.activeComplaints} active
              </option>`
          )
          .join("");
    } else {
      select.innerHTML = `<option value="">No active staff members found</option>`;
      assignBtn.disabled = true;
    }
  } catch (err) {
    select.innerHTML = `<option value="">Could not load staff list</option>`;
  }

  assignBtn.onclick = async () => {
    const staffId = select.value;
    if (!staffId) {
      toast("Please select a staff member to assign", "error");
      return;
    }
    const note = noteInput ? noteInput.value.trim() : "";
    assignBtn.disabled = true;
    assignBtn.innerHTML = `<span class="spinner"></span> Assigning…`;
    try {
      await api.post(`/complaints/${c.id}/assign`, { staffId, note });
      toast("Task assigned to staff successfully!", "success");
      loadComplaint(user, c.id);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      assignBtn.disabled = false;
      assignBtn.innerHTML = `Confirm Assignment`;
    }
  };
}

async function initComplaintDetail() {
  const user = requireAuth();
  if (!user) return;
  const id = qs("id");
  if (!id) { toast("Missing complaint id", "error"); return; }

  // Hide internal note row for regular users
  const internalRow = document.getElementById("internal-note-row");
  if (internalRow && user.role === "user") {
    internalRow.style.display = "none";
  }

  // Check if returning from Cashfree redirect
  const returnOrderId = qs("order_id");
  const returnPaymentStatus = qs("payment");
  if (returnOrderId) {
    try {
      const { data } = await api.get(`/payments/verify/${returnOrderId}`);
      if (data && data.isPaid) {
        toast("Payment confirmed! Upgraded to Priority ⭐", "success");
        window.history.replaceState({}, document.title, window.location.pathname + `?id=${id}`);
      }
    } catch {}
  } else if (returnPaymentStatus === "SUCCESS" || returnPaymentStatus === "PAID") {
    toast("Payment successful! Upgraded to Priority ⭐", "success");
    window.history.replaceState({}, document.title, window.location.pathname + `?id=${id}`);
  }

  await loadComplaint(user, id);
  connectSocket({
    "complaint:status_changed": (p) => p.complaintId === id && loadComplaint(user, id),
    "complaint:comment_added": (p) => p.complaintId === id && loadComments(user, id),
    "complaint:assigned": (p) => p.complaintId === id && loadComplaint(user, id),
    "complaint:escalated": (p) => p.complaintId === id && loadComplaint(user, id),
  });

  document.getElementById("comment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = document.getElementById("comment-content").value.trim();
    const isInternal = document.getElementById("comment-internal")?.checked || false;
    if (!content) return;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api.post(`/complaints/${id}/comments`, { content, isInternal });
      document.getElementById("comment-content").value = "";
      loadComments(user, id);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("image-upload").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    try {
      await api.upload(`/complaints/${id}/images`, formData);
      toast("Image uploaded", "success");
      loadComplaint(user, id);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  document.getElementById("ai-summary-btn")?.addEventListener("click", async () => {
    const el = document.getElementById("ai-panel");
    el.innerHTML = `<div class="ai-loading"><span class="spinner"></span> AI is thinking…</div>`;
    try {
      const { data } = await api.get(`/complaints/${id}/ai/summary`);
      el.innerHTML = data.aiAvailable
        ? `<p class="text-sm ai-result">${escapeHtml(data.summary || "No summary available.")}</p>`
        : `<p class="text-sm text-muted">AI features aren't configured on this server.</p>`;
    } catch (err) { el.innerHTML = `<p class="text-sm text-muted">${escapeHtml(err.message)}</p>`; }
  });

  document.getElementById("ai-suggest-btn")?.addEventListener("click", async () => {
    const el = document.getElementById("ai-panel");
    el.innerHTML = `<div class="ai-loading"><span class="spinner"></span> AI is thinking…</div>`;
    try {
      const { data } = await api.get(`/complaints/${id}/ai/suggested-resolution`);
      el.innerHTML = data.aiAvailable
        ? `<ul class="text-sm ai-result">${(data.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("") || "<li>No suggestions.</li>"}</ul>`
        : `<p class="text-sm text-muted">AI features aren't configured on this server.</p>`;
    } catch (err) { el.innerHTML = `<p class="text-sm text-muted">${escapeHtml(err.message)}</p>`; }
  });

  document.getElementById("checkout-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("checkout-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Preparing payment…`;
    try {
      const { data } = await api.post(`/complaints/${id}/checkout`);
      if (typeof Cashfree !== "undefined") {
        const cf = Cashfree({ mode: data.environment || "sandbox" });
        cf.checkout({
          paymentSessionId: data.paymentSessionId,
          redirectTarget: "_modal",
        }).then(async (result) => {
          if (result && result.error) {
            toast(result.error.message || "Payment cancelled", "error");
          }
          if (result && result.paymentDetails) {
            try {
              await api.get(`/payments/verify/${data.orderId}`);
            } catch {}
            toast("Payment successful! Upgraded to Priority ⭐", "success");
            loadComplaint(user, id);
          }
        });
      } else {
        toast("Cashfree payment script not loaded. Refresh and try again.", "error");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `⭐ Upgrade to priority (₹199)`;
    }
  });

  document.getElementById("simulate-pay-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("simulate-pay-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Upgrading…`;
    try {
      await api.post(`/payments/simulate/${id}`);
      toast("Payment confirmed! Upgraded to Priority ⭐", "success");
      loadComplaint(user, id);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `⚡ Test Sandbox Upgrade (Instant)`;
    }
  });
}

async function loadComplaint(user, id) {
  try {
    const { data } = await api.get(`/complaints/${id}`);
    renderComplaintDetail(user, data.complaint);
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderComplaintDetail(user, c) {
  document.getElementById("complaint-title").textContent = c.title;
  document.getElementById("complaint-meta").innerHTML =
    `<span>${c.refNo}</span> · Filed by <strong>${escapeHtml(c.author?.name || "—")}</strong> · ${formatDate(c.createdAt)}` +
    (c.slaDeadline ? ` · <span class="sla-due">SLA due ${formatDate(c.slaDeadline)}</span>` : "");
  document.getElementById("complaint-badges").innerHTML =
    `${priorityBadge(c.priority)}${statusBadge(c.status)}` +
    (c.isPremium ? ` <span class="badge badge-premium">⭐ PREMIUM</span>` : "");
  document.getElementById("complaint-description").textContent = c.description;
  document.getElementById("complaint-location").textContent = c.locationText || "—";
  document.getElementById("complaint-category").textContent = c.Category ? c.Category.name : "Uncategorized";
  document.getElementById("complaint-staff").textContent = c.staff ? c.staff.name : "Unassigned";

  const imagesEl = document.getElementById("complaint-images");
  imagesEl.innerHTML = (c.images || []).map((img) => `<a href="${img.url}" target="_blank"><img src="${img.url}" alt="attachment"/></a>`).join("") || `<span class="text-muted text-sm">No attachments</span>`;

  const timelineEl = document.getElementById("complaint-timeline");
  timelineEl.innerHTML = (c.statusHistory || [])
    .map((h) => `<div class="timeline-item"><strong>${h.toStatus.replace(/_/g," ")}</strong><div class="text-sm text-muted">${formatDate(h.createdAt)}${h.reason ? " — " + escapeHtml(h.reason) : ""}</div></div>`)
    .join("");

  // Setup Admin assignment controls if user is admin
  setupAdminAssignment(user, c);

  // Status action buttons
  const actionsEl = document.getElementById("status-actions");
  const nextOptions = (NEXT_STATUS_OPTIONS[user.role] || {})[c.status] || [];
  actionsEl.innerHTML = nextOptions.length
    ? nextOptions.map((s) => `<button class="btn btn-secondary btn-sm" data-status="${s}">${s.replace(/_/g, " ")}</button>`).join("")
    : `<p class="text-sm text-muted">No status actions available</p>`;
  actionsEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const toStatus = btn.dataset.status;
      openStatusModal({
        toStatus,
        onConfirm: async (reason) => {
          try {
            await api.patch(`/complaints/${c.id}/status`, { toStatus, reason });
            toast(`Status updated to ${toStatus.replace(/_/g, " ")}`, "success");
            loadComplaint(user, c.id);
          } catch (err) {
            toast(err.message, "error");
          }
        },
      });
    });
  });

  // Payment upgrade buttons shown to the author and admins on non-premium open complaints
  const canUpgrade = (user.id === c.userId || user.role === "admin") && !c.isPremium && !["RESOLVED", "CLOSED", "REJECTED"].includes(c.status);
  const checkoutBtn = document.getElementById("checkout-btn");
  const simPayBtn = document.getElementById("simulate-pay-btn");
  if (checkoutBtn) checkoutBtn.style.display = canUpgrade ? "block" : "none";
  if (simPayBtn) simPayBtn.style.display = canUpgrade ? "block" : "none";

  loadComments(user, c.id);
}

async function loadComments(user, id) {
  try {
    const { data } = await api.get(`/complaints/${id}/comments`);
    document.getElementById("comment-list").innerHTML = data.comments.length
      ? data.comments.map((cm) => `
          <div class="comment ${cm.isInternal ? "internal" : ""}">
            <div class="comment-header">
              <span class="comment-avatar">${escapeHtml((cm.User?.name || "?").charAt(0).toUpperCase())}</span>
              <strong class="text-sm">${escapeHtml(cm.User?.name || "—")}</strong>
              ${cm.isInternal ? `<span class="badge badge-internal">internal</span>` : ""}
              ${cm.sentiment ? `<span class="badge badge-sentiment">${cm.sentiment}</span>` : ""}
              <span class="text-sm text-muted comment-time">${formatDate(cm.createdAt)}</span>
            </div>
            <div class="comment-body text-sm">${escapeHtml(cm.content)}</div>
          </div>`).join("")
      : `<div class="text-muted text-sm empty-comments">No comments yet — be the first to respond.</div>`;
  } catch (err) {
    toast(err.message, "error");
  }
}
