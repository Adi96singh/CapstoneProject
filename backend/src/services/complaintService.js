const { Op } = require("sequelize");
const {
  sequelize,
  Complaint,
  ComplaintStatusHistory,
  User,
  Category,
} = require("../models");
const { ApiError } = require("../utils/response");
const { findExistingByIdempotencyKey } = require("../utils/idempotency");
const slaService = require("./slaService");
const assignmentService = require("./assignmentService");
const aiService = require("./aiService");
const notificationService = require("./notificationService");
const userService = require("./userService");
const { emailQueue } = require("../jobs/queues");
const { emitToUser } = require("../sockets");

// Which roles may drive which transitions. Admin can always do anything
// staff/user can do (checked separately), plus REJECTED and direct resolutions.
const ROLE_TRANSITIONS = {
  user: [
    ["RESOLVED", "CLOSED"], // confirm resolution
    ["RESOLVED", "REOPENED"], // not actually fixed
  ],
  staff: [
    ["OPEN", "ASSIGNED"],
    ["OPEN", "IN_PROGRESS"],
    ["ASSIGNED", "IN_PROGRESS"],
    ["ASSIGNED", "RESOLVED"],
    ["IN_PROGRESS", "WAITING_FOR_USER"],
    ["IN_PROGRESS", "RESOLVED"],
    ["WAITING_FOR_USER", "IN_PROGRESS"],
    ["WAITING_FOR_USER", "RESOLVED"],
    ["REOPENED", "IN_PROGRESS"],
    ["REOPENED", "RESOLVED"],
  ],
  admin: [
    ["OPEN", "ASSIGNED"],
    ["OPEN", "IN_PROGRESS"],
    ["OPEN", "REJECTED"],
    ["OPEN", "ESCALATED"],
    ["ASSIGNED", "IN_PROGRESS"],
    ["ASSIGNED", "RESOLVED"],
    ["ASSIGNED", "ESCALATED"],
    ["ASSIGNED", "REJECTED"],
    ["IN_PROGRESS", "WAITING_FOR_USER"],
    ["IN_PROGRESS", "RESOLVED"],
    ["IN_PROGRESS", "ESCALATED"],
    ["IN_PROGRESS", "REJECTED"],
    ["WAITING_FOR_USER", "IN_PROGRESS"],
    ["WAITING_FOR_USER", "RESOLVED"],
    ["WAITING_FOR_USER", "REJECTED"],
    ["RESOLVED", "CLOSED"],
    ["RESOLVED", "REOPENED"],
    ["REOPENED", "IN_PROGRESS"],
    ["REOPENED", "ASSIGNED"],
    ["REOPENED", "RESOLVED"],
    ["ESCALATED", "ASSIGNED"],
    ["ESCALATED", "IN_PROGRESS"],
    ["ESCALATED", "RESOLVED"],
    ["ESCALATED", "REJECTED"],
    ["REJECTED", "REOPENED"],
    ["CLOSED", "REOPENED"],
  ],
};

const DEFAULT_INCLUDE = [
  { model: User, as: "author", attributes: ["id", "name", "email"] },
  { model: User, as: "staff", attributes: ["id", "name", "email"] },
  { model: Category, attributes: ["id", "name"] },
];

function assertCanView(user, complaint) {
  if (user.role === "admin") return;
  if (user.role === "staff" && complaint.staffId === user.id) return;
  if (user.role === "user" && complaint.userId === user.id) return;
  throw new ApiError(403, "You do not have access to this complaint");
}

async function createComplaint(user, payload) {
  const { title, description, categoryId, priority, locationText, idempotencyKey } = payload;

  const existing = await findExistingByIdempotencyKey(user.id, idempotencyKey);
  if (existing) return existing; // safe replay, no duplicate created

  // Fall back to "Other" category if not provided
  let finalCategoryId = categoryId;
  if (!finalCategoryId) {
    const otherCat = await Category.findOne({ where: { name: "Other" } });
    if (otherCat) finalCategoryId = otherCat.id;
  }

  const finalPriority = priority || "MEDIUM";

  const complaint = await sequelize.transaction(async (t) => {
    const { slaDeadline } = await slaService.calculateSlaDeadline(
      finalCategoryId || null,
      finalPriority,
      { transaction: t }
    );

    const created = await Complaint.create(
      {
        title,
        description,
        categoryId: finalCategoryId || null,
        priority: finalPriority,
        locationText: locationText || null,
        userId: user.id,
        idempotencyKey: idempotencyKey || null,
        status: "OPEN",
        slaDeadline,
      },
      { transaction: t }
    );

    await ComplaintStatusHistory.create(
      {
        complaintId: created.id,
        fromStatus: null,
        toStatus: "OPEN",
        changedById: user.id,
        reason: "Complaint filed",
      },
      { transaction: t }
    );

    return created;
  });

  // Attempt immediate automatic assignment to the best available staff member
  try {
    const pickedStaff = await assignmentService.pickBestStaff(complaint);
    if (pickedStaff) {
      await assignmentService.assignComplaint({
        complaint,
        staffId: pickedStaff.id,
        assignedById: null,
        note: "Auto-assigned by category & workload",
      });
      complaint.status = "ASSIGNED";
      await complaint.save();

      await ComplaintStatusHistory.create({
        complaintId: complaint.id,
        fromStatus: "OPEN",
        toStatus: "ASSIGNED",
        changedById: user.id,
        reason: "Auto-assigned to staff",
      });

      notifyStatusChange(complaint, "OPEN", "ASSIGNED", user).catch(() => {});
    }
  } catch (err) {
    // If no active staff is available, complaint remains OPEN for admin triage
  }

  // AI classification (which chains into duplicate detection) is queued so
  // a slow/unavailable Gemini call never blocks this response.
  await aiService.queueClassification(complaint.id);

  return getComplaintById(user, complaint.id);
}

