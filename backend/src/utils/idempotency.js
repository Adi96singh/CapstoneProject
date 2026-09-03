const { Complaint } = require("../models");

/**
 * Looks up a complaint previously created with the same idempotency key by
 * the same user. Returns the existing complaint if found, otherwise null.
 * Used so retried "create complaint" requests (e.g. flaky mobile network)
 * never produce duplicates.
 */
async function findExistingByIdempotencyKey(userId, idempotencyKey) {
  if (!idempotencyKey) return null;
  return Complaint.findOne({ where: { userId, idempotencyKey } });
}

module.exports = { findExistingByIdempotencyKey };
