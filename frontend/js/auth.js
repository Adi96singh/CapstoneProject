// Shared logic for login/register/forgot/reset pages, plus the navbar renderer
// used across every authenticated page.
//
// NOTE: All event handlers are wired up via DOMContentLoaded (at the bottom of
// this file) rather than inline onsubmit/onclick attributes in the HTML so that
// the Helmet Content-Security-Policy (scriptSrc: "'self'") is satisfied.
// Inline event handlers are treated as inline scripts and are blocked by CSP.

function renderNavbar(activePage) {
  const el = document.getElementById("navbar");
  if (!el) return;
  const user = Session.getUser();
  const isLoggedIn = Boolean(Session.getToken()) && Boolean(user);

  if (!isLoggedIn) {
    el.innerHTML = `
      <div class="brand"><span class="brand-icon">⚡</span>SolveIt</div>
      <nav>
        <a href="/login.html">Log in</a>
        <a class="btn btn-primary btn-sm" href="/register.html">Sign up</a>
      </nav>`;
    return;
  }

  const dashboardHref =
    user.role === "admin" ? "/dashboard/admin.html" : user.role === "staff" ? "/dashboard/staff.html" : "/dashboard/user.html";

  const links = [{ href: dashboardHref, label: "Dashboard", key: "dashboard" }];
  links.push({ href: "/complaints/list.html", label: "Complaints", key: "complaints" });
  if (user.role === "admin") {
    links.push({ href: "/admin/analytics.html", label: "Admin Console", key: "admin" });
  }

  el.innerHTML = `
    <div class="brand"><span class="brand-icon">⚡</span>SolveIt</div>
    <nav>
      ${links.map((l) => `<a href="${l.href}" class="${activePage === l.key ? "active" : ""}">${l.label}</a>`).join("")}
      <a href="#" id="notif-bell" class="notif-bell-btn" title="Notifications">🔔 <span id="notif-count" class="notif-count"></span></a>
      <span class="user-chip"><span class="user-avatar">${escapeHtml(user.name.charAt(0).toUpperCase())}</span>${escapeHtml(user.name)}</span>
      <a href="#" id="logout-link" class="btn btn-ghost btn-sm">Log out</a>
    </nav>`;

  document.getElementById("logout-link").addEventListener("click", async (e) => {
    e.preventDefault();
    try { await api.post("/auth/logout"); } catch {}
    Session.clearToken();
    localStorage.removeItem("solveit_user");
    window.location.href = "/login.html";
  });

  if (typeof initNotifications === "function") initNotifications();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Logging in…`;
  try {
    const { data } = await api.post("/auth/login", { email, password });
    Session.setToken(data.token);
    Session.setUser(data.user);
    toast(`Welcome back, ${data.user.name}!`, "success");
    const dest = data.user.role === "admin" ? "/dashboard/admin.html" : data.user.role === "staff" ? "/dashboard/staff.html" : "/dashboard/user.html";
    window.location.href = dest;
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = `Log in`;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Creating account…`;
  try {
    const { data } = await api.post("/auth/register", { name, email, password, role });
    Session.setToken(data.token);
    Session.setUser(data.user);
    toast("Account created! Welcome to SolveIt 🎉", "success");
    // Redirect to the dashboard matching the registered role
    const dest = data.user.role === "admin"
      ? "/dashboard/admin.html"
      : data.user.role === "staff"
      ? "/dashboard/staff.html"
      : "/dashboard/user.html";
    window.location.href = dest;
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = `Create account`;
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Sending…`;
  try {
    const { data } = await api.post("/auth/forgot-password", { email });
    toast(data.message, "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Send reset link`;
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const token = qs("token");
  const newPassword = document.getElementById("newPassword").value;
  if (!token) return toast("Missing reset token — use the link from your email", "error");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Resetting…`;
  try {
    const { data } = await api.post("/auth/reset-password", { token, newPassword });
    toast(data.message, "success");
    setTimeout(() => (window.location.href = "/login.html"), 1200);
  } catch (err) {
    toast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = `Reset password`;
  }
}

// ---------------------------------------------------------------------------
// Password toggle helper — attached programmatically to avoid inline onclick
// ---------------------------------------------------------------------------
function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === "password") {
    inp.type = "text";
    btn.textContent = "🙈";
  } else {
    inp.type = "password";
    btn.textContent = "👁";
  }
}

// ---------------------------------------------------------------------------
// Password-strength meter (register page)
// ---------------------------------------------------------------------------
function checkStrength(val) {
  const fill = document.getElementById("strength-fill");
  const label = document.getElementById("strength-label");
  if (!fill || !label) return;
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { pct: "0%",   color: "transparent", text: "" },
    { pct: "25%",  color: "#ef4444",     text: "Weak" },
    { pct: "50%",  color: "#f59e0b",     text: "Fair" },
    { pct: "75%",  color: "#3b82f6",     text: "Good" },
    { pct: "100%", color: "#10b981",     text: "Strong" },
  ];
  const lvl = levels[score];
  fill.style.width = lvl.pct;
  fill.style.background = lvl.color;
  label.textContent = lvl.text;
  label.style.color = lvl.color;
}

// ---------------------------------------------------------------------------
// Auto-init: wire up all handlers once DOM is ready.
// Replaces every inline onsubmit / onclick / oninput attribute in the HTML so
// that the Helmet Content-Security-Policy (scriptSrc: "'self'") is satisfied.
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Render the navbar (safe to call even when no #navbar element exists)
  if (typeof renderNavbar === "function") renderNavbar();

  // --- Login page ---
  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  // --- Register page ---
  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
    // Strength meter
    const pwdInput = registerForm.querySelector("#password");
    if (pwdInput) pwdInput.addEventListener("input", (e) => checkStrength(e.target.value));
  }

  // --- Forgot-password page ---
  const forgotForm = document.getElementById("forgot-form");
  if (forgotForm) forgotForm.addEventListener("submit", handleForgotPassword);

  // --- Reset-password page ---
  const resetForm = document.getElementById("reset-form");
  if (resetForm) resetForm.addEventListener("submit", handleResetPassword);

  // Password-toggle buttons — works on every page that has .password-toggle
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrapper = btn.closest(".password-wrapper");
      if (!wrapper) return;
      const input = wrapper.querySelector("input");
      if (!input) return;
      togglePassword(input.id, btn);
    });
  });
});
