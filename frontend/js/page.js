// Page bootstrapper.
//
// Every page declares what it needs via <body data-page="..."> instead of an
// inline <script> block, and interactive elements declare behaviour with
// data-action attributes instead of inline onclick/onsubmit. That keeps the
// Content-Security-Policy strict (script-src 'self', no 'unsafe-inline')
// while preserving exactly the same behaviour.
//
// Loaded last on every page.

(function () {
  "use strict";

  // ---- Shared helpers previously defined inline on the auth pages ----------
  function togglePassword(id, btn) {
    const inp = document.getElementById(id);
    if (!inp) return;
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    btn.textContent = show ? "🙈" : "👁";
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  }

  const STRENGTH_LEVELS = [
    { pct: "0%", cls: "", text: "" },
    { pct: "25%", cls: "strength-weak", text: "Weak" },
    { pct: "50%", cls: "strength-fair", text: "Fair" },
    { pct: "75%", cls: "strength-good", text: "Good" },
    { pct: "100%", cls: "strength-strong", text: "Strong" },
  ];

  function checkStrength(val) {
    const fill = document.getElementById("strength-fill");
    const label = document.getElementById("strength-label");
    if (!fill || !label) return;
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const lvl = STRENGTH_LEVELS[score];
    fill.style.width = lvl.pct;
    fill.className = `strength-fill ${lvl.cls}`;
    label.textContent = lvl.text;
    label.className = `strength-label ${lvl.cls}`;
  }

  // ---- Delegated event handling (replaces inline on* attributes) -----------
  const CLICK_ACTIONS = {
    "toggle-password": (el) => togglePassword(el.dataset.target, el),
    back: () => window.history.back(),
  };

  const SUBMIT_ACTIONS = {
    login: (e) => handleLogin(e),
    register: (e) => handleRegister(e),
    "forgot-password": (e) => handleForgotPassword(e),
    "reset-password": (e) => handleResetPassword(e),
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const fn = CLICK_ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener("submit", (e) => {
    const action = e.target.dataset && e.target.dataset.action;
    const fn = action && SUBMIT_ACTIONS[action];
    if (fn) fn(e);
  });

  document.addEventListener("input", (e) => {
    if (e.target.dataset && e.target.dataset.strength !== undefined) {
      checkStrength(e.target.value);
    }
  });

  // ---- Per-page initializers ----------------------------------------------
  // Maps data-page to [navbarKey, initFnName]. The init function is looked up
  // lazily so a page only needs to load the scripts it actually uses.
  const PAGES = {
    home: [null, null],
    login: [null, null],
    register: [null, null],
    "forgot-password": [null, null],
    "reset-password": [null, null],
    "dashboard-user": ["dashboard", "initUserDashboard"],
    "dashboard-staff": ["dashboard", "initStaffDashboard"],
    "dashboard-admin": ["dashboard", "initAdminDashboard"],
    "complaints-list": ["complaints", "initComplaintList"],
    "complaints-create": [null, "initComplaintCreate"],
    "complaints-detail": [null, "initComplaintDetail"],
    "admin-analytics": ["admin", "initAdminAnalytics"],
    "admin-users": ["admin", "initAdminUsers"],
    "admin-staff": ["admin", "initAdminStaffWorkload"],
    "admin-categories": ["admin", "initAdminCategories"],
    "admin-departments": ["admin", "initAdminDepartments"],
    "admin-sla-rules": ["admin", "initAdminSlaRules"],
    "admin-escalations": ["admin", "initAdminEscalations"],
    "admin-audit-logs": ["admin", "initAdminAuditLogs"],
  };

  function boot() {
    const page = document.body.dataset.page;
    const entry = PAGES[page];

    // Highlight the current admin tab (was an inline querySelector call).
    const tab = document.querySelector(`.admin-tabs [data-tab="${page.replace("admin-", "")}"]`);
    if (tab) tab.classList.add("active");

    try {
      if (typeof renderNavbar === "function") renderNavbar(entry ? entry[0] : null);
    } catch (err) {
      console.error("[boot] navbar failed:", err);
    }

    if (!entry || !entry[1]) return;
    const init = window[entry[1]];
    if (typeof init !== "function") {
      console.error(`[boot] missing initializer ${entry[1]} for page ${page}`);
      return;
    }
    // Init functions are async; surface a failure instead of an unhandled
    // rejection so the user always gets feedback.
    Promise.resolve()
      .then(() => init())
      .catch((err) => {
        console.error(`[boot] ${entry[1]} failed:`, err);
        if (typeof toast === "function") toast(err.message || "Something went wrong loading this page", "error");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Surface unexpected runtime failures instead of failing silently.
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[unhandled]", e.reason);
  });
})();
