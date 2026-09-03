const notificationService = require("../services/notificationService");
const { success } = require("../utils/response");

async function list(req, res) {
  const { notifications, pagination } = await notificationService.listForUser(req.user.id, req.query);
  return success(res, 200, { notifications }, pagination);
}

async function markRead(req, res) {
  const notification = await notificationService.markRead(req.user.id, req.params.id);
  return success(res, 200, { notification });
}

async function markAllRead(req, res) {
  await notificationService.markAllRead(req.user.id);
  return success(res, 200, { message: "All notifications marked read" });
}

module.exports = { list, markRead, markAllRead };
