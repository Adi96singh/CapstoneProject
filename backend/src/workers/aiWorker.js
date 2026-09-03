const { Worker } = require("bullmq");
const redisClient = require("../config/redis");
const aiService = require("../services/aiService");
const logger = require("../config/logger");

const worker = new Worker(
  "aiQueue",
  async (job) => {
    switch (job.name) {
      case "classify-complaint":
        await aiService.performClassification(job.data.complaintId);
        break;
      case "detect-duplicates":
        await aiService.performDuplicateDetection(job.data.complaintId);
        break;
      case "analyze-sentiment":
        await aiService.performSentimentAnalysis(job.data.commentId);
        break;
      default:
        logger.warn(`[aiWorker] unknown job name: ${job.name}`);
    }
  },
  { connection: redisClient }
);

worker.on("completed", (job) => logger.info(`[aiWorker] ${job.name} (${job.id}) completed`));
worker.on("failed", (job, err) => logger.error(`[aiWorker] ${job?.name} (${job?.id}) failed: ${err.message}`));

module.exports = worker;
