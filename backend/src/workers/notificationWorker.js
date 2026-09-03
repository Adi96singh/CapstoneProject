const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const { Notification } = require("../models");
const { emitToUser } = require("../sockets");
const logger = require("../config/logger");

const worker = new Worker(
  "notificationQueue",
  async (job) => {
    const { notificationId } = job.data;
    const notification = await Notification.findByPk(notificationId);
    if (!notification) return { skipped: true };

    emitToUser(notification.userId, "notification:new", {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      complaintId: notification.complaintId,
      createdAt: notification.createdAt,
    });

    return { delivered: true };
  },
  { connection: redisClient }
);

worker.on("completed", (job) => logger.info(`[notificationWorker] job ${job.id} completed`));
worker.on("failed", (job, err) => logger.error(`[notificationWorker] job ${job?.id} failed: ${err.message}`));

module.exports = worker;
