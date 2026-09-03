const authService = require("../services/authService");
const { success } = require("../utils/response");
// Queued so a slow SMTP provider never blocks the HTTP response
const { emailQueue } = require("../jobs/queues");

async function register(req, res) {
  const { name, email, password, role } = req.body;
  const { user, token } = await authService.register({ name, email, password, role });
  return success(res, 201, { user, token });
}

async function login(req, res) {
  const { email, password } = req.body;
  const { user, token } = await authService.login({ email, password });
  return success(res, 200, { user, token });
}

async function logout(req, res) {
  // Stateless JWT: client discards the token. Optional Redis blacklist can be
  // added here later (store jti until expiry) if immediate revocation is needed.
  return success(res, 200, { message: "Logged out" });
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  const result = await authService.forgotPassword({ email });

  if (result) {
    const { user, rawToken } = result;
    const resetUrl = `${process.env.CLIENT_URL}/reset-password.html?token=${rawToken}`;
    await emailQueue.add("password-reset", {
      to: user.email,
      subject: "Reset your SolveIt password",
      template: "password-reset",
      data: { name: user.name, resetUrl },
    });
  }

  // Same response whether or not the email exists
  return success(res, 200, {
    message: "If that email is registered, a reset link has been sent.",
  });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  await authService.resetPassword({ token, newPassword });
  return success(res, 200, { message: "Password has been reset. You can now log in." });
}

async function me(req, res) {
  return success(res, 200, { user: req.user });
}

module.exports = { register, login, logout, forgotPassword, resetPassword, me };
