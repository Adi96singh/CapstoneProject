// Fetch API wrapper: attaches JWT, normalizes errors, exposes toast helper.
const isLocalFrontend = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const API_BASE = window.SOLVEIT_API_BASE || (
  window.location.protocol === "file:" || (isLocalFrontend && window.location.port !== "5000")
    ? "http://localhost:5000/api"
    : `${window.location.origin}/api`
);

const Session = {
  getToken: () => localStorage.getItem("solveit_token"),
  setToken: (token) => localStorage.setItem("solveit_token", token),
  clearToken: () => localStorage.removeItem("solveit_token"),
  getUser: () => JSON.parse(localStorage.getItem("solveit_user") || "null"),
  setUser: (user) => localStorage.setItem("solveit_user", JSON.stringify(user)),
  isLoggedIn: () => Boolean(Session.getToken()),
};

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = Session.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    // Network-level failure (server down, no internet, CORS/firewall).
    const err = new Error("Unable to reach the server. Check your connection and try again.");
    err.status = 0;
    err.cause = e;
    throw err;
  }

  let body;
  let rawText = "";
  try {
    rawText = await res.text();
    body = JSON.parse(rawText);
  } catch {
    body = rawText && rawText.trim().length > 0 ? { message: rawText.trim() } : null;
  }

  if (!res.ok) {
    let message = body?.message;
    if (!message) {
      if (res.status === 429) {
        message = "Too many requests. Please wait a few moments and try again.";
      } else {
        message = `Request failed (${res.status})`;
      }
    }
    const err = new Error(message);
    err.status = res.status;
    err.details = body?.details;
    // An expired/revoked token: clear state so the next page load redirects cleanly.
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      Session.clearToken();
      try { localStorage.removeItem("solveit_user"); } catch (_) {}
    }
    throw err;
  }

  return body;
}

const api = {
  get: (path) => apiFetch(path, { method: "GET" }),
  post: (path, data) =>
    apiFetch(path, { method: "POST", body: data instanceof FormData ? data : JSON.stringify(data || {}) }),
  patch: (path, data) => apiFetch(path, { method: "PATCH", body: JSON.stringify(data || {}) }),
  del: (path) => apiFetch(path, { method: "DELETE" }),
  upload: (path, formData) => apiFetch(path, { method: "POST", body: formData }),
};

// ---- Toasts ----
function ensureToastRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  return root;
}

function toast(message, type = "info") {
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function requireAuth(allowedRoles) {
  if (!Session.isLoggedIn()) {
    window.location.href = "/login.html";
    return null;
  }
  const user = Session.getUser();
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    toast("You don't have access to that page", "error");
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}
