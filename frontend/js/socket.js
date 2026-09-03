// Thin Socket.IO client wrapper. Loaded via CDN script tag on pages that
// need real-time updates (dashboards, complaint detail).
let socket = null;
let socketAttempted = false;

function connectSocket(handlers = {}) {
  if (!window.io || !Session.isLoggedIn()) return null;

  // Reuse the existing connection instead of opening a duplicate socket.
  if (socket) {
    Object.entries(handlers).forEach(([event, handler]) => socket.off(event).on(event, handler));
    return socket;
  }

  socketAttempted = true;
  const base = API_BASE.replace(/\/api$/, "");
  socket = io(base, {
    auth: { token: Session.getToken() },
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    document.dispatchEvent(new CustomEvent("socket:connected"));
  });
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
      // Explicitly disconnected by the server; let it try to re-authenticate.
      socket.connect();
    }
    document.dispatchEvent(new CustomEvent("socket:disconnected", { detail: { reason } }));
  });
  socket.on("connect_error", (err) => {
    console.warn("[socket] connection error:", err.message);
    document.dispatchEvent(new CustomEvent("socket:error", { detail: { message: err.message } }));
    // If the token was rejected, don't hammer the server — drop the socket.
    if (err.message && err.message.includes("jwt") || err.message && err.message.includes("auth")) {
      socket.disconnect();
      socket = null;
      socketAttempted = false;
    }
  });

  Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));

  return socket;
}
