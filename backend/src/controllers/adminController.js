const { Escalation, Complaint } = require("../models");
const departmentService = require("../services/departmentService");
const categoryService = require("../services/categoryService");
const slaRuleService = require("../services/slaRuleService");
const userService = require("../services/userService");
const analyticsService = require("../services/analyticsService");
const auditService = require("../services/auditService");
const { success } = require("../utils/response");
const { recordAudit } = require("../utils/audit");

// ---- Departments ----
async function listDepartments(req, res) {
  return success(res, 200, { departments: await departmentService.list() });
}
async function createDepartment(req, res) {
  const dept = await departmentService.create(req.body);
  await recordAudit({ user: req.user, action: "CREATE", entityType: "Department", entityId: dept.id, newValue: req.body, ip: req.ip });
  return success(res, 201, { department: dept });
}
async function updateDepartment(req, res) {
  const dept = await departmentService.update(req.params.id, req.body);
  await recordAudit({ user: req.user, action: "UPDATE", entityType: "Department", entityId: dept.id, newValue: req.body, ip: req.ip });
  return success(res, 200, { department: dept });
}
async function deleteDepartment(req, res) {
  await departmentService.remove(req.params.id);
  await recordAudit({ user: req.user, action: "DELETE", entityType: "Department", entityId: req.params.id, ip: req.ip });
  return success(res, 200, { message: "Department deleted" });
}

// ---- Categories ----
async function listCategories(req, res) {
  return success(res, 200, { categories: await categoryService.list() });
}
async function createCategory(req, res) {
  const category = await categoryService.create(req.body);
  await recordAudit({ user: req.user, action: "CREATE", entityType: "Category", entityId: category.id, newValue: req.body, ip: req.ip });
  return success(res, 201, { category });
}
async function updateCategory(req, res) {
  const category = await categoryService.update(req.params.id, req.body);
  await recordAudit({ user: req.user, action: "UPDATE", entityType: "Category", entityId: category.id, newValue: req.body, ip: req.ip });
  return success(res, 200, { category });
}
async function deleteCategory(req, res) {
  await categoryService.remove(req.params.id);
  await recordAudit({ user: req.user, action: "DELETE", entityType: "Category", entityId: req.params.id, ip: req.ip });
  return success(res, 200, { message: "Category deleted" });
}

// ---- SLA Rules ----
async function listSlaRules(req, res) {
  return success(res, 200, { slaRules: await slaRuleService.list() });
}
async function createSlaRule(req, res) {
  const rule = await slaRuleService.create(req.body);
  await recordAudit({ user: req.user, action: "CREATE", entityType: "SlaRule", entityId: rule.id, newValue: req.body, ip: req.ip });
  return success(res, 201, { slaRule: rule });
}
async function updateSlaRule(req, res) {
  const rule = await slaRuleService.update(req.params.id, req.body);
  await recordAudit({ user: req.user, action: "UPDATE", entityType: "SlaRule", entityId: rule.id, newValue: req.body, ip: req.ip });
  return success(res, 200, { slaRule: rule });
}
async function deleteSlaRule(req, res) {
  await slaRuleService.remove(req.params.id);
  await recordAudit({ user: req.user, action: "DELETE", entityType: "SlaRule", entityId: req.params.id, ip: req.ip });
  return success(res, 200, { message: "SLA rule deleted" });
}

// ---- Users / Staff ----
async function listUsers(req, res) {
  return success(res, 200, { users: await userService.list(req.query) });
}
async function updateUser(req, res) {
  const user = await userService.updateUser(req.params.id, req.body, req.user);
  await recordAudit({ user: req.user, action: "UPDATE", entityType: "User", entityId: user.id, newValue: req.body, ip: req.ip });
  await userService.invalidateWorkloadCache();
  return success(res, 200, { user });
}
async function staffWorkload(req, res) {
  return success(res, 200, { staff: await userService.staffWorkload() });
}

// ---- Analytics & Audit ----
async function analytics(req, res) {
  const data = await analyticsService.getAnalytics(req.query.period || "7d");
  return success(res, 200, data);
}
async function auditLogs(req, res) {
  const { logs, pagination } = await auditService.list(req.query);
  return success(res, 200, { logs }, pagination);
}

async function escalations(req, res) {
  const rows = await Escalation.findAll({
    include: [{ model: Complaint, attributes: ["id", "refNo", "title", "status", "priority", "userId", "staffId"] }],
    order: [["triggeredAt", "DESC"]],
    limit: 100,
  });
  return success(res, 200, { escalations: rows });
}

module.exports = {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listCategories, createCategory, updateCategory, deleteCategory,
  listSlaRules, createSlaRule, updateSlaRule, deleteSlaRule,
  listUsers, updateUser, staffWorkload,
  analytics, auditLogs, escalations,
};
