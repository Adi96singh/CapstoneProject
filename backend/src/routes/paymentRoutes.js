const router = require("express").Router();
const controller = require("../controllers/paymentController");
const { authenticate } = require("../middlewares/auth");

// Webhook — unauthenticated (Cashfree calls it from their servers)
router.post("/webhook", controller.webhook);

// Verify payment status post-redirect (authenticated user)
router.get("/verify/:orderId", authenticate, controller.verifyOrder);

// Simulate sandbox payment success (dev/test)
router.post("/simulate/:complaintId", authenticate, controller.simulate);

module.exports = router;
