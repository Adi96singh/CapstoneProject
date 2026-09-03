const { Complaint, ComplaintComment, User } = require("../models");
const { ApiError } = require("../utils/response");
const notificationService = require("./notificationService");
const aiService = require("./aiService");
const { emitToUser } = require("../sockets");

async function addComment(user, complaintId, { content, isInternal }) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  const isOwner = complaint.userId === user.id;
  const isAssignedStaff = complaint.staffId === user.id;
  const isPrivileged = user.role === "admin" || isAssignedStaff;

  if (!isOwner && !isPrivileged) {
    throw new ApiError(403, "You do not have access to this complaint");
  }

  // Only staff/admin may post internal notes; users can never see them.
  const internal = Boolean(isInternal) && isPrivileged;

  const comment = await ComplaintComment.create({
    complaintId,
    userId: user.id,
    content,
    isInternal: internal,
  });

  await aiService.queueSentimentAnalysis(comment.id);

  // Real-time fan-out: notify the other party (author <-> staff), skip internal notes for the user
  const recipients = new Set();
  if (!internal) {
    if (complaint.userId !== user.id) recipients.add(complaint.userId);
  }
  if (complaint.staffId && complaint.staffId !== user.id) recipients.add(complaint.staffId);

  for (const recipientId of recipients) {
    emitToUser(recipientId, "complaint:comment_added", {
      complaintId,
      commentId: comment.id,
      authorId: user.id,
    });
    await notificationService.notify({
      userId: recipientId,
      complaintId,
      title: "New comment on your complaint",
      message: `${user.name} commented on ${complaint.refNo}`,
      type: "COMMENT",
    });
  }

  return ComplaintComment.findByPk(comment.id, {
    include: [{ model: User, attributes: ["id", "name", "role"] }],
  });
}

async function listComments(user, complaintId) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) throw new ApiError(404, "Complaint not found");

  const isOwner = complaint.userId === user.id;
  const isPrivileged = user.role === "admin" || complaint.staffId === user.id;
  if (!isOwner && !isPrivileged) throw new ApiError(403, "You do not have access to this complaint");

  const where = { complaintId };
  if (!isPrivileged) where.isInternal = false; // users never see internal notes

  return ComplaintComment.findAll({
    where,
    include: [{ model: User, attributes: ["id", "name", "role"] }],
    order: [["createdAt", "ASC"]],
  });
}

module.exports = { addComment, listComments };
