const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const { sequelize, Complaint, ComplaintStatusHistory, Escalation, User } = require("../models");
const { emailQueue } = require("../jobs/queues");
const { emitToUser } = require("../sockets");
const notificationService = require("../services/notificationService");
const { nextPriority } = require("../services/escalationService");
const logger = require("../config/logger");

const worker = new Worker(
  "escalationQueue",
  async (job) => {
    const { complaintId } = job.data;

    const complaint = await Complaint.findByPk(complaintId);
    if (!complaint) return { skipped: true };
    if (!Complaint.canTransition(complaint.status, "ESCALATED")) return { skipped: true };

    const fromStatus = complaint.status;
    const fromPriority = complaint.priority;
    const toPriority = nextPriority(complaint.priority);

    await sequelize.transaction(async (t) => {
      complaint.status = "ESCALATED";
      complaint.priority = toPriority;
      await complaint.save({ transaction: t });

      await ComplaintStatusHistory.create(
        {
          complaintId: complaint.id,
          fromStatus,
          toStatus: "ESCALATED",
          changedById: null,
          reason: "SLA deadline breached — auto-escalated",
        },
        { transaction: t }
      );

      await Escalation.create(
        {
          complaintId: complaint.id,
          reason: "SLA deadline breached",
          fromPriority,
          toPriority,
        },
        { transaction: t }
      );
    });

    emitToUser(complaint.userId, "complaint:escalated", { complaintId: complaint.id, toPriority });
    if (complaint.staffId) {
      emitToUser(complaint.staffId, "complaint:escalated", { complaintId: complaint.id, toPriority });
    }

    await notificationService.notify({
      userId: complaint.userId,
      complaintId: complaint.id,
      title: "Complaint escalated",
      message: `Your complaint ${complaint.refNo} breached its SLA and has been escalated.`,
      type: "ESCALATION",
    });

    const admins = await User.findAll({ where: { role: "admin", isActive: true } });
    for (const admin of admins) {
      await notificationService.notify({
        userId: admin.id,
        complaintId: complaint.id,
        title: "Complaint escalated (SLA breach)",
        message: `Complaint ${complaint.refNo} breached its SLA and was auto-escalated.`,
        type: "ESCALATION",
      });
    }

    const author = await User.findByPk(complaint.userId);
    if (author) {
      await emailQueue.add("complaint-escalated", {
        to: author.email,
        subject: `Complaint ${complaint.refNo} has been escalated`,
        template: "complaint-escalated",
        data: {
          refNo: complaint.refNo,
          title: complaint.title,
          fromPriority,
          toPriority,
          complaintUrl: `${process.env.CLIENT_URL}/complaints/detail.html?id=${complaint.id}`,
        },
      });
    }

    return { escalated: true };
  },
  { connection: redisClient }
);

worker.on("completed", (job) => logger.info(`[escalationWorker] job ${job.id} completed`));
worker.on("failed", (job, err) => logger.error(`[escalationWorker] job ${job?.id} failed: ${err.message}`));

module.exports = worker;
