const { Op } = require("sequelize");
const gemini = require("../ai/geminiService");
const { Complaint, ComplaintComment, User, Category } = require("../models");
const { aiQueue } = require("../jobs/queues");
const categoryService = require("./categoryService");
const slaService = require("./slaService");
const notificationService = require("./notificationService");
const logger = require("../config/logger");

// ---------------------------------------------------------------------------
// Queue producers — called inline from request handlers, never awaited for
// their result, so a slow/unavailable Gemini call never blocks the response.
// ---------------------------------------------------------------------------
async function queueClassification(complaintId) {
  try {
    await aiQueue.add("classify-complaint", { complaintId });
  } catch (err) {
    // If BullMQ or Redis queue is unavailable, run classification asynchronously in-process
    setImmediate(() => performClassification(complaintId).catch(() => {}));
  }
}

async function queueSentimentAnalysis(commentId) {
  try {
    await aiQueue.add("analyze-sentiment", { commentId });
  } catch (err) {
    setImmediate(() => performSentimentAnalysis(commentId).catch(() => {}));
  }
}

// ---------------------------------------------------------------------------
// Worker-side handlers
// ---------------------------------------------------------------------------

/** Feature 1: classification and auto-assignment. */
async function performClassification(complaintId) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) return;

  const categories = await categoryService.list();
  const otherCat = categories.find((c) => c.name.toLowerCase() === "other");

  const result = await gemini.classifyComplaint({
    title: complaint.title,
    description: complaint.description,
    categories,
  });

  let changed = false;
  if (!complaint.categoryId) {
    complaint.categoryId = result?.categoryId || (otherCat ? otherCat.id : null);
    changed = true;
  }

  // Only auto-raise priority (never silently downgrade what the user chose)
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  if (result?.priority && rank[result.priority] > rank[complaint.priority]) {
    complaint.priority = result.priority;
    changed = true;
  }

  if (changed && complaint.categoryId) {
    const { slaDeadline } = await slaService.calculateSlaDeadline(complaint.categoryId, complaint.priority);
    complaint.slaDeadline = slaDeadline;
    await complaint.save();
  }

  // Auto-assign to staff if unassigned
  if (!complaint.staffId) {
    try {
      const assignmentService = require("./assignmentService");
      const bestStaff = await assignmentService.pickBestStaff(complaint);
      if (bestStaff) {
        await assignmentService.assignComplaint({
          complaint,
          staffId: bestStaff.id,
          assignedById: null,
          note: `AI auto-assigned based on category "${result?.categoryName || 'General'}" and workload.`,
        });
        complaint.status = "ASSIGNED";
        await complaint.save();

        const { emitToUser } = require("../sockets");
        emitToUser(bestStaff.id, "complaint:assigned", { complaintId: complaint.id });
        emitToUser(complaint.userId, "complaint:status_changed", {
          complaintId: complaint.id,
          fromStatus: "OPEN",
          toStatus: "ASSIGNED",
        });

        await notificationService.notify({
          userId: bestStaff.id,
          complaintId: complaint.id,
          title: "New complaint auto-assigned to you",
          message: `Complaint ${complaint.refNo} — "${complaint.title}" was auto-assigned to you.`,
          type: "ASSIGNMENT",
        });
      }
    } catch (assignErr) {
      logger.warn(`[aiService] Auto-assignment skipped: ${assignErr.message}`);
    }
  }

  // Chain into duplicate detection now that category is known
  try {
    await aiQueue.add("detect-duplicates", { complaintId });
  } catch {
    setImmediate(() => performDuplicateDetection(complaintId).catch(() => {}));
  }
}

/** Feature 2: duplicate detection against recent complaints in the same category. */
async function performDuplicateDetection(complaintId) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) return;

  const recent = await Complaint.findAll({
    where: {
      id: { [Op.ne]: complaint.id },
      categoryId: complaint.categoryId,
      status: { [Op.notIn]: ["CLOSED", "REJECTED"] },
      createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    limit: 20,
    order: [["createdAt", "DESC"]],
  });

  const result = await gemini.detectDuplicates(complaint, recent);
  if (!result.isDuplicate || !result.duplicateOfId) return;

  await ComplaintComment.create({
    complaintId: complaint.id,
    userId: complaint.userId,
    content: `AI note: this complaint looks like a possible duplicate of #${result.duplicateOfId} (similarity ${result.similarity ?? "n/a"}). ${result.reason || ""}`.trim(),
    isInternal: true,
  });

  const admins = await User.findAll({ where: { role: "admin", isActive: true }, attributes: ["id"] });
  await Promise.all(
    admins.map((admin) =>
      notificationService.notify({
        userId: admin.id,
        complaintId: complaint.id,
        title: "Possible duplicate complaint",
        message: `Complaint ${complaint.refNo} may duplicate an existing complaint.`,
        type: "AI_DUPLICATE",
      })
    )
  );
}

/** Feature 5: comment sentiment/urgency — internal triage signal only. */
async function performSentimentAnalysis(commentId) {
  const comment = await ComplaintComment.findByPk(commentId);
  if (!comment) return;

  const sentiment = await gemini.analyzeSentiment(comment.content);
  if (!sentiment) return;

  comment.sentiment = sentiment;
  await comment.save();
}

