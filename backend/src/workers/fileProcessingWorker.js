const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const { recordAudit } = require("../utils/audit");
const logger = require("../config/logger");

// Post-upload processing hook: currently just audits the upload. This is the
// seam where thumbnailing, virus scanning, or an AI image-relevance check
// could be added later without touching the request path.
const worker = new Worker(
  "fileProcessingQueue",
  async (job) => {
    const { complaintId, imageId, uploadedById } = job.data;
    await recordAudit({
      user: { id: uploadedById },
      action: "COMPLAINT_IMAGE_UPLOADED",
      entityType: "ComplaintImage",
      entityId: imageId,
      newValue: { complaintId },
    });
    return { processed: true };
  },
  { connection: redisClient }
);

worker.on("completed", (job) => logger.info(`[fileProcessingWorker] job ${job.id} completed`));
worker.on("failed", (job, err) => logger.error(`[fileProcessingWorker] job ${job?.id} failed: ${err.message}`));

module.exports = worker;
