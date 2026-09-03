const jwt = require("jsonwebtoken");
const { ApiError } = require("../utils/response");
const { User } = require("../models");
const { JWT_SECRET } = require("../utils/token");

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, "Authentication token missing");
  }

  const payload = jwt.verify(token, JWT_SECRET);
  const user = await User.findByPk(payload.userId, {
    attributes: { exclude: ["passwordHash"] },
  });

  if (!user || !user.isActive) {
    throw new ApiError(401, "User not found or inactive");
  }

  req.user = user;
  next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }
    next();
  };
}

function isSelf(paramName = "userId") {
  return (req, res, next) => {
    if (req.user.role === "admin") return next();
    if (String(req.user.id) !== String(req.params[paramName])) {
      throw new ApiError(403, "You can only access your own resource");
    }
    next();
  };
}

module.exports = { authenticate, authorize, isSelf };
