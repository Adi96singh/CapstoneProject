const { AuditLog } = require("../models");
const logger = require("../config/logger");

/**
 * Fire-and-forget audit trail write. Never throws into the caller's request
 * path — an audit log failure should not fail the underlying action.
 */
async function recordAudit({ user, action, entityType, entityId, oldValue, newValue, ip }) {
  try {
    await AuditLog.create({
      userId: user ? user.id : null,
      action,
      entityType,
      entityId: entityId || null,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      ip: ip || null,
    });
  } catch (err) {
    logger.warn(`[audit] failed to record ${action} on ${entityType}: ${err.message}`);
  }
}

module.exports = { recordAudit };
