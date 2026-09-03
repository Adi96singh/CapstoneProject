const router = require("express").Router();
const controller = require("../controllers/authController");
const { authenticate } = require("../middlewares/auth");
const {
  validate,
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
} = require("../utils/validators");

router.post("/register", registerRules, validate, controller.register);
router.post("/login", loginRules, validate, controller.login);
router.post("/logout", authenticate, controller.logout);
router.post("/forgot-password", forgotPasswordRules, validate, controller.forgotPassword);
router.post("/reset-password", resetPasswordRules, validate, controller.resetPassword);
router.get("/me", authenticate, controller.me);

module.exports = router;
