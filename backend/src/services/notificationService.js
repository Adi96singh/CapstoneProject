const { Notification } = require("../models");
const { ApiError } = require("../utils/response");
const { notificationQueue } = require("../jobs/queues");

/**
 * Creates an in-app notification row and queues delivery (socket emit +
 * optional email) via the notification worker. Never called inline with the
 * socket emit directly — always goes through the queue so a slow DB write
 * never blocks the HTTP response that triggered it.
 */
async function notify({ userId, complaintId, title, message, type }) {
  const notification = await Notification.create({
    userId,
    complaintId: complaintId || null,
    title,
    message,
    type: type || "GENERAL",
  });

  await notificationQueue.add("deliver-notification", {
    notificationId: notification.id,
  });

  return notification;
}

async function listForUser(userId, query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const where = { userId };
  if (query.unreadOnly === "true") where.isRead = false;

  const { rows, count } = await Notification.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset: (page - 1) * limit,
  });

  return { notifications: rows, pagination: { page, limit, total: count } };
}

async function markRead(userId, id) {
  const notification = await Notification.findOne({ where: { id, userId } });
  if (!notification) throw new ApiError(404, "Notification not found");
  notification.isRead = true;
  await notification.save();
  return notification;
}

async function markAllRead(userId) {
  await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
}

module.exports = { notify, listForUser, markRead, markAllRead };
