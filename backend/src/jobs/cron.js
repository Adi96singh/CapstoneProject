const cron = require("node-cron");
const escalationService = require("../services/escalationService");
const logger = require("../config/logger");

function startCronJobs() {
  // Every 15 minutes: scan for SLA breaches and enqueue escalations.
  cron.schedule("*/15 * * * *", async () => {
    try {
      await escalationService.checkSlaBreaches();
    } catch (err) {
      logger.error(`[cron] SLA breach scan failed: ${err.message}`);
    }
  });

  logger.info("[cron] SLA breach scan scheduled every 15 minutes");
}

module.exports = { startCronJobs };
