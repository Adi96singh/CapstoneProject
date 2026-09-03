const router = require("express").Router();
const controller = require("../controllers/complaintController");
const commentController = require("../controllers/complaintCommentController");
const imageController = require("../controllers/complaintImageController");
const aiController = require("../controllers/aiController");
const paymentController = require("../controllers/paymentController");
const upload = require("../middlewares/upload");
const { authenticate, authorize } = require("../middlewares/auth");
const {
  validate,
  createComplaintRules,
  updateComplaintRules,
  transitionStatusRules,
  assignStaffRules,
  commentRules,
} = require("../utils/validators");

router.use(authenticate);

router.post("/", createComplaintRules, validate, controller.create);
router.get("/", controller.list);
router.get("/:id", controller.getOne);
router.patch("/:id", updateComplaintRules, validate, controller.update);
router.patch("/:id/status", transitionStatusRules, validate, controller.transitionStatus);
router.post("/:id/assign", authorize("admin"), assignStaffRules, validate, controller.assignStaff);

// Comments
router.get("/:id/comments", commentController.list);
router.post("/:id/comments", commentRules, validate, commentController.create);

// Images
router.post("/:id/images", upload.single("image"), imageController.upload);
router.delete("/:id/images/:imageId", imageController.remove);

// AI (on-demand, staff/admin-facing but access-checked by complaint visibility)
router.get("/:id/ai/summary", aiController.summary);
router.get("/:id/ai/suggested-resolution", aiController.suggestion);
router.post("/:id/ai/quality-check", aiController.qualityCheck);

// Payment (premium upgrade)
router.post("/:id/checkout", paymentController.checkout);

module.exports = router;
