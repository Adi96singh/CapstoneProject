const complaintService = require("../services/complaintService");
const { success } = require("../utils/response");

async function create(req, res) {
  const idempotencyKey = req.header("X-Idempotency-Key") || req.body.idempotencyKey || null;
  const complaint = await complaintService.createComplaint(req.user, {
    ...req.body,
    idempotencyKey,
  });
  return success(res, 201, { complaint });
}

async function list(req, res) {
  const { complaints, pagination } = await complaintService.listComplaints(req.user, req.query);
  return success(res, 200, { complaints }, pagination);
}

async function getOne(req, res) {
  const complaint = await complaintService.getComplaintById(req.user, req.params.id);
  return success(res, 200, { complaint });
}

async function update(req, res) {
  const complaint = await complaintService.updateComplaint(req.user, req.params.id, req.body);
  return success(res, 200, { complaint });
}

async function transitionStatus(req, res) {
  const { toStatus, reason, staffId } = req.body;
  const complaint = await complaintService.transitionStatus(
    req.user,
    req.params.id,
    toStatus,
    reason,
    staffId
  );
  return success(res, 200, { complaint });
}

async function assignStaff(req, res) {
  const { staffId, note } = req.body;
  const complaint = await complaintService.assignStaff(req.user, req.params.id, { staffId, note });
  return success(res, 200, { complaint });
}

module.exports = { create, list, getOne, update, transitionStatus, assignStaff };
