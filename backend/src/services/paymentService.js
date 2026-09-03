const { Complaint, Payment, User } = require("../models");
const { ApiError } = require("../utils/response");
const { isEnabled, cashfreePost, cashfreeGet } = require("../config/cashfree");
const logger = require("../config/logger");

const PREMIUM_AMOUNT = 199.0; // INR

/**
 * Creates a Cashfree order and returns the payment_session_id for frontend checkout.
 * Gracefully stubbed if CASHFREE_APP_ID / CASHFREE_SECRET_KEY are not configured.
 */
async function createCheckoutSession(user, complaintId) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) throw new ApiError(404, "Complaint not found");
  if (complaint.userId !== user.id && user.role !== "admin") {
    throw new ApiError(403, "Only the complaint author or an administrator can upgrade it");
  }
  if (complaint.isPremium) throw new ApiError(409, "Complaint is already marked premium");

  if (!isEnabled()) {
    throw new ApiError(
      503,
      "Payment gateway not configured. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env to enable premium upgrades."
    );
  }

  // Generate a unique order_id using refNo (Cashfree needs 3–50 chars, alphanumeric+_-.)
  const orderId = `SLV-${complaint.refNo.replace(/[^a-zA-Z0-9_\-.]/g, "")}-${Date.now()}`;

  const orderBody = {
    order_id: orderId,
    order_amount: PREMIUM_AMOUNT,
    order_currency: "INR",
    customer_details: {
      customer_id: user.id.replace(/-/g, "").substring(0, 30),
      customer_name: user.name || "SolveIt User",
      customer_email: user.email,
      customer_phone: user.phone || "9999999999", // phone is required by Cashfree
    },
    order_meta: {
      return_url: `${process.env.CLIENT_URL}/complaints/detail.html?id=${complaint.id}&payment={order_status}`,
      notify_url: `${process.env.API_URL || process.env.CLIENT_URL}/api/payments/webhook`,
    },
    order_note: `Priority upgrade for complaint ${complaint.refNo}`,
    order_tags: {
      complaintId: complaint.id,
      userId: user.id,
    },
  };

  const response = await cashfreePost("/orders", orderBody);
  if (!response || !response.payment_session_id) {
    logger.error(`[payment] Cashfree order creation failed for complaint ${complaint.refNo}`);
    throw new ApiError(502, "Failed to create payment order. Please try again later.");
  }

  // Record pending payment
  const existing = await Payment.findOne({ where: { complaintId: complaint.id, status: "PENDING" } });
  if (existing) {
    existing.cfOrderId = response.order_id;
    existing.cfSessionId = response.payment_session_id;
    await existing.save();
  } else {
    await Payment.create({
      complaintId: complaint.id,
      userId: user.id,
      cfOrderId: response.order_id,
      cfSessionId: response.payment_session_id,
      amount: PREMIUM_AMOUNT,
      status: "PENDING",
    });
  }

  logger.info(`[payment] Created Cashfree order ${response.order_id} for complaint ${complaint.refNo}`);

  return {
    paymentSessionId: response.payment_session_id,
    orderId: response.order_id,
    amount: PREMIUM_AMOUNT,
    currency: "INR",
    environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  };
}

/**
 * Called when Cashfree sends a webhook (order.paid / payment.success).
 * Also called on return URL redirect to double-check order status.
 */
async function handleWebhook(payload) {
  try {
    const orderId = payload?.data?.order?.order_id || payload?.order_id;
    if (!orderId) return;

    const payment = await Payment.findOne({ where: { cfOrderId: orderId } });
    if (!payment) {
      logger.warn(`[payment] Webhook received for unknown order ${orderId}`);
      return;
    }

    const eventType = payload?.type || "";
    const orderStatus = payload?.data?.order?.order_status || payload?.order_status || "";

    if (eventType === "PAYMENT_SUCCESS" || orderStatus === "PAID") {
      payment.status = "PAID";
      await payment.save();

      const complaint = await Complaint.findByPk(payment.complaintId);
      if (complaint && !complaint.isPremium) {
        complaint.isPremium = true;
        await complaint.save();
        logger.info(`[payment] Complaint ${complaint.refNo} upgraded to PREMIUM via Cashfree`);
      }
    } else if (eventType === "PAYMENT_FAILED" || orderStatus === "FAILED") {
      payment.status = "FAILED";
      await payment.save();
    }
  } catch (err) {
    logger.error(`[payment] Webhook handling error: ${err.message}`);
  }
}

/**
 * Verify a specific order's status by calling Cashfree directly.
 * Useful for post-redirect confirmation when webhook hasn't fired yet.
 */
async function verifyOrder(orderId) {
  const response = await cashfreeGet(`/orders/${orderId}`);
  if (!response) return null;

  const payment = await Payment.findOne({ where: { cfOrderId: orderId } });
  if (!payment) return null;

  const isPaid = response.order_status === "PAID";
  if (isPaid && payment.status !== "PAID") {
    payment.status = "PAID";
    await payment.save();

    const complaint = await Complaint.findByPk(payment.complaintId);
    if (complaint && !complaint.isPremium) {
      complaint.isPremium = true;
      await complaint.save();
    }
  }

  return { orderId, status: response.order_status, isPaid };
}

/**
 * Sandbox/Test convenience: allows completing a payment in dev/test mode.
 */
async function simulateSuccess(user, complaintId) {
  const complaint = await Complaint.findByPk(complaintId);
  if (!complaint) throw new ApiError(404, "Complaint not found");
  if (complaint.userId !== user.id && user.role !== "admin") {
    throw new ApiError(403, "Only the complaint author or an administrator can upgrade it");
  }

  complaint.isPremium = true;
  await complaint.save();

  await Payment.create({
    complaintId: complaint.id,
    userId: user.id,
    cfOrderId: `SIM-${Date.now()}`,
    cfSessionId: `sim_session_${Date.now()}`,
    amount: PREMIUM_AMOUNT,
    currency: "INR",
    status: "PAID",
    gateway: "CASHFREE",
  });

  return { isPaid: true, complaint };
}

module.exports = { createCheckoutSession, handleWebhook, verifyOrder, simulateSuccess, PREMIUM_AMOUNT };
