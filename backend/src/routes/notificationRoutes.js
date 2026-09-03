const router = require("express").Router();
const controller = require("../controllers/notificationController");
const { authenticate } = require("../middlewares/auth");

router.use(authenticate);

router.get("/", controller.list);
router.patch("/read-all", controller.markAllRead);
router.patch("/:id/read", controller.markRead);

module.exports = router;
