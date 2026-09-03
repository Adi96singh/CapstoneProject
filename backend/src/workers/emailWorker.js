const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const transporter = require("../config/mailer");
const { render } = require("../templates");
const logger = require("../config/logger");

const worker = new Worker(
  "emailQueue",
  async (job) => {
    const { to, subject, template, data } = job.data;
    const html = render(template, data);

    if (!process.env.SMTP_USER) {
      // No SMTP configured (e.g. local demo) — log instead of failing the job.
      logger.info(`[emailWorker] SMTP not configured, skipping send. Would email ${to}: ${subject}`);
      return { skipped: true };
    }

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "SolveIt <no-reply@solveit.app>",
      to,
      subject,
      html,
    });
    return { sent: true };
  },
  { connection: redisClient }
);

worker.on("completed", (job) => logger.info(`[emailWorker] job ${job.id} completed`));
worker.on("failed", (job, err) => logger.error(`[emailWorker] job ${job?.id} failed: ${err.message}`));

module.exports = worker;
