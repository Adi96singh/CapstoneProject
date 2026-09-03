const { AuditLog, User } = require("../models");

async function list(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const where = {};
  if (query.entityType) where.entityType = query.entityType;
  if (query.action) where.action = query.action;
  if (query.userId) where.userId = query.userId;

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, attributes: ["id", "name", "email"] }],
    order: [["createdAt", "DESC"]],
    limit,
    offset: (page - 1) * limit,
  });

  return { logs: rows, pagination: { page, limit, total: count } };
}

module.exports = { list };
