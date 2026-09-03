const router = require("express").Router();
const controller = require("../controllers/adminController");
const { authenticate, authorize } = require("../middlewares/auth");
const {
  validate,
  departmentRules,
  categoryRules,
  slaRuleRules,
  updateUserRules,
} = require("../utils/validators");

router.use(authenticate, authorize("admin"));

router.get("/departments", controller.listDepartments);
router.post("/departments", departmentRules, validate, controller.createDepartment);
router.patch("/departments/:id", controller.updateDepartment);
router.delete("/departments/:id", controller.deleteDepartment);

router.get("/categories", controller.listCategories);
router.post("/categories", categoryRules, validate, controller.createCategory);
router.patch("/categories/:id", controller.updateCategory);
router.delete("/categories/:id", controller.deleteCategory);

router.get("/sla-rules", controller.listSlaRules);
router.post("/sla-rules", slaRuleRules, validate, controller.createSlaRule);
router.patch("/sla-rules/:id", controller.updateSlaRule);
router.delete("/sla-rules/:id", controller.deleteSlaRule);

router.get("/users", controller.listUsers);
router.patch("/users/:id", updateUserRules, validate, controller.updateUser);
router.get("/staff-workload", controller.staffWorkload);

router.get("/analytics", controller.analytics);
router.get("/audit-logs", controller.auditLogs);
router.get("/escalations", controller.escalations);

module.exports = router;
