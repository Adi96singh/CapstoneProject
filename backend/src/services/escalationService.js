const { Op } = require("sequelize");
const { Complaint } = require("../models");
const { escalationQueue } = require("../jobs/queues");
const logger = require("../config/logger");

const NON_TERMINAL_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "REOPENED",
];

/**
 * Scans for complaints past their SLA deadline that are still in a
 * non-terminal, non-escalated state, and enqueues one escalation job per
 * breach. Run on a cron schedule (every 15 min) rather than inline so a
 * slow scan never affects request latency.
 */
async function checkSlaBreaches() {
  const breached = await Complaint.findAll({
    where: {
      status: { [Op.in]: NON_TERMINAL_STATUSES },
      slaDeadline: { [Op.lt]: new Date() },
    },
  });

  for (const complaint of breached) {
    await escalationQueue.add("escalate-complaint", { complaintId: complaint.id });
  }

  logger.info(`[escalationService] SLA scan found ${breached.length} breach(es)`);
  return breached.length;
}

const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function nextPriority(priority) {
  const idx = PRIORITY_ORDER.indexOf(priority);
  if (idx === -1 || idx === PRIORITY_ORDER.length - 1) return priority;
  return PRIORITY_ORDER[idx + 1];
}

module.exports = { checkSlaBreaches, nextPriority, NON_TERMINAL_STATUSES };
