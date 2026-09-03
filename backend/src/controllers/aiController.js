const aiService = require("../services/aiService");
const complaintService = require("../services/complaintService");
const { success } = require("../utils/response");

async function summary(req, res) {
  await complaintService.getComplaintById(req.user, req.params.id); // enforces access
  const result = await aiService.getSummary(req.params.id);
  return success(res, 200, result || { summary: null, aiAvailable: false });
}

async function suggestion(req, res) {
  await complaintService.getComplaintById(req.user, req.params.id);
  const result = await aiService.getSuggestedResolution(req.params.id);
  return success(res, 200, result || { steps: [], aiAvailable: false });
}

async function qualityCheck(req, res) {
  await complaintService.getComplaintById(req.user, req.params.id);
  const result = await aiService.getQualityCheck(req.params.id, req.body.resolutionNote);
  return success(res, 200, result || { sufficient: true, aiAvailable: false });
}

module.exports = { summary, suggestion, qualityCheck };