// ---------------------------------------------------------------------------
// On-demand, synchronous features (staff explicitly requests these, so the
// request/response cycle is the right shape rather than a queue).
// ---------------------------------------------------------------------------

/** Feature 3: thread summarization. */
async function getSummary(complaintId) {
  const complaint = await Complaint.findByPk(complaintId, { include: [{ association: "comments" }] });
  if (!complaint) return null;
  if (!gemini.isEnabled()) return { summary: null, aiAvailable: false };
  const summary = await gemini.summarizeThread(complaint, complaint.comments || []);
  return { summary, aiAvailable: true };
}

/** Feature 4: suggested resolution steps. */
async function getSuggestedResolution(complaintId) {
  const complaint = await Complaint.findByPk(complaintId, { include: [{ model: Category }] });
  if (!complaint) return null;
  if (!gemini.isEnabled()) return { steps: [], aiAvailable: false };
  const result = await gemini.suggestResolution({
    title: complaint.title,
    description: complaint.description,
    categoryName: complaint.Category ? complaint.Category.name : null,
  });
  return { ...(result || { steps: [], estimatedEffort: null }), aiAvailable: true };
}

/** Feature 6: resolution quality check. */
async function getQualityCheck(complaintId, resolutionNote) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) return null;
  if (!gemini.isEnabled()) return { sufficient: true, aiAvailable: false };
  const result = await gemini.checkResolutionQuality({
    title: complaint.title,
    description: complaint.description,
    resolutionNote,
  });
  return { ...(result || { sufficient: true, qualityScore: null, feedback: null }), aiAvailable: true };
}

module.exports = {
  queueClassification,
  queueSentimentAnalysis,
  performClassification,
  performDuplicateDetection,
  performSentimentAnalysis,
  getSummary,
  getSuggestedResolution,
  getQualityCheck,
  performAIEscalationCheck,
};

/**
 * Feature 5: AI-driven escalation check.
 * Invoked by the escalation worker or a cron job.
 * Returns true if AI decided the complaint should be escalated.
 */
async function performAIEscalationCheck(complaintId) {
  const complaint = await Complaint.findByPk(complaintId, {
    include: [{ model: require("../models").Category, as: "Category", attributes: ["name"] }],
  });
  if (!complaint) return false;
  if (["CLOSED", "REJECTED", "RESOLVED", "ESCALATED"].includes(complaint.status)) return false;

  const ageDays = (Date.now() - new Date(complaint.createdAt).getTime()) / (1000 * 60 * 60 * 24);

  const result = await gemini.detectEscalation({
    title: complaint.title,
    description: complaint.description,
    priority: complaint.priority,
    status: complaint.status,
    ageDays: Math.round(ageDays * 10) / 10,
    categoryName: complaint.Category?.name || "Unknown",
  });

  if (!result.shouldEscalate) {
    logger.info(`[aiService] Complaint ${complaint.refNo} does not need escalation`);
    return false;
  }

  // Apply the escalation
  try {
    const { nextPriority } = require("./escalationService");
    const { sequelize, ComplaintStatusHistory, Escalation, User } = require("../models");
    const fromStatus = complaint.status;
    const fromPriority = complaint.priority;
    const toPriority = nextPriority(complaint.priority);

    await sequelize.transaction(async (t) => {
      complaint.status = "ESCALATED";
      complaint.priority = toPriority;
      await complaint.save({ transaction: t });

      await ComplaintStatusHistory.create(
        {
          complaintId: complaint.id,
          fromStatus,
          toStatus: "ESCALATED",
          changedById: null,
          reason: `AI auto-escalated: ${result.reason || "Urgency detected"}`,
        },
        { transaction: t }
      );

      await Escalation.create(
        {
          complaintId: complaint.id,
          reason: `AI escalation: ${result.reason}`,
          fromPriority,
          toPriority,
        },
        { transaction: t }
      );
    });

    const { emitToUser } = require("../sockets");
    emitToUser(complaint.userId, "complaint:escalated", { complaintId: complaint.id, toPriority });

    await notificationService.notify({
      userId: complaint.userId,
      complaintId: complaint.id,
      title: "Your complaint has been escalated",
      message: `Complaint ${complaint.refNo} was escalated by AI due to urgency: ${result.reason}`,
      type: "ESCALATION",
    });

    const admins = await User.findAll({ where: { role: "admin", isActive: true } });
    for (const admin of admins) {
      await notificationService.notify({
        userId: admin.id,
        complaintId: complaint.id,
        title: `AI Escalation: ${complaint.refNo}`,
        message: `Complaint "${complaint.title}" auto-escalated by AI. Reason: ${result.reason}`,
        type: "ESCALATION",
      });
    }

    logger.info(`[aiService] AI auto-escalated complaint ${complaint.refNo}: ${result.reason}`);
    return true;
  } catch (err) {
    logger.error(`[aiService] AI escalation failed for ${complaintId}: ${err.message}`);
    return false;
  }
}
