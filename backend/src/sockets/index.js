const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const logger = require("../config/logger");
const { JWT_SECRET } = require("../utils/token");

let io = null;

function initSockets(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      credentials: true,
    },
  });

  // Auth: JWT passed as the Socket.IO handshake auth token (not a header)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication token missing"));

      const payload = jwt.verify(token, JWT_SECRET);
      const user = await User.findByPk(payload.userId);
      if (!user || !user.isActive) return next(new Error("User not found or inactive"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const { user } = socket;
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    logger.info(`[socket] connected: ${user.id} (${user.role})`);

    socket.on("disconnect", () => {
      logger.info(`[socket] disconnected: ${user.id}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

/** Emits to a single user's room. Safe no-op if sockets aren't initialized (e.g. in workers/tests). */
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/** Emits to every connected socket with the given role (e.g. broadcast to all admins). */
function emitToRole(role, event, payload) {
  if (!io) return;
  io.to(`role:${role}`).emit(event, payload);
}

module.exports = { initSockets, getIO, emitToUser, emitToRole };
