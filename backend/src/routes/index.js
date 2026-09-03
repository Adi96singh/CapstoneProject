const router = require("express").Router();

router.use("/auth", require("./authRoutes"));
router.use("/complaints", require("./complaintRoutes"));
router.use("/admin", require("./adminRoutes"));
router.use("/categories", require("./categoryRoutes"));
router.use("/notifications", require("./notificationRoutes"));
router.use("/payments", require("./paymentRoutes"));

router.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

module.exports = router;
