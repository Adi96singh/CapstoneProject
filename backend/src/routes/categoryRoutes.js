const router = require("express").Router();
const controller = require("../controllers/categoryController");
const { authenticate } = require("../middlewares/auth");

// Read-only, available to any authenticated user (used on the complaint
// creation form). Admin CRUD for categories lives under /admin/categories.
router.get("/", authenticate, controller.list);

module.exports = router;
