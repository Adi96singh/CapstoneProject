const { body, validationResult } = require("express-validator");
const { ApiError } = require("./response");

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(
      400,
      "Validation failed",
      errors.array().map((e) => ({ field: e.path, message: e.msg }))
    );
  }
  next();
}

const registerRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 120 }),
  body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("role").optional().isIn(["user", "staff"]),
];

const loginRules = [
  body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPasswordRules = [
  body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
];

const resetPasswordRules = [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "REOPENED",
  "CLOSED",
  "ESCALATED",
  "REJECTED",
];

const createComplaintRules = [
  body("title").trim().notEmpty().withMessage("Title is required").isLength({ max: 200 }),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ max: 5000 }),
  body("categoryId").optional({ nullable: true }).isUUID(),
  body("priority").optional().isIn(PRIORITIES),
  body("locationText").optional({ nullable: true }).isLength({ max: 255 }),
];

const updateComplaintRules = [
  body("title").optional().trim().isLength({ min: 1, max: 200 }),
  body("description").optional().trim().isLength({ min: 1, max: 5000 }),
  body("categoryId").optional({ nullable: true }).isUUID(),
  body("priority").optional().isIn(PRIORITIES),
  body("locationText").optional({ nullable: true }).isLength({ max: 255 }),
];

const transitionStatusRules = [
  body("toStatus").isIn(STATUSES).withMessage("toStatus must be a valid complaint status"),
  body("reason").optional().isLength({ max: 500 }),
  body("staffId")
    .optional({ nullable: true })
    .isUUID()
    .withMessage("staffId must be a valid UUID (admin use only, to override auto-assignment)"),
];

const departmentRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 100 }),
  body("description").optional({ nullable: true }).isLength({ max: 2000 }),
  body("headUserId").optional({ nullable: true }).isUUID(),
];

const categoryRules = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 100 }),
  body("description").optional({ nullable: true }).isLength({ max: 2000 }),
  body("departmentId").optional({ nullable: true }).isUUID(),
  body("slaRuleId").optional({ nullable: true }).isUUID(),
];

const slaRuleRules = [
  body("priority").isIn(PRIORITIES).withMessage("priority must be a valid priority"),
  body("categoryId").optional({ nullable: true }).isUUID(),
  body("responseHours").isInt({ min: 1 }).withMessage("responseHours must be a positive integer"),
  body("resolutionHours").isInt({ min: 1 }).withMessage("resolutionHours must be a positive integer"),
];

const updateUserRules = [
  body("name").optional().trim().isLength({ min: 1, max: 120 }),
  body("role").optional().isIn(["user", "staff", "admin"]),
  body("departmentId")
    .optional({ nullable: true, checkFalsy: true })
    .isUUID()
    .withMessage("departmentId must be a valid UUID or empty"),
  body("isActive").optional().isBoolean(),
];

const commentRules = [
  body("content").trim().notEmpty().withMessage("Comment content is required").isLength({ max: 3000 }),
  body("isInternal").optional().isBoolean(),
];

const assignStaffRules = [
  body("staffId").isUUID().withMessage("Valid staffId is required"),
  body("note").optional().isLength({ max: 500 }),
];

module.exports = {
  validate,
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  createComplaintRules,
  updateComplaintRules,
  transitionStatusRules,
  assignStaffRules,
  departmentRules,
  categoryRules,
  slaRuleRules,
  updateUserRules,
  commentRules,
};
