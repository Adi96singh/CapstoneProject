const bcrypt = require("bcryptjs");
const { User, PasswordResetToken } = require("../models");
const { ApiError } = require("../utils/response");
const { signToken, generateResetToken, hashToken } = require("../utils/token");

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 30;

async function register({ name, email, password, role }) {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: role === "staff" ? "staff" : "user", // admin accounts are never self-registered
  });

  const token = signToken(user);
  return { user, token };
}

async function login({ email, password }) {
  const user = await User.scope("withPassword").findOne({ where: { email } });
  if (!user) throw new ApiError(401, "Invalid email or password");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, "Invalid email or password");

  if (!user.isActive) throw new ApiError(403, "This account has been deactivated");

  const token = signToken(user);
  user.passwordHash = undefined;
  return { user, token };
}

async function forgotPassword({ email }) {
  const user = await User.findOne({ where: { email } });
  // Always respond the same way to avoid leaking which emails are registered
  if (!user) return null;

  const { rawToken, tokenHash } = generateResetToken();
  await PasswordResetToken.create({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  });

  return { user, rawToken };
}

async function resetPassword({ token, newPassword }) {
  const tokenHash = hashToken(token);
  const record = await PasswordResetToken.findOne({
    where: { tokenHash },
    order: [["createdAt", "DESC"]],
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiError(400, "Reset link is invalid or has expired");
  }

  const user = await User.findByPk(record.userId);
  if (!user) throw new ApiError(400, "Reset link is invalid or has expired");

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  record.usedAt = new Date();
  await record.save();

  return user;
}

module.exports = { register, login, forgotPassword, resetPassword };
