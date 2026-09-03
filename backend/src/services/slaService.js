const { SlaRule } = require("../models");

// Fallback hours used when no SlaRule row matches (keeps the system usable
// before an admin has configured SLA rules for every category/priority pair).
const DEFAULT_HOURS = {
  LOW: { responseHours: 48, resolutionHours: 168 },
  MEDIUM: { responseHours: 24, resolutionHours: 72 },
  HIGH: { responseHours: 8, resolutionHours: 24 },
  CRITICAL: { responseHours: 2, resolutionHours: 8 },
};

/**
 * Looks up the most specific SLA rule: category+priority first, then a
 * category-less "global" rule for that priority, else null (caller falls
 * back to DEFAULT_HOURS).
 */
async function resolveSlaRule(categoryId, priority, options = {}) {
  if (categoryId) {
    const specific = await SlaRule.findOne({
      where: { categoryId, priority },
      transaction: options.transaction,
    });
    if (specific) return specific;
  }
  return SlaRule.findOne({
    where: { categoryId: null, priority },
    transaction: options.transaction,
  });
}

/** Pure function: given a rule (or null) and priority, return the hours to use. */
function resolutionHoursFor(rule, priority) {
  if (rule) return rule.resolutionHours;
  return DEFAULT_HOURS[priority]?.resolutionHours ?? DEFAULT_HOURS.MEDIUM.resolutionHours;
}

function deadlineFromHours(hours, from = new Date()) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

async function calculateSlaDeadline(categoryId, priority, options = {}) {
  const rule = await resolveSlaRule(categoryId, priority, options);
  const resolutionHours = resolutionHoursFor(rule, priority);
  return {
    slaDeadline: deadlineFromHours(resolutionHours),
    resolutionHours,
    ruleId: rule ? rule.id : null,
  };
}

module.exports = {
  DEFAULT_HOURS,
  resolveSlaRule,
  resolutionHoursFor,
  deadlineFromHours,
  calculateSlaDeadline,
};