async function listComplaints(user, query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const where = {};

  if (user.role === "user") {
    where.userId = user.id;
  } else if (user.role === "staff") {
    where.staffId = user.id;
  }
  // admin: no scoping by default, but can filter explicitly below

  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (user.role === "admin") {
    if (query.userId) where.userId = query.userId;
    if (query.staffId) where.staffId = query.staffId;
  }
  if (query.search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${query.search}%` } },
      { refNo: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await Complaint.findAndCountAll({
    where,
    include: DEFAULT_INCLUDE,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return {
    complaints: rows,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
}

async function getComplaintById(user, id) {
  const complaint = await Complaint.findByPk(id, {
    include: [
      ...DEFAULT_INCLUDE,
      { association: "images" },
      { association: "comments" },
      { association: "statusHistory", order: [["createdAt", "ASC"]] },
      { association: "assignments" },
    ],
  });

  if (!complaint) throw new ApiError(404, "Complaint not found");
  assertCanView(user, complaint);
  return complaint;
}

async function updateComplaint(user, id, updates) {
  const complaint = await Complaint.findByPk(id);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  const isOwner = complaint.userId === user.id;
  if (!isOwner && user.role !== "admin") {
    throw new ApiError(403, "Only the complaint author or an admin can edit it");
  }

  if (complaint.status !== "OPEN" && user.role !== "admin") {
    throw new ApiError(409, "Complaint can only be edited while it is still OPEN");
  }

  const allowed = ["title", "description", "categoryId", "priority", "locationText"];
  let slaShouldRecalculate = false;
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if ((key === "categoryId" || key === "priority") && updates[key] !== complaint[key]) {
        slaShouldRecalculate = true;
      }
      complaint[key] = updates[key];
    }
  }

  if (slaShouldRecalculate) {
    const { slaDeadline } = await slaService.calculateSlaDeadline(
      complaint.categoryId,
      complaint.priority
    );
    complaint.slaDeadline = slaDeadline;
  }

  await complaint.save();
  return getComplaintById(user, id);
}

/**
 * Transitions a complaint's status, enforcing both the state machine and
 * the per-role permission table. When transitioning into ASSIGNED, also
 * handles staff assignment: staff self-assign, admins may pass an explicit
 * `staffId` or omit it to trigger the auto-assignment scoring algorithm.
 */
async function transitionStatus(user, id, toStatus, reason, staffId) {
  const complaint = await Complaint.findByPk(id);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  assertCanView(user, complaint);

  const fromStatus = complaint.status;

  if (!Complaint.canTransition(fromStatus, toStatus)) {
    throw new ApiError(
      400,
      `Cannot transition complaint from ${fromStatus} to ${toStatus}`
    );
  }

  const allowedPairs = ROLE_TRANSITIONS[user.role] || [];
  const isPermitted = allowedPairs.some(([from, to]) => from === fromStatus && to === toStatus);
  if (!isPermitted) {
    throw new ApiError(403, `Your role (${user.role}) cannot perform this transition`);
  }

  await sequelize.transaction(async (t) => {
    if (toStatus === "ASSIGNED") {
      let targetStaffId = staffId;

      if (user.role === "staff") {
        // Staff can only assign complaints to themselves
        targetStaffId = user.id;
      } else if (!targetStaffId) {
        // Admin didn't specify a staffId — auto-pick via the scoring algorithm
        const picked = await assignmentService.pickBestStaff(complaint, { transaction: t });
        targetStaffId = picked.id;
      }

      await assignmentService.assignComplaint({
        complaint,
        staffId: targetStaffId,
        assignedById: user.id,
        note: reason,
        transaction: t,
      });
    }

    complaint.status = toStatus;
    await complaint.save({ transaction: t });

    await ComplaintStatusHistory.create(
      {
        complaintId: complaint.id,
        fromStatus,
        toStatus,
        changedById: user.id,
        reason: reason || null,
      },
      { transaction: t }
    );
  });

  await notifyStatusChange(complaint, fromStatus, toStatus, user);
  if (toStatus === "ASSIGNED") {
    await userService.invalidateWorkloadCache();
  }

  return getComplaintById(user, id);
}

/** Real-time + notification + email fan-out after a successful transition. */
async function notifyStatusChange(complaint, fromStatus, toStatus, actor) {
  emitToUser(complaint.userId, "complaint:status_changed", {
    complaintId: complaint.id,
    fromStatus,
    toStatus,
  });
  if (complaint.staffId) {
    emitToUser(complaint.staffId, "complaint:status_changed", {
      complaintId: complaint.id,
      fromStatus,
      toStatus,
    });
  }

  if (toStatus === "ASSIGNED" && complaint.staffId) {
    emitToUser(complaint.staffId, "complaint:assigned", { complaintId: complaint.id });
    await notificationService.notify({
      userId: complaint.staffId,
      complaintId: complaint.id,
      title: "New complaint assigned to you",
      message: `Complaint ${complaint.refNo} — "${complaint.title}" was assigned to you.`,
      type: "ASSIGNMENT",
    });

    const staff = await User.findByPk(complaint.staffId);
    if (staff) {
      await emailQueue.add("complaint-assigned", {
        to: staff.email,
        subject: `Complaint ${complaint.refNo} assigned to you`,
        template: "complaint-assigned",
        data: {
          staffName: staff.name,
          refNo: complaint.refNo,
          title: complaint.title,
          complaintUrl: `${process.env.CLIENT_URL}/complaints/detail.html?id=${complaint.id}`,
        },
      });
    }
    return;
  }

  // Otherwise: notify the complaint author their status changed (skip when the
  // author themself triggered it, e.g. closing/reopening their own complaint)
  if (actor.id !== complaint.userId) {
    await notificationService.notify({
      userId: complaint.userId,
      complaintId: complaint.id,
      title: "Complaint status updated",
      message: `Complaint ${complaint.refNo} is now ${toStatus}.`,
      type: "STATUS_CHANGE",
    });

    const author = await User.findByPk(complaint.userId);
    if (author) {
      await emailQueue.add("status-changed", {
        to: author.email,
        subject: `Complaint ${complaint.refNo} — status updated`,
        template: "status-changed",
        data: {
          userName: author.name,
          refNo: complaint.refNo,
          title: complaint.title,
          toStatus,
          complaintUrl: `${process.env.CLIENT_URL}/complaints/detail.html?id=${complaint.id}`,
        },
      });
    }
  }
}

/**
 * Allows an Admin to explicitly assign or reassign any complaint to an active staff member.
 */
async function assignStaff(adminUser, complaintId, { staffId, note }) {
  if (adminUser.role !== "admin") {
    throw new ApiError(403, "Only administrators can manually assign complaints");
  }

  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  const targetStaff = await User.findByPk(staffId);
  if (!targetStaff || targetStaff.role !== "staff" || !targetStaff.isActive) {
    throw new ApiError(400, "Target user must be an active staff member");
  }

  const fromStatus = complaint.status;
  const toStatus = fromStatus === "OPEN" ? "ASSIGNED" : fromStatus;

  await sequelize.transaction(async (t) => {
    await assignmentService.assignComplaint({
      complaint,
      staffId: targetStaff.id,
      assignedById: adminUser.id,
      note: note || `Assigned to ${targetStaff.name} by Admin`,
      transaction: t,
    });

    if (complaint.status === "OPEN") {
      complaint.status = "ASSIGNED";
      await complaint.save({ transaction: t });

      await ComplaintStatusHistory.create(
        {
          complaintId: complaint.id,
          fromStatus: "OPEN",
          toStatus: "ASSIGNED",
          changedById: adminUser.id,
          reason: note || `Assigned to ${targetStaff.name} by Admin`,
        },
        { transaction: t }
      );
    }
  });

  await notifyStatusChange(complaint, fromStatus, toStatus, adminUser);
  await userService.invalidateWorkloadCache();

  return getComplaintById(adminUser, complaintId);
}

module.exports = {
  createComplaint,
  listComplaints,
  getComplaintById,
  updateComplaint,
  transitionStatus,
  assignStaff,
  ROLE_TRANSITIONS,
};
