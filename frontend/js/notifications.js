// Notification bell used in the shared navbar (see auth.js -> renderNavbar).
async function initNotifications() {
  const bell = document.getElementById("notif-bell");
  const countEl = document.getElementById("notif-count");
  if (!bell) return;

  async function refresh() {
    try {
      const { data } = await api.get("/notifications?unreadOnly=true&limit=50");
      const count = data.notifications.length;
      countEl.textContent = count > 0 ? count : "";
      countEl.style.display = count > 0 ? "flex" : "none";
    } catch {
      /* ignore — bell just won't show a count */
    }
  }

  bell.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle: close if already open
    const existing = document.getElementById("notif-panel");
    if (existing) { existing.remove(); return; }

    try {
      const { data } = await api.get("/notifications?limit=10");
      showNotificationPanel(data.notifications);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  function showNotificationPanel(notifications) {
    const panel = document.createElement("div");
    panel.id = "notif-panel";
    panel.className = "notif-panel card";

    // Position relative to the bell button. Only geometry is set inline —
    // everything visual lives in the stylesheet.
    const bellRect = bell.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.right = `${Math.max(8, window.innerWidth - bellRect.right)}px`;
    panel.style.top = `${bellRect.bottom + 8}px`;
    panel.style.width = "340px";
    panel.style.maxHeight = "420px";
    panel.style.overflowY = "auto";
    panel.style.zIndex = "200";

    panel.innerHTML = notifications.length
      ? `<div class="notif-panel-title">Notifications</div>` +
        notifications.map((n) =>
          `<div class="notif-item">
            <strong>${escapeHtml(n.title)}</strong>
            <div class="text-sm text-muted">${escapeHtml(n.message)}</div>
            <div class="text-xs text-faint notif-time">${formatDate(n.createdAt)}</div>
          </div>`
        ).join("")
      : `<div class="empty-state"><span class="empty-icon">🔔</span><p class="text-sm">No notifications yet</p></div>`;

    document.body.appendChild(panel);

    api.patch("/notifications/read-all").then(refresh).catch(() => {});

    // Close on click outside
    setTimeout(() => {
      function onClickAway(ev) {
        if (!panel.contains(ev.target) && ev.target !== bell) {
          panel.remove();
          document.removeEventListener("click", onClickAway);
        }
      }
      document.addEventListener("click", onClickAway);
    }, 0);
  }

  refresh();
  // Refresh notification count every 60s
  setInterval(refresh, 60000);

  connectSocket({
    "notification:new": refresh,
  });
}
