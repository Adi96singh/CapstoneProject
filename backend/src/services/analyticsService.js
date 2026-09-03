const { Op, fn, col } = require("sequelize");
const { sequelize, Complaint, Escalation } = require("../models");
const { cacheWrap, buildKey } = require("../utils/cache");

const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

function periodStart(period) {
  const days = PERIOD_DAYS[period] || 7;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function groupCount(field, since) {
  const rows = await Complaint.findAll({
    attributes: [field, [fn("COUNT", col("id")), "count"]],
    where: { createdAt: { [Op.gte]: since } },
    group: [field],
    raw: true,
  });
  return rows.reduce((acc, r) => {
    acc[r[field] || "uncategorized"] = parseInt(r.count, 10);
    return acc;
  }, {});
}

async function avgResolutionHours(since) {
  const rows = await Complaint.findAll({
    attributes: [
      [fn("AVG", fn("TIMESTAMPDIFF", sequelize.literal("HOUR"), col("created_at"), col("updated_at"))), "avgHours"],
    ],
    where: {
      status: { [Op.in]: ["RESOLVED", "CLOSED"] },
      createdAt: { [Op.gte]: since },
    },
    raw: true,
  });
  const val = rows[0]?.avgHours;
  return val ? Math.round(parseFloat(val) * 10) / 10 : null;
}

async function slaBreachRate(since) {
  const total = await Complaint.count({ where: { createdAt: { [Op.gte]: since } } });
  if (total === 0) return 0;
  const breached = await Escalation.count({ where: { triggeredAt: { [Op.gte]: since } } });
  return Math.round((breached / total) * 1000) / 10; // percentage, 1 decimal
}

async function trend(since) {
  const rows = await Complaint.findAll({
    attributes: [[fn("DATE", col("created_at")), "day"], [fn("COUNT", col("id")), "count"]],
    where: { createdAt: { [Op.gte]: since } },
    group: [fn("DATE", col("created_at"))],
    order: [[fn("DATE", col("created_at")), "ASC"]],
    raw: true,
  });
  return rows.map((r) => ({ day: r.day, count: parseInt(r.count, 10) }));
}

/** Admin dashboard aggregation, cached 5 minutes since it's a heavy aggregation query. */
async function getAnalytics(period = "7d") {
  const key = buildKey("analytics", period);
  const TTL = 300;

  return cacheWrap(key, TTL, async () => {
    const since = periodStart(period);
    const [byStatus, byPriority, byCategory, avgHours, breachRate, trendData, total] = await Promise.all([
      groupCount("status", since),
      groupCount("priority", since),
      groupCount("categoryId", since),
      avgResolutionHours(since),
      slaBreachRate(since),
      trend(since),
      Complaint.count({ where: { createdAt: { [Op.gte]: since } } }),
    ]);

    return {
      period,
      total,
      byStatus,
      byPriority,
      byCategory,
      avgResolutionHours: avgHours,
      slaBreachRatePercent: breachRate,
      trend: trendData,
    };
  });
}

module.exports = { getAnalytics };
