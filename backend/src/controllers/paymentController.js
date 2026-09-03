const paymentService = require("../services/paymentService");
const { success, failure } = require("../utils/response");
const logger = require("../config/logger");

/** POST /api/complaints/:id/checkout — Create Cashfree order and return payment_session_id */
async function checkout(req, res) {
  const result = await paymentService.createCheckoutSession(req.user, req.params.id);
  return success(res, 200, result);
}

/** POST /api/payments/webhook — Cashfree payment webhook receiver */
async function webhook(req, res) {
  try {
    await paymentService.handleWebhook(req.body);
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    logger.error(`[webhook] Error: ${err.message}`);
    return res.status(200).json({ status: "error" }); // Always 200 to Cashfree
  }
}

/** GET /api/payments/verify/:orderId — Post-redirect order status check */
async function verifyOrder(req, res) {
  const result = await paymentService.verifyOrder(req.params.orderId);
  if (!result) return failure(res, 404, "Order not found");
  return success(res, 200, result);
}

/** POST /api/payments/simulate/:complaintId — Instant sandbox upgrade for testing */
async function simulate(req, res) {
  const result = await paymentService.simulateSuccess(req.user, req.params.complaintId);
  return success(res, 200, result);
}

module.exports = { checkout, webhook, verifyOrder, simulate };
