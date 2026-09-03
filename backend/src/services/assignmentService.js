const { sequelize, User, Category, Complaint, ComplaintAssignment } = require("../models");
const { ApiError } = require("../utils/response");

// Complaint statuses that count as "active work" against a staff member's plate
const ACTIVE_STATUSES = ["ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER"];

/** Pure function: sort candidates ascending by current workload (fewest active complaints first). */
function rankByWorkload(candidates, workloadMap) {
  return [...candidates].sort(
    (a, b) => (workloadMap.get(a.id) || 0) - (workloadMap.get(b.id) || 0)
  );
}

async function getWorkloadMap(staffIds, options = {}) {
  if (staffIds.length === 0) return new Map();

  const rows = await Complaint.findAll({
    attributes: ["staffId", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    where: { staffId: staffIds, status: ACTIVE_STATUSES },
    group: ["staffId"],
    raw: true,
    transaction: options.transaction,
  });

  return new Map(rows.map((r) => [r.staffId, parseInt(r.count, 10)]));
}

/**
 * Picks the best staff member for a complaint: prefers active staff in the
 * complaint's category's department, falls back to any active staff if the
 * department has none, then breaks ties by lowest current active workload.
 */
async function pickBestStaff(complaint, options = {}) {
  const category = complaint.categoryId
    ? await Category.findByPk(complaint.categoryId, { transaction: options.transaction })
    : null;
  const departmentId = category ? category.departmentId : null;

  let candidates = [];
  if (departmentId) {
    candidates = await User.findAll({
      where: { role: "staff", isActive: true, departmentId },
      transaction: options.transaction,
    });
  }

  if (candidates.length === 0) {
    candidates = await User.findAll({
      where: { role: "staff", isActive: true },
      transaction: options.transaction,
    });
  }

  if (candidates.length === 0) {
    throw new ApiError(409, "No active staff available to assign this complaint to");
  }

  const workloadMap = await getWorkloadMap(
    candidates.map((c) => c.id),
    options
  );
  const ranked = rankByWorkload(candidates, workloadMap);
  return ranked[0];
}

/**
 * Records the assignment (ComplaintAssignment row + complaint.staffId) for
 * either an auto-picked or explicitly chosen staff member. Validates the
 * target really is an active staff member.
 */
async function assignComplaint({ complaint, staffId, assignedById, note, transaction }) {
  const staff = await User.findByPk(staffId, { transaction });
  if (!staff || staff.role !== "staff" || !staff.isActive) {
    throw new ApiError(400, "Target user is not an active staff member");
  }

  await ComplaintAssignment.create(
    { complaintId: complaint.id, staffId, assignedById, note: note || null },
    { transaction }
  );

  complaint.staffId = staffId;
  await complaint.save({ transaction });

  return complaint;
}

module.exports = {
  ACTIVE_STATUSES,
  rankByWorkload,
  getWorkloadMap,
  pickBestStaff,
  assignComplaint,
};
